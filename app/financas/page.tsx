import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import FinancasView from '@/components/screens/FinancasView';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import {
  expenseCategories, getScreenContext, listExpenses, normalizeExpenseFilter,
} from '@/lib/data/screen-queries';
import { resolveTimezone } from '@/lib/data/server-timezone';
import type { Expense } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

type FinancasPageProps = {
  searchParams: Promise<{ filter?: string; category?: string }>;
};

export default async function FinancasPage({ searchParams }: FinancasPageProps) {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  const query = await searchParams;
  const filter = normalizeExpenseFilter(query.filter);
  const category = query.category?.trim() || null;
  const tz = await resolveTimezone();

  let expenses: Expense[] = [];
  let categories: string[] = [];
  let loadError = false;
  try {
    [expenses, categories] = await Promise.all([listExpenses(ctx, filter, category, tz), expenseCategories(ctx)]);
  } catch {
    loadError = true;
  }
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <AppShell title="Finanças" subtitle="Seus gastos, do jeito que você registrou." email={ctx.email}>
      <FinancasView expenses={expenses} total={total} categories={categories} filter={filter} category={category} loadError={loadError} tz={tz} />
    </AppShell>
  );
}
