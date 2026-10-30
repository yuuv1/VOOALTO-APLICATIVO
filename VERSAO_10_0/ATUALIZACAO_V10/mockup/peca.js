/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO V10.2 — MODELO DA PEÇA (camisa de pesca UV, frente e costas)

   A peça é VETOR. Cada "recorte" (painel) é uma área fechada com cor sólida;
   as costuras são desenhadas por cima e herdam a cor do painel. O resultado é
   nítido em qualquer zoom, a troca de cor é instantânea e a textura pode ser
   aplicada por painel (com escala e posição livres).

   Sistema de coordenadas: 1000 × 1240. A peça é simétrica em x = 500.
   Cada caminho é escrito uma vez (metade esquerda) e espelhado pelo código:
   assim a peça nunca fica torta e o painel da direita é idêntico ao da
   esquerda.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var EIXO = 500;

  /* ── caminho: utilidades ──────────────────────────────────────────────── */
  function d(cmds) {
    var out = [];
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c[0] === 'C') out.push('C' + c[1] + ' ' + c[2] + ' ' + c[3] + ' ' + c[4] + ' ' + c[5] + ' ' + c[6]);
      else if (c[0] === 'A') out.push('A' + c[1] + ' ' + c[2] + ' ' + c[3] + ' ' + c[4] + ' ' + c[5] + ' ' + c[6] + ' ' + c[7]);
      else if (c[0] === 'Q') out.push('Q' + c[1] + ' ' + c[2] + ' ' + c[3] + ' ' + c[4]);
      else if (c[0] === 'L') out.push('L' + c[1] + ' ' + c[2]);
      else out.push('M' + c[1] + ' ' + c[2]);
    }
    return out.join(' ');
  }

  function r3(n) { return Math.round(n * 1000) / 1000; }

  /* espelha em torno do eixo, mantendo o sentido do caminho */
  function espelhar(cmds) {
    return cmds.map(function (c) {
      var o = [c[0]];
      for (var i = 1; i < c.length; i++) o.push(i % 2 === 1 ? r3(2 * EIXO - c[i]) : c[i]);
      return o;
    });
  }

  /* inverte o sentido do caminho (para emendar a metade espelhada) */
  function inverter(cmds) {
    var segs = [], cur = null, i, c;
    for (i = 0; i < cmds.length; i++) {
      c = cmds[i];
      if (c[0] === 'C') { segs.push({ k: 'C', a: [c[1], c[2]], b: [c[3], c[4]], p: [c[5], c[6]], de: cur }); cur = [c[5], c[6]]; }
      else if (c[0] === 'Q') { segs.push({ k: 'Q', a: [c[1], c[2]], p: [c[3], c[4]], de: cur }); cur = [c[3], c[4]]; }
      else if (c[0] === 'L') { segs.push({ k: 'L', p: [c[1], c[2]], de: cur }); cur = [c[1], c[2]]; }
      else { segs.push({ k: 'M', p: [c[1], c[2]] }); cur = [c[1], c[2]]; }
    }
    var out = [];
    for (i = segs.length - 1; i >= 0; i--) {
      var s = segs[i];
      if (s.k === 'M') continue;
      /* o caminho invertido começa ONDE o original termina */
      if (!out.length) out.push(['M', r3(s.p[0]), r3(s.p[1])]);
      var de = s.de || [EIXO, 0];
      if (s.k === 'C') out.push(['C', r3(s.b[0]), r3(s.b[1]), r3(s.a[0]), r3(s.a[1]), r3(de[0]), r3(de[1])]);
      else if (s.k === 'Q') out.push(['Q', r3(s.a[0]), r3(s.a[1]), r3(de[0]), r3(de[1])]);
      else out.push(['L', r3(de[0]), r3(de[1])]);
    }
    return out;
  }

  /* metade (começa e termina no eixo) → peça inteira simétrica */
  function inteira(meia) {
    /* sem "Z": o fechamento automático do preenchimento é suficiente e, ao
       traçar o contorno, não aparece uma linha atravessando a peça */
    return d(meia) + ' ' + d(inverter(espelhar(meia)));
  }

  /* ── GEOMETRIA ────────────────────────────────────────────────────────────
     Desenho técnico da peça aberta (flat), vista de frente e de costas —
     é o jeito que não deixa dúvida: corpo no meio, mangas abertas dos lados e
     um vão de fundo entre a manga e a lateral do corpo embaixo da axila.

     metade esquerda, viewBox 1000 × 1240:
        pescoço ......... (420,180)    ponta do ombro ... (250,215)
        axila ........... (330,470)    cintura .......... (312,800)
        barra ........... (296,1118)   centro da barra .. (500,1136)
        cotovelo ........ (176,610)    punho ............ (128,884) → (252,930)
     A costura raglã (pescoço → axila) é compartilhada por corpo e manga; a
     borda de dentro da manga e a lateral do corpo se encontram só na axila.
     ──────────────────────────────────────────────────────────────────────── */
  var RAGLA = [['C', 372, 268, 344, 392, 330, 470]];
  function raglanVolta() { return [['C', 344, 392, 372, 268, 420, 180]]; }

  var LATERAL = [
    ['C', 322, 560, 316, 660, 312, 800],
    ['C', 308, 960, 300, 1060, 296, 1118]
  ];

  var CORPO = [['M', 500, 238], ['C', 470, 226, 444, 204, 420, 180]]
    .concat(RAGLA).concat(LATERAL).concat([
      ['C', 360, 1130, 430, 1136, 500, 1136]
    ]);

  var MANGA = [
    ['M', 420, 180],
    ['C', 372, 158, 288, 176, 250, 215],       /* ombro */
    ['C', 216, 350, 190, 700, 128, 884],       /* borda externa (cotovelo → punho) */
    ['L', 252, 930],                            /* abertura do punho */
    ['C', 274, 780, 310, 600, 330, 470]        /* borda de dentro (axila) */
  ].concat(raglanVolta());

  /* punho: faixa no fim da manga, acompanhando a direção do braço */
  var PUNHO = [
    ['M', 128, 884],
    ['L', 252, 930],
    ['L', 236, 978],
    ['L', 112, 932]
  ];

  /* recorte lateral: faixa entre a lateral do corpo e uma costura paralela */
  var RECORTE = [
    ['M', 330, 470]
  ].concat(LATERAL).concat([
    ['L', 384, 1122],
    ['C', 388, 1040, 392, 900, 392, 800],
    ['C', 392, 660, 386, 560, 352, 486],
    ['C', 344, 476, 336, 472, 330, 470]
  ]);

  /* recorte da manga: faixa que acompanha o braço */
  var MANGA_RECORTE = [
    ['M', 330, 470],
    ['C', 310, 600, 274, 780, 252, 930],
    ['L', 300, 952],
    ['C', 316, 800, 344, 640, 372, 512],
    ['C', 372, 494, 356, 476, 330, 470]
  ];

  /* pala das costas (yoke) */
  var PALA = [
    ['M', 500, 242],
    ['C', 470, 230, 444, 204, 420, 180]
  ].concat(RAGLA).concat([
    ['C', 352, 508, 392, 540, 432, 546],
    ['C', 456, 550, 478, 552, 500, 552]
  ]);

  /* contorno externo (traço e sombra) */
  var SILHUETA_MEIO = [
    ['M', 420, 180],
    ['C', 372, 158, 288, 176, 250, 215],
    ['C', 216, 350, 190, 700, 128, 884],
    ['L', 112, 932],
    ['L', 236, 978],
    ['C', 266, 1050, 290, 1100, 296, 1118],
    ['C', 360, 1130, 430, 1136, 500, 1136]
  ];

  /* gola alta (anel) + vão escuro do pescoço */
  var GOLA = { cx: 500, cy: 182, rx: 92, ry: 54, esp: 22 };
  var FURO = { cx: 500, cy: 188, rx: 70, ry: 36 };

  /* zíper quarto (estrutura da peça, não é arte do usuário) */
  var ZIP = { x: 500, y1: 234, y2: 356, w: 11 };

  function anel(cx, cy, rx, ry, esp) {
    var ix = rx - esp, iy = ry - esp;
    return d([
      ['M', cx - rx, cy],
      ['A', rx, ry, 0, 1, 0, cx + rx, cy],
      ['A', rx, ry, 0, 1, 0, cx - rx, cy],
      ['M', cx - ix, cy],
      ['A', ix, iy, 0, 1, 1, cx + ix, cy],
      ['A', ix, iy, 0, 1, 1, cx - ix, cy]
    ]) + ' Z';
  }

  /* ── modelo ───────────────────────────────────────────────────────────── */
  var CORES = {
    interior: '#0A1F2E',
    corpo:    '#2E7BB4',
    mangas:   '#1A537E',
    recorte:  '#7FC8EC',
    gola:     '#123E60',
    punho:    '#7FC8EC'
  };

  /* aparência da costura: a cor vem SEMPRE do painel (clone escurecido) */
  var COSTURA = { espessura: 2.4, tracejado: '8 6', opacidade: 0.55 };

  /* elementos fixos da peça (não são arte): zíper da frente */
  function estrutura(lado) {
    if (lado !== 'frente') return [];
    var x = ZIP.x, w = ZIP.w / 2;
    return [
      { tipo: 'flap', d: 'M' + (x - w - 9) + ' ' + ZIP.y1 + ' L' + (x - w - 9) + ' ' + ZIP.y2 +
        ' Q' + (x - w - 9) + ' ' + (ZIP.y2 + 8) + ' ' + (x - w) + ' ' + (ZIP.y2 + 8) +
        ' L' + (x + w) + ' ' + (ZIP.y2 + 8) + ' Q' + (x + w + 9) + ' ' + (ZIP.y2 + 8) + ' ' + (x + w + 9) + ' ' + ZIP.y2 +
        ' L' + (x + w + 9) + ' ' + ZIP.y1 + ' Z', cor: 'rgba(8,32,52,.55)' },
      { tipo: 'fita', d: 'M' + (x - w) + ' ' + ZIP.y1 + ' L' + (x - w) + ' ' + ZIP.y2 +
        ' Q' + (x - w) + ' ' + (ZIP.y2 + 6) + ' ' + (x - w + 4) + ' ' + (ZIP.y2 + 6) +
        ' L' + (x + w - 4) + ' ' + (ZIP.y2 + 6) + ' Q' + (x + w) + ' ' + (ZIP.y2 + 6) + ' ' + (x + w) + ' ' + ZIP.y2 +
        ' L' + (x + w) + ' ' + ZIP.y1 + ' Z', cor: 'rgba(6,24,40,.85)' },
      { tipo: 'dentes', d: 'M' + x + ' ' + (ZIP.y1 + 6) + ' L' + x + ' ' + (ZIP.y2 + 2),
        cor: 'rgba(190,205,215,.55)', largura: 3.4, tracejado: '2 4', semOpacidade: true },
      { tipo: 'puxador', d: 'M' + (x - 5) + ' ' + (ZIP.y2 + 4) + ' h10 v16 a5 5 0 0 1 -10 0 Z', cor: 'rgba(205,212,218,.95)' }
    ];
  }

  function paineis(lado) {
    var lista = [
      { id: 'corpo', nome: 'Corpo', cor: 'corpo', d: inteira(CORPO) },
      { id: 'recorte_e', nome: 'Recorte lateral (esq.)', cor: 'recorte', d: d(RECORTE) },
      { id: 'recorte_d', nome: 'Recorte lateral (dir.)', cor: 'recorte', d: d(espelhar(RECORTE)) },
      { id: 'manga_e', nome: 'Manga esquerda', cor: 'mangas', d: d(MANGA) },
      { id: 'manga_d', nome: 'Manga direita', cor: 'mangas', d: d(espelhar(MANGA)) },
      { id: 'mrecorte_e', nome: 'Recorte da manga (esq.)', cor: 'recorte', d: d(MANGA_RECORTE) },
      { id: 'mrecorte_d', nome: 'Recorte da manga (dir.)', cor: 'recorte', d: d(espelhar(MANGA_RECORTE)) },
      { id: 'punho_e', nome: 'Punho esquerdo', cor: 'punho', d: d(PUNHO) },
      { id: 'punho_d', nome: 'Punho direito', cor: 'punho', d: d(espelhar(PUNHO)) }
    ];
    if (lado === 'costas') {
      lista.push({ id: 'pala', nome: 'Pala das costas', cor: 'corpo', d: inteira(PALA) });
    }
    /* a gola fica por cima de tudo */
    lista.push({
      id: 'gola', nome: 'Gola', cor: 'gola', fillRule: 'evenodd',
      d: anel(GOLA.cx, GOLA.cy, GOLA.rx, GOLA.ry, GOLA.esp)
    });
    return lista;
  }

  /* ── COSTURAS ─────────────────────────────────────────────────────────────
     Antes cada painel era tracejado pelo CONTORNO INTEIRO: a peça ficava com
     tracejado em cima da silhueta (parecia corte de papel) e as linhas se
     cruzavam na axila. Agora só entram as costuras de verdade, cada uma com o
     painel de quem ela é — a cor sai daí, nunca de um cinza fixo:

       raglã   — do pescoço à axila (frente e costas)
       recorte — a curva de dentro, onde o recorte encontra o corpo
       lateral — a costura do lado, 4 px para dentro da silhueta
       manga   — a borda de dentro, onde o braço separa do corpo
       punho   — a emenda da faixa do punho
       gola    — a base da gola
       pala    — só nas costas (o yoke)
     ──────────────────────────────────────────────────────────────────────── */
  var RECORTE_SEAM = [['M', 392, 810], ['C', 392, 660, 386, 560, 352, 486]];
  /* (a costura do lado não é tracejada: o painel do recorte é desenhado por
     cima dela, então o tracejado caía no MEIO da faixa clara — ficava com
     duas linhas paralelas dentro do recorte) */
  /* borda de dentro da manga: é ela que passa POR CIMA do corpo (a manga é
     desenhada depois) — a emenda do braço e a sombra que separa os panos */
  var MANGA_SEAM = [['M', 330, 470], ['C', 310, 600, 274, 780, 252, 930]];

  /* sombras de volume: onde um pano cobre o outro a peça precisa de sombra,
     senão a manga parece colada no corpo (foi o que deixou a peça "chapada") */
  function sombras(lado) {
    var lista = [
      { d: d(MANGA_SEAM), dx: 7, dy: 0 },
      { d: d(espelhar(MANGA_SEAM)), dx: -7, dy: 0 },
      { d: d([['M', 420, 180]].concat(RAGLA)), dx: 4, dy: 3, leve: 1 },
      { d: d(espelhar([['M', 420, 180]].concat(RAGLA))), dx: -4, dy: 3, leve: 1 }
    ];
    return lista;
  }

  function costuras(lado, cores) {
    var cot = cores || CORES;
    /* `painel` é de quem a costura é; `zona` é a chave da COR (o painel
       'recorte_e' bebe da cor 'recorte'). Sem essa distinção a costura caía no
       cinza padrão e não acompanhava o recorte — era o defeito a corrigir. */
    var lista = [
      { painel: 'corpo',     zona: 'corpo',   d: d([['M', 420, 180]].concat(RAGLA)) },
      { painel: 'corpo',     zona: 'corpo',   d: d(espelhar([['M', 420, 180]].concat(RAGLA))) },
      { painel: 'recorte_e', zona: 'recorte', d: d(RECORTE_SEAM) },
      { painel: 'recorte_d', zona: 'recorte', d: d(espelhar(RECORTE_SEAM)) },
      { painel: 'manga_e',   zona: 'mangas',  d: d(MANGA_SEAM) },
      { painel: 'manga_d',   zona: 'mangas',  d: d(espelhar(MANGA_SEAM)) },
      { painel: 'punho_e',   zona: 'punho',   d: 'M128 884 L252 930' },
      { painel: 'punho_d',   zona: 'punho',   d: 'M872 884 L748 930' },
      { painel: 'gola',      zona: 'gola',    d: anel(GOLA.cx, GOLA.cy, GOLA.rx, GOLA.ry, GOLA.esp) }
    ];
    if (lado === 'costas') lista.push({ painel: 'pala', zona: 'corpo', d: d(PALA) + ' ' + d(inverter(espelhar(PALA))) });
    return lista;
  }

  /* silhueta para a sombra de contato (a peça não pode parecer flutuando) */
  function silhueta() { return inteira(SILHUETA_MEIO); }   /* mesma frente e costas */

  /* silhueta FECHADA: a de cima é só para traçar o contorno (sem "Z", senão
     aparece uma linha atravessando a peça). Para recortar a arte, porém, o
     contorno precisa estar fechado de verdade — com as duas metades abertas o
     navegador fecha cada uma com uma reta e o recorte sai errado (a arte
     vazava para fora da manga). Aqui a última metade volta ao ponto inicial. */
  function silhuetaFechada() {
    var p0 = SILHUETA_MEIO[0];
    return silhueta() + ' L' + p0[1] + ' ' + p0[2] + ' Z';
  }

  /* zonas pintáveis: o que o usuário escolhe no "Onde aplicar" */
  var ZONAS = [
    { id: 'corpo', nome: 'Corpo', paineis: ['corpo'] },
    { id: 'mangas', nome: 'Mangas', paineis: ['manga_e', 'manga_d'] },
    { id: 'recorte', nome: 'Recortes', paineis: ['recorte_e', 'recorte_d', 'mrecorte_e', 'mrecorte_d'] },
    { id: 'gola', nome: 'Gola', paineis: ['gola'] },
    { id: 'punho', nome: 'Punhos', paineis: ['punho_e', 'punho_d'] }
  ];

  global.Peca = {
    VB: { w: 1000, h: 1240 },
    EIXO: EIXO,
    CORES: CORES,
    COSTURA: COSTURA,
    ZONAS: ZONAS,
    furo: function () { return { cx: FURO.cx, cy: FURO.cy, rx: FURO.rx, ry: FURO.ry }; },
    paineis: paineis,
    costuras: costuras,
    sombras: sombras,
    estrutura: estrutura,
    silhueta: silhueta,
    silhuetaFechada: silhuetaFechada,
    ZIP: ZIP
  };
})(typeof window !== 'undefined' ? window : globalThis);
