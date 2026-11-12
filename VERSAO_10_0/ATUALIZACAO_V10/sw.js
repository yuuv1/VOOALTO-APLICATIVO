// Service Worker Vooalto V10 — arquivo gerado por build_v10_pwa.py (hash a8e86fe8256f)
const CACHE_PREFIX = 'vooalto-v10-';
// Caches das versões anteriores na MESMA origem (a porta 4800 nunca mudou): o
// activate apaga o que a V9/V8 deixou, sem tocar em outros aplicativos.
const LEGACY_CACHE_PREFIXES = ['vooalto-v9-', 'vooalto-v8-'];
const CACHE = 'vooalto-v10-a8e86fe8256f';
const PRECACHE = ["/","manifest.webmanifest","limpar_cache.html","zerar_dados.html","entrar.html","index.html","manual.html","site-supabase.html","assets/cropper.min.css","assets/cropper.min.js","assets/fonts.css","assets/html2canvas.min.js","assets/imagem.js","assets/logo_empresa.png","assets/logo_orcamento.png","assets/nuvem.js","assets/rascunhos.js","assets/tema-v10.css","assets/watermark_vooalto.png","assets/zoom-folha.js","assets/fonts/poppins-latin-300-normal.woff2","assets/fonts/poppins-latin-400-normal.woff2","assets/fonts/poppins-latin-500-normal.woff2","assets/fonts/poppins-latin-600-normal.woff2","assets/fonts/poppins-latin-700-normal.woff2","assets/ocr/LICENSE-core.txt","assets/ocr/LICENSE-tesseract.txt","assets/ocr/por.traineddata.gz","assets/ocr/tesseract.min.js","assets/ocr/worker.min.js","assets/pdf/LICENSE.txt","assets/pdf/pdf.min.js","assets/pdf/pdf.worker.min.js","criador_contrato/manifest.webmanifest","criador_contrato/icons/apple-touch-icon.png","criador_contrato/icons/icon-192.png","criador_contrato/icons/icon-512.png","criador_contrato/icons/maskable-512.png","criador_ficha_tecnica/index.html","criador_orcamento/index.html","criador_recibo/index.html","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","icons/icone.png","mockup/index.html","mockup/peca.js","mockup/peca_editor.css","mockup/peca_editor.js","mockup/peca_render.js"];
// Arquivos grandes (bundle do Contrato): entram no cache um a um, DEPOIS do
// precache obrigatório. cache.addAll() é atômico — se um arquivo de ~10 MB
// falhasse, a instalação inteira do service worker cairia e o app ficaria
// sem modo offline.
const PRECACHE_PESADOS = ["assets/ocr/tesseract-core-simd-lstm.wasm.js","criador_contrato/index.html"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Rede ruim não pode derrubar a atualização inteira: se um arquivo do
    // precache falhar, ele é buscado sob demanda no primeiro uso e o app não
    // fica preso na versão antiga (antes, addAll atômico abortava o install).
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    await Promise.all(PRECACHE_PESADOS.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

// O shell pede a troca quando o usuário aceita o aviso de "nova versão".
// Sem isso, o service worker novo só assumiria na próxima vez que TODAS as
// abas do app fossem fechadas — e quem usa o app o dia inteiro nunca fecha.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

// HTML sempre tenta a REDE primeiro; o resto é cache-first (rápido e offline).
//
// Antes era cache-first para tudo, inclusive navegação: quem já tinha aberto o
// app continuava vendo a página antiga mesmo depois de recarregar (o service
// worker entregava o HTML do cache) e as correções pareciam não ter chegado.
// Com rede-first na navegação, recarregar já mostra a versão nova; sem
// internet, cai no cache e o app continua funcionando offline.
const REDE_ESPERA_MS = 4000;

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/__vooalto_health') return;

  const doCache = async (cache) => (await cache.match(request))
    || (await cache.match(url.pathname, { ignoreSearch: true }));

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    if (request.mode === 'navigate') {
      try {
        const resposta = await Promise.race([
          fetch(request),
          new Promise(resolve => setTimeout(() => resolve(null), REDE_ESPERA_MS))
        ]);
        if (resposta) {
          if (resposta.ok && url.pathname.startsWith('/')) {
            cache.put(request, resposta.clone()).catch(() => {});
          }
          return resposta;
        }
      } catch (error) {
        /* sem internet: usa o que está guardado */
      }
      const guardado = await doCache(cache);
      if (guardado) return guardado;
      throw new Error('offline e sem cópia em cache');
    }

    const hit = await doCache(cache);
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
