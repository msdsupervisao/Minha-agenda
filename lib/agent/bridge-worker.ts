import { z } from 'zod';
import type { AgentRunResult, AgentToolCall } from './contracts';
import type { BridgeInput, BridgeJob } from './bridge-queue';

type Queue = {
  claim(): Promise<BridgeJob | null>;
  finish(job: BridgeJob, status: 'completed' | 'failed' | 'approval_required', result: Record<string, unknown>): Promise<void>;
};
type Resume = { pendingCalls: AgentToolCall[]; continuation: unknown };
const previousApproval = z.object({
  kind: z.literal('approval_required'),
  pendingCalls: z.array(z.object({ callId: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.unknown()) }).strict()).min(1).max(4),
  continuation: z.unknown(),
}).passthrough();

/** Nunca reexecuta um trabalho reservado após erro ou desconexão. */
export async function processNextBridgeJob(queue: Queue, run: (input: BridgeInput, resume?: Resume) => Promise<AgentRunResult>): Promise<boolean> {
  const job = await queue.claim();
  if (!job) return false;
  let result: AgentRunResult;
  try {
    let resume: Resume | undefined;
    if (job.approved) {
      const parsed = previousApproval.parse(job.priorResult);
      resume = { pendingCalls: parsed.pendingCalls as AgentToolCall[], continuation: parsed.continuation };
    }
    result = await run(job.input, resume);
  } catch {
    await queue.finish(job, 'failed', { kind: 'failed', reply: 'A execução foi interrompida. Confira seus registros antes de tentar novamente.', errorCode: 'bridge_execution_failed' });
    return true;
  }
  const status = result.kind === 'approval_required' ? 'approval_required' : result.kind === 'failed' ? 'failed' : 'completed';
  await queue.finish(job, status, JSON.parse(JSON.stringify(result)) as Record<string, unknown>);
  return true;
}
