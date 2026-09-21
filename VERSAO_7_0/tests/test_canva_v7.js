const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
}

(async () => {
  const html = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const errs = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4700/criador_ficha_tecnica/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => errs.push(e.message));
    }
  });

  const w = dom.window;
  const doc = w.document;
  await new Promise(r => setTimeout(r, 1600));

  const t = expr => {
    try { return w.eval(expr); }
    catch(e) { console.log('  [ERR]', e.message); return undefined; }
  };

  console.log('===== CANVA V7: TESTES DE PÁGINAS E FERRAMENTAS =====');
  check('faixa de páginas (#pageStripWrap) existe', !!doc.getElementById('pageStripWrap'));
  check('lista de miniaturas (#pageStripList) existe', !!doc.getElementById('pageStripList'));
  check('botão baixar com seleção existe no sidebar', !!doc.querySelector('.sb-footer .sb-pdf[onclick*="abrirV7Download"]'));
  check('modal de download (#v7DownloadModal) existe', !!doc.getElementById('v7DownloadModal'));
  check('toolbar flutuante (#v7PageToolbar) existe', !!doc.getElementById('v7PageToolbar'));

  // Test strip rendering
  t(`renderPageStrip(); 'ok'`);
  const initialThumbs = doc.querySelectorAll('#pageStripList .v7-thumb').length;
  check('miniatura inicial renderizada', initialThumbs >= 1, initialThumbs);

  // Test adding normal page
  t(`adicionarPagina(); 'ok'`);
  const thumbsAfterAdd = doc.querySelectorAll('#pageStripList .v7-thumb').length;
  check('adiciona página e atualiza faixa', thumbsAfterAdd === initialThumbs + 1, thumbsAfterAdd);

  // Test adding blank page
  t(`adicionarPaginaBranca(); 'ok'`);
  const thumbsAfterBlank = doc.querySelectorAll('#pageStripList .v7-thumb').length;
  check('adiciona página branca e atualiza faixa', thumbsAfterBlank === initialThumbs + 2, thumbsAfterBlank);

  // Test floating toolbar show
  t(`v7MostrarToolbarP1(); 'ok'`);
  check('toolbar flutuante visível após clique/chamada', doc.getElementById('v7PageToolbar').style.display === 'flex');

  // Test download modal open
  t(`abrirV7Download(); 'ok'`);
  check('modal de download abre', doc.getElementById('v7DownloadModal').classList.contains('open'));
  const dlCheckboxes = doc.querySelectorAll('.v7-dl-chk').length;
  check('checkboxes das páginas no modal', dlCheckboxes === thumbsAfterBlank, dlCheckboxes);
  t(`fecharV7Download(); 'ok'`);
  check('modal de download fecha', !doc.getElementById('v7DownloadModal').classList.contains('open'));

  // Test currency mask
  const inputEl = doc.getElementById('entradaVal');
  inputEl.value = '1500';
  t(`v7MascaraEntrada(document.getElementById('entradaVal')); 'ok'`);
  t(`v7MascaraEntradaBlur(document.getElementById('entradaVal')); 'ok'`);
  check('máscara de moeda entrada (1500 -> 1.500,00)', inputEl.value === '1.500,00', inputEl.value);

  // Test text size functions
  check('v7SetTextSize definida', typeof w.v7SetTextSize === 'function');
  check('v7FitTxtExtra definida', typeof w.v7FitTxtExtra === 'function');
  check('v7OrdemIds retorna páginas ordenadas', Array.isArray(t(`v7OrdemIds()`)) && t(`v7OrdemIds()`).length >= 3);

  // Test page undo
  const pidToRemove = t(`paginas[paginas.length-1].id`);
  t(`v7RemoverPaginaComUndo('${pidToRemove}'); 'ok'`);
  const countAfterRemove = doc.querySelectorAll('#pageStripList .v7-thumb').length;
  check('página removida da faixa', countAfterRemove === thumbsAfterBlank - 1, countAfterRemove);

  t(`undo(); 'ok'`);
  const countAfterUndo = doc.querySelectorAll('#pageStripList .v7-thumb').length;
  check('undo restaura página na faixa', countAfterUndo === thumbsAfterBlank, countAfterUndo);

  console.log('  page errors:', errs.length ? errs : 'none ✓');
  console.log(`\n═══ RESULTADO CANVA: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
