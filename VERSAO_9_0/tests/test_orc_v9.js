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
  /* ═══ V8.1.1 — TAB ENTRE AS CAIXAS DO ORÇAMENTO ══════════════════════════
     Antes, o Tab na lista de itens parava nos botões ⧉/✕ de cada cartão. */
  ow.eval("documentPages[0].tableItems=[{modelo:'A',tecido:'',descricao:'',qnt:1,unit:0},{modelo:'B',tecido:'',descricao:'',qnt:1,unit:0}]; changeActiveFormPage(0); renderItemsEditor(); updatePreviewFromForm();");
  ow.eval(`window.__tabProbe=function(id,shift){
    var el=document.getElementById(id);
    if(!el) return 'sem campo';
    el.focus();
    var ev=new KeyboardEvent('keydown',{key:'Tab',shiftKey:!!shift,bubbles:true,cancelable:true});
    el.dispatchEvent(ev);
    return (document.activeElement.id||document.activeElement.tagName)+'|'+(ev.defaultPrevented?'bloqueou':'nativo');
  };`);
  const passo = (de, para, shift) => {
    const r = ow.eval(`__tabProbe(${JSON.stringify(de)},${!!shift})`);
    const ok = r === para + '|bloqueou';
    console.log(ok?'  [OK]':'  [FAIL]', `Tab${shift?'+Shift':''}: ${de} → ${para}`, ok?'':('-> '+r));
    if(!ok) fail++;
  };
  passo('form-item-modelo-0','form-item-tecido-0',false);
  passo('form-item-tecido-0','form-item-descricao-0',false);
  passo('form-item-descricao-0','form-item-qnt-0',false);
  passo('form-item-qnt-0','form-item-unit-0',false);
  passo('form-item-unit-0','form-item-modelo-1',false);   /* pula os botões ⧉/✕ */
  passo('form-item-modelo-1','form-item-unit-0',true);
  passo('form-item-tecido-0','form-item-modelo-0',true);
  t('Tab no último campo não prende o foco (segue nativo para "Adicionar Item")',
    `__tabProbe('form-item-unit-1',false)==='form-item-unit-1|nativo'`);
  t('Shift+Tab no primeiro campo não prende o foco (segue nativo)',
    `__tabProbe('form-item-modelo-0',true)==='form-item-modelo-0|nativo'`);
  t('Tab num botão do painel não é interceptado',
    `(function(){var el=document.querySelector('#tab-itens .btn');el.focus();var ev=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});el.dispatchEvent(ev);return !ev.defaultPrevented})()`);
  t('Tab com Ctrl não é interceptado',
    `(function(){var el=document.getElementById('form-item-modelo-0');el.focus();var ev=new KeyboardEvent('keydown',{key:'Tab',ctrlKey:true,bubbles:true,cancelable:true});el.dispatchEvent(ev);return !ev.defaultPrevented})()`);
  ow.eval('openBudgetSettings();');
  t('Tab dentro do modal ⚙️ continua nativo (botões seguem alcançáveis)',
    `__tabProbe('edit-phone',false)==='edit-phone|nativo'`);
  ow.eval('closeBudgetSettings();');
  /* Folha A4: além de pular de célula em célula, o foco precisa sobreviver à
     reconstrução da tabela disparada pelo onblur da célula. */
  ow.eval(`window.__tabCelula=function(chave,shift){
    if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var el=document.querySelector('td[data-v8-cell="'+chave+'"]');
    if(!el) return 'sem célula';
    el.focus();
    var ev=new KeyboardEvent('keydown',{key:'Tab',shiftKey:!!shift,bubbles:true,cancelable:true});
    el.dispatchEvent(ev);
    var a=document.activeElement;
    var foco=(a&&a.getAttribute&&a.getAttribute('data-v8-cell'))||(a&&a.id)||'nulo';
    return foco+'|'+(ev.defaultPrevented?'bloqueou':'nativo');
  };`);
  const passoFolha = (de, para, shift) => {
    const r = ow.eval(`__tabCelula(${JSON.stringify(de)},${!!shift})`);
    const ok = r === para + '|bloqueou';
    console.log(ok?'  [OK]':'  [FAIL]', `Tab${shift?'+Shift':''} na folha: ${de} → ${para}`, ok?'':('-> '+r));
    if(!ok) fail++;
  };
  passoFolha('1-0-modelo','1-0-tecido',false);
  passoFolha('1-0-descricao','1-0-qnt',false);
  passoFolha('1-0-unit','1-1-modelo',false);
  passoFolha('1-1-unit','preview-payment-title-1',false);   /* depois da tabela vem o pagamento */
  passoFolha('1-1-modelo','1-0-unit',true);
  t('Tab no cabeçalho da folha: Telefone → CNPJ',
    `__tabProbe('preview-phone-1',false)==='preview-cnpj-1|bloqueou'`);
  t('Tab da última caixa da página 1 vai para o começo da página 2',
    `__tabProbe('preview-resp-name-1',false)==='preview-phone-2|bloqueou'`);
  t('Tab no fim da última página não prende o foco',
    `__tabProbe('preview-resp-name-2',false)==='preview-resp-name-2|nativo'`);
  t('ajuda do módulo documenta Tab e Shift+Tab',
    `(function(){var h=document.getElementById('ajudaOrcamento').innerHTML.toLowerCase();return h.indexOf('<kbd>tab</kbd>')>-1&&h.indexOf('shift')>-1})()`);

  t('tema: papel A4 continua fora do tema',
    `(function(){var p=document.querySelector('.page');return !p.closest('[data-theme]')||getComputedStyle(p).backgroundColor!==''})()`);

  if(oerr.length)fail++;
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  console.log(fail ? `\n═══ ORÇAMENTO V8: ${fail} FALHA(S) ═══` : '\n═══ ORÇAMENTO V8: tudo OK ═══');
  process.exit(fail?1:0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
