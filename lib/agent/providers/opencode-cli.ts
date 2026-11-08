import { spawn } from 'node:child_process';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FREE_MODELS = new Set(['opencode/deepseek-v4.1-flash-free', 'opencode/glm-5.3-flash-free', 'opencode/mimo-v2.6-flash-free', 'opencode/nemotron-3.5-lightning-free', 'opencode/big-pickle', 'opencode/flint-40b-free']);
const MAX_OUTPUT = 2_000_000;
function failure(code: string) { return Object.assign(new Error(code), { code }); }

export function openCodePolicy() {
  return { policies: [{ action: 'tool.use', resource: '*', effect: 'deny' }] };
}

export function openCodeArgs(model: string, promptPath: string) {
  return ['run', '--standalone', '--format', 'json', '--agent', 'plan', '-m', model, 'Siga as instruções do arquivo anexado. Retorne somente JSON.', '-f', promptPath];
}

/** Executa apenas o binário v2 do OpenCode. O prompt é um anexo, nunca um comando. */
export async function runOpenCode(prompt: string, options: { executable: string; model?: string; timeoutMs?: number }): Promise<string> {
  const model = options.model || 'opencode/glm-5.3-flash-free';
  if (!options.executable || prompt.length > 160000 || !FREE_MODELS.has(model)) throw failure('opencode_invalid_input');
  const directory = await mkdtemp(join(tmpdir(), 'minha-agenda-ai-'));
  const promptPath = join(directory, 'prompt.txt');
  const configPath = join(directory, 'opencode.json');
  try {
    await writeFile(promptPath, prompt, { encoding: 'utf8', mode: 0o600 });
    // V2: políticas negam ferramentas mesmo quando uma regra as permitiria.
    await writeFile(configPath, JSON.stringify(openCodePolicy()), { encoding: 'utf8', mode: 0o600 });
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/(_API_KEY|_ACCESS_TOKEN|_SECRET_KEY|_SECRET|_PASSWORD)$/i.test(key)) delete env[key];
    }
    const output = await execute(options.executable, openCodeArgs(model, promptPath), directory, env, options.timeoutMs ?? 120000);
    return parseEvents(output);
  } finally {
    await unlink(promptPath).catch(() => undefined);
    await unlink(configPath).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}

function execute(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill();
    };
    const timer = setTimeout(stop, Math.max(1000, Math.min(timeoutMs, 720000)));
    child.stdout.on('data', (chunk: string) => { stdout += chunk; if (stdout.length > MAX_OUTPUT) stop(); });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; if (stderr.length > MAX_OUTPUT) stop(); });
    child.on('error', () => { clearTimeout(timer); reject(failure('opencode_not_available')); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stopped) return reject(failure('opencode_timeout_or_output_limit'));
      if (code !== 0) {
        const reason = /FreeUsageLimitError|"provider\.quota"/.test(stdout + stderr) ? 'opencode_free_limit' : 'opencode_failed';
        return reject(failure(reason));
      }
      resolve(stdout);
    });
  });
}

export function parseEvents(output: string): string {
  let result = '';
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: { type?: string; part?: { text?: unknown }; error?: unknown };
    try { event = JSON.parse(line); } catch { throw failure('opencode_invalid_output'); }
    if (event.type === 'error' || event.type === 'tool_use') throw failure('opencode_unexpected_event');
    if (event.type === 'text' && typeof event.part?.text === 'string') result += event.part.text;
  }
  if (!result.trim()) throw failure('opencode_empty_response');
  return result.trim();
}
