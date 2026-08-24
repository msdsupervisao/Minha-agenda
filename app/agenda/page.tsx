import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import AgendaView from '@/components/screens/AgendaView';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext, listEvents, listReminders, listTasks } from '@/lib/data/screen-queries';
import { resolveTimezone } from '@/lib/data/server-timezone';
import { buildAgendaItems, groupAgenda, type AgendaGroup } from '@/lib/data/agenda';

export const dynamic = 'force-dynamic';

export default async function AgendaPage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');
  const tz = await resolveTimezone();

  let groups: AgendaGroup[] = [];
  let loadError = false;
  try {
    const [reminders, tasks, events] = await Promise.all([listReminders(ctx), listTasks(ctx), listEvents(ctx)]);
    groups = groupAgenda(buildAgendaItems(reminders, tasks, events), new Date(), tz);
  } catch {
    loadError = true;
  }

  return (
    <AppShell title="Agenda" subtitle="Lembretes, tarefas e compromissos em ordem." email={ctx.email}>
      <AgendaView groups={groups} loadError={loadError} tz={tz} />
    </AppShell>
  );
}
