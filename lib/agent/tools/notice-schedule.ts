import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  buildScheduleDeepLinks,
  createScheduleHandoffCode,
  hashScheduleHandoffCode,
  scheduleDueAtIssue,
  SCHEDULE_HANDOFF_TTL_MS,
} from '@/lib/schedule/handoff';
import type { AgentExecutionContext, AgentTool, JsonObject, JsonValue } from '../contracts';
import { AgentToolExecutionError } from '../tool-registry';
import type { ClassCatalog } from './classes';

type ScheduleDraft = {
  recipientName: string;
  body: string;
  dueAt: string;
};

type StoredScheduleHandoff = ScheduleDraft & {
  id: string;
  status: string;
};

export type ScheduleHandoffStore = {
  create(draft: ScheduleDraft, context: AgentExecutionContext): Promise<StoredScheduleHandoff & { code: string }>;
  find(id: string, context: AgentExecutionContext): Promise<StoredScheduleHandoff | null>;
};

export function createSupabaseScheduleHandoffStore(client: SupabaseClient): ScheduleHandoffStore {
  return {
    async create(draft, context) {
      const code = createScheduleHandoffCode();
      const expiresAt = new Date(context.now.getTime() + SCHEDULE_HANDOFF_TTL_MS).toISOString();
      const { data, error } = await client.from('schedule_handoffs').insert({
        user_id: context.userId,
        code_hash: hashScheduleHandoffCode(code),
        recipient_name: draft.recipientName,
        body: draft.body,
        phone: null,
        due_at: draft.dueAt,
        expires_at: expiresAt,
        status: 'awaiting_device',
        action_log_id: null,
      }).select('id,status').single();
      if (error) throw new Error('schedule_handoff_create_failed');
      return { id: String(data.id), status: String(data.status), code, ...draft };
    },
    async find(id, context) {
      const { data, error } = await client.from('schedule_handoffs')
        .select('id,status,recipient_name,body,due_at')
        .eq('id', id)
        .eq('user_id', context.userId)
        .maybeSingle();
      if (error) throw new Error('schedule_handoff_verify_failed');
      if (!data) return null;
      return {
        id: String(data.id),
        status: String(data.status),
        recipientName: String(data.recipient_name),
        body: String(data.body),
        dueAt: String(data.due_at),
      };
    },
  };
}

export function createNoticeScheduleTools(
  catalog: ClassCatalog,
  store: ScheduleHandoffStore,
): AgentTool<JsonObject>[] {
  return [{
    name: 'prepare_notice_schedule',
    description: 'Depois da confirmação, cria um handoff para o celular com aviso de uma turma real. Isso ainda NÃO significa que o celular agendou: status awaiting_device exige abrir o app e aguardar o ACK.',
    risk: 'external',
    inputSchema: z.object({
      classId: z.string().uuid(),
      modelNumber: z.number().int().min(1).max(3),
      recipientName: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(4000),
      dueAt: z.string().datetime(),
    }).strict(),
    approvalMessage(input, context) {
      const body = String(input.body);
      const preview = body.length > 220 ? `${body.slice(0, 217)}…` : body;
      return `Confirmar o agendamento para ${input.recipientName}, em ${formatDueAt(String(input.dueAt), context.timezone)}? “${preview}”`;
    },
    async execute(input, context) {
      const dueAt = String(input.dueAt);
      const dueAtIssue = scheduleDueAtIssue(dueAt, context.now.getTime());
      if (dueAtIssue) return notCreated('invalid_due_at', dueAtIssue);

      const classId = String(input.classId);
      const schoolClass = (await catalog.list(context)).find((item) => item.id === classId);
      if (!schoolClass) return notCreated('class_not_found', 'A turma não existe mais.');
      const recipientName = schoolClass.whatsappGroup?.trim();
      if (!recipientName) return notCreated('recipient_not_configured', 'A turma não possui grupo do WhatsApp configurado.');
      const modelNumber = Number(input.modelNumber);
      const body = templateBody(schoolClass, modelNumber)?.trim();
      if (!body) return notCreated('template_not_configured', `O modelo ${modelNumber} está vazio.`);
      if (recipientName !== input.recipientName || body !== input.body) {
        return notCreated('grounding_mismatch', 'Destinatário ou texto não correspondem aos dados atuais da turma.');
      }

      const stored = await store.create({ recipientName, body, dueAt }, context);
      return {
        created: true,
        handoffId: stored.id,
        status: stored.status,
        recipientName,
        body,
        dueAt,
        ...buildScheduleDeepLinks(stored.code),
      };
    },
    async verify(output, input, context) {
      const result = output as Record<string, JsonValue>;
      if (result.created !== true || typeof result.handoffId !== 'string') {
        return { verified: true, evidence: output };
      }
      const stored = await store.find(result.handoffId, context);
      const verified = Boolean(stored
        && stored.status === 'awaiting_device'
        && stored.recipientName === input.recipientName
        && stored.body === input.body
        && stored.dueAt === input.dueAt);
      return { verified, evidence: stored as unknown as JsonValue };
    },
  }, {
    name: 'get_schedule_status',
    description: 'Consulta no servidor se um handoff ainda aguarda o aparelho, falhou ou recebeu ACK de agendamento local. Use antes de responder se algo foi realmente agendado.',
    risk: 'read',
    inputSchema: z.object({ handoffId: z.string().uuid() }).strict(),
    async execute(input, context) {
      const stored = await store.find(String(input.handoffId), context);
      if (!stored) return { found: false, handoffId: String(input.handoffId) } as JsonObject;
      return {
        found: true,
        handoffId: stored.id,
        status: stored.status,
        recipientName: stored.recipientName,
        dueAt: stored.dueAt,
      } as JsonObject;
    },
  }];
}

function templateBody(schoolClass: Awaited<ReturnType<ClassCatalog['list']>>[number], modelNumber: number) {
  if (modelNumber === 1) return schoolClass.noticeTemplateDirect;
  if (modelNumber === 2) return schoolClass.noticeTemplateMotivational;
  if (modelNumber === 3) return schoolClass.noticeTemplateImpactful;
  return null;
}

function notCreated(errorCode: string, message: string): never {
  throw new AgentToolExecutionError(errorCode, { created: false, errorCode, message });
}

function formatDueAt(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
