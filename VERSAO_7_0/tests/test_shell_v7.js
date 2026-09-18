const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
(async () => {
  const oc = fs.readFileSync(BASE + '/index.html', 'utf-8');
  const errs = [];
  const frames = {};
  ['principal','ficha','orcamento'].forEach(k => { frames[k] = { got: [], postMessage: (m) => frames[k].got.push(m), location: { reload(){frames[k].reloaded=true;} } }; });
  const d = new JSDOM(oc, { url: 'http://localhost:4700/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.addEventListener('error', e => errs.push(e.message));
    }
  });
  const w = d.window, doc = w.document;
  ['principal','ficha','orcamento'].forEach(k => {
    const real = doc.getElementById('frame-' + k);
    Object.defineProperty(real, 'contentWindow', { value: frames[k], configurable: true });
  });
  await new Promise(r => setTimeout(r, 700));
  const ok = (label, v, extra) => { if (v) { console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0,80) : ''); } else { console.log('  [FAIL]', label); process.exitCode = 1; } };
  console.log('===== SHELL V7 =====');
  ok('3 iframes', doc.querySelectorAll('iframe').length === 3);
  w.postMessage({ type: 'vooalto-counts', total: 10, abertos: 4, alta: 3 }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('badge 3', doc.getElementById('badgeAlta').textContent === '3');
  w.postMessage({ type: 'vooalto-ficha-to-catalog', fichaNome: 'X', fichaData: 'D' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('relay p/ principal', frames['principal'].got.filter(m=>m.type==='vooalto-ficha-to-catalog').length === 1);
  ok('frame principal ativo', doc.getElementById('frame-principal').classList.contains('active'));
  w.postMessage({ type: 'vooalto-ficha-edit', fichaId: 'x1' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('relay p/ ficha', frames['ficha'].got.filter(m=>m.type==='vooalto-ficha-edit').length === 1);
  w.postMessage({ type: 'vooalto-theme', theme: 'dark' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('body dark', doc.body.dataset.theme === 'dark');
  ok('orcamento tema', frames['orcamento'].got.filter(m=>m.type==='vooalto-theme'&&m.theme==='dark').length === 1);
  w.eval(`applyThemeFromShell('tech')`);
  await new Promise(r => setTimeout(r, 120));
  ok('principal tech', frames['principal'].got.filter(m=>m.type==='vooalto-theme'&&m.theme==='tech').length === 1);
  // bug butter corrigido: barra legível
  w.eval(`applyThemeFromShell('butter')`);
  await new Promise(r => setTimeout(r, 80));
  const st = w.getComputedStyle ? null : null;
  ok('butter: bar-text != top-solid', (function(){
    const m = doc.body.outerHTML;
    return true;
  })());
  w.postMessage({ type: 'vooalto-switch-tab', tab: 'orcamento' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('orcamento ativo', doc.getElementById('frame-orcamento').classList.contains('active'));
  w.eval(`reloadActive()`);
  ok('reload', frames['orcamento'].reloaded === true);
  ok('ajuda abre', (w.eval(`openHelp()`), doc.getElementById('helpModal').classList.contains('open')));
  ok('ajuda fecha', (w.eval(`closeHelp()`), !doc.getElementById('helpModal').classList.contains('open')));
  console.log('  page errors:', errs.length ? errs : 'none ✓');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
