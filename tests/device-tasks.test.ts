import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateNotificationId, saveDeviceTask, type DeviceTask } from '../lib/schedule/device-tasks';

test('mesmo horário mantém duas mensagens e conclusão independente após reload', () => {
  const quiz: DeviceTask = { id: 'quiz', notificationId: 10, recipientName: 'Quiz Tecnologia', body: 'Quiz', phone: null, dueAt: '2026-09-09T15:00:00Z', completed: false };
  const informatica = { ...quiz, id: 'informatica', notificationId: 11, recipientName: 'Informática', body: 'Aula' };
  const saved = saveDeviceTask(saveDeviceTask([], quiz), informatica);
  const restored = JSON.parse(JSON.stringify(saved)) as DeviceTask[];
  const completed = saveDeviceTask(restored, { ...informatica, completed: true });
  assert.equal(completed.length, 2);
  assert.deepEqual(completed.find((task) => task.id === 'quiz'), quiz);
  assert.equal(completed.find((task) => task.id === 'informatica')?.completed, true);
});

test('colisão de hash não sobrescreve ID de outra notificação', () => {
  assert.equal(allocateNotificationId(10, [10, 11]), 12);
  assert.equal(allocateNotificationId(2147483000, [2147483000, 1]), 2);
});
