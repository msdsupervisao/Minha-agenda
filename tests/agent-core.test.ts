import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { AgentOrchestrator, buildAgentInstructions } from '../lib/agent/orchestrator';
import { ToolRegistry } from '../lib/agent/tool-registry';
import type {
  AgentExecutionContext,
  AgentProvider,
  AgentProviderRequest,
  AgentProviderResponse,
  AgentTool,
  JsonObject,
} from '../lib/agent/contracts';
import { emptyAgentContextState, emptyAgentUsage } from '../lib/agent/contracts';

const context: AgentExecutionContext = {
  userId: 'user-1',
  source: 'voice',
  now: new Date('2026-08-27T00:30:00.000Z'),
  timezone: 'America/Cuiaba',
  state: emptyAgentContextState(),
};

function tool(input: Partial<AgentTool<JsonObject>> & Pick<AgentTool<JsonObject>, 'name' | 'inputSchema' | 'execute'>): AgentTool<JsonObject> {
  return {
    description: `Ferramenta ${input.name}`,
    risk: 'read',
    ...input,
  };
}

test('registro publica schema estrito e recusa ferramentas duplicadas', () => {
  const registry = new ToolRegistry([
    tool({
      name: 'find_classes',
      inputSchema: z.object({ query: z.string() }).strict(),
      async execute() { return []; },
    }),
  ]);
  const descriptor = registry.descriptors()[0];
  assert.equal(descriptor.name, 'find_classes');
  assert.deepEqual(descriptor.parameters.required, ['query']);
  assert.equal(descriptor.parameters.additionalProperties, false);
  assert.throws(() => registry.register(tool({
    name: 'find_classes',
    inputSchema: z.object({ query: z.string() }).strict(),
    async execute() { return []; },
  })), /duplicada/);
});

test('ação externa exige aprovação antes de executar e vincula a chamada exata', async () => {
  let executions = 0;
  const registry = new ToolRegistry([
    tool({
      name: 'send_message',
      risk: 'external',
      inputSchema: z.object({ recipient: z.string(), body: z.string() }).strict(),
      approvalMessage(input) { return `Enviar para ${input.recipient}?`; },
      async execute() { executions += 1; return { messageId: 'message-1' }; },
      async verify() { return { verified: true, evidence: { messageId: 'message-1' } }; },
    }),
  ]);
  const call = { callId: 'call-1', name: 'send_message', arguments: { recipient: 'Kids Tecnologia', body: 'Aviso' } };

  const pending = await registry.execute(call, context);
  assert.equal(pending.status, 'approval_required');
  assert.deepEqual(pending.arguments, call.arguments);
  assert.equal(executions, 0);
  assert.match(pending.approvalMessage || '', /Kids Tecnologia/);

  const executed = await registry.execute(call, context, new Set(['call-1']));
  assert.equal(executed.status, 'success');
  assert.equal(executed.verified, true);
  assert.equal(executions, 1);
});

test('ação com efeito nunca vira sucesso sem verificador explícito', async () => {
  const registry = new ToolRegistry([
    tool({
      name: 'create_reminder',
      risk: 'low',
      inputSchema: z.object({ title: z.string() }).strict(),
      async execute() { return { id: 'reminder-1' }; },
    }),
  ]);
  const result = await registry.execute({ callId: 'call-2', name: 'create_reminder', arguments: { title: 'Tomar água' } }, context);
  assert.equal(result.status, 'error');
  assert.equal(result.verified, false);
  assert.equal(result.errorCode, 'verification_failed');
});

test('orquestrador executa ferramenta, devolve resultado ao modelo e conclui verificado', async () => {
  const provider = new ScriptedProvider([
    response({
      toolCalls: [{ callId: 'call-find', name: 'find_classes', arguments: { query: 'aquela turma de tecnologia' } }],
      continuation: { providerState: 1 },
      usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25, cachedInputTokens: 0 },
    }),
    response({
      text: 'Encontrei a turma Kids Tecnologia.',
      usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, cachedInputTokens: 5 },
    }),
  ]);
  const registry = new ToolRegistry([
    tool({
      name: 'find_classes',
      inputSchema: z.object({ query: z.string() }).strict(),
      async execute() { return [{ id: 'class-1', name: 'Kids Tecnologia' }]; },
    }),
  ]);

  const result = await new AgentOrchestrator(provider, registry).run({
    text: 'Abre aquela mensagem da turma de tecnologia.',
    context,
  });

  assert.equal(result.kind, 'completed');
  assert.equal(result.reply, 'Encontrei a turma Kids Tecnologia.');
  assert.equal(result.kind === 'completed' && result.verified, true);
  assert.equal(result.usage.totalTokens, 41);
  assert.equal(provider.requests[0].messages.at(-1)?.content, 'Abre aquela mensagem da turma de tecnologia.');
  assert.equal(provider.requests[1].toolResults?.[0].status, 'success');
  assert.deepEqual(provider.requests[1].continuation, { providerState: 1 });
});

test('orquestrador interrompe ação externa para confirmação', async () => {
  let executions = 0;
  const provider = new ScriptedProvider([response({
    toolCalls: [{ callId: 'call-send', name: 'send_message', arguments: { recipient: 'Kids Tecnologia' } }],
    continuation: { providerState: 'approval' },
  })]);
  const registry = new ToolRegistry([
    tool({
      name: 'send_message',
      risk: 'external',
      inputSchema: z.object({ recipient: z.string() }).strict(),
      approvalMessage(input) { return `Quer enviar para ${input.recipient}?`; },
      async execute() { executions += 1; return { sent: true }; },
      async verify() { return { verified: true }; },
    }),
  ]);

  const result = await new AgentOrchestrator(provider, registry).run({ text: 'Manda para a turma.', context });
  assert.equal(result.kind, 'approval_required');
  assert.equal(executions, 0);
  assert.equal(result.kind === 'approval_required' && result.pendingCalls[0].arguments.recipient, 'Kids Tecnologia');
});

test('orquestrador bloqueia falso sucesso depois de resultado não verificado', async () => {
  const provider = new ScriptedProvider([
    response({ toolCalls: [{ callId: 'call-write', name: 'write_value', arguments: { value: 'x' } }], continuation: {} }),
    response({ text: 'Pronto, foi salvo.' }),
  ]);
  const registry = new ToolRegistry([
    tool({
      name: 'write_value',
      risk: 'low',
      inputSchema: z.object({ value: z.string() }).strict(),
      async execute() { return { saved: true }; },
    }),
  ]);

  const result = await new AgentOrchestrator(provider, registry).run({ text: 'Salva isso.', context });
  assert.equal(result.kind, 'failed');
  assert.equal(result.kind === 'failed' && result.errorCode, 'unverified_tool_result');
  assert.doesNotMatch(result.reply, /Pronto/);
});

test('falha do provedor depois de efeito verificado preserva a evidência da ação', async () => {
  const provider = new ScriptedProvider([response({
    toolCalls: [{ callId: 'call-effect', name: 'create_handoff', arguments: { value: 'x' } }],
    continuation: {},
  })]);
  const registry = new ToolRegistry([tool({
    name: 'create_handoff',
    risk: 'low',
    inputSchema: z.object({ value: z.string() }).strict(),
    async execute() { return { created: true, handoffId: 'handoff-1' }; },
    async verify(output) { return { verified: true, evidence: output }; },
  })]);

  const result = await new AgentOrchestrator(provider, registry).run({ text: 'Crie.', context });
  assert.equal(result.kind, 'failed');
  assert.equal(result.kind === 'failed' && result.errorCode, 'provider_error_after_verified_effect');
  assert.match(result.reply, /executada e verificada/);
  assert.equal(result.toolResults[0].status, 'success');
  assert.equal(result.toolResults[0].verified, true);
});

test('retomada executa somente a chamada persistida e já aprovada', async () => {
  let executions = 0;
  const provider = new ScriptedProvider([response({ text: 'O handoff foi criado; o celular ainda precisa confirmar.' })]);
  const registry = new ToolRegistry([tool({
    name: 'prepare_schedule',
    risk: 'external',
    inputSchema: z.object({ id: z.string() }).strict(),
    async execute() { executions += 1; return { status: 'awaiting_device' }; },
    async verify(output) { return { verified: true, evidence: output }; },
  })]);
  const pendingCall = { callId: 'persisted-call', name: 'prepare_schedule', arguments: { id: 'schedule-1' } };

  const result = await new AgentOrchestrator(provider, registry).run({
    text: 'O usuário confirmou.',
    context,
    resume: { pendingCalls: [pendingCall], continuation: { providerState: 'persisted' } },
  });

  assert.equal(result.kind, 'completed');
  assert.equal(executions, 1);
  assert.deepEqual(provider.requests[0].continuation, { providerState: 'persisted' });
  assert.deepEqual(provider.requests[0].toolResults?.[0].arguments, { id: 'schedule-1' });
});

test('instruções centrais exigem intenção, ferramentas e verificação', () => {
  const prompt = buildAgentInstructions({ text: 'teste', context });
  assert.match(prompt, /intenção, o contexto e o objetivo/);
  assert.match(prompt, /Use ferramentas/);
  assert.match(prompt, /verified=true/);
  assert.match(prompt, /<contexto_atual>/);
  assert.doesNotMatch(prompt, /comando exato/);
});

class ScriptedProvider implements AgentProvider {
  readonly name = 'test-provider';
  readonly requests: AgentProviderRequest[] = [];

  constructor(private readonly script: AgentProviderResponse[]) {}

  async generate(request: AgentProviderRequest) {
    this.requests.push(request);
    const next = this.script.shift();
    if (!next) throw new Error('unexpected_provider_call');
    return next;
  }
}

function response(input: Partial<AgentProviderResponse>): AgentProviderResponse {
  return {
    provider: 'test-provider',
    model: 'test-model',
    text: '',
    toolCalls: [],
    usage: emptyAgentUsage(),
    ...input,
  };
}
