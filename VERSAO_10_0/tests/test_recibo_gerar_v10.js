'use strict';
/* ══ V10.7.2 — O botão “🧾 Gerar recibo” da Ficha Técnica ══════════════════

   O botão mandava a ficha inteira (folha 1 + páginas extras) para o módulo
   Recibo. Na ficha técnica, porém, toda página extra nasce como ESPELHO da
   folha 1 (copiarP1paraExtra) e continua espelhando quando a folha 1 muda.
   O recibo somava folha 1 + página 2 + página 3…: o total saía dobrado (ou
   triplo) e o “valor recebido”Suggestido nascia errado.

   Este arquivo trava:
     1. o espelho da folha 1 NÃO entra de novo como item;
     2. uma página extra com produção DIFERENTE (fichas antigas) ainda entra;
     3. a página em branco nunca entra;
     4. a folha do recibo se identifica como RECIBO (e leva a ficha ao lado);
     5. a mesma regra vale para o .json importado (mesma porta de entrada).
*/
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');

const espera = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(nome, cond, detalhe) {
  if (cond) { pass++; console.log('  [OK] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 160) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 240) : '')); }
}

/* ── a Ficha Técnica, com uma folha 1 e uma página 2 (espelho) ── */
async function abrirFicha() {
  const html = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => console.log('ERRO FICHA:', e.message));
    }
  });
  const w = dom.window, d = w.document;
  const enviados = [];
  Object.defineProperty(w, 'parent', { value: { postMessage: msg => enviados.push(msg) }, configurable: true });
  await espera(1800);
  d.getElementById('fichaNum').value = '3418';
  d.getElementById('dc_nome').textContent = 'Sanducheria Sandubas';
  d.getElementById('dc_doc').textContent = '52.916.107/0001-88';
  d.getElementById('dc_cidade').textContent = 'Goiânia-GO';
  d.getElementById('entradaVal').value = '658,80';
  w.eval(`
    (function(){
      var tb=document.getElementById('prodLinhas'); tb.innerHTML='';
      criarLinha('GOLA O MANGA CURTA','489,00','12');
      criarLinha('GOLA POLO MANGA CURTA','59,00','12');
    })();
  `);
  w.eval("adicionarPagina();");            /* página 2 = espelho da folha 1 */
  await espera(400);
  w.eval('abrirReciboDaFicha();');
  return { w, d, payload: enviados[0] || null };
}

/* ── o módulo Recibo ── */
async function abrirRecibo() {
  const html = fs.readFileSync(path.join(BASE, 'criador_recibo', 'index.html'), 'utf-8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_recibo/index.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {} });
      w.print = () => {}; w.confirm = () => true; w.alert = () => {};
      w.addEventListener('error', e => console.log('ERRO RECIBO:', e.message));
    }
  });
  await espera(600);
  return dom.window;
}

(async () => {
  console.log('\n── 1. A Ficha Técnica manda a ficha pelo botão “Gerar recibo” ──');
  const { w, d, payload } = await abrirFicha();
  ok('o botão manda a ficha para o shell', !!payload && payload.type === 'vooalto-abrir-recibo');
  ok('a página 2 é mesmo o espelho da folha 1 (produção igual)',
    w.eval("JSON.stringify([...document.querySelectorAll('#prodLinhas tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value)))") ===
    w.eval("JSON.stringify([...document.querySelectorAll('#prodLinhas_p2 tr')].map(tr=>[...tr.querySelectorAll('input')].map(i=>i.value)))"));
  ok('a mensagem leva a folha 1 e a página extra', !!payload && payload.ficha._prod.length === 2 && payload.ficha._paginas.length === 1,
    payload && { prod: payload.ficha._prod.length, paginas: payload.ficha._paginas.length });

  console.log('\n── 2. O Recibo não soma a mesma produção duas vezes ──');
  const rw = await abrirRecibo();
  const R = rw.ReciboInterno;
  R.aplicarFicha(payload.ficha, payload.meta || null);
  const e = R.estadoAtual();
  ok('os itens são os 2 da folha 1 (a página 2 não duplica)', e.itens.length === 2, e.itens);
  ok('o total é a soma qtd × unitário (489×12 + 59×12 = 6.576)', e.totalProducao === 6576, e.totalProducao);
  ok('a entrada da ficha continua no recibo', e.entradaFicha === 658.8, e.entradaFicha);
  ok('o cliente e o nº da ficha vêm certaininho', e.cliente.nome === 'Sanducheria Sandubas' && e.fichaNum === '3418',
    { nome: e.cliente.nome, num: e.fichaNum });
  ok('o valor sugerido é a entrada (parcial), não o total dobrado',
    e.modo === 'parcial' && e.valorPago === 658.8, { modo: e.modo, pago: e.valorPago });
  ok('a folha do recibo se identifica como RECIBO',
    /Recibo/i.test(rw.document.getElementById('pvNumeroRotulo').textContent),
    rw.document.getElementById('pvNumeroRotulo').textContent);
  ok('a folha mostra o nº da ficha anexada (o nº interno do recibo não sai na folha)',
    rw.document.getElementById('pvNumero').textContent === '3418' &&
    /Ficha/i.test(rw.document.getElementById('pvNumeroRotulo').textContent),
    { numero: rw.document.getElementById('pvNumero').textContent, rotulo: rw.document.getElementById('pvNumeroRotulo').textContent });

  console.log('\n── 3. A mesma regra vale para o .json importado ──');
  const json = JSON.parse(JSON.stringify(payload.ficha));
  R.aplicarFicha(json, { id: 'imp_1', name: 'Ficha importada' });
  const e2 = R.estadoAtual();
  ok('o .json com a página espelhada também não duplica os itens', e2.itens.length === 2 && e2.totalProducao === 6576,
    { itens: e2.itens.length, total: e2.totalProducao });

  console.log('\n── 4. Produção de verdade numa página extra ainda entra ──');
  const outra = {
    _version: 'vooalto_ficha_v7', _numFicha: '3500', dc_nome: 'Cliente Dois',
    _prod: [{ modelo: 'Camiseta', valor: '50,00', qtd: '2' }],
    _paginas: [
      { id: 'p2', prod: [{ modelo: 'Camiseta', valor: '50,00', qtd: '2' }] },        /* espelho */
      { id: 'p3', tipo: 'branca', prod: [] },                                        /* em branco */
      { id: 'p4', prod: [{ modelo: 'Jaqueta', valor: '200,00', qtd: '1' }] }        /* produção própria */
    ]
  };
  R.aplicarFicha(outra, { id: 'imp_2', name: 'Outra ficha' });
  const e3 = R.estadoAtual();
  ok('o espelho some, a página em branco some e a produção própria fica',
    e3.itens.length === 2 && e3.itens[1].modelo === 'Jaqueta', e3.itens);
  ok('o total soma só o que entrou (100 + 200 = 300)', e3.totalProducao === 300, e3.totalProducao);

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s)' : '✓ tudo OK') + ' — ' + pass + ' verificações');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
