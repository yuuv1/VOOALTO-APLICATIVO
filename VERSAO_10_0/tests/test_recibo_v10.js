'use strict';
/* ══ V10.6 — RECIBO AUTOMÁTICO (versão de teste) ═══════════════════════════
   O módulo novo tem de provar quatro coisas:

   1. nasce da FICHA TÉCNICA pronta (cliente, nº, itens, valores e entrada)
      sem depender de rede;
   2. pagamento TOTAL x PARCIAL fecha a conta certa (com desconto, já
      recebido e saldo da ficha);
   3. qualquer valor pode ser trocado À MÃO — e o modo acompanha a troca;
   4. salvar cria numeração própria e é isso que faz o "já recebido" da
      mesma ficha funcionar no recibo seguinte.

   Também trava a folha A4 (uma página, impressão só da folha) e as chaves de
   armazenamento com prefixo `vooalto_`, sem as quais o backup completo não
   levaria os recibos.
*/
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');
const { criarIDBFalso } = require('./_fake_idb');

const HTML = fs.readFileSync(path.join(BASE, 'criador_recibo', 'index.html'), 'utf-8');
const espera = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(nome, cond, detalhe) {
  if (cond) { pass++; console.log('  [OK] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 140) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 240) : '')); }
}

function abrir() {
  const errs = [];
  const dom = new JSDOM(HTML, {
    url: 'http://localhost:4800/criador_recibo/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.addEventListener('error', e => errs.push(e.message));
      w.print = () => { w.__printed = (w.__printed || 0) + 1; };
      w.confirm = () => true;
      w.alert = () => {};
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      try { w.navigator.clipboard = { writeText: async () => {} }; } catch (e) {}
    }
  });
  return { dom, w: dom.window, d: dom.window.document, errs };
}

const FICHA = {
  _version: 'vooalto_ficha_v7',
  _nome: 'Ficha da Ana',
  _numFicha: '3456',
  dc_nome: '<b>Ana</b> Silva',
  dc_doc: '123.456.789-00',
  dc_tel: '(62) 99999-0000',
  dc_end: 'Rua 1, 10 — Setor Central',
  dc_cidade: 'Goiânia - GO',
  entradaVal: '300,00',
  _prod: [
    { modelo: 'Camiseta gola polo', valor: '50,00', qtd: '10' },
    { modelo: 'Calça social', valor: '80,00', qtd: '5' }
  ],
  _paginas: [
    { id: 'p2', prod: [{ modelo: 'Jaqueta', valor: '200,00', qtd: '1' }] }
  ]
};

(async () => {
  const { w, d, errs } = abrir();
  await espera(350);
  const R = w.ReciboInterno;
  if (!R) { console.error('FATAL: a API do recibo não carregou.', errs); process.exit(1); }

  console.log('\n── 1. Estrutura e folha A4 ──');
  ok('o módulo se identifica como teste', /beta-chip/.test(HTML) && /versão de teste|VERSÃO DE TESTE/i.test(HTML));
  ok('tem uma folha A4 única', d.querySelectorAll('#reciboFolha').length === 1 && d.querySelectorAll('.page').length === 1);
  ok('a folha tem 794x1120 (A4 a 96 dpi)', /width:794px;height:1120px/.test(HTML));
  ok('o painel tem as cinco seções do fluxo', d.querySelectorAll('.card-title').length >= 5);
  ok('imprimir esconde o painel e mostra só a folha', /@media print[\s\S]*?\.sidebar[\s\S]*?display:none!important/.test(HTML));
  ok('a folha é papel branco nos dois temas (não usa var de tema)', /\.page\{[^}]*background:#ffffff/.test(HTML));
  ok('nenhum recurso externo (roda offline)', !/https?:\/\//i.test(HTML), (HTML.match(/https?:\/\/\S+/gi) || []).slice(0, 3));
  ok('carrega as bibliotecas locais', /\.\.\/assets\/tema-v10\.css/.test(HTML) && /\.\.\/assets\/zoom-folha\.js/.test(HTML) && /\.\.\/assets\/html2canvas\.min\.js/.test(HTML));
  ok('tem botão de imprimir, PNG, salvar e recibos salvos', /Recibo\.imprimir\(\)/.test(HTML) && /Recibo\.exportarPNG\(\)/.test(HTML) && /Recibo\.salvar\(\)/.test(HTML) && /Recibo\.abrirSalvos\(\)/.test(HTML));
  ok('sem erro de página no módulo', errs.length === 0, errs.slice(0, 3));

  console.log('\n── 2. Dinheiro: leitura, escrita e extenso ──');
  const casosParse = [
    ['1.234,56', 1234.56], ['1234.56', 1234.56], ['R$ 1.234,56', 1234.56],
    ['300,00', 300], ['50', 50], ['', 0], [null, 0], [75.5, 75.5], ['1,234.56', 1234.56]
  ];
  casosParse.forEach(([entrada, esperado]) => ok('parseBRL(' + JSON.stringify(entrada) + ') = ' + esperado, R.parseBRL(entrada) === esperado, R.parseBRL(entrada)));
  ok('fmtBRL formata em real', R.fmtBRL(1234.56) === 'R$ 1.234,56', R.fmtBRL(1234.56));

  const casosExtenso = [
    [0, 'zero reais'],
    [1, 'um real'],
    [1.5, 'um real e cinquenta centavos'],
    [0.01, 'um centavo'],
    [15, 'quinze reais'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [300, 'trezentos reais'],
    [900, 'novecentos reais'],
    [1000, 'mil reais'],
    [1100, 'mil e cem reais'],
    [1234.56, 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [1200000, 'um milhão e duzentos mil reais'],
    [2000000, 'dois milhões de reais']
  ];
  casosExtenso.forEach(([valor, esperado]) => ok('extenso(' + valor + ')', R.extenso(valor) === esperado, R.extenso(valor)));

  console.log('\n── 3. Da ficha técnica para o recibo ──');
  ok('a ficha é aplicada', R.aplicarFicha(FICHA, { id: 'd1', name: 'Ficha da Ana' }) === true);
  let e = R.estadoAtual();
  ok('cliente vem sem HTML', e.cliente.nome === 'Ana Silva', e.cliente.nome);
  ok('CPF/CNPJ, telefone, endereço e cidade vêm da ficha',
    e.cliente.doc === '123.456.789-00' && e.cliente.tel === '(62) 99999-0000' && /Rua 1/.test(e.cliente.end) && e.cliente.cidade === 'Goiânia - GO',
    e.cliente);
  ok('número da ficha é copiado', e.fichaNum === '3456', e.fichaNum);
  ok('itens da folha 1 + páginas extras entram no recibo', e.itens.length === 3, e.itens);
  ok('total é a soma qtd × unitário (900 + 200 = 1.100)', e.totalProducao === 1100, e.totalProducao);
  ok('peças somadas', R.totalPecas(e) === 16, R.totalPecas(e));
  ok('entrada da ficha vira pagamento parcial', e.modo === 'parcial' && e.valorPago === 300, { modo: e.modo, pago: e.valorPago });
  ok('saldo de 800 no primeiro recibo', R.calcular(e).saldo === 800, R.calcular(e));
  ok('o texto do recibo cita cliente, valor e extenso',
    /Recebemos de Ana Silva/.test(R.textoDoRecibo(e)) && /R\$ 300,00/.test(R.textoDoRecibo(e)) &&
    /trezentos reais/.test(R.textoDoRecibo(e)), R.textoDoRecibo(e));
  ok('a folha mostra o valor e o número', d.getElementById('pvValor').textContent === 'R$ 300,00' && d.getElementById('pvNumero').textContent === '0001',
    { valor: d.getElementById('pvValor').textContent, numero: d.getElementById('pvNumero').textContent });
  ok('a folha mostra a ficha de origem', d.getElementById('pvFichaTag').textContent === 'Ficha nº 3456' && d.getElementById('pvFichaTag').style.display !== 'none');
  ok('a tabela de itens é renderizada', d.querySelectorAll('#pvItens tr').length === 3, d.querySelectorAll('#pvItens tr').length);
  ok('o resumo mostra saldo devedor', d.getElementById('pvSaldo').textContent === 'R$ 800,00' && d.getElementById('pvSaldoBox').style.display !== 'none',
    d.getElementById('pvSaldo').textContent);
  ok('com número ímpar de quadros, o saldo ocupa a linha inteira', d.getElementById('pvSaldoBox').style.gridColumn === 'span 2',
    d.getElementById('pvSaldoBox').style.gridColumn);
  const confirmOriginal = w.confirm;
  try {
    w.confirm = () => false;
    const trocou = R.aplicarFicha({ _version: 'vooalto_ficha_v7', _numFicha: '9999', dc_nome: 'Outro Cliente', _prod: [] }, {});
    ok('trocar de ficha em cima de recibo preenchido pede confirmação', trocou === false && R.estadoAtual().cliente.nome === 'Ana Silva',
      { trocou: trocou, cliente: R.estadoAtual().cliente.nome });
  } finally {
    w.confirm = confirmOriginal;
  }

  console.log('\n── 4. Total x parcial (e a alteração manual) ──');
  w.Recibo.definirModo('total');
  e = R.estadoAtual();
  ok('Total quita a produção', e.modo === 'total' && e.valorPago === 1100 && R.calcular(e).saldo === 0, { modo: e.modo, pago: e.valorPago });
  ok('no total a folha não mostra saldo', d.getElementById('pvSaldoBox').style.display === 'none');
  ok('carimbo QUITADO aparece quando não há saldo', / on/.test(d.getElementById('pvCarimbo').className), d.getElementById('pvCarimbo').className);

  w.Recibo.campo('desconto', '100,00');
  e = R.estadoAtual();
  ok('desconto reduz a base e o valor no modo total', R.calcular(e).base === 1000 && e.valorPago === 1000, R.calcular(e));

  w.Recibo.campo('pago', '400,00');
  e = R.estadoAtual();
  ok('digitar um valor menor que o total passa sozinho para Parcial', e.modo === 'parcial', e.modo);
  ok('o valor digitado manda (alteração manual respeitada)', R.calcular(e).pago === 400 && R.calcular(e).saldo === 600, R.calcular(e));
  ok('a folha passa a mostrar o saldo de 600', d.getElementById('pvSaldo').textContent === 'R$ 600,00' && d.getElementById('pvSaldoBox').style.display !== 'none',
    d.getElementById('pvSaldo').textContent);

  w.Recibo.definirModo('total');
  w.Recibo.campo('total', '2.000,00');
  e = R.estadoAtual();
  ok('o total também pode ser digitado por cima dos itens', e.totalManual === true && e.totalProducao === 2000, { manual: e.totalManual, total: e.totalProducao });
  ok('o aviso de total manual aparece', d.getElementById('totalHint').style.display === 'block');
  ok('no modo total o valor recebido acompanha o novo total', e.valorPago === 1900, e.valorPago);
  w.Recibo.recalcularTotal();
  e = R.estadoAtual();
  ok('recalcular pelos itens devolve o total da ficha', e.totalManual === false && e.totalProducao === 1100, e.totalProducao);

  console.log('\n── 5. Itens editáveis ──');
  w.Recibo.itemCampo(0, 'qtd', '20');
  e = R.estadoAtual();
  ok('mudar a quantidade recalcula o total', e.itens[0].qtd === 20 && e.totalProducao === 1600, e.totalProducao);
  w.Recibo.itemCampo(0, 'unit', '60,00');
  ok('mudar o valor unitário recalcula o total', R.estadoAtual().totalProducao === 1800, R.estadoAtual().totalProducao);
  w.Recibo.adicionarItem();
  ok('adicionar item entra na lista', R.estadoAtual().itens.length === 4);
  w.Recibo.itemCampo(3, 'modelo', 'Boné');
  w.Recibo.itemCampo(3, 'qtd', '2');
  w.Recibo.itemCampo(3, 'unit', '25,00');
  ok('o item novo soma no total', R.estadoAtual().totalProducao === 1850, R.estadoAtual().totalProducao);
  w.Recibo.removerItem(3);
  ok('remover item tira do total', R.estadoAtual().itens.length === 3 && R.estadoAtual().totalProducao === 1800, R.estadoAtual().totalProducao);
  ok('a tabela do recibo acompanha os itens editados', /Camiseta gola polo/.test(d.getElementById('pvItens').textContent));

  console.log('\n── 6. Salvar, numerar e somar o que já foi recebido ──');
  w.Recibo.definirModo('parcial');
  w.Recibo.campo('pago', '300,00');
  const r1 = w.Recibo.salvar();
  ok('salvar guarda o recibo', !!r1 && R.recibos().length === 1, R.recibos().length);
  ok('o número nasce sozinho (1)', r1 && r1.numero === '1', r1 && r1.numero);
  ok('o recibo salvo leva cliente, ficha, valores e saldo',
    r1 && r1.cliente.nome === 'Ana Silva' && r1.fichaNum === '3456' && r1.valorPago === 300 && r1.saldo === 1400,
    r1 && { v: r1.valorPago, s: r1.saldo, f: r1.fichaNum });
  ok('o último número fica gravado', w.localStorage.getItem('vooalto_recibo_numero_v1') === '1', w.localStorage.getItem('vooalto_recibo_numero_v1'));
  ok('recibo com valor zero é recusado', (() => {
    const antes = R.recibos().length;
    w.Recibo.novo();
    const r = w.Recibo.salvar();
    return r === null && R.recibos().length === antes;
  })());

  w.Recibo.novo();
  ok('Novo recibo avança a numeração (2)', R.estadoAtual().numero === '2', R.estadoAtual().numero);
  R.aplicarFicha(FICHA, { id: 'd1', name: 'Ficha da Ana' });
  e = R.estadoAtual();
  ok('ao reabrir a mesma ficha, o "já recebido" soma o recibo salvo', e.jaRecebido === 300, e.jaRecebido);
  ok('o valor sugerido passa a ser o saldo restante', e.valorPago === 800 && e.modo === 'parcial', { pago: e.valorPago, modo: e.modo });
  ok('o saldo devedor desconta o recebido antes (fecha a ficha)', R.calcular(e).saldo === 0 && R.calcular(e).saldoFicha === 0, R.calcular(e));
  ok('o total pago na ficha soma anteriores + este recibo', R.calcular(e).totalPagoFicha === 1100, R.calcular(e).totalPagoFicha);
  w.Recibo.definirModo('total');
  ok('no modo Total com histórico, o valor cobrado é só o saldo restante', R.estadoAtual().valorPago === 800 && R.calcular().saldo === 0,
    { pago: R.estadoAtual().valorPago, saldo: R.calcular().saldo });
  ok('a folha informa o já recebido', d.getElementById('pvJa').textContent === 'R$ 300,00' && d.getElementById('pvJaBox').style.display !== 'none',
    d.getElementById('pvJa').textContent);
  w.Recibo.salvar();
  ok('o segundo recibo entra na lista', R.recibos().length === 2, R.recibos().length);
  ok('a ficha fica quitada com os dois recibos', R.jaRecebidoDaFicha('3456') === 1100, R.jaRecebidoDaFicha('3456'));
  w.Recibo.recalcularJaRecebido();
  ok('recalcular "já recebido" volta à soma dos salvos', R.estadoAtual().jaRecebido === 300, R.estadoAtual().jaRecebido);

  console.log('\n── 7. Recibos salvos: abrir, editar e excluir ──');
  const lista = R.recibos();
  const id1 = lista.find(r => r.numero === '1').id;
  ok('abrir um recibo salvo traz os dados de volta', R.abrirRecibo(id1) === true && R.estadoAtual().cliente.nome === 'Ana Silva' && R.estadoAtual().id === id1);
  w.Recibo.campo('obs', 'Pago em dinheiro na loja');
  const antesDeEditar = R.recibos().length;
  const editado = w.Recibo.salvar();
  ok('salvar de novo ATUALIZA o mesmo recibo (não duplica)', editado && editado.id === id1 && R.recibos().length === antesDeEditar && editado.obs === 'Pago em dinheiro na loja',
    editado && { id: editado.id, total: R.recibos().length });
  ok('a observação aparece na folha', /Pago em dinheiro/.test(d.getElementById('pvObs').textContent));
  w.Recibo.abrirSalvos();
  ok('a lista de recibos salvos abre', d.getElementById('modalRecibos').classList.contains('open'));
  ok('a lista mostra os recibos', d.querySelectorAll('#listaRecibos .salvo-row').length === 2, d.querySelectorAll('#listaRecibos .salvo-row').length);
  w.Recibo.fecharSalvos();
  ok('excluir remove o recibo', w.Recibo.excluirRecibo(id1) === true && R.recibos().length === 1, R.recibos().length);

  /* "Salvar e outro": parcela seguinte da MESMA ficha, sem redigitar nada. */
  const fichaParcelada = {
    _version: 'vooalto_ficha_v7', _numFicha: '5555', dc_nome: 'Loja Parcelada', entradaVal: '0,00',
    _prod: [{ modelo: 'Uniforme', valor: '250,00', qtd: '2' }]
  };
  w.Recibo.novo();
  R.aplicarFicha(fichaParcelada, { id: 'p1', name: 'Ficha 5555' });
  w.Recibo.definirModo('parcial');
  w.Recibo.campo('pago', '200,00');
  const antesNovo = R.recibos().length;
  const salvoNovo = w.Recibo.salvarENovo();
  e = R.estadoAtual();
  ok('“Salvar e outro” salva e abre o próximo recibo', !!salvoNovo && R.recibos().length === antesNovo + 1, R.recibos().length);
  ok('o próximo recibo mantém cliente e itens da ficha', e.cliente.nome === 'Loja Parcelada' && e.itens.length === 1, { cli: e.cliente.nome, itens: e.itens.length });
  ok('o próximo recibo recebe o número seguinte', e.numero === String(parseInt(salvoNovo.numero, 10) + 1), { antes: salvoNovo.numero, agora: e.numero });
  ok('o próximo recibo já sabe o que foi recebido e sugere o saldo', e.jaRecebido === 200 && e.valorPago === 300,
    { ja: e.jaRecebido, pago: e.valorPago });
  w.Recibo.salvar();
  ok('a ficha parcelada fecha com os dois recibos', R.jaRecebidoDaFicha('5555') === 500, R.jaRecebidoDaFicha('5555'));
  w.Recibo.novo();

  console.log('\n── 8. Rascunho automático, importação e chaves de backup ──');
  ok('o rascunho é gravado sozinho', (() => {
    try {
      const raw = JSON.parse(w.localStorage.getItem('vooalto_recibo_autosave_v1'));
      return !!raw && !!raw.estado && typeof raw.estado.cliente === 'object';
    } catch (e) { return false; }
  })());
  w.Recibo.campo('nome', 'Cliente do rascunho');
  await espera(700);
  ok('o rascunho acompanha a edição', (() => {
    try { return JSON.parse(w.localStorage.getItem('vooalto_recibo_autosave_v1')).estado.cliente.nome === 'Cliente do rascunho'; }
    catch (e) { return false; }
  })());
  ok('importar uma ficha avulsa preenche e entra na lista', (() => {
    const outra = Object.assign({}, FICHA, { _numFicha: '9001', dc_nome: 'Bruno Costa', entradaVal: '0,00' });
    const r = R.importarObjeto({ _version: 'vooalto_ficha_v7', _numFicha: '9001', dc_nome: 'Bruno Costa', entradaVal: '0,00', _prod: [{ modelo: 'Moletom', valor: '120,00', qtd: '2' }] });
    const opcoes = d.getElementById('fichaSelect').textContent;
    return r === true && R.estadoAtual().cliente.nome === 'Bruno Costa' && R.estadoAtual().totalProducao === 240 && /Importada/.test(opcoes);
  })());
  ok('importar um backup completo usa as fichas de dentro', (() => {
    const r = R.importarObjeto({
      _version: 'vooalto_backup_v9',
      fichas: [{ id: 'x1', name: 'Ficha X', data: Object.assign({}, FICHA, { _numFicha: '7000', dc_nome: 'Carla' }) }]
    });
    return r === true && R.estadoAtual().cliente.nome === 'Carla' && R.estadoAtual().fichaNum === '7000';
  })());
  ok('importar arquivo sem ficha é recusado', R.importarObjeto({ _version: 'outra_coisa', foo: 1 }) === false);
  ok('as chaves do recibo entram no backup completo (prefixo vooalto_)',
    ['vooalto_recibos_v1', 'vooalto_recibo_numero_v1', 'vooalto_recibo_autosave_v1', 'vooalto_recibo_empresa_v1']
      .every(k => k.indexOf('vooalto_') === 0 && HTML.includes(k)));
  ok('o shell faz a mesclagem dos recibos no backup', (() => {
    const shell = fs.readFileSync(path.join(BASE, 'index.html'), 'utf-8');
    return /vooalto_recibos_v1/.test(shell) && /V10\.6 — recibos/.test(shell);
  })());

  console.log('\n── 9. Impressão e texto para WhatsApp ──');
  w.Recibo.imprimir();
  ok('imprimir chama a impressão do navegador', w.__printed === 1, w.__printed);
  const txt = R.textoParaCopiar();
  ok('o texto de copiar tem número, valor e forma de pagamento', /RECIBO Nº/.test(txt) && /Recebemos de/.test(txt) && /Forma de pagamento/.test(txt), txt.split('\n')[0]);
  ok('o texto mostra quitado/saldo', /Quitado|Saldo devedor/.test(txt), txt.split('\n').pop());

  console.log('\n── 10. Tema e integração ──');
  w.postMessage({ type: 'vooalto-theme', theme: 'claro' }, '*');
  await espera(60);
  ok('o recibo aceita o tema do shell', d.documentElement.getAttribute('data-theme') === 'claro');
  w.postMessage({ type: 'vooalto-theme', theme: 'escuro' }, '*');
  await espera(60);
  ok('o recibo aceita o tema escuro', d.documentElement.getAttribute('data-theme') === 'escuro');
  ok('a ficha técnica tem o atalho de gerar recibo', (() => {
    const ficha = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
    return /function abrirReciboDaFicha/.test(ficha) && /vooalto-abrir-recibo/.test(ficha) && /Gerar recibo/.test(ficha);
  })());
  ok('a ficha manda só o que o recibo usa (sem imagens/camadas)', (() => {
    const ficha = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
    const ini = ficha.indexOf('function abrirReciboDaFicha');
    const trecho = ficha.slice(ini, ini + 2200);
    return /dc_nome:/.test(trecho) && /_prod:/.test(trecho) && !/_layers/.test(trecho) && !/src:/.test(trecho);
  })());
  ok('sem erro de página no fim da suíte', errs.length === 0, errs.slice(0, 3));

  console.log('\n── 11. Backup completo: mesclar não perde recibo ──');
  {
    const shellHtml = fs.readFileSync(path.join(BASE, 'index.html'), 'utf-8');
    const dom2 = new JSDOM(shellHtml, {
      url: 'http://localhost:4800/index.html', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(win) {
        win.indexedDB = criarIDBFalso().indexedDB;
        win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        win.alert = () => {}; win.confirm = () => true; win.print = () => {};
        win.HTMLIFrameElement.prototype.__defineGetter__('contentWindow', () => null);
      }
    });
    await espera(500);
    const w2 = dom2.window;
    try {
      w2.eval('fecharTour()');
      w2.localStorage.setItem('vooalto_recibos_v1', JSON.stringify([{ id: 'local1', numero: '7', valorPago: 100, fichaNum: '10' }]));
      w2.localStorage.setItem('vooalto_recibo_numero_v1', '7');
      await w2.VooaltoBackup.restaurar({
        _version: 'vooalto_backup_v9',
        /* Uma ficha no backup: transação vazia não dispara oncomplete no
           IndexedDB falso usado pelos testes (no navegador dispararia). */
        fichas: [{ id: 'fx1', name: 'Ficha X', date: '01/01/2026 10:00', num: '10', data: { _numFicha: '10', _prod: [] } }],
        clientes: {},
        rascunhosFicha: {}, orcamento: { rascunhos: [] },
        storage: {
          vooalto_recibos_v1: JSON.stringify([{ id: 'backup1', numero: '8', valorPago: 200, fichaNum: '11' }]),
          vooalto_recibo_numero_v1: '8',
          vooalto_recibo_empresa_v1: JSON.stringify({ telefone: 'x', cnpj: 'y', endereco: 'z' })
        }
      }, 'mesclar');
      const lista = JSON.parse(w2.localStorage.getItem('vooalto_recibos_v1') || '[]');
      ok('a mesclagem mantém os recibos locais e os do backup', lista.length === 2 && lista.some(r => r.id === 'local1') && lista.some(r => r.id === 'backup1'), lista.map(r => r.id));
      ok('a mesclagem mantém o maior número de recibo', w2.localStorage.getItem('vooalto_recibo_numero_v1') === '8', w2.localStorage.getItem('vooalto_recibo_numero_v1'));
      ok('a mesclagem traz o cabeçalho do recibo', !!w2.localStorage.getItem('vooalto_recibo_empresa_v1'));
    } catch (e) {
      ok('a mesclagem de recibos rodou sem erro', false, String(e && e.message));
    } finally {
      dom2.window.close();
    }
    const ficha = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
    const orc = fs.readFileSync(path.join(BASE, 'criador_orcamento', 'index.html'), 'utf-8');
    ok('a mesclagem existe também na Ficha e no Orçamento', /V10\.6 — recibos/.test(ficha) && /V10\.6 — recibos/.test(orc));
  }

  console.log('\n── 12. Jogar a ficha e o recibo nascer pronto ──');
  {
    const fichaAtiva = {
      _version: 'vooalto_ficha_v7', _numFicha: '7777',
      dc_nome: 'Cliente Já Aberto', dc_doc: '999.888.777-66', dc_cidade: 'Goiânia - GO',
      entradaVal: '0,00',
      _prod: [{ modelo: 'Bata', valor: '100,00', qtd: '3' }]
    };
    const dom3 = new JSDOM(HTML, {
      url: 'http://localhost:4800/criador_recibo/index.html',
      runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(win) {
        win.confirm = () => true;
        win.alert = () => {};
        win.print = () => {};
        win.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        win.localStorage.setItem('vooalto_v7_ficha_ativa', JSON.stringify(fichaAtiva));
        win.localStorage.setItem('vooalto_v8_rascunho_meta', JSON.stringify({ vazio: false }));
      }
    });
    await espera(450);
    const w3 = dom3.window, d3 = w3.document, R3 = w3.ReciboInterno;

    ok('a ficha que está aberta vira recibo sozinha ao abrir a aba',
      R3.estadoAtual().cliente.nome === 'Cliente Já Aberto' && R3.estadoAtual().totalProducao === 300 && R3.estadoAtual().fichaNum === '7777',
      { cli: R3.estadoAtual().cliente.nome, total: R3.estadoAtual().totalProducao });

    ok('escolher na lista já carrega (sem apertar botão)',
      /onchange="Recibo\.carregarFichaSelecionada\(\)"/.test(HTML));

    const evDrag = new w3.Event('dragenter', { bubbles: true, cancelable: true });
    Object.defineProperty(evDrag, 'dataTransfer', { value: { types: ['Files'], files: [] } });
    w3.document.dispatchEvent(evDrag);
    ok('arrastar arquivo mostra o aviso de “solte aqui”', d3.getElementById('reciboDropOverlay').classList.contains('on'));

    const outra = {
      _version: 'vooalto_ficha_v7', _numFicha: '8888',
      dc_nome: 'Cliente do Arquivo', dc_doc: '111.222.333-44', dc_cidade: 'Goiânia - GO',
      entradaVal: '0,00',
      _prod: [{ modelo: 'Camisa', valor: '60,00', qtd: '2' }]
    };
    const arquivo = new w3.File([JSON.stringify(outra)], 'ficha_8888.json', { type: 'application/json' });
    const evDrop = new w3.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evDrop, 'dataTransfer', { value: { types: ['Files'], files: [arquivo], dropEffect: 'copy' } });
    w3.document.dispatchEvent(evDrop);
    await espera(450);
    const depoisDrop = R3.estadoAtual();
    ok('soltar o .json da ficha cria o recibo na hora',
      depoisDrop.cliente.nome === 'Cliente do Arquivo' && depoisDrop.totalProducao === 120 && depoisDrop.fichaNum === '8888',
      { cli: depoisDrop.cliente.nome, total: depoisDrop.totalProducao, num: depoisDrop.fichaNum });
    ok('o aviso de arrastar sai depois de soltar', !d3.getElementById('reciboDropOverlay').classList.contains('on'));

    const pdf = new w3.File(['%PDF-1.4 nada legível'], 'ficha_impressa.pdf', { type: 'application/pdf' });
    const evPdf = new w3.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evPdf, 'dataTransfer', { value: { types: ['Files'], files: [pdf], dropEffect: 'copy' } });
    w3.document.dispatchEvent(evPdf);
    await espera(200);
    ok('PDF/foto não é lido e o recibo atual não é perdido',
      R3.estadoAtual().cliente.nome === 'Cliente do Arquivo' && /Só arquivo \.json/.test(d3.getElementById('reciboToast').textContent),
      d3.getElementById('reciboToast').textContent.slice(0, 90));
    dom3.window.close();
  }

  console.log(fail ? `\n═══ RECIBO V10.6: ${fail} FALHA(S) ═══` : '\n═══ RECIBO V10.6: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
