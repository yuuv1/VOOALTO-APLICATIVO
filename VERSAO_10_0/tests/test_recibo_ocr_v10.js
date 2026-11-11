'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');
const html = fs.readFileSync(path.join(BASE, 'criador_recibo', 'index.html'), 'utf8');
const sample = [
  'FICHA TECNICA DE PRODUCAO', 'Nº 5512', 'DADOS DO CLIENTE',
  'Nome / Razão Social', 'KINGS CAR LANTERNAGEM E PINTURAS',
  'CPF / CNPJ 11.222.333/0001-44', 'Telefone (62) 99999-0000',
  'Endereço Rua 9, 10', 'Cidade Goiânia - GO',
  'INFORMACOES DA PRODUCAO', 'Nº MODELO / DESCRIÇÃO VALOR UNIT. × QTD = TOTAL',
  '1 CAMISETA AZUL R$ 40,00 × 5 = R$ 200,00',
  'TOTAL DA PRODUCAO', 'R$ 200,00', 'Entrada R$ 0,00'
].join('\n');
let ocrCalls = 0, renderCalls = 0, terminations = 0;
let recognized = sample;
let nativeText = '';
const dom = new JSDOM(html, {
  url: 'http://localhost:4800/criador_recibo/index.html', runScripts: 'dangerously',
  beforeParse(w) {
    w.confirm = () => true; w.alert = () => {}; w.print = () => {};
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.HTMLCanvasElement.prototype.getContext = () => ({});
    w.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({
      numPages: 1, destroy: async () => {},
      getPage: async () => ({
        getTextContent: async () => ({ items: nativeText ? [{str: nativeText, hasEOL: true}] : [] }),
        getViewport: ({scale}) => ({ width: 595 * scale, height: 842 * scale }),
        render: () => { renderCalls++; return {promise: Promise.resolve()}; }
      })
    }) }) };
    w.Tesseract = { createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => { ocrCalls++; return {data: {text: recognized}}; },
      terminate: async () => { terminations++; }
    }) };
  }
});
(async () => {
  const w = dom.window;
  const file = {name: 'FICHA TÉCNICA KINGS CAR.pdf', arrayBuffer: async () => new ArrayBuffer(100)};
  assert.equal(await w.Recibo.receberPDF(file), true);
  let state = w.ReciboInterno.estadoAtual();
  assert.equal(state.fichaNum, '5512');
  assert.equal(state.cliente.nome, 'KINGS CAR LANTERNAGEM E PINTURAS');
  assert.equal(state.totalProducao, 200);
  assert.equal(state.itens.length, 1);
  assert.equal(ocrCalls, 1); assert.equal(renderCalls, 1); assert.equal(terminations, 1);
  recognized = 'FICHA TECNICA\nNome / Razão Social\nOUTRO CLIENTE\nTOTAL DA PRODUCAO\nR$ 900,00';
  assert.equal(await w.Recibo.receberPDF(file), false, 'OCR incompleto não muda o recibo');
  state = w.ReciboInterno.estadoAtual();
  assert.equal(state.cliente.nome, 'KINGS CAR LANTERNAGEM E PINTURAS');
  assert.equal(state.totalProducao, 200);
  nativeText = sample;
  assert.equal(await w.Recibo.receberPDF(file), true, 'PDF com texto não precisa OCR');
  assert.equal(ocrCalls, 2); assert.equal(renderCalls, 2);
  nativeText = '';
  recognized = sample.replace('Nome / Razão Social', 'Nome Razão Social')
    .replace('MODELO / DESCRIÇÃO', 'MODELO DESCRIÇÃO')
    .replace('1 CAMISETA AZUL R$ 40,00 × 5 = R$ 200,00', '1) CAMISETA AZUL R$ 40,00 x 5 R$ 200,00');
  assert.equal(await w.Recibo.receberPDF(file), true, 'tolera barras e igual perdidos pelo OCR');
  assert.equal(w.ReciboInterno.estadoAtual().totalProducao, 200);
  assert.equal(ocrCalls, 3); assert.equal(renderCalls, 3);
  const real = process.env.VOOALTO_TEST_SCAN_PDF;
  if (real) {
    const pdfjs = require(path.join(BASE, 'assets/pdf/pdf.min.js'));
    pdfjs.GlobalWorkerOptions.workerSrc = path.join(BASE, 'assets/pdf/pdf.worker.min.js');
    const pdf = await pdfjs.getDocument({data: new Uint8Array(fs.readFileSync(real)), isEvalSupported:false, useSystemFonts:false, disableFontFace:true}).promise;
    assert.equal(pdf.numPages, 2);
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      assert.equal((await page.getTextContent()).items.filter(x=>x.str&&x.str.trim()).length, 0);
    }
    await pdf.destroy();
  }
  dom.window.close();
  console.log('✓ Recibo: OCR opcional em PDF escaneado, validação e preservação do recibo anterior');
  process.exit(0);
})().catch(e => { console.error(e); dom.window.close(); process.exit(1); });
