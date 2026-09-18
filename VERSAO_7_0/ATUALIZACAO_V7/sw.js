// Service Worker Vooalto V7 — gerado em 20260918-1519 (hash 6e52f4ab54e8)
const CACHE = 'vooalto-v7-6e52f4ab54e8';
const PRECACHE = ["/", "manifest.webmanifest", "limpar_cache.html", "zerar_dados.html", "index.html", "principal_dashboard/index.html", "criador_ficha_tecnica/index.html", "criador_orcamento/index.html", "assets/cropper.min.css", "assets/cropper.min.js", "assets/html2canvas.min.js", "assets/logo_empresa.png", "assets/logo_orcamento.png", "assets/pdf.min.js", "assets/pdf.worker.min.js", "assets/watermark_vooalto.png", "assets/fonts/poppins-latin-300-normal.woff2", "assets/fonts/poppins-latin-400-normal.woff2", "assets/fonts/poppins-latin-500-normal.woff2", "assets/fonts/poppins-latin-600-normal.woff2", "assets/fonts/poppins-latin-700-normal.woff2", "icons/icon-192.png", "icons/icon-512-maskable.png", "icons/icon-512.png", "icons/icone.png"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    for (const k of keys) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Cache-first para assets; o DADOS ficam em localStorage/IndexedDB (nunca passam pelo SW).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && net.ok && url.pathname.startsWith('/')) {
        const clone = req.clone();
        cache.put(clone, net).catch(() => {});
      }
      return net;
    } catch (err) {
      const fallback = await cache.match(req, {ignoreSearch: true});
      if (fallback) return fallback;
      throw err;
    }
  })());
});
