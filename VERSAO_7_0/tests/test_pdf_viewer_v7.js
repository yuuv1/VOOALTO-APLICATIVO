'use strict';
/* V7.2 — Leitor de PDF interno (dentro da Catalogação).
   Verificações estáticas do código + simulação em jsdom com o pdf.js isolado:
   o leitor precisa abrir, trocar de página, dar zoom, girar, fechar com Esc,
   liberar memória e cair para a aba do navegador quando o pdf.js falha. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

const dash = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
let fail = 0;
const statik = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label); if (!ok) fail++; };

console.log('===== LEITOR DE PDF V7.2 — ESTÁTICO =====');
statik('modal do leitor existe', dash.includes('id="pdfViewer"') && dash.includes('class="pdf-viewer"'));
statik('canvas e contador de páginas existem', dash.includes('id="pdfvCanvas"') && dash.includes('id="pdfvPages"') && dash.includes('id="pdfvPageInput"'));
statik('barra com zoom/página/girar/imprimir/baixar/nova aba', ['pdfvPrev','pdfvNext','pdfvZoomIn','pdfvZoomOut','pdfvFitWidth','pdfvFitPage','pdfvRotate','pdfvPrint','pdfvDownload','pdfvOpenTab'].every(id => dash.includes(`id="${id}"`)));
statik('viewPdf continua existindo e abre o leitor interno', /async function viewPdf\(id\)\{return abrirLeitorPdf\(id\)\}/.test(dash));
statik('aba do navegador virou opção explícita + plano B', dash.includes('async function abrirPdfEmNovaAba(id)') && dash.includes('onclick="abrirPdfEmNovaAba('));
statik('documento pdf.js reaproveitado do cache', dash.includes('async function obterDocPdf') && dash.includes("const cache=_pdfDocCache.get(id)") && dash.includes('_pdfDocCache.set(id,pdf)'));
statik('PDF aberto no leitor protegido contra descarte do cache', dash.includes('_capMap(_pdfDocCache,8,true,_pdfvProtegidos)') && dash.includes('_pdfvProtegidos.add(id)'));
statik('miniaturas e leitor compartilham o mesmo carregador', (dash.match(/obterDocPdf\(id,data\)/g) || []).length >= 2);
statik('renderização cancelada ao trocar de página', dash.includes('_pdfv.tarefa.cancel()') && dash.includes('const token=++_pdfv.token'));
statik('teto de pixels por página (proteção de memória)', dash.includes('_pdfvMaxPx=12e6') && dash.includes('_pdfvMaxPx/(base.width*base.height)'));
statik('memória liberada ao fechar (canvas zerado)', dash.includes('c.width=0;c.height=0'));
statik('PDF com senha/corrompido tem mensagem própria', dash.includes("nome==='PasswordException'") && dash.includes("nome==='InvalidPDFException'"));
statik('atalhos de teclado do leitor', dash.includes("e.key==='ArrowLeft'") && dash.includes("e.key==='ArrowRight'") && dash.includes("e.key==='Escape'"));
statik('impressão troca a tela só quando vem do leitor', dash.includes('html.pdfv-printing .app') && dash.includes("classList.add('pdfv-printing')"));
statik('plano B do card expandido usa blob (não data: gigante)', dash.includes("await (await fetch(data)).blob();src=URL.createObjectURL(blob)"));
statik('lixo depois do </html> removido', dash.split('</html>').length - 1 === 1);
statik('código morto removido (getThumbLo/renderPdfFirstPageCanvas)', !dash.includes('function getThumbLo') && !dash.includes('function renderPdfFirstPageCanvas'));

function stubPdfJs(w, paginas, falha) {
  const pagina = () => ({
    getViewport: ({ scale }) => ({ width: Math.round(595 * scale), height: Math.round(842 * scale) }),
    render: () => ({ promise: Promise.resolve(), cancel() {} })
  });
  w.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => falha
      ? { promise: Promise.reject(Object.assign(new Error('pdf quebrado'), { name: falha })) }
      : { promise: Promise.resolve({ numPages: paginas, getPage: async () => pagina(), destroy: async () => {} }) }
  };
}

async function abrirDashboard({ paginas = 3, falha = null, pdfData = 'data:application/pdf;base64,AAAA' } = {}) {
  const erros = [];
  const dom = new JSDOM(dash, {
    url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
      w.addEventListener('error', e => erros.push(e.message));
      stubPdfJs(w, paginas, falha);
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 1200));
  w.eval(`state.orders.push({id:'p1',name:'Ficha com PDF',clientPhone:'',createdAt:today(),createdTs:Date.now(),status:'baixa',note:'',medDays:15,highDays:22,
    pdfData:'${pdfData}',pdfName:'ficha-teste.pdf',pdfStored:false}); save(); renderAll(); 'ok'`);
  const t = (label, expr) => {
    let r;
    try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return undefined; }
    const ok = !!r;
    console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 80) : '');
    if (!ok) fail++;
    return r;
  };
  return { dom, w, t, erros };
}

(async () => {
  console.log('===== LEITOR DE PDF V7.2 — jsdom (pdf.js simulado) =====');
  {
    const { dom, w, t, erros } = await abrirDashboard({ paginas: 3 });
    await w.eval(`abrirLeitorPdf('p1')`);
    await new Promise(r => setTimeout(r, 80));
    t('leitor abriu', `document.getElementById('pdfViewer').classList.contains('open')`);
    t('total de páginas mostrado', `document.getElementById('pdfvPages').textContent==='3'`);
    t('começa na página 1', `document.getElementById('pdfvPageInput').value==='1' && _pdfv.page===1`);
    t('canvas tem tamanho da página', `document.getElementById('pdfvCanvas').width>0`);
    t('status de carregamento escondido', `document.getElementById('pdfvStatus').hidden===true`);
    t('zoom exibido em %', `/^\\d+%$/.test(document.getElementById('pdfvZoomLabel').textContent)`);
    t('botão "anterior" desabilitado na 1ª página', `document.getElementById('pdfvPrev').disabled===true`);

    await w.eval(`_pdfvMudarPagina(1)`); await new Promise(r => setTimeout(r, 60));
    t('avança para a página 2', `_pdfv.page===2 && document.getElementById('pdfvPageInput').value==='2'`);
    await w.eval(`_pdfvIrPara(3)`); await new Promise(r => setTimeout(r, 60));
    t('vai para a última página', `_pdfv.page===3`);
    t('botão "próxima" desabilitado na última', `document.getElementById('pdfvNext').disabled===true`);
    await w.eval(`_pdfvIrPara(99)`); await new Promise(r => setTimeout(r, 60));
    t('número fora da faixa é limitado', `_pdfv.page===3`);
    await w.eval(`_pdfvIrPara(1)`); await new Promise(r => setTimeout(r, 60));

    const zoomAntes = await w.eval(`_pdfv.escalaAtual`);
    await w.eval(`_pdfvZoom(1)`); await new Promise(r => setTimeout(r, 60));
    t('zoom + aumenta a escala', `_pdfv.escalaAtual > ${zoomAntes} && _pdfv.modo==='zoom'`);
    await w.eval(`_pdfvZoom(-1)`); await new Promise(r => setTimeout(r, 60));
    t('zoom − volta a reduzir', `Math.abs(_pdfv.escalaAtual - ${zoomAntes}) < 0.01`);
    await w.eval(`_pdfvAjustar('largura')`); await new Promise(r => setTimeout(r, 60));
    t('ajustar à largura', `_pdfv.modo==='largura'`);
    await w.eval(`_pdfvAjustar('pagina')`); await new Promise(r => setTimeout(r, 60));
    t('ajustar à página', `_pdfv.modo==='pagina'`);
    await w.eval(`_pdfv.rot=90; _pdfvRender()`); await new Promise(r => setTimeout(r, 60));
    t('girar não quebra a renderização', `document.getElementById('pdfvCanvas').height>0`);

    const alturaAntes = await w.eval(`document.getElementById('pdfvCanvas').height`);
    dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    t('Esc fecha o leitor', `document.getElementById('pdfViewer').classList.contains('open')===false`);
    t('fechar libera a memória do canvas', `document.getElementById('pdfvCanvas').width===0 && document.getElementById('pdfvCanvas').height===0`);
    statik('canvas tinha conteúdo antes de fechar', alturaAntes > 0);
    await w.eval(`abrirLeitorPdf('p1')`);
    await new Promise(r => setTimeout(r, 80));
    t('nova abertura volta na página 1 e sem rotação', `_pdfv.page===1 && _pdfv.rot===0 && _pdfv.modo==='pagina'`);
    await w.eval(`fecharLeitorPdf(true)`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }

  console.log('===== LEITOR DE PDF V7.2 — plano B quando o pdf.js falha =====');
  {
    const { dom, w, t } = await abrirDashboard({ falha: 'InvalidPDFException' });
    w.eval(`window.__abriuAba=0; window.abrirPdfEmNovaAba=async function(id){window.__abriuAba++; window.__abaId=id;};`);
    await w.eval(`abrirLeitorPdf('p1')`);
    await new Promise(r => setTimeout(r, 120));
    t('mensagem explica o problema', `/corrompido|não é um PDF válido/i.test(document.getElementById('pdfvStatus').textContent)`);
    t('botão "Abrir em nova aba" oferecido', `!!document.querySelector('#pdfvStatus button')`);
    t('fallback automático chamado', `window.__abriuAba===1 && window.__abaId==='p1'`);
    t('leitor continua aberto para o usuário ler o aviso', `document.getElementById('pdfViewer').classList.contains('open')`);
    dom.window.close();
  }

  console.log('===== LEITOR DE PDF V7.2 — ficha sem PDF =====');
  {
    const { dom, w, t } = await abrirDashboard({ pdfData: 'data:image/png;base64,AAAA' });
    await w.eval(`abrirLeitorPdf('p1')`);
    await new Promise(r => setTimeout(r, 80));
    t('avisa que a ficha não tem PDF', `/não tem PDF anexado/i.test(document.getElementById('toast').textContent)`);
    t('não abre o leitor sem PDF', `document.getElementById('pdfViewer').classList.contains('open')===false`);
    dom.window.close();
  }

  console.log(fail ? `\n═══ LEITOR PDF: ${fail} FALHA(S) ═══` : '\n═══ LEITOR PDF: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
