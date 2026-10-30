'use strict';
/* V8 — "Minhas fichas": a lista única que substituiu Rascunhos + Recentes.

   Na V7 havia duas listas na barra lateral da Ficha Técnica:
     • "Rascunhos"  — guardava os dados no IndexedDB e abria de novo;
     • "Recentes"   — guardava só o nome no localStorage e NÃO abria nada
                      (clicar num item não fazia efeito: bug).
   A V8 unifica as duas. Estes testes rodam contra um IndexedDB de mentira
   (tests/_fake_idb.js) e provam que:
     - os rascunhos da V4–V7 continuam aparecendo (nada é migrado nem copiado);
     - salvar grava dados + índice, e salvar de novo ATUALIZA a mesma ficha;
     - abrir, renomear e excluir funcionam de verdade;
     - se o navegador recusar a gravação, a função avisa em vez de fingir. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');
const { criarIDBFalso } = require('./_fake_idb');

const DB = 'vooalto_ficha_rascunhos_db_v4';
const STORE = 'drafts';
const META = 'vooalto_ficha_rascunhos_v4_meta';
const OLD = 'vooalto_ficha_rascunhos_v4';

let fail = 0;
const ok = (label, v, extra) => {
  console.log(v ? '  [OK]' : '  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0,90) : '');
  if (!v) fail++;
};

(async () => {
  console.log('===== V8 · MINHAS FICHAS =====');

  /* ── 1. rascunho antigo (V4–V7) precisa continuar aparecendo ── */
  {
    const rascunhoAntigo = { _version: 1, _nome: 'Ficha da V6', dc_nome: 'Cliente Antigo', fichaNum: '0042' };
    const { indexedDB, bancos } = criarIDBFalso({
      [DB]: { version: 1, stores: { [STORE]: { 'd_antigo': rascunhoAntigo } } }
    });
    const errs = [];
    const d = new JSDOM(fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8'), {
      url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) {
        w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        w.print = () => {};
        w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
        w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=>(p==='canvas'?this:()=>{}), set:()=>true }); };
        w.indexedDB = indexedDB;
        w.prompt = () => null;
        w.confirm = () => true;
        w.localStorage.setItem(META, JSON.stringify([{ id:'d_antigo', name:'Ficha da V6', date:'01/01/2026 10:00' }]));
        w.addEventListener('error', e => errs.push(e.message));
      }
    });
    const w = d.window;
    await new Promise(r => setTimeout(r, 1800));

    const listaHtml = () => w.document.getElementById('v8FichasList').innerHTML;
    const meta = () => JSON.parse(w.localStorage.getItem(META) || '[]');
    const dados = id => bancos.get(DB).stores.get(STORE).get(id);

    ok('rascunho antigo aparece na lista', listaHtml().includes('Ficha da V6'));
    ok('lista tem botão Abrir', listaHtml().includes("v8AbrirFicha('d_antigo')"));
    ok('os dados continuam no mesmo banco (nada foi copiado)', dados('d_antigo') === rascunhoAntigo);

    /* salvar sem nome (prompt cancelado) não pode criar registro */
    const antes = meta().length;
    await w.eval(`v8SalvarFicha()`);
    ok('cancelar o nome não salva nada', meta().length === antes);

    /* ── 2. salvar a ficha atual ── */
    w.eval(`document.getElementById('dc_nome').textContent='Escola Novo Aluno'; document.getElementById('fichaNum').value='0099';`);
    w.eval(`window.prompt=()=>'Ficha Escola Novo Aluno';`);
    const salvou = await w.eval(`v8SalvarFicha()`);
    ok('salvar devolve true', salvou === true);
    ok('índice ganhou o registro', meta().length === antes + 1 && meta()[0].name === 'Ficha Escola Novo Aluno');
    const idNovo = meta()[0].id;
    ok('dados foram para o IndexedDB', !!dados(idNovo) && dados(idNovo).dc_nome === 'Escola Novo Aluno');
    ok('número da ficha foi junto', dados(idNovo)._numFicha === '0099');
    ok('a lista marca a ficha aberta', listaHtml().includes("v8AbrirFicha('" + idNovo + "')"));

    /* ── 3. salvar de novo ATUALIZA a mesma ficha (não duplica) ── */
    w.eval(`document.getElementById('dc_nome').textContent='Escola Novo Aluno (revisada)';`);
    w.eval(`window.prompt=()=>'Ficha Escola Novo Aluno';`);
    await w.eval(`v8SalvarFicha()`);
    ok('salvar de novo não duplica', meta().length === antes + 1);
    ok('salvar de novo atualiza os dados', dados(idNovo).dc_nome === 'Escola Novo Aluno (revisada)');

    /* ── 4. abrir outra ficha ── */
    w.eval(`document.getElementById('dc_nome').textContent='';`);
    ok('ficha vazia não tem conteúdo', w.eval(`!v8FichaTemConteudo()`) === true);
    await w.eval(`v8AbrirFicha('d_antigo')`);
    ok('abrir restaura o cliente salvo', w.eval(`document.getElementById('dc_nome').textContent`) === 'Cliente Antigo');
    ok('abrir marca a ficha como atual', w.eval(`v8FichaAtualId`) === 'd_antigo');

    /* abrir a mesma ficha de novo não faz nada */
    w.eval(`document.getElementById('dc_nome').textContent='Mudou na tela';`);
    await w.eval(`v8AbrirFicha('d_antigo')`);
    ok('reabrir a ficha já aberta não descarta a edição', w.eval(`document.getElementById('dc_nome').textContent`) === 'Mudou na tela');

    /* ── 5. renomear ── */
    w.eval(`window.prompt=()=>'Ficha Renomeada';`);
    await w.eval(`v8RenomearFicha('d_antigo')`);
    ok('renomear muda o índice', meta().find(m => m.id === 'd_antigo').name === 'Ficha Renomeada');
    ok('renomear muda os dados', dados('d_antigo')._nome === 'Ficha Renomeada');

    /* ── 6. excluir ── */
    await w.eval(`v8ExcluirFicha('d_antigo')`);
    ok('excluir tira do índice', !meta().some(m => m.id === 'd_antigo'));
    ok('excluir apaga os dados', dados('d_antigo') === undefined);
    ok('excluir limpa a marca de ficha atual', w.eval(`v8FichaAtualId`) === null);

    /* ── 7. migração dos rascunhos que ficavam TODOS no localStorage (V4) ── */
    w.localStorage.setItem(OLD, JSON.stringify([
      { id:'d_ls_1', name:'Ficha do localStorage', date:'02/02/2025 09:00', data:{ _nome:'Ficha do localStorage', dc_nome:'Cliente do LS' } }
    ]));
    w.eval(`window.prompt=()=>null;`);
    await w.eval(`v8ListarFichas()`);
    await new Promise(r => setTimeout(r, 200));
    ok('rascunho do localStorage migra para o banco', !!dados('d_ls_1'));
    ok('rascunho migrado aparece na lista', listaHtml().includes('Ficha do localStorage'));
    ok('a chave antiga é removida depois de migrar', w.localStorage.getItem(OLD) === null);

    /* ── 8a. índice (localStorage) cheio: a ficha foi gravada, mas o aviso tem
       que dizer que a lista não atualizou — senão ela some e parece perdida ── */
    const LSProto = Object.getPrototypeOf(w.localStorage);
    const setItemOriginal = LSProto.setItem;
    LSProto.setItem = function () { throw new Error('quota simulada'); };
    w.eval(`document.getElementById('dc_nome').textContent='Cliente Sem Espaço';`);
    w.eval(`window.prompt=()=>'Ficha Sem Espaço';`);
    let resultado, avisos = [];
    /* cada w.eval tem escopo próprio: o toast original fica pendurado em window */
    w.eval(`window.__avisos=[]; window.__toastOriginal=window.toast; window.toast=function(m,k){window.__avisos.push(m); return window.__toastOriginal.apply(this,arguments)};`);
    try { resultado = await w.eval(`v8SalvarFicha()`); } catch (e) { resultado = 'THREW:' + e.message; }
    avisos = w.eval(`window.__avisos`);
    LSProto.setItem = setItemOriginal;
    ok('falha do índice não joga exceção para fora', resultado === true, resultado);
    ok('falha do índice avisa que a lista não atualizou', avisos.some(m => /lista não pôde ser atualizada/.test(m)), avisos);
    w.eval(`window.toast=window.__toastOriginal;`);

    /* ── 8b. banco recusando a gravação: aí a ficha NÃO foi salva e a função
       precisa devolver false (o botão de "Nova ficha" depende disso) ── */
    const storeReal = bancos.get(DB).stores.get(STORE);
    const setReal = storeReal.set.bind(storeReal);
    storeReal.set = () => { throw new Error('quota do banco'); };
    w.eval(`window.__avisos=[]; window.__toastOriginal=window.toast; window.toast=function(m,k){window.__avisos.push(m); return window.__toastOriginal.apply(this,arguments)};`);
    let resultadoBanco;
    try { resultadoBanco = await w.eval(`v8SalvarFicha()`); } catch (e) { resultadoBanco = 'THREW:' + e.message; }
    const avisosBanco = w.eval(`window.__avisos`);
    storeReal.set = setReal;
    w.eval(`window.toast=window.__toastOriginal;`);
    ok('banco cheio devolve false (sem exceção)', resultadoBanco === false, resultadoBanco);
    ok('banco cheio manda exportar backup', avisosBanco.some(m => /Exporte a ficha como backup/.test(m)), avisosBanco);

    ok('sem erro de página', errs.length === 0, errs.slice(0,3));
  }

  console.log(fail ? `\n═══ MINHAS FICHAS: ${fail} FALHA(S) ═══` : '\n═══ MINHAS FICHAS: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
