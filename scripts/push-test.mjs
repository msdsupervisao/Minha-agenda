// Teste manual de push de lembrete ponta a ponta.
// Uso (Node 20+, carrega .env.local):
//   node --env-file=.env.local scripts/push-test.mjs probe
//   node --env-file=.env.local scripts/push-test.mjs insert   [minutos=2]
//   node --env-file=.env.local scripts/push-test.mjs fire
import { createClient } from '@supabase/supabase-js';

const PROD = 'https://minha-agenda1.vercel.app';
const cmd = process.argv[2] || 'probe';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
const cronSecret = process.env.CRON_SECRET;

function svc() {
  if (!url || !serviceKey) throw new Error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY no .env.local');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function fireCron() {
  const res = await fetch(`${PROD}/api/cron/reminders`, {
    method: 'POST',
    headers: { 'x-cron-secret': cronSecret ?? '' },
  });
  const body = await res.text();
  return { status: res.status, body };
}

if (cmd === 'probe') {
  // Confere inscricoes de push e se o cron de producao aceita nosso segredo local.
  const { data: subs, error } = await svc().from('push_subscriptions').select('user_id,endpoint,created_at');
  if (error) throw error;
  console.log(`Inscricoes de push ativas: ${subs.length}`);
  for (const s of subs) console.log(`  user=${s.user_id}  endpoint=${String(s.endpoint).slice(0, 45)}...  (${s.created_at})`);
  const fired = await fireCron();
  console.log(`Cron producao com segredo local -> HTTP ${fired.status}: ${fired.body}`);
  console.log(fired.status === 200
    ? 'OK: segredo local bate com a Vercel e push esta configurado em producao.'
    : 'ATENCAO: segredo nao bate (401) ou push nao configurado (503) na Vercel.');
} else if (cmd === 'insert') {
  const minutes = Number(process.argv[3] || 2);
  const client = svc();
  const { data: subs, error } = await client.from('push_subscriptions').select('user_id');
  if (error) throw error;
  if (!subs.length) throw new Error('Nenhuma inscricao de push encontrada. Ative o push em Ajustes no celular primeiro.');
  const userId = subs[0].user_id;
  const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const id = crypto.randomUUID();
  const { error: insErr } = await client.from('reminders').insert({
    id, user_id: userId, title: `Teste de push (daqui ${minutes} min)`, due_at: dueAt,
  });
  if (insErr) throw insErr;
  console.log(`Lembrete criado: id=${id}`);
  console.log(`  user=${userId}`);
  console.log(`  vence_em=${dueAt} (${minutes} min a partir de agora)`);
  console.log('Agora aguarde vencer e rode:  node --env-file=.env.local scripts/push-test.mjs fire');
} else if (cmd === 'fire') {
  const fired = await fireCron();
  console.log(`Cron producao -> HTTP ${fired.status}: ${fired.body}`);
} else {
  console.error(`Comando desconhecido: ${cmd}. Use probe | insert | fire`);
  process.exitCode = 1;
}
