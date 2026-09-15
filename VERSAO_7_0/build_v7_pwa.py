# -*- coding: utf-8 -*-
"""
Build Vooalto V7 PWA
- Gera sw.js com nome de cache baseado no hash do conteúdo (troca de versão automática)
- Gera VOOALTO_V7_PWA.zip com tudo necessário
Uso: python3 build_v7_pwa.py
"""
import hashlib, json, os, zipfile, datetime, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V7')

def file_list():
    files = [
        'index.html', 'manifest.webmanifest', 'sw.js', 'server.js',
        'instalar_e_abrir_V7.bat', 'limpar_cache.html', 'zerar_dados.html', 'README.txt',
        'principal_dashboard/index.html',
        'criador_ficha_tecnica/index.html',
        'criador_orcamento/index.html',
    ]
    d = os.path.join(SRC, 'assets')
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if os.path.isfile(os.path.join(d, fn)):
                files.append('assets/' + fn)
    d = os.path.join(SRC, 'assets', 'fonts')
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if os.path.isfile(os.path.join(d, fn)):
                files.append('assets/fonts/' + fn)
    d = os.path.join(SRC, 'icons')
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if os.path.isfile(os.path.join(d, fn)):
                files.append('icons/' + fn)
    return files

def build():
    files = file_list()
    h = hashlib.sha256()
    for rel in files:
        p = os.path.join(SRC, rel)
        if not os.path.isfile(p):
            print(f'  [aviso] faltando: {rel}'); continue
        h.update(rel.encode('utf-8'))
        with open(p, 'rb') as fh:
            h.update(fh.read())
    digest = h.hexdigest()[:12]
    cache_name = f'vooalto-v7-{digest}'
    version = datetime.datetime.now().strftime('%Y%m%d-%H%M')

    precache = ['/', 'manifest.webmanifest', 'limpar_cache.html', 'zerar_dados.html']
    for rel in files:
        if rel in ('sw.js', 'server.js', 'instalar_e_abrir_V7.bat', 'README.txt'):
            continue
        if rel not in precache:
            precache.append(rel)

    sw = f'''// Service Worker Vooalto V7 — gerado em {version} (hash {digest})
const CACHE = '{cache_name}';
const PRECACHE = {json.dumps(precache, ensure_ascii=False)};

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil((async () => {{
    const keys = await caches.keys();
    for (const k of keys) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  }})());
}});

// Cache-first para assets; o DADOS ficam em localStorage/IndexedDB (nunca passam pelo SW).
self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {{
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {{
      const net = await fetch(req);
      if (net && net.ok && url.pathname.startsWith('/')) {{
        const clone = req.clone();
        cache.put(clone, net).catch(() => {{}});
      }}
      return net;
    }} catch (err) {{
      const fallback = await cache.match(req, {{ignoreSearch: true}});
      if (fallback) return fallback;
      throw err;
    }}
  }})());
}});
'''
    sw_path = os.path.join(SRC, 'sw.js')
    with open(sw_path, 'w', encoding='utf-8') as fh:
        fh.write(sw)
    print(f'sw.js gerado  cache={cache_name}  arquivos={len(precache)}')

    # ── zip ─
    zip_path = os.path.join(BASE, 'VOOALTO_V7_PWA.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, fnames in os.walk(SRC):
            for fn in fnames:
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, SRC)
                z.write(full, arc)
    print(f'zip gerado: {zip_path}  ({os.path.getsize(zip_path)/1024:.0f} KB)')
    return 0

if __name__ == '__main__':
    sys.exit(build())
