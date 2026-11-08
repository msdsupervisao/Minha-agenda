import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeOnline } from '../lib/agent/bridge-presence';

test('presença exige sinal recente e não interpreta data inválida como conexão', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  assert.equal(bridgeOnline('2026-11-07T11:59:30Z', now), true);
  assert.equal(bridgeOnline('2026-11-07T11:59:14Z', now), false);
  assert.equal(bridgeOnline('2026-11-08T12:00:00Z', now), false);
  assert.equal(bridgeOnline(null, now), false);
});
