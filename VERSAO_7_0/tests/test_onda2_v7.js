'use strict';
/* V7.4 — Onda 2 (desempenho) da Catalogação:
   A2: o CSS do modo coluna expandida saiu da pilha de patches (o teste de
       cascata equivalente está em tests/test_css_expandido_v7.py);
   A4: miniatura do card expandido gasta muito menos memória — escala 1.5, teto
       de 8, reaproveita o próprio canvas (sem cópia) e some ao recolher a coluna;
   A8: digitar na busca não re-renderiza mais a tela a cada tecla (debounce). */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

const dash = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
let fail = 0;
const statik = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label); if (!ok) fail++; };
const t = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label, '->', ok); if (!ok) fail++; };

console.log('===== ONDA 2 V7.4 — ESTÁTICO =====');
/* A2 — pilha de patches nao volta */
const regrasCard = (dash.match(/\.columns\.expanded \.expanded-pdf-card\{/g) || []).length;
statik(`A2: altura do card em 3 regras (base + 2 faixas) — encontradas ${regrasCard}`, regrasCard === 3);
statik('A2: nenhuma altura antiga sobrou (560/580/620/720/800px no card)',
  !/expanded-pdf-card\{[^}]*height:(560|580|620|720|800)px/.test(dash));
const blocoExpandido = [...dash.matchAll(/\.columns\.expanded \.expanded-pdf[^{]*\{[^}]*\}/g)].map(m => m[0]);
statik(`A2: bloco expandido sem !important (${blocoExpandido.filter(r => r.includes('!important')).length} sobraram)`,
  blocoExpandido.every(r => !r.includes('!important')));
statik('A2: faixas de tela preservadas (285x465 em telas grandes, 210x360 em pequenas)',
  /\.expanded-pdf-card\{[^}]*flex-basis:285px[^}]*height:465px/.test(dash)
  && /\.expanded-pdf-card\{[^}]*height:360px/.test(dash));

/* A4 — memoria da miniatura */
statik('A4: miniatura em escala 1.5 (antes 2.0)', dash.includes('getViewport({scale:1.5})') && !dash.includes('getViewport({scale:2.0})'));
statik('A4: teto de 8 miniaturas em cache (antes 30)', dash.includes('_capMap(_thumbCacheHQ,8)') && !dash.includes('_capMap(_thumbCacheHQ,30)'));
statik('A4: card usa o canvas do cache (sem copiar pixels para um canvas novo)',
  !dash.includes('display.width=thumb.width') && /box\.appendChild\(thumb\);box\.dataset\.loaded='1'/.test(dash));
statik('A4: recolher a coluna libera a memória das miniaturas',
  /const fechando=\(expandedColumn===k\);expandedColumn=fechando\?null:k;if\(fechando\)\{_thumbCacheHQ\.clear\(\);/.test(dash));

/* A8 — debounce da busca */
statik('A8: existe a versão com debounce', dash.includes('function renderCatalogSoon()') && dash.includes('_renderSoonTimer'));
statik('A8: a busca usa o debounce (não renderCatalog direto)', /id="search"[^>]*oninput="renderCatalogSoon\(\)"/.test(dash));
statik('A8: debounce de 150 ms', /_renderSoonTimer=setTimeout\(\(\)=>\{_renderSoonTimer=null;renderCatalog\(\)\},150\)/.test(dash));

/* ---------------------------------------------------------------- jsdom */
function stubPdfJs(w) {
  const pagina = () => ({
    getViewport: ({ scale }) => ({ width: Math.round(595 * scale), height: Math.round(842 * scale) }),
    render: () => ({ promise: Promise.resolve(), cancel() {} })
  });
  w.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => pagina(), destroy: async () => {} }) })
  };
}

async function abrir() {
  const erros = [];
  const dom = new JSDOM(dash, {
    url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t2, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
      w.addEventListener('error', e => erros.push(e.message));
      stubPdfJs(w);
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 1200));
  w.eval(`state.orders.push({id:'p1',name:'Ficha com PDF',clientPhone:'',createdAt:today(),createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,pdfName:'f.pdf',pdfData:'data:application/pdf;base64,AAAA'});
          save(); renderAll();`);
  return { dom, w, erros };
}

(async () => {
  console.log('===== ONDA 2 V7.4 — jsdom =====');
  {
    const { dom, w, erros } = await abrir();

    /* A8 — digitar na busca espera a digitação parar */
    w.eval(`window.__renderCount=0; const __orig=window.renderCatalog; window.renderCatalog=function(){window.__renderCount++;return __orig.apply(this,arguments);};`);
    w.eval(`const el=document.getElementById('search'); el.value='ficha'; el.dispatchEvent(new Event('input'));`);
    const imediato = w.eval('window.__renderCount');
    await new Promise(r => setTimeout(r, 30));
    const em30ms = w.eval('window.__renderCount');
    await new Promise(r => setTimeout(r, 320));
    const depois = w.eval('window.__renderCount');
    t('A8: nada de re-render nos primeiros 30 ms', imediato === 0 && em30ms === 0);
    t('A8: 1 re-render depois que a digitação para', depois === 1);

    /* A4 — miniatura reaproveitada, sem canvas duplicado */
    w.eval(`window.toggleColumnExpand('baixa')`);
    await new Promise(r => setTimeout(r, 900));
    const miniaturas = w.eval('document.querySelectorAll("[data-expanded-pdf] canvas").length');
    const cacheSize = w.eval('_thumbCacheHQ.size');
    t('A4: card expandido mostrou 1 miniatura', miniaturas === 1);
    t('A4: miniatura guardada uma vez no cache', cacheSize === 1);
    const mesmaInstancia = await w.eval('(async()=>{const c=await getThumbHQ("p1");return c===document.querySelector("[data-expanded-pdf] canvas");})()');
    t('A4: o card usa o MESMO canvas do cache (sem cópia de pixels)', mesmaInstancia === true);
    const memoriaPx = w.eval('(function(){const c=_thumbCacheHQ.get("p1");return c?c.width+"x"+c.height:"sem canvas"})()');
    console.log(`  miniatura em memória: ${memoriaPx} (escala 1.5 de uma A4)`);

    /* A4 — recolher a coluna libera a memória */
    w.eval(`window.toggleColumnExpand('baixa')`);
    await new Promise(r => setTimeout(r, 250));
    t('A4: cache de miniaturas zerado ao recolher a coluna', w.eval('_thumbCacheHQ.size') === 0);
    t('sem erros de página', erros.length === 0);
    if (erros.length) console.log('   erros:', erros.slice(0, 4));
    dom.window.close();
  }
  console.log(fail ? `\n═══ ONDA 2: ${fail} FALHA(S) ═══` : '\n═══ ONDA 2: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})();
