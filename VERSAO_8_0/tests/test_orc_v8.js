const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const oc = fs.readFileSync(require('./_base').BASE + '/criador_orcamento/index.html', 'utf-8');
  const oerr = [];
  const od = new JSDOM(oc, { url: 'http://localhost:4800/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.URL.createObjectURL = w.URL.createObjectURL || (() => 'blob:test');
      w.addEventListener('error', e => oerr.push(e.message));
    }
  });
  const ow = od.window, d = od.window.document;
  await new Promise(r => setTimeout(r, 1500));
  let fail=0;
  const t = (label, expr) => {
    try {
      const r=ow.eval(expr),ok=r!==undefined&&r!==null&&r!==false;
      console.log(ok?'  [OK]':'  [FAIL]',label,r!==undefined?'-> '+JSON.stringify(r).slice(0,90):'');
      if(!ok)fail++;
      return r;
    } catch(e) { fail++;console.log('  [ERR]',label,':',e.message);return undefined; }
  };
  console.log('===== ORCAMENTO V7b (interface V6 + infra V7) =====');
  t('poppins local', `!document.querySelector('link[href*="fonts.googleapis"]')`);
  t('html2canvas local', `!!document.querySelector('script[src="../assets/html2canvas.min.js"]')`);
  t('logo local', `document.getElementById('preview-logo-1').src.includes('logo_orcamento.png')`);
  t('modal settings presente', `!!document.getElementById('budget-settings-modal')`);
  t('setup modal V6 (geral/termos/assinatura no ⚙️)', `!!document.getElementById('budget-settings-content') && document.getElementById('budget-settings-content').children.length >= 3`);
  t('sem tab cliente (voltou ao V6)', `!document.getElementById('tab-cliente')`);
  t('tabs-nav simples (Itens + gear)', `document.querySelectorAll('.tabs-nav .tab-btn').length`);
  t('sem numero no A4', `!document.getElementById('preview-budget-number-1')`);
  t('campo V6: telefone', `!!document.getElementById('edit-phone')`);
  t('campo V6: validade', `!!document.getElementById('edit-validity')`);
  t('barra total', `!!document.getElementById('orcRunningTotal')`);
  t('item + total', `addTableRow(); documentPages[0].tableItems[0].qnt=20; documentPages[0].tableItems[0].unit=35.5; renderItemsEditor(); updatePreviewFromForm(); document.getElementById('preview-item-total-1-0').textContent.trim() + ' | ' + document.getElementById('form-item-total-0').textContent + ' | ' + document.getElementById('orcRunningTotal').textContent`);
  t('duplicar', `duplicateTableRow(0); documentPages[0].tableItems.length + ' | ' + document.getElementById('orcRunningTotal').textContent`);
  t('Enter avança', `document.getElementById('form-item-modelo-0').focus(); document.getElementById('form-item-modelo-0').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); document.activeElement.id`);
  t('Enter no fim cria item', `document.getElementById('form-item-unit-1').focus(); document.getElementById('form-item-unit-1').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); documentPages[0].tableItems.length`);
  t('botoes novo/json', `!!document.getElementById('orcJsonInput') && typeof novoOrcamento === 'function' && typeof exportarOrcamentoJSON === 'function'`);
  await new Promise(r => setTimeout(r, 900));
  t('autosave gravado', `(localStorage.getItem('vooalto_orcamento_autosave_v7')||'').length > 100`);
  t('pagehide grava a última edição sem esperar o debounce', `document.getElementById('edit-phone').value='62 99999-1234'; scheduleOrcautosave(); window.dispatchEvent(new Event('pagehide')); JSON.parse(localStorage.getItem('vooalto_orcamento_autosave_v7')).form.phone`);
  const flushedPhone=JSON.parse(ow.localStorage.getItem('vooalto_orcamento_autosave_v7')||'{}').form?.phone;
  if(flushedPhone!=='62 99999-1234')throw new Error('Autosave do Orçamento não descarregou a última edição');
  t('novo orcamento', `window.confirm=()=>true; novoOrcamento(); documentPages.length + ' | ' + documentPages[0].tableItems.length`);
  t('add page 2', `addDocumentPage(); documentPages.length + ' | ' + !!document.getElementById('printable-a4-page-2')`);
  t('remove page 2', `removeActiveDocumentPage(); documentPages.length + ' | ' + !document.getElementById('printable-a4-page-2')`);
  t('tema global fn', `typeof applyGlobalTheme === 'function'`);
  t('tema: aplica data-theme no <html>', `applyGlobalTheme('escuro'); document.documentElement.dataset.theme==='escuro'`);
  t('tema: claro volta para claro', `applyGlobalTheme('claro'); document.documentElement.dataset.theme==='claro'`);

  /* ═══ V8.1 — ATALHOS DO ORÇAMENTO ══════════════════════════════════════
     Antes o módulo não tinha um atalho sequer. Agora: histórico de verdade
     (Ctrl+Z/Y) e copiar/recortar/colar item (Ctrl+C/X/V com o item
     selecionado no cartão). */
  ow.eval('window.confirm=()=>true; novoOrcamento();');
  t('atalhos: histórico começa vazio depois de um orçamento novo',
    `v8OrcRegistrarAgora(); v8OrcUndoStack.length + ' | ' + documentPages[0].tableItems.length`);
  ow.eval("documentPages[0].tableItems.push({modelo:'Camiseta',tecido:'Piquet',descricao:'',qnt:10,unit:25}); renderItemsEditor(); v8OrcRegistrarAgora();");
  t('atalhos: selecionar item pelo cartão',
    `(function(){var c=document.querySelector('#items-editor-list .item-row-card .orc-item-num');c.dispatchEvent(new MouseEvent('click',{bubbles:true}));return v8OrcSelRow===0&&!!document.querySelector('#items-editor-list .item-row-card.sel-row')})()`);
  t('atalhos: copiar item', `v8OrcCopiarItem(false) && v8OrcClip && v8OrcClip.modelo==='Camiseta'`);
  t('atalhos: colar item cria um igual logo abaixo',
    `(function(){var antes=documentPages[0].tableItems.length;var ok=v8OrcColarItem();var it=documentPages[0].tableItems[1];return ok&&documentPages[0].tableItems.length===antes+1&&it.modelo==='Camiseta'&&it.qnt===10})()`);
  t('atalhos: Ctrl+Z desfaz o item colado',
    `(function(){var antes=documentPages[0].tableItems.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));return documentPages[0].tableItems.length===antes-1})()`);
  t('atalhos: Ctrl+Y refaz',
    `(function(){var antes=documentPages[0].tableItems.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true}));return documentPages[0].tableItems.length===antes+1})()`);
  t('atalhos: Ctrl+Shift+Z também refaz',
    `(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));var antes=documentPages[0].tableItems.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}));return documentPages[0].tableItems.length===antes+1})()`);
  t('atalhos: recortar item tira da lista',
    `(function(){var n=documentPages[0].tableItems.length;v8OrcSelRow=0;var ok=v8OrcCopiarItem(true)&&v8OrcExcluirItem();return ok&&documentPages[0].tableItems.length===n-1})()`);
  t('atalhos: Ctrl+Z devolve o item recortado',
    `(function(){var n=documentPages[0].tableItems.length;document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));return documentPages[0].tableItems.length===n+1})()`);
  t('atalhos: página nova limpa a seleção (índice não vaza entre páginas)',
    `(function(){v8OrcSelRow=0;addDocumentPage();changeActiveFormPage(1);return v8OrcSelRow===null})()`);
  t('atalhos: ajuda do módulo documenta os comandos',
    `(function(){var h=document.getElementById('ajudaOrcamento').innerHTML.toLowerCase();return h.indexOf('ctrl')>-1&&h.indexOf('recorta')>-1&&h.indexOf('desfazer')>-1})()`);
  t('tema: papel A4 continua fora do tema',
    `(function(){var p=document.querySelector('.page');return !p.closest('[data-theme]')||getComputedStyle(p).backgroundColor!==''})()`);

  if(oerr.length)fail++;
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  console.log(fail ? `\n═══ ORÇAMENTO V8: ${fail} FALHA(S) ═══` : '\n═══ ORÇAMENTO V8: tudo OK ═══');
  process.exit(fail?1:0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
