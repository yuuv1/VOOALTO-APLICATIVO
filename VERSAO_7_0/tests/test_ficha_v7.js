const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
(async () => {
  const oc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const oerr = [];
  const od = new JSDOM(oc, { url: 'http://localhost:4700/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
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
  const t = (label, expr) => { try { const r = ow.eval(expr); console.log('  [OK]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0,90) : ''); return r; } catch(e) { console.log('  [ERR]', label, ':', e.message); return undefined; } };
  console.log('===== FICHA V7 =====');
  t('cloudflare removido', `!document.querySelector('script[src*="cloudflare"]')`);
  t('cropper local', `!!document.querySelector('script[src*="assets/cropper"]')`);
  t('html2canvas local', `!!document.querySelector('script[src*="assets/html2canvas"]')`);
  t('novaFicha definida', `typeof novaFicha`);
  t('abrirPreenchimentoRapido', `abrirPreenchimentoRapido(); !!document.getElementById('v4QuickModal')`);
  t('enviar (prompt cancela)', `window.prompt=()=>null; enviarParaCatalogacao(); 'done'`);
  t('rascunho função', `typeof v4SalvarRascunho`);
  t('v4DraftList estático', `!!document.getElementById('v4DraftList')`);
  t('sidebar: título Ações + descrição', `!!document.querySelector('.sb-section-desc')`);
  t('sidebar: botão primário nova ficha', `!!document.querySelector('.sb-btn-primary')`);
  t('sidebar: botão accent rápido', `!!document.querySelector('.sb-btn-accent')`);
  t('chip prontidão existe', `!!document.getElementById('fichaReadiness')`);
  t('CTA flutuante existe', `!!document.getElementById('fichaFloatCta')`);
  t('sugestões: pool do catálogo', `localStorage.setItem('vooalto_main_catalog_v2', JSON.stringify({orders:[{name:'Escola X',clientPhone:'111'}]})); fichaShowSuggestions; 'ok'`);
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
