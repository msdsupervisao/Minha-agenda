import { BackendActionInterpreter } from './backend-action-interpreter';
import { ConversationEngine } from './conversation-engine';
import { browserTimezone } from '../data/time';
import type { ActivityItem, AssistantAction, EngineResult, Source } from './types';

export type DataProviderName = 'local' | 'supabase';

export interface ConversationClient {
  activities(): Promise<ActivityItem[]>;
  process(text: string, source: Source): Promise<EngineResult>;
  confirm(action?: AssistantAction, source?: Source): Promise<EngineResult>;
  cancelConfirmation(): Promise<EngineResult>;
}

export function createConversationClient(provider: DataProviderName): ConversationClient {
  return provider === 'supabase' ? new SupabaseConversationClient() : new LocalConversationClient();
}

class LocalConversationClient implements ConversationClient {
  private engine = new ConversationEngine(undefined, undefined, new BackendActionInterpreter(), browserTimezone());
  async activities() { return this.engine.activities(); }
  process(text: string, source: Source) { return this.engine.process(text, source); }
  confirm(action?: AssistantAction, source: Source = 'text') { return this.engine.confirm(action, source); }
  async cancelConfirmation() { return this.engine.cancelConfirmation(); }
}

class SupabaseConversationClient implements ConversationClient {
  async activities() {
    const response = await fetch('/api/assistant/bootstrap', { cache: 'no-store' });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(String(payload.error || 'Não foi possível carregar sua memória.'));
    return Array.isArray(payload.activities) ? payload.activities as ActivityItem[] : [];
  }

  async process(text: string, source: Source) {
    const response = await fetch('/api/assistant/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, source }),
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(String(payload.error || 'Não foi possível acessar sua memória.'));
    return payload as unknown as EngineResult;
  }

  confirm(_action?: AssistantAction, source: Source = 'text') { return this.process('Confirmo', source); }
  cancelConfirmation() { return this.process('Cancelar', 'text'); }
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}
