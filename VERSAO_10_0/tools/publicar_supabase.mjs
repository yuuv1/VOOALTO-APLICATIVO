#!/usr/bin/env node
/* ══ Publica o app no Supabase (hosting do PWA) ═══════════════════════════
   Sobe a pasta ATUALIZACAO_V10 para o bucket `app` do Storage. O Edge Function
   `site` serve esses arquivos com o Content-Type certo, então o app abre como
   site normal (e instala como PWA) em:

       https://<ref>.supabase.co/functions/v1/site/

   Por que Storage e não "hosting": o Supabase não hospeda site estático. O
   Storage entrega .html como texto puro e o Edge Function não devolve HTML.
   A combinação bucket público + function que reescreve o Content-Type é o
   caminho que funciona hoje no plano Free.

   Uso:
     SUPABASE_KEY=<publishable|service_role> node tools/publicar_supabase.mjs
     node tools/publicar_supabase.mjs --somente-lista
     node tools/publicar_supabase.mjs --arquivo criador_ficha_tecnica/index.html

   Segredos NUNCA entram no repositório: a chave vem do ambiente (ou do
   arquivo .env.publicar, que está no .gitignore).
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP = path.join(RAIZ, 'ATUALIZACAO_V10');
const PROJETO = process.env.SUPABASE_PROJECT || 'eeurdquvrdmoyjgzgpac';
const BUCKET = process.env.SUPABASE_BUCKET || 'app';
const URL_BASE = `https://${PROJETO}.supabase.co`;

const args = process.argv.slice(2);
const pegarFlag = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};

function lerEnvLocal() {
  const arq = path.join(RAIZ, '.env.publicar');
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
lerEnvLocal();

const CHAVE = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm', gz: 'application/gzip',
  pdf: 'application/pdf', mp4: 'video/mp4', zip: 'application/zip',
};
const mimeDe = (rel) => MIME[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

const IGNORAR = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const PASTAS_IGNORADAS = new Set(['__pycache__', 'node_modules', '.git']);
const ignorar = (nome) => nome.startsWith('.') || IGNORAR.has(nome) ||
  /(?:\.tmp|\.swp|\.orig|\.rej|~|\.pyc|\.pyo)$/.test(nome);

function listar(dir = APP, prefixo = '') {
  const saida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (PASTAS_IGNORADAS.has(entrada.name) || ignorar(entrada.name)) continue;
    const rel = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) saida.push(...listar(path.join(dir, entrada.name), rel));
    else saida.push(rel);
  }
  return saida;
}

async function enviar(rel) {
  const corpo = fs.readFileSync(path.join(APP, rel));
  const alvo = `${URL_BASE}/storage/v1/object/${BUCKET}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const resp = await fetch(alvo, {
    method: 'POST',
    headers: {
      apikey: CHAVE, authorization: `Bearer ${CHAVE}`,
      'content-type': mimeDe(rel), 'x-upsert': 'true',
      'cache-control': 'public, max-age=60',
    },
    body: corpo,
  });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`${rel}: HTTP ${resp.status} ${texto.slice(0, 200)}`);
  }
  return corpo.length;
}

async function conferirSite() {
  const resp = await fetch(`${URL_BASE}/functions/v1/site/version.json?t=${Date.now()}`);
  const tipo = (resp.headers.get('content-type') || '');
  const texto = await resp.text();
  return { status: resp.status, tipo, texto };
}

async function main() {
  const arquivos = listar();
  if (args.includes('--somente-lista')) {
    console.log(arquivos.join('\n'));
    console.log(`\n${arquivos.length} arquivos`);
    return;
  }
  if (!CHAVE) {
    console.error('Falta SUPABASE_KEY (publishable/anon basta: o bucket aceita envio público).\n' +
      'Ex.: SUPABASE_KEY=sb_publishable_… node tools/publicar_supabase.mjs');
    process.exitCode = 2;
    return;
  }
  const so = pegarFlag('--arquivo');
  const lista = so ? [so] : arquivos;
  let bytes = 0, falhas = 0;
  const inicio = Date.now();
  for (const rel of lista) {
    try {
      bytes += await enviar(rel);
      console.log(`  ↑ ${rel}`);
    } catch (e) {
      falhas++;
      console.error(`  ✕ ${e.message}`);
    }
  }
  console.log(`\n${lista.length - falhas}/${lista.length} arquivos publicados (${(bytes / 1048576).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
  const site = await conferirSite().catch((e) => ({ erro: e.message }));
  console.log('Site:', JSON.stringify(site).slice(0, 300));

  const versao = JSON.parse(fs.readFileSync(path.join(APP, 'version.json'), 'utf8'));
  console.log(`\nApp no ar: ${URL_BASE}/functions/v1/site/   (versão ${versao.version})`);
  if (falhas) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
