import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { verifiedScheduleHandoff } from '../lib/agent/client';
import { evolveAgentContext, parseAgentContextRow, parseAgentConversation } from '../lib/agent/context-builder';
import { agentPilotEnabled, runAgentPilot } from '../lib/agent/server-agent';
import type { AgentProvider, AgentProviderRequest, AgentProviderResponse } from '../lib/agent/contracts';
import { emptyAgentContextState, emptyAgentUsage } from '../lib/agent/contracts';
import type { ClassCatalog } from '../lib/agent/tools/classes';

test('piloto fica desligado por padrão e exige ativação explícita', () => {
  assert.equal(agentPilotEnabled({}), false);
  assert.equal(agentPilotEnabled({ AGENT_V1_ENABLED: 'false' }), false);
  assert.equal(agentPilotEnabled({ AGENT_V1_ENABLED: 'true' }), true);
  assert.equal(agentPilotEnabled({ AGENT_V1_ENABLED: ' TRUE ' }), true);
});

test('context builder aceita somente turnos válidos e limita a janela por orçamento', () => {
  const turns = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `turno ${index}` }));
  const parsed = parseAgentConversation([{ role: 'system', text: 'ignorar' }, { role: 'user', text: ' ' }, ...turns], 30);
  assert.ok(parsed.length < turns.length);
  assert.equal(parsed.at(-1)?.content, 'turno 13');
});

test('context builder separa foco e memória operacional do histórico recente', () => {
  const parsed = parseAgentContextRow({
    recent_conversation: [{ role: 'user', text: 'a que usamos ontem' }],
    pending_question: { kind: 'choose_file' },
    last_entity_type: 'class',
    last_entity_id: 'class-1',
    last_action_log_id: 'action-1',
  });
  assert.equal(parsed.conversation[0].content, 'a que usamos ontem');
  assert.deepEqual(parsed.state.focus, { entityType: 'class', entityId: 'class-1' });
  assert.deepEqual(parsed.state.operationalMemory, {
    pendingQuestion: { kind: 'choose_file' },
    lastActionLogId: 'action-1',
  });
  assert.deepEqual(parsed.state.longTermMemory, []);
  assert.deepEqual(parseAgentContextRow({
    recent_conversation: [],
    pending_question: null,
    last_entity_type: null,
    last_entity_id: null,
  }).state, {
    summary: null,
    focus: null,
    operationalMemory: {},
    longTermMemory: [],
  });
});

test('contexto agentic só deriva estado de observações e remove códigos temporários', () => {
  const next = evolveAgentContext(
    { conversation: [], state: emptyAgentContextState() },
    {
      userText: 'agenda o modelo 2 de Design',
      now: new Date('2026-08-27T03:00:00.000Z'),
      result: {
        reply: 'O celular ainda precisa confirmar.',
        toolResults: [
          {
            callId: 'find', toolName: 'find_classes', arguments: { query: 'Design' }, status: 'success',
            output: { resolution: 'likely_single', matches: [{ id: 'class-1', name: 'Design Gráfico', score: 0.9 }] },
            verified: true, risk: 'read',
          },
          {
            callId: 'schedule', toolName: 'prepare_notice_schedule', arguments: { classId: 'class-1' }, status: 'success',
            output: { created: true, handoffId: 'handoff-1', deepLink: 'minhaagenda://schedule?code=segredo' },
            verified: true, risk: 'external', evidence: { code: 'segredo', status: 'awaiting_device' },
          },
        ],
      },
    },
  );
  assert.deepEqual(next.state.focus, { kind: 'class', id: 'class-1', label: 'Design Gráfico', confidence: 0.9 });
  const observations = next.state.operationalMemory.observations as Array<Record<string, unknown>>;
  assert.equal(observations.length, 2);
  assert.equal((observations[1].result as Record<string, unknown>).deepLink, '[redacted]');
  assert.equal((observations[1].evidence as Record<string, unknown>).code, '[redacted]');
  assert.deepEqual(next.conversation.map((message) => message.role), ['user', 'assistant']);
});

test('cliente só abre handoff criado por ferramenta com sucesso verificado', () => {
  const base = {
    kind: 'failed' as const,
    reply: 'Resposta final indisponível.',
    toolResults: [{
      callId: 'schedule',
      toolName: 'prepare_notice_schedule',
      arguments: {},
      status: 'error' as const,
      output: { created: true, handoffId: 'handoff-1', deepLink: 'minhaagenda://schedule?code=segredo' },
      verified: false,
      risk: 'external' as const,
    }],
  };
  assert.equal(verifiedScheduleHandoff(base), undefined);

  const verified = {
    ...base,
    toolResults: [{ ...base.toolResults[0], status: 'success' as const, verified: true }],
  };
  assert.equal(verifiedScheduleHandoff(verified)?.handoffId, 'handoff-1');
});

test('piloto compõe contexto, tools reais e provedor sem tocar no fluxo antigo', async () => {
  const provider = new CapturingProvider();
  const catalog: ClassCatalog = { async list() { return []; } };
  const result = await runAgentPilot(
    {} as never,
    'user-pilot',
    'Qual era aquela turma de tecnologia?',
    'text',
    'America/Cuiaba',
    {
      env: { AI_PROVIDER: 'local' },
      provider,
      catalog,
      conversation: [{ role: 'assistant', content: 'Falamos das turmas ontem.' }],
      now: new Date('2026-08-27T03:00:00.000Z'),
    },
  );

  assert.equal(result.kind, 'completed');
  assert.equal(provider.request?.messages[0].content, 'Falamos das turmas ontem.');
  assert.equal(provider.request?.messages.at(-1)?.content, 'Qual era aquela turma de tecnologia?');
  assert.deepEqual(provider.request?.tools.map((tool) => tool.name), ['find_classes', 'get_notice_template', 'prepare_notice_schedule', 'get_schedule_status']);
});

test('aprovações agentic ficam inacessíveis ao cliente e expiram no servidor', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260826000700_agent_pending_approvals.sql'), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.agent_pending_approvals from anon, authenticated/i);
  assert.match(sql, /grant all on table public\.agent_pending_approvals to service_role/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /expires_at timestamptz not null/i);
  assert.match(sql, /jsonb_typeof\(tool_calls\) = 'array'/i);

  const route = readFileSync(join(process.cwd(), 'app/api/agent/turn/route.ts'), 'utf8');
  assert.match(route, /toolCalls: result\.pendingCalls/);
  assert.match(route, /approvalId: approval\.id/);
});

test('contexto agentic tem RLS e separa memória operacional do legado', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260826000800_agent_contexts.sql'), 'utf8');
  assert.match(sql, /create table public\.agent_contexts/i);
  assert.match(sql, /operational_memory jsonb/i);
  assert.match(sql, /long_term_memory jsonb/i);
  assert.match(sql, /enable row level security/i);
  for (const operation of ['select', 'insert', 'update', 'delete']) assert.match(sql, new RegExp(`owner_${operation}`));
});

class CapturingProvider implements AgentProvider {
  readonly name = 'capturing';
  request: AgentProviderRequest | null = null;

  async generate(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    this.request = request;
    return {
      provider: this.name,
      model: 'fake-model',
      text: 'Posso consultar as turmas cadastradas.',
      toolCalls: [],
      usage: emptyAgentUsage(),
    };
  }
}
