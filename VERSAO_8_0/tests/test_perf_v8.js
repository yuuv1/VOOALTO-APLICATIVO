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
  const orcSrc = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
  const statik = (label, ok) => {
    console.log(ok ? '  [OK]' : '  [FAIL]', label);
    if (!ok) fail++;
  };

  console.log('===== PERF/ANTI-TRAVAMENTO V8 — ESTÁTICO =====');
  statik('ficha: v7DownscaleDataURL existe', fichaSrc.includes('function v7DownscaleDataURL'));
  statik('ficha: lerArq reduz antes de adicionar', /function lerArq\(f\)\{[^}]*v7DownscaleDataURL/.test(fichaSrc));
  statik('ficha: lerArqExtra reduz antes de adicionar', /function lerArqExtra\(f,p\)\{[^}]*v7DownscaleDataURL/.test(fichaSrc));
  statik('ficha: lerArqComNome reduz antes de adicionar', fichaSrc.includes('v7DownscaleDataURL(ev.target.result).then(src=>'));
  statik('ficha: miniatura remove src das imagens', fichaSrc.includes("im.removeAttribute('src')"));
  statik('ficha: miniatura remove canvas', fichaSrc.includes("querySelectorAll('canvas,video')"));
  statik('ficha: trava de miniatura pesada', fichaSrc.includes('v7h.length>400000'));
  statik('ficha: autosave avisa quando o espaço acaba', fichaSrc.includes('autosave da ficha falhou'));
  /* V8: a Catalogação saiu do sistema — as verificações de PDF/miniatura
     do catálogo saíram junto. O que sobra de anti-travamento é a Ficha e o
     Orçamento (redução de fotos, teto de miniatura e aviso de cota). */
  statik('orc: assinatura limitada a 800px', orcSrc.includes('const MAXS = 800'));
  statik('orc: preview não reatribui assinatura igual', orcSrc.includes("getAttribute('src') !== currentSignatureBase64"));

  console.log('===== PERF V8: FICHA (jsdom) =====');
  {
    const oerr = [];
    const od = new JSDOM(fichaSrc, {
      url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
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

  console.log(`═══ PERF V8: ${fail ? 'FALHOU' : 'OK'} ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
