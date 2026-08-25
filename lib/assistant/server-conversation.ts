import type { SupabaseClient } from '@supabase/supabase-js';
import { getAiRuntimeConfig } from './ai-config';
import { interpretOnServer, type ServerInterpretationResult } from './ai-runtime';
import { ConversationEngine } from './conversation-engine';
import { volatileMemoryRepository } from './memory';
import { MockWhatsAppService } from './whatsapp-service';
import { CloudWhatsAppService, whatsappCloudConfig } from './whatsapp-cloud';
import type { ActionInterpreter, Source } from './types';
import { SupabaseMemoryRepository } from '@/lib/data/supabase-memory-repository';
import { appTimezone } from '@/lib/data/time';
import { listClasses } from '@/lib/data/classes-repository';
import { combineDateTime, parseDate, parseRelativeDateTime, parseTime } from './parsing';
import { isWeeklyNoticeCommand, requestedNoticeModelNumber, resolveWeeklyNotice } from '@/lib/notices/weekly';
import type { AssistantAction } from './types';

export async function runPersistentConversation(
  client: SupabaseClient,
  userId: string,
  text: string,
  source: Source,
  timezone = appTimezone(),
) {
  const persistent = new SupabaseMemoryRepository(client, userId);
  const before = await persistent.load();
  const local = volatileMemoryRepository(structuredClone(before));
  let aiResult: ServerInterpretationResult | null = null;
  let savedNoticeAction: AssistantAction | null = null;

  if (isWeeklyNoticeCommand(text)) {
    const weeklyNotice = resolveWeeklyNotice(await listClasses(client, userId), text);
    const modelNumber = requestedNoticeModelNumber(text);
    if (!weeklyNotice || !modelNumber) {
      const reply = weeklyNotice
        ? `Encontrei os três modelos de ${weeklyNotice.className}. Escolha o modelo 1, 2 ou 3.`
        : 'Não encontrei essa turma nos avisos semanais. Cadastre ou ajuste o nome em Turmas.';
      local.update((memory) => { memory.pendingQuestion = null; });
      local.addTurn('user', text);
      local.addTurn('assistant', reply);
      await persistent.persist(before, local.read());
      return {
        kind: weeklyNotice ? 'question' as const : 'error' as const,
        reply,
        action: null,
        activities: local.activities(),
        weeklyNotice: weeklyNotice || undefined,
        provider: 'local' as const,
        providerNotice: 'Modelos semanais salvos.',
      };
    }

    const selectedModel = weeklyNotice.models.find((model) => model.number === modelNumber);
    if (!selectedModel?.body) {
      const reply = `O modelo ${modelNumber} de ${weeklyNotice.className} ainda está vazio. Edite essa turma antes de agendar.`;
      local.update((memory) => { memory.pendingQuestion = null; });
      local.addTurn('user', text);
      local.addTurn('assistant', reply);
      await persistent.persist(before, local.read());
      return { kind: 'error' as const, reply, action: null, activities: local.activities(), provider: 'local' as const, providerNotice: 'Modelos semanais salvos.' };
    }

    const now = new Date();
    const relativeDate = parseRelativeDateTime(text, now);
    const date = parseDate(text, now, timezone);
    const dueAt = relativeDate?.toISOString() || (date ? combineDateTime(date, parseTime(text), timezone) : null);
    savedNoticeAction = {
      id: crypto.randomUUID(),
      intent: 'schedule_whatsapp_message',
      title: `Mensagem ${modelNumber} de ${weeklyNotice.className}`,
      summary: '',
      requiresConfirmation: true,
      data: {
        recipientName: weeklyNotice.recipientName,
        body: selectedModel.body,
        dueAt,
        noticeModelNumber: modelNumber,
        noticeClassName: weeklyNotice.className,
      },
    };
    local.update((memory) => { memory.pendingQuestion = null; });
  }

  const interpreter: ActionInterpreter = {
    async interpret(input, context) {
      if (savedNoticeAction) {
        const action = savedNoticeAction;
        savedNoticeAction = null;
        return { action, provider: 'local', notice: 'Modelo semanal carregado.' };
      }
      aiResult = await interpretOnServer({
        text: input,
        now: new Date(),
        timezone,
        context,
      }, { config: getAiRuntimeConfig() });
      return aiResult;
    },
  };
  const cloudConfig = whatsappCloudConfig();
  const whatsapp = cloudConfig ? new CloudWhatsAppService(local, cloudConfig) : new MockWhatsAppService(local);
  const engine = new ConversationEngine(local, whatsapp, interpreter, timezone);
  const result = await engine.process(text, source);
  const after = local.read();
  await persistent.persist(before, after);
  if (aiResult) {
    try { await persistent.recordAiUsage(aiResult); }
    catch (error) {
      console.error('[minha-agenda:ai-usage]', JSON.stringify({ timestamp: new Date().toISOString(), result: 'error', error: error instanceof Error ? error.message : 'unknown' }));
    }
  }
  return result;
}

export async function loadPersistentActivities(client: SupabaseClient, userId: string) {
  const persistent = new SupabaseMemoryRepository(client, userId);
  const memory = await persistent.load();
  return volatileMemoryRepository(memory).activities();
}
