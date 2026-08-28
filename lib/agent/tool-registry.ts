import { z } from 'zod';
import { ApprovalPolicy } from './approval-policy';
import type {
  AgentExecutionContext,
  AgentTool,
  AgentToolCall,
  AgentToolDescriptor,
  AgentToolResult,
  JsonObject,
} from './contracts';
import { resolveRisk, ToolVerifier } from './verifier';

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool<JsonObject>>();

  constructor(
    tools: AgentTool<JsonObject>[] = [],
    private readonly policy = new ApprovalPolicy(),
    private readonly verifier = new ToolVerifier(),
  ) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: AgentTool<JsonObject>) {
    if (this.tools.has(tool.name)) throw new Error(`Ferramenta duplicada: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  descriptors(): AgentToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: schemaFor(tool),
    }));
  }

  async execute(
    call: AgentToolCall,
    context: AgentExecutionContext,
    approvedCallIds: ReadonlySet<string> = new Set(),
  ): Promise<AgentToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) return failure(call, 'read', 'unknown_tool', 'Ferramenta não registrada.');

    const parsed = tool.inputSchema.safeParse(call.arguments);
    if (!parsed.success) {
      return failure(call, 'read', 'invalid_arguments', {
        message: 'Os argumentos da ferramenta são inválidos.',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    const input = parsed.data;
    const risk = resolveRisk(tool, input, context);
    const decision = this.policy.assess({
      call,
      risk,
      approvedCallIds,
      context,
      approvalMessage: tool.approvalMessage,
    });

    if (decision.kind === 'denied') {
      return { callId: call.callId, toolName: call.name, arguments: call.arguments, status: 'denied', output: { message: decision.reason }, verified: false, risk, errorCode: 'policy_denied' };
    }
    if (decision.kind === 'approval_required') {
      return {
        callId: call.callId,
        toolName: call.name,
        arguments: call.arguments,
        status: 'approval_required',
        output: { message: decision.message },
        verified: false,
        risk,
        approvalMessage: decision.message,
      };
    }

    try {
      const output = await tool.execute(input, context);
      const verification = await this.verifier.verify(tool, output, input, context);
      if (!verification.verified) {
        return {
          callId: call.callId,
          toolName: call.name,
          arguments: call.arguments,
          status: 'error',
          output,
          verified: false,
          risk,
          errorCode: 'verification_failed',
          evidence: verification.evidence,
        };
      }
      return {
        callId: call.callId,
        toolName: call.name,
        arguments: call.arguments,
        status: 'success',
        output,
        verified: true,
        risk,
        evidence: verification.evidence,
      };
    } catch (error) {
      if (error instanceof AgentToolExecutionError) {
        return failure(call, risk, error.errorCode, error.output);
      }
      return failure(call, risk, 'tool_execution_failed', 'A ferramenta falhou durante a execução.');
    }
  }
}

export class AgentToolExecutionError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly output: AgentToolResult['output'],
  ) {
    super(errorCode);
    this.name = 'AgentToolExecutionError';
  }
}

// O modo strict aceita apenas um subconjunto de JSON Schema. Removemos somente
// palavras-chave fora desse subconjunto e preservamos restrições documentadas
// como pattern, format, minimum/maximum, multipleOf e minItems/maxItems.
// minLength/maxLength continuam fora do descriptor porque foram incompatíveis
// com o contrato de ferramentas observado neste projeto. A validação completa
// permanece no Zod (inputSchema.safeParse em execute).
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
  'minLength', 'maxLength',
  'allOf', 'oneOf', 'not', 'dependentRequired', 'dependentSchemas', 'if', 'then', 'else',
  'uniqueItems', 'contains', 'minContains', 'maxContains',
  'minProperties', 'maxProperties', 'patternProperties', 'propertyNames',
  'unevaluatedItems', 'unevaluatedProperties', 'default',
]);

function schemaFor(tool: AgentTool<JsonObject>): JsonObject {
  const schema = z.toJSONSchema(tool.inputSchema, { target: 'draft-07' }) as Record<string, unknown>;
  delete schema.$schema;
  return stripStrictUnsupported(schema) as JsonObject;
}

// Percorre o schema como schema (não confunde nomes de propriedade com keywords):
// remove keywords não suportadas e recursa apenas em posições que contêm subschemas.
function stripStrictUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripStrictUnsupported);
  if (!node || typeof node !== 'object') return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === 'properties' || key === '$defs' || key === 'definitions') {
      result[key] = mapSchemaValues(value);
    } else if (key === 'anyOf' || key === 'allOf' || key === 'oneOf' || key === 'items') {
      result[key] = stripStrictUnsupported(value);
    } else if (key === 'additionalProperties' || key === 'not') {
      result[key] = stripStrictUnsupported(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function mapSchemaValues(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = stripStrictUnsupported(entry);
  }
  return out;
}

function failure(call: AgentToolCall, risk: AgentToolResult['risk'], errorCode: string, output: AgentToolResult['output']): AgentToolResult {
  return { callId: call.callId, toolName: call.name, arguments: call.arguments, status: 'error', output, verified: false, risk, errorCode };
}
