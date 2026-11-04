// ════════════════════════════════════════════════════════════════════════════
// VOOALTO — servidor do site (PWA) no Supabase.
//
// URL pública (é a raiz do app):
//   https://<ref>.supabase.co/functions/v1/site/
//
//   /                     → o app (index.html)
//   /home                 → capa de entrada (entrar.html)
//   /ficha/               → criador_ficha_tecnica/
//   /orcamento/           → criador_orcamento/
//   /contrato/            → criador_contrato/
//   /<arquivo>            → qualquer arquivo do app
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
// ── AS DUAS ARMADILHAS DO GATEWAY (medidas em 2026-11-03, não supostas) ──
//
// 1. `content-type: text/html` em minúsculas é REESCRITO para `text/plain`.
//    `Text/HTML`, `text/HTML` e `TEXT/HTML` passam intactos (o MIME é
//    case-insensitive e o navegador renderiza igual). Por isso o HTML sai
//    como `Text/HTML`. Mascarar de outro tipo (ex.: svg) faz o navegador
//    BAIXAR o arquivo — não serve.
//
// 2. URL terminada em `.html` é forçada a `text/plain` pela EXTENSÃO DO
//    CAMINHO, ignorando o cabeçalho. Por isso todo caminho `.html` é
//    REDIRECIONADO para o equivalente sem extensão (/x/index.html → /x/).
//    É isso que faz o shell antigo (iframes apontando para
//    "criador_ficha_tecnica/index.html") funcionar no site publicado.
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

/* rota limpa → arquivo real (o caminho publicado nunca termina em .html) */
const ROTAS: Record<string, string> = {
  'ficha': 'criador_ficha_tecnica/index.html',
  'orcamento': 'criador_orcamento/index.html',
  'contrato': 'criador_contrato/index.html',
  'home': 'entrar.html',
  'entrar': 'entrar.html',
  'site-supabase': 'site-supabase.html',
}

const TEXTUAIS = new Set(['html', 'htm', 'js', 'mjs', 'css', 'json', 'webmanifest', 'txt', 'svg', 'map'])

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

/** Caminho pedido, relativo ao app (sem o slug, decodificado, sem barra inicial). */
function pedidoRelativo(pathname: string): string {
  let rel = pathname
  const marca = '/functions/v1/'
  const pos = rel.indexOf(marca)
  if (pos >= 0) rel = rel.slice(pos + marca.length)
  try { rel = decodeURIComponent(rel) } catch (_e) { /* mantém como veio */ }
  rel = rel.replace(/^\/+/, '')
  if (rel === SLUG) rel = ''
  else if (rel.startsWith(SLUG + '/')) rel = rel.slice(SLUG.length + 1)
  return rel
}

/** Rota limpa → arquivo. Devolve o caminho do arquivo no repositório. */
function arquivoDe(rel: string): string {
  const rota = rel.replace(/\/+$/, '')
  if (ROTAS[rota]) return ROTAS[rota]
  if (!rel || rel.endsWith('/')) return rel + 'index.html'
  return rel
}

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
  const pedido = pedidoRelativo(url.pathname)

  /* DEFESA 2 — caminho .html vai para o caminho sem extensão.
     A barra no fim é o que mantém os endereços relativos do módulo certos
     ("../assets/x.css" a partir de /site/criador_ficha_tecnica/). */
  if (/\.html?$/i.test(pedido)) {
    let destino = pedido.replace(/index\.html?$/i, '').replace(/\.html?$/i, '')
    if (destino === '') destino = './'
    else if (!destino.endsWith('/')) destino += '/'
    if (destino === 'entrar/' || destino === 'site-supabase/') destino = destino.slice(0, -1)
    return new Response(null, {
      status: 302,
      headers: {
        'location': CAMINHO_BASE + destino.replace(/^\.\//, ''),
        'cache-control': 'no-store',
      },
    })
  }

  const rel = arquivoDe(pedido)
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
