import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { emptyAgentContextState, type AgentExecutionContext } from '../lib/agent/contracts';
import {
  createNoticeScheduleTools,
  type ScheduleHandoffStore,
} from '../lib/agent/tools/notice-schedule';
import type { ClassCatalog } from '../lib/agent/tools/classes';
import type { SchoolClass } from '../lib/assistant/types';

const context: AgentExecutionContext = {
  userId: 'user-design',
  source: 'voice',
  now: new Date('2026-08-27T00:00:00.000Z'),
  timezone: 'America/Cuiaba',
  state: emptyAgentContextState(),
};

const design: SchoolClass = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: context.userId,
  createdAt: context.now.toISOString(),
  updatedAt: context.now.toISOString(),
  name: 'Design Gráfico',
  course: 'Designer Gráfico',
  schedule: 'quarta às 19h',
  teacher: null,
  notes: null,
  whatsappGroup: 'Design Gráfico — Turma',
  noticeTemplateDirect: 'Modelo direto',
  noticeTemplateMotivational: 'A criatividade começa aqui. Aula confirmada!',
  noticeTemplateImpactful: 'Modelo impacto',
};

const catalog: ClassCatalog = { async list() { return [design]; } };

test('modelo 2 de Design só cria handoff depois da aprovação exata', async () => {
  const store = new MemoryScheduleStore();
  const registry = new ToolRegistry(createNoticeScheduleTools(catalog, store));
  const call = {
    callId: 'schedule-design-2',
    name: 'prepare_notice_schedule',
    arguments: {
      classId: design.id,
      modelNumber: 2,
      recipientName: design.whatsappGroup!,
      body: design.noticeTemplateMotivational!,
      localDueAt: '2026-08-28T18:00',
    },
  };

  const pending = await registry.execute(call, context);
  assert.equal(pending.status, 'approval_required');
  assert.match(pending.approvalMessage || '', /Design Gráfico — Turma/);
  assert.match(pending.approvalMessage || '', /criatividade começa aqui/);
  assert.match(pending.approvalMessage || '', /28\/08\/2026, 18:00/);
  assert.equal(store.rows.length, 0);

  const executed = await registry.execute(call, context, new Set([call.callId]));
  assert.equal(executed.status, 'success');
  assert.equal(executed.verified, true);
  assert.equal(store.rows.length, 1);
  const output = executed.output as Record<string, unknown>;
  assert.equal(output.status, 'awaiting_device');
  assert.equal(output.recipientName, 'Design Gráfico — Turma');
  assert.equal(output.body, design.noticeTemplateMotivational);
  assert.equal(output.dueAt, '2026-08-28T22:00:00.000Z');
  assert.match(String(output.androidIntent), /^intent:\/\/schedule/);
});

test('ferramenta recusa corpo ou destinatário que não vieram da turma real', async () => {
  const store = new MemoryScheduleStore();
  const registry = new ToolRegistry(createNoticeScheduleTools(catalog, store));
  const call = {
    callId: 'schedule-grounding',
    name: 'prepare_notice_schedule',
    arguments: {
      classId: design.id,
      modelNumber: 2,
      recipientName: 'aqueles tecnologia',
      body: 'mensagem inventada',
      localDueAt: '2026-08-27T20:30',
    },
  };
  const result = await registry.execute(call, context, new Set([call.callId]));
  assert.equal(result.status, 'error');
  assert.equal(result.verified, false);
  assert.equal(result.errorCode, 'grounding_mismatch');
  assert.deepEqual(result.output, {
    created: false,
    errorCode: 'grounding_mismatch',
    message: 'Destinatário ou texto não correspondem aos dados atuais da turma.',
  });
  assert.equal(store.rows.length, 0);
});

test('horário passado nunca produz handoff, mesmo depois de aprovado', async () => {
  const store = new MemoryScheduleStore();
  const registry = new ToolRegistry(createNoticeScheduleTools(catalog, store));
  const call = {
    callId: 'schedule-past',
    name: 'prepare_notice_schedule',
    arguments: {
      classId: design.id,
      modelNumber: 2,
      recipientName: design.whatsappGroup!,
      body: design.noticeTemplateMotivational!,
      localDueAt: '2026-08-26T19:59',
    },
  };
  const result = await registry.execute(call, context, new Set([call.callId]));
  assert.equal(result.status, 'error');
  assert.equal(result.errorCode, 'invalid_due_at');
  assert.deepEqual(result.output, {
    created: false,
    errorCode: 'invalid_due_at',
    message: 'Escolha um horário futuro.',
  });
  assert.equal(store.rows.length, 0);
});

test('horário local com Z é rejeitado para impedir deslocamento silencioso de fuso', async () => {
  const store = new MemoryScheduleStore();
  const registry = new ToolRegistry(createNoticeScheduleTools(catalog, store));
  const result = await registry.execute({
    callId: 'schedule-offset',
    name: 'prepare_notice_schedule',
    arguments: {
      classId: design.id,
      modelNumber: 2,
      recipientName: design.whatsappGroup!,
      body: design.noticeTemplateMotivational!,
      localDueAt: '2026-08-28T18:00:00Z',
    },
  }, context, new Set(['schedule-offset']));
  assert.equal(result.status, 'error');
  assert.equal(result.errorCode, 'invalid_arguments');
  assert.equal(store.rows.length, 0);
});

test('agente consulta o ACK antes de afirmar que o celular agendou', async () => {
  const store = new MemoryScheduleStore();
  store.rows.push({
    id: '33333333-3333-4333-8333-333333333333',
    status: 'scheduled_on_device',
    code: 'A'.repeat(22),
    recipientName: design.whatsappGroup!,
    body: design.noticeTemplateMotivational!,
    dueAt: '2026-08-28T00:30:00.000Z',
  });
  const registry = new ToolRegistry(createNoticeScheduleTools(catalog, store));
  const result = await registry.execute({
    callId: 'status-1',
    name: 'get_schedule_status',
    arguments: { handoffId: '33333333-3333-4333-8333-333333333333' },
  }, context);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.output, {
    found: true,
    handoffId: '33333333-3333-4333-8333-333333333333',
    status: 'scheduled_on_device',
    recipientName: 'Design Gráfico — Turma',
    dueAt: '2026-08-28T00:30:00.000Z',
  });
});

class MemoryScheduleStore implements ScheduleHandoffStore {
  readonly rows: Array<{
    id: string;
    status: string;
    code: string;
    recipientName: string;
    body: string;
    dueAt: string;
  }> = [];

  async create(draft: { recipientName: string; body: string; dueAt: string }) {
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'awaiting_device',
      code: 'A'.repeat(22),
      ...draft,
      dueAt: draft.dueAt.replace('.000Z', '+00:00'),
    };
    this.rows.push(row);
    return row;
  }

  async find(id: string) {
    return this.rows.find((row) => row.id === id) || null;
  }
}
