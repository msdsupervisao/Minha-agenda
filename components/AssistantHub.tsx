'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { getBackendAiStatus } from '@/lib/assistant/backend-action-interpreter';
import { createConversationClient, type ConversationClient, type DataProviderName } from '@/lib/assistant/conversation-client';
import type { ActivityItem, AssistantAction, AssistantState } from '@/lib/assistant/types';
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
  'Gastei 30 reais agora em combustível',
  'Me lembre de mandar mensagem para João amanhã às 9',
  'Anota que preciso conversar com o professor sobre a turma de Designer',
];

function wait(time: number) { return new Promise((resolve) => window.setTimeout(resolve, time)); }

export default function AssistantHub({ dataProvider = 'local', userEmail = null }: { dataProvider?: DataProviderName; userEmail?: string | null }) {
  const [state, setState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('Toque no núcleo e diga o que precisa.');
  const [pending, setPending] = useState<AssistantAction | null>(null);
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerNotice, setProviderNotice] = useState('Verificando IA…');
  const timer = useRef<number | null>(null);
  const engine = useRef<ConversationClient | null>(null);

  useEffect(() => {
    const assistant = createConversationClient(dataProvider);
    engine.current = assistant;
    void assistant.activities().then(setRecent).catch(() => setReply('Não consegui carregar suas ações recentes.'));
    void getBackendAiStatus().then((status) => setProviderNotice(status.notice)).catch(() => setProviderNotice('Modo indisponível.'));
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [dataProvider]);

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
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
    setTranscript(clean);
    setState('processing');
    setReply('');
    await wait(320);

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

    if (result.kind === 'confirmation') {
      setState('confirmation');
      setReply(result.reply);
      speak(result.reply);
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
    if (state === 'confirmation') return;
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
    finish(result.reply);
  }

  async function cancelConfirmation() {
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
      <span>central</span><button type="button">Hoje</button><button type="button">Agenda</button><button type="button">Finanças</button><button type="button">Turmas</button><button type="button">Ajustes</button>
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

      {state === 'confirmation' && pending && <div className={styles.confirmation}>
        <p><b>Para:</b> {String(pending.data.recipientName ?? 'contato')}</p><p>{String(pending.data.body ?? '')}</p>
        <div><button type="button" className={styles.secondary} onClick={() => void cancelConfirmation()}>Cancelar</button><button type="button" className={styles.primary} onClick={() => void confirm()}>Confirmar</button></div>
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

function iconFor(intent: string) { return ({ create_expense: 'R$', create_reminder: '◷', create_note: '✦', create_task: '✓', create_event: '□', prepare_whatsapp_message: '↗', send_whatsapp_message: '↗', undo_last_action: '↶' } as Record<string, string>)[intent] || '•'; }
function initials(email: string | null) { const value = email?.split('@')[0] || 'MA'; return value.slice(0, 2).toLocaleUpperCase('pt-BR'); }
function MicIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="13" rx="4" /><path d="M5 12a7 7 0 0 0 14 0M12 19v3M8 22h8" /></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>; }
