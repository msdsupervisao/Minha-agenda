'use client';

import { AnimatePresence, motion, Reorder } from 'motion/react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './AgendaDesk.module.css';

type Lane = 'agora' | 'depois' | 'soltar';
type Item = { id: string; title: string; lane: Lane; done: boolean };

const seed: Item[] = [
  { id: '1', title: 'Preparar a primeira hora sem distrações', lane: 'agora', done: false },
  { id: '2', title: 'Responder a mensagem que está esperando decisão', lane: 'agora', done: false },
  { id: '3', title: 'Separar um horário para revisar a semana', lane: 'depois', done: false },
  { id: '4', title: 'Ler ideias antigas e soltar o que já não importa', lane: 'soltar', done: false },
];

const lanes: { key: Lane; label: string; description: string }[] = [
  { key: 'agora', label: 'Agora', description: 'merece energia hoje' },
  { key: 'depois', label: 'Depois', description: 'não precisa ocupar a cabeça' },
  { key: 'soltar', label: 'Soltar', description: 'não carrega mais' },
];

const storageKey = 'minha-agenda-v2-itens';

export default function AgendaDesk() {
  const [items, setItems] = useState<Item[]>(seed);
  const [note, setNote] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only available after hydration. */
  useEffect(() => {
    const storedItems = window.localStorage.getItem(storageKey);
    const storedNote = window.localStorage.getItem(`${storageKey}-note`);
    if (storedItems) {
      try { setItems(JSON.parse(storedItems)); } catch { setItems(seed); }
    }
    if (storedNote) setNote(storedNote);
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => { if (ready) window.localStorage.setItem(storageKey, JSON.stringify(items)); }, [items, ready]);
  useEffect(() => { if (ready) window.localStorage.setItem(`${storageKey}-note`, note); }, [note, ready]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const openCount = useMemo(() => items.filter((item) => !item.done).length, [items]);
  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const move = (id: string, lane: Lane) => setItems((current) => current.map((item) => item.id === id ? { ...item, lane } : item));
  const reorderLane = (lane: Lane, next: Item[]) => setItems((current) => [...next, ...current.filter((item) => item.lane !== lane)]);

  function toggleDone(id: string) {
    const current = items.find((item) => item.id === id);
    setItems((all) => all.map((item) => item.id === id ? { ...item, done: !item.done } : item));
    setNotice(current?.done ? 'Item voltou para a sua atenção.' : 'Feito. Sem desaparecer da sua história.');
  }

  function addItem(title: string, lane: Lane) {
    setItems((current) => [{ id: crypto.randomUUID(), title, lane, done: false }, ...current]);
    setCaptureOpen(false);
    setNotice('Capturado e colocado no lugar certo.');
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.wordmark} href="/" aria-label="Minha Agenda, início">minha<br />agenda<span>.</span></Link>
        <div className={styles.today}>{today}</div>
        <div className={styles.topActions}><Link href="/lab" className={styles.labLink}>laboratório</Link><button className={styles.captureButton} onClick={() => setCaptureOpen(true)}>capturar <span>+</span></button></div>
      </header>

      <section className={styles.opening} aria-labelledby="opening-title">
        <div><p className={styles.kicker}>uma agenda que não grita</p><h1 id="opening-title">O que merece<br /><em>sua atenção</em> agora?</h1></div>
        <p className={styles.openingMeta}><strong>{openCount}</strong> intenções abertas.<br />Escolha poucas. Termine com calma.</p>
      </section>

      <section className={styles.board} aria-label="Organizador de intenções">
        {lanes.map((lane) => {
          const laneItems = items.filter((item) => item.lane === lane.key);
          return <section className={styles.lane} key={lane.key} aria-labelledby={`lane-${lane.key}`}>
            <header className={styles.laneHead}><h2 id={`lane-${lane.key}`}>{lane.label}</h2><p>{lane.description}</p></header>
            <Reorder.Group axis="y" values={laneItems} onReorder={(next) => reorderLane(lane.key, next)} className={styles.itemList}>
              <AnimatePresence initial={false}>{laneItems.map((item) => <AgendaItem key={item.id} item={item} onToggle={() => toggleDone(item.id)} onMove={move} />)}</AnimatePresence>
            </Reorder.Group>
            {laneItems.length === 0 && <p className={styles.empty}>Nada aqui. E isso pode ser ótimo.</p>}
          </section>;
        })}
      </section>

      <section className={styles.lower}>
        <div className={styles.principle}><span>01</span><p>Agenda não é uma prova de produtividade.<br />É um jeito de <em>decidir o que não vai te decidir.</em></p></div>
        <label className={styles.note}><span>despejo mental — fica só neste navegador por enquanto</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escreva sem transformar em tarefa." /></label>
      </section>

      <AnimatePresence>{captureOpen && <Capture onClose={() => setCaptureOpen(false)} onAdd={addItem} />}</AnimatePresence>
      <AnimatePresence>{notice && <motion.div className={styles.notice} role="status" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>{notice}</motion.div>}</AnimatePresence>
    </main>
  );
}

function AgendaItem({ item, onToggle, onMove }: { item: Item; onToggle: () => void; onMove: (id: string, lane: Lane) => void }) {
  const [open, setOpen] = useState(false);
  return <Reorder.Item value={item} className={`${styles.item} ${item.done ? styles.done : ''}`} layout>
    <motion.button className={styles.check} whileTap={{ scale: .82 }} onClick={onToggle} aria-label={item.done ? `Desfazer ${item.title}` : `Concluir ${item.title}`} aria-pressed={item.done}>{item.done && <svg viewBox="0 0 24 24" aria-hidden="true"><motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</motion.button>
    <span className={styles.itemTitle}>{item.title}</span>
    <button className={styles.itemMenuButton} onClick={() => setOpen((value) => !value)} aria-label={`Mover ${item.title}`} aria-expanded={open}>···</button>
    <AnimatePresence>{open && <motion.div className={styles.itemMenu} initial={{ opacity: 0, y: -4, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .97 }} transition={{ type: 'spring', stiffness: 480, damping: 30 }}>{lanes.filter((lane) => lane.key !== item.lane).map((lane) => <button key={lane.key} onClick={() => { onMove(item.id, lane.key); setOpen(false); }}>mover para {lane.label.toLowerCase()}</button>)}</motion.div>}</AnimatePresence>
  </Reorder.Item>;
}

function Capture({ onClose, onAdd }: { onClose: () => void; onAdd: (title: string, lane: Lane) => void }) {
  const [title, setTitle] = useState('');
  const [lane, setLane] = useState<Lane>('agora');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (title.trim()) onAdd(title.trim(), lane); }
  return <motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
    <motion.form className={styles.captureSheet} onSubmit={submit} initial={{ opacity: 0, y: -30, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 20, rotate: .8 }} transition={{ type: 'spring', stiffness: 390, damping: 28 }} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar captura">×</button><p>capturar antes que suma</p><h2>O que está ocupando espaço?</h2>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Escreva em uma frase" aria-label="Nova intenção" />
      <fieldset><legend>onde isso deve ficar?</legend>{lanes.map((item) => <label key={item.key}><input type="radio" name="lane" checked={lane === item.key} onChange={() => setLane(item.key)} />{item.label}</label>)}</fieldset>
      <button className={styles.save} type="submit">guardar intenção <span>↗</span></button>
    </motion.form>
  </motion.div>;
}
