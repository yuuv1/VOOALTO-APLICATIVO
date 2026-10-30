// Service Worker Vooalto V9 — gerado em 20261030-1132 (hash 0873c4e5dfc5)
const CACHE_PREFIX = 'vooalto-v9-';
// Caches da V8 ficam para trás na mesma origem: o aviso de troca de versão
// apaga o que a versão anterior deixou, sem tocar em outros aplicativos.
const LEGACY_CACHE_PREFIXES = ['vooalto-v8-'];
const CACHE = 'vooalto-v9-0873c4e5dfc5';
const PRECACHE = ["/","manifest.webmanifest","limpar_cache.html","zerar_dados.html","index.html","manual.html","__pycache__/server.cpython-311.pyc","assets/cropper.min.css","assets/cropper.min.js","assets/fonts.css","assets/html2canvas.min.js","assets/logo_empresa.png","assets/logo_orcamento.png","assets/tema-v9.css","assets/watermark_vooalto.png","assets/fonts/poppins-latin-300-normal.woff2","assets/fonts/poppins-latin-400-normal.woff2","assets/fonts/poppins-latin-500-normal.woff2","assets/fonts/poppins-latin-600-normal.woff2","assets/fonts/poppins-latin-700-normal.woff2","criador_ficha_tecnica/index.html","criador_orcamento/index.html","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","icons/icone.png","mockup/index.html","mockup/peca.js","mockup/peca_editor.css","mockup/peca_editor.js","mockup/peca_render.js"];

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
    const isOurs = key => key.startsWith(CACHE_PREFIX)
      || LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix));
    // Nunca apaga cache de outro aplicativo na mesma origem.
    await Promise.all(keys
      .filter(key => isOurs(key) && key !== CACHE)
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
