// Service Worker Vooalto V8 — gerado em 20261020-2004 (hash 9670ba917c53)
const CACHE_PREFIX = 'vooalto-v8-';
const CACHE = 'vooalto-v8-9670ba917c53';
const PRECACHE = ["/","manifest.webmanifest","limpar_cache.html","zerar_dados.html","index.html","manual.html","criador_ficha_tecnica/index.html","criador_orcamento/index.html","assets/cropper.min.css","assets/cropper.min.js","assets/html2canvas.min.js","assets/logo_empresa.png","assets/logo_orcamento.png","assets/watermark_vooalto.png","assets/fonts/poppins-latin-300-normal.woff2","assets/fonts/poppins-latin-400-normal.woff2","assets/fonts/poppins-latin-500-normal.woff2","assets/fonts/poppins-latin-600-normal.woff2","assets/fonts/poppins-latin-700-normal.woff2","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","icons/icone.png","assets/tema-v8.css"];

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
    // Nunca apaga cache de outro aplicativo na mesma origem.
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Cache-first para recursos do próprio app; os dados do usuário ficam em
// localStorage/IndexedDB e nunca passam pelo service worker.
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
