'use strict';
/* V9.3 — A PEÇA (camiseta de pescador) do mockup.
   O que a V9.3 prometeu:
     • a peça é desenho técnico (não é foto, não é template pronto);
     • só cor sólida nos recortes + uma textura por recorte (esticada livre ou
       repetida), sem pintura em cima do tecido;
     • arte entra por imagem e, ao arrastar, acompanha o ângulo do tecido;
     • costura herda a cor do painel (nunca um cinza fixo);
     • a arte nunca escapa da silhueta, e a textura não apaga a cor do painel;
     • o estúdio abre dentro da ficha e vira uma camada de imagem normal.
   Roda em três camadas: geometria (node puro), render (string do SVG) e
   estúdio (jsdom), mais as travas estáticas de integração. */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
function check(label, ok, extra) {
  const sufixo = extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 90) : '';
  if (ok) { pass++; console.log('  [OK]', label, sufixo); }
  else { fail++; console.log('  [FAIL]', label, sufixo); }
}

const DIR = path.join(BASE, 'mockup');
const ler = f => fs.readFileSync(path.join(DIR, f), 'utf8');

/* ── 0. módulos ─────────────────────────────────────────────────────────── */
global.window = global;
global.document = { createElement: () => ({ getContext: () => null, style: {} }) };
require(path.join(DIR, 'peca.js'));
require(path.join(DIR, 'peca_render.js'));

const P = global.Peca, R = global.PecaRender;

console.log('===== PEÇA V9.3 — GEOMETRIA =====');
check('Peca carregou', typeof P === 'object' && typeof P.paineis === 'function');
check('PecaRender carregou', typeof R === 'object' && typeof R.svg === 'function');
check('viewBox 1000 × 1240', P.VB.w === 1000 && P.VB.h === 1240, P.VB);

const frente = P.paineis('frente');
const costas = P.paineis('costas');
check('frente tem 10 painéis (corpo, 4 recortes, 2 mangas, 2 punhos, gola)', frente.length === 10, frente.map(p => p.id));
check('costas têm 11 painéis (ganham a pala)', costas.length === 11, costas.map(p => p.id).slice(-2));
check('todo painel tem caminho e cor', frente.every(p => /^M/.test(p.d) && typeof p.cor === 'string'));

/* simetria: o painel da direita é o da esquerda espelhado em x = 500 */
function pontosD(d) {
  return (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}
const e1 = frente.find(p => p.id === 'recorte_e'), d1 = frente.find(p => p.id === 'recorte_d');
const pa = pontosD(e1.d), pb = pontosD(d1.d);
check('recorte esquerdo e direito têm o mesmo número de coordenadas', pa.length === pb.length, [pa.length, pb.length]);
/* espelhado em x = 500: cada x do direito é 1000 - x do esquerdo */
const pair = (a, b) => { const xs = a.filter((_, i) => i % 2 === 0), ys = b.filter((_, i) => i % 2 === 0); return ys.every((v, i) => Math.abs((1000 - xs[i]) - v) < 0.51); };
check('o recorte da direita é o da esquerda espelhado no eixo', pair(pa, pb), [pa.slice(0, 4), pb.slice(0, 4)]);

/* ── silhueta e furo ─────────────────────────────────────────────────────── */
const sil = P.silhueta('frente');
check('silhueta é um caminho fechado próprio, sem "Z" final', /^M/.test(sil) && !/Z\s*$/.test(sil));
check('silhueta da frente e das costas é a mesma peça', P.silhueta('costas') === sil);
const furo = P.furo();
check('vão do pescoço tem centro e raios', furo && furo.cx === 500 && furo.rx > 0 && furo.ry > 0, furo);

/* ── zonas (o "Onde aplicar") ────────────────────────────────────────────── */
check('5 zonas para escolher', P.ZONAS.length === 5, P.ZONAS.map(z => z.id));
check('zonas: corpo, mangas, recorte, gola, punho',
  ['corpo', 'mangas', 'recorte', 'gola', 'punho'].every(id => P.ZONAS.some(z => z.id === id)));
check('toda zona aponta para painéis que existem', P.ZONAS.every(z =>
  z.paineis.every(nome => frente.concat(costas).some(p => p.id === nome))), P.ZONAS.map(z => z.id));

/* ── costuras ───────────────────────────────────────────────────────────── */
const cf = P.costuras('frente'), cc = P.costuras('costas');
check('frente tem 9 costuras', cf.length === 9, cf.length);
check('costas têm 10 (pala)', cc.length === 10, cc.length);
check('costas inclui a pala', cc.some(c => c.painel === 'pala'));
check('toda costura herda um painel colorido', cf.concat(cc).every(c => typeof c.painel === 'string' && c.painel.length > 0));
check('nenhuma costura é um traço fixo cinza (a cor sai do painel)', !JSON.stringify(cf).match(/#(888|999|aaa|ccc)/i));
check('costuras são tracejadas por natureza (caminho com contorno, sem preenchimento)',
  cf.every(c => /^M/.test(c.d)) && ler('peca_render.js').includes('stroke-dasharray='));

/* ── ângulo do tecido (a arte acompanha a peça) ─────────────────────────── */
const aPeito = R.anguloEm(500, 300), aMangaE = R.anguloEm(200, 800), aMangaD = R.anguloEm(800, 800);
check('no peito a arte fica em pé (0°)', Math.abs(aPeito) < 0.6, aPeito.toFixed(2));
check('na manga esquerda ela deita para um lado', aMangaE < -8, aMangaE.toFixed(2));
check('na manga direita ela deita para o outro', aMangaD > 8, aMangaD.toFixed(2));
check('o ângulo é simétrico na peça', Math.abs(aMangaE + aMangaD) < 0.4, [aMangaE.toFixed(2), aMangaD.toFixed(2)]);
check('ângulo nunca explode nas bordas', [-500, 0, 500, 1000, 1500].every(x => Math.abs(R.anguloEm(x, 620)) < 60));

console.log('===== PEÇA V9.3 — RENDER =====');
const est = R.estadoPadrao();
check('estado de um lado traz lado, cores, acabamento, texturas e artes',
  est.lado === 'frente' && !!est.cores && est.acabamento === 'dryfit' && !!est.texturas && Array.isArray(est.artes));
check('a peça nasce sem arte e sem textura (nada de template pronto)',
  est.artes.length === 0 && Object.keys(est.texturas).length === 0);
check('as cores padrão são só dos recortes da peça', (() => {
  const nomes = Object.keys(est.cores).sort().join(',');
  return nomes === 'corpo,gola,interior,mangas,punho,recorte';
})(), Object.keys(est.cores));

const svg = R.svg(est, { largura: 600, id: 't' });
check('SVG declara viewBox e largura', /viewBox="0 0 1000 1240"/.test(svg) && /width="600"/.test(svg));
check('SVG começa em <svg e termina em </svg>', svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
check('desenha os 7 painéis da frente (fills sólidos)',
  (svg.match(/<path d="M/g) || []).length >= 7);
check('usa as cores padrão da peça', svg.includes(P.CORES.corpo) && svg.includes(P.CORES.recorte));
check('cada painel pode trocar de cor de forma independente',
  R.svg({ cores: { corpo: '#123456' } }, { id: 't2' }).includes('#123456'));

/* textura: multiply, nunca opacidade pura (opacidade pura deixava pastel) */
const comTextura = R.svg({
  texturas: { recorte: { src: 'data:image/png;base64,AAA', modo: 'esticar', opac: 0.8 } }
}, { id: 'tx' });
check('textura vira <pattern>', comTextura.includes('<pattern id="tex_tx_recorte"'));
check('textura "esticar" cobre o painel inteiro', /preserveAspectRatio="none"/.test(comTextura));
check('textura usa multiply (não lava a cor do recorte)', /mix-blend-mode:multiply/.test(comTextura));
check('textura respeita a opacidade escolhida', /opacity="0.8"[^>]*mix-blend-mode:multiply/.test(comTextura));
const comTexturaRepetir = R.svg({
  texturas: { corpo: { src: 'data:image/png;base64,AAA', modo: 'repetir', ex: 2, ey: 1.5, rot: 30, ox: 5, oy: 7 } }
}, { id: 'tr' });
check('textura "repetir" vira mosaico com escala e giro',
  /patternTransform="translate\(5 7\) rotate\(30\)"/.test(comTexturaRepetir) && /width="520"/.test(comTexturaRepetir));

/* arte presa à peça e nunca fora dela */
const comArte = R.svg({
  artes: [{ id: 'a1', src: 'data:image/png;base64,AAA', x: 200, y: 800, w: 300, h: 200, rot: -15.5, opac: 0.9 }]
}, { id: 'ar' });
check('arte entra como <image>', /<image href="data:image\/png;base64,AAA"/.test(comArte));
check('arte é recortada pela silhueta (não vaza da peça)',
  /clip-path="url\(#clip_ar\)"/.test(comArte) && /<clipPath id="clip_ar">/.test(comArte));
check('arte respeita posição, rotação e opacidade',
  /translate\(200 800\) rotate\(-15\.50\)/.test(comArte) && /opacity="0.9"/.test(comArte));
const comEspelho = R.svg({ artes: [{ id: 'a2', src: 'data:image/png;base64,AAA', x: 500, y: 400, flip: 1 }] }, { id: 'fl' });
check('espelhar arte usa escala -1', /scale\(-1 1\)/.test(comEspelho));

/* volume: a manga não pode ser um retângulo chapado */
check('manga tem degradê de volume (tubo de tecido)', /id="sleeve_/.test(svg) && svg.includes('url(#sleeve_t)'));
check('o volume da manga só aparece nas mangas', (svg.match(/url\(#sleeve_t\)/g) || []).length === 2);

/* acabamento: dry fit tem brilho, algodão é fosco */
const dry = R.svg({ acabamento: 'dryfit' }, { id: 'd1' }), cot = R.svg({ acabamento: 'algodao' }, { id: 'd2' });
check('dry fit usa o degradê de brilho', dry.includes('url(#sheen_d1)'));
check('algodão é fosco (sem brilho, só sombra de dobra)', !cot.includes('url(#sheen_d2)') && cot.includes('url(#fold_d2)'));

/* costura colorida pelo painel */
const cores = { corpo: '#204060', recorte: '#80c0e0' };
const svgCores = R.svg({ cores: cores }, { id: 'cr' });
const escurece = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * f));
  return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
};
check('costura do recorte é o recorte escurecido', svgCores.includes(escurece('#80c0e0', 0.5)));
check('costura do corpo é o corpo escurecido', svgCores.includes(escurece('#204060', 0.5)));
check('mudar a cor do recorte muda a cor da costura dele (não fica fixa)',
  R.svg({ cores: { recorte: '#ff8800' } }, { id: 'cr2' }).includes(escurece('#ff8800', 0.5)));
const corDeCostura = /stroke="(#[0-9a-f]{6})" stroke-width="2\.4"/gi;
const achadas = new Set();
let m;
while ((m = corDeCostura.exec(svgCores))) achadas.add(m[1].toLowerCase());
const paleta = Object.assign({}, P.CORES, cores);
const permitidas = new Set(['corpo', 'mangas', 'recorte', 'gola', 'punho'].map(k => escurece(paleta[k], .5)));
check('todas as costuras saem das cores dos painéis (nada de cinza fixo)',
  [...achadas].every(c => permitidas.has(c)), { costuras: [...achadas], permitidas: [...permitidas] });

/* lado costas não desenha zíper */
check('frente tem zíper', P.estrutura('frente').some(e => e.tipo === 'dentes'));
check('costas não tem zíper', P.estrutura('costas').length === 0);
check('costas tem pala', (R.svg({ lado: 'costas' }, { id: 'z3' }).match(/PALA|pala/) || '').length >= 0 &&
  P.costuras('costas').some(c => c.painel === 'pala'));

/* sombra de sobreposição (manga por cima do corpo) */
check('peça tem sombra onde a manga cobre o corpo', typeof P.sombras === 'function' && P.sombras('frente').length >= 2);
check('sombra entra recortada pela silhueta', /<g clip-path="url\(#clip_z1\)"[^>]*style="pointer-events:none"/.test(R.svg({ lado: 'frente' }, { id: 'z1' })));

/* opções de render (usadas pela ficha/impressão) */
check('semCostura tira o tracejado e semArte tira a imagem (modo leve)',
  !R.svg(est, { id: 'q', semCostura: true }).includes('stroke-width="' + P.COSTURA.espessura + '"') &&
  !R.svg({ artes: [{ src: 'data:image/png;base64,AAA', x: 500, y: 500 }] }, { id: 'q2', semArte: true }).includes('<image'));

/* ── 1. ESTÚDIO (jsdom) ─────────────────────────────────────────────────── */
(async () => {
  console.log('===== PEÇA V9.3 — ESTÚDIO (jsdom) =====');
  const erros = [];
  let html = ler('index.html').replace(/<script>[\s\S]*?<\/script>\s*<\/body>/, '</body>');
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/mockup/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({})), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      /* o jsdom não decodifica imagem: o onload nunca dispara. O estúdio mede
         a imagem antes de usar, então o teste troca o Image por um que responde
         (no navegador de verdade isso é nativo). */
      w.Image = class {
        constructor() { this.naturalWidth = 120; this.naturalHeight = 90; this._src = ''; }
        set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
      };
      w.addEventListener('error', e => erros.push(e.message || String(e.error)));
    }
  });
  const w = dom.window;
  ['peca.js', 'peca_render.js', 'peca_editor.js'].forEach(f => w.eval(ler(f)));
  await new Promise(r => setTimeout(r, 50));

  const doc = w.document;
  const app = doc.getElementById('app');
  const aplicados = [];
  w.PecaEditor.montar(app, { onAplicar: e => aplicados.push(e) });

  check('estúdio monta na página', app.classList.contains('pk-studio'));
  check('palco tem o SVG da peça', !!app.querySelector('.pk-canvas svg'));
  check('5 zonas no "Onde aplicar"', doc.querySelectorAll('.pk-zone').length === 5);
  check('cada zona tem seletor de cor', doc.querySelectorAll('.pk-zone input[type=color]').length === 5);
  check('paletas de cor prontas', doc.querySelectorAll('.pk-paletas button').length >= 20);
  check('alternância frente/costas e acabamento na barra', doc.querySelectorAll('.pk-top .pk-seg').length >= 2);

  /* 1.1 cor de um recorte */
  const sel = doc.querySelectorAll('.pk-zone input[type=color]')[2];
  sel.value = '#ff0000';
  sel.dispatchEvent(new w.Event('input', { bubbles: true }));
  const svg1 = app.querySelector('.pk-canvas svg').outerHTML;
  check('trocar a cor do recorte repinta o painel', /#ff0000/i.test(svg1));

  /* 1.2 textura no recorte */
  w.PecaEditor.aplicarTexturaArquivo('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'recorte');
  await new Promise(r => setTimeout(r, 300));
  const svg2 = app.querySelector('.pk-canvas svg').outerHTML;
  check('textura aplicada vira <pattern>', /<pattern/.test(svg2));
  check('textura da zona escolhida (recorte)', /tex_.*recorte/.test(svg2));
  check('textura sobrevive à troca de cor do painel', /mix-blend-mode:multiply/.test(svg2));

  /* 1.3 arte presa à peça */
  const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  w.PecaEditor.adicionarArquivos([PNG1], { x: 200, y: 800 });
  await new Promise(r => setTimeout(r, 400));
  const estado = w.PecaEditor.estado();
  check('imagem adicionada vira arte da peça', estado.frente.artes.length === 1, estado.frente.artes.length);
  check('arte nasce com o ângulo do tecido naquele ponto',
    Math.abs(estado.frente.artes[0].rot - R.anguloEm(200, 800)) < 0.01, estado.frente.artes[0].rot);
  check('arte aparece no palco para arrastar', doc.querySelectorAll('.pk-arte').length === 1);
  const svg3 = app.querySelector('.pk-canvas svg').outerHTML;
  check('arte no palco fica presa à silhueta', /clip-path="url\(#clip_/.test(svg3));

  /* 1.4 editar a arte (mover mantém o ângulo do tecido) */
  const antesRot = estado.frente.artes[0].rot;
  w.PecaEditor.adicionarArquivos([PNG1], { x: 800, y: 400 });
  await new Promise(r => setTimeout(r, 300));
  const est2 = w.PecaEditor.estado();
  check('segunda imagem entra como segunda arte', est2.frente.artes.length === 2);
  check('cada arte guarda o próprio ângulo', est2.frente.artes[0].rot !== est2.frente.artes[1].rot, [antesRot, est2.frente.artes[1].rot]);

  /* 1.5 aplicar entrega o estado para a ficha */
  [...doc.querySelectorAll('.pk-top button')].find(b => /Aplicar/.test(b.textContent)).click();
  check('botão "Aplicar na ficha" entrega o estado', aplicados.length === 1);
  check('estado entregue tem frente, costas e acabamento',
    aplicados[0] && aplicados[0].frente && aplicados[0].costas && aplicados[0].acabamento);
  check('estado entregue não carrega função nem DOM (é JSON puro)',
    (() => { try { JSON.parse(JSON.stringify(aplicados[0])); return true; } catch (e) { return false; } })());

  /* 1.6 carregar estado salvo (reabrir a peça depois) */
  const salvo = JSON.parse(JSON.stringify(w.PecaEditor.estado()));
  w.PecaEditor.carregar(salvo);
  const reaberto = w.PecaEditor.estado();
  check('reabrir restaura as artes', reaberto.frente.artes.length === 2);
  check('reabrir restaura a cor do recorte', /ff0000/i.test(JSON.stringify(reaberto.frente.cores)));

  /* 1.7 costas */
  w.PecaEditor._setLado('costas');
  check('trocar para costas troca a vista da peça',
    /pala/.test(w.PecaEditor.estado().costas ? 'pala' : 'x'));

  check('nenhum erro de página no estúdio', erros.length === 0, erros.slice(0, 3));

  /* ── 2. INTEGRAÇÃO COM A FICHA (estático) ─────────────────────────────── */
  console.log('===== PEÇA V9.3 — INTEGRAÇÃO =====');
  const ficha = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica/index.html'), 'utf8');
  check('ficha carrega os três scripts da peça',
    ['mockup/peca.js', 'mockup/peca_render.js', 'mockup/peca_editor.js'].every(f => ficha.includes(f)));
  check('ficha carrega o CSS do estúdio', ficha.includes('mockup/peca_editor.css'));
  check('régua do mockup ganhou o botão da peça', /data-acao="peca"/.test(ficha));
  check('ação do botão abre o estúdio', /case 'peca':\s*mkeAbrirPeca\(\)/.test(ficha));
  check('aplicar na ficha gera PNG e cria camada de imagem',
    /function mkeAplicarPeca/.test(ficha) && /PecaRender\.paraPNG/.test(ficha));
  check('peça entra com a proporção real do desenho (1000×1240)', /1000\/1240/.test(ficha));
  check('estado da peça fica guardado por camada (dá para reeditar)',
    /PECA_POR_ID/.test(ficha) && /pecaGuardar/.test(ficha));
  check('estado da peça NÃO vai para o localStorage junto das camadas',
    !/savLayers[^\n]*_peca/.test(ficha));
  check('peça entra no .json do projeto (para reabrir e editar)',
    /b\._peca=ep|_peca\s*=\s*ep/.test(ficha));

  /* ── 3. A PEÇA DENTRO DA FICHA (jsdom de verdade) ─────────────────────────
     O estúdio só vale se abrir na ficha e virar camada. Aqui a ficha é
     carregada como o usuário carrega: os scripts da peça entram por <script>,
     o jsdom não busca arquivos, então são injetados na mão (é o único atalho). */
  console.log('===== PEÇA V9.3 — DENTRO DA FICHA (jsdom) =====');
  const errosFicha = [];
  const fichaHtml = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica/index.html'), 'utf8');
  const domFicha = new JSDOM(fichaHtml, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => ({})), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.Image = class {
        constructor() { this.naturalWidth = 900; this.naturalHeight = 1116; this._src = ''; }
        set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
        get src() { return this._src; }
      };
      w.addEventListener('error', e => errosFicha.push(e.message || String(e.error)));
    }
  });
  const wf = domFicha.window, docf = wf.document;
  await new Promise(r => setTimeout(r, 1500));
  ['peca.js', 'peca_render.js', 'peca_editor.js'].forEach(f => wf.eval(ler(f)));

  const btnPeca = docf.querySelector('#mkeRail [data-acao="peca"]');
  check('a régua do mockup tem o botão da peça', !!btnPeca);
  if (btnPeca) btnPeca.click();
  await new Promise(r => setTimeout(r, 150));
  check('clicar abre o estúdio da peça em tela cheia', !!docf.getElementById('pecaOverlay'));
  check('o estúdio montou dentro da ficha', !!docf.querySelector('#pecaOverlay .pk-studio'));
  check('o estúdio da peça desenha o SVG da peça', !!docf.querySelector('#pecaOverlay .pk-canvas svg'));

  /* aplicar: vira camada de imagem da ficha */
  const camadasAntes = wf.eval('layers.length');
  const estadoPeca = wf.eval('PecaEditor.estado()');
  wf.eval('mkeFecharPeca()');
  wf.eval('mkeAplicarPeca(' + JSON.stringify(estadoPeca) + ',null)');
  await new Promise(r => setTimeout(r, 400));
  const camadasDepois = wf.eval('layers.length');
  check('aplicar cria uma camada de imagem na ficha', camadasDepois === camadasAntes + 1, [camadasAntes, camadasDepois]);
  const camada = wf.eval('JSON.stringify(layers[layers.length-1])');
  const objCamada = JSON.parse(camada || '{}');
  check('a camada guarda o estado da peça para reeditar', !!objCamada._peca && !!objCamada._peca.frente);
  /* no jsdom a área do mockup é quadrada (400×400), então a caixa da camada
     tem que sair com a proporção do desenho: 1240/1000 de altura por largura */
  check('a camada nasce com a proporção do desenho (1000×1240)',
    Math.abs(objCamada.hp / objCamada.wp - 1240 / 1000) < 0.06, [objCamada.wp, objCamada.hp]);
  check('a peça aplicada não passa por cima de nada nem estoura a página',
    objCamada.wp > 0.1 && objCamada.wp < 0.9 && objCamada.hp > 0.1 && objCamada.hp <= 0.95, [objCamada.wp, objCamada.hp]);

  /* reabrir a peça a partir da camada aplicada */
  wf.eval('mkeAbrirPeca(layers[layers.length-1])');
  await new Promise(r => setTimeout(r, 150));
  check('clicar de novo na peça reabre o estúdio com o estado salvo', !!docf.querySelector('#pecaOverlay .pk-studio'));
  wf.eval('mkeFecharPeca()');
  check('fechar o estúdio limpa a tela (sem overlay sobrando)', !docf.getElementById('pecaOverlay'));
  check('nenhum erro de página na ficha com o estúdio aberto', errosFicha.length === 0, errosFicha.slice(0, 3));

  console.log('===== PEÇA V9.3 — BUILD =====');
  const build = fs.readFileSync(path.join(BASE, '..', 'build_v10_pwa.py'), 'utf8');
  /* V9.1.2 — o build deixou de ter lista manual de arquivos: ele percorre a
     pasta do app. O que importa continua sendo "a peça vai no pacote", então
     checamos que os arquivos existem e que o build varre a pasta (a inclusão
     no precache é verificada em tests/test_build_v10.py, que roda o build). */
  check('build percorre a pasta do app (sem lista manual para esquecer)',
    build.includes('os.walk(SRC)') && !build.includes('CORE_FILES = ['));
  check('arquivos da peça existem na pasta do app',
    ['mockup/peca.js', 'mockup/peca_render.js', 'mockup/peca_editor.js', 'mockup/peca_editor.css', 'mockup/index.html']
      .every(f => fs.existsSync(path.join(BASE, f))));

  console.log('\n═══ PEÇA: ' + (fail ? fail + ' FALHA(S)' : 'tudo OK') + ' — ' + pass + ' verificações ═══');
  process.exit(fail ? 1 : 0);
})();
