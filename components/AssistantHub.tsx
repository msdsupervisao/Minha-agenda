'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { getBackendAiStatus } from '@/lib/assistant/backend-action-interpreter';
import { createConversationClient, type ConversationClient, type DataProviderName } from '@/lib/assistant/conversation-client';
import type { ActivityItem, AssistantAction, AssistantState } from '@/lib/assistant/types';
import { buildWhatsAppHandoffUrl } from '@/lib/assistant/whatsapp-handoff';
import type { ResolvedWeeklyNotice } from '@/lib/notices/weekly';
import { sendAgentTurn, verifiedScheduleHandoff, type AgentClientResult } from '@/lib/agent/client';
import type { AgentProgress } from '@/lib/agent/contracts';
import { selectPortugueseVoice, speechTextForReply, stripMarkdownForSpeech } from '@/lib/assistant/speech';
import { startVoiceSession, type Recognition } from '@/lib/assistant/voice-session';
import { createSpeechPlayer } from '@/lib/tts/client';
import GyroCore from './GyroCore';
import styles from './AssistantHub.module.css';

type RecognitionConstructor = new () => Recognition;

const labels: Record<AssistantState, string> = {
  idle: 'Pronta para ouvir',
  listening: 'Estou ouvindo…',
  processing: 'Entendendo seu pedido…',
  action: 'Organizando para você…',
  success: 'Feito',
  confirmation: 'Confirma esta ação?',
  error: 'Não foi possível concluir',
};

const quickCommands = [
  'Liste minhas turmas',
  'O que tenho na agenda hoje?',
  'Procure a turma Kids Tecnologia',
];

function wait(time: number) { return new Promise((resolve) => window.setTimeout(resolve, time)); }

export default function AssistantHub({ dataProvider = 'local', userEmail = null, agentPilot = false }: { dataProvider?: DataProviderName; userEmail?: string | null; agentPilot?: boolean }) {
  const [state, setState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('Toque no núcleo e diga o que precisa.');
  const [pending, setPending] = useState<AssistantAction | null>(null);
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerNotice, setProviderNotice] = useState(agentPilot ? 'Verificando conexão…' : 'Verificando IA…');
  const [lastRun, setLastRun] = useState<AgentClientResult | null>(null);
  const [appDeepLink, setAppDeepLink] = useState<string | null>(null);
  const [weeklyNotice, setWeeklyNotice] = useState<ResolvedWeeklyNotice | null>(null);
  const [agentApprovalId, setAgentApprovalId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const scheduleWatch = useRef(0);
  const engine = useRef<ConversationClient | null>(null);
  const voiceSession = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const speechPlayer = useRef<ReturnType<typeof createSpeechPlayer> | null>(null);
  useEffect(() => () => speechPlayer.current?.cancel(), []);
  const weatherLocation = useRef<{ latitude: number; longitude: number } | undefined>(undefined);
  const [locationNotice, setLocationNotice] = useState('');
  function enableWeatherLocation() {
    if (!navigator.geolocation) { setLocationNotice('Informe sua cidade na conversa.'); return; }
    setLocationNotice('Obtendo localização…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      weatherLocation.current = { latitude: Number(coords.latitude.toFixed(2)), longitude: Number(coords.longitude.toFixed(2)) };
      setLocationNotice('Localização disponível para consultas de clima nesta conversa.');
    }, () => setLocationNotice('Não consegui obter a localização. Informe cidade e estado na conversa.'), { timeout: 10000, maximumAge: 300000 });
  }
  useEffect(() => () => voiceSession.current?.cancel(), []);

  useEffect(() => {
    const assistant = createConversationClient(dataProvider);
    engine.current = assistant;
    void assistant.activities().then(setRecent).catch(() => setReply('Não consegui carregar suas ações recentes.'));
    const checkStatus = () => { void getBackendAiStatus().then((status) => setProviderNotice(status.notice)).catch(() => setProviderNotice('Conexão indisponível.')); };
    checkStatus();
    const healthTimer = window.setInterval(checkStatus, 30000);
    return () => { if (timer.current) window.clearTimeout(timer.current); window.clearInterval(healthTimer); };
  }, [agentPilot, dataProvider]);

  function speak(text: string) {
    speechPlayer.current ??= createSpeechPlayer(speakBrowser);
    void speechPlayer.current.speak(stripMarkdownForSpeech(text));
  }

  function speakBrowser(text: string) {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const spokenText = stripMarkdownForSpeech(text);
    if (!spokenText) return;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    utterance.pitch = 1;
    const voice = selectPortugueseVoice(synthesis.getVoices());
    if (voice) utterance.voice = voice;
    synthesis.speak(utterance);
  }

  function finish(text: string, message = false) {
    setReply(text);
    setState('success');
    speak(speechTextForReply(text, { message }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 3800);
  }

  async function processCommand(command: string, source: 'voice' | 'text') {
    const clean = command.trim();
    if (!clean || state === 'processing' || state === 'action' || agentApprovalId) return;
    speechPlayer.current?.cancel();
    voiceSession.current?.cancel();
    voiceSession.current = null;
    if (timer.current) window.clearTimeout(timer.current);
    setLastRun(null);
    scheduleWatch.current += 1;
    setAppDeepLink(null);
    setAgentApprovalId(null);
    setWeeklyNotice(null);
    setTranscript(clean);
    setState('processing');
    setReply('');
    await wait(320);

    if (agentPilot) {
      try { await handleAgentResult(await sendAgentTurn({ text: clean, source, weatherLocation: weatherLocation.current }, handleProgress)); }
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
      speak(speechTextForReply(result.reply, { approval: true }));
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
      speak(speechTextForReply(result.reply, { message: Boolean(result.weeklyNotice) }));
      return;
    }

    setState('action');
    await wait(180);
    finish(result.reply, Boolean(result.weeklyNotice || result.whatsappHandoff));
  }

  function startVoice() {
    if (state === 'processing' || state === 'action' || agentApprovalId) return;
    if (voiceSession.current) { voiceSession.current.stop(); return; }
    const supportedWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = supportedWindow.SpeechRecognition || supportedWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setState('error');
      setReply('O reconhecimento por voz não está disponível neste navegador. Você pode digitar o comando abaixo.');
      return;
    }
    const recognition = new Constructor();
    if (timer.current) window.clearTimeout(timer.current);
    speechPlayer.current?.cancel();
    window.speechSynthesis?.cancel();
    setState('listening');
    setTranscript('');
    setReply('Pode falar.');
    let ended = false;
    const session = startVoiceSession(recognition, {
      transcript: setTranscript,
      stopping: () => { setState('processing'); setReply('Concluindo a escuta…'); },
      complete: (text) => {
        ended = true;
        voiceSession.current = null;
        if (text) void processCommand(text, 'voice');
        else { setState('idle'); setReply('Não ouvi um pedido. Toque para tentar novamente.'); }
      },
      error: () => {
        ended = true;
        voiceSession.current = null;
        setState('error');
        setReply('Não consegui acessar o microfone. Verifique a permissão e tente novamente.');
      },
    });
    if (!ended) voiceSession.current = session;
  }

  async function confirm() {
    if (agentApprovalId) {
      setState('action');
      try {
        const approvalId = agentApprovalId;
        setAgentApprovalId(null);
        await handleAgentResult(await sendAgentTurn({ approvalId, decision: 'approve' }, handleProgress));
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
    finish(result.reply, Boolean(result.weeklyNotice || result.whatsappHandoff));
    if (result.whatsappHandoff) {
      const url = buildWhatsAppHandoffUrl(result.whatsappHandoff);
      window.setTimeout(() => window.location.assign(url), 350);
    }
  }

  async function handleAgentResult(result: AgentClientResult) {
    setLastRun(result);
    if (result.kind === 'approval_required' && result.approvalId) {
      setAgentApprovalId(result.approvalId);
      setState('confirmation');
      setReply(result.reply);
      speak(speechTextForReply(result.reply, { approval: true }));
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
    finish(result.reply, result.toolResults?.some((tool) => /notice|whatsapp/.test(tool.toolName)));
  }

  function handleProgress(event: AgentProgress) {
    setState(event.phase === 'thinking' ? 'processing' : 'action');
    setReply(event.phase === 'thinking' ? (event.step === 1 ? 'Analisando seu pedido e o contexto.' : 'Preparando a resposta com o resultado recebido.')
      : event.phase === 'verified' ? 'Resultado conferido na fonte.' : 'Consultando ou executando a ferramenta necessária.');
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
      <p className={styles.eyebrow}>seu assistente pessoal <span className={styles.providerNotice}>• {providerNotice} • {dataProvider === 'supabase' ? 'Memória conectada.' : 'Dados locais.'}</span></p>
      <h1>O que vamos<br />resolver <em>agora?</em></h1>
      <div className={`${styles.coreArea} ${styles[`state${state[0].toUpperCase()}${state.slice(1)}`]}`}>
        <GyroCore state={state} onPress={startVoice} />
        <span className={styles.corePulse} aria-hidden="true" />
        <button className={styles.microphone} type="button" onClick={startVoice} aria-label="Falar com a assistente"><MicIcon /></button>
      </div>
      <p className={styles.stateLabel}>{labels[state]}</p>
      <button type="button" className={styles.secondary} onClick={enableWeatherLocation}>Usar minha localização para clima</button>
      {locationNotice && <p role="status">{locationNotice}</p>}
      {transcript && <p className={styles.transcript}>“{transcript}”</p>}
      <p className={styles.reply} role="status">{reply}</p>
      {lastRun && <details className={styles.executionDetails}>
        <summary>Detalhes da execução</summary>
        {lastRun.executions?.map((execution, index) => <p key={index}>{execution.upstreamProvider || 'Provedor não informado'} · {execution.model || execution.requestedModel} · {(execution.latencyMs / 1000).toFixed(1)}s{execution.fallbackUsed ? ' · rota de reserva' : ''}</p>)}
        {lastRun.toolResults?.map((tool) => <p key={tool.callId}>{tool.toolName}: {tool.verified ? 'verificado' : tool.status === 'approval_required' ? 'aguardando confirmação' : 'não concluído'}</p>)}
        <small>Execução: {lastRun.runId || 'sem identificador'}</small>
      </details>}

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
        <div><input id="command" value={input} onChange={(event) => setInput(event.target.value)} disabled={state === 'processing' || state === 'action' || Boolean(agentApprovalId)} placeholder="Ex.: o que tenho para hoje?" /><button type="submit" disabled={state === 'processing' || state === 'action' || Boolean(agentApprovalId)} aria-label="Processar comando"><ArrowIcon /></button></div>
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
