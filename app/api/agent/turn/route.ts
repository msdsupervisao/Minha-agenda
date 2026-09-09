import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTimezone } from '@/lib/data/server-timezone';
import type { AgentRunResult, AgentProgress } from '@/lib/agent/contracts';
import { randomUUID } from 'node:crypto';
import { persistAgentTurn } from '@/lib/agent/context-builder';
import { SupabasePendingApprovalStore } from '@/lib/agent/pending-approval-store';
import { AgentPilotUnavailableError, agentPilotEnabled, runAgentPilot } from '@/lib/agent/server-agent';
import { parseAiRouteChainCookieHeader } from '@/lib/assistant/ai-route';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { createServiceClient, serviceConfigured } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TurnSchema = z.union([
  z.object({
    text: z.string().trim().min(1).max(4000),
    source: z.enum(['voice', 'text']),
    weatherLocation: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
  }).strict(),
  z.object({
    approvalId: z.string().uuid(),
    decision: z.enum(['approve', 'cancel']),
  }).strict(),
]);

export async function POST(request: Request) {
  if (!request.headers.get('accept')?.includes('application/x-ndjson')) return handleTurn(request);
  // Stream execution status, never partial model claims. Tool effects are only
  // presented as successful after the application's verifier has run.
  const encoder = new TextEncoder();
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => { if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      try {
        const response = await handleTurn(request, (progress) => send({ type: 'progress', progress }));
        send({ type: 'result', result: await response.json(), httpStatus: response.status });
      } catch {
        send({ type: 'result', httpStatus: 500, result: { error: 'Não foi possível concluir o turno do agente.' } });
      } finally { if (!disconnected) controller.close(); }
    },
    cancel() { disconnected = true; },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

async function handleTurn(request: Request, onProgress?: (event: AgentProgress) => void) {
  if (!agentPilotEnabled()) return NextResponse.json({ error: 'Piloto do agente desativado.' }, { status: 404 });
  if (!getSupabasePublicConfig().configured) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 503 });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 }); }
  const parsed = TurnSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });

  try {
    const client = await createClient();
    const routeChain = parseAiRouteChainCookieHeader(request.headers.get('cookie'));
    if ('approvalId' in parsed.data) {
      if (!serviceConfigured()) return NextResponse.json({ error: 'Armazenamento seguro de aprovação indisponível.' }, { status: 503 });
      const store = new SupabasePendingApprovalStore(createServiceClient());
      const pending = await store.claim(parsed.data.approvalId, user.id);
      if (!pending) return NextResponse.json({ error: 'Aprovação expirada, já utilizada ou inexistente.' }, { status: 409 });
      if (parsed.data.decision === 'cancel') {
        await store.finish(pending.id, user.id, 'cancelled');
        const reply = 'Tudo bem. Não executei a ação.';
        await persistAgentTurn(client, user.id, { userText: 'Cancelar', result: { reply, toolResults: [] } });
        return NextResponse.json({ kind: 'cancelled', reply }, noStore());
      }

      let result: AgentRunResult;
      try {
        result = await runAgentPilot(
          client,
          user.id,
          'O usuário aprovou exatamente a ação pendente.',
          pending.source,
          pending.timezone,
          { resume: { pendingCalls: pending.toolCalls, continuation: pending.continuation }, onProgress, routeChain },
        );
      } catch (error) {
        await store.finish(pending.id, user.id, 'failed');
        throw error;
      }
      await store.finish(pending.id, user.id, result.kind === 'failed' ? 'failed' : 'consumed');
      await persistAgentTurn(client, user.id, { userText: 'Confirmo.', result });
      return respondWithResult(result, user.id, pending.source, pending.timezone, store);
    }

    const timezone = await resolveTimezone();
    const result = await runAgentPilot(client, user.id, parsed.data.text, parsed.data.source, timezone, { onProgress, routeChain, weatherLocation: parsed.data.weatherLocation });
    await persistAgentTurn(client, user.id, { userText: parsed.data.text, result });
    const store = result.kind === 'approval_required' && serviceConfigured()
      ? new SupabasePendingApprovalStore(createServiceClient())
      : null;
    if (result.kind === 'approval_required' && !store) {
      return NextResponse.json({ error: 'Armazenamento seguro de aprovação indisponível.' }, { status: 503 });
    }
    return respondWithResult(result, user.id, parsed.data.source, timezone, store);
  } catch (error) {
    if (error instanceof AgentPilotUnavailableError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error('[minha-agenda:agent]', JSON.stringify({
      timestamp: new Date().toISOString(),
      operation: 'agent_turn',
      result: 'error',
      error: error instanceof Error ? error.name : 'unknown',
    }));
    return NextResponse.json({ error: 'Não foi possível concluir o turno do agente.' }, { status: 500 });
  }
}

async function respondWithResult(
  result: AgentRunResult,
  userId: string,
  source: 'voice' | 'text',
  timezone: string,
  store: SupabasePendingApprovalStore | null,
) {
  const runId = randomUUID();
  console.info('[minha-agenda:run]', JSON.stringify({
    runId, result: result.kind, provider: result.provider, model: result.model,
    executions: result.executions, steps: result.steps, usage: result.usage,
    tools: result.toolResults.map((tool) => ({ name: tool.toolName, status: tool.status, verified: tool.verified, errorCode: tool.errorCode })),
    errorCode: result.kind === 'failed' ? result.errorCode : null,
  }));
  if (result.kind !== 'approval_required') {
    return NextResponse.json({ ...result, runId }, noStore());
  }
  if (!store) return NextResponse.json({ error: 'Armazenamento seguro de aprovação indisponível.' }, { status: 503 });
  const approval = await store.create({
    userId,
    provider: result.provider,
    toolCalls: result.pendingCalls,
    continuation: result.continuation,
    source,
    timezone,
  });
  return NextResponse.json({
    kind: result.kind,
    reply: result.reply,
    approvalId: approval.id,
    expiresAt: approval.expiresAt,
    provider: result.provider,
    model: result.model,
    steps: result.steps,
    usage: result.usage,
    executions: result.executions,
    runId,
  }, noStore());
}

function noStore() {
  return { headers: { 'cache-control': 'no-store' } };
}
