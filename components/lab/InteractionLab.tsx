'use client';

import {
  AnimatePresence,
  motion,
  Reorder,
  useMotionValue,
  useSpring,
} from 'motion/react';
import { useEffect, useState } from 'react';
import styles from './InteractionLab.module.css';

type Toast = { id: number; message: string };

const spring = { type: 'spring', stiffness: 420, damping: 28, mass: 0.55 } as const;

export default function InteractionLab() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function notify(message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }

  return (
    <main className={styles.lab}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Fernando Control · Fase 01</p>
        <h1>Laboratório de comportamento.</h1>
        <p className={styles.lede}>
          Quinze hipóteses para testar como o produto deve responder — antes de decidirmos como ele deve parecer.
        </p>
        <p className={styles.hint}>Use mouse, toque, Tab, Enter, Espaço, Escape e Shift + F10.</p>
      </header>

      <div className={styles.stations}>
        <Station name="01 · Atração contida" description="Um botão se aproxima do cursor, mas volta ao lugar sem chamar atenção demais.">
          <MagneticButton onTrigger={() => notify('Ação percebida. Sem pressa.')} />
        </Station>

        <Station name="02 · Pressão e retorno" description="O clique comprime o objeto, confirma a ação e retorna ao repouso.">
          <PhysicalAction onDone={() => notify('Registro preparado.')} />
        </Station>

        <Station name="03 · Menu orbital" description="Opções saem da origem da ação, em vez de ocupar uma barra inteira.">
          <OrbitMenu onChoose={(label) => notify(`${label} selecionado.`)} />
        </Station>

        <Station name="04 · Matéria sensível" description="Uma superfície responde à proximidade, sem virar um card brilhante genérico.">
          <PointerSurface />
        </Station>

        <Station name="05 · Ordem com peso" description="Uma lista reorganiza com continuidade. Os botões mantêm a mesma ação no teclado.">
          <PriorityReorder />
        </Station>

        <Station name="06 · Decisão por arrasto" description="Arraste uma intenção entre agora, depois e soltar. O destino aparece antes de soltar.">
          <IntentSlider onDone={(label) => notify(`Intenção marcada: ${label}.`)} />
        </Station>

        <Station name="07 · Captura silenciosa" description="Um modal entra como uma folha que pousa e sai sem interromper o contexto.">
          <CaptureModal onSave={() => notify('Rascunho guardado no laboratório.')} />
        </Station>

        <Station name="08 · Confirmação reversível" description="A notificação confirma, explica e deixa uma saída clara — em vez de apenas sumir.">
          <button className={styles.textButton} onClick={() => notify('Compromisso movido para sexta-feira. Desfazer?')}>Criar aviso com desfazer</button>
        </Station>

        <Station name="09 · Chave de modo" description="Um toggle muda de posição com inércia curta e mantém o estado legível.">
          <TactileToggle />
        </Station>

        <Station name="10 · Campo que orienta" description="O campo antecipa a validação e usa mensagem, não só cor, para explicar o estado.">
          <IntentField />
        </Station>

        <Station name="11 · Menu contextual" description="Ações locais surgem perto do objeto: clique direito ou Shift + F10 para testar.">
          <ContextMenu onChoose={(label) => notify(`${label}: ação de demonstração.`)} />
        </Station>

        <Station name="12 · Estados que se deslocam" description="A seleção troca de lugar, preservando a sensação de que é o mesmo objeto.">
          <ModeTransition />
        </Station>

        <Station name="13 · Conclusão com rastro" description="Concluir não faz a tarefa desaparecer de imediato: ela muda de estado e permite desfazer.">
          <CompletionFeedback onDone={() => notify('Tarefa concluída.')} />
        </Station>

        <Station name="14 · Erro com resistência" description="Quando algo falha, a interface resiste brevemente e explica o próximo passo.">
          <ErrorResponse />
        </Station>

        <Station name="15 · Bússola de atenção" description="Experimento original: a intensidade da intenção é escolhida por direção, não por nota ou menu.">
          <AttentionCompass onChoose={(label) => notify(`Atenção calibrada em ${label}.`)} />
        </Station>
      </div>

      <AnimatePresence>
        {toasts.length > 0 && (
          <aside className={styles.toastStack} aria-live="polite" aria-label="Avisos">
            {toasts.map((toast, index) => (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 - index * 0.025 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={spring}
                className={styles.toast}
              >
                <span>{toast.message}</span>
                <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso">×</button>
              </motion.div>
            ))}
          </aside>
        )}
      </AnimatePresence>
    </main>
  );
}

function Station({ name, description, children }: { name: string; description: string; children: React.ReactNode }) {
  return (
    <section className={styles.station}>
      <div className={styles.stationHead}>
        <h2>{name}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.demo}>{children}</div>
    </section>
  );
}

function MagneticButton({ onTrigger }: { onTrigger: () => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 290, damping: 16 });
  const springY = useSpring(y, { stiffness: 290, damping: 16 });

  return (
    <motion.button
      className={styles.magneticButton}
      style={{ x: springX, y: springY }}
      whileTap={{ scale: 0.93 }}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left - box.width / 2) * 0.16);
        y.set((event.clientY - box.top - box.height / 2) * 0.22);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      onClick={onTrigger}
    >
      Aproximar
      <span aria-hidden="true">↗</span>
    </motion.button>
  );
}

function PhysicalAction({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const labels = { idle: 'Registrar impulso', working: 'Assentando…', done: 'Registrado' };

  function activate() {
    if (state !== 'idle') return;
    setState('working');
    window.setTimeout(() => { setState('done'); onDone(); }, 560);
    window.setTimeout(() => setState('idle'), 1900);
  }

  return (
    <motion.button
      className={`${styles.pressButton} ${state === 'done' ? styles.isDone : ''}`}
      whileHover={state === 'idle' ? { y: -2 } : undefined}
      whileTap={state === 'idle' ? { scale: 0.96, y: 2 } : undefined}
      transition={spring}
      onClick={activate}
      disabled={state === 'working'}
      aria-live="polite"
    >
      <motion.span animate={{ rotate: state === 'working' ? 180 : 0, scale: state === 'done' ? 1.2 : 1 }} transition={spring} aria-hidden="true">{state === 'done' ? '✓' : '●'}</motion.span>
      {labels[state]}
    </motion.button>
  );
}

function OrbitMenu({ onChoose }: { onChoose: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const items = ['Anotar', 'Pausar', 'Revisar'];
  const positions = [[0, -78], [72, -24], [-72, -24]];

  return (
    <div className={styles.orbitWrap}>
      <AnimatePresence>
        {open && items.map((item, index) => (
          <motion.button
            className={styles.orbitItem}
            key={item}
            initial={{ opacity: 0, scale: 0.45, x: 0, y: 0 }}
            animate={{ opacity: 1, scale: 1, x: positions[index][0], y: positions[index][1] }}
            exit={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
            transition={{ ...spring, delay: index * 0.035 }}
            onClick={() => { onChoose(item); setOpen(false); }}
          >{item}</motion.button>
        ))}
      </AnimatePresence>
      <motion.button className={styles.orbitCore} whileTap={{ scale: 0.88 }} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir menu de ação">
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={spring}>+</motion.span>
      </motion.button>
    </div>
  );
}

function PointerSurface() {
  const [point, setPoint] = useState({ x: 50, y: 50 });
  return (
    <div
      className={styles.pointerSurface}
      style={{ '--x': `${point.x}%`, '--y': `${point.y}%` } as React.CSSProperties}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setPoint({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
      }}
    >
      <span>aproxime-se</span>
      <strong>uma superfície também pode escutar.</strong>
    </div>
  );
}

function PriorityReorder() {
  const [items, setItems] = useState(['Retornar ligação', 'Organizar a manhã', 'Ler proposta']);
  function move(item: string, direction: -1 | 1) {
    const index = items.indexOf(item);
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    const next = [...items];
    [next[index], next[destination]] = [next[destination], next[index]];
    setItems(next);
  }
  return (
    <Reorder.Group axis="y" values={items} onReorder={setItems} className={styles.reorderList}>
      {items.map((item) => (
        <Reorder.Item value={item} key={item} className={styles.reorderItem}>
          <span aria-hidden="true" className={styles.grip}>⠿</span><span>{item}</span>
          <span className={styles.orderControls}>
            <button onClick={() => move(item, -1)} aria-label={`Mover ${item} para cima`}>↑</button>
            <button onClick={() => move(item, 1)} aria-label={`Mover ${item} para baixo`}>↓</button>
          </span>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

function IntentSlider({ onDone }: { onDone: (label: string) => void }) {
  const x = useMotionValue(0);
  const [choice, setChoice] = useState('agora');
  function settle(offset: number) {
    const next = offset < -65 ? 'soltar' : offset < 45 ? 'depois' : 'agora';
    setChoice(next);
    onDone(next);
  }
  return (
    <div className={styles.intentWrap}>
      <div className={styles.intentScale} aria-hidden="true"><span>soltar</span><span>depois</span><span>agora</span></div>
      <motion.button
        className={styles.intentKnob}
        drag="x"
        dragConstraints={{ left: -108, right: 108 }}
        dragElastic={0.12}
        style={{ x }}
        whileTap={{ cursor: 'grabbing' }}
        onDragEnd={(_, info) => settle(info.offset.x)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); setChoice('depois'); }
          if (event.key === 'ArrowRight') { event.preventDefault(); setChoice('agora'); }
          if (event.key === 'Home') { event.preventDefault(); setChoice('soltar'); }
        }}
        aria-label="Definir destino da intenção. Use as setas esquerda e direita."
      >↔</motion.button>
      <output className={styles.intentOutput}>{choice}</output>
    </div>
  );
}

function CaptureModal({ onSave }: { onSave: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  return (
    <>
      <button className={styles.textButton} onClick={() => setOpen(true)}>Abrir captura</button>
      <AnimatePresence>
        {open && (
          <motion.div className={styles.modalBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setOpen(false)}>
            <motion.div className={styles.captureSheet} role="dialog" aria-modal="true" aria-labelledby="capture-title" initial={{ opacity: 0, y: -32, rotate: -1.6 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 20, rotate: 0.8 }} transition={spring} onMouseDown={(event) => event.stopPropagation()}>
              <button className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Fechar captura">×</button>
              <p>captura rápida</p><h3 id="capture-title">O que não pode se perder?</h3>
              <textarea autoFocus placeholder="Escreva sem organizar." />
              <button className={styles.inkButton} onClick={() => { onSave(); setOpen(false); }}>Guardar rascunho</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TactileToggle() {
  const [on, setOn] = useState(false);
  return <button className={`${styles.tactileToggle} ${on ? styles.toggleOn : ''}`} onClick={() => setOn((value) => !value)} aria-pressed={on}><motion.span layout transition={spring} /> <b>{on ? 'proteger foco' : 'aceitar interrupções'}</b></button>;
}

function IntentField() {
  const [value, setValue] = useState('');
  const valid = value.trim().length >= 4;
  const hasText = value.length > 0;
  return (
    <label className={styles.intentField}>
      <span>Qual é a próxima coisa?</span>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="ex.: ligar para Ana" aria-describedby="intent-feedback" />
      <motion.small id="intent-feedback" animate={{ color: valid ? '#00A3E0' : hasText ? '#D4AF37' : 'rgba(0,0,0,.68)' }}>
        {valid ? 'Boa. Isso já é específico o bastante.' : hasText ? 'Dê um pouco mais de contexto (mínimo de 4 letras).' : 'Uma frase curta funciona melhor que um título genérico.'}
      </motion.small>
    </label>
  );
}

function ContextMenu({ onChoose }: { onChoose: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = ['Marcar para hoje', 'Transformar em nota', 'Arquivar'];
  return (
    <div className={styles.contextArea}>
      <button className={styles.contextTarget} onContextMenu={(event) => { event.preventDefault(); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); setOpen(true); } }} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Preparar reunião <span>⋯</span>
      </button>
      <AnimatePresence>
        {open && <motion.div className={styles.contextPanel} role="menu" initial={{ opacity: 0, y: -5, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.97 }} transition={spring}>
          {options.map((option) => <button key={option} role="menuitem" onClick={() => { onChoose(option); setOpen(false); }}>{option}</button>)}
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function ModeTransition() {
  const modes = ['agora', 'em espera', 'arquivo'];
  const [mode, setMode] = useState(modes[0]);
  return <div className={styles.modeRow} role="group" aria-label="Estado da intenção">{modes.map((item) => <button key={item} onClick={() => setMode(item)} className={mode === item ? styles.modeActive : ''}>{mode === item && <motion.span className={styles.modeIndicator} layoutId="mode-indicator" transition={spring} />}<span className={styles.modeLabel}>{item}</span></button>)}</div>;
}

function CompletionFeedback({ onDone }: { onDone: () => void }) {
  const [complete, setComplete] = useState(false);
  return <div className={`${styles.completion} ${complete ? styles.completed : ''}`}><motion.button whileTap={{ scale: 0.83 }} onClick={() => { setComplete((value) => !value); if (!complete) onDone(); }} aria-pressed={complete} aria-label={complete ? 'Desfazer conclusão' : 'Concluir tarefa'}><AnimatePresence mode="wait">{complete ? <motion.span key="check"><svg viewBox="0 0 24 24"><motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .28 }} d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></motion.span> : <motion.span key="circle" initial={{ scale: 0.7 }} animate={{ scale: 1 }} />}</AnimatePresence></motion.button><span>Enviar orçamento</span>{complete && <button className={styles.undoButton} onClick={() => setComplete(false)}>desfazer</button>}</div>;
}

function ErrorResponse() {
  const [attempt, setAttempt] = useState(0);
  const [invalid, setInvalid] = useState(false);
  return <div className={styles.errorBox}><motion.div key={attempt} animate={invalid ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}><label>Código de desbloqueio<input defaultValue="12" aria-invalid={invalid} /></label></motion.div><button className={styles.textButton} onClick={() => { setInvalid(true); setAttempt((value) => value + 1); }}>Testar código</button>{invalid && <p role="alert">Ainda não. O código precisa de 4 números.</p>}</div>;
}

function AttentionCompass({ onChoose }: { onChoose: (label: string) => void }) {
  const [active, setActive] = useState('centro');
  const directions = [{ label: 'proteger', x: 50, y: 14 }, { label: 'agir', x: 86, y: 50 }, { label: 'adiar', x: 50, y: 86 }, { label: 'delegar', x: 14, y: 50 }];
  function choose(label: string) { setActive(label); onChoose(label); }
  return <div className={styles.compass} role="group" aria-label="Bússola de atenção"><div className={styles.compassCross} />{directions.map((direction) => <motion.button key={direction.label} style={{ left: `${direction.x}%`, top: `${direction.y}%` }} animate={{ scale: active === direction.label ? 1.12 : 1 }} whileTap={{ scale: 0.9 }} onClick={() => choose(direction.label)} aria-pressed={active === direction.label}>{direction.label}</motion.button>)}<motion.button className={styles.compassCenter} whileTap={{ scale: 0.88 }} onClick={() => choose('centro')} aria-pressed={active === 'centro'}>·</motion.button><output>{active}</output></div>;
}
