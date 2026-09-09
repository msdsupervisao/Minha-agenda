import { createWeatherTools } from '../lib/agent/tools/weather';
import { emptyAgentContextState } from '../lib/agent/contracts';

async function main() {
  const result = await createWeatherTools()[0].execute({ city: 'Sorriso', region: 'Mato Grosso' }, {
    userId: 'weather-smoke-test', source: 'text', now: new Date(), timezone: 'America/Cuiaba', state: emptyAgentContextState(),
  }) as Record<string, unknown>;
  console.log(JSON.stringify(result, null, 2));
  if (result.available !== true) process.exitCode = 1;
}
void main();
