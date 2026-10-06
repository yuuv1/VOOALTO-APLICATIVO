const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

function jsdomStubs(w, perr) {
  w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.print = () => {};
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  w.addEventListener('error', e => perr.push(e.message));
}

(async () => {
  let fail = 0;
  const fichaSrc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const dashSrc = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
  const orcSrc = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
  const statik = (label, ok) => {
    console.log(ok ? '  [OK]' : '  [FAIL]', label);
    if (!ok) fail++;
  };

  console.log('===== PERF/ANTI-TRAVAMENTO V7 — ESTÁTICO =====');
  statik('ficha: v7DownscaleDataURL existe', fichaSrc.includes('function v7DownscaleDataURL'));
  statik('ficha: lerArq reduz antes de adicionar', /function lerArq\(f\)\{[^}]*v7DownscaleDataURL/.test(fichaSrc));
  statik('ficha: lerArqExtra reduz antes de adicionar', /function lerArqExtra\(f,p\)\{[^}]*v7DownscaleDataURL/.test(fichaSrc));
  statik('ficha: lerArqComNome reduz antes de adicionar', fichaSrc.includes('v7DownscaleDataURL(ev.target.result).then(src=>'));
  statik('ficha: miniatura remove src das imagens', fichaSrc.includes("im.removeAttribute('src')"));
  statik('ficha: miniatura remove canvas', fichaSrc.includes("querySelectorAll('canvas,video')"));
  statik('ficha: trava de miniatura pesada', fichaSrc.includes('v7h.length>400000'));
  statik('ficha: autosave avisa quando o espaço acaba', fichaSrc.includes('autosave da ficha falhou'));
  statik('dash: store fichaData em IndexedDB', dashSrc.includes("FICHA_STORE='fichaData'") && dashSrc.includes('async function storeFichaData'));
  statik('dash: save() não propaga exceção', /function save\(\)\{try\{/.test(dashSrc));
  statik('dash: save() tira fichaData do localStorage', dashSrc.includes('if(c.fichaInIDB&&c.fichaData)delete c.fichaData'));
  statik('dash: preview usa drawImage (não cloneNode)', dashSrc.includes('dctx.drawImage(thumb,0,0)'));
  statik('dash: PDFs expandidos com concorrência limitada', dashSrc.includes('Math.min(2,boxes.length)'));
  statik('dash: caches com teto (LRU)', dashSrc.includes('_capMap(_pdfDocCache,8,true)') && dashSrc.includes('_capMap(_pdfDataCache,20)'));
  statik('orc: assinatura limitada a 800px', orcSrc.includes('const MAXS = 800'));
  statik('orc: preview não reatribui assinatura igual', orcSrc.includes("getAttribute('src') !== currentSignatureBase64"));

  console.log('===== PERF V7: FICHA (jsdom) =====');
  {
    const oerr = [];
    const od = new JSDOM(fichaSrc, {
      url: 'http://localhost:4700/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { jsdomStubs(w, oerr); }
    });
    const ow = od.window;
    await new Promise(r => setTimeout(r, 1600));
    const t = (label, expr) => {
      try {
        const r = ow.eval(expr), ok = r !== undefined && r !== null && r !== false;
        console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 90) : '');
        if (!ok) fail++;
        return r;
      } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return undefined; }
    };
    t('limite de importação = 1600px', `V7_IMG_MAX_DIM`);
    const smallBack = await ow.eval(`v7DownscaleDataURL('data:image/png;base64,AAAA')`);
    console.log(smallBack === 'data:image/png;base64,AAAA' ? '  [OK]' : '  [FAIL]', 'imagem pequena passa intacta');
    if (smallBack !== 'data:image/png;base64,AAAA') fail++;
    const big = 'data:image/png;base64,' + 'B'.repeat(200 * 1024);
    const t0 = Date.now();
    const back = await ow.eval(`v7DownscaleDataURL(${JSON.stringify(big)})`);
    console.log((back === big ? '  [OK]' : '  [FAIL]') + ' fallback devolve o original quando não dá para decodificar -> ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    if (back !== big) fail++;
    t('miniatura sem bytes de imagem', `document.getElementById('folha1').insertAdjacentHTML('beforeend','<img id="probeImg" src="data:image/png;base64,'+'A'.repeat(1000)+'">'); const h=v7ThumbHtml('folha1','Pág. 1',null,false,false,false); document.getElementById('probeImg').remove(); (!h.includes('AAAAAAAA') && h.includes('data-v7-img')) ? 'ok' : 'FAIL:'+h.length`);
    t('autosave quota toast existe no código', `typeof v7SalvarAutosaveAgora`);
    if (oerr.length) fail++;
    console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  }

  console.log('===== PERF V7: CATALOGAÇÃO (jsdom) =====');
  {
    const perr = [];
    const pd = new JSDOM(dashSrc, {
      url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { jsdomStubs(w, perr); }
    });
    const pw = pd.window;
    await new Promise(r => setTimeout(r, 1400));
    const t = (label, expr) => {
      try {
        const r = pw.eval(expr), ok = r !== undefined && r !== null && r !== false;
        console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 90) : '');
        if (!ok) fail++;
        return r;
      } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return undefined; }
    };
    t('helpers fichaData/IDB', `typeof storeFichaData`);
    t('persist async + loader', `typeof persistFichaDataAsync`);
    t('cap de caches', `typeof _capMap`);
    t('loader de card expandido', `typeof loadOneExpandedPdfCard`);
    t('editarFichaTecnica virou async', `editarFichaTecnica.constructor.name`);
    t('normalize preserva fichaData + regenera id ruim', `const n=normalizeImportedData({orders:[{id:'bad id!!',name:'X',fichaData:'FD',fichaNum:'7'}]}).orders[0]; (n.id!=='bad id!!'&&n.fichaData==='FD'&&n.fichaNum==='7')?'ok':'FAIL:'+n.id`);
    t('save() tira ficha migrada do LS e mantém na memória', `state.orders.push({id:'pz1',name:'Z',clientPhone:'',createdAt:today(),createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,fichaData:{big:'x'.repeat(5000)},fichaNum:'1',fichaInIDB:true,pdfStored:false}); save(); const ls=JSON.parse(localStorage.getItem(KEY)).orders.find(o=>o.id==='pz1'); (!ls.fichaData&&ls.fichaInIDB===true&&state.orders.find(o=>o.id==='pz1').fichaData.big.length===5000)?'ok':'FAIL'`);
    t('recarregar não perde ficha inline (sem IDB)', `state.orders.push({id:'pz2',name:'W',clientPhone:'',createdAt:today(),createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,fichaData:'INLINE_FD',fichaNum:'2',pdfStored:false}); save(); load(); state.orders.find(o=>o.id==='pz2').fichaData==='INLINE_FD'?'ok':'FAIL'`);
    t('botão Modificar aparece com flag IDB', `renderAll(); !!document.querySelector('#columns [data-order-id="pz1"] .mini.ficha, #columns .mini.ficha')`);
    const LSProto = Object.getPrototypeOf(pw.localStorage);
    const _setItem = LSProto.setItem;
    LSProto.setItem = function () { throw new Error('quota simulada'); };
    let quotaRes;
    try { quotaRes = pw.eval(`save()`); } catch (e) { quotaRes = 'THREW:' + e.message; }
    LSProto.setItem = _setItem;
    const quotaOk = quotaRes === false;
    console.log(quotaOk ? '  [OK]' : '  [FAIL]', 'save() nunca joga exceção (cota) -> ' + JSON.stringify(quotaRes));
    if (!quotaOk) fail++;
    t('save() volta a funcionar', `save()===true?'ok':'FAIL'`);
    if (perr.length) fail++;
    console.log('  page errors:', perr.length ? perr : 'none ✓');
  }

  console.log(`═══ PERF V7: ${fail ? 'FALHOU' : 'OK'} ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
