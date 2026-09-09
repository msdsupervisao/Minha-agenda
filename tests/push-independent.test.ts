import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('push sem identificador não reutiliza etiqueta de outra tarefa', async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: Array<{ tag: string; body: string }> = [];
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { addEventListener(name: string, handler: (event: unknown) => void) { handlers[name] = handler; },
      registration: { async showNotification(_title: string, options: { tag: string; body: string }) { shown.push(options); } } },
  });
  for (const body of ['Quiz Tecnologia', 'Informática']) {
    handlers.push({ data: { json: () => ({ body }) }, waitUntil: (_promise: Promise<void>) => undefined });
  }
  assert.equal(shown.length, 2);
  assert.ok(shown.every((notification) => notification.tag === ''));
  assert.deepEqual(shown.map((notification) => notification.body), ['Quiz Tecnologia', 'Informática']);
});
