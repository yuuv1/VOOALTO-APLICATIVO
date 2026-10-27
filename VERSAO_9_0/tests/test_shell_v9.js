'use strict';
/* V8 — Shell: dois módulos em tela cheia (Ficha Técnica e Orçamento), sem
   popup e sem Catalogação. Verifica navegação, lazy-load do orçamento,
   sincronização de tema nos dois sentidos e o tour/ajuda. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

(async () => {
  const oc = fs.readFileSync(BASE + '/index.html', 'utf-8');
  const errs = [];
  const frames = {};
  ['ficha','orcamento'].forEach(k => {
    frames[k] = { got: [], postMessage: m => frames[k].got.push(m), location: { reload(){ frames[k].reloaded = true; } } };
  });
  const d = new JSDOM(oc, { url: 'http://localhost:4800/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.addEventListener('error', e => errs.push(e.message));
    }
  });
  const w = d.window, doc = w.document;
  ['ficha','orcamento'].forEach(k => {
    const real = doc.getElementById('frame-' + k);
    Object.defineProperty(real, 'contentWindow', { value: frames[k], configurable: true });
  });
  await new Promise(r => setTimeout(r, 900));

  let fail = 0;
  const ok = (label, v, extra) => {
    console.log(v ? '  [OK]' : '  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0,80) : '');
    if (!v) fail++;
  };
  const ultimoTema = k => {
    const ms = frames[k].got.filter(m => m.type === 'vooalto-theme');
    return ms.length ? ms[ms.length-1].theme : null;
  };

  console.log('===== SHELL V8 =====');
  /* O tour de boas-vindas aparece sozinho na primeira visita (depois de ~600 ms). */
  const tourSozinho = doc.getElementById('tourV8').classList.contains('open');
  w.eval(`fecharTour()`);

  /* ── estrutura ── */
  ok('tour de boas-vindas abre sozinho na primeira visita', tourSozinho);
  ok('2 iframes (ficha + orçamento)', doc.querySelectorAll('iframe').length === 2);
  ok('2 abas no topo', doc.querySelectorAll('.switch-btn').length === 2);
  ok('ficha é a aba inicial', doc.getElementById('frame-ficha').classList.contains('active'));
  ok('orçamento começa sem src (lazy-load)', !doc.getElementById('frame-orcamento').getAttribute('src') && !!doc.getElementById('frame-orcamento').dataset.src);
  ok('sem popup de ficha (V7)', !doc.getElementById('fichaPopup') && !oc.includes('ficha-popup'));
  ok('sem Catalogação no shell', !doc.getElementById('frame-principal') && !oc.includes('principal_dashboard'));
  ok('sem selo de prioridade alta', !doc.getElementById('badgeAlta'));

  /* ── lazy-load do orçamento ── */
  w.eval(`showProject('orcamento')`);
  await new Promise(r => setTimeout(r, 80));
  ok('abrir orçamento define o src', doc.getElementById('frame-orcamento').getAttribute('src') === 'criador_orcamento/index.html');
  ok('orçamento ativo', doc.getElementById('frame-orcamento').classList.contains('active') && !doc.getElementById('frame-ficha').classList.contains('active'));
  ok('aba do orçamento marcada', doc.getElementById('btn-orcamento').classList.contains('active') && !doc.getElementById('btn-ficha').classList.contains('active'));
  w.eval(`showProject('ficha')`);
  await new Promise(r => setTimeout(r, 60));
  ok('volta para a ficha', doc.getElementById('frame-ficha').classList.contains('active'));

  /* ── mensagens entre módulos ── */
  w.postMessage({ type: 'vooalto-switch-tab', tab: 'orcamento' }, '*');
  await new Promise(r => setTimeout(r, 80));
  ok('módulo pede para trocar de aba', doc.getElementById('frame-orcamento').classList.contains('active'));

  /* mensagens da V7 que não existem mais não podem fazer nada */
  w.postMessage({ type: 'vooalto-ficha-to-catalog', fichaNome: 'X' }, '*');
  w.postMessage({ type: 'vooalto-ficha-edit', fichaId: 'x1' }, '*');
  w.postMessage({ type: 'vooalto-counts', alta: 3 }, '*');
  await new Promise(r => setTimeout(r, 80));
  ok('mensagens antigas da Catalogação são ignoradas', !frames.ficha.got.some(m => m.type === 'vooalto-ficha-edit'));

  /* ── temas ── */
  const postarDe = (frame, data) => {
    const ev = new w.MessageEvent('message', { data });
    Object.defineProperty(ev, 'source', { value: frame });
    w.dispatchEvent(ev);
  };
  postarDe(frames.ficha, { type: 'vooalto-theme', theme: 'escuro' });
  await new Promise(r => setTimeout(r, 100));
  ok('escuro aplica data-theme', doc.documentElement.dataset.theme === 'escuro');
  ok('escuro ajusta as variáveis', doc.documentElement.style.getPropertyValue('--shell-bg') === '#0b0f17' && doc.documentElement.style.getPropertyValue('--bar-text') === '#fff');
  ok('orçamento recebe escuro', ultimoTema('orcamento') === 'escuro');
  ok('não devolve o tema para quem enviou', !frames.ficha.got.some(m => m.type === 'vooalto-theme' && m.theme === 'escuro'));

  w.eval(`applyThemeFromShell('claro')`);
  await new Promise(r => setTimeout(r, 100));
  ok('claro remove o atributo', !doc.documentElement.dataset.theme);
  ok('claro ajusta as variáveis', doc.documentElement.style.getPropertyValue('--shell-bg') === '#eef0ff' && doc.documentElement.style.getPropertyValue('--bar-text') === '#17172a');
  ok('ficha recebe claro', ultimoTema('ficha') === 'claro');
  ok('grava na chave vooalto_tema', w.localStorage.getItem('vooalto_tema') === 'claro');

  w.eval(`applyThemeFromShell('butter')`);
  await new Promise(r => setTimeout(r, 60));
  ok('tema antigo claro "butter" -> claro', doc.documentElement.style.getPropertyValue('--shell-bg') === '#eef0ff' && !doc.documentElement.dataset.theme);
  w.postMessage({ type: 'vooalto-theme', theme: 'tech' }, '*');
  await new Promise(r => setTimeout(r, 60));
  ok('tema antigo escuro "tech" -> escuro', doc.documentElement.dataset.theme === 'escuro');
  ok('seletor com exatamente 2 opções', (() => {
    const o = doc.querySelectorAll('#themeSelect option');
    return o.length === 2 && o[0].value === 'claro' && o[1].value === 'escuro';
  })());
  w.eval(`applyThemeFromShell('claro')`);
  await new Promise(r => setTimeout(r, 60));

  /* ── ajuda / tour / recarregar ── */
  w.eval(`openHelp()`);
  ok('ajuda abre', doc.getElementById('helpModal').classList.contains('open'));
  w.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  ok('Esc fecha a ajuda', !doc.getElementById('helpModal').classList.contains('open'));
  w.eval(`mostrarTour()`);
  ok('tour abre', doc.getElementById('tourV8').classList.contains('open'));
  w.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  ok('Esc fecha o tour', !doc.getElementById('tourV8').classList.contains('open'));
  w.eval(`fecharTour()`);
  ok('tour não volta na mesma sessão', w.sessionStorage.getItem('vooalto_tour_v8') === 'visto');
  ok('ajuda não fala em Catalogação', !/Catalogação/.test(doc.getElementById('helpModal').textContent));

  w.eval(`showProject('orcamento',{silent:true}); reloadActive()`);
  ok('recarregar o módulo atual', frames.orcamento.reloaded === true);
  w.eval(`showProject('ficha',{silent:true}); reloadActive()`);
  ok('recarregar a ficha', frames.ficha.reloaded === true);

  /* ── erros de página ── */
  ok('sem erro de página no shell', errs.length === 0, errs.slice(0,3));

  console.log(fail ? `\n═══ SHELL V8: ${fail} FALHA(S) ═══` : '\n═══ SHELL V8: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
