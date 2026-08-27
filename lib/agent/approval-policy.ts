import type { AgentExecutionContext, AgentToolCall, JsonObject, ToolRisk } from './contracts';

export type ApprovalDecision =
  | { kind: 'execute' }
  | { kind: 'approval_required'; message: string }
  | { kind: 'denied'; reason: string };

export class ApprovalPolicy {
  assess(input: {
    call: AgentToolCall;
    risk: ToolRisk;
    approvedCallIds: ReadonlySet<string>;
    context: AgentExecutionContext;
    approvalMessage?: (args: JsonObject, context: AgentExecutionContext) => string;
  }): ApprovalDecision {
    if (input.risk === 'critical') {
      return { kind: 'denied', reason: 'Esta ferramenta foi bloqueada pela política de segurança.' };
    }

    if (input.risk === 'external' || input.risk === 'destructive') {
      if (input.approvedCallIds.has(input.call.callId)) return { kind: 'execute' };
      return {
        kind: 'approval_required',
        message: input.approvalMessage?.(input.call.arguments, input.context)
          || `Confirma a execução de ${input.call.name}?`,
      };
    }

    return { kind: 'execute' };
  }
}
