const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
}

(async () => {
  const html = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
  const errs = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4700/criador_orcamento/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.URL.createObjectURL = () => 'blob:test';
      w.addEventListener('error', e => errs.push(e.message));
    }
  });

  const w = dom.window;
  const doc = w.document;
  await new Promise(r => setTimeout(r, 1500));

  const t = expr => {
    try { return w.eval(expr); }
    catch(e) { console.log('  [ERR]', e.message); return undefined; }
  };

  console.log('===== ORÇAMENTO V7: NOVAS FUNCIONALIDADES (COMPACTAÇÃO, RASCUNHO, DUPLICAÇÃO) =====');

  // Add initial item
  t(`addTableRow(); documentPages[0].tableItems[0].modelo='Camisa Polo'; documentPages[0].tableItems[0].qnt=5; documentPages[0].tableItems[0].unit=40; renderItemsEditor(); updatePreviewFromForm(); 'ok'`);

  // 1. Check Compact item cards & Page bar
  check('barra de páginas (orc-page-nav-bar) existe', !!doc.querySelector('.orc-page-nav-bar'));
  check('card de item comprimido (.item-row-card) existe', !!doc.querySelector('.item-row-card'));
  check('topbar do item com subtotal e botões existe', !!doc.querySelector('.orc-item-topbar'));
  check('botão duplicar item (.btn-dup-row) presente no card', !!doc.querySelector('.btn-dup-row'));
  check('botão excluir item (.btn-delete-row) presente no card', !!doc.querySelector('.btn-delete-row'));
  check('inputs compactos presentes', !!doc.querySelector('.orc-input-compact'));

  // 2. Test Item Duplication
  const initialItems = t(`documentPages[0].tableItems.length`);
  t(`duplicateTableRow(0); 'ok'`);
  const itemsAfterDup = t(`documentPages[0].tableItems.length`);
  check('duplica item com sucesso', itemsAfterDup === initialItems + 1, itemsAfterDup);
  check('item duplicado preserva dados do original', t(`documentPages[0].tableItems[1].modelo`) === 'Camisa Polo');
  check('subtotal do item duplicado correto', t(`document.getElementById('form-item-total-1').textContent`) === 'R$ 200,00');

  // 3. Test Page Duplication
  const initialPages = t(`documentPages.length`);
  t(`duplicateDocumentPage(0); 'ok'`);
  const pagesAfterDup = t(`documentPages.length`);
  check('duplica página com sucesso', pagesAfterDup === initialPages + 1, pagesAfterDup);
  check('página duplicada contém itens clonados', t(`documentPages[1].tableItems.length`) === itemsAfterDup);
  check('DOM da página 2 criado no preview', !!doc.getElementById('printable-a4-page-2'));
  check('total geral atualizado após duplicação de página', t(`document.getElementById('orcRunningTotal').textContent`) === 'R$ 800,00');

  // 4. Test Drafts System (Salvar Rascunho)
  check('botão Salvar Rascunho presente no sidebar', !!doc.querySelector('button[onclick*="salvarRascunhoOrcamento"]'));
  check('modal de rascunhos (#orcDraftsModal) existe', !!doc.getElementById('orcDraftsModal'));
  
  // Save draft
  w.prompt = () => 'Meu Rascunho de Teste';
  t(`salvarRascunhoOrcamento(); 'ok'`);
  const drafts = t(`orcGetDrafts()`);
  check('salva rascunho no localStorage', Array.isArray(drafts) && drafts.length >= 1, drafts.length);
  check('nome do rascunho correto', drafts[0].name === 'Meu Rascunho de Teste');

  // Open modal & verify list
  t(`abrirOrcDraftsModal(); 'ok'`);
  check('modal de rascunhos abre', doc.getElementById('orcDraftsModal').style.display === 'flex');
  check('rascunho renderizado na lista', doc.getElementById('orcDraftsList').textContent.includes('Meu Rascunho de Teste'));
  t(`fecharOrcDraftsModal(); 'ok'`);
  check('modal de rascunhos fecha', doc.getElementById('orcDraftsModal').style.display === 'none');

  // Restore draft
  const draftId = drafts[0].id;
  t(`documentPages[0].tableItems[0].modelo = 'Modificado'; 'ok'`);
  t(`orcCarregarRascunho('${draftId}'); 'ok'`);
  check('restaura rascunho com sucesso', t(`documentPages[0].tableItems[0].modelo`) === 'Camisa Polo');

  // Delete draft
  w.confirm = () => true;
  t(`orcExcluirRascunho('${draftId}'); 'ok'`);
  const draftsAfterDel = t(`orcGetDrafts()`);
  check('exclui rascunho com sucesso', !draftsAfterDel.some(d => d.id === draftId));

  console.log('  page errors:', errs.length ? errs : 'none ✓');
  console.log(`\n═══ RESULTADO ORÇAMENTO FEATURES: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
