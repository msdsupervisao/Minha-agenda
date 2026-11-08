import { join } from 'node:path';
import { runOpenCode } from '../lib/agent/providers/opencode-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';

// Não usa dados da conta nem grava gastos reais.
const executable = process.env.OPENCODE_EXECUTABLE || join(process.env.APPDATA || '', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
const model = process.env.BRIDGE_TEST_MODEL || 'opencode/glm-5.3-flash-free';
const provider = new StructuredTextAgentProvider({ model, generateText: (prompt) => runOpenCode(prompt, { executable, model }) });
async function main() {
const result = await provider.generate({
  instructions: 'Só proponha ação quando os dados estiverem completos. Não invente fatos.',
  messages: [{ role: 'user', content: 'Gastei 60 reais com combustível. Anote.' }],
  tools: [{ name: 'create_expense', description: 'Registrar gasto atual em reais', parameters: { type: 'object', properties: { amount: { type: 'number' }, category: { type: 'string' } }, required: ['amount', 'category'], additionalProperties: false } }],
});
const call = result.toolCalls[0];
if (result.toolCalls.length !== 1 || call.name !== 'create_expense' || call.arguments.amount !== 60 || typeof call.arguments.category !== 'string' || !/combust/i.test(call.arguments.category)) throw new Error('O modelo não interpretou o exemplo como esperado.');
console.log('Exemplo interpretado corretamente. Nenhum gasto foi registrado.');
}
main().catch((error: unknown) => { console.error('Falha no teste da ponte OpenCode:', error instanceof Error ? error.message : 'erro desconhecido'); process.exitCode = 1; });
