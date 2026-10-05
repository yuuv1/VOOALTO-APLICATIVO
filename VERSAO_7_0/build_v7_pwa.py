# -*- coding: utf-8 -*-
"""Build the Vooalto V7 offline package and its content-versioned service worker.

Usage: python3 build_v7_pwa.py
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import sys
import zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V7')
ZIP_PATH = os.path.join(BASE, 'VOOALTO_V7_PWA.zip')
CACHE_EPOCH = 2  # Increase only when the service-worker cache/fetch contract changes.

CORE_FILES = [
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'server.js',
    'server.py',
    'instalar_e_abrir_V7.bat',
    'limpar_cache.html',
    'zerar_dados.html',
    'README.txt',
    'principal_dashboard/index.html',
    'criador_ficha_tecnica/index.html',
    'criador_orcamento/index.html',
    'assets/cropper.min.css',
    'assets/cropper.min.js',
    'assets/html2canvas.min.js',
    'assets/logo_empresa.png',
    'assets/logo_orcamento.png',
    'assets/pdf.min.js',
    'assets/pdf.worker.min.js',
    'assets/watermark_vooalto.png',
    'assets/fonts/poppins-latin-300-normal.woff2',
    'assets/fonts/poppins-latin-400-normal.woff2',
    'assets/fonts/poppins-latin-500-normal.woff2',
    'assets/fonts/poppins-latin-600-normal.woff2',
    'assets/fonts/poppins-latin-700-normal.woff2',
    'icons/icon-192.png',
    'icons/icon-512-maskable.png',
    'icons/icon-512.png',
    'icons/icone.png',
]
NON_APP_FILES = {
    'sw.js', 'server.js', 'server.py', 'instalar_e_abrir_V7.bat', 'README.txt'
}


def file_list():
    """Return the complete distribution file list in stable order."""
    files = list(CORE_FILES)
    for folder in ('assets', 'icons'):
        base = os.path.join(SRC, folder)
        if not os.path.isdir(base):
            continue
        for current, dirs, names in os.walk(base):
            dirs.sort()
            for name in sorted(names):
                full = os.path.join(current, name)
                files.append(os.path.relpath(full, SRC).replace(os.sep, '/'))
    return list(dict.fromkeys(files))


def content_digest(files):
    """Hash only files that determine the installed web app's cached contents.

    Excluding generated sw.js avoids a self-referential hash (the old builder
    changed the cache name on every identical build because it hashed the
    previous sw.js timestamp/hash into the next one).
    """
    digest = hashlib.sha256()
    digest.update(f'vooalto-v7-cache-epoch:{CACHE_EPOCH}\n'.encode('ascii'))
    for rel in sorted(files):
        if rel in NON_APP_FILES:
            continue
        full = os.path.join(SRC, rel)
        digest.update(rel.encode('utf-8'))
        digest.update(b'\0')
        with open(full, 'rb') as stream:
            digest.update(stream.read())
        digest.update(b'\0')
    return digest.hexdigest()[:12]


def make_service_worker(cache_name, digest, precache, version):
    precache_json = json.dumps(precache, ensure_ascii=False, separators=(',', ':'))
    return f'''// Service Worker Vooalto V7 — gerado em {version} (hash {digest})
const CACHE_PREFIX = 'vooalto-v7-';
const CACHE = '{cache_name}';
const PRECACHE = {precache_json};

self.addEventListener('install', event => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', event => {{
  event.waitUntil((async () => {{
    const keys = await caches.keys();
    // Never delete caches owned by another app on the same origin.
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  }})());
}});

// Cache-first for same-origin app resources; application data stays in
// localStorage/IndexedDB and is never handled by the service worker.
self.addEventListener('fetch', event => {{
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/__vooalto_health') return;

  event.respondWith((async () => {{
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request) || (request.mode === 'navigate'
      ? await cache.match(url.pathname, {{ ignoreSearch: true }})
      : null);
    if (hit) return hit;

    try {{
      const response = await fetch(request);
      if (response && response.ok && url.pathname.startsWith('/')) {{
        cache.put(request, response.clone()).catch(() => {{}});
      }}
      return response;
    }} catch (error) {{
      const fallback = await cache.match(request, {{ ignoreSearch: true }});
      if (fallback) return fallback;
      throw error;
    }}
  }})());
}});
'''


def normalize_bat_line_endings():
    for current, _dirs, names in os.walk(SRC):
        for name in names:
            if not name.lower().endswith('.bat'):
                continue
            full = os.path.join(current, name)
            with open(full, 'rb') as stream:
                raw = stream.read().replace(b'\r\n', b'\n').replace(b'\r', b'\n')
            with open(full, 'wb') as stream:
                stream.write(raw.replace(b'\n', b'\r\n'))


def build():
    files = file_list()
    missing = [rel for rel in files if not os.path.isfile(os.path.join(SRC, rel))]
    if missing:
        print('Erro: arquivos obrigatorios ausentes:', file=sys.stderr)
        for rel in missing:
            print(f'  - {rel}', file=sys.stderr)
        return 1

    digest = content_digest(files)
    cache_name = f'vooalto-v7-{digest}'
    app_files = [rel for rel in files if rel not in NON_APP_FILES]
    precache = ['/', 'manifest.webmanifest', 'limpar_cache.html', 'zerar_dados.html']
    for rel in app_files:
        if rel not in precache:
            precache.append(rel)

    version = datetime.datetime.now().strftime('%Y%m%d-%H%M')
    sw_path = os.path.join(SRC, 'sw.js')
    with open(sw_path, 'w', encoding='utf-8', newline='\n') as stream:
        stream.write(make_service_worker(cache_name, digest, precache, version))

    normalize_bat_line_endings()

    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as archive:
        for rel in sorted(files):
            full = os.path.join(SRC, rel)
            archive.write(full, rel)

    print(f'sw.js gerado: cache={cache_name} ({len(precache)} itens offline)')
    print(f'ZIP gerado: {ZIP_PATH} ({os.path.getsize(ZIP_PATH) / 1024:.0f} KB)')
    return 0


if __name__ == '__main__':
    sys.exit(build())
