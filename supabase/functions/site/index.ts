// ════════════════════════════════════════════════════════════════════════════
// VOOALTO — servidor do site (PWA) no Supabase.
//
// URL pública (é a raiz do app):
//   https://<ref>.supabase.co/functions/v1/site/
//
// Por que existe: o Supabase NÃO hospeda site estático — o Storage entrega
// .html como text/plain e o Edge Function não devolve HTML. Esta função lê o
// arquivo e devolve com o Content-Type certo, então o app roda como site
// normal, com service worker, manifest e instalação como PWA.
//
// Duas fontes, nesta ordem:
//   1. bucket `app` do Storage (envio imediato: tools/publicar_supabase.mjs);
//   2. GitHub (branch main do repositório) — assim o site acompanha o código
//      sem depender de ninguém rodar o script de envio.
//
// Regras: caminho sem "..", index.html implícito, sem listagem; html/js/json/
// manifest sempre revalidados (a atualização chega), imagens/fontes com cache.
//
// O caminho chega de dois jeitos conforme o gateway: "/site/index.html" (o
// slug ainda dentro) ou "/index.html". Os dois são tratados igual.
// ════════════════════════════════════════════════════════════════════════════
const BUCKET = 'app'
const GH_REPO = Deno.env.get('VOOALTO_GH_REPO') || 'yuuv1/VOOALTO-APLICATIVO'
const GH_REF = Deno.env.get('VOOALTO_GH_REF') || 'main'
const GH_DIR = Deno.env.get('VOOALTO_GH_DIR') || 'VERSAO_10_0/ATUALIZACAO_V10'
const SLUG = 'site'
/* onde o app fica publicado — usado no service-worker-allowed */
const CAMINHO_BASE = `/functions/v1/${SLUG}/`

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  gz: 'application/gzip',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  zip: 'application/zip',
  map: 'application/json; charset=utf-8',
}

const TEXTUAIS = new Set(['html', 'htm', 'js', 'mjs', 'css', 'json', 'webmanifest', 'txt', 'svg', 'map'])

/* O gateway das Edge Functions reescreve o Content-Type para `text/plain`
   quando ele é EXATAMENTE `text/html` (minúsculo) — medido em 2026-11-03:
   `text/html` → `text/plain`; `Text/HTML`, `text/HTML` e `TEXT/HTML` passam
   intactos e o navegador renderiza como HTML (MIME é case-insensitive).
   Por isso o HTML sai como `Text/HTML`. Mascarar outro tipo (ex.: svg) faria
   o navegador baixar o arquivo — não serve. */
function tipoHtml(): string {
  return 'Text/HTML; charset=utf-8'
}

function cabecalhos(ext: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'cache-control': TEXTUAIS.has(ext)
      ? 'no-cache, max-age=0, must-revalidate'
      : 'public, max-age=3600',
  }
  if (ext === 'html' || ext === 'htm') h['content-type'] = tipoHtml()
  /* o app vive em /functions/v1/site/ — o service worker tem de ficar preso
     ali (um escopo "/" tomaria o domínio inteiro e quebraria a API REST) */
  if (ext === 'js' || ext === 'mjs') h['service-worker-allowed'] = CAMINHO_BASE
  return h
}

/** Normaliza o caminho pedido para algo relativo à raiz do app. */
function caminhoRelativo(pathname: string): string {
  let rel = pathname
  const marca = '/functions/v1/'
  const pos = rel.indexOf(marca)
  if (pos >= 0) rel = rel.slice(pos + marca.length)
  try { rel = decodeURIComponent(rel) } catch (_e) { /* mantém como veio */ }
  rel = rel.replace(/^\/+/, '')
  // tira o slug quando o gateway o deixa no caminho ("site/assets/app.js")
  if (rel === SLUG) rel = ''
  else if (rel.startsWith(SLUG + '/')) rel = rel.slice(SLUG.length + 1)
  if (!rel || rel.endsWith('/')) rel += 'index.html'
  /* A capa de entrada usa caminho SEM extensão de propósito: o gateway entrega
     qualquer URL terminada em .html como text/plain (o tipo do arquivo é
     reescrito pela extensão do caminho). "home" é a capa. */
  if (rel === 'home' || rel === 'entrar') rel = 'entrar.html'
  if (rel === 'site-supabase') rel = 'site-supabase.html'
  return rel
}

/** Uma fonte: devolve o ArrayBuffer ou null. */
async function doStorage(rel: string): Promise<ArrayBuffer | null> {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) return null
  const caminho = rel.split('/').map(encodeURIComponent).join('/')
  const resp = await fetch(`${base}/storage/v1/object/public/${BUCKET}/${caminho}`, { headers: { accept: '*/*' } })
  if (!resp.ok) return null
  return await resp.arrayBuffer()
}

async function doGitHub(rel: string): Promise<ArrayBuffer | null> {
  const url = `https://raw.githubusercontent.com/${GH_REPO}/${GH_REF}/${GH_DIR}/${rel.split('/').map(encodeURIComponent).join('/')}`
  const resp = await fetch(url, { headers: { 'accept': '*/*', 'user-agent': 'vooalto-site' } })
  if (!resp.ok) return null
  return await resp.arrayBuffer()
}

async function buscar(rel: string): Promise<{ corpo: ArrayBuffer; origem: string } | null> {
  try {
    const c = await doStorage(rel)
    if (c) return { corpo: c, origem: 'storage' }
  } catch (_e) { /* tenta o GitHub */ }
  try {
    const c = await doGitHub(rel)
    if (c) return { corpo: c, origem: 'github' }
  } catch (_e) { /* não encontrado */ }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,HEAD,OPTIONS',
        'access-control-allow-headers': '*',
      },
    })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método não permitido', { status: 405 })
  }

  const url = new URL(req.url)
  const rel = caminhoRelativo(url.pathname)
  if (rel.includes('..') || rel.split('/').some((p) => p.startsWith('.'))) {
    return new Response('Caminho inválido', { status: 400 })
  }

  const ext = (rel.split('.').pop() || '').toLowerCase()
  const achado = await buscar(rel)

  if (!achado) {
    // Navegação para caminho sem extensão: devolve o shell do app.
    const navegacao = (req.headers.get('accept') || '').includes('text/html')
    if (navegacao && !/\.[a-z0-9]{1,8}$/i.test(rel)) {
      const raiz = await buscar('index.html')
      if (raiz) {
        return new Response(req.method === 'HEAD' ? null : raiz.corpo, {
          status: 200,
          headers: { ...cabecalhos('html'), 'x-vooalto-origem': 'shell' },
        })
      }
    }
    return new Response(`Não encontrado: ${rel}`, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  return new Response(req.method === 'HEAD' ? null : achado.corpo, {
    status: 200,
    headers: { ...cabecalhos(ext), 'x-vooalto-origem': achado.origem },
  })
})
