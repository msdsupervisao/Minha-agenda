import { getAiRuntimeConfig } from '../lib/assistant/ai-config';
import { interpretOnServer } from '../lib/assistant/ai-runtime';

async function main() {
  const config = getAiRuntimeConfig();

  if (config.activeProvider !== 'openai' || !config.apiKey) {
    console.error('Teste OpenAI real não executado: defina AI_PROVIDER=openai e OPENAI_API_KEY no ambiente do servidor.');
    process.exitCode = 1;
    return;
  }

  const now = new Date('2026-08-19T12:00:00-04:00');
  const cases = [
    { text: 'Gastei trinta reais em combustível.', expected: 'create_expense' },
    { text: 'Me lembra amanhã às nove de falar com o João.', expected: 'create_reminder' },
  ] as const;

  for (const item of cases) {
    const result = await interpretOnServer({
      text: item.text,
      now,
      timezone: process.env.APP_TIMEZONE || 'America/Cuiaba',
      context: { turns: [], source: 'text' },
    }, { config });

    if (result.provider !== 'openai') throw new Error(`Provider inesperado: ${result.provider}`);
    if (result.action?.intent !== item.expected) {
      throw new Error(`Intent inesperado para o caso testado: esperado ${item.expected}, recebido ${result.action?.intent || 'vazio'}.`);
    }
    console.log(JSON.stringify({
      provider: result.provider,
      model: result.model,
      intent: result.action.intent,
      confidence: result.action.confidence,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha desconhecida no teste OpenAI real.');
  process.exitCode = 1;
});
