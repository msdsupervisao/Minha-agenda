'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { AgendaGroup, AgendaItem, AgendaKind } from '@/lib/data/agenda';
import type { NotificationChannel } from '@/lib/assistant/types';
import { formatTime, toDatetimeLocal } from '@/lib/format';
import { deleteAgendaItem, restoreAgendaItem, setAgendaDone, updateAgendaItem } from '@/app/agenda/actions';
import { sendBridgeTurn } from '@/lib/agent/bridge-client';
import { verifiedReminderCreated } from '@/lib/agent/client';
import styles from './Screens.module.css';

const ICON: Record<AgendaKind, string> = { reminder: '◷', task: '✓', event: '▦' };
const KIND_LABEL: Record<AgendaKind, string> = { reminder: 'lembrete', task: 'tarefa', event: 'compromisso' };
const RECURRENCE_LABEL = { daily: 'todo dia', weekly: 'toda semana', monthly: 'todo mes' } as const;
const ALERT_OPTIONS = [{ value: 0, label: 'na hora' }, { value: 15, label: '15 min antes' }, { value: 60, label: '1 h antes' }, { value: 1440, label: '1 dia antes' }];

export default function AgendaView({ groups, loadError, tz, agentBridge = false, userId = '' }: { groups: AgendaGroup[]; loadError?: boolean; tz?: string; agentBridge?: boolean; userId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; at: string; endsAt: string; alerts: number[]; channels: NotificationChannel[] }>({ title: '', at: '', endsAt: '', alerts: [], channels: ['push'] });
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ kind: AgendaKind; id: string } | null>(null);

  // Quick-add inline
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickStatus, setQuickStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [quickMsg, setQuickMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function openQuickAdd() {
    setShowQuickAdd(true);
    setQuickStatus('idle');
    setQuickMsg('');
    setQuickText('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeQuickAdd() {
    setShowQuickAdd(false);
    setQuickStatus('idle');
    setQuickMsg('');
    setQuickText('');
  }

  async function submitQuickReminder(e: React.FormEvent) {
    e.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    setQuickStatus('saving');
    setQuickMsg('Criando...');
    try {
      if (agentBridge) {
        const result = await sendBridgeTurn({ text, source: 'text' }, userId);
        if (!verifiedReminderCreated(result)) {
          setQuickStatus('error');
          setQuickMsg(result.reply || 'Não consegui confirmar o lembrete. Abra o assistente para continuar.');
          return;
        }
        setQuickStatus('done');
        setQuickMsg(result.reply);
        setQuickText('');
        router.refresh();
        window.setTimeout(closeQuickAdd, 4000);
        return;
      }
      const res = await fetch('/api/agent/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, source: 'text' }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Erro ao criar lembrete');
      setQuickStatus('done');
      setQuickMsg(data.reply || 'Lembrete criado!');
      setQuickText('');
      router.refresh();
      window.setTimeout(closeQuickAdd, 4000);
    } catch (err) {
      setQuickStatus('error');
      setQuickMsg(err instanceof Error ? err.message : 'Nao foi possivel criar o lembrete.');
    }
  }

  function startEdit(item: AgendaItem) {
    setError(null);
    setEditingId(item.id);
    setForm({ title: item.title, at: item.at ? toDatetimeLocal(item.at, tz) : '', endsAt: item.endsAt ? toDatetimeLocal(item.endsAt, tz) : '', alerts: item.alerts, channels: item.channels });
  }

  function save(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await updateAgendaItem(item.kind, item.id, {
        title: form.title,
        at: form.at || null,
        endsAt: item.kind === 'event' ? (form.endsAt || null) : null,
        alerts: form.alerts,
        channels: form.channels,
      });
      if (!result.ok) { setError(result.error || 'Nao foi possivel salvar.'); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggleDone(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await setAgendaDone(item.kind, item.id, !item.done);
      if (!result.ok) { setError(result.error || 'Nao foi possivel atualizar.'); return; }
      router.refresh();
    });
  }

  function remove(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await deleteAgendaItem(item.kind, item.id);
      if (!result.ok) { setError(result.error || 'Nao foi possivel excluir.'); return; }
      setEditingId(null);
      setUndo({ kind: item.kind, id: item.id });
      router.refresh();
    });
  }

  function undoDelete() {
    if (!undo) return;
    const target = undo;
    startTransition(async () => {
      const result = await restoreAgendaItem(target.kind, target.id);
      if (!result.ok) { setError(result.error || 'Nao foi possivel restaurar.'); return; }
      setUndo(null);
      router.refresh();
    });
  }

  const isEmpty = groups.length === 0;

  const quickAddForm = (
    <form onSubmit={submitQuickReminder} style={{ display: 'grid', gap: '8px' }}>
      <div className={styles.field}>
        <input
          ref={inputRef}
          placeholder={'Ex: me lembra amanha de organizar as turmas'}
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          disabled={quickStatus === 'saving'}
        />
      </div>
      {quickMsg && (
        <small style={{ color: quickStatus === 'error' ? '#ff8f6b' : quickStatus === 'done' ? '#43d787' : 'rgba(255,255,255,.7)', fontSize: '13px', lineHeight: '1.4' }}>
          {quickMsg}
        </small>
      )}
      {quickStatus === 'error' && agentBridge && <Link href="/" className={styles.chip}>Continuar no assistente</Link>}
      <div className={styles.formActions}>
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={closeQuickAdd} disabled={quickStatus === 'saving'}>Cancelar</button>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={quickStatus === 'saving' || !quickText.trim()}>
          {quickStatus === 'saving' ? 'Criando...' : 'Criar lembrete'}
        </button>
      </div>
    </form>
  );

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.error}>{error}</div>}
      {undo && (
        <div className={styles.toast}>
          <span>Item excluido.</span>
          <button type="button" onClick={undoDelete} disabled={pending}>Desfazer</button>
        </div>
      )}

      {loadError ? (
        <div className={styles.error}>Nao foi possivel carregar sua agenda. Verifique a conexao e recarregue.</div>
      ) : isEmpty ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>{'◷'}</span>
          <p>Nada na agenda ainda.</p>
          {showQuickAdd ? quickAddForm : (
            <>
              <small>Diga ou escreva o que precisa lembrar:</small>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openQuickAdd}>+ Novo lembrete</button>
              <Link href="/" className={styles.chip} style={{ marginTop: '4px' }}>Abrir assistente de voz</Link>
            </>
          )}
        </div>
      ) : (
        <>
          {showQuickAdd ? quickAddForm : (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} style={{ textAlign: 'center' }} onClick={openQuickAdd}>
              + Novo lembrete
            </button>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <p className={`${styles.sectionTitle} ${group.key === 'late' ? styles.attention : ''}`}>{group.label}</p>
              <ul className={styles.list}>
                {group.items.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className={styles.item}>
                    <div className={styles.itemRow}>
                      <span className={styles.itemIcon}>{ICON[item.kind]}</span>
                      <div className={styles.itemMain}>
                        <span className={`${styles.itemTitle} ${item.done ? styles.done : ''}`}>{item.title}</span>
                        <div className={styles.itemMeta}>
                          {KIND_LABEL[item.kind]}{item.at ? ` · ${formatTime(item.at, tz)}` : ''}
                          {item.recurrence && <span className={`${styles.badge} ${styles.badgeRepeat}`}>{'🔁'} {RECURRENCE_LABEL[item.recurrence]}</span>}
                          {group.key === 'late' && <span className={`${styles.badge} ${styles.badgeLate}`}>atrasado</span>}
                          {item.done && <span className={`${styles.badge} ${styles.badgeDone}`}>concluido</span>}
                        </div>
                      </div>
                      <div className={styles.itemActions}>
                        {item.kind !== 'event' && (
                          <button type="button" className={`${styles.iconBtn} ${item.done ? styles.done : ''}`} aria-label={item.done ? 'Reabrir' : 'Concluir'} onClick={() => toggleDone(item)} disabled={pending}>{'✓'}</button>
                        )}
                        <button type="button" className={styles.iconBtn} aria-label="Editar" onClick={() => (editingId === item.id ? setEditingId(null) : startEdit(item))}>{'✎'}</button>
                        <button type="button" className={`${styles.iconBtn} ${styles.danger}`} aria-label="Excluir" onClick={() => remove(item)} disabled={pending}>{'✕'}</button>
                      </div>
                    </div>

                    {editingId === item.id && (
                      <div className={styles.edit}>
                        <div className={styles.field}>
                          <label htmlFor={`title-${item.id}`}>Titulo</label>
                          <input id={`title-${item.id}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                        </div>
                        <div className={item.kind === 'event' ? styles.grid2 : styles.field}>
                          <div className={styles.field}>
                            <label htmlFor={`at-${item.id}`}>{item.kind === 'task' ? 'Data e hora (opcional)' : 'Data e hora'}</label>
                            <input id={`at-${item.id}`} type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
                          </div>
                          {item.kind === 'event' && (
                            <div className={styles.field}>
                              <label htmlFor={`end-${item.id}`}>Termino (opcional)</label>
                              <input id={`end-${item.id}`} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                            </div>
                          )}
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Avisar</span>
                          <div className={styles.checkGrid}>
                            {ALERT_OPTIONS.map((option) => (
                              <label key={option.value} className={styles.checkLabel}>
                                <input
                                  type="checkbox"
                                  checked={form.alerts.includes(option.value)}
                                  onChange={(e) => setForm({ ...form, alerts: e.target.checked ? [...new Set([...form.alerts, option.value])] : form.alerts.filter((value) => value !== option.value) })}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className={styles.field}>
                          <span className={styles.fieldLabel}>Canais</span>
                          <div className={styles.checkGrid}>
                            {(['push', 'whatsapp', 'telegram'] as NotificationChannel[]).map((channel) => (
                              <label key={channel} className={styles.checkLabel}>
                                <input
                                  type="checkbox"
                                  checked={form.channels.includes(channel)}
                                  onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...new Set([...form.channels, channel])] : form.channels.filter((value) => value !== channel) })}
                                />
                                {channel === 'push' ? 'notificacao push' : channel === 'telegram' ? 'Telegram' : 'WhatsApp'}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className={styles.formActions}>
                          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingId(null)} disabled={pending}>Cancelar</button>
                          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => save(item)} disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
