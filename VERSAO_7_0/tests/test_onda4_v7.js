'use strict';
/* V7.6 — Onda 4 (estrutura de dados):
   A9: o PDF saiu do base64 (dataURL) e passou a ser guardado como Blob no IndexedDB
       (~33% menos espaço e sem string gigante na memória), com migração v2 → v3;
   +  coletor de PDFs/fichas órfãos (arquivo que ficou sem ficha é liberado).
   Os testes usam um IndexedDB de mentira (tests/_fake_idb.js) para provar a migração
   de verdade: banco v2 com base64 entra, banco v3 com Blob sai — sem perder bytes. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
const { criarIDBFalso, base64De } = require('./_fake_idb');

const dash = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
const KEY = 'vooalto_main_catalog_v2';
const TEXTO_PDF = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n';
const PDF_ANTIGO = 'data:application/pdf;base64,' + base64De(TEXTO_PDF);
const OUTRO_PDF = 'data:application/pdf;base64,' + base64De('OUTRO-ARQUIVO-ANTIGO');
let fail = 0;
const statik = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label); if (!ok) fail++; };
const t = (label, ok, extra = '') => { console.log(ok ? '  [OK]' : '  [FAIL]', label, extra ? '-> ' + extra : ''); if (!ok) fail++; };

console.log('===== ONDA 4 V7.6 — ESTÁTICO =====');
statik('A9: banco na versão 3 (migração v2 → v3)', dash.includes('PDF_DB_VERSION=3'));
statik('A9: nome do banco mantido (não abandona os dados de quem já usa)', dash.includes("PDF_DB='vooalto_pdf_store_v2'"));
statik('A9: migração roda no upgrade do banco', dash.includes('function migrarPdfsParaBlob(store)') && /\(ev\)=>\{[^}]*oldVersion/.test(dash));
statik('A9: migração usa cursor + update (converte no lugar)', dash.includes('store.openCursor()') && dash.includes('cur.update(blob)'));
statik('A9: gravação normaliza para Blob', dash.includes('tx.objectStore(PDF_STORE).put(paraBlobPdf(data),id)'));
statik('A9: pdf.js recebe bytes (funciona com Blob ou base64)', dash.includes('pdfjs.getDocument({data:await pdfBytes(data)})') && dash.includes('readAsArrayBuffer'));
statik('A9: leitores aceitam os dois formatos (nenhum startsWith base64 sobrou)',
  !dash.includes("String(data).startsWith('data:application/pdf')") && dash.includes('function pdfTemArquivo(d)') && (dash.match(/!pdfTemArquivo\(data\)/g) || []).length === 3);
statik('A9: anexar PDF não converte mais para base64 (FileReader fora do caminho de upload)',
  /function readPdfFile\(file,cb\)\{[^}]*cb\(file,file.name\)\}/.test(dash) && !/readPdfFile\(file,cb\)\{[^}]*readAsDataURL/.test(dash));
statik('A9: backup .json continua em base64 (compatível com versões anteriores)',
  dash.includes('const b=d?await pdfParaDataURL(d):null;if(b)o.pdfData=b'));
statik('A9: leitor "abrir em nova aba" e download aceitam Blob', /fetch\(data\)/.test(dash) && dash.includes('await (await fetch(_pdfv.data)).blob()'));
statik('GC: coletor existe e só apaga chave que não é de nenhuma ficha',
  dash.includes('async function limparPdfsOrfaos()') && /\.filter\(k=>!ids\.has\(k\)\)/.test(dash));
statik('GC: trava de segurança — sem catálogo no localStorage não apaga nada',
  /async function limparPdfsOrfaos\(\)\{[\s\S]{0,400}?bruto=localStorage\.getItem\(KEY\)[\s\S]{0,120}?if\(!bruto\)return 0/.test(dash));
statik('GC: roda uma vez no boot, depois de migrar os PDFs',
  dash.includes('.then(()=>migratePdfsToDB())') && dash.includes('.then(()=>{renderAll();limparPdfsOrfaos()'));
statik('V7.6.1: a tela é desenhada mesmo se a conversão dos PDFs falhar',
  /migratePdfsToDB\(\)\)\.catch\(/.test(dash) && dash.includes('then(()=>{renderAll();'));
statik('V7.6.1: upgrade bloqueado por outra aba não pendura o banco (abre sem versão)',
  dash.includes('r.onblocked=()=>{') && /onblocked[\s\S]{0,400}?tentar\(null,false\)/.test(dash));
statik('V7.6.1: registro problemático não aborta a migração inteira (update tratado)',
  /cur\.update\(blob\)[\s\S]{0,160}?ur\.onerror=/.test(dash));
statik('V7.6.1: coletor exige catálogo REALMENTE lido (não só chave existente)',
  dash.includes('let _catalogoLido=false') && /if\(!bruto\)return 0;[\s\S]{0,60}?if\(!_catalogoLido\)return 0/.test(dash));
statik('V7.6.1: manual abre mesmo com janela nova bloqueada (plano B na mesma aba)',
  dash.includes('function abrirManualVooalto()') && dash.includes("location.href='../manual.html'"));

async function abrir({ seed = {}, orders = [], semCatalogo = false, catalogoCru = false, bloqueiaUpgrade = false } = {}) {
  const { indexedDB, bancos } = criarIDBFalso(seed);
  if (bloqueiaUpgrade) { // simula o navegador RECUSANDO subir o banco para a versão 3
    const abrirOriginal = indexedDB.open.bind(indexedDB);
    indexedDB.open = (nome, versao) => {
      if (versao === 3) { // recusa sempre: é o pior caso (aba travando o banco)
        const rq = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null, transaction: null };
        setTimeout(() => { if (rq.onerror) rq.onerror({ target: rq }); }, 0);
        return rq;
      }
      return abrirOriginal(nome, versao);
    };
  }
  const erros = [];
  const dom = new JSDOM(dash, {
    url: 'http://localhost:4700/principal_dashboard/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'indexedDB', { configurable: true, value: indexedDB });
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
      w.addEventListener('error', e => erros.push(e.message));
      w.pdfjsLib = {
        GlobalWorkerOptions: {},
        getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }), render: () => ({ promise: Promise.resolve(), cancel() {} }) }), destroy: async () => {} }) })
      };
      try {
        if (semCatalogo) w.localStorage.removeItem(KEY);
        else if (catalogoCru) w.localStorage.setItem(KEY, '{isto-nao-e-um-catalogo');
        else w.localStorage.setItem(KEY, JSON.stringify({ thresholds: { low: 0, med: 15, high: 22 }, orders, history: [] }));
      } catch (e) { erros.push('localStorage: ' + e.message); }
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 1000));
  return { dom, w, erros, bancos };
}

const ficha = (id, extra = {}) => ({
  id, name: 'Ficha ' + id, clientPhone: '', createdAt: '2026-10-13', createdTs: Date.now(),
  status: 'baixa', note: '', medDays: 15, highDays: 22, pdfName: 'f.pdf', pdfStored: true, ...extra
});
const blobDoBanco = (bancos, id, store = 'pdfs') => bancos.get('vooalto_pdf_store_v2').stores.get(store).get(id);

(async () => {
  console.log('\n===== A9 — migração v2 → v3 (base64 vira Blob) =====');
  {
    const { dom, w, erros, bancos } = await abrir({
      seed: { vooalto_pdf_store_v2: { version: 2, stores: { pdfs: { o1: PDF_ANTIGO }, fichaData: { o1: '{"cliente":"Ana"}' } } } },
      orders: [ficha('o1')]
    });
    t('banco subiu para a versão 3', bancos.get('vooalto_pdf_store_v2').version === 3, 'versão ' + bancos.get('vooalto_pdf_store_v2').version);
    const guardado = blobDoBanco(bancos, 'o1');
    t('PDF migrado virou Blob', w.Blob && guardado instanceof w.Blob);
    t('tipo do Blob é application/pdf', guardado && guardado.type === 'application/pdf', guardado && guardado.type);
    t('migração preservou os bytes (sem perda)', guardado && guardado.size === Buffer.byteLength(TEXTO_PDF, 'utf8'), guardado && guardado.size + ' bytes');
    const lido = await w.getPdfData('o1');
    t('getPdfData devolve o arquivo como Blob', lido instanceof w.Blob);
    const bytesLidos = lido ? await w.pdfBytes(lido) : null;
    t('conteúdo do arquivo continua o mesmo', !!bytesLidos && String.fromCharCode(...bytesLidos.slice(0, 8)) === '%PDF-1.4');
    t('pdfTemArquivo aceita Blob (leitor/miniatura/nova aba)', w.pdfTemArquivo(lido) === true);
    t('pdfTemArquivo continua aceitando o base64 antigo', w.pdfTemArquivo(PDF_ANTIGO) === true);
    t('pdfTemArquivo recusa imagem e vazio', w.pdfTemArquivo('data:image/png;base64,AAAA') === false && w.pdfTemArquivo(null) === false);
    const bytes = await w.pdfBytes(lido);
    t('bytes para o pdf.js batem com o arquivo', bytes && bytes.length === Buffer.byteLength(TEXTO_PDF, 'utf8') && String.fromCharCode(bytes[0]) === '%');
    const url = await w.pdfParaDataURL(lido);
    t('backup converte de volta para base64', typeof url === 'string' && url.startsWith('data:application/pdf;base64,') && Buffer.from(url.split(',')[1], 'base64').toString('utf8') === TEXTO_PDF);
    // abrir o banco de novo (migração repetida) não pode estragar nada
    const db = await w.openPdfDB();
    t('reabrir o banco (já v3) não quebra', !!db && typeof db.transaction === 'function');
    db.close();
    t('segunda passada não altera o Blob', blobDoBanco(bancos, 'o1') instanceof w.Blob);
    t('ficha técnica antiga continua no banco', blobDoBanco(bancos, 'o1', 'fichaData') === '{"cliente":"Ana"}');
    t('nenhum erro de página', erros.length === 0, erros.join(' | ').slice(0, 120));
    dom.window.close();
  }

  console.log('\n===== A9 — gravar/anexar sempre em Blob =====');
  {
    const { dom, w, bancos } = await abrir({ orders: [ficha('o9')] });
    await w.storePdfData('o9', PDF_ANTIGO);
    t('storePdfData converte base64 (import de backup antigo) em Blob', blobDoBanco(bancos, 'o9') instanceof w.Blob);
    const arquivo = new w.File([TEXTO_PDF], 'ficha.pdf', { type: 'application/pdf' });
    const entregue = await new Promise(async resolve => { await w.readPdfFile(arquivo, (d, nome) => resolve({ d, nome })); });
    t('anexar PDF entrega o próprio arquivo (sem base64 no caminho)', entregue.d instanceof w.Blob && entregue.d.size === Buffer.byteLength(TEXTO_PDF, 'utf8') && entregue.nome === 'ficha.pdf');
    await w.storePdfData('o9', entregue.d);
    t('o que veio do input é gravado como Blob', blobDoBanco(bancos, 'o9') instanceof w.Blob);
    const bytes = await w.pdfBytes(blobDoBanco(bancos, 'o9'));
    t('bytes lidos do banco batem com o arquivo anexado', bytes && bytes.length === Buffer.byteLength(TEXTO_PDF, 'utf8'));
    dom.window.close();
  }

  console.log('\n===== coletor de arquivos órfãos =====');
  {
    const { dom, w, bancos } = await abrir({
      seed: { vooalto_pdf_store_v2: { version: 2, stores: { pdfs: { o1: PDF_ANTIGO, fantasma: OUTRO_PDF }, fichaData: { o1: '{}', fantasma: '{}' } } } },
      orders: [ficha('o1')]
    });
    const pdfs = () => [...bancos.get('vooalto_pdf_store_v2').stores.get('pdfs').keys()];
    const fichas = () => [...bancos.get('vooalto_pdf_store_v2').stores.get('fichaData').keys()];
    t('PDF sem ficha foi liberado no boot', !pdfs().includes('fantasma'), pdfs().join(','));
    t('ficha técnica sem ficha foi liberada no boot', !fichas().includes('fantasma'), fichas().join(','));
    t('PDF da ficha que existe foi mantido', pdfs().includes('o1'));
    t('ficha técnica da ficha que existe foi mantida', fichas().includes('o1'));
    t('PDF mantido continua legível como Blob', blobDoBanco(bancos, 'o1') instanceof w.Blob);
    const segunda = await w.limparPdfsOrfaos();
    t('rodar de novo não apaga nada (idempotente)', segunda === 0 && pdfs().includes('o1'));
    dom.window.close();
  }

  console.log('\n===== trava de segurança (sem catálogo, nada é apagado) =====');
  {
    const { dom, w, bancos } = await abrir({
      seed: { vooalto_pdf_store_v2: { version: 3, stores: { pdfs: { sozinho: PDF_ANTIGO }, fichaData: {} } } },
      semCatalogo: true
    });
    const pdfs = () => [...bancos.get('vooalto_pdf_store_v2').stores.get('pdfs').keys()];
    const apagados = await w.limparPdfsOrfaos();
    t('sem catálogo no localStorage o coletor não roda', apagados === 0);
    t('o único PDF que existe continua no banco', pdfs().join(',') === 'sozinho', pdfs().join(','));
    dom.window.close();
  }

  console.log('\n===== V7.6.1 — banco recusando o upgrade (o sistema não pode ficar sem os PDFs) =====');
  {
    const { dom, w, bancos } = await abrir({
      seed: { vooalto_pdf_store_v2: { version: 2, stores: { pdfs: { o1: PDF_ANTIGO }, fichaData: { o1: '{}' } } } },
      orders: [ficha('o1')], bloqueiaUpgrade: true
    });
    const versao = bancos.get('vooalto_pdf_store_v2').version;
    t('o banco continua na versão 2 (upgrade recusado)', versao === 2, 'versão ' + versao);
    const lido = await w.getPdfData('o1');
    t('a leitura do PDF responde (não fica pendurada esperando o upgrade)',
      typeof lido === 'string' && lido.startsWith('data:application/pdf'), typeof lido + '/' + (lido && lido.constructor && lido.constructor.name));
    t('pdfBytes converte o base64 antigo quando precisa', (await w.pdfBytes(lido)).length === Buffer.byteLength(TEXTO_PDF, 'utf8'));
    t('pdfTemArquivo segue aceitando o arquivo', w.pdfTemArquivo(lido) === true);
    t('a tela foi desenhada mesmo com o upgrade recusado', typeof w.renderAll === 'function' && !!w.document.getElementById('columns'));
    dom.window.close();
  }

  console.log('\n===== V7.6.1 — catálogo corrompido: o coletor NÃO pode apagar nada =====');
  {
    const { dom, w, bancos } = await abrir({
      seed: { vooalto_pdf_store_v2: { version: 3, stores: { pdfs: { sozinho: PDF_ANTIGO }, fichaData: { sozinho: '{}' } } } },
      catalogoCru: true
    });
    const pdfs = () => [...bancos.get('vooalto_pdf_store_v2').stores.get('pdfs').keys()];
    const fichas = () => [...bancos.get('vooalto_pdf_store_v2').stores.get('fichaData').keys()];
    const apagados = await w.limparPdfsOrfaos();
    t('catálogo ilegível: o coletor não roda', apagados === 0);
    t('o PDF continua no banco (não é tratado como órfão)', pdfs().join(',') === 'sozinho', pdfs().join(','));
    t('a ficha técnica também continua', fichas().join(',') === 'sozinho', fichas().join(','));
    dom.window.close();
  }

  console.log(fail ? `\n═══ ONDA 4 V7.6: ${fail} FALHA(S) ═══` : '\n═══ ONDA 4 V7.6: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
