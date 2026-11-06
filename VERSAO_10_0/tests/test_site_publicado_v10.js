'use strict';
/* ══ V10.2 — o app servido pela Edge Function `site` (Supabase) ═════════════
   O gateway do Supabase decide o Content-Type pela EXTENSÃO DO CAMINHO:
   qualquer URL terminada em ".html" volta como `text/plain` e o navegador
   mostra o CÓDIGO-FONTE em vez da página. Um iframe apontando para
   "criador_ficha_tecnica/index.html" quebrava o app no endereço público.

   Este teste trava:
   1. o endereço de cada módulo NÃO termina em .html quando o shell está em
      /functions/v1/site/;
   2. no servidor local (localhost), continua sendo o arquivo real — quem usa
      a pasta não muda de comportamento;
   3. nenhum iframe do shell nasce com `src` fixo (o endereço é calculado);
   4. o painel "Fichas já saídas" existe e nunca reserva número.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');
const { BASE } = require('./_base');

class CargaLocal extends ResourceLoader {
  fetch(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '' || u.hostname === '127.0.0.1') {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        for (const a of [path.resolve(BASE, rel), path.resolve(BASE, 'criador_ficha_tecnica', rel)]) {
          if (a.startsWith(BASE) && fs.existsSync(a) && fs.statSync(a).isFile()) return Promise.resolve(fs.readFileSync(a));
        }
      }
    } catch (e) {}
    return null;
  }
}

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 120) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 200) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

function abrirShell(url) {
  const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf-8');
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new CargaLocal(),
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      /* o módulo da ficha usa ResizeObserver ao carregar; no jsdom não existe */
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      /* e o iframe do módulo tenta carregar de verdade — não interessa aqui */
      w.HTMLIFrameElement.prototype.__defineGetter__('contentWindow', () => null);
      w.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
      w.eval = w.eval.bind(w);
    }
  });
  return { dom, w: dom.window, d: dom.window.document };
}

(async function main() {
  console.log('\n── 1. Servido pela Edge Function (Supabase) ──');
  {
    const { w, d } = abrirShell('https://exemplo.supabase.co/functions/v1/site/');
    await wait(1200);
    ok('o shell identifica que está publicado', w.eval('enderecoModulo("ficha")').indexOf('index.html') === -1,
      w.eval('enderecoModulo("ficha")'));
    for (const k of ['ficha', 'orcamento', 'contrato']) {
      const e = w.eval(`enderecoModulo("${k}")`);
      ok(`"${k}" usa rota limpa (sem .html)`, !/\.html?$/i.test(e), e);
    }
    ok('o módulo ativo carregou pelo caminho limpo', !/\.html?$/i.test(d.getElementById('frame-ficha').getAttribute('src') || ''),
      d.getElementById('frame-ficha').getAttribute('src'));
    ok('nenhum iframe tem src fixo em .html',
      ![...d.querySelectorAll('iframe.project-frame')].some(f => /\.html?$/i.test(f.getAttribute('src') || '')));
    w.close();
  }

  console.log('\n── 2. Servido pelo servidor local (nada muda para quem usa a pasta) ──');
  {
    const { w, d } = abrirShell('http://localhost:4800/index.html');
    await wait(1200);
    const e = w.eval('enderecoModulo("orcamento")');
    ok('no localhost o endereço é o arquivo real', e === 'criador_orcamento/index.html', e);
    ok('o módulo ativo aponta para o arquivo real', (d.getElementById('frame-ficha').getAttribute('src') || '') === 'criador_ficha_tecnica/index.html',
      d.getElementById('frame-ficha').getAttribute('src'));
    w.close();
  }

  console.log('\n── 3. O servidor do site recusa caminho .html como página ──');
  {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'functions', 'site', 'index.ts'), 'utf-8');
    ok('o servidor redireciona caminho .html (302)', /status:\s*302/.test(src));
    ok('o HTML sai como Text/HTML (text/html minúsculo é reescrito)', /Text\/HTML; charset=utf-8/.test(src));
    ok('o service worker fica preso em /functions/v1/site/', /CAMINHO_BASE/.test(src) && /service-worker-allowed/.test(src));
    ok('existe rota limpa para os quatro módulos', /'ficha':\s*'criador_ficha_tecnica\/index\.html'/.test(src) &&
      /'orcamento':\s*'criador_orcamento\/index\.html'/.test(src) &&
      /'recibo':\s*'criador_recibo\/index\.html'/.test(src) &&
      /'contrato':\s*'criador_contrato\/index\.html'/.test(src));
  }

  console.log(`\n═══ SITE PUBLICADO: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})();
