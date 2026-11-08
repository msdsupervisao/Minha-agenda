import { join } from 'node:path';
import { runClaude } from '../lib/agent/providers/claude-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';

async function main() {
  const executable = process.env.CLAUDE_EXECUTABLE || join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe');
  const provider = new StructuredTextAgentProvider({ model: 'haiku', generateText: (prompt) => runClaude(prompt, { executable }) });
  const result = await provider.generate({
    instructions: 'Só proponha ação quando os dados estiverem completos. Não invente fatos.',
    messages: [{ role: 'user', content: 'Gastei 60 reais com combustível. Anote.' }],
    tools: [{ name: 'create_expense', description: 'Registrar gasto atual em reais', parameters: { type: 'object', properties: { amount: { type: 'number' }, category: { type: 'string' } }, required: ['amount', 'category'], additionalProperties: false } }],
  });
  const call = result.toolCalls[0];
  if (result.toolCalls.length !== 1 || call.name !== 'create_expense' || call.arguments.amount !== 60 || typeof call.arguments.category !== 'string' || !/combust/i.test(call.arguments.category)) throw new Error('O exemplo não foi interpretado como esperado.');
  console.log('Claude interpretou corretamente o gasto fictício. Nenhum dado foi gravado.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Falha no teste.'); process.exitCode = 1; });
