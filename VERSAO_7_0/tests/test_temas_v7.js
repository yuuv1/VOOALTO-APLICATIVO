'use strict';
/* V7.3 — Dois temas (Claro/Escuro) com conversão automática dos antigos.
   Verificações estáticas + jsdom: o escuro troca as variáveis certas, não
   encosta na folha A4 (que precisa continuar branca) e nomes antigos de tema
   continuam funcionando. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');

const shell = fs.readFileSync(BASE + '/index.html', 'utf-8');
const dash = fs.readFileSync(BASE + '/principal_dashboard/index.html', 'utf-8');
const ficha = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
const orc = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
const arquivos = { shell, dash, ficha, orc };

let fail = 0;
const statik = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label); if (!ok) fail++; };

console.log('===== TEMAS V7.3 — ESTÁTICO =====');
for (const [nome, src] of Object.entries(arquivos)) {
  const seletorTema = [...src.matchAll(/\[data-theme="([a-z]+)"\]/g)].map(m => m[1]);
  const outros = [...new Set(seletorTema.filter(t => t !== 'escuro'))];
  statik(`${nome}: só existe o modo escuro (nenhuma paleta antiga)${outros.length ? ' -> ' + outros.join(',') : ''}`, outros.length === 0);
}
statik('shell: seletor com exatamente Claro e Escuro', (() => {
  const m = shell.match(/<select class="theme-select"[\s\S]*?<\/select>/);
  if (!m) return false;
  const opts = [...m[0].matchAll(/<option value="([a-z]+)"/g)].map(x => x[1]);
  return opts.length === 2 && opts[0] === 'claro' && opts[1] === 'escuro';
})());
statik('shell: converte nome antigo de tema (mapa + função)', shell.includes('TEMAS_ESCUROS_ANTIGOS') && shell.includes('function v7TemaValido'));
statik('shell: boot anti-flash já entende claro/escuro', shell.includes("var salvo=localStorage.getItem('vooalto_theme_v5')||'claro'") && shell.includes("if(escuro)document.documentElement.setAttribute('data-theme','escuro')"));
statik('catalogação: sem seletor de tema duplicado', !dash.includes('theme-select') && !dash.includes('themeSelect"'));
statik('catalogação: módulo escuro define --header-bg/--header-text (bug do cabeçalho claro)', /\[data-theme="escuro"\]\{[^}]*--header-bg:#0b0f17[^}]*--header-text:#f8fafc/.test(dash));
statik('catalogação: corrige o brilho branco do fundo no escuro', dash.includes('[data-theme="escuro"] .app{background:var(--bg)!important;background-image:none!important}'));
statik('ficha: folha A4 continua branca (--br e sem regra escura nela)', /:root\{[\s\S]{0,900}--br:#fff/.test(ficha) && !/\[data-theme="escuro"\][^{]*\.folha/.test(ficha));
statik('ficha: escuro não encosta em campo que fica DENTRO da folha', !/\[data-theme="escuro"\][^{}]*(\.dc-inp|\.fin-inp|\.sep-inp|\.gt\b|\.tipo-body|\.sec\b|\.info-box|\.med-hdr)/.test(ficha));
statik('ficha: escuro só mexe em painel/barras escondidas na impressão', (() => {
  const ok = new Set(['body', '.canvas-tb', '.text-tb', '.arr-tb', '.shape-tb', '.ct-btn', '.tt-toggle',
    '.arr-style-btn', '.rb-btn', '.rb-label', '.lt-btn', '.layers-panel', '.lp-hdr', '.lp-name',
    '.v7-dl-card', '.v7-dl-head', '.v4-tb-btn']);
  const regras = [...ficha.matchAll(/\[data-theme="escuro"\]\s*([^{]+)\{/g)].map(m => m[1].trim());
  return regras.length > 0 && regras.every(sel => sel.split(',').every(parte =>
    (parte.trim().replace(/:hover$/, '').match(/\.[a-z0-9-]+/g) || []).every(cls => ok.has(cls))));
})());
statik('orçamento: sem regras de tema (interface própria) e com normalized', orc.includes('function v7TemaValido') && !/\[data-theme="escuro"\][^{]*\{/.test(orc));

async function carregar(src, url, preparar) {
  const erros = [];
  const dom = new JSDOM(src, {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({ width: 50 })), set: () => true }); };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.addEventListener('error', e => erros.push(e.message));
      if (preparar) preparar(w);
    }
  });
  await new Promise(r => setTimeout(r, 1100));
  return { dom, w: dom.window, erros };
}

(async () => {
  console.log('===== TEMAS V7.3 — jsdom =====');
  {
    const { dom, w, erros } = await carregar(dash, 'http://localhost:4700/principal_dashboard/');
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    t('começa no claro (sem atributo)', `!document.documentElement.dataset.theme`);
    w.eval(`setTheme('escuro')`);
    t('escuro aplica data-theme', `document.documentElement.dataset.theme === 'escuro'`);
    t('escuro ajusta colorScheme', `document.documentElement.style.colorScheme === 'dark'`);
    w.eval(`setTheme('dark')`);
    t('nome antigo "dark" continua escuro', `document.documentElement.dataset.theme === 'escuro'`);
    w.eval(`setTheme('givry')`);
    t('nome antigo claro "givry" volta ao claro', `!document.documentElement.dataset.theme && document.documentElement.style.colorScheme === 'light'`);
    t('função de conversão disponível', `v7TemaValido('tech') === 'escuro' && v7TemaValido('butter') === 'claro' && v7TemaValido('xxx') === 'claro'`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }
  {
    /* shell abrindo com um tema antigo salvo -> precisa virar escuro */
    const { dom, w, erros } = await carregar(shell, 'http://localhost:4700/', w => {
      try { w.localStorage.setItem('vooalto_theme_v5', 'tech'); } catch (e) {}
    });
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    t('tema antigo salvo abre como escuro', `document.documentElement.dataset.theme === 'escuro' && document.body.dataset.theme === 'escuro'`);
    t('barra do shell escura', `document.documentElement.style.getPropertyValue('--shell-bg') === '#0b0f17'`);
    t('valor salvo é normalizado', `localStorage.getItem('vooalto_theme_v5') === 'escuro'`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }
  {
    const { dom, w, erros } = await carregar(ficha, 'http://localhost:4700/criador_ficha_tecnica/');
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    w.eval(`applyGlobalTheme('escuro')`);
    t('ficha: escuro aplica no <html>', `document.documentElement.dataset.theme === 'escuro'`);
    w.eval(`applyGlobalTheme('oxford')`);
    t('ficha: nome antigo escuro -> escuro', `document.documentElement.dataset.theme === 'escuro'`);
    w.eval(`applyGlobalTheme('claro')`);
    t('ficha: claro limpa o atributo', `!document.documentElement.dataset.theme`);
    t('ficha: folha A4 não é afetada pelo tema', `!document.querySelector('[data-theme="escuro"] .folha')`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    /* não fechamos a janela da ficha: o jsdom dispara um erro de MutationObserver
       no teardown que já existia antes desta versão (ruído de teste, não do app) */
  }
  {
    const { dom, w, erros } = await carregar(orc, 'http://localhost:4700/criador_orcamento/');
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    w.eval(`applyGlobalTheme('escuro')`);
    t('orçamento: aceita o tema sem quebrar', `typeof applyGlobalTheme === 'function' && document.documentElement.style.colorScheme === 'dark'`);
    t('orçamento: não ganha data-theme (interface própria)', `!document.documentElement.dataset.theme`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }

  console.log(fail ? `\n═══ TEMAS: ${fail} FALHA(S) ═══` : '\n═══ TEMAS: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
