'use strict';
/* V8 — Ficha Técnica: carregamento sem erro, autosave descarregado no pagehide,
   dependências locais, e as funções da barra lateral (que na V8 passam por
   "Minhas fichas" em vez de "Enviar para Catalogação"). */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

/* A chave do autosave NÃO mudou de nome na V8: manter 'vooalto_v7_ficha_ativa'
   é o que faz a ficha em andamento da V7 continuar abrindo. */
const AUTOSAVE_KEY = 'vooalto_v7_ficha_ativa';

(async () => {
  const oc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const oerr = [];
  const od = new JSDOM(oc, { url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => oerr.push(e.message));
    }
  });
  const ow = od.window;
  await new Promise(r => setTimeout(r, 1600));
  let fail = 0;
  const t = (label, expr) => {
    try {
      const r = ow.eval(expr), ok = r !== undefined && r !== null && r !== false;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0,90) : '');
      if (!ok) fail++;
      return r;
    } catch(e) { fail++; console.log('  [ERR]', label, ':', e.message); return undefined; }
  };
  console.log('===== FICHA V8 =====');

  ow.document.getElementById('dc_nome').textContent = 'Teste autosave fechamento';
  t('pagehide descarrega autosave imediatamente',
    `v7Autosave(); window.dispatchEvent(new Event('pagehide')); localStorage.getItem(${JSON.stringify(AUTOSAVE_KEY)})`);
  const savedFicha = JSON.parse(ow.localStorage.getItem(AUTOSAVE_KEY) || 'null');
  const autosaveOk = !!savedFicha && savedFicha.dc_nome === 'Teste autosave fechamento';
  console.log(autosaveOk ? '  [OK]' : '  [FAIL]', 'autosave guardou o cliente digitado');
  if (!autosaveOk) fail++;

  t('cloudflare removido', `!document.querySelector('script[src*="cloudflare"]')`);
  t('cropper local', `!!document.querySelector('script[src*="assets/cropper"]')`);
  t('html2canvas local', `!!document.querySelector('script[src*="assets/html2canvas"]')`);
  t('pdf.js não é mais carregado (saiu com a Catalogação)', `!document.querySelector('script[src*="pdf"]')`);

  /* ── Barra lateral / ações da V8 ── */
  t('novaFicha definida', `typeof novaFicha`);
  t('v8NovaFicha definida', `typeof v8NovaFicha`);
  t('v8SalvarFicha definida', `typeof v8SalvarFicha`);
  t('abrirPreenchimentoRapido', `abrirPreenchimentoRapido(); !!document.getElementById('v4QuickModal')`);
  t('rascunho: atalho antigo continua existindo', `typeof v4SalvarRascunho`);
  t('lista Minhas fichas no lugar de Rascunhos+Recentes', `!!document.getElementById('v8FichasList') && !document.getElementById('v4DraftList') && !document.getElementById('fichasRecentesList')`);
  t('sidebar: título Ações + descrição', `!!document.querySelector('.sb-section-desc')`);
  t('sidebar: botão primário nova ficha', `!!document.querySelector('.sb-btn-primary')`);
  t('sidebar: botão accent rápido', `!!document.querySelector('.sb-btn-accent')`);
  t('chip prontidão existe', `!!document.getElementById('fichaReadiness')`);
  t('CTA flutuante existe', `!!document.getElementById('fichaFloatCta')`);
  t('ficha tem conteúdo quando o cliente está preenchido', `v8FichaTemConteudo()`);
  t('ficha vazia não tem conteúdo', `(function(){document.getElementById('dc_nome').textContent='';layers.length=0;return !v8FichaTemConteudo()})()`);

  /* v8FichaAtualId é escrito por restaurarDeJSON/limparParaNovaFicha, que ficam
     em blocos ANTERIORES ao módulo Minhas fichas. Com `let` isso seria zona
     morta temporal (ReferenceError) se alguma delas rodasse durante a carga. */
  const declaracao = oc.indexOf('var v8FichaAtualId');
  const primeiroUso = oc.search(/\n\s*v8FichaAtualId\s*=/);
  t('v8FichaAtualId declarado com var antes do primeiro uso',
    declaracao > -1 && primeiroUso > declaracao, { declaracao, primeiroUso });

  /* ── O que a V8 removeu: nenhum caminho para a Catalogação ── */
  t('enviarParaCatalogacao não existe mais', `typeof enviarParaCatalogacao === 'undefined'`);
  t('sem listener de edição vinda do catálogo', `!${JSON.stringify(oc)}.includes('vooalto-ficha-edit')`);
  t('pool de clientes não lê mais o catálogo', `!${JSON.stringify(oc)}.includes('vooalto_main_catalog_v2')`);
  t('sugestões de clientes seguem funcionando com o que o módulo lembra',
    `localStorage.setItem('vooalto_ficha_clientes_v7', JSON.stringify({'Escola X':'111'})); document.getElementById('dc_nome').textContent='Esco'; fichaShowSuggestions(); document.getElementById('fichaSugBox').style.display==='block'`);

  if (oerr.length) fail++;
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  console.log(fail ? `\n═══ FICHA V8: ${fail} FALHA(S) ═══` : '\n═══ FICHA V8: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
