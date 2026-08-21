import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import AgendaView from '@/components/screens/AgendaView';
import screens from '@/components/screens/Screens.module.css';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext, listEvents, listExpenses, listReminders, listTasks } from '@/lib/data/screen-queries';
import { buildAgendaItems, curateForToday, type AgendaGroup } from '@/lib/data/agenda';
import { formatBRL } from '@/lib/format';
import type { Expense } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

export default async function HojePage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  let groups: AgendaGroup[] = [];
  let expenses: Expense[] = [];
  let loadError = false;
  try {
    const [reminders, tasks, events, todayExpenses] = await Promise.all([
      listReminders(ctx), listTasks(ctx), listEvents(ctx), listExpenses(ctx, 'today'),
    ]);
    groups = curateForToday(buildAgendaItems(reminders, tasks, events));
    expenses = todayExpenses;
  } catch {
    loadError = true;
  }

  const spentToday = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const nothing = !loadError && groups.length === 0 && expenses.length === 0;

  return (
    <AppShell title="Hoje" subtitle="O que precisa da sua atenção agora." email={ctx.email}>
      {loadError ? (
        <div className={screens.wrap}><div className={screens.error}>Não foi possível carregar o seu dia. Verifique a conexão e recarregue.</div></div>
      ) : nothing ? (
        <div className={screens.wrap}>
          <div className={screens.empty}>
            <span className={screens.emptyIcon}>☀️</span>
            <p>Tudo tranquilo por hoje.</p>
            <small>Nenhum item atrasado ou para hoje, e nenhum gasto registrado. Peça algo ao assistente quando precisar.</small>
            <Link href="/" className={`${screens.btn} ${screens.btnPrimary}`}>Ir ao assistente</Link>
          </div>
        </div>
      ) : (
        <div className={screens.wrap}>
          {groups.length > 0 && <AgendaView groups={groups} />}
          {expenses.length > 0 && (
            <div>
              <p className={screens.sectionTitle}>Dinheiro · hoje</p>
              <Link href="/financas?filter=today" className={screens.summary} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div><small>Gasto hoje</small><div><strong>{formatBRL(spentToday)}</strong></div></div>
                <span className={screens.summaryCount}>{expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'} ›</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
