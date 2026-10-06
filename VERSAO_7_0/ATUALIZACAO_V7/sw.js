// Service Worker Vooalto V7 — gerado em 20261006-2032 (hash f5e88b4493f5)
const CACHE_PREFIX = 'vooalto-v7-';
const CACHE = 'vooalto-v7-f5e88b4493f5';
const PRECACHE = ["/","manifest.webmanifest","limpar_cache.html","zerar_dados.html","index.html","principal_dashboard/index.html","criador_ficha_tecnica/index.html","criador_orcamento/index.html","assets/cropper.min.css","assets/cropper.min.js","assets/html2canvas.min.js","assets/logo_empresa.png","assets/logo_orcamento.png","assets/pdf.min.js","assets/pdf.worker.min.js","assets/watermark_vooalto.png","assets/fonts/poppins-latin-300-normal.woff2","assets/fonts/poppins-latin-400-normal.woff2","assets/fonts/poppins-latin-500-normal.woff2","assets/fonts/poppins-latin-600-normal.woff2","assets/fonts/poppins-latin-700-normal.woff2","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","icons/icone.png"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Never delete caches owned by another app on the same origin.
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Cache-first for same-origin app resources; application data stays in
// localStorage/IndexedDB and is never handled by the service worker.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/__vooalto_health') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request) || (request.mode === 'navigate'
      ? await cache.match(url.pathname, { ignoreSearch: true })
      : null);
    if (hit) return hit;

    try {
      const response = await fetch(request);
      if (response && response.ok && url.pathname.startsWith('/')) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const fallback = await cache.match(request, { ignoreSearch: true });
      if (fallback) return fallback;
      throw error;
    }
  })());
});
