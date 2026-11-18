'use strict';
/* ══ V10.7.3 — A página nova nasce LIMPA: sem cor, sem tipo de tecido e
   sem a imagem (arte) da página anterior.

   O pedido: *"quando clica pra criar uma nova pagina ele não pode copiar a
   cor, o tipo de tecido e nem a imagem anterior. garanta pra mim que isso
   não ocorra de novo"*.

   O que este arquivo trava:
   1. a página criada não nasce com a paleta da folha 1;
   2. nem com o tipo de tecido (é o da peça, não da ficha);
   3. nem com a arte/imagem que estava na página anterior;
   4. e o espelho contínuo da folha 1 NÃO devolve cor nem tipo de tecido
      depois (era ele que trazia a cor de volta 150 ms depois de criada);
   5. a paleta e o tipo de tecido são de cada página: apagados, guardados no
      .json e devolvidos pelo desfazer;
   6. o resto da ficha continua espelhado (nº, data, previsão, separador,
      títulos, aviso, medidas, produção) e o ⧉ (duplicar) continua copiando
      tudo — ele é a cópia de propósito. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 110) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 110) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  const html = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const erros = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      /* jsdom não carrega imagem: o `new Image()` das camadas nunca dispara o
         onload e a arte não entra na página. O stub abaixo finge o download. */
      w.Image = class {
        constructor() { this.naturalWidth = 100; this.naturalHeight = 100; this.complete = true; this.width = 100; this.height = 100; }
        set src(v) { this._src = v; setTimeout(() => { if (typeof this.onload === 'function') this.onload({ target: this }); }, 0); }
        get src() { return this._src; }
      };
      w.addEventListener('error', e => erros.push(e.message));
    }
  });
  const w = dom.window, d = w.document;
  await wait(1800);
  const $ = id => d.getElementById(id);
  const coresDe = pid => d.querySelectorAll(`#coresList_${pid} [id^="ci_"]`).length;
  const coresP1 = () => d.querySelectorAll('#coresList [id^="ci_"]').length;
  const imgNaPagina = pid => d.querySelectorAll(`#canvasInner_${pid} img`).length;

  /* ── 1. folha 1 montada: cor, tipo de tecido e arte ── */
  console.log('\n── 1. Folha 1 com cor, tipo de tecido e imagem ──');
  $('fichaNum').value = '1234';
  $('previsao').value = '45 dias';
  $('dc_nome').textContent = 'CLIENTE TESTE LTDA';
  $('tipoTecido').textContent = 'PIQUET PA';
  w.eval("document.getElementById('coresList').innerHTML=''; adicionarCor('#FF0000','VERMELHO'); adicionarCor('#00AA55','VERDE');");
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  w.eval(`addImgLayer(${JSON.stringify(px)},{xp:0.1,yp:0.1,wp:0.3,hp:0.3},'estampa.png')`);
  await wait(300);
  ok('folha 1 com 2 cores', coresP1() === 2, coresP1());
  ok('folha 1 com o tipo de tecido', $('tipoTecido').textContent === 'PIQUET PA');
  ok('folha 1 com a arte (imagem)', d.querySelectorAll('#canvasInner img').length >= 1, d.querySelectorAll('#canvasInner img').length);

  /* ── 2. a página nova nasce limpa ── */
  console.log('\n── 2. Página nova: sem cor, sem tipo de tecido, sem imagem ──');
  w.eval('adicionarPagina()');
  await wait(500);
  const p2 = w.eval('paginas[paginas.length-1].id');
  ok('a página 2 existe', !!$('folha_' + p2), p2);
  ok('NÃO copiou a paleta de cores', coresDe(p2) === 0, coresDe(p2));
  ok('NÃO copiou o tipo de tecido', ($('tipoTecido_' + p2) || {}).textContent === '', ($('tipoTecido_' + p2) || {}).textContent);
  ok('NÃO copiou a imagem/arte', imgNaPagina(p2) === 0, imgNaPagina(p2));
  ok('nenhuma camada herdada', w.eval(`paginas.filter(p=>p.id==='${p2}')[0].layers.length`) === 0);
  ok('o espaço da arte mostra o convite para inserir imagem',
    ($('canvasPh_' + p2) || {}).style.display !== 'none', ($('canvasPh_' + p2) || {}).style.display);

  /* o resto da ficha continua espelhado (nada se perdeu) */
  ok('o nº da ficha continua espelhado', $('fichaNum_' + p2) && $('fichaNum_' + p2).value === '1234');
  ok('a previsão continua espelhada', $('previsao_' + p2) && $('previsao_' + p2).value === '45 dias');
  ok('os dados do cliente continuam espelhados', $('syn_nome_' + p2) && $('syn_nome_' + p2).textContent === 'CLIENTE TESTE LTDA');
  ok('as medidas continuam espelhadas',
    [...d.querySelectorAll(`#folha_${p2} .med-bloco.fem .med-inp`)].map(e => e.value).join(',') ===
    [...d.querySelectorAll('#folha1 .med-bloco.fem .med-inp')].map(e => e.value).join(','));

  /* ── 3. o espelho da folha 1 NÃO devolve cor nem tipo de tecido ── */
  console.log('\n── 3. Mudar a folha 1 não ressuscita a cor na página nova ──');
  $('tipoTecido').textContent = 'MALHA PV';
  $('tipoTecido').dispatchEvent(new w.Event('input', { bubbles: true }));
  w.eval("adicionarCor('#0000FF','AZUL')");
  await wait(700);
  ok('a folha 1 ficou com 3 cores', coresP1() === 3, coresP1());
  ok('a página 2 continua sem cor', coresDe(p2) === 0, coresDe(p2));
  ok('a página 2 continua sem tipo de tecido', ($('tipoTecido_' + p2) || {}).textContent === '', ($('tipoTecido_' + p2) || {}).textContent);

  /* ── 4. a paleta é da página: dá para usar e apagar na página 2 ── */
  console.log('\n── 4. A paleta é de cada página ──');
  w.eval(`adicionarCorExtra('${p2}','#111111','PRETO')`);
  await wait(250);
  ok('a cor adicionada na página 2 fica na página 2', coresDe(p2) === 1, coresDe(p2));
  ok('a folha 1 continua com as 3 cores dela', coresP1() === 3, coresP1());
  const idCor = w.eval(`(document.querySelector('#coresList_${p2} [id^="ci_"]')||{}).id||''`);
  ok('existe o botão de apagar na página 2', !!idCor, idCor);
  w.eval(`excluirCorExtra('${idCor.replace('ci_', '')}')`);
  await wait(250);
  ok('apagar a cor na página 2 apaga só ali', coresDe(p2) === 0, coresDe(p2));
  ok('a folha 1 NÃO perdeu cor', coresP1() === 3, coresP1());

  /* ── 5. duplicar continua copiando tudo (é a cópia de propósito) ── */
  console.log('\n── 5. Duplicar (⧉) continua copiando cor, tecido e arte ──');
  w.eval(`adicionarCorExtra('${p2}','#222222','CINZA')`);
  $('tipoTecido_' + p2).textContent = 'MEIA MALHA';
  w.eval(`addImgLayerExtra(paginas.filter(p=>p.id==='${p2}')[0],${JSON.stringify(px)},{xp:0.2,yp:0.2,wp:0.3,hp:0.3})`);
  await wait(400);
  w.eval(`v7DuplicarPagina('${p2}')`);
  await wait(600);
  const dup = w.eval('paginas[paginas.length-1].id');
  ok('a duplicada existe', !!$('folha_' + dup), dup);
  ok('a duplicada copiou a cor', coresDe(dup) === 1, coresDe(dup));
  ok('a duplicada copiou o tipo de tecido', ($('tipoTecido_' + dup) || {}).textContent === 'MEIA MALHA', ($('tipoTecido_' + dup) || {}).textContent);
  ok('a duplicada copiou a arte', imgNaPagina(dup) >= 1, imgNaPagina(dup));
  ok('a página de origem não perdeu a cor', coresDe(p2) === 1, coresDe(p2));

  /* ── 6. a cor da página sobrevive ao .json ── */
  console.log('\n── 6. A cor da página entra no .json e volta ──');
  const dump = w.eval('JSON.parse(JSON.stringify(capturarFichaParaJSON()))');
  const pgJson = (dump._paginas || []).find(x => x.id === p2);
  ok('o .json guarda a paleta da página', !!pgJson && Array.isArray(pgJson.cores) && pgJson.cores.length === 1,
    pgJson && pgJson.cores);
  ok('o .json guarda o tipo de tecido da página', !!pgJson && pgJson.hdr && pgJson.hdr.tipoTecido === 'MEIA MALHA',
    pgJson && pgJson.hdr && pgJson.hdr.tipoTecido);
  w.eval(`restaurarDeJSON(${JSON.stringify(dump)})`);
  await wait(700);
  const p2b = w.eval('paginas.filter(p=>p.tipo!=="branca")[0].id');
  ok('ao reabrir, a página volta com a cor', coresDe(p2b) === 1, coresDe(p2b));
  ok('ao reabrir, a página volta com o tipo de tecido', ($('tipoTecido_' + p2b) || {}).textContent === 'MEIA MALHA', ($('tipoTecido_' + p2b) || {}).textContent);

  /* ── 7. o desfazer devolve a cor da página ── */
  console.log('\n── 7. Desfazer/refazer não perde a cor da página ──');
  const estado = w.eval('JSON.parse(JSON.stringify(capState()))');
  const det = (estado._paginasDetalhe || []).find(x => x.id === p2b);
  ok('o estado do desfazer guarda a paleta da página', !!det && Array.isArray(det.cores) && det.cores.length === 1, det && det.cores);
  w.eval(`excluirCorExtra('${(w.eval(`(document.querySelector('#coresList_${p2b} [id^="ci_"]')||{}).id||'ci_x'`)).replace('ci_', '')}')`);
  await wait(250);
  ok('a cor sumiu da página', coresDe(p2b) === 0, coresDe(p2b));
  w.eval(`restState(${JSON.stringify(estado)})`);
  await wait(500);
  ok('o desfazer devolve a cor da página', coresDe(p2b) === 1, coresDe(p2b));

  ok('nada estourou durante os testes', erros.length === 0, erros.slice(0, 3));

  console.log('\n═══ PÁGINA NOVA LIMPA: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
