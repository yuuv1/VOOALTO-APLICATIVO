const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
}
async function loadOrc() {
  const oc = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
  const errs = [];
  const d = new JSDOM(oc, { url: 'http://localhost:4700/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.URL.createObjectURL = w.URL.createObjectURL || (() => 'blob:test');
      w.addEventListener('error', e => errs.push(e.message));
    }
  });
  await new Promise(r => setTimeout(r, 1400));
  return { w: d.window, d: d.window.document, errs };
}
async function main() {
  console.log('===== UX V7: ORÇAMENTO =====');
  const { w, d, errs } = await loadOrc();
  const t = (expr) => { try { const r = w.eval(expr); return r; } catch(e) { console.log('  [ERR] eval:', e.message); return undefined; } };
  check('barra total existe', !!d.getElementById('orcRunningTotal'));
  t(`addTableRow(); documentPages[0].tableItems[0].modelo='Camiseta'; documentPages[0].tableItems[0].qnt=10; documentPages[0].tableItems[0].unit=20; renderItemsEditor(); updatePreviewFromForm(); 'ok'`);
  check('total geral R$ 200,00', t(`document.getElementById('orcRunningTotal').textContent`) === 'R$ 200,00', t(`document.getElementById('orcRunningTotal').textContent`));
  check('total do item 1', t(`document.getElementById('form-item-total-0').textContent`) === 'R$ 200,00');
  t(`duplicateTableRow(0); 'ok'`);
  check('duplicou para 2 itens', t(`documentPages[0].tableItems.length`) === 2);
  check('total geral R$ 400,00 após dup', t(`document.getElementById('orcRunningTotal').textContent`) === 'R$ 400,00');
  t(`document.getElementById('form-item-modelo-0').focus(); document.getElementById('form-item-modelo-0').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); 'ok'`);
  check('Enter avança p/ tecido', t(`document.activeElement.id`) === 'form-item-tecido-0');
  t(`document.getElementById('form-item-unit-1').focus(); document.getElementById('form-item-unit-1').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); 'ok'`);
  check('Enter no fim cria item 3', t(`documentPages[0].tableItems.length`) === 3);
  check('numeração A4', t(`document.getElementById('preview-budget-number-1').textContent`) === 'Orçamento Nº 0001', t(`document.getElementById('preview-budget-number-1').textContent`));
  check('sem campo cliente (V6)', t(`!document.getElementById('edit-client-name')`) === true);
  console.log('  page errors:', errs.length ? errs : 'none ✓');

  console.log('===== UX V7: PRINCIPAL =====');
  const pc = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
  const perrs = [];
  const pd = new JSDOM(pc, { url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w2) {
      w2.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w2.print = () => {};
      w2.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t2,p2)=> (p2==='canvas'?this:()=>({width:50})), set:()=>true }); };
      w2.addEventListener('error', e => perrs.push(e.message));
    }
  });
  const pw = pd.window, pdoc = pd.window.document;
  await new Promise(r => setTimeout(r, 1400));
  const pt = (expr) => { try { return pw.eval(expr); } catch(e) { console.log('  [ERR]', e.message); return undefined; } };
  pt(`state.orders.push({id:'a1',name:'Ficha Antiga',clientPhone:'',createdAt:'16/08/2026',createdTs:Date.now()-30*864e5,status:'alta',note:'',medDays:15,highDays:22,fichaData:'D',fichaNum:'',pdfStored:false});
      state.orders.push({id:'b1',name:'Ficha Nova',clientPhone:'',createdAt:'15/09/2026',createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,fichaData:'D',fichaNum:'',pdfStored:false});
      save(); renderAll(); 'ok'`);
  check('5 chips renderizados', pdoc.querySelectorAll('.prio-chip').length === 5, pdoc.querySelectorAll('.prio-chip').length);
  check('chip Alta count=1', pt(`Array.from(document.querySelectorAll('.prio-chip')).find(b=>b.textContent.includes('Alta')).querySelector('.pc-n').textContent`) === '1');
  pt(`setPrioFocus('alta'); 'ok'`);
  check('focus-one ativo', pdoc.getElementById('columns').classList.contains('focus-one'));
  check('só 1 coluna visível', pdoc.querySelectorAll('#columns .column').length === 1);
  pt(`setPrioFocus('all'); 'ok'`);
  check('volta a 4 colunas', pdoc.querySelectorAll('#columns .column').length === 4);
  console.log('  page errors:', perrs.length ? perrs : 'none ✓');

  console.log('===== UX V7: FICHA =====');
  const fc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const ferrs = [];
  const fd = new JSDOM(fc, { url: 'http://localhost:4700/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w3) {
      w3.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w3.print = () => {};
      w3.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t4,p4)=> (p4==='canvas'?this:()=>{}), set:()=>true }); };
      w3.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w3.addEventListener('error', e => ferrs.push(e.message));
      w3.localStorage.setItem('vooalto_main_catalog_v2', JSON.stringify({ orders:[ { id:'c1', name:'Escola Municipal Centro', clientPhone:'62 99999-0001' } ], thresholds:{low:0,med:15,high:22} }));
    }
  });
  const fw = fd.window;
  await new Promise(r => setTimeout(r, 1600));
  const ft = (expr) => { try { return fw.eval(expr); } catch(e) { console.log('  [ERR]', e.message); return undefined; } };
  ft(`fichaUpdateReadiness(); 'ok'`);
  check('readiness pendente no início', ft(`document.getElementById('fichaReadiness').textContent.includes('falta')`));
  ft(`document.getElementById('dc_nome').textContent='Escola Municipal Centro'; document.getElementById('dc_tel').textContent='62 99999-0001'; fichaUpdateReadiness(); 'ok'`);
  ft(`(function(){const i=document.querySelector('#prodLinhas tr input'); if(i) i.value='Camiseta polo';})(); fichaUpdateReadiness(); 'ok'`);
  check('readiness pronta', ft(`document.getElementById('fichaReadiness').textContent`) === '✓ pronta p/ envio');
  ft(`document.getElementById('dc_nome').textContent='Esco'; fichaShowSuggestions(); 'ok'`);
  check('sugestões visíveis', ft(`document.getElementById('fichaSugBox').style.display === 'block'`));
  ft(`document.querySelector('#fichaSugBox .fsug-item').dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); 'ok'`);
  check('sugestão aplica nome+tel', ft(`document.getElementById('dc_nome').textContent + ' | ' + document.getElementById('dc_tel').textContent`) === 'Escola Municipal Centro | 62 99999-0001');
  check('cliente lembrado no LS', ft(`(JSON.parse(localStorage.getItem('vooalto_ficha_clientes_v7')||'{}')['Escola Municipal Centro'])`) === '62 99999-0001');
  ft(`toggleSidebar(); 'ok'`);
  check('CTA flutuante ao recolher', ft(`document.getElementById('fichaFloatCta').style.display === 'flex'`));
  ft(`toggleSidebar(); 'ok'`);
  check('CTA some ao expandir', ft(`document.getElementById('fichaFloatCta').style.display === 'none'`));
  ft(`abrirPreenchimentoRapido(); 'ok'`);
  await new Promise(r => setTimeout(r, 100));
  ft(`document.getElementById('v4qCliente').focus(); document.getElementById('v4qCliente').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); 'ok'`);
  check('Enter modal avança p/ Vendedor', ft(`document.activeElement.id`) === 'v4qVendedor');
  check('sidebar: descrições (4 seções)', fw.eval(`document.querySelectorAll('.sb-section-desc').length`) >= 4);
  check('export: v7-exporting classe existe no CSS', fw.eval(`(function(){const s=[...document.styleSheets].flatMap(x=>{try{return[...x.cssRules]}catch(e){return[]}}).map(r=>r.cssText).join(''); return s.includes('.v7-exporting .dc-inp:empty::before')})()`));
  console.log('  page errors:', ferrs.length ? ferrs : 'none ✓');

  console.log(`\n═══ RESULTADO: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
