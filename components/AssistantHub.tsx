'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getBackendAiStatus } from '@/lib/assistant/backend-action-interpreter';
import { createConversationClient, type ConversationClient, type DataProviderName } from '@/lib/assistant/conversation-client';
import type { ActivityItem, AssistantAction, AssistantState } from '@/lib/assistant/types';
import { buildWhatsAppHandoffUrl } from '@/lib/assistant/whatsapp-handoff';
import type { ResolvedWeeklyNotice } from '@/lib/notices/weekly';
import { sendAgentTurn, verifiedScheduleHandoff, type AgentClientResult } from '@/lib/agent/client';
import { selectPortugueseVoice, speechTextForReply } from '@/lib/assistant/speech';
import GyroCore from './GyroCore';
import styles from './AssistantHub.module.css';

type RecognitionEvent = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; onresult: ((event: RecognitionEvent) => void) | null; onerror: ((event: { error: string }) => void) | null };
type RecognitionConstructor = new () => Recognition;

const labels: Record<AssistantState, string> = {
  idle: 'Pronta para ouvir',
  listening: 'Estou ouvindo…',
  processing: 'Entendendo seu pedido…',
  action: 'Organizando para você…',
  success: 'Feito',
  confirmation: 'Confirma esta ação?',
  error: 'Não entendi ainda',
};

const quickCommands = [
  'Aviso de Design',
  'Aviso de Informática',
  'Aviso de Kids',
];

function wait(time: number) { return new Promise((resolve) => window.setTimeout(resolve, time)); }

function quickReply(command: string): string | null {
  const normalized = command.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/^(quem e voce|quem e vc|o que voce faz|o que vc faz)\??$/.test(normalized)) {
    return 'Sou sua assistente pessoal. Posso organizar sua agenda, criar lembretes, consultar suas turmas e preparar mensagens para o WhatsApp.';
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite)[!. ]*$/.test(normalized)) {
    return 'Olá! Estou pronta para ajudar. O que você precisa?';
  }
  return null;
}

export default function AssistantHub({ dataProvider = 'local', userEmail = null, agentPilot = false }: { dataProvider?: DataProviderName; userEmail?: string | null; agentPilot?: boolean }) {
  const [state, setState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('Toque no núcleo e diga o que precisa.');
  const [pending, setPending] = useState<AssistantAction | null>(null);
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerNotice, setProviderNotice] = useState(agentPilot ? 'Núcleo agentic em piloto.' : 'Verificando IA…');
  const [appDeepLink, setAppDeepLink] = useState<string | null>(null);
  const [weeklyNotice, setWeeklyNotice] = useState<ResolvedWeeklyNotice | null>(null);
  const [agentApprovalId, setAgentApprovalId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const scheduleWatch = useRef(0);
  const engine = useRef<ConversationClient | null>(null);

  useEffect(() => {
    const assistant = createConversationClient(dataProvider);
    engine.current = assistant;
    void assistant.activities().then(setRecent).catch(() => setReply('Não consegui carregar suas ações recentes.'));
    if (!agentPilot) void getBackendAiStatus().then((status) => setProviderNotice(status.notice)).catch(() => setProviderNotice('Modo indisponível.'));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [agentPilot, dataProvider]);

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.3;
    utterance.pitch = 1;
    const voice = selectPortugueseVoice(synthesis.getVoices());
    if (voice) utterance.voice = voice;
    synthesis.speak(utterance);
  }

  function finish(text: string) {
    setReply(text);
    setState('success');
    speak(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 3800);
  }

  async function processCommand(command: string, source: 'voice' | 'text') {
    const clean = command.trim();
    if (!clean) return;
    scheduleWatch.current += 1;
    setAppDeepLink(null);
    setAgentApprovalId(null);
    setWeeklyNotice(null);
    setTranscript(clean);
    setState('processing');
    setReply('');
    await wait(320);

    if (agentPilot) {
      const directReply = quickReply(clean);
      if (directReply) {
        setState('idle');
        setReply(directReply);
        speak(directReply);
        return;
      }
      try { await handleAgentResult(await sendAgentTurn({ text: clean, source })); }
      catch (error) {
        setState('error');
        setReply(error instanceof Error ? error.message : 'Não consegui consultar o agente.');
      }
      return;
    }

    const assistant = engine.current ?? createConversationClient(dataProvider);
    engine.current = assistant;
    let result;
    try { result = await assistant.process(clean, source); }
    catch (error) {
      setState('error');
      setReply(error instanceof Error ? error.message : 'Não consegui acessar sua memória.');
      return;
    }
    if (result.providerNotice) setProviderNotice(result.providerNotice);
    setRecent(result.activities);
    setPending(result.action ?? null);
    setWeeklyNotice(result.weeklyNotice ?? null);

    if (result.kind === 'confirmation') {
      setState('confirmation');
      setReply(result.reply);
      speak(speechTextForReply(result.reply));
      return;
    }
    if (result.kind === 'error') {
      setState('error');
      setReply(result.reply);
      return;
    }
    if (result.kind === 'question') {
      setState('idle');
      setReply(result.reply);
      speak(result.reply);
      return;
    }

    setState('action');
    await wait(180);
    finish(result.reply);
  }

  function startVoice() {
    const supportedWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = supportedWindow.SpeechRecognition || supportedWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setState('error');
      setReply('O reconhecimento por voz não está disponível neste navegador. Você pode digitar o comando abaixo.');
      return;
    }
    const recognition = new Constructor();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      void processCommand(text, 'voice');
    };
    recognition.onerror = () => {
      setState('error');
      setReply('Não consegui acessar o microfone. Verifique a permissão e tente novamente.');
    };
    setState('listening');
    setReply('Pode falar.');
    try { recognition.start(); } catch { setState('error'); setReply('O microfone já está em uso. Tente de novo em instantes.'); }
  }

  async function confirm() {
    if (agentApprovalId) {
      setState('action');
      try {
        const approvalId = agentApprovalId;
        setAgentApprovalId(null);
        await handleAgentResult(await sendAgentTurn({ approvalId, decision: 'approve' }));
      } catch (error) {
        setState('error');
        setReply(error instanceof Error ? error.message : 'Não consegui confirmar a ação.');
      }
      return;
    }
    if (!pending || !engine.current) return;
    setState('action');
    await wait(180);
    let result;
    try { result = await engine.current.confirm(pending, 'text'); }
    catch (error) { setState('error'); setReply(error instanceof Error ? error.message : 'Não consegui confirmar a ação.'); return; }
    setRecent(result.activities);
    setPending(null);
    if (result.kind === 'error') {
      setState('error');
      setReply(result.reply);
      return;
    }
    if (result.scheduleHandoff) {
      try {
        const response = await fetch('/api/schedule/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(result.scheduleHandoff),
        });
        const payload = await response.json() as { id?: string; deepLink?: string; androidIntent?: string; error?: string };
        if (!response.ok || !payload.deepLink) throw new Error(payload.error || 'Não consegui preparar o aplicativo.');
        const launchUrl = payload.androidIntent || payload.deepLink;
        setAppDeepLink(launchUrl);
        setState('action');
        setReply('Abrindo o aplicativo. O agendamento só estará concluído quando o celular confirmar.');
        if (payload.id) void watchScheduleStatus(payload.id, ++scheduleWatch.current);
        window.setTimeout(() => window.location.assign(launchUrl), 120);
      } catch (error) {
        setState('error');
        setReply(error instanceof Error ? error.message : 'Não consegui abrir o aplicativo de agendamento.');
      }
      return;
    }
    finish(result.reply);
    if (result.whatsappHandoff) {
      const url = buildWhatsAppHandoffUrl(result.whatsappHandoff);
      window.setTimeout(() => window.location.assign(url), 350);
    }
  }

  async function handleAgentResult(result: AgentClientResult) {
    if (result.kind === 'approval_required' && result.approvalId) {
      setAgentApprovalId(result.approvalId);
      setState('confirmation');
      setReply(result.reply);
      speak(speechTextForReply(result.reply));
      return;
    }
    if (result.kind === 'cancelled') {
      setState('idle');
      setReply(result.reply);
      return;
    }

    const handoff = verifiedScheduleHandoff(result);
    if (handoff && typeof handoff.handoffId === 'string') {
      const launchUrl = typeof handoff.androidIntent === 'string'
        ? handoff.androidIntent
        : typeof handoff.deepLink === 'string' ? handoff.deepLink : null;
      if (launchUrl) {
        setAppDeepLink(launchUrl);
        setState('action');
        setReply('Abrindo o aplicativo. O agendamento só estará concluído quando o celular confirmar.');
        void watchScheduleStatus(handoff.handoffId, ++scheduleWatch.current);
        window.setTimeout(() => window.location.assign(launchUrl), 120);
        return;
      }
    }
    if (result.kind === 'failed') {
      setState('error');
      setReply(result.reply);
      return;
    }
    finish(result.reply);
  }

  async function watchScheduleStatus(id: string, watchId: number) {
    for (let attempt = 0; attempt < 90 && scheduleWatch.current === watchId; attempt += 1) {
      await wait(2_000);
      try {
        const response = await fetch(`/api/schedule/status?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!response.ok) continue;
        const status = await response.json() as { status?: string; errorCode?: string | null };
        if (status.status === 'scheduled_on_device') {
          setAppDeepLink(null);
          setRecent((items) => items.map((item) => item.intent === 'schedule_whatsapp_message'
            ? { ...item, status: 'agendado no celular' }
            : item));
          finish('Agendamento confirmado no celular. No horário, toque na notificação para abrir o WhatsApp.');
          return;
        }
        if (status.status === 'failed') {
          setState('error');
          setReply(scheduleFailureMessage(status.errorCode));
        }
      } catch {
        // A rede ou a troca para o aplicativo pode pausar a página; tentamos de novo.
      }
    }
  }

  async function cancelConfirmation() {
    if (agentApprovalId) {
      const approvalId = agentApprovalId;
      setAgentApprovalId(null);
      try { await handleAgentResult(await sendAgentTurn({ approvalId, decision: 'cancel' })); }
      catch (error) { setState('error'); setReply(error instanceof Error ? error.message : 'Não consegui cancelar.'); }
      return;
    }
    const result = await engine.current?.cancelConfirmation();
    setPending(null);
    setState('idle');
    setReply(result?.reply ?? 'Tudo bem, não vou enviar nada.');
    if (result) setRecent(result.activities);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input;
    setInput('');
    void processCommand(command, 'text');
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <button className={styles.menuButton} type="button" aria-label="Abrir menu" onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button>
      <div className={styles.brand}>minha<br /><strong>agenda</strong><i>.</i></div>
      {dataProvider === 'supabase'
        ? <form className={styles.profileForm} action="/auth/logout" method="post"><button className={styles.profile} type="submit" aria-label="Sair" title={userEmail || 'Sair'}>{initials(userEmail)}</button></form>
        : <button className={styles.profile} type="button" aria-label="Perfil">MA</button>}
    </header>

    <aside className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ''}`} aria-label="Navegação">
      <span>central</span><Link href="/hoje">Hoje</Link><Link href="/agenda">Agenda</Link><Link href="/financas">Finanças</Link><Link href="/turmas">Turmas</Link><Link href="/ajustes">Ajustes</Link>
    </aside>

    <section className={styles.hero}>
      <p className={styles.eyebrow}>assistente pessoal <span className={styles.providerNotice}>• {providerNotice} • {dataProvider === 'supabase' ? 'Supabase ativo.' : 'Dados locais.'}</span></p>
      <h1>O que vamos<br />resolver <em>agora?</em></h1>
      <div className={`${styles.coreArea} ${styles[`state${state[0].toUpperCase()}${state.slice(1)}`]}`}>
        <GyroCore state={state} onPress={startVoice} />
        <span className={styles.corePulse} aria-hidden="true" />
        <button className={styles.microphone} type="button" onClick={startVoice} aria-label="Falar com a assistente"><MicIcon /></button>
      </div>
      <p className={styles.stateLabel}>{labels[state]}</p>
      {transcript && <p className={styles.transcript}>“{transcript}”</p>}
      <p className={styles.reply} role="status">{reply}</p>

      {weeklyNotice && <section className={`${styles.confirmation} ${styles.noticePicker}`} aria-label={`Modelos de ${weeklyNotice.className}`}>
        <p><b>{weeklyNotice.className}</b> · destino: {weeklyNotice.recipientName}</p>
        <div className={styles.noticeModels}>
          {weeklyNotice.models.map((model) => <button key={model.key} type="button" disabled={!model.body} onClick={() => void processCommand(`Carregue a mensagem de ${weeklyNotice.className} ${model.number}`, 'text')}>
            <strong>Modelo {model.number} — {model.label}</strong>
            <small>{model.body || 'Este modelo ainda está vazio.'}</small>
          </button>)}
        </div>
      </section>}

      {state === 'confirmation' && pending && <div className={styles.confirmation}>
        <p><b>Para:</b> {String(pending.data.recipientName ?? 'contato')}</p><p>{String(pending.data.body ?? '')}</p>
        {pending.intent === 'schedule_whatsapp_message' && <p><b>Quando:</b> {formatScheduledAt(pending.data.dueAt)}</p>}
        <div><button type="button" className={styles.secondary} onClick={() => void cancelConfirmation()}>Cancelar</button><button type="button" className={styles.primary} onClick={() => void confirm()}>{pending.intent === 'schedule_whatsapp_message' ? 'Agendar no celular' : 'Abrir WhatsApp'}</button></div>
      </div>}

      {state === 'confirmation' && agentApprovalId && <div className={styles.confirmation}>
        <div><button type="button" className={styles.secondary} onClick={() => void cancelConfirmation()}>Cancelar</button><button type="button" className={styles.primary} onClick={() => void confirm()}>Confirmar</button></div>
      </div>}

      {appDeepLink && <div className={styles.confirmation}>
        <p>Se o aplicativo não abriu sozinho, toque abaixo. O site continuará aguardando a confirmação real do celular.</p>
        <div><a className={styles.primary} href={appDeepLink}>Abrir aplicativo</a></div>
      </div>}

      <form className={styles.commandForm} onSubmit={submit}>
        <label htmlFor="command">Escreva o que você precisa</label>
        <div><input id="command" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ex.: me lembre de..." /><button type="submit" aria-label="Processar comando"><ArrowIcon /></button></div>
      </form>
    </section>

    <aside className={styles.activity}>
      <div className={styles.activityHead}><p>em movimento</p><button type="button">ver tudo</button></div>
      {recent.length === 0 ? <p className={styles.empty}>Suas ações concluídas aparecem aqui.</p> : <ul>{recent.map((item) => <li key={item.id}><span className={styles.intentIcon}>{iconFor(item.intent)}</span><div><strong>{item.title}</strong><small>{item.status}</small></div></li>)}</ul>}
    </aside>

    <div className={styles.quick}><span>experimente</span>{quickCommands.map((command) => <button key={command} type="button" onClick={() => void processCommand(command, 'text')}>{command}</button>)}</div>
  </main>;
}

function iconFor(intent: string) { return ({ create_expense: 'R$', create_reminder: '◷', create_note: '✦', create_task: '✓', create_event: '□', prepare_whatsapp_message: '↗', send_whatsapp_message: '↗', schedule_whatsapp_message: '◷', undo_last_action: '↶' } as Record<string, string>)[intent] || '•'; }
function formatScheduledAt(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return 'horário a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function scheduleFailureMessage(errorCode: string | null | undefined) {
  if (errorCode === 'permission_denied') return 'O celular não autorizou notificações. Abra o aplicativo, permita os avisos e tente novamente.';
  if (errorCode === 'invalid_time') return 'O horário passou antes de o celular concluir. Escolha um novo horário.';
  return 'O celular não conseguiu agendar. Abra o aplicativo e tente novamente.';
}
function initials(email: string | null) { const value = email?.split('@')[0] || 'MA'; return value.slice(0, 2).toLocaleUpperCase('pt-BR'); }
function MicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 12a7 7 0 0 0 14 0M12 19v3M8 22h8" /></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>; }
