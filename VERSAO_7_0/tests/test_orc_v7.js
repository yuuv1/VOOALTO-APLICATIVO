const { JSDOM } = require('jsdom');
const fs = require('fs');
(async () => {
  const oc = fs.readFileSync(require('./_base').BASE + '/criador_orcamento/index.html', 'utf-8');
  const oerr = [];
  const od = new JSDOM(oc, { url: 'http://localhost:4700/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true,
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
  if(oerr.length)fail++;
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  process.exit(fail?1:0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
