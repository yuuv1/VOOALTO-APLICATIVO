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
  const d = new JSDOM(oc, { url: 'http://localhost:4800/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true,
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
  console.log('===== UX V8: ORÇAMENTO =====');
  const { w, d, errs } = await loadOrc();
  const t = (expr) => { try { return w.eval(expr); } catch(e) { fail++;console.log('  [ERR] eval:', e.message);return undefined; } };
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
  check('sem numeração A4', t(`!document.getElementById('preview-budget-number-1')`) === true);
  check('sem campo cliente (V6)', t(`!document.getElementById('edit-client-name')`) === true);
  // ── V7.1: data da proposta sempre no dia atual ──
  const hojeBR = String(new Date().getDate()).padStart(2,'0') + '/' + String(new Date().getMonth()+1).padStart(2,'0') + '/' + new Date().getFullYear();
  check('data da proposta = hoje', t(`document.getElementById('edit-proposal-date').value`) === hojeBR, t(`document.getElementById('edit-proposal-date').value`));
  t(`document.getElementById('edit-proposal-date').value='01/01/2020'; orcDayTick(); 'ok'`);
  check('virada do dia atualiza a data', t(`document.getElementById('edit-proposal-date').value`) === hojeBR);
  if(errs.length)fail++;
  console.log('  page errors:', errs.length ? errs : 'none ✓');

  /* V8: a Catalogação saiu do sistema; as verificações de prioridade/colunas
     saíram junto. Ficam Orçamento e Ficha Técnica. */

  console.log('===== UX V8: FICHA =====');
  const fc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const ferrs = [];
  const fd = new JSDOM(fc, { url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w3) {
      w3.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w3.print = () => {};
      w3.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t4,p4)=> (p4==='canvas'?this:()=>{}), set:()=>true }); };
      w3.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w3.addEventListener('error', e => ferrs.push(e.message));
      /* V8: sem catalogo — os clientes conhecidos vêm do que o próprio
         criador de ficha lembra (vooalto_ficha_clientes_v7). */
      w3.localStorage.setItem('vooalto_ficha_clientes_v7', JSON.stringify({ 'Escola Municipal Centro':'62 99999-0001' }));
    }
  });
  const fw = fd.window;
  await new Promise(r => setTimeout(r, 1600));
  const ft = (expr) => { try { return fw.eval(expr); } catch(e) { fail++;console.log('  [ERR]', e.message);return undefined; } };
  ft(`fichaUpdateReadiness(); 'ok'`);
  check('readiness pendente no início', ft(`document.getElementById('fichaReadiness').textContent.includes('falta')`));
  ft(`document.getElementById('dc_nome').textContent='Escola Municipal Centro'; document.getElementById('dc_tel').textContent='62 99999-0001'; fichaUpdateReadiness(); 'ok'`);
  ft(`(function(){const i=document.querySelector('#prodLinhas tr input'); if(i) i.value='Camiseta polo';})(); fichaUpdateReadiness(); 'ok'`);
  check('readiness pronta', ft(`document.getElementById('fichaReadiness').textContent`) === '✓ completa');
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
  /* a ordem dos campos mudou na V8 (entraram CPF, endereço, cidade, CEP…),
     então o teste confere a REGRA — Enter vai para o campo seguinte — e não
     um id fixo, que quebraria a cada campo novo. */
  check('Enter modal avança para o próximo campo', ft(`(function(){var ins=[...document.querySelectorAll('#v4QuickModal input')];return ins.indexOf(document.activeElement)===1&&ins[1].id==='v4qDoc'})()`) === true);

  // ── V7.1: preenchimento rápido guiado (modelos, grade, totais, clientes) ──
  check('modal pré-carrega modelos da ficha', ft(`document.querySelectorAll('#v4ModelRows tr').length`) >= 1);
  ft(`document.getElementById('v4ModelRows').innerHTML=''; v4AddModeloRow('Camiseta teste','25,00','10'); 'ok'`);
  check('total ao vivo R$ 250,00', ft(`document.getElementById('v4qTotal').textContent`) === 'R$\u00a0250,00');
  check('peças 0 antes da grade', ft(`document.getElementById('v4qPecas').textContent`) === '0 peças');
  ft(`document.getElementById('v4g_m_M').value='10'; v4QuickTotals(); 'ok'`);
  check('peças 10 na grade', ft(`document.getElementById('v4qPecas').textContent`) === '10 peças');
  check('datalist clientes populado', ft(`document.getElementById('v4qClientesDL').options.length`) >= 1);
  ft(`aplicarPreenchimentoRapido(); 'ok'`);
  check('modelo aplicado na ficha', ft(`document.querySelector('#prodLinhas tr input').value`) === 'Camiseta teste');
  check('total da ficha R$ 250,00', ft(`document.getElementById('totalDisp').textContent`) === 'R$\u00a0250,00');
  check('grade M=10 aplicada', ft(`document.querySelector('.gi[data-g="m"]').value === '' && document.querySelectorAll('.gi[data-g="m"]')[2].value`) === '10');
  check('modal fechou após aplicar', ft(`!document.getElementById('v4QuickModal').classList.contains('open')`));

  // ── data da ficha no dia atual (fuso local, não UTC) ──
  const isoHoje = new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-' + String(new Date().getDate()).padStart(2,'0');
  check('ficha: data = hoje (fuso local)', ft(`document.getElementById('fichaData').value`) === isoHoje, ft(`document.getElementById('fichaData').value`));
  ft(`document.getElementById('fichaData').value=''; v7FichaDayTick(); 'ok'`);
  check('ficha: day tick preenche data vazia', ft(`document.getElementById('fichaData').value`) === isoHoje);
  ft(`document.getElementById('fichaData').value='2020-01-01'; document.getElementById('dc_nome').textContent='Cliente Teste'; v7FichaDayTick(); 'ok'`);
  check('ficha com conteúdo mantém a data', ft(`document.getElementById('fichaData').value`) === '2020-01-01');
  check('sidebar: descrições (4 seções)', fw.eval(`document.querySelectorAll('.sb-section-desc').length`) >= 4);
  check('export: v7-exporting classe existe no CSS', fw.eval(`(function(){const s=[...document.styleSheets].flatMap(x=>{try{return[...x.cssRules]}catch(e){return[]}}).map(r=>r.cssText).join(''); return s.includes('.v7-exporting .dc-inp:empty::before')})()`));
  if(ferrs.length)fail++;
  console.log('  page errors:', ferrs.length ? ferrs : 'none ✓');

  console.log(`\n═══ RESULTADO: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
