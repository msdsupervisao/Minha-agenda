import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import FinancasView from '@/components/screens/FinancasView';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import {
  expenseCategories, getScreenContext, listExpenses, normalizeExpenseFilter,
} from '@/lib/data/screen-queries';
import type { Expense } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

export default async function FinancasPage({ searchParams }: { searchParams: { filter?: string; category?: string } }) {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  const filter = normalizeExpenseFilter(searchParams.filter);
  const category = searchParams.category?.trim() || null;

  let expenses: Expense[] = [];
  let categories: string[] = [];
  let loadError = false;
  try {
    [expenses, categories] = await Promise.all([listExpenses(ctx, filter, category), expenseCategories(ctx)]);
  } catch {
    loadError = true;
  }
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <AppShell title="Finanças" subtitle="Seus gastos, do jeito que você registrou." email={ctx.email}>
      <FinancasView expenses={expenses} total={total} categories={categories} filter={filter} category={category} loadError={loadError} />
    </AppShell>
  );
}
