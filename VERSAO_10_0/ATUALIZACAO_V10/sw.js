// Service Worker Vooalto V10 — arquivo gerado por build_v10_pwa.py (hash 16c4ebe12c7f)
const CACHE_PREFIX = 'vooalto-v10-';
// Caches das versões anteriores na MESMA origem (a porta 4800 nunca mudou): o
// activate apaga o que a V9/V8 deixou, sem tocar em outros aplicativos.
const LEGACY_CACHE_PREFIXES = ['vooalto-v9-', 'vooalto-v8-'];
const CACHE = 'vooalto-v10-16c4ebe12c7f';
const PRECACHE = ["/","manifest.webmanifest","limpar_cache.html","zerar_dados.html","index.html","manual.html","assets/cropper.min.css","assets/cropper.min.js","assets/fonts.css","assets/html2canvas.min.js","assets/logo_empresa.png","assets/logo_orcamento.png","assets/tema-v10.css","assets/watermark_vooalto.png","assets/fonts/poppins-latin-300-normal.woff2","assets/fonts/poppins-latin-400-normal.woff2","assets/fonts/poppins-latin-500-normal.woff2","assets/fonts/poppins-latin-600-normal.woff2","assets/fonts/poppins-latin-700-normal.woff2","criador_contrato/manifest.webmanifest","criador_contrato/icons/apple-touch-icon.png","criador_contrato/icons/icon-192.png","criador_contrato/icons/icon-512.png","criador_contrato/icons/maskable-512.png","criador_ficha_tecnica/index.html","criador_orcamento/index.html","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","icons/icone.png","mockup/index.html","mockup/peca.js","mockup/peca_editor.css","mockup/peca_editor.js","mockup/peca_render.js"];
// Arquivos grandes (bundle do Contrato): entram no cache um a um, DEPOIS do
// precache obrigatório. cache.addAll() é atômico — se um arquivo de ~10 MB
// falhasse, a instalação inteira do service worker cairia e o app ficaria
// sem modo offline.
const PRECACHE_PESADOS = ["criador_contrato/index.html"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await Promise.all(PRECACHE_PESADOS.map(url => cache.add(url).catch(() => {})));
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
