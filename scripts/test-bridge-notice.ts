import { join } from 'node:path';
import { emptyAgentContextState } from '../lib/agent/contracts';
import { createBridgeNoticeComposer } from '../lib/agent/bridge-notice';
import { runOpenCode } from '../lib/agent/providers/opencode-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { runAgentPilot } from '../lib/agent/server-agent';
import type { SchoolClass } from '../lib/assistant/types';
import type { ScheduleHandoffStore } from '../lib/agent/tools/notice-schedule';

async function main() {
  const model = 'opencode/glm-5.3-flash-free';
  const executable = process.env.OPENCODE_EXECUTABLE || join(process.env.APPDATA || '', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
  const generateText = (prompt: string) => runOpenCode(prompt, { executable, model });
  const provider = new StructuredTextAgentProvider({ model, generateText });
  const schoolClass: SchoolClass = { id: 'cfc4f48c-f2d2-430e-9bdf-76987ef8a52b', userId: 'fake', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', name: 'Design Gráfico Quarta', course: 'Design Gráfico', schedule: 'quarta às 19h', teacher: null, notes: null, whatsappGroup: 'Design Quarta', noticeTemplateDirect: null, noticeTemplateMotivational: null, noticeTemplateImpactful: null };
  let created: { id: string; status: string; recipientName: string; body: string; dueAt: string } | null = null;
  const scheduleStore: ScheduleHandoffStore = {
    async create(draft) { created = { id: 'fake-handoff', status: 'awaiting_device', ...draft }; return { ...created, code: 'AAAAAAAAAAAAAAAAAAAAAA' }; },
    async find() { return created; },
  };
  const options = { env: { AI_PROVIDER: 'local' }, provider, catalog: { async list() { return [schoolClass]; } }, scheduleStore, conversation: [], contextState: emptyAgentContextState(), now: new Date('2026-11-06T14:00:00Z'), noticeComposer: createBridgeNoticeComposer(generateText) };
  const text = 'Prepare um aviso para a turma Design Gráfico Quarta dizendo que a aula será quarta às 19h e agende para me avisar terça-feira às 14h.';
  const pending = await runAgentPilot({} as never, 'fake', text, 'voice', 'America/Cuiaba', options);
  if (pending.kind !== 'approval_required' || created) throw new Error(`Aviso não aguardou confirmação: ${pending.kind}.`);
  const result = await runAgentPilot({} as never, 'fake', text, 'voice', 'America/Cuiaba', { ...options, resume: { pendingCalls: pending.pendingCalls, continuation: pending.continuation } });
  if (!created || (created as { dueAt: string }).dueAt !== '2026-11-10T18:00:00.000Z' || !result.toolResults.some((item) => item.toolName === 'prepare_notice_schedule' && item.verified)) throw new Error(`Handoff fictício não foi verificado: ${result.kind}.`);
  console.log('Aviso fictício preparado e confirmado; nenhum WhatsApp foi aberto ou mensagem enviada.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Falha no teste.'); process.exitCode = 1; });
