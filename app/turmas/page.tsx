import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import TurmasView from '@/components/screens/TurmasView';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext } from '@/lib/data/screen-queries';
import { listClasses } from '@/lib/data/classes-repository';
import type { SchoolClass } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

export default async function TurmasPage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  let classes: SchoolClass[] = [];
  let loadError = false;
  try {
    classes = await listClasses(ctx.client, ctx.userId);
  } catch {
    loadError = true;
  }

  return (
    <AppShell title="Turmas" subtitle="Suas turmas, cursos e professores." email={ctx.email}>
      <TurmasView classes={classes} loadError={loadError} />
    </AppShell>
  );
}
