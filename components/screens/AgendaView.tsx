'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { AgendaGroup, AgendaItem, AgendaKind } from '@/lib/data/agenda';
import { formatTime, toDatetimeLocal } from '@/lib/format';
import { deleteAgendaItem, restoreAgendaItem, setAgendaDone, updateAgendaItem } from '@/app/agenda/actions';
import styles from './Screens.module.css';

const ICON: Record<AgendaKind, string> = { reminder: '◷', task: '✓', event: '▦' };
const KIND_LABEL: Record<AgendaKind, string> = { reminder: 'lembrete', task: 'tarefa', event: 'compromisso' };

export default function AgendaView({ groups, loadError }: { groups: AgendaGroup[]; loadError?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', at: '', endsAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ kind: AgendaKind; id: string } | null>(null);

  function startEdit(item: AgendaItem) {
    setError(null);
    setEditingId(item.id);
    setForm({ title: item.title, at: item.at ? toDatetimeLocal(item.at) : '', endsAt: item.endsAt ? toDatetimeLocal(item.endsAt) : '' });
  }

  function save(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await updateAgendaItem(item.kind, item.id, {
        title: form.title,
        at: form.at || null,
        endsAt: item.kind === 'event' ? (form.endsAt || null) : null,
      });
      if (!result.ok) { setError(result.error || 'Não foi possível salvar.'); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggleDone(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await setAgendaDone(item.kind, item.id, !item.done);
      if (!result.ok) { setError(result.error || 'Não foi possível atualizar.'); return; }
      router.refresh();
    });
  }

  function remove(item: AgendaItem) {
    setError(null);
    startTransition(async () => {
      const result = await deleteAgendaItem(item.kind, item.id);
      if (!result.ok) { setError(result.error || 'Não foi possível excluir.'); return; }
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
      if (!result.ok) { setError(result.error || 'Não foi possível restaurar.'); return; }
      setUndo(null);
      router.refresh();
    });
  }

  const isEmpty = groups.length === 0;

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.error}>{error}</div>}
      {undo && (
        <div className={styles.toast}>
          <span>Item excluído.</span>
          <button type="button" onClick={undoDelete} disabled={pending}>Desfazer</button>
        </div>
      )}

      {loadError ? (
        <div className={styles.error}>Não foi possível carregar sua agenda. Verifique a conexão e recarregue.</div>
      ) : isEmpty ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◷</span>
          <p>Nada na agenda ainda.</p>
          <small>Peça ao assistente algo como “me lembra amanhã às 9 de falar com o João” e aparece aqui.</small>
          <Link href="/" className={`${styles.btn} ${styles.btnPrimary}`}>Ir ao assistente</Link>
        </div>
      ) : (
        groups.map((group) => (
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
                        {KIND_LABEL[item.kind]}{item.at ? ` · ${formatTime(item.at)}` : ''}
                        {group.key === 'late' && <span className={`${styles.badge} ${styles.badgeLate}`}>atrasado</span>}
                        {item.done && <span className={`${styles.badge} ${styles.badgeDone}`}>concluído</span>}
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      {item.kind !== 'event' && (
                        <button type="button" className={`${styles.iconBtn} ${item.done ? styles.done : ''}`} aria-label={item.done ? 'Reabrir' : 'Concluir'} onClick={() => toggleDone(item)} disabled={pending}>✓</button>
                      )}
                      <button type="button" className={styles.iconBtn} aria-label="Editar" onClick={() => (editingId === item.id ? setEditingId(null) : startEdit(item))}>✎</button>
                      <button type="button" className={`${styles.iconBtn} ${styles.danger}`} aria-label="Excluir" onClick={() => remove(item)} disabled={pending}>✕</button>
                    </div>
                  </div>

                  {editingId === item.id && (
                    <div className={styles.edit}>
                      <div className={styles.field}>
                        <label htmlFor={`title-${item.id}`}>Título</label>
                        <input id={`title-${item.id}`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                      </div>
                      <div className={item.kind === 'event' ? styles.grid2 : styles.field}>
                        <div className={styles.field}>
                          <label htmlFor={`at-${item.id}`}>{item.kind === 'task' ? 'Data e hora (opcional)' : 'Data e hora'}</label>
                          <input id={`at-${item.id}`} type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} />
                        </div>
                        {item.kind === 'event' && (
                          <div className={styles.field}>
                            <label htmlFor={`end-${item.id}`}>Término (opcional)</label>
                            <input id={`end-${item.id}`} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                          </div>
                        )}
                      </div>
                      <div className={styles.formActions}>
                        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingId(null)} disabled={pending}>Cancelar</button>
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => save(item)} disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
