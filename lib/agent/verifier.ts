import type { AgentExecutionContext, AgentTool, JsonObject, JsonValue, ToolVerification } from './contracts';

export class ToolVerifier {
  async verify(
    tool: AgentTool<JsonObject>,
    output: JsonValue,
    input: JsonObject,
    context: AgentExecutionContext,
  ): Promise<ToolVerification> {
    if (tool.verify) return tool.verify(output, input, context);

    // Leituras são verificadas pelo próprio retorno da fonte. Qualquer ação que
    // possa alterar estado precisa declarar uma verificação explícita.
    if (resolveRisk(tool, input, context) === 'read') return { verified: true, evidence: output };
    return { verified: false };
  }
}
export function resolveRisk(tool: AgentTool<JsonObject>, input: JsonObject, context: AgentExecutionContext) {
  return typeof tool.risk === 'function' ? tool.risk(input, context) : tool.risk;
}
