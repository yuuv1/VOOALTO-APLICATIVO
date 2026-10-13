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
  const ultimoTema = k => { const ms = frames[k].got.filter(m => m.type === 'vooalto-theme'); return ms.length ? ms[ms.length - 1].theme : null; };
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
  /* V7.3 — só existem dois temas: Claro e Escuro (o resto é convertido) */
  w.postMessage({ type: 'vooalto-theme', theme: 'escuro' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('body escuro', doc.body.dataset.theme === 'escuro' && doc.documentElement.dataset.theme === 'escuro');
  ok('orcamento recebe escuro', ultimoTema('orcamento') === 'escuro');
  ok('--bar-text branco no escuro', doc.documentElement.style.getPropertyValue('--bar-text') === '#fff' && doc.documentElement.style.getPropertyValue('--shell-bg') === '#0b0f17');
  w.eval(`applyThemeFromShell('claro')`);
  await new Promise(r => setTimeout(r, 120));
  ok('principal recebe claro', ultimoTema('principal') === 'claro');
  ok('claro remove o atributo escuro', !doc.documentElement.dataset.theme && !doc.body.dataset.theme);
  ok('--bar-text escuro no claro', doc.documentElement.style.getPropertyValue('--bar-text') === '#17172a' && doc.documentElement.style.getPropertyValue('--shell-bg') === '#eef0ff');
  // nome de tema antigo continua funcionando (converte automaticamente)
  w.eval(`applyThemeFromShell('butter')`);
  await new Promise(r => setTimeout(r, 80));
  ok('tema antigo "butter" -> claro', doc.documentElement.style.getPropertyValue('--shell-bg') === '#eef0ff' && !doc.documentElement.dataset.theme);
  w.postMessage({ type: 'vooalto-theme', theme: 'tech' }, '*');
  await new Promise(r => setTimeout(r, 80));
  ok('tema antigo "tech" -> escuro', doc.documentElement.dataset.theme === 'escuro');
  ok('seletor com 2 opções', (() => { const o = doc.querySelectorAll('#themeSelect option'); return o.length === 2 && o[0].value === 'claro' && o[1].value === 'escuro'; })());
  /* volta ao claro para o resto do teste */
  w.eval(`applyThemeFromShell('claro')`);
  await new Promise(r => setTimeout(r, 60));
  w.postMessage({ type: 'vooalto-switch-tab', tab: 'orcamento' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('orcamento ativo', doc.getElementById('frame-orcamento').classList.contains('active'));
  w.eval(`reloadActive()`);
  ok('reload', frames['orcamento'].reloaded === true);
  ok('ajuda abre', (w.eval(`openHelp()`), doc.getElementById('helpModal').classList.contains('open')));
  ok('ajuda fecha', (w.eval(`closeHelp()`), !doc.getElementById('helpModal').classList.contains('open')));

  // ── V7.1: Ficha Técnica abre como popup dentro do sistema ──
  ok('popup ficha existe', !!doc.getElementById('fichaPopup'));
  ok('iframe ficha dentro do popup', doc.getElementById('fichaPopup').contains(doc.getElementById('frame-ficha')));
  w.eval(`toggleFichaPopup()`);
  ok('toggle abre popup', doc.getElementById('fichaPopup').classList.contains('open'));
  ok('botão ficha ativo com popup aberto', doc.getElementById('btn-ficha').classList.contains('active'));
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc fecha popup', !doc.getElementById('fichaPopup').classList.contains('open'));
  ok('botão ficha inativo após fechar', !doc.getElementById('btn-ficha').classList.contains('active'));
  w.postMessage({ type: 'vooalto-switch-tab', tab: 'ficha' }, '*');
  await new Promise(r => setTimeout(r, 120));
  ok('switch-tab ficha abre popup', doc.getElementById('fichaPopup').classList.contains('open'));
  w.eval(`showProject('principal')`);
  ok('trocar de módulo fecha popup', !doc.getElementById('fichaPopup').classList.contains('open'));
  w.eval(`openFichaPopup(); closeFichaPopup(true)`);
  ok('fechamento silencioso ok', !doc.getElementById('fichaPopup').classList.contains('open'));

  if(errs.length)process.exitCode=1;
  console.log('  page errors:', errs.length ? errs : 'none ✓');
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
