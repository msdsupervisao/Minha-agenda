import type { AssistantAction, OperationalMemory } from './types';

export function requiresConfirmation(action: AssistantAction, _memory: OperationalMemory) {
  if (action.intent === 'send_whatsapp_message' || action.intent === 'schedule_whatsapp_message') return true;
  return action.requiresConfirmation;
}
