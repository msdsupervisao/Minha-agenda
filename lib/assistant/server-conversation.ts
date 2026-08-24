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
  const interpreter: ActionInterpreter = {
    async interpret(input, context) {
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
