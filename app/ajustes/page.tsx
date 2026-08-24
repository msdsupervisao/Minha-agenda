import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PushToggle from '@/components/PushToggle';
import screens from '@/components/screens/Screens.module.css';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getScreenContext } from '@/lib/data/screen-queries';
import { resolveTimezone } from '@/lib/data/server-timezone';
import { getAiUsageSummary, type AiUsageSummary } from '@/lib/data/ai-usage';

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  if (!getSupabasePublicConfig().configured) redirect('/');
  const ctx = await getScreenContext();
  if (!ctx) redirect('/login');

  const timezone = await resolveTimezone();
  const aiMode = (process.env.AI_PROVIDER === 'local' || !process.env.OPENAI_API_KEY) ? 'Local (regras)' : 'OpenAI';

  let usage: AiUsageSummary | null = null;
  try { usage = await getAiUsageSummary(ctx); } catch { usage = null; }

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Conta', value: ctx.email || '—' },
    { label: 'Fuso horário', value: timezone },
    { label: 'Interpretação de IA', value: aiMode },
    { label: 'Dados', value: 'Supabase (RLS por usuário)' },
    { label: 'WhatsApp', value: 'Desativado (mock)' },
  ];

  const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
  const fmtUsd = (c: number | null) => c === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(c);
  const usageRows: Array<{ label: string; value: string }> = usage ? [
    { label: 'Custo estimado (OpenAI)', value: fmtUsd(usage.estimatedCostUsd) },
    { label: 'Comandos', value: `${fmtNum(usage.totalCalls)} · ${fmtNum(usage.openaiCalls)} OpenAI · ${fmtNum(usage.localCalls)} local (grátis)` },
    { label: 'Tokens OpenAI', value: `${fmtNum(usage.totalTokens)} · entrada ${fmtNum(usage.inputTokens)} · saída ${fmtNum(usage.outputTokens)}` },
    { label: 'Economia do híbrido', value: `${fmtNum(usage.localCalls)} comando(s) resolvido(s) sem custo` },
  ] : [];

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

        <p className={screens.sectionTitle}>Consumo de IA</p>
        {usage ? (
          <ul className={screens.list}>
            {usageRows.map((row) => (
              <li key={row.label} className={screens.item}>
                <div className={screens.itemRow}>
                  <div className={screens.itemMain}>
                    <span className={screens.itemTitle}>{row.label}</span>
                    <div className={screens.itemMeta}>{row.value}</div>
                  </div>
                </div>
              </li>
            ))}
            <li className={screens.item}>
              <div className={screens.itemRow}>
                <div className={screens.itemMain}>
                  <div className={screens.itemMeta}>
                    Estimativa por {process.env.OPENAI_MODEL || 'gpt-5.4-mini'} (entrada US$ 0,75/mi · saída US$ 4,50/mi). Valor oficial no painel da OpenAI (Usage). O modo híbrido resolve comandos simples localmente, sem custo.
                  </div>
                </div>
              </div>
            </li>
          </ul>
        ) : (
          <ul className={screens.list}>
            <li className={screens.item}>
              <div className={screens.itemRow}>
                <div className={screens.itemMain}>
                  <div className={screens.itemMeta}>Consumo indisponível no momento.</div>
                </div>
              </div>
            </li>
          </ul>
        )}

        <form action="/auth/logout" method="post" style={{ margin: 0 }}>
          <button type="submit" className={`${screens.btn} ${screens.btnGhost}`} style={{ width: '100%' }}>Sair da conta</button>
        </form>
      </div>
    </AppShell>
  );
}
