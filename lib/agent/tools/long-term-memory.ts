import { z } from 'zod';
import type { PersonalAgendaStore } from '@/lib/data/agent-personal-repository';
import type { AgentTool, JsonObject } from '../contracts';

const memoryKind = z.enum(['preference', 'fact', 'entity', 'alias', 'routine']);

export function createLongTermMemoryTools(store: PersonalAgendaStore): AgentTool<JsonObject>[] {
  return [
    { name: 'list_long_term_memory', description: 'Lista memórias duradouras autorizadas sobre o próprio usuário. Use quando ele perguntar o que você lembra; não inclua segredos, dados sensíveis ou fatos de terceiros.', risk: 'read', inputSchema: z.object({}).strict(), async execute(_input, context) { if (!store.listLongTermMemory) throw new Error('memory_unavailable'); const list = store.listLongTermMemory; return { memories: await list(context.userId) }; } },
    { name: 'remember_user_fact', description: 'Guarda uma preferência ou fato duradouro que o usuário declarou explicitamente sobre si mesmo. Nunca guarde segredos, credenciais, dados sensíveis, terceiros, estado temporário ou mapeamentos de frase para ação.', risk: 'low', inputSchema: z.object({ kind: memoryKind, content: z.string().trim().min(1).max(500) }).strict(), async execute(input, context) { if (!store.addLongTermMemory) throw new Error('memory_unavailable'); const add = store.addLongTermMemory; const content = String(input.content); if (containsSecretLikeValue(content)) throw new Error('memory_sensitive_content'); return add(context.userId, { kind: String(input.kind) as 'preference' | 'fact' | 'entity' | 'alias' | 'routine', content, origin: 'explicit_user' }); }, async verify(output) { return { verified: Boolean(output && typeof output === 'object' && !Array.isArray(output) && typeof output.id === 'string'), evidence: output }; } },
    { name: 'forget_user_memory', description: 'Apaga uma memória duradoura específica depois que o usuário confirmar o que deseja esquecer. Não apague todas as memórias sem pedido explícito.', risk: 'destructive', inputSchema: z.object({ id: z.string().uuid() }).strict(), approvalMessage: () => 'Confirma que devo esquecer essa memória?', async execute(input, context) { if (!store.deleteLongTermMemory) throw new Error('memory_unavailable'); const remove = store.deleteLongTermMemory; const id = String(input.id); return { id, deleted: await remove(context.userId, id) }; }, async verify(output) { return { verified: Boolean(output && typeof output === 'object' && !Array.isArray(output) && output.deleted === true), evidence: output }; } },
  ];
}
function containsSecretLikeValue(content: string) { return /(senha|password|token|api[_ -]?key|chave secreta|secret)/i.test(content); }
