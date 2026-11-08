import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeArgs, parseClaudeOutput } from '../lib/agent/providers/claude-cli';

test('Claude usa saída JSON sem ferramentas, MCP externo, hooks ou persistência', () => {
  const args = claudeArgs();
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--no-session-persistence'));
  assert.match(args[args.indexOf('--settings') + 1], /disableAllHooks/);
  assert.equal(parseClaudeOutput('{"is_error":false,"result":"OK"}'), 'OK');
  assert.throws(() => parseClaudeOutput('{"is_error":true,"result":"usage limit"}'), /claude_usage_limit/);
  assert.throws(() => parseClaudeOutput('texto inválido'), /claude_invalid_output/);
});
