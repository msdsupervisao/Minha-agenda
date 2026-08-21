import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PushToggle from '@/components/PushToggle';
import screens from '@/components/screens/Screens.module.css';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext } from '@/lib/data/screen-queries';

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  const timezone = process.env.APP_TIMEZONE || 'America/Cuiaba';
  const aiMode = (process.env.AI_PROVIDER === 'local' || !process.env.OPENAI_API_KEY) ? 'Local (regras)' : 'OpenAI';

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Conta', value: ctx.email || '—' },
    { label: 'Fuso horário', value: timezone },
    { label: 'Interpretação de IA', value: aiMode },
    { label: 'Dados', value: 'Supabase (RLS por usuário)' },
    { label: 'WhatsApp', value: 'Desativado (mock)' },
  ];

  return (
    <AppShell title="Ajustes" subtitle="Preferências e conta." email={ctx.email}>
      <div className={screens.wrap}>
        <p className={screens.sectionTitle}>Notificações</p>
        <PushToggle />

        <p className={screens.sectionTitle}>Conta e app</p>
        <ul className={screens.list}>
          {rows.map((row) => (
            <li key={row.label} className={screens.item}>
              <div className={screens.itemRow}>
                <div className={screens.itemMain}>
                  <span className={screens.itemTitle}>{row.label}</span>
                  <div className={screens.itemMeta}>{row.value}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <form action="/auth/logout" method="post" style={{ margin: 0 }}>
          <button type="submit" className={`${screens.btn} ${screens.btnGhost}`} style={{ width: '100%' }}>Sair da conta</button>
        </form>
      </div>
    </AppShell>
  );
}
