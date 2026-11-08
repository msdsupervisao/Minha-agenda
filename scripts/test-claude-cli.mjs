import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^ANTHROPIC_|^CLAUDE_CODE_USE_|^CLAUDE_CODE_OAUTH_TOKEN$|(_API_KEY|_ACCESS_TOKEN|_AUTH_TOKEN|_SECRET|_SECRET_KEY|_PASSWORD)$/i.test(name)) delete env[name];
}
const directory = join(process.cwd(), '.runtime', 'claude-test');
await mkdir(directory, { recursive: true });
const executable = join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe');
const args = ['-p', 'Responda somente OK.', '--model', 'haiku', '--output-format', 'json', '--tools', '', '--setting-sources', '', '--settings', '{"disableAllHooks":true}', '--strict-mcp-config', '--no-session-persistence'];
const result = await new Promise((resolve, reject) => {
  const child = spawn(executable, args, { cwd: directory, env, windowsHide: true, shell: false });
  let stdout = '';
  const timer = setTimeout(() => child.kill(), 60000);
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.resume();
  child.on('error', reject);
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout }); });
});
try {
  const output = JSON.parse(result.stdout);
  if (result.code !== 0 || output.is_error || typeof output.result !== 'string') throw new Error('Resposta indisponível.');
  console.log('Claude respondeu ao teste fictício:', output.result.slice(0, 100));
} catch {
  console.error('Claude não concluiu o teste fictício.');
  process.exitCode = 1;
}
