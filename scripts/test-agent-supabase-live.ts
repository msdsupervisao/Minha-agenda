import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient, type User } from '@supabase/supabase-js';

const url = required('NEXT_PUBLIC_SUPABASE_URL');
const publishableKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const secretKey = required('SUPABASE_SECRET_KEY');
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, secretKey, clientOptions);

let userA: User | null = null;
let userB: User | null = null;
let pendingApprovalId: string | null = null;
let handoffId: string | null = null;
let actionLogId: string | null = null;

async function main() {
  const marker = randomUUID();
  const passwordA = `${randomBytes(24).toString('base64url')}aA1!`;
  const passwordB = `${randomBytes(24).toString('base64url')}bB2!`;
  userA = await createTemporaryUser(`codex-agent-a-${marker}@example.com`, passwordA);
  userB = await createTemporaryUser(`codex-agent-b-${marker}@example.com`, passwordB);

  const clientA = authenticatedClient();
  const clientB = authenticatedClient();
  check(await clientA.auth.signInWithPassword({ email: userA.email!, password: passwordA }), 'login do usuário A');
  check(await clientB.auth.signInWithPassword({ email: userB.email!, password: passwordB }), 'login do usuário B');

  check(await clientA.from('agent_contexts').insert({
    user_id: userA.id,
    recent_turns: [{ role: 'user', text: 'teste live temporário' }],
    operational_memory: { test: true },
    long_term_memory: [],
  }), 'criar contexto próprio');

  const ownContext = await clientA.from('agent_contexts').select('user_id,operational_memory').eq('user_id', userA.id).single();
  check(ownContext, 'ler contexto próprio');
  if (ownContext.data?.user_id !== userA.id) throw new Error('Contexto próprio incorreto.');

  const crossRead = await clientB.from('agent_contexts').select('user_id').eq('user_id', userA.id);
  check(crossRead, 'consultar isolamento de contexto');
  if ((crossRead.data || []).length !== 0) throw new Error('RLS permitiu leitura cruzada de contexto.');

  const forgedContext = await clientB.from('agent_contexts').insert({ user_id: userA.id });
  if (!forgedContext.error) throw new Error('RLS permitiu contexto forjado para outro usuário.');

  const pendingApproval = await service.from('agent_pending_approvals').insert({
    user_id: userA.id,
    provider: 'openai',
    tool_calls: [],
    continuation: { kind: 'live_test' },
    source: 'text',
    timezone: 'America/Cuiaba',
    status: 'pending',
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  }).select('id').single();
  check(pendingApproval, 'criar aprovação pelo servidor');
  if (!pendingApproval.data) throw new Error('Aprovação criada sem dados de retorno.');
  pendingApprovalId = String(pendingApproval.data.id);

  const hiddenApproval = await clientA.from('agent_pending_approvals').select('id').eq('id', pendingApprovalId);
  if (!hiddenApproval.error) throw new Error('Cliente autenticado conseguiu consultar aprovação privada.');

  actionLogId = randomUUID();
  check(await clientA.from('action_logs').insert({
    id: actionLogId,
    user_id: userA.id,
    intent: 'schedule_whatsapp_message',
    entity_type: null,
    entity_id: null,
    status: 'pending',
    summary: 'Teste live temporário',
    source: 'text',
    reversible: false,
  }), 'criar action log temporário');

  const rawCode = randomBytes(16).toString('base64url');
  const handoff = await clientA.from('schedule_handoffs').insert({
    user_id: userA.id,
    code_hash: createHash('sha256').update(rawCode).digest('hex'),
    body: 'Mensagem temporária de teste live.',
    recipient_name: 'Destino temporário',
    due_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    status: 'awaiting_device',
    action_log_id: actionLogId,
  }).select('id,status').single();
  check(handoff, 'criar handoff temporário');
  if (!handoff.data) throw new Error('Handoff criado sem dados de retorno.');
  handoffId = String(handoff.data.id);
  if (handoff.data.status !== 'awaiting_device') throw new Error('Estado inicial do handoff incorreto.');

  const invalidAck = await service.from('schedule_handoffs').update({ status: 'scheduled_on_device' }).eq('id', handoffId);
  if (!invalidAck.error) throw new Error('Constraint aceitou sucesso sem evidência do aparelho.');

  const acknowledgedAt = new Date().toISOString();
  const validAck = await service.from('schedule_handoffs').update({
    status: 'scheduled_on_device',
    device_notification_id: 123456,
    acknowledged_at: acknowledgedAt,
    last_error: null,
  }).eq('id', handoffId).select('status,device_notification_id,acknowledged_at').single();
  check(validAck, 'persistir ACK válido');
  if (!validAck.data) throw new Error('ACK persistido sem dados de retorno.');
  if (validAck.data.status !== 'scheduled_on_device' || validAck.data.device_notification_id !== 123456) {
    throw new Error('ACK válido não foi persistido corretamente.');
  }

  console.log(JSON.stringify({
    ok: true,
    temporaryUsers: 2,
    contextOwnerAccess: true,
    contextCrossReadBlocked: true,
    forgedContextBlocked: true,
    pendingApprovalHiddenFromClient: true,
    invalidAckBlocked: true,
    validAckPersisted: true,
  }));

  await clientA.auth.signOut();
  await clientB.auth.signOut();
}

async function cleanup() {
  if (handoffId) await service.from('schedule_handoffs').delete().eq('id', handoffId);
  if (actionLogId && userA) await service.from('action_logs').delete().eq('id', actionLogId).eq('user_id', userA.id);
  if (pendingApprovalId) await service.from('agent_pending_approvals').delete().eq('id', pendingApprovalId);
  if (userA) await service.from('agent_contexts').delete().eq('user_id', userA.id);
  if (userA) await service.auth.admin.deleteUser(userA.id);
  if (userB) await service.auth.admin.deleteUser(userB.id);
}

async function createTemporaryUser(email: string, password: string) {
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  check(result, 'criar usuário temporário');
  if (!result.data.user) throw new Error('Usuário temporário não retornado.');
  return result.data.user;
}

function authenticatedClient() {
  return createClient(url, publishableKey, clientOptions);
}

function check(result: { error: { message?: string } | null }, operation: string) {
  if (result.error) throw new Error(`Falha ao ${operation}: ${result.error.message || 'erro desconhecido'}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável ausente: ${name}`);
  return value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha desconhecida no teste live agentic.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
