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

export function pushSubscribeErrorMessage(status: number) {
  if (status === 401) return 'Sua sessão expirou. Faça login novamente e repita a ativação.';
  return 'Não foi possível registrar a inscrição.';
}

export function pushActivationErrorMessage(name?: string) {
  if (name === 'PermissionTimeout') {
    return 'O Android não concluiu a permissão. Feche esta tela, abra novamente e tente de novo.';
  }
  if (name === 'ServiceWorkerTimeout') {
    return 'O Chrome não conseguiu preparar o serviço de notificações. Feche o app e abra novamente.';
  }
  if (name === 'PushSubscriptionTimeout' || name === 'AbortError') {
    return 'O Android não conseguiu conectar ao serviço de notificações. Desative VPN e DNS privado, atualize o Chrome e os Serviços do Google Play e tente novamente.';
  }
  if (name === 'NotAllowedError') {
    return 'A permissão de notificações está bloqueada. Libere-a nas configurações deste site.';
  }
  return `Falha ao ativar as notificações${name ? ` (${name})` : ''}.`;
}
