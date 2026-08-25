'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { SchoolClass } from '@/lib/assistant/types';
import { createClassAction, deleteClassAction, updateClassAction } from '@/app/turmas/actions';
import { defaultNoticeTemplates } from '@/lib/notices/weekly';
import type { GeneratedNotices } from '@/lib/notices/ai-generator';
import styles from './Screens.module.css';

type Form = {
  name: string;
  course: string;
  schedule: string;
  teacher: string;
  notes: string;
  whatsappGroup: string;
  noticeTemplateDirect: string;
  noticeTemplateMotivational: string;
  noticeTemplateImpactful: string;
};
const EMPTY: Form = {
  name: '', course: '', schedule: '', teacher: '', notes: '', whatsappGroup: '',
  noticeTemplateDirect: '', noticeTemplateMotivational: '', noticeTemplateImpactful: '',
};

function toInput(form: Form) {
  return {
    name: form.name,
    course: form.course || null,
    schedule: form.schedule || null,
    teacher: form.teacher || null,
    notes: form.notes || null,
    whatsappGroup: form.whatsappGroup || null,
    noticeTemplateDirect: form.noticeTemplateDirect || null,
    noticeTemplateMotivational: form.noticeTemplateMotivational || null,
    noticeTemplateImpactful: form.noticeTemplateImpactful || null,
  };
}

export default function TurmasView({ classes, loadError }: { classes: SchoolClass[]; loadError?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ classId: string; models: GeneratedNotices } | null>(null);
  const [aiInfo, setAiInfo] = useState<{ classId: string; text: string } | null>(null);

  function openCreate() {
    setError(null); setEditingId(null); setConfirmingId(null);
    setSuggestions(null); setAiInfo(null);
    setForm(EMPTY); setCreating(true);
  }
  function openEdit(item: SchoolClass) {
    setError(null); setCreating(false); setConfirmingId(null);
    setSuggestions(null); setAiInfo(null);
    setEditingId(item.id);
    setForm({
      name: item.name,
      course: item.course ?? '',
      schedule: item.schedule ?? '',
      teacher: item.teacher ?? '',
      notes: item.notes ?? '',
      whatsappGroup: item.whatsappGroup ?? '',
      noticeTemplateDirect: item.noticeTemplateDirect ?? '',
      noticeTemplateMotivational: item.noticeTemplateMotivational ?? '',
      noticeTemplateImpactful: item.noticeTemplateImpactful ?? '',
    });
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

  async function generateWithAi(classId: string) {
    setError(null); setAiInfo(null); setSuggestions(null); setGeneratingId(classId);
    try {
      const response = await fetch('/api/notices/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classId }),
      });
      const payload = await response.json() as { models?: GeneratedNotices; error?: string };
      if (!response.ok || !payload.models) throw new Error(payload.error || 'Não foi possível gerar novas versões.');
      setSuggestions({ classId, models: payload.models });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar novas versões.');
    } finally {
      setGeneratingId(null);
    }
  }

  function fillInitialTemplates() {
    const initial = defaultNoticeTemplates(form.course || form.name);
    setForm({
      ...form,
      noticeTemplateDirect: form.noticeTemplateDirect || initial.noticeTemplateDirect,
      noticeTemplateMotivational: form.noticeTemplateMotivational || initial.noticeTemplateMotivational,
      noticeTemplateImpactful: form.noticeTemplateImpactful || initial.noticeTemplateImpactful,
    });
  }

  function applySuggestions(classId: string, models: GeneratedNotices) {
    setForm({
      ...form,
      noticeTemplateDirect: models.direct,
      noticeTemplateMotivational: models.motivational,
      noticeTemplateImpactful: models.impactful,
    });
    setSuggestions(null);
    setAiInfo({ classId, text: 'Novas versões carregadas. Revise os textos e toque em Salvar para confirmar.' });
  }

  function fields(idPrefix: string, classId?: string) {
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
        <div className={styles.noticeHeader}>
          <div><strong>Avisos semanais</strong><small>Seus três modelos são a referência de estilo.</small></div>
          {classId
            ? <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void generateWithAi(classId)} disabled={pending || generatingId === classId}>{generatingId === classId ? 'Criando…' : 'Criar novas versões com IA'}</button>
            : <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={fillInitialTemplates}>Preencher modelos básicos</button>}
        </div>
        {classId && suggestions?.classId === classId && <div className={styles.aiPreview}>
          <strong>Prévia criada pela IA</strong>
          <small>Nada foi substituído. Compare, edite se quiser e escolha se deseja usar estas versões.</small>
          {([
            ['direct', 'Modelo 1 — Direto'],
            ['motivational', 'Modelo 2 — Motivacional'],
            ['impactful', 'Modelo 3 — Impactante'],
          ] as const).map(([key, label]) => <div className={styles.field} key={key}>
            <label htmlFor={`suggestion-${key}-${idPrefix}`}>{label}</label>
            <textarea id={`suggestion-${key}-${idPrefix}`} className={styles.noticeTextarea} value={suggestions.models[key]} onChange={(event) => setSuggestions({ classId, models: { ...suggestions.models, [key]: event.target.value } })} />
          </div>)}
          <div className={styles.formActions}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setSuggestions(null)}>Descartar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => applySuggestions(classId, suggestions.models)}>Usar estas versões</button>
          </div>
        </div>}
        {classId && aiInfo?.classId === classId && <div className={styles.aiInfo}>{aiInfo.text}</div>}
        <div className={styles.field}>
          <label htmlFor={`group-${idPrefix}`}>Nome do grupo no WhatsApp</label>
          <input id={`group-${idPrefix}`} value={form.whatsappGroup} onChange={(e) => setForm({ ...form, whatsappGroup: e.target.value })} placeholder="Ex.: grupo Design" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`direct-${idPrefix}`}><b>Modelo 1 — Direto</b></label>
          <textarea id={`direct-${idPrefix}`} className={styles.noticeTextarea} value={form.noticeTemplateDirect} onChange={(e) => setForm({ ...form, noticeTemplateDirect: e.target.value })} placeholder="Aviso curto e objetivo" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`motivational-${idPrefix}`}><b>Modelo 2 — Motivacional</b></label>
          <textarea id={`motivational-${idPrefix}`} className={styles.noticeTextarea} value={form.noticeTemplateMotivational} onChange={(e) => setForm({ ...form, noticeTemplateMotivational: e.target.value })} placeholder="Mensagem que cria expectativa" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`impactful-${idPrefix}`}><b>Modelo 3 — Impactante</b></label>
          <textarea id={`impactful-${idPrefix}`} className={styles.noticeTextarea} value={form.noticeTemplateImpactful} onChange={(e) => setForm({ ...form, noticeTemplateImpactful: e.target.value })} placeholder="Mensagem que reforça a importância de não faltar" />
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
                    {[item.noticeTemplateDirect, item.noticeTemplateMotivational, item.noticeTemplateImpactful].filter(Boolean).length > 0
                      ? ` · ${[item.noticeTemplateDirect, item.noticeTemplateMotivational, item.noticeTemplateImpactful].filter(Boolean).length} modelos de aviso`
                      : ''}
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
                  {fields(item.id, item.id)}
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
