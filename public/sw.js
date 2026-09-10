// Service worker mínimo, só para tornar o site instalável ("Adicionar ao ecrã
// principal"). Não faz cache agressivo de nada — o site precisa sempre de
// rede para a sala/vídeo funcionar, por isso todos os pedidos passam direto.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
