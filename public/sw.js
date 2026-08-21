// Service worker do PWA Minha Agenda: cache leve + notificações push.
// Estratégia: network-first sem cachear páginas autenticadas nem API
// (evita servir conteúdo protegido/obsoleto). Só pré-carrega os ícones.
const CACHE = 'minha-agenda-v2';
const ASSETS = ['/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Minha Agenda', body: 'Você tem um lembrete.', url: '/agenda' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'lembrete',
    data: { url: payload.url || '/agenda' },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/agenda';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) { if ('focus' in client) { client.navigate(url); return client.focus(); } }
    return self.clients.openWindow(url);
  }));
});
