import assert from 'node:assert/strict';
import test from 'node:test';
import { openCodeArgs, openCodePolicy, parseEvents } from '../lib/agent/providers/opencode-cli';

test('usa plan padrão e bloqueia ferramentas por política', () => {
  assert.deepEqual(openCodePolicy(), { policies: [{ action: 'tool.use', resource: '*', effect: 'deny' }] });
  const args = openCodeArgs('opencode/glm-5.3-flash-free', 'prompt.txt');
  assert.deepEqual(args.slice(args.indexOf('--agent'), args.indexOf('--agent') + 2), ['--agent', 'plan']);
  assert.deepEqual(args.slice(-2), ['-f', 'prompt.txt']);
  assert.equal(args.includes('--auto'), false);
});

test('extrai texto do fluxo JSON e rejeita ferramentas e saída inválida', () => {
  assert.equal(parseEvents('{"type":"step_start"}\n{"type":"text","part":{"text":"{\\"ok\\":true}"}}\n'), '{"ok":true}');
  assert.throws(() => parseEvents('{"type":"tool_use"}'), /unexpected_event/);
  assert.throws(() => parseEvents('dados inválidos'), /invalid_output/);
  assert.throws(() => parseEvents('{"type":"step_start"}'), /empty_response/);
});
