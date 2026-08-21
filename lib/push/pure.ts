// Helpers puros de push (sem dependência de servidor) — testáveis e usados no cliente.

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export function reminderPushPayload(title: string, id: string): PushPayload {
  return { title: 'Lembrete', body: title, url: '/agenda', tag: `rem-${id}` };
}

export function isDue(dueAtIso: string, now: Date = new Date()) {
  const due = new Date(dueAtIso).getTime();
  return Number.isFinite(due) && due <= now.getTime();
}
