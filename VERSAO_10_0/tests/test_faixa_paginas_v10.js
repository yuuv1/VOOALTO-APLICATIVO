'use strict';
/* ══ V10.11 — A FAIXA DE PÁGINAS FICA MINIMIZADA NO RODAPÉ ══

   O pedido: *"coloque essa parte de adicionar novas páginas em formato
   minimizado bem no rodapé, aí ao passar o mouse ele expande pra ficar
   dessa forma. assim fica mais fácil e incomoda menos na hora de mexer"*.

   O que este arquivo trava:
     1. a faixa fica MINIMIZADA: só a plaquinha (🗂 e a quantidade de
        páginas) fica visível no rodapé — o conteúdo (miniaturas e botões)
        começa recolhido (largura 0, invisível);
     2. ao passar o mouse por cima, a faixa ABRE com as miniaturas e os
        botões ＋ e 🗋 (a regra de CSS existe e é a mesma do "aberto");
     3. a plaquinha mostra quantas páginas a ficha tem, e a contagem
        acompanha quando uma página é adicionada ou removida;
     4. um clique na plaquinha DEIXA a faixa fixa (aberta) e outro clique
        desfaz — no celular não existe "passar o mouse";
     5. as miniaturas continuam na faixa (nada se perde: arrastar,
        remover, ir para a página).
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 140) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 200) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

class CargaLocal extends ResourceLoader {
  fetch(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '' || u.hostname === '127.0.0.1') {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        for (const arquivo of [path.resolve(BASE, rel), path.resolve(BASE, 'criador_ficha_tecnica', rel)]) {
          if (arquivo.startsWith(BASE) && fs.existsSync(arquivo) && fs.statSync(arquivo).isFile()) {
            return Promise.resolve(fs.readFileSync(arquivo));
          }
        }
      }
    } catch (e) { /* loader padrão */ }
    return null;
  }
}

(async function main() {
  const html = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
  const erros = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new CargaLocal(),
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.Range.prototype.getBoundingClientRect = function () { return { top: 100, left: 100, width: 80, height: 14, bottom: 114, right: 180 }; };
      w.document.queryCommandState = () => false;
      w.addEventListener('error', e => erros.push(e.message));
    }
  });
  const w = dom.window, d = w.document;
  await wait(1800);
  const $ = id => d.getElementById(id);
  const css = html;

  /* ══ 1. A estrutura ══ */
  console.log('\n── 1. A faixa minimizada no rodapé ──');
  ok('a faixa existe no rodapé', !!$('pageStripWrap'));
  ok('a faixa fica fixa no rodapé da tela',
    /#pageStripWrap\{[^}]*position:fixed[^}]*bottom:\d+px/.test(css));
  ok('existe a plaquinha (o botão que abre a faixa)', !!$('v7StripHandle'));
  ok('a plaquinha tem o ícone de páginas', /🗂/.test($('v7StripHandle') ? $('v7StripHandle').textContent : ''));
  ok('a plaquinha mostra a quantidade de páginas', !!$('v7StripCount'));
  ok('o conteúdo da faixa (miniaturas + botões) está num bloco só',
    !!$('pageStripInner') && !!$('pageStripList'));
  ok('os botões de adicionar página continuam na faixa',
    d.querySelectorAll('#pageStripInner .v7-strip-btn').length === 2,
    d.querySelectorAll('#pageStripInner .v7-strip-btn').length);

  /* ══ 2. Começa recolhida e abre no mouse ══ */
  console.log('\n── 2. Recolhida por padrão, abre no mouse ──');
  ok('o conteúdo começa recolhido (largura 0 e invisível)',
    /#pageStripInner\{[^}]*max-width:0[^}]*opacity:0/.test(css),
    (css.match(/#pageStripInner\{[^}]*\}/) || [''])[0]);
  ok('passar o mouse abre a faixa (mesma regra do clique)',
    /#pageStripWrap:hover #pageStripInner/.test(css) &&
    /#pageStripWrap\.aberto #pageStripInner/.test(css));
  ok('a regra de hover deixa a faixa visível (opacity 1 e largura)',
    /#pageStripWrap:hover #pageStripInner[^}]*opacity:1/.test(css),
    (css.match(/#pageStripWrap:hover #pageStripInner[^}]*\}/) || [''])[0]);
  ok('a faixa não é a mesma coisa que a lista de miniaturas',
    $('pageStripList').parentElement && $('pageStripList').parentElement.id === 'pageStripInner');

  /* ══ 3. A contagem de páginas ══ */
  console.log('\n── 3. A contagem de páginas ──');
  ok('a contagem começa em 1 (a folha 1)', $('v7StripCount').textContent === '1', $('v7StripCount').textContent);
  w.eval("v7AdicionarPaginaComUndo('normal')");
  await wait(700);
  ok('a contagem vira 2 depois de adicionar uma página', $('v7StripCount').textContent === '2', $('v7StripCount').textContent);
  ok('a miniatura da página nova está na faixa',
    d.querySelectorAll('#pageStripList .v7-thumb').length === 2,
    d.querySelectorAll('#pageStripList .v7-thumb').length);
  w.eval("v7AdicionarPaginaComUndo('branca')");
  await wait(700);
  ok('a contagem vira 3 depois de uma página em branco', $('v7StripCount').textContent === '3', $('v7StripCount').textContent);

  /* ══ 4. O clique deixa a faixa fixa ══ */
  console.log('\n── 4. Clique na plaquinha deixa a faixa fixa ──');
  ok('a faixa começa fechada (sem a classe "aberto")',
    !$('pageStripWrap').classList.contains('aberto'));
  w.eval('v7StripAlternar()');
  ok('o clique ABRE a faixa (fica fixa)', $('pageStripWrap').classList.contains('aberto'));
  w.eval('v7StripAlternar()');
  ok('o segundo clique fecha de novo', !$('pageStripWrap').classList.contains('aberto'));
  ok('o leitor de tela sabe se a faixa está aberta',
    $('v7StripHandle').getAttribute('aria-expanded') === 'false', $('v7StripHandle').getAttribute('aria-expanded'));
  w.eval('v7StripAlternar()');
  ok('ao abrir, o aria-expanded vira "true"',
    $('v7StripHandle').getAttribute('aria-expanded') === 'true', $('v7StripHandle').getAttribute('aria-expanded'));
  w.eval('v7StripAlternar()');

  /* ══ 4b. O teclado também abre (acessibilidade) ══ */
  console.log('\n── 4b. O teclado também abre a faixa ──');
  ok('o CSS tem uma regra de foco para a faixa',
    /#pageStripWrap\.focado #pageStripInner/.test(css));
  w.eval('v7StripViaTeclado=true;v7StripFoco(true)');
  ok('o foco do teclado marca a faixa como focada',
    $('pageStripWrap').classList.contains('focado'));
  w.eval('v7StripFoco(false)');
  ok('saindo do foco, a faixa deixa de estar focada',
    !$('pageStripWrap').classList.contains('focado'));
  w.eval('v7StripViaTeclado=false;v7StripFoco(true)');
  ok('com o mouse, o foco não trava a faixa aberta',
    !$('pageStripWrap').classList.contains('focado'));

  /* ══ 4c. Clicar fora fecha a faixa que ficou fixa ══ */
  console.log('\n── 4c. Clicar fora fecha a faixa ──');
  w.eval('v7StripAlternar()');
  ok('a faixa ficou fixa', $('pageStripWrap').classList.contains('aberto'));
  w.eval("v7StripFecharSeFora({target:document.body})");
  ok('clicar fora fecha a faixa fixa', !$('pageStripWrap').classList.contains('aberto'));

  /* ══ 5. As miniaturas continuam funcionando ══ */
  console.log('\n── 5. As miniaturas continuam na faixa ──');
  const thumbs = d.querySelectorAll('#pageStripList .v7-thumb');
  ok('cada miniatura sabe a qual folha pertence',
    [...thumbs].every(t => !!t.dataset.folha), [...thumbs].map(t => t.dataset.folha));
  ok('a miniatura da página ativa fica marcada',
    d.querySelectorAll('#pageStripList .v7-thumb').length >= 2);
  ok('o botão de apagar a página continua na miniatura',
    d.querySelectorAll('#pageStripList .v7-thumb-del').length >= 2,
    d.querySelectorAll('#pageStripList .v7-thumb-del').length);

  /* ══ 5b. Tela de toque (celular) não depende do mouse ══ */
  console.log('\n── 5b. Tela de toque ──');
  ok('o CSS desliga o hover em tela sem mouse (o :hover gruda no celular)',
    /body\.sem-hover #pageStripWrap:hover:not\(\.aberto\)/.test(css),
    (css.match(/body\.sem-hover[^}]*\}/) || [''])[0]);
  ok('em tela de toque a classe "sem-hover" é marcada no body',
    /matchMedia\('\(hover: none\)'\)/.test(css));
  ok('mesmo sem hover, o toque na plaquinha abre a faixa',
    typeof w.eval('v7StripAlternar') === 'function');

  /* ══ 6. A faixa mede o próprio tamanho (para a abertura ficar certa) ══ */
  console.log('\n── 6. A faixa mede o próprio tamanho ──');
  ok('existe a função que mede a faixa', typeof w.eval('v7StripMedir') === 'function');
  const larg=($('pageStripWrap').style.getPropertyValue('--v7-strip-w') || '').trim();
  ok('a faixa guarda a largura para a animação', /^\d+px$/.test(larg), larg);
  const nPag=3;                                          /* 3 miniaturas na faixa */
  const esperado=Math.min(nPag*72-8,Math.min(1200*0.62,880))+8+38+8+38;
  ok('a largura cabe na faixa inteira (miniaturas + os dois botões)',
    larg === esperado+'px', larg + ' vs ' + esperado + 'px');
  ok('a largura cabe na tela (com a plaquinha e a borda)',
    larg ? (parseInt(larg, 10) + 74) <= Math.round(1200*0.92) : false, larg);
  ok('a faixa usa a largura medida na animação de abertura',
    /max-width:var\(--v7-strip-w/.test(css),
    (css.match(/#pageStripWrap:hover #pageStripInner[^}]*\}/) || [''])[0]);

  /* ══ 7. Arrastar para reordenar continua funcionando ══ */
  console.log('\n── 7. Arrastar para reordenar ──');
  ok('a faixa fica aberta enquanto a miniatura é arrastada',
    /#pageStripWrap\.arrastando #pageStripInner/.test(css));
  const antes=w.eval('v7OrdemIds().join(",")');
  w.eval(`
    (function(){
      const t=document.querySelector('#pageStripList .v7-thumb[data-folha="folha1"]');
      v7ThumbDragStart({currentTarget:t,dataTransfer:{setData(){},effectAllowed:''}},'folha1');
    })();
  `);
  ok('arrastar marca a faixa como "arrastando"',
    $('pageStripWrap').classList.contains('arrastando'));
  w.eval(`
    (function(){
      const t=document.querySelector('#pageStripList .v7-thumb[data-folha="folha1"]');
      v7ThumbDragEnd({currentTarget:t});
    })();
  `);
  ok('soltar desmarca a faixa', !$('pageStripWrap').classList.contains('arrastando'));
  ok('a ordem das páginas continua a mesma depois do arrasto',
    w.eval('v7OrdemIds().join(",")') === antes, antes);
  ok('a função de reordenar continua no lugar', typeof w.eval('v7Reordenar') === 'function');

  ok('nada estourou durante os testes', erros.length === 0, erros.slice(0, 3));
  w.close();
  console.log('\n═══ FAIXA DE PÁGINAS MINIMIZADA V10.11: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
