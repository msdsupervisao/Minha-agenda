import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/data/time';

export const BridgeInputSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  source: z.enum(['voice', 'text']),
  timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido.'),
  weatherLocation: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().optional(),
}).strict();
export type BridgeInput = z.infer<typeof BridgeInputSchema>;
export type BridgeJob = { id: string; input: BridgeInput; claimToken: string; approved: boolean; priorResult: unknown };

/** Usa a sessão do próprio usuário, nunca uma chave de serviço no computador. */
export class BridgeQueue {
  constructor(private readonly client: SupabaseClient) {}

  async enqueue(requestId: string, input: BridgeInput): Promise<string> {
    z.string().uuid().parse(requestId);
    const parsed = BridgeInputSchema.parse(input);
    const { data, error } = await this.client.rpc('agent_bridge_enqueue', { p_request_id: requestId, p_input: parsed });
    if (error || typeof data !== 'string') throw new Error('bridge_enqueue_failed');
    return data;
  }

  async claim(): Promise<BridgeJob | null> {
    const { data, error } = await this.client.rpc('agent_bridge_claim');
    if (error) throw new Error('bridge_claim_failed');
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as Record<string, unknown>;
    const id = z.string().uuid().parse(row.id);
    const claimToken = z.string().uuid().parse(row.claim_token);
    return { id, claimToken, input: BridgeInputSchema.parse(row.input), approved: row.approved === true, priorResult: row.prior_result };
  }

  async finish(job: Pick<BridgeJob, 'id' | 'claimToken'>, status: 'completed' | 'failed' | 'approval_required', result: Record<string, unknown>) {
    const { data, error } = await this.client.rpc('agent_bridge_finish', { p_id: job.id, p_claim_token: job.claimToken, p_status: status, p_result: result });
    if (error || data !== true) throw new Error('bridge_finish_failed');
  }

  async decide(id: string, decision: 'approve' | 'cancel') {
    z.string().uuid().parse(id);
    const { data, error } = await this.client.rpc('agent_bridge_decide', { p_id: id, p_decision: decision });
    if (error) throw new Error('bridge_decision_unavailable');
    if (data !== true) throw new Error('bridge_decision_not_pending');
  }
}
