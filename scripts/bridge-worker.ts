import { createClient } from '@supabase/supabase-js';
import { join } from 'node:path';
import { BridgeQueue } from '../lib/agent/bridge-queue';
import { processNextBridgeJob } from '../lib/agent/bridge-worker';
import { createBridgeNoticeComposer } from '../lib/agent/bridge-notice';
import { persistAgentTurn } from '../lib/agent/context-builder';
import { runOpenCode } from '../lib/agent/providers/opencode-cli';
import { runClaude } from '../lib/agent/providers/claude-cli';
import { StructuredTextAgentProvider } from '../lib/agent/providers/structured-text';
import { runAgentPilot } from '../lib/agent/server-agent';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.BRIDGE_EMAIL;
  const password = process.env.BRIDGE_PASSWORD;
  if (!url || !key || !email || !password) throw new Error('Defina a configuração pública do Supabase e as credenciais da conta para iniciar a ponte.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  delete process.env.BRIDGE_PASSWORD;
  if (error || !data.user) throw new Error('Não consegui entrar na conta da agenda.');
  client.auth.startAutoRefresh();
  const userId = data.user.id;
  const queue = new BridgeQueue(client);
  const useClaude = process.env.BRIDGE_PROVIDER === 'claude';
  const model = process.env.BRIDGE_MODEL || (useClaude ? 'haiku' : 'opencode/glm-5.3-flash-free');
  const executable = useClaude
    ? process.env.CLAUDE_EXECUTABLE || join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe')
    : process.env.OPENCODE_EXECUTABLE || join(process.env.APPDATA || '', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
  const generateText = (prompt: string) => useClaude ? runClaude(prompt, { executable, model }) : runOpenCode(prompt, { executable, model });
  const provider = new StructuredTextAgentProvider({ model, generateText });
  let heartbeatInProgress = false;
  async function heartbeat() {
    if (heartbeatInProgress) return;
    heartbeatInProgress = true;
    try {
      const { error: heartbeatError } = await client.rpc('agent_bridge_heartbeat');
      if (heartbeatError) console.error('Não consegui atualizar a presença da ponte.');
    } catch { console.error('Não consegui atualizar a presença da ponte.'); }
    finally { heartbeatInProgress = false; }
  }
  await heartbeat();
  const heartbeatTimer = setInterval(() => { void heartbeat(); }, 15_000);
  console.log('Conta autenticada. A ponte está consultando a fila de pedidos.');
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  while (!stopping) {
    try {
      const worked = await processNextBridgeJob(queue, async (input, resume) => {
        const result = await runAgentPilot(client, userId, input.text, input.source, input.timezone, {
          env: { AI_PROVIDER: 'local' }, provider, resume, weatherLocation: input.weatherLocation,
          noticeComposer: createBridgeNoticeComposer(generateText),
        });
        // A falha da memória não deve transformar uma ação já verificada em uma nova tentativa.
        await persistAgentTurn(client, userId, { userText: resume ? 'Confirmo.' : input.text, result }).catch(() => console.error('Não consegui atualizar o histórico da conversa.'));
        return result;
      });
      if (!worked) await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch {
      console.error('Ponte temporariamente indisponível. Tentando consultar a fila novamente.');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  clearInterval(heartbeatTimer);
  await client.auth.signOut();
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Não foi possível iniciar a ponte.'); process.exitCode = 1; });
