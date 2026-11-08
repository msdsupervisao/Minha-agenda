import type { AgentClientResult } from './client';

const PENDING_KEY = 'minha-agenda:bridge-pending:v1';
type Input = { text: string; source: 'voice' | 'text'; weatherLocation?: { latitude: number; longitude: number } } | { approvalId: string; decision: 'approve' | 'cancel' };
type NewInput = Extract<Input, { text: string }> & { timezone: string };
type Pending = { id?: string; requestId?: string; input?: NewInput };

function getPending(key: string): Pending | null {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && (typeof value.id === 'string' || typeof value.requestId === 'string') ? value : null; } catch { return null; }
}

export async function sendBridgeTurn(input: Input, userId: string): Promise<AgentClientResult> {
  const key = `${PENDING_KEY}:${userId}`;
  const existing = getPending(key);
  if (existing && (!('approvalId' in input) || existing.id !== input.approvalId)) throw new Error('Há um pedido anterior aguardando. Reabra a agenda para consultar o resultado antes de repetir.');
  const requestId = crypto.randomUUID();
  const body = 'approvalId' in input ? input : { requestId, input: { ...input, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Cuiaba' } };
  const pending: Pending = 'approvalId' in body ? { id: body.approvalId } : { requestId, input: body.input };
  localStorage.setItem(key, JSON.stringify(pending));
  const response = await fetch('/api/agent/bridge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Um erro explícito antes de enfileirar não precisa deixar o cliente preso.
    if (response.status >= 400 && response.status < 500 && response.status !== 401 && !('approvalId' in input)) localStorage.removeItem(key);
    throw new Error(String(payload.error || 'Não consegui enviar o pedido. Reabra a agenda para verificar se foi recebido.'));
  }
  if (typeof payload.id !== 'string') throw new Error('A resposta da ponte é inválida. Reabra a agenda para verificar o pedido.');
  localStorage.setItem(key, JSON.stringify({ id: payload.id }));
  return pollBridge({ id: payload.id }, key);
}

export function resumeBridgeTurn(userId: string): Promise<AgentClientResult> | null {
  const key = `${PENDING_KEY}:${userId}`;
  const pending = getPending(key);
  return pending ? pollBridge(pending, key) : null;
}

async function pollBridge(pending: Pending, key: string): Promise<AgentClientResult> {
  for (let attempt = 0; attempt < 240; attempt++) {
    const query = pending.id ? `id=${encodeURIComponent(pending.id)}` : `requestId=${encodeURIComponent(pending.requestId || '')}`;
    const response = await fetch(`/api/agent/bridge?${query}`, { cache: 'no-store' });
    if (response.status === 404 && pending.requestId && pending.input) {
      // A primeira resposta pode ter se perdido. Reenviar a mesma operação é seguro:
      // a fila impede duas gravações com o mesmo requestId e conteúdo.
      const retried = await fetch('/api/agent/bridge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: pending.requestId, input: pending.input }) });
      const saved = await retried.json().catch(() => ({}));
      if (!retried.ok || typeof saved.id !== 'string') throw new Error('Não consegui recuperar o pedido. Reabra a agenda para tentar novamente.');
      pending = { id: saved.id };
      localStorage.setItem(key, JSON.stringify(pending));
      continue;
    }
    if (!response.ok) throw new Error('Não consegui consultar o pedido. Reabra a agenda para verificar antes de tentar novamente.');
    const payload = await response.json();
    if (typeof payload.id === 'string' && !pending.id) {
      pending = { id: payload.id };
      localStorage.setItem(key, JSON.stringify(pending));
    }
    if (['completed', 'failed', 'approval_required'].includes(payload.status)) {
      if (payload.status === 'approval_required') localStorage.setItem(key, JSON.stringify({ id: payload.id }));
      else localStorage.removeItem(key);
      if (!payload.result || typeof payload.result.reply !== 'string') throw new Error('A ponte terminou sem uma resposta válida. Confira seus registros.');
      return payload.result as AgentClientResult;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('O pedido ainda está aguardando o computador. Reabra a agenda para consultar o resultado; não repita a ação.');
}
