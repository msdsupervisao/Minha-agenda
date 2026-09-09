export type DeviceTask = {
  id: string; notificationId: number; body: string; recipientName: string | null;
  phone: string | null; dueAt: string; completed: boolean;
};

export function saveDeviceTask(tasks: DeviceTask[], task: DeviceTask): DeviceTask[] {
  // Only the identity can replace a task. Equal dates or recipients are independent.
  return [...tasks.filter((item) => item.id !== task.id), task]
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}

export function allocateNotificationId(preferred: number, occupied: readonly number[]): number {
  const used = new Set(occupied);
  let id = preferred;
  while (used.has(id)) id = id >= 2_147_483_000 ? 1 : id + 1;
  return id;
}
