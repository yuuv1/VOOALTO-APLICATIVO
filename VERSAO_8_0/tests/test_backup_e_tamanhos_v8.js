'use strict';
/* ══ Testes V8.3 — Visibilidade dos Tamanhos e Sistema Completo de Backup ══ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { criarIDBFalso } = require('./_fake_idb');

const ROOT = path.join(__dirname, '..', 'ATUALIZACAO_V8');
const shellHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fichaHtml = fs.readFileSync(path.join(ROOT, 'criador_ficha_tecnica', 'index.html'), 'utf8');
const orcHtml = fs.readFileSync(path.join(ROOT, 'criador_orcamento', 'index.html'), 'utf8');
const zerarHtml = fs.readFileSync(path.join(ROOT, 'zerar_dados.html'), 'utf8');
const temaCss = fs.readFileSync(path.join(ROOT, 'assets', 'tema-v8.css'), 'utf8');

let pass = 0, fail = 0;
function ok(nome, cond, det) {
  if (cond) { pass++; console.log('  ✔ ' + nome); }
  else { fail++; console.error('  ✘ ' + nome + (det ? ' — ' + det : '')); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function makeDom(html, idb, lsInit) {
  const inlineCss = fichaHtml === html
    ? html.replace('<link rel="stylesheet" href="../assets/tema-v8.css">', '<style>' + temaCss + '</style>')
    : html;
  const dom = new JSDOM(inlineCss, {
    url: 'http://localhost:8080/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      if (idb) win.indexedDB = idb;
      win.alert = () => {};
      win.confirm = () => true;
      win.prompt = (_m, def) => def || 'Teste';
      win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.URL.createObjectURL = () => 'blob:teste-v8';
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function() { win.__lastDownload = this.download; };
      win.HTMLCanvasElement.prototype.getContext = () => ({
        fillRect() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        getImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData() {}
      });
      win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,TESTE';
      if (lsInit) {
        Object.keys(lsInit).forEach(k => win.localStorage.setItem(k, lsInit[k]));
      }
    }
  });
  return dom;
}

(async function main() {
  console.log('\n── 1. Visibilidade dos tamanhos e medidas na Ficha Técnica (Claro, Escuro e PDF) ──');
  {
    ok('CSS .folha fixa tinta escura e color-scheme: light',
      /\.folha\s*\{[^}]*color\s*:\s*var\(--tx\)/.test(fichaHtml) &&
      /\.folha\s*\{[^}]*color-scheme\s*:\s*light/.test(fichaHtml));
    ok('CSS .folha-branca fixa tinta escura e color-scheme: light',
      /\.folha-branca\s*\{[^}]*color\s*:\s*var\(--tx\)/.test(fichaHtml) &&
      /\.folha-branca\s*\{[^}]*color-scheme\s*:\s*light/.test(fichaHtml));
    ok('CSS .med-inp define cor escura explícita (nunca herda CanvasText branco no escuro)',
      /\.med-inp\s*\{[^}]*color\s*:\s*var\(--tx\)/.test(fichaHtml) &&
      /\.med-inp\s*\{[^}]*-webkit-text-fill-color\s*:\s*var\(--tx\)/.test(fichaHtml));
    ok('CSS .cor-inp e .sep-fs-inp definem cor escura explícita',
      /\.cor-inp\s*\{[^}]*color\s*:\s*var\(--tx\)/.test(fichaHtml) &&
      /\.sep-fs-inp\s*\{[^}]*color\s*:\s*var\(--tx\)/.test(fichaHtml));
    ok('CSS @media print força color-scheme: light na ficha e no orçamento',
      /@media print[\s\S]{0,400}color-scheme\s*:\s*light\s*!important/.test(fichaHtml) &&
      /color-scheme\s*:\s*light\s*!important/.test(orcHtml));

    const { indexedDB: idb } = criarIDBFalso();
    const dom = makeDom(fichaHtml, idb, { vooalto_tema: 'escuro' });
    await wait(350);
    const { window: w } = dom;
    const doc = w.document;
    w.applyGlobalTheme('escuro');

    const femInps = Array.from(doc.querySelectorAll('#folha1 .med-bloco.fem .med-inp'));
    const mascInps = Array.from(doc.querySelectorAll('#folha1 .med-bloco.masc .med-inp'));
    ok('Tabela Feminino começa preenchida com os 12 valores padrão (PP..EXG = 24 campos no total)',
      femInps.length === 12 && femInps.every(i => String(i.value).trim().length > 0),
      femInps.map(i => i.value).join(','));
    ok('Tabela Masculino começa preenchida com os 12 valores padrão (PP..EXG)',
      mascInps.length === 12 && mascInps.every(i => String(i.value).trim().length > 0),
      mascInps.map(i => i.value).join(','));

    const csMed = w.getComputedStyle(femInps[0]);
    const csGi = w.getComputedStyle(doc.querySelector('#folha1 .gi'));
    ok('Em tema Escuro, .med-inp mantém cor de texto escura (não branca)',
      csMed.color !== 'rgb(255, 255, 255)' && csMed.color !== '#ffffff' && csMed.color !== '',
      'cor computada: ' + csMed.color);
    ok('Em tema Escuro, .gi (grade P/M/G/GG/EXG) mantém cor de texto escura',
      csGi.color !== 'rgb(255, 255, 255)' && csGi.color !== '#ffffff' && csGi.color !== '',
      'cor computada: ' + csGi.color);

    /* Testa autorrecuperação de rascunho corrompido com medidas vazias + _folha1Removida anterior */
    w.restaurarDeJSON({ _version: 'vooalto_ficha_v7', _folha1Removida: true, _paginas: [] });
    ok('Quando _folha1Removida=true remove #folha1, restaurar ficha normal recria #folha1 e restaura os 24 tamanhos', (() => {
      w.restaurarDeJSON({
        _version: 'vooalto_ficha_v7',
        dc_nome: 'Cliente Recuperado',
        _medFem: Array(12).fill(''),
        _medMasc: Array(12).fill('')
      });
      const recFem = Array.from(doc.querySelectorAll('#folha1 .med-bloco.fem .med-inp')).map(i => i.value);
      const recMasc = Array.from(doc.querySelectorAll('#folha1 .med-bloco.masc .med-inp')).map(i => i.value);
      return !!doc.getElementById('folha1') && recFem.length === 12 && recFem.every(Boolean) && recMasc.length === 12 && recMasc.every(Boolean);
    })());
    dom.window.close();
  }

  console.log('\n── 2. Presença da interface de Backup em todas as telas V8 ──');
  {
    ok('Shell (index.html) tem botão 💾 Backup no topo e #backupModal completo',
      shellHtml.includes('id="btnBackupShell"') && shellHtml.includes('id="backupModal"') && shellHtml.includes('VooaltoBackup'));
    ok('Ficha Técnica tem botões Exportar tudo (com rascunhos) e Importar backup (.json)',
      fichaHtml.includes('id="btnExportarTudoFicha"') && fichaHtml.includes('id="btnImportarBackupFicha"') && fichaHtml.includes('id="v8DraftBackupBtn"'));
    ok('Orçamento tem botão de backup completo na barra lateral e no modal de rascunhos',
      orcHtml.includes('id="btnBackupCompletoOrc"') && orcHtml.includes('exportarBackupCompletoOrc()'));
    ok('Zerar Dados tem botão de exportar backup completo antes da limpeza',
      zerarHtml.includes('id="btnBackupAntes"') && zerarHtml.includes('exportarAntesDeZerar()'));
  }

  console.log('\n── 3. Exportação e Importação completa com rascunhos, imagens e mesclagem segura ──');
  {
    /* Ambiente Origem (Computador A): 2 fichas salvas no IndexedDB com imagens + 1 órfã no IDB + rascunho vivo + rascunho anterior + 2 orçamentos + clientes */
    const { indexedDB: idbOrigem } = criarIDBFalso();
    const domOrigem = makeDom(shellHtml, idbOrigem);
    await wait(120);
    const wA = domOrigem.window;

    /* Grava fichas com imagens no IndexedDB da Origem (incluindo uma órfã fora do _meta!) */
    await new Promise((resolve, reject) => {
      const req = idbOrigem.open('vooalto_ficha_rascunhos_db_v4', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('drafts');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('drafts', 'readwrite');
        const st = tx.objectStore('drafts');
        st.put({
          _version: 'vooalto_ficha_v7',
          _nome: 'Colégio Alfa 2026',
          fichaNum: '041',
          dc_nome: 'Colégio Alfa',
          _layers: [{ id: 'l1', type: 'img', src: 'data:image/png;base64,ARTE_COLEGIO_ALFA' }]
        }, 'd_alfa');
        st.put({
          _version: 'vooalto_ficha_v7',
          _nome: 'Clínica Vida',
          fichaNum: '042',
          dc_nome: 'Clínica Vida',
          _layers: [{ id: 'l2', type: 'img', src: 'data:image/png;base64,LOGO_CLINICA_VIDA' }]
        }, 'd_clinica');
        st.put({
          _version: 'vooalto_ficha_v7',
          _nome: 'Ficha Órfã Resgatada',
          fichaNum: '043',
          dc_nome: 'Cliente Órfão'
        }, 'd_orfa_sem_meta');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
    });
    wA.localStorage.setItem('vooalto_ficha_rascunhos_v4_meta', JSON.stringify([
      { id: 'd_alfa', name: 'Colégio Alfa 2026', date: '22/10/2026 09:30', num: '041' },
      { id: 'd_clinica', name: 'Clínica Vida', date: '22/10/2026 10:00', num: '042' }
    ]));
    wA.localStorage.setItem('vooalto_v7_ficha_ativa', JSON.stringify({
      _version: 'vooalto_ficha_v7',
      fichaNum: '044',
      dc_nome: 'Academia Titan (Rascunho em andamento)',
      _grade: { m: ['2', '5', '8', '3', '1'], b: [], i: [] }
    }));
    wA.localStorage.setItem('vooalto_v7_ficha_ativa_hora', '14:25');
    wA.localStorage.setItem('vooalto_v8_rascunho_meta', JSON.stringify({ hora: '14:25', vazio: false }));
    wA.localStorage.setItem('vooalto_v8_rascunho_anterior', JSON.stringify({
      _version: 'vooalto_ficha_v7',
      fichaNum: '040',
      dc_nome: 'Padaria Central (Rascunho anterior)'
    }));
    wA.localStorage.setItem('vooalto_orcamento_rascunhos_v7', JSON.stringify([
      {
        id: 'orc_1',
        name: 'Proposta Colégio Alfa',
        date: '22/10/2026 às 11:00',
        total: 'R$ 3.500,00',
        itemsCount: 2,
        pagesCount: 1,
        state: { version: 'vooalto_orcamento_v8', form: { 'proposal-title': 'Colégio Alfa' }, pages: [{ id: 1, tableItems: [{ modelo: 'Camiseta', qnt: 50, unit: 70 }] }], signature: 'data:image/png;base64,ASSINATURA_A' }
      }
    ]));
    wA.localStorage.setItem('vooalto_orcamento_autosave_v7', JSON.stringify({
      version: 'vooalto_orcamento_v8',
      form: { 'proposal-title': 'Proposta Ativa Supermercado Sol' },
      pages: [{ id: 1, tableItems: [{ modelo: 'Jaleco', qnt: 20, unit: 95 }] }],
      signature: ''
    }));
    wA.localStorage.setItem('vooalto_ficha_clientes_v7', JSON.stringify({ 'Colégio Alfa': '(62) 99999-1111' }));
    wA.localStorage.setItem('va4_ficha_counter', '45');
    wA.localStorage.setItem('vooalto_tema', 'escuro');

    const exportado = await wA.VooaltoBackup.exportarTudo();
    const jsonExportado = JSON.stringify(exportado.payload);

    ok('Exportação captura todas as fichas do IndexedDB inclusive registro órfão + imagens base64',
      exportado.payload.fichas.length === 3 &&
      exportado.payload.fichas[0].data._layers[0].src === 'data:image/png;base64,ARTE_COLEGIO_ALFA');
    ok('Exportação captura rascunho ativo + rascunho anterior da Ficha Técnica',
      exportado.payload.rascunhosFicha.ativo.dc_nome.includes('Academia Titan') &&
      exportado.payload.rascunhosFicha.anterior.dc_nome.includes('Padaria Central'));
    ok('Exportação captura rascunhos salvos + proposta em edição do Orçamento',
      exportado.payload.orcamento.rascunhos.length === 1 &&
      exportado.payload.orcamento.ativo.form['proposal-title'] === 'Proposta Ativa Supermercado Sol');

    /* Ambiente Destino (Computador B): JÁ TEM dados locais + rascunhos não salvos na tela!
       Ao importar no modo MESCLAR, NADA do Computador B pode ser perdido! */
    const { indexedDB: idbDestino } = criarIDBFalso();
    const domDestino = makeDom(shellHtml, idbDestino);
    await wait(120);
    const wB = domDestino.window;

    await new Promise((resolve, reject) => {
      const req = idbDestino.open('vooalto_ficha_rascunhos_db_v4', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('drafts');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('drafts', 'readwrite');
        tx.objectStore('drafts').put({
          _version: 'vooalto_ficha_v7',
          _nome: ' Construtora Local B',
          fichaNum: '012',
          dc_nome: 'Construtora Local B'
        }, 'd_local_b');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
    });
    wB.localStorage.setItem('vooalto_ficha_rascunhos_v4_meta', JSON.stringify([
      { id: 'd_local_b', name: 'Construtora Local B', date: '21/10/2026 16:00', num: '012' }
    ]));
    wB.localStorage.setItem('vooalto_v7_ficha_ativa', JSON.stringify({
      _version: 'vooalto_ficha_v7',
      fichaNum: '099',
      dc_nome: 'Trabalho Local Não Salvo Na Tela'
    }));
    wB.localStorage.setItem('vooalto_v8_rascunho_meta', JSON.stringify({ hora: '15:00', vazio: false }));
    wB.localStorage.setItem('vooalto_orcamento_autosave_v7', JSON.stringify({
      version: 'vooalto_orcamento_v8',
      form: { 'proposal-title': 'Orçamento Local Não Salvo' },
      pages: [{ id: 1, tableItems: [{ modelo: 'Avental Brim', qnt: 15, unit: 55 }] }],
      signature: ''
    }));
    wB.localStorage.setItem('vooalto_ficha_clientes_v7', JSON.stringify({ 'Cliente Local B': '(62) 98888-2222' }));

    const resMerge = await wB.VooaltoBackup.restaurar(jsonExportado, 'mesclar');
    const tudoPosMerge = await wB.VooaltoBackup.coletarTudo();

    ok('Mesclagem soma 1 ficha local + 1 rascunho vivo resgatado + 3 fichas do backup = 5 fichas salvas sem perder nenhuma!',
      resMerge.resumo.fichasSalvas === 5 &&
      tudoPosMerge.fichas.some(f => f.name.includes('Rascunho recuperado')) &&
      tudoPosMerge.fichas.some(f => f.id === 'd_local_b') &&
      tudoPosMerge.fichas.some(f => f.id === 'd_alfa' && f.data._layers[0].src === 'data:image/png;base64,ARTE_COLEGIO_ALFA'),
      'fichas após mesclar: ' + tudoPosMerge.fichas.map(f => f.id + ':' + f.name).join(' | '));

    ok('Mesclagem também resgata orçamento local não salvo + importa rascunhos de orçamento + restaura proposta ativa',
      resMerge.resumo.orcamentoRascunhos === 2 &&
      tudoPosMerge.orcamento.rascunhos.some(o => o.name.includes('Rascunho recuperado')) &&
      tudoPosMerge.orcamento.rascunhos.some(o => o.id === 'orc_1') &&
      tudoPosMerge.orcamento.ativo.form['proposal-title'] === 'Proposta Ativa Supermercado Sol');

    ok('Mesclagem preserva clientes dos dois computadores e avança contador para o maior valor',
      tudoPosMerge.clientes['Colégio Alfa'] === '(62) 99999-1111' &&
      tudoPosMerge.clientes['Cliente Local B'] === '(62) 98888-2222' &&
      wB.localStorage.getItem('va4_ficha_counter') === '45');

    /* Testa modo SUBSTITUIR: restaura espelho exato das 3 fichas + 1 rascunho de orçamento */
    const resReplace = await wB.VooaltoBackup.restaurar(jsonExportado, 'substituir');
    ok('Modo substituir restaura exatamente os 3 registros de fichas e 1 rascunho de orçamento do backup',
      resReplace.resumo.fichasSalvas === 3 &&
      resReplace.resumo.orcamentoRascunhos === 1 &&
      wB.localStorage.getItem('vooalto_tema') === 'escuro');

    /* Testa compatibilidade com backup legado do Catálogo V7 */
    const v7Legacy = {
      _version: 'vooalto_catalog_v7',
      orders: [
        { id: 'ped_v7_1', num: '201', cliente: 'Escola Horizonte', telefone: '(62) 3333-4444', fichaData: { _version: 'vooalto_ficha_v7', dc_nome: 'Escola Horizonte', fichaNum: '201' } }
      ]
    };
    const resV7 = await wB.VooaltoBackup.restaurar(v7Legacy, 'mesclar');
    ok('Importador universal converte pedidos de backup legado V7 para Minhas fichas E preserva o rascunho ativo anterior (3 + 1 resgatado + 1 V7 = 5)',
      resV7.resumo.fichasSalvas === 5 && JSON.parse(wB.localStorage.getItem('vooalto_ficha_clientes_v7'))['Escola Horizonte'] === '(62) 3333-4444');

    domOrigem.window.close();
    domDestino.window.close();
  }

  console.log('\nResultado V8.3: ' + pass + ' passaram, ' + fail + ' falharam.');
  process.exit(fail ? 1 : 0);
})();
