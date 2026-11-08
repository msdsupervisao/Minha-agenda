import { join } from 'node:path';
import { emptyAgentContextState } from '../lib/agent/contracts';
import { runOpenCode } from '../lib/agent/providers/opencode-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { runAgentPilot } from '../lib/agent/server-agent';
import type { PersonalAgendaStore, SavedExpense, SavedReminder } from '../lib/data/agent-personal-repository';

async function main() {
  const model = 'opencode/glm-5.3-flash-free';
  const executable = process.env.OPENCODE_EXECUTABLE || join(process.env.APPDATA || '', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
  const provider = new StructuredTextAgentProvider({ model, generateText: (prompt) => runOpenCode(prompt, { executable }) });
  let writes = 0;
  let expense: SavedExpense | null = null;
  let reminder: SavedReminder | null = null;
  const store: PersonalAgendaStore = {
    async agenda() { return { items: [], possiblyTruncated: false }; }, async contacts() { return []; },
    async createNote() { throw new Error('unexpected'); }, async getNote() { return null; },
    async createReminder(_user, title, dueAt) { reminder = { id: 'fake-reminder', title, dueAt, notificationStatus: 'pending' }; return reminder.id; }, async getReminder() { return reminder; },
    async createExpense(_user, input) { writes++; expense = { id: 'fake-expense', ...input }; return expense.id; },
    async getExpense() { return expense; },
  };
  const options = {
    env: { AI_PROVIDER: 'local' }, provider, personalStore: store, catalog: { async list() { return []; } },
    scheduleStore: { async create() { throw new Error('unexpected'); }, async find() { return null; } },
    conversation: [], contextState: emptyAgentContextState(),
  };
  const result = await runAgentPilot({} as never, 'fake', 'Gastei 60 reais com combustível. Anote.', 'voice', 'America/Cuiaba', options);
  if (result.kind !== 'completed' || writes !== 1 || result.toolResults[0]?.arguments.amount !== 60 || !/combust/i.test(String(result.toolResults[0]?.arguments.category))) throw new Error(`Turno não concluído: ${result.kind}.`);
  const fixedNow = new Date('2026-11-06T14:00:00Z');
  const reminderResult = await runAgentPilot({} as never, 'fake', 'Me lembre de ligar para Ana daqui a 30 minutos.', 'voice', 'America/Cuiaba', { ...options, now: fixedNow });
  if (reminderResult.kind !== 'completed' || !reminder || (reminder as SavedReminder).dueAt !== '2026-11-06T14:30:00.000Z') throw new Error(`Lembrete não concluído: ${reminderResult.kind}.`);
  console.log('Gasto e lembrete fictícios concluídos e verificados; nenhum dado real foi gravado.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Falha no teste.'); process.exitCode = 1; });
