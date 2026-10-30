# -*- coding: utf-8 -*-
"""Build the Vooalto V10 offline package and its content-versioned service worker.

Usage: python3 build_v10_pwa.py

V10: três módulos (Ficha Técnica, Orçamento e Contrato). A V10 é a única versão
do projeto (as pastas V5..V9 foram removidas) e mantém o MESMO endereço local
(http://localhost:4800/) e as mesmas chaves de dados da V8/V9, para que a
atualização não perca fichas, rascunhos, orçamentos nem o estado do contrato.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import sys
import zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V10')
ZIP_PATH = os.path.join(BASE, 'VOOALTO_V10_PWA.zip')
CACHE_EPOCH = 1  # Increase only when the service-worker cache/fetch contract changes.

# V9.1.2 — a lista de arquivos deixou de ser manual.
# Antes existia um CORE_FILES gigante e só assets/ e icons/ eram varridos: um
# HTML/JS novo fora dessas pastas não entrava no precache NEM no hash de
# conteúdo, então quem já tinha o app instalado nunca recebia a atualização e
# tomava 404 offline. Agora a pasta do app é a fonte da verdade.
IGNORADOS = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
SUFIXOS_IGNORADOS = ('.tmp', '.swp', '.orig', '.rej', '~', '.pyc', '.pyo')
# Pastas que nunca são distribuição (a varredura da pasta pegou __pycache__ de
# uma execução local e o .pyc entrou no ZIP, no precache e no hash).
PASTAS_IGNORADAS = {'__pycache__', 'node_modules', '.git', '.idea', '.vscode'}

# Arquivos grandes: entram no precache em uma segunda fase (best-effort).
# cache.addAll() é atômico — um arquivo de 10 MB falhando derrubaria a
# instalação do service worker inteira e o app ficaria sem offline.
LIMITE_PESADO = 2 * 1024 * 1024

# Arquivos de distribuição/hospedagem que NÃO fazem parte do app instalado no
# navegador: ficam fora do precache e fora do hash de conteúdo (o hash é o que
# faz o service worker novo chegar sozinho; sw.js não pode se auto-referenciar).
NON_APP_FILES = {
    'sw.js',
    'server.js',
    'server.py',
    'version.json',
    'instalar_e_abrir_V10.bat',
    'README.txt',
}


def file_list():
    """Return the complete distribution file list in stable order."""
    files = []
    for atual, dirs, nomes in os.walk(SRC):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in PASTAS_IGNORADAS)
        for nome in sorted(nomes):
            if nome.startswith('.') or nome in IGNORADOS or nome.endswith(SUFIXOS_IGNORADOS):
                continue
            rel = os.path.relpath(os.path.join(atual, nome), SRC).replace(os.sep, '/')
            files.append(rel)
    return files


def precache_list(files):
    """Offline precache list: '/', the entry points and every app file."""
    precache = ['/', 'manifest.webmanifest', 'limpar_cache.html', 'zerar_dados.html']
    for rel in files:
        if rel in NON_APP_FILES:
            continue
        if rel not in precache:
            precache.append(rel)
    return precache


def split_pesados(precache, root=SRC):
    """Separa o precache obrigatório do best-effort (arquivos grandes).

    O contrato é um bundle de ~10 MB: se ele falhar no cache.addAll() atômico,
    o service worker não instala e TODO o app perde o modo offline. Os grandes
    vão numa segunda fase, um a um, e o fetch cacheia sob demanda de qualquer
    forma.
    """
    obrigatorios, pesados = [], []
    for rel in precache:
        try:
            tamanho = os.path.getsize(os.path.join(root, rel.lstrip('/')))
        except OSError:
            tamanho = 0
        (pesados if tamanho > LIMITE_PESADO else obrigatorios).append(rel)
    return obrigatorios, pesados


def content_digest(files):
    """Hash only the files that determine the installed web app's cached contents."""
    digest = hashlib.sha256()
    digest.update(f'vooalto-v10-cache-epoch:{CACHE_EPOCH}\n'.encode('ascii'))
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


def make_service_worker(cache_name, digest, precache, version, pesados=()):
    precache_json = json.dumps(precache, ensure_ascii=False, separators=(',', ':'))
    pesados_json = json.dumps(list(pesados), ensure_ascii=False, separators=(',', ':'))
    return f"""// Service Worker Vooalto V10 — gerado em {version} (hash {digest})
const CACHE_PREFIX = 'vooalto-v10-';
// Caches das versões anteriores na MESMA origem (a porta 4800 nunca mudou): o
// activate apaga o que a V9/V8 deixou, sem tocar em outros aplicativos.
const LEGACY_CACHE_PREFIXES = ['vooalto-v9-', 'vooalto-v8-'];
const CACHE = '{cache_name}';
const PRECACHE = {precache_json};
// Arquivos grandes (bundle do Contrato): entram no cache um a um, DEPOIS do
// precache obrigatório. cache.addAll() é atômico — se um arquivo de ~10 MB
// falhasse, a instalação inteira do service worker cairia e o app ficaria
// sem modo offline.
const PRECACHE_PESADOS = {pesados_json};

self.addEventListener('install', event => {{
  event.waitUntil((async () => {{
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await Promise.all(PRECACHE_PESADOS.map(url => cache.add(url).catch(() => {{}})));
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', event => {{
  event.waitUntil((async () => {{
    const keys = await caches.keys();
    const isOurs = key => key.startsWith(CACHE_PREFIX)
      || LEGACY_CACHE_PREFIXES.some(prefix => key.startsWith(prefix));
    // Nunca apaga cache de outro aplicativo na mesma origem.
    await Promise.all(keys
      .filter(key => isOurs(key) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  }})());
}});

// Cache-first para recursos do próprio app; os dados do usuário ficam em
// localStorage/IndexedDB e nunca passam pelo service worker.
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
"""


def normalize_bat_line_endings():
    """O Windows exige CRLF nos .bat; o repositório normaliza para LF."""
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
    # sw.js é GERADO por este script: não pode entrar na checagem de faltantes,
    # senão o primeiro build num checkout limpo falha (ovo e galinha).
    missing = [rel for rel in files
               if rel != 'sw.js' and not os.path.isfile(os.path.join(SRC, rel))]
    if missing:
        print('Erro: arquivos obrigatorios ausentes:', file=sys.stderr)
        for rel in missing:
            print(f'  - {rel}', file=sys.stderr)
        return 1

    digest = content_digest(files)
    cache_name = f'vooalto-v10-{digest}'
    precache, pesados = split_pesados(precache_list(files))

    version = datetime.datetime.now().strftime('%Y%m%d-%H%M')
    sw_path = os.path.join(SRC, 'sw.js')
    with open(sw_path, 'w', encoding='utf-8', newline='\n') as stream:
        stream.write(make_service_worker(cache_name, digest, precache, version, pesados))

    normalize_bat_line_endings()

    # sw.js acabou de ser gerado: entra no ZIP mesmo que não estivesse na
    # listagem (checkout limpo não tem o arquivo antes do build).
    zip_files = sorted(set(files) | {'sw.js'})
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as archive:
        for rel in zip_files:
            full = os.path.join(SRC, rel)
            archive.write(full, rel)

    print(f'sw.js gerado: cache={cache_name} ({len(precache)} itens offline'
          f' + {len(pesados)} grande(s) em segundo plano)')
    print(f'ZIP gerado: {ZIP_PATH} ({os.path.getsize(ZIP_PATH) / 1024:.0f} KB)')
    return 0


if __name__ == '__main__':
    sys.exit(build())
