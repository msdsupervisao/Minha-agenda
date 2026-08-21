'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SchoolClass } from '@/lib/assistant/types';
import { createClassAction, deleteClassAction, updateClassAction } from '@/app/turmas/actions';
import styles from './Screens.module.css';

type Form = { name: string; course: string; schedule: string; teacher: string; notes: string };
const EMPTY: Form = { name: '', course: '', schedule: '', teacher: '', notes: '' };

function toInput(form: Form) {
  return { name: form.name, course: form.course || null, schedule: form.schedule || null, teacher: form.teacher || null, notes: form.notes || null };
}

export default function TurmasView({ classes, loadError }: { classes: SchoolClass[]; loadError?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setError(null); setEditingId(null); setConfirmingId(null);
    setForm(EMPTY); setCreating(true);
  }
  function openEdit(item: SchoolClass) {
    setError(null); setCreating(false); setConfirmingId(null);
    setEditingId(item.id);
    setForm({ name: item.name, course: item.course ?? '', schedule: item.schedule ?? '', teacher: item.teacher ?? '', notes: item.notes ?? '' });
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createClassAction(toInput(form));
      if (!result.ok) { setError(result.error || 'Não foi possível criar.'); return; }
      setCreating(false); setForm(EMPTY); router.refresh();
    });
  }
  function save(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateClassAction(id, toInput(form));
      if (!result.ok) { setError(result.error || 'Não foi possível salvar.'); return; }
      setEditingId(null); router.refresh();
    });
  }
  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteClassAction(id);
      if (!result.ok) { setError(result.error || 'Não foi possível excluir.'); return; }
      setConfirmingId(null); router.refresh();
    });
  }

  function fields(idPrefix: string) {
    return (
      <div className={styles.edit}>
        <div className={styles.field}>
          <label htmlFor={`name-${idPrefix}`}>Nome da turma *</label>
          <input id={`name-${idPrefix}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Designer Gráfico — Turma B" />
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor={`course-${idPrefix}`}>Curso</label>
            <input id={`course-${idPrefix}`} value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`teacher-${idPrefix}`}>Professor</label>
            <input id={`teacher-${idPrefix}`} value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={`schedule-${idPrefix}`}>Horário</label>
          <input id={`schedule-${idPrefix}`} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Ex.: Seg e Qua, 19h–21h" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`notes-${idPrefix}`}>Observações</label>
          <textarea id={`notes-${idPrefix}`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.filters}>
        <button type="button" className={`${styles.chip} ${creating ? styles.chipActive : ''}`} onClick={() => (creating ? setCreating(false) : openCreate())}>+ Nova turma</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {creating && (
        <div className={styles.item}>
          {fields('new')}
          <div className={styles.edit} style={{ borderTop: 0, paddingTop: 0 }}>
            <div className={styles.formActions}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setCreating(false)} disabled={pending}>Cancelar</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={create} disabled={pending}>{pending ? 'Criando…' : 'Criar turma'}</button>
            </div>
          </div>
        </div>
      )}

      {loadError ? (
        <div className={styles.error}>Não foi possível carregar suas turmas. Verifique a conexão e recarregue.</div>
      ) : classes.length === 0 && !creating ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◇</span>
          <p>Nenhuma turma cadastrada.</p>
          <small>Cadastre suas turmas com curso, horário e professor para consultar quando precisar.</small>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>+ Nova turma</button>
        </div>
      ) : (
        <ul className={styles.list}>
          {classes.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.itemIcon}>◇</span>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{item.name}</span>
                  <div className={styles.itemMeta}>
                    {[item.course, item.teacher, item.schedule].filter(Boolean).join(' · ') || 'sem detalhes'}
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button type="button" className={styles.iconBtn} aria-label="Editar" onClick={() => (editingId === item.id ? setEditingId(null) : openEdit(item))}>✎</button>
                  <button type="button" className={`${styles.iconBtn} ${styles.danger}`} aria-label="Excluir" onClick={() => setConfirmingId(confirmingId === item.id ? null : item.id)}>✕</button>
                </div>
              </div>

              {confirmingId === item.id && (
                <div className={styles.edit}>
                  <div className={styles.toast}>
                    <span>Excluir esta turma? Não dá pra desfazer.</span>
                    <button type="button" onClick={() => remove(item.id)} disabled={pending}>Excluir</button>
                  </div>
                </div>
              )}

              {editingId === item.id && (
                <>
                  {fields(item.id)}
                  <div className={styles.edit} style={{ borderTop: 0, paddingTop: 0 }}>
                    {item.notes && <p className={styles.itemMeta} style={{ margin: 0 }}>{item.notes}</p>}
                    <div className={styles.formActions}>
                      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingId(null)} disabled={pending}>Cancelar</button>
                      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => save(item.id)} disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
