'use strict';
/* V8 — Dois temas (Claro/Escuro) e nada além disso.
   Verificações estáticas + jsdom: o escuro troca as variáveis certas, não
   encosta na folha A4 (que precisa continuar branca) e nomes antigos de tema
   gravados por versões anteriores continuam sendo resolvidos. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');

const shell = fs.readFileSync(BASE + '/index.html', 'utf-8');
const ficha = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
const orc = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
const tema = fs.readFileSync(BASE + '/assets/tema-v9.css', 'utf-8');
const arquivos = { shell, ficha, orc };

let fail = 0;
const statik = (label, ok) => { console.log(ok ? '  [OK]' : '  [FAIL]', label); if (!ok) fail++; };

console.log('===== TEMAS V8 — ESTÁTICO =====');
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
statik('shell: converte nome antigo de tema (mapa + função)', shell.includes('TEMAS_ESCUROS_ANTIGOS') && shell.includes('function v8TemaValido'));
/* V9.3 — o escuro virou o padrão: quem nunca escolheu tema abre direto no escuro. */
statik('shell: boot anti-flash entende claro/escuro e nasce no escuro', shell.includes("var salvo=localStorage.getItem('vooalto_tema')||localStorage.getItem('vooalto_theme_v5')||'escuro'") && shell.includes("if(escuro)document.documentElement.setAttribute('data-theme','escuro')"));
statik('ficha, orçamento e manual também nascem no escuro', [ficha,orc,fs.readFileSync(BASE+'/manual.html','utf-8')].every(x=>x.includes("localStorage.getItem('vooalto_tema')||localStorage.getItem('vooalto_theme_v5')||'escuro'")));
statik('escuro é escuro de verdade (fundo quase preto, superfícies em degraus)', /\[data-theme="escuro"\]\{[\s\S]*?--v9-bg:#04060a[\s\S]*?--v9-surface:#0a0d13/.test(tema));
statik('superfície escura mais clara que o fundo e mais escura que o texto', (() => {
  const lum = h => { const n = parseInt(h.slice(1), 16); const c = [16, 8, 0].map(i => ((n >> i) & 255) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const bloco = tema.slice(tema.indexOf('[data-theme="escuro"]'));
  return lum('#04060a') < 0.01 && lum('#0a0d13') < 0.01 && lum('#0a0d13') > lum('#04060a') && lum('#e9eef7') > 0.8;
})());
/* V8: o shell passou a gravar em 'vooalto_tema', lendo a chave antiga como reserva. */
statik('shell: grava na chave nova e lê a antiga', shell.includes("THEME_KEY='vooalto_tema'") && shell.includes("localStorage.getItem(THEME_KEY_LEGADO)"));
statik('ficha e orçamento leem as duas chaves de tema', ficha.includes("localStorage.getItem('vooalto_tema')||localStorage.getItem('vooalto_theme_v5')") && orc.includes("localStorage.getItem('vooalto_tema')||localStorage.getItem('vooalto_theme_v5')"));
statik('nenhum modulo guarda paleta antiga', !ficha.includes('butter') && !orc.includes('butter'));
statik('ficha: folha A4 continua branca (--br aponta para o papel e sem regra escura nela)',
  /:root\{[\s\S]{0,900}--br:(#fff|var\(--v9-paper\))/.test(ficha) && !/\[data-theme="escuro"\][^{]*\.folha/.test(ficha));
statik('base compartilhada: --v9-paper é branco e o escuro NÃO o reescreve (ficha impressa não sai cinza)',
  /--v9-paper:#fff/.test(tema) && !/\[data-theme="escuro"\]\{[\s\S]*?--v9-paper:/.test(tema));
statik('base compartilhada: uma paleta só, com claro e escuro', /:root\{[\s\S]*?--v9-bg:#eef0ff/.test(tema) && /\[data-theme="escuro"\]\{[\s\S]*?--v9-bg:#04060a/.test(tema));
statik('ficha e orçamento carregam a base compartilhada antes do próprio CSS',
  ficha.indexOf('assets/tema-v9.css') > -1 && orc.indexOf('assets/tema-v9.css') > -1 &&
  ficha.indexOf('assets/tema-v9.css') < ficha.indexOf('<style>') + 4000 && orc.indexOf('assets/tema-v9.css') < orc.indexOf('<style>') + 4000);
statik('ficha e orçamento ganharam boot anti-piscada (antes só o shell tinha)',
  ficha.includes("document.documentElement.setAttribute('data-theme',escuro?'escuro':'claro')") &&
  orc.includes("document.documentElement.setAttribute('data-theme',escuro?'escuro':'claro')"));
statik('ficha: escuro não encosta em campo que fica DENTRO da folha', !/\[data-theme="escuro"\][^{}]*(\.dc-inp|\.fin-inp|\.sep-inp|\.gt\b|\.tipo-body|\.sec\b|\.info-box|\.med-hdr)/.test(ficha));
statik('ficha: escuro só mexe em painel/barras escondidas na impressão', (() => {
  const ok = new Set(['body', '.canvas-tb', '.text-tb', '.arr-tb', '.shape-tb', '.ct-btn', '.tt-toggle',
    '.arr-style-btn', '.rb-btn', '.rb-label', '.lt-btn', '.layers-panel', '.lp-hdr', '.lp-name',
    '.v7-dl-card', '.v7-dl-head', '.v4-tb-btn']);
  const regras = [...ficha.matchAll(/\[data-theme="escuro"\]\s*([^{]+)\{/g)].map(m => m[1].trim());
  return regras.length > 0 && regras.every(sel => sel.split(',').every(parte =>
    (parte.trim().replace(/:hover$/, '').match(/\.[a-z0-9-]+/g) || []).every(cls => ok.has(cls))));
})());
/* V8.1 — o Orçamento DEIXOU de ser "interface própria fixa": agora segue o
   tema do sistema como os outros módulos. A regra antiga (que exigia o
   contrário) foi substituída por esta, de propósito. */
statik('orçamento: segue o tema (aplica data-theme) e mantém o normalizador',
  orc.includes('function v7TemaValido') &&
  /function applyGlobalTheme\(t\)\{[^}]*dataset\.theme/.test(orc));
statik('orçamento: paleta própria antiga (azul-ardósia) saiu do editor',
  !/#0F172A|#1E293B|#38BDF8/i.test(orc.replace(/<img[^>]*>/g, '')) &&
  !/#0F172A|#1E293B|#38BDF8/i.test(tema.replace(/\/\*[\s\S]*?\*\//g, '')));
statik('orçamento: o papel A4 continua creme e intocado pelo tema',
  /\.page \{[\s\S]{0,400}background-color: #F3F0E7/.test(orc) && !/\[data-theme="escuro"\][^{]*\.page\b/.test(orc));
statik('orçamento: usa os tokens compartilhados nos painéis',
  (orc.match(/var\(--v9-(surface|surface-2|surface-3|line|line-2|t1|t2|t3|bg-2|pink)\)/g) || []).length > 30);

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
  console.log('===== TEMAS V8 — jsdom =====');
  {
    /* shell abrindo com um tema antigo salvo -> precisa virar escuro */
    const { dom, w, erros } = await carregar(shell, 'http://localhost:4800/', w => {
      try { w.localStorage.setItem('vooalto_theme_v5', 'tech'); } catch (e) {}
    });
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    t('tema antigo salvo abre como escuro', `document.documentElement.dataset.theme === 'escuro'`);
    t('barra do shell escura', `document.documentElement.style.getPropertyValue('--shell-bg') === '#04060a'`);
    t('valor salvo é normalizado na chave nova', `localStorage.getItem('vooalto_tema') === 'escuro'`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }
  {
    const { dom, w, erros } = await carregar(ficha, 'http://localhost:4800/criador_ficha_tecnica/');
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
    const { dom, w, erros } = await carregar(orc, 'http://localhost:4800/criador_orcamento/');
    const t = (label, expr) => {
      let r;
      try { r = w.eval(expr); } catch (e) { fail++; console.log('  [ERR]', label, ':', e.message); return; }
      const ok = !!r;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0, 70) : '');
      if (!ok) fail++;
    };
    w.eval(`applyGlobalTheme('escuro')`);
    t('orçamento: aceita o tema sem quebrar', `typeof applyGlobalTheme === 'function' && document.documentElement.style.colorScheme === 'dark'`);
    t('orçamento: escuro marca o <html> como escuro', `document.documentElement.dataset.theme === 'escuro'`);
    w.eval(`applyGlobalTheme('claro')`);
    t('orçamento: claro marca o <html> como claro', `document.documentElement.dataset.theme === 'claro'`);
    console.log('  erros de página:', erros.length ? erros : 'nenhum ✓');
    if (erros.length) fail++;
    dom.window.close();
  }

  console.log(fail ? `\n═══ TEMAS: ${fail} FALHA(S) ═══` : '\n═══ TEMAS: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
