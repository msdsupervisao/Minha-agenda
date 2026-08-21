import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import screens from '@/components/screens/Screens.module.css';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext } from '@/lib/data/screen-queries';

export const dynamic = 'force-dynamic';

export default async function TurmasPage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  return (
    <AppShell title="Turmas" subtitle="Suas turmas, cursos e professores." email={ctx.email}>
      <div className={screens.wrap}>
        <div className={screens.empty}>
          <span className={screens.emptyIcon}>◇</span>
          <p>Turmas ainda não está ativa.</p>
          <small>Esta tela precisa de uma tabela nova no banco (turmas), que vai ser criada com uma migração rápida no próximo passo.</small>
        </div>
      </div>
    </AppShell>
  );
}
