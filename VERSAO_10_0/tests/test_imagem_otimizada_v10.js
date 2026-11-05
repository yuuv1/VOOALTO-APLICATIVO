'use strict';
/* ══ V10.5 — Toda imagem que entra é reduzida (sem perder qualidade visível) ═

   O "memória cheia" era foto de celular indo crua (5–15 MB) para o
   autosave, fichas salvas, backup e nuvem. Aqui provamos o otimizador:

   1. imagem leve passa INTOCADA (logo/ícone não perde qualidade);
   2. SVG e GIF passam como estão;
   3. foto grande é reduzida ao teto de 1600px e cai drasticamente de peso;
   4. imagem com transparência preserva o alfa (WebP/PNG, nunca JPEG);
   5. se a imagem não decodifica, volta a ORIGINAL (nunca bloqueia);
   6. otimizarEmObjeto encolhe as imagens grandes dentro de uma ficha
      (é o que destrava quem já tinha ficha pesada salva);
   7. a ficha delega ao otimizador (v7DownscaleDataURL) e os módulos
      carregam o assets/imagem.js; salvar ficha/orçamento otimiza o objeto.

   Canvas/Image são falsos e determinísticos: o "JPEG" falso pesa
   proporcional a pixels×qualidade, o "PNG" falso pesa muito mais — como
   no mundo real.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 160) : '')); }
};

function criarJanela() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;

  /* Imagem falsa: o dataURL carrega "DIM<larg>x<alt>|ALPHA" p/ sabermos o tamanho */
  let decodificacoes = 0;
  w.Image = class {
    set src(v) {
      this._src = v;
      const m = /DIM(\d+)x(\d+)/.exec(v || '');
      this.naturalWidth = m ? +m[1] : 100;
      this.naturalHeight = m ? +m[2] : 100;
      decodificacoes++;
      setTimeout(() => { if (!String(v).includes('QUEBRADA') && this.onload) this.onload(); else if (this.onerror) this.onerror(); }, 0);
    }
    get src() { return this._src; }
  };
  const criarCanvasFalso = () => {
    const cv = {
      width: 300, height: 150,
      getContext() {
        return {
          fillStyle: '', fillRect() {}, drawImage() {},
          getImageData(x, y, gw, gh) {
            const dados = new Uint8ClampedArray(gw * gh * 4).fill(255);
            if (String(cv._ultimaImg || '').includes('ALPHA')) { for (let i = 3; i < dados.length; i += 4) dados[i] = 0; }
            return { data: dados };
          },
        };
      },
      toDataURL(tipo, q) {
        const fator = tipo === 'image/png' ? 0.5 : tipo === 'image/webp' ? 0.06 : 0.08 * (q || 0.9);
        const tam = Math.max(80, Math.round(cv.width * cv.height * fator));
        return 'data:' + tipo + ';base64,DIM' + cv.width + 'x' + cv.height + '|' + 'x'.repeat(tam);
      },
    };
    return cv;
  };
  const createElementOriginal = w.document.createElement.bind(w.document);
  w.document.createElement = (tag, op) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const cv = criarCanvasFalso();
      const ctxDraw = cv.getContext.bind(cv);
      cv.getContext = () => { const c = ctxDraw(); const d = c.drawImage; c.drawImage = (img) => { cv._ultimaImg = img && img.src ? img.src : ''; return d && d(); }; return c; };
      return cv;
    }
    return createElementOriginal(tag, op);
  };
  w.eval(fs.readFileSync(path.join(BASE, 'assets', 'imagem.js'), 'utf8'));
  return { w, api: w.VooaltoImagem, decodificacoes: () => decodificacoes };
}

(async () => {
  console.log('═══ IMAGEM OTIMIZADA (V10.5) ═══');
  const { w, api } = criarJanela();
  ok('o otimizador carregou', !!api && typeof api.otimizar === 'function');

  const fotoGrande = 'data:image/jpeg;base64,DIM4000x3000|' + 'x'.repeat(1200000);
  const fotoResultado = await api.otimizar(fotoGrande);
  const dim = /DIM(\d+)x(\d+)/.exec(fotoResultado);
  ok('foto de 4000px é reduzida ao teto de 1600px', dim && +dim[1] <= 1600 && +dim[2] <= 1200, dim && dim.slice(1, 3));
  ok('o peso cai drasticamente (>80%)', fotoResultado.length < fotoGrande.length * 0.2, { antes: fotoGrande.length, depois: fotoResultado.length });
  ok('foto vira JPEG', fotoResultado.startsWith('data:image/jpeg'));

  const logoLeve = 'data:image/png;base64,DIM400x300|' + 'x'.repeat(5000);
  ok('imagem leve passa intacta (sem perda nenhuma)', await api.otimizar(logoLeve) === logoLeve);

  const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
  ok('SVG passa como está', await api.otimizar(svg) === svg);
  const gif = 'data:image/gif;base64,DIM2000x2000|' + 'x'.repeat(900000);
  ok('GIF passa como está', await api.otimizar(gif) === gif);

  const arteTransparente = 'data:image/png;base64,DIM3000x2000|ALPHA|' + 'x'.repeat(1200000);
  const arteResultado = await api.otimizar(arteTransparente);
  ok('arte com transparência NÃO vira JPEG (preserva o alfa)', arteResultado.startsWith('data:image/webp') || arteResultado.startsWith('data:image/png'), arteResultado.slice(0, 30));
  ok('arte com transparência também emagrece', arteResultado.length < arteTransparente.length, { antes: arteTransparente.length, depois: arteResultado.length });

  const quebrada = 'data:image/jpeg;base64,QUEBRADA|' + 'x'.repeat(900000);
  ok('imagem que não decodifica volta ORIGINAL', await api.otimizar(quebrada) === quebrada);

  /* otimizarEmObjeto: a ficha pesada que já existia */
  const fichaPesada = {
    _layers: [{ type: 'img', src: fotoGrande }, { type: 'txt', txt: 'oi' }],
    _paginas: [{ layers: [{ type: 'img', src: fotoGrande }, { type: 'img', src: logoLeve }] }],
  };
  const trocas = await api.otimizarEmObjeto(fichaPesada);
  ok('otimizarEmObjeto troca as imagens grandes da ficha', trocas === 2, trocas);
  ok('a imagem da página 1 ficou leve', fichaPesada._layers[0].src.length < fotoGrande.length * 0.2);
  ok('a mesma imagem repetida fica igual nas páginas (cache)', fichaPesada._layers[0].src === fichaPesada._paginas[0].layers[0].src);
  ok('a imagem leve dentro da ficha fica intacta', fichaPesada._paginas[0].layers[1].src === logoLeve);
  ok('o resto da ficha não é tocado', fichaPesada._layers[1].txt === 'oi');

  /* integração */
  const fichaHtml = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf8');
  const orcHtml = fs.readFileSync(path.join(BASE, 'criador_orcamento', 'index.html'), 'utf8');
  const mockupHtml = fs.readFileSync(path.join(BASE, 'mockup', 'index.html'), 'utf8');
  ok('a ficha carrega o assets/imagem.js', fichaHtml.includes('../assets/imagem.js'));
  ok('o orçamento carrega o assets/imagem.js', orcHtml.includes('../assets/imagem.js'));
  ok('o mockup carrega o assets/imagem.js', mockupHtml.includes('../assets/imagem.js'));
  ok('o v7DownscaleDataURL delega ao otimizador', fichaHtml.includes('VooaltoImagem.otimizar(dataURL'));
  ok('salvar a ficha otimiza as imagens do objeto', fichaHtml.includes('VooaltoImagem.otimizarEmObjeto(data)'));
  ok('abrir ficha antiga otimiza (e regrava leve)', fichaHtml.includes('VooaltoImagem.otimizarEmObjeto(data);if(trocas)'));
  ok('o recorte (crop) passa pelo otimizador', fichaHtml.includes('v7DownscaleDataURL(srcBruto)'));
  ok('salvar rascunho de orçamento otimiza o estado', orcHtml.includes('VooaltoImagem.otimizarEmObjeto(state)'));
  const sw = fs.readFileSync(path.join(BASE, 'sw.js'), 'utf8');
  ok('o service worker pré-carrega o imagem.js', sw.includes('assets/imagem.js'));

  w.close();
  console.log(`\n═══ IMAGEM OTIMIZADA: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
