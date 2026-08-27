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

function schemaFor(tool: AgentTool<JsonObject>): JsonObject {
  const schema = z.toJSONSchema(tool.inputSchema, { target: 'draft-07' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema as JsonObject;
}

function failure(call: AgentToolCall, risk: AgentToolResult['risk'], errorCode: string, output: AgentToolResult['output']): AgentToolResult {
  return { callId: call.callId, toolName: call.name, arguments: call.arguments, status: 'error', output, verified: false, risk, errorCode };
}
