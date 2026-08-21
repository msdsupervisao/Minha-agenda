'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Expense } from '@/lib/assistant/types';
import { formatBRL, formatDateTime, toDatetimeLocal } from '@/lib/format';
import { deleteExpense, restoreExpense, updateExpense } from '@/app/financas/actions';
import styles from './Screens.module.css';

type Props = {
  expenses: Expense[];
  total: number;
  categories: string[];
  filter: string;
  category: string | null;
  loadError?: boolean;
};

const FILTERS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Mês' },
  { key: 'all', label: 'Tudo' },
];

export default function FinancasView({ expenses, total, categories, filter, category, loadError }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: '', category: '', occurredAt: '' });
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);

  function href(next: { filter?: string; category?: string | null }) {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const c = next.category === undefined ? category : next.category;
    if (f && f !== '7d') params.set('filter', f);
    if (c) params.set('category', c);
    const qs = params.toString();
    return qs ? `/financas?${qs}` : '/financas';
  }

  function startEdit(expense: Expense) {
    setError(null);
    setEditingId(expense.id);
    setForm({ amount: String(expense.amount), category: expense.category, occurredAt: toDatetimeLocal(expense.occurredAt) });
  }

  function save(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateExpense(id, { amount: Number(form.amount), category: form.category, occurredAt: form.occurredAt });
      if (!result.ok) { setError(result.error || 'Não foi possível salvar.'); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteExpense(id);
      if (!result.ok) { setError(result.error || 'Não foi possível excluir.'); return; }
      setEditingId(null);
      setUndo(id);
      router.refresh();
    });
  }

  function undoDelete(id: string) {
    startTransition(async () => {
      const result = await restoreExpense(id);
      if (!result.ok) { setError(result.error || 'Não foi possível restaurar.'); return; }
      setUndo(null);
      router.refresh();
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.filters}>
        {FILTERS.map((item) => (
          <Link key={item.key} href={href({ filter: item.key })} className={`${styles.chip} ${filter === item.key ? styles.chipActive : ''}`}>{item.label}</Link>
        ))}
      </div>

      {categories.length > 0 && (
        <div className={styles.filters}>
          <Link href={href({ category: null })} className={`${styles.chip} ${!category ? styles.chipActive : ''}`}>Todas</Link>
          {categories.map((cat) => (
            <Link key={cat} href={href({ category: cat })} className={`${styles.chip} ${category === cat ? styles.chipActive : ''}`}>{cat}</Link>
          ))}
        </div>
      )}

      <div className={styles.summary}>
        <div><small>Total no período</small><div><strong>{formatBRL(total)}</strong></div></div>
        <span className={styles.summaryCount}>{expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}</span>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {undo && (
        <div className={styles.toast}>
          <span>Gasto excluído.</span>
          <button type="button" onClick={() => undoDelete(undo)} disabled={pending}>Desfazer</button>
        </div>
      )}

      {loadError ? (
        <div className={styles.error}>Não foi possível carregar seus gastos. Verifique a conexão e recarregue.</div>
      ) : expenses.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>R$</span>
          <p>Nenhum gasto neste período.</p>
          <small>Fale ou escreva no assistente algo como “gastei 30 reais em combustível” e ele aparece aqui.</small>
          <Link href="/" className={`${styles.btn} ${styles.btnPrimary}`}>Ir ao assistente</Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {expenses.map((expense) => (
            <li key={expense.id} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.itemIcon}>R$</span>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{expense.category}</span>
                  <div className={styles.itemMeta}>{formatDateTime(expense.occurredAt)} · {expense.source === 'voice' ? 'voz' : 'texto'}</div>
                </div>
                <span className={styles.amount}>{formatBRL(expense.amount)}</span>
                <div className={styles.itemActions}>
                  <button type="button" className={styles.iconBtn} aria-label="Editar" onClick={() => (editingId === expense.id ? setEditingId(null) : startEdit(expense))}>✎</button>
                  <button type="button" className={`${styles.iconBtn} ${styles.danger}`} aria-label="Excluir" onClick={() => remove(expense.id)} disabled={pending}>✕</button>
                </div>
              </div>

              {editingId === expense.id && (
                <div className={styles.edit}>
                  <div className={styles.grid2}>
                    <div className={styles.field}>
                      <label htmlFor={`amount-${expense.id}`}>Valor (R$)</label>
                      <input id={`amount-${expense.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`cat-${expense.id}`}>Categoria</label>
                      <input id={`cat-${expense.id}`} list="expense-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`date-${expense.id}`}>Data e hora</label>
                    <input id={`date-${expense.id}`} type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
                  </div>
                  <div className={styles.formActions}>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingId(null)} disabled={pending}>Cancelar</button>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => save(expense.id)} disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <datalist id="expense-categories">{categories.map((cat) => <option key={cat} value={cat} />)}</datalist>
    </div>
  );
}
