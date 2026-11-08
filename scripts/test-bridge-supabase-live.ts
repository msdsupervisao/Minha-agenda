import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BridgeQueue } from '../lib/agent/bridge-queue';
import { processNextBridgeJob } from '../lib/agent/bridge-worker';
import { createBridgeNoticeComposer } from '../lib/agent/bridge-notice';
import { runAgentPilot } from '../lib/agent/server-agent';
import { runOpenCode } from '../lib/agent/providers/opencode-cli';
import { runClaude } from '../lib/agent/providers/claude-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { FakeBridgeTestProvider } from './fake-bridge-test-provider';

const testUrl = 'https://kdublfvsooxvrlmcichs.supabase.co';
const publicKey = process.env.BRIDGE_TEST_PUBLISHABLE_KEY;
const email = process.env.BRIDGE_TEST_EMAIL;
const password = process.env.BRIDGE_TEST_PASSWORD;
if (!email?.endsWith('@example.invalid') || !password || !publicKey?.startsWith('sb_publishable_')) throw new Error('Configuração ou credenciais fictícias ausentes.');

async function main() {
  const client = createClient(testUrl, publicKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: email!, password: password! });
  delete process.env.BRIDGE_TEST_PASSWORD;
  if (login.error || !login.data.user) throw new Error('Falha de autenticação da conta fictícia.');
  const userId = login.data.user.id;
  const queue = new BridgeQueue(client);
  const useClaude = process.env.BRIDGE_TEST_PROVIDER === 'claude';
  const model = process.env.BRIDGE_TEST_MODEL || (useClaude ? 'haiku' : 'opencode/glm-5.3-flash-free');
  const executable = useClaude
    ? process.env.CLAUDE_EXECUTABLE || join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe')
    : process.env.OPENCODE_EXECUTABLE || join(process.env.APPDATA || '', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
  const generateText = (prompt: string) => useClaude ? runClaude(prompt, { executable, model }) : runOpenCode(prompt, { executable, model });
  const simulated = process.env.BRIDGE_TEST_SIMULATED === 'true';
  const provider = simulated ? new FakeBridgeTestProvider() : new StructuredTextAgentProvider({ model, generateText });
  const noticeComposer = simulated ? async () => ({ message: 'Olá, turma! A aula será quarta às 19h.' }) : createBridgeNoticeComposer(generateText);
  const options = { env: { AI_PROVIDER: 'local' }, provider, noticeComposer };
  const processJob = () => processNextBridgeJob(queue, (input, resume) => runAgentPilot(client, userId, input.text, input.source, input.timezone, { ...options, resume }));
  const result = async (id: string) => {
    const response = await client.from('agent_bridge_jobs').select('status,result').eq('id', id).eq('user_id', userId).single();
    if (response.error || !response.data) throw new Error('Não foi possível verificar um pedido fictício.');
    return response.data;
  };
  try {
    const classRow = await client.from('classes').insert({ user_id: userId, name: 'Design Quarta Teste', course: 'Design Gráfico', schedule: 'quarta às 19h', whatsapp_group: 'Grupo fictício Design' }).select('id').single();
    if (classRow.error || !classRow.data) throw new Error('Não foi possível criar a turma fictícia.');

    const expenseRequestId = randomUUID();
    const expenseInput = { text: 'Gastei 60 reais com combustível. Anote.', source: 'voice' as const, timezone: 'America/Cuiaba' };
    const expenseId = await queue.enqueue(expenseRequestId, expenseInput);
    assert.equal(await queue.enqueue(expenseRequestId, expenseInput), expenseId);
    assert.equal(await processJob(), true);
    const expenseJob = await result(expenseId);
    if (expenseJob.status !== 'completed') throw new Error('O teste de gasto não foi concluído.');
    const expenses = await client.from('expenses').select('amount,category').eq('user_id', userId).is('deleted_at', null);
    if (expenses.error || expenses.data?.length !== 1 || Number(expenses.data[0].amount) !== 60 || !/combust/i.test(String(expenses.data[0].category))) throw new Error('O gasto fictício não foi verificado.');
    assert.equal(await processJob(), false);
    console.log('Gasto fictício registrado e verificado, sem duplicação.');

    const reminderId = await queue.enqueue(randomUUID(), { text: 'Me lembre de ligar para Ana daqui a 30 minutos.', source: 'voice', timezone: 'America/Cuiaba' });
    assert.equal(await processJob(), true);
    const reminderJob = await result(reminderId);
    if (reminderJob.status !== 'completed') throw new Error('O teste de lembrete não foi concluído.');
    const reminders = await client.from('reminders').select('title,due_at').eq('user_id', userId).is('deleted_at', null);
    if (reminders.error || reminders.data?.length !== 1 || !/ana/i.test(String(reminders.data[0].title))) throw new Error('O lembrete fictício não foi verificado.');
    console.log('Lembrete fictício registrado e verificado.');

    const noticeId = await queue.enqueue(randomUUID(), { text: 'Prepare um aviso para a turma Design Quarta Teste dizendo que a aula será quarta às 19h e agende para me avisar daqui a 10 minutos.', source: 'voice', timezone: 'America/Cuiaba' });
    assert.equal(await processJob(), true);
    const pending = await result(noticeId);
    if (pending.status !== 'approval_required') throw new Error('O aviso fictício não aguardou confirmação.');
    const before = await client.from('schedule_handoffs').select('id').eq('user_id', userId);
    if (before.error || before.data?.length !== 0) throw new Error('O aviso foi criado antes da confirmação.');
    await queue.decide(noticeId, 'approve');
    await assert.rejects(queue.decide(noticeId, 'approve'));
    assert.equal(await processJob(), true);
    const notices = await client.from('schedule_handoffs').select('status,recipient_name,body').eq('user_id', userId);
    if (notices.error || notices.data?.length !== 1 || notices.data[0].status !== 'awaiting_device') throw new Error('O aviso fictício não foi verificado.');
    console.log('Aviso fictício aguardou confirmação e ficou pronto para o aparelho.');
  } finally { await client.auth.signOut(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Falha no teste fictício.'); process.exitCode = 1; });
