// Service worker mínimo do PWA Minha Agenda.
// Estratégia: network-first sem cachear páginas autenticadas nem API
// (evita servir conteúdo protegido/obsoleto). Só pré-carrega os ícones.
const CACHE = 'minha-agenda-v1';
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
