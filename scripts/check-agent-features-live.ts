import { getAiRuntimeConfig } from '../lib/assistant/ai-config';
import { OmniRouteAgentProvider } from '../lib/agent/providers/omniroute-provider';
import { AgentOrchestrator } from '../lib/agent/orchestrator';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { createCourseKnowledgeTools } from '../lib/agent/tools/course-knowledge';
import { createWeatherTools } from '../lib/agent/tools/weather';
import { emptyAgentContextState } from '../lib/agent/contracts';

async function main() {
  const config = getAiRuntimeConfig();
  if (!config.apiKey || config.activeProvider !== 'omniroute') throw new Error('Configure OmniRoute para este teste.');
  const tests = ['Quais ferramentas posso usar para editar vídeos para YouTube?', 'Quem é o Tiozão Gamer?', 'Qual a temperatura agora em Sorriso, Mato Grosso?'];
  for (const text of tests) {
    const provider = new OmniRouteAgentProvider({ apiKey: config.apiKey, baseURL: config.baseUrl, model: config.model,
      fallbackModels: config.fallbackModels, timeoutMs: config.timeoutMs });
    const result = await new AgentOrchestrator(provider, new ToolRegistry([...createCourseKnowledgeTools(), ...createWeatherTools()])).run({
      text, context: { userId: 'read-only-smoke-test', source: 'text', now: new Date(), timezone: 'America/Cuiaba', state: emptyAgentContextState() },
    });
    console.log(JSON.stringify({ text, kind: result.kind, reply: result.reply, tools: result.toolResults.map((tool) => tool.toolName) }));
    if (result.kind !== 'completed' || (text.includes('editar') && /tioz[aã]o/i.test(result.reply))) process.exitCode = 1;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
void main();
