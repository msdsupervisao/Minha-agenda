import { spawn } from 'node:child_process';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_OUTPUT = 2_000_000;
const errorWithCode = (code: string) => Object.assign(new Error(code), { code });

export function claudeArgs(model = 'haiku') {
  return ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--strict-mcp-config', '--no-session-persistence'];
}

export function parseClaudeOutput(raw: string): string {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw errorWithCode('claude_invalid_output'); }
  if (!value || typeof value !== 'object') throw errorWithCode('claude_invalid_output');
  const output = value as Record<string, unknown>;
  if (output.is_error === true) {
    const message = typeof output.result === 'string' ? output.result : '';
    if (/login|log in|sign in|authenticat/i.test(message)) throw errorWithCode('claude_not_logged_in');
    if (/limit|quota|rate|usage/i.test(message)) throw errorWithCode('claude_usage_limit');
    throw errorWithCode('claude_failed');
  }
  if (typeof output.result !== 'string' || !output.result.trim()) throw errorWithCode('claude_empty_response');
  return output.result.trim();
}

/** Usa o login local. O prompt segue por stdin; nenhuma ferramenta é autorizada. */
export async function runClaude(prompt: string, options: { executable: string; model?: string; timeoutMs?: number }): Promise<string> {
  const model = options.model || 'haiku';
  if (!options.executable || prompt.length > 160000 || !['haiku', 'sonnet', 'opus'].includes(model)) throw errorWithCode('claude_invalid_input');
  const directory = await mkdtemp(join(tmpdir(), 'minha-agenda-claude-'));
  try {
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (/^ANTHROPIC_|^CLAUDE_CODE_USE_|^CLAUDE_CODE_OAUTH_TOKEN$|^CLAUDE_CONFIG_DIR$|(_API_KEY|_ACCESS_TOKEN|_AUTH_TOKEN|_SECRET|_SECRET_KEY|_PASSWORD)$/i.test(name)) delete env[name];
    }
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(options.executable, claudeArgs(model), { cwd: directory, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      let errors = '';
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
      const timer = setTimeout(stop, Math.max(1000, Math.min(options.timeoutMs ?? 120000, 720000)));
      child.stdout.on('data', (chunk: string) => { output += chunk; if (output.length > MAX_OUTPUT) stop(); });
      child.stderr.on('data', (chunk: string) => { errors += chunk; if (errors.length > MAX_OUTPUT) stop(); });
      child.stdin.on('error', () => { /* O fechamento do processo é tratado abaixo. */ });
      child.stdin.end(prompt, 'utf8');
      child.on('error', () => { clearTimeout(timer); reject(errorWithCode('claude_not_available')); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (stopped) return reject(errorWithCode('claude_timeout'));
        // Erros da sessão podem vir em JSON mesmo com código de saída diferente de zero.
        if (code !== 0) {
          if (output.trim()) {
            try { parseClaudeOutput(output); } catch (error) { return reject(error); }
          }
          return reject(errorWithCode('claude_failed'));
        }
        resolve(output);
      });
    });
    return parseClaudeOutput(stdout);
  } finally { await rmdir(directory).catch(() => undefined); }
}
