'use strict';
/* ══ V9.1.2 — Pente fino: dinheiro, backup honesto, injeção de HTML, tema ══
   Cada bloco aqui existe porque o comportamento antigo era ERRADO e passava
   silenciosamente pela suíte:
     1. "10.50" digitado virava 1050 (ponto tratado como milhar);
     2. restaurar backup dizia "importado" mesmo sem gravar nada;
     3. nome de cor vindo de .json injetava HTML na página;
     4. o <style> anti-flash nunca era removido e prendia o shell no escuro;
     5. mensagem de qualquer origem trocava de aba no shell. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 90) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 90) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const shellHtml = fs.readFileSync(BASE + '/index.html', 'utf-8');
const fichaHtml = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
const orcHtml = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');

/* Extrai uma função `function nome(...) { ... }` do HTML e devolve a função
   para ser exercitada direto — é assim que se testa unidade de arquivo único. */
function extrairFuncao(html, assinatura) {
  const ini = html.indexOf(assinatura);
  if (ini < 0) throw new Error('função não encontrada: ' + assinatura);
  /* fecha na primeira linha que é apenas "}" (todas as funções de topo aqui
     terminam assim) */
  let i = ini, nivel = 0, fim = -1;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) { fim = i + 1; break; } }
  }
  if (fim < 0) throw new Error('função não fechada: ' + assinatura);
  const corpo = html.slice(ini, fim);
  return { fn: new Function(corpo + '; return ' + assinatura.replace('function ', '').split('(')[0] + ';')(), fonte: corpo };
}

function stubs(w, erros) {
  w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.print = () => {};
  w.addEventListener('error', e => erros.push(e.message));
  /* sempre sobrescreve: o jsdom define getContext, mas ele lança
     "Not implemented" e a assinatura do orçamento quebra na inicialização. */
  w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
}

(async function main() {
  /* ══ 1. Dinheiro: um leitor só, e o ponto decimal vale ══ */
  console.log('\n── 1. Leitura de dinheiro (Ficha e Orçamento) ──');
  {
    const { fn: parseBRL } = extrairFuncao(fichaHtml, 'function parseBRL(s){');
    const casos = [
      ['1.234,56', 1234.56], ['1234.56', 1234.56], ['10.50', 10.5], ['0.5', 0.5],
      ['1.234', 1234], ['1.234.567', 1234567], ['10,5', 10.5], ['R$ 89,90', 89.9],
      ['1,234.56', 1234.56], ['0', 0], ['', 0], ['  12  ', 12], ['abc', 0], [null, 0], [5.5, 5.5]
    ];
    let ruins = [];
    casos.forEach(([entrada, esperado]) => { if (parseBRL(entrada) !== esperado) ruins.push([entrada, parseBRL(entrada), esperado]); });
    ok('ficha: parseBRL aceita ponto decimal, milhar e lixo', ruins.length === 0, ruins);
    ok('ficha: "10.50" não vira 1050 (o bug de 100×)', parseBRL('10.50') === 10.5, parseBRL('10.50'));
    ok('ficha: nunca devolve NaN', casos.every(([e]) => Number.isFinite(parseBRL(e))));

    /* o orçamento tem o mesmo leitor, com outro nome (arquivo separado) */
    const { fn: orcParseMoney, fonte } = extrairFuncao(orcHtml, 'function orcParseMoney(valor) {');
    let ruinsOrc = [];
    casos.forEach(([entrada, esperado]) => { if (orcParseMoney(entrada) !== esperado) ruinsOrc.push([entrada, orcParseMoney(entrada), esperado]); });
    ok('orçamento: orcParseMoney responde igual ao parseBRL da ficha', ruinsOrc.length === 0, ruinsOrc);
    ok('orçamento: a célula da folha A4 usa orcParseMoney (não apaga mais o ponto)',
      /syncCell[\s\S]{0,700}pageState\.tableItems\[itemIdx\]\.unit = orcParseMoney\(rawText\)/.test(orcHtml) &&
      !/unit = parseFloat\(clean\)/.test(orcHtml));
    ok('orçamento: total da linha sai com 2 casas (1234,57 e não 1.234,568)',
      /toLocaleString\('pt-BR',\{minimumFractionDigits:2,maximumFractionDigits:2\}\)/.test(orcHtml));
    ok('orçamento: leitor de dinheiro tem regra de milhar documentada', fonte.includes('temVirgula') && fonte.includes('temPonto'));
  }

  /* A prova de verdade: editar a célula da folha A4, como o usuário faz. */
  console.log('\n── 1b. Edição na folha A4 do orçamento (jsdom) ──');
  {
    const erros = [];
    const dom = new JSDOM(orcHtml, {
      url: 'http://localhost:4800/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { stubs(w, erros); }
    });
    const w = dom.window;
    await wait(1800);
    const lidos = w.eval(`(function(){
      if(!documentPages[0].tableItems) documentPages[0].tableItems=[];
      documentPages[0].tableItems[0]={modelo:'Camiseta',qnt:1,unit:0};
      const el=document.createElement('div');
      const ler=function(v){el.innerText=v;syncCell(0,0,'unit',el);return documentPages[0].tableItems[0].unit;};
      return [ler('10.50'), ler('1.234,56'), ler('1234.56'), ler('10,5'), ler('abc')];
    })()`);
    ok('célula A4: "10.50" vale 10,5 (era 1050 — venda 100× mais cara)', lidos[0] === 10.5, lidos[0]);
    ok('célula A4: "1.234,56" vale 1234,56', lidos[1] === 1234.56, lidos[1]);
    ok('célula A4: "1234.56" vale 1234,56 (valor colado de planilha)', lidos[2] === 1234.56, lidos[2]);
    ok('célula A4: "10,5" vale 10,5', lidos[3] === 10.5, lidos[3]);
    ok('célula A4: texto inválido vale 0 (nunca NaN)', lidos[4] === 0, lidos[4]);
    ok('orçamento carrega sem erro de página depois das mudanças', erros.length === 0, erros);
    dom.window.close();
  }

  /* ══ 2. Nome de cor não injeta HTML ══ */
  console.log('\n── 2. Nome de cor vindo de .json não injeta HTML ──');
  {
    const erros = [];
    const dom = new JSDOM(fichaHtml, {
      url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { stubs(w, erros); }
    });
    const w = dom.window;
    await wait(1200);
    const ataque = 'AZUL"><img src=x onerror="window.__pwned=1">';
    w.eval('adicionarCor("' + '#ff0000' + '",' + JSON.stringify(ataque) + ')');
    const lista = w.document.getElementById('coresList');
    ok('nome malicioso NÃO cria elemento (era execução de script)', !lista.querySelector('img'));
    ok('nome malicioso não executou nada', w.__pwned !== 1);
    const nomes = [...lista.querySelectorAll('.cor-nome-disp')].map(e => e.textContent);
    /* o chip mostra o nome em maiúsculas; o que importa é ser texto, não HTML */
    ok('nome aparece como TEXTO literal', /<IMG SRC=X/i.test(nomes[nomes.length - 1]), nomes[nomes.length - 1].slice(0, 40));
    const valores = [...lista.querySelectorAll('input.cor-inp.nome')].map(e => e.value);
    ok('valor do campo preserva o texto original', valores[valores.length - 1] === ataque);

    w.eval('adicionarCor("javascript:alert(1)","X")');
    const ultimoFundo = [...w.document.querySelectorAll('#coresList .cor-rect')].pop();
    ok('hex inválido cai no azul padrão (não vira style arbitrário)',
      ultimoFundo && /rgb\(59, 130, 246\)|#3b82f6/i.test(ultimoFundo.getAttribute('style') || ''));
    ok('ficha carrega sem erro de página depois das mudanças', erros.length === 0, erros);
    dom.window.close();
  }

  /* ══ 3. Backup honesto ══ */
  console.log('\n── 3. Restauração honesta (não diz "ok" sem gravar) ──');
  {
    /* IndexedDB que não abre: é o caso de navegador bloqueado/quota zero. */
    const erros = [];
    const dom = new JSDOM(shellHtml, {
      url: 'http://localhost:4800/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) {
        stubs(w, erros);
        Object.defineProperty(w, 'indexedDB', { configurable: true, value: { open() { throw new Error('banco bloqueado'); } } });
      }
    });
    const w = dom.window;
    await wait(900);
    const backup = {
      _version: 'vooalto_backup_v9',
      fichas: [{ id: 'a1', name: 'Ficha A', date: '01/01/2026', num: '1', data: { _version: 'vooalto_ficha_v7', dc_nome: 'A' } }],
      rascunhosFicha: {}, orcamento: {}, clientes: {}, storage: {}
    };
    const res = await w.VooaltoBackup.restaurar(backup, 'mesclar');
    ok('restaurar devolve ok:false quando o banco não abre', res && res.ok === false, res && res.error);
    ok('restaurar explica o motivo', !!(res && typeof res.error === 'string' && res.error.length > 10), res && res.error);
    ok('índice da lista NÃO é gravado (a lista não mostra ficha fantasma)',
      w.localStorage.getItem('vooalto_ficha_rascunhos_v4_meta') === null,
      w.localStorage.getItem('vooalto_ficha_rascunhos_v4_meta'));
    ok('dado (com fotos) NÃO cai no localStorage (PLANO §10)',
      w.localStorage.getItem('vooalto_ficha_rascunhos_v4') === null);
    ok('nenhum resumo de sucesso é devolvido', !res || !res.resumo);

    /* exportar: o selo "último backup" só pode ser gravado se o arquivo sair */
    w.URL.createObjectURL = () => { throw new Error('sem blob'); };
    let estourou = false;
    try { await w.VooaltoBackup.exportarTudo(); } catch (e) { estourou = true; }
    ok('exportarTudo propaga a falha de geração do arquivo', estourou);
    ok('falha ao exportar NÃO marca "último backup"',
      w.localStorage.getItem('vooalto_ultimo_backup_v8') === null,
      w.localStorage.getItem('vooalto_ultimo_backup_v8'));
    dom.window.close();
  }

  /* ══ 4. Tema: o estilo anti-flash precisa sair de cena ══ */
  console.log('\n── 4. Tema claro não fica preso no escuro ──');
  {
    const erros = [];
    const dom = new JSDOM(shellHtml, {
      url: 'http://localhost:4800/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { w.localStorage.setItem('vooalto_tema', 'claro'); stubs(w, erros); }
    });
    const w = dom.window, d = w.document;
    await wait(900);
    ok('abre no claro quando o tema salvo é claro', !d.documentElement.getAttribute('data-theme'),
      d.documentElement.getAttribute('data-theme'));
    ok('variável do shell já nasce clara', w.getComputedStyle(d.documentElement).getPropertyValue('--shell-bg') === '#eef0ff');
    ok('o <style> de boot é removido (antes ficava para sempre com !important)',
      !d.getElementById('__theme_boot') &&
      ![...d.querySelectorAll('style')].some(s => s.textContent.includes('#04060a!important')));
    w.eval("applyThemeFromShell('escuro')");
    await wait(60);
    ok('trocar para escuro funciona depois disso', d.documentElement.getAttribute('data-theme') === 'escuro' &&
      w.getComputedStyle(d.documentElement).getPropertyValue('--shell-bg') === '#04060a');
    w.eval("applyThemeFromShell('claro')");
    await wait(60);
    ok('e voltar para o claro também', !d.documentElement.getAttribute('data-theme'));
    dom.window.close();
  }

  /* ══ 5. Mensagem de origem estranha não manda no shell ══ */
  console.log('\n── 5. postMessage só da própria origem ──');
  {
    const erros = [];
    const dom = new JSDOM(shellHtml, {
      url: 'http://localhost:4800/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) { stubs(w, erros); }
    });
    const w = dom.window, d = w.document;
    await wait(900);
    const ficha = d.getElementById('frame-ficha'), orc = d.getElementById('frame-orcamento');
    ok('começa na ficha', ficha.classList.contains('active'));

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'vooalto-switch-tab', tab: 'orcamento' }, origin: 'http://malicioso.example' }));
    await wait(60);
    ok('origem externa NÃO troca de aba', ficha.classList.contains('active') && !orc.classList.contains('active'));
    ok('origem externa NÃO troca o tema', d.documentElement.getAttribute('data-theme') === 'escuro');

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'vooalto-switch-tab', tab: 'orcamento' }, origin: 'http://localhost:4800' }));
    await wait(60);
    ok('mesma origem troca de aba normalmente', orc.classList.contains('active'));

    ok('nenhum envio do shell usa targetOrigin "*"',
      !/postMessage\([^)]*,\s*'\*'\s*\)/.test(shellHtml));
    ok('shell carrega sem erro de página', erros.length === 0, erros);
    dom.window.close();
  }

  /* ══ 6. Teto de fichas deixa de ser silencioso ══ */
  console.log('\n── 6. Limite de fichas na lista avisa ──');
  {
    ok('teto subiu de 200 para 1000', /const MAX=1000;/.test(fichaHtml) && !/const MAX=200;/.test(fichaHtml));
    ok('corte do índice avisa o usuário em vez de sumir em silêncio',
      /const lista=Array\.isArray\(v\)\?v:\[\];[\s\S]{0,400}toastSafe\('⚠ Limite de '/.test(fichaHtml));
  }

  console.log('\n═══ MELHORIAS V9.1.2: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
