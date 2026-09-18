const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
(async () => {
  const oc = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
  const perr = [];
  const pd = new JSDOM(oc, { url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>({width:50})), set:()=>true }); };
      w.addEventListener('error', e => perr.push(e.message));
    }
  });
  const pw = pd.window;
  await new Promise(r => setTimeout(r, 1400));
  const t = (label, expr) => { try { const r = pw.eval(expr); console.log('  [OK]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0,90) : ''); return r; } catch(e) { console.log('  [ERR]', label, ':', e.message); return undefined; } };
  console.log('===== PRINCIPAL V7 =====');
  t('title V7', `document.title`);
  t('aba catalogo ativa por padrao', `document.querySelector('.tab.active').textContent.includes('Catalogação')`);
  t('view catalogo ativa por padrao', `document.getElementById('catalogo').classList.contains('active') && !document.getElementById('dashboard').classList.contains('active')`);
  t('h2 Dashboard', `Array.from(document.querySelectorAll('h2')).find(h=>h.textContent.includes('Dashboard')).textContent`);
  t('state', `!!state && typeof state.orders`);
  t('seed', `state.orders.push({id:'t1',name:'Ficha Teste Azul',clientPhone:'62 99999-0001',createdAt:'15/09/2026',createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,fichaData:'DADOS_TESTE',fichaNum:'',pdfStored:false}); save(); renderAll(); 'ok'`);
  t('pending update (LS)', `localStorage.setItem('vooalto_pending_ficha_update', JSON.stringify({fichaId:'t1', fichaNome:'Ficha Atualizada', fichaData:'DADOS_NOVOS'})); checkPendingFichaUpdate(); state.orders.find(o=>o.id==='t1').fichaData + ' | ' + state.orders.find(o=>o.id==='t1').name`);
  t('saveThresholds', `saveThresholds(); 'ok'`);
  t('editarFichaTecnica msg', `Object.defineProperty(window,'postMessage',{configurable:true,value:(m)=>{(window.__pm=window.__pm||[]);window.__pm.push(m)}}); editarFichaTecnica('t1'); (window.__pm.filter(m=>m.type==='vooalto-ficha-edit')[0]||{}).fichaNome`);
  t('counts exposto', `!!window.vooaltoCounts`);
  t('thLow removido', `!document.getElementById('thLow')`);
  t('importData fn', `typeof importData`);
  t('chips de prioridade', `document.querySelectorAll('.prio-chip').length`);
  t('foco alta', `state.orders.push({id:'t2',name:'Ficha Antiga',clientPhone:'',createdAt:'16/08/2026',createdTs:Date.now()-30*864e5,status:'alta',note:'',medDays:15,highDays:22,fichaData:'D',fichaNum:'',pdfStored:false}); save(); setPrioFocus('alta'); 'ok'`);
  t('1 coluna no foco', `document.querySelectorAll('#columns .column').length`);
  t('volta a 4', `setPrioFocus('all'); document.querySelectorAll('#columns .column').length`);
  console.log('  page errors:', perr.length ? perr : 'none ✓');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
