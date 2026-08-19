import { createClient } from '@supabase/supabase-js';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_TEST_USER_A_EMAIL', 'SUPABASE_TEST_USER_A_PASSWORD',
  'SUPABASE_TEST_USER_B_EMAIL', 'SUPABASE_TEST_USER_B_PASSWORD',
] as const;

async function main() {
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    console.error(`Teste Supabase real não executado: variáveis ausentes: ${missing.join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const userAClient = createClient(url, key, options);
  const userBClient = createClient(url, key, options);
  const loginA = { email: process.env.SUPABASE_TEST_USER_A_EMAIL!, password: process.env.SUPABASE_TEST_USER_A_PASSWORD! };
  const loginB = { email: process.env.SUPABASE_TEST_USER_B_EMAIL!, password: process.env.SUPABASE_TEST_USER_B_PASSWORD! };
  const { data: authA, error: authAError } = await userAClient.auth.signInWithPassword(loginA);
  const { data: authB, error: authBError } = await userBClient.auth.signInWithPassword(loginB);
  if (authAError || !authA.user || authBError || !authB.user) throw new Error('Falha no login das contas de teste.');

  const now = new Date().toISOString();
  const expenseId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();
  const logId = crypto.randomUUID();
  try {
    check(await userAClient.from('expenses').insert({ id: expenseId, user_id: authA.user.id, amount: 30, currency: 'BRL', category: 'combustível', occurred_at: now, source: 'text' }), 'criar gasto');
    check(await userAClient.from('reminders').insert({ id: reminderId, user_id: authA.user.id, title: 'Falar com João', due_at: new Date(Date.now() + 86400000).toISOString() }), 'criar lembrete');
    check(await userAClient.from('action_logs').insert({ id: logId, user_id: authA.user.id, intent: 'create_expense', entity_type: 'expense', entity_id: expenseId, status: 'completed', summary: 'R$ 30,00 · combustível', source: 'text', reversible: true }), 'criar action log');

    const ownRead = await userAClient.from('expenses').select('id,amount,category').eq('id', expenseId).single();
    check(ownRead, 'ler gasto próprio');
    if (Number(ownRead.data?.amount) !== 30) throw new Error('Valor persistido incorreto.');

    const crossRead = await userBClient.from('expenses').select('id').eq('id', expenseId);
    check(crossRead, 'consultar isolamento');
    if ((crossRead.data || []).length !== 0) throw new Error('RLS permitiu leitura cruzada.');
    const forgedInsert = await userBClient.from('expenses').insert({ user_id: authA.user.id, amount: 999, currency: 'BRL', category: 'forjado', occurred_at: now, source: 'text' });
    if (!forgedInsert.error) throw new Error('RLS permitiu INSERT com user_id de outro usuário.');

    await userAClient.auth.signOut();
    const relogin = await userAClient.auth.signInWithPassword(loginA);
    if (relogin.error || !relogin.data.user) throw new Error('Falha ao restaurar sessão por novo login.');
    const persisted = await userAClient.from('expenses').select('id').eq('id', expenseId).single();
    check(persisted, 'persistência após logout/login');
    console.log(JSON.stringify({ login: true, persistence: true, rlsCrossReadBlocked: true, forgedInsertBlocked: true, expenseId, reminderId, actionLogId: logId }));
  } finally {
    await userAClient.from('action_logs').delete().eq('id', logId);
    await userAClient.from('reminders').delete().eq('id', reminderId);
    await userAClient.from('expenses').delete().eq('id', expenseId);
    await userAClient.auth.signOut();
    await userBClient.auth.signOut();
  }
}

function check(result: { error: { message?: string } | null }, operation: string) {
  if (result.error) throw new Error(`Falha ao ${operation}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha desconhecida no teste Supabase real.');
  process.exitCode = 1;
});
