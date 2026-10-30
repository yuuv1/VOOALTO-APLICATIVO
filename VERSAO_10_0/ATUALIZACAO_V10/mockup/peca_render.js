/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO V10.2 — RENDERIZADOR DA PEÇA

   Recebe um ESTADO e devolve o SVG (string) da peça pronta. O mesmo desenho é
   usado em três lugares: a tela do editor, a camada da ficha técnica e o PNG
   que sai na impressão — por isso ele é uma função pura.

   ESTADO
     lado: 'frente' | 'costas'
     cores: { corpo, mangas, recorte, gola, punho }
     acabamento: 'dryfit' | 'algodao'
     texturas: { <zona>: { src, modo:'repetir'|'esticar', ex, ey, rot, ox, oy, opac } }
     artes: [ { id, src, x, y, w, rot, opac, zona } ]   (x,y,w em unidades do viewBox)
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var P = global.Peca;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* escurece uma cor #rrggbb (as costuras são um tom mais escuro do painel) */
  function escurecer(hex, f) {
    if (!hex || hex.charAt(0) !== '#' || hex.length !== 7) return hex || '#333';
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f),
        g = Math.round(((n >> 8) & 255) * f),
        b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* clareia em direção ao branco (realce do dry fit) */
  function clarear(hex, f) {
    if (!hex || hex.charAt(0) !== '#' || hex.length !== 7) return hex || '#fff';
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * f),
        g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * f),
        b = Math.round((n & 255) + (255 - (n & 255)) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function estadoPadrao() {
    return {
      lado: 'frente',
      cores: Object.assign({}, P.CORES),
      acabamento: 'dryfit',
      texturas: {},
      artes: []
    };
  }

  function normalizar(est) {
    var e = estadoPadrao();
    if (!est) return e;
    e.lado = est.lado === 'costas' ? 'costas' : 'frente';
    e.cores = Object.assign({}, P.CORES, est.cores || {});
    e.acabamento = est.acabamento === 'algodao' ? 'algodao' : 'dryfit';
    e.texturas = est.texturas || {};
    e.artes = Array.isArray(est.artes) ? est.artes : [];
    return e;
  }

  /* ── ângulo local do tecido ───────────────────────────────────────────────
     Cada zona tem uma inclinação (as mangas caem em diagonal, os recortes
     laterais acompanham a cintura). Quando a arte é arrastada, o ângulo é
     interpolado pela posição: a imagem "deita" junto com a peça em vez de
     ficar sempre em pé. */
  var ANCORAS_ANGULO = [
    { x: 500, y: 300, a: 0 },      /* peito/centro: em pé */
    { x: 500, y: 900, a: 0 },      /* barriga: em pé */
    { x: 250, y: 600, a: -13 },    /* lateral esquerda */
    { x: 750, y: 600, a: 13 },     /* lateral direita */
    { x: 200, y: 800, a: -22 },    /* manga esquerda */
    { x: 800, y: 800, a: 22 },     /* manga direita */
    { x: 500, y: 190, a: 0 }       /* gola */
  ];

  function anguloEm(x, y) {
    var soma = 0, pesoTotal = 0;
    for (var i = 0; i < ANCORAS_ANGULO.length; i++) {
      var an = ANCORAS_ANGULO[i];
      var dx = (x - an.x) / 320, dy = (y - an.y) / 460;
      var d2 = dx * dx + dy * dy;
      var w = 1 / (0.12 + d2);
      soma += an.a * w; pesoTotal += w;
    }
    return pesoTotal ? soma / pesoTotal : 0;
  }

  /* ── textura por zona ─────────────────────────────────────────────────── */
  function defsTexturas(est, lado, ids) {
    var defs = [];
    Object.keys(est.texturas || {}).forEach(function (zona) {
      var t = est.texturas[zona];
      if (!t || !t.src) return;
      var id = 'tex_' + ids + '_' + zona.replace(/[^a-z0-9]/gi, '');
      if (t.modo === 'esticar') {
        /* uma imagem só, esticada por cima do painel (como no Photoshop quando
           se puxa a alça e a textura acompanha o formato) */
        defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" x="0" y="0" width="' + P.VB.w + '" height="' + P.VB.h + '">' +
          '<image href="' + esc(t.src) + '" x="0" y="0" width="' + P.VB.w + '" height="' + P.VB.h + '" preserveAspectRatio="none"/></pattern>');
      } else {
        var ex = Math.max(8, (t.ex || 1) * 260), ey = Math.max(8, (t.ey || 1) * 260);
        var tr = 'translate(' + (t.ox || 0) + ' ' + (t.oy || 0) + ') rotate(' + (t.rot || 0) + ')';
        defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + ex + '" height="' + ey + '" patternTransform="' + tr + '">' +
          '<image href="' + esc(t.src) + '" x="0" y="0" width="' + ex + '" height="' + ey + '" preserveAspectRatio="none"/></pattern>');
      }
    });
    return defs.join('');
  }

  function texturaDaZona(est, zona, ids) {
    var t = est.texturas && est.texturas[zona];
    if (!t || !t.src) return null;
    return { fill: 'url(#tex_' + ids + '_' + zona.replace(/[^a-z0-9]/gi, '') + ')', opac: t.opac === undefined ? 0.85 : t.opac };
  }

  /* zona (cor) → textura */
  function zonaDaCor(cor) {
    return cor === 'corpo' ? 'corpo' : cor === 'mangas' ? 'mangas' : cor === 'recorte' ? 'recorte' : cor === 'gola' ? 'gola' : 'punho';
  }

  /* ── desenho ──────────────────────────────────────────────────────────── */
  function svg(ladoOuEstado, opcoes) {
    var est = typeof ladoOuEstado === 'string' ? { lado: ladoOuEstado } : (ladoOuEstado || {});
    est = normalizar(est);
    var lado = est.lado;
    var ids = (opcoes && opcoes.id) || 'p';
    var semCostura = opcoes && opcoes.semCostura;
    var semArte = opcoes && opcoes.semArte;
    var cores = est.cores;

    var lista = P.paineis(lado);
    var defs = [];

    /* brilho do dry fit e granulado do algodão (bem sutis, como pedido) */
    defs.push('<linearGradient id="sheen_' + ids + '" x1="0" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>' +
      '<stop offset="0.42" stop-color="#ffffff" stop-opacity="0.05"/>' +
      '<stop offset="0.72" stop-color="#000000" stop-opacity="0.10"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0.18"/></linearGradient>');
    defs.push('<radialGradient id="fold_' + ids + '" cx="0.5" cy="0.42" r="0.62">' +
      '<stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000000" stop-opacity="0.16"/></radialGradient>');

    /* volume da manga: escuro nas duas bordas e claro no meio, como um tubo de
       tecido. Sem isso a manga é um retângulo chapado e a peça parece de papel. */
    defs.push('<linearGradient id="sleeve_' + ids + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#000" stop-opacity="0.20"/>' +
      '<stop offset="0.30" stop-color="#fff" stop-opacity="0.07"/>' +
      '<stop offset="0.55" stop-color="#fff" stop-opacity="0.03"/>' +
      '<stop offset="0.82" stop-color="#000" stop-opacity="0.10"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>');

    defs.push(defsTexturas(est, lado, ids));
    /* a arte não pode sair da peça: recorte pela silhueta */
    defs.push('<clipPath id="clip_' + ids + '"><path d="' + (P.silhuetaFechada ? P.silhuetaFechada(lado) : P.silhueta(lado)) + '"/></clipPath>');

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + P.VB.w + ' ' + P.VB.h + '" ' +
      'width="' + (opcoes && opcoes.largura ? opcoes.largura : P.VB.w) + '" ' +
      'height="' + (opcoes && opcoes.largura ? Math.round(opcoes.largura * P.VB.h / P.VB.w) : P.VB.h) + '" ' +
      'preserveAspectRatio="xMidYMid meet">');
    out.push('<defs>' + defs.join('') + '</defs>');

    /* sombra suave embaixo da peça (não é arte, é acabamento) */
    out.push('<ellipse cx="500" cy="1178" rx="300" ry="20" fill="#000" opacity="0.22"/>');

    /* dentro da gola (fundo escuro): é o vão do pescoço, não é arte */
    var furo = P.furo();
    out.push('<ellipse cx="' + furo.cx + '" cy="' + furo.cy + '" rx="' + furo.rx + '" ry="' + furo.ry + '" fill="' + (cores.interior || '#0A1F2E') + '"/>');

    /* painéis com cor sólida (+ textura quando houver) */
    lista.forEach(function (p) {
      var cor = cores[p.cor] || '#888';
      out.push('<path d="' + p.d + '" fill="' + cor + '"' + (p.fillRule ? ' fill-rule="' + p.fillRule + '"' : '') + '/>');
      var tex = texturaDaZona(est, zonaDaCor(p.cor), ids);
      if (tex) {
        /* multiply: a textura escurece/tinge o recorte sem apagar a cor dele
           (com opacity pura, textura clara deixava a peça pastel) */
        out.push('<path d="' + p.d + '" fill="' + tex.fill + '" opacity="' + tex.opac + '" style="mix-blend-mode:multiply"' +
          (p.fillRule ? ' fill-rule="' + p.fillRule + '"' : '') + '/>');
      }
    });

    /* sombra de sobreposição: a manga cobre o corpo, então a emenda do braço
       ganha uma sombra difusa (três traços de larguras diferentes fazem o
       papel de um desfoque — funciona igual em qualquer navegador e no resvg,
       sem depender de filtro) */
    if (typeof P.sombras === 'function') {
      var silhuetaClipe = P.silhueta(lado);
      out.push('<g clip-path="url(#clip_' + ids + ')" style="pointer-events:none">');
      P.sombras(lado).forEach(function (s) {
        var base = s.leve ? [0.03, 0.05, 0.06] : [0.05, 0.08, 0.10];
        var larg = s.leve ? [16, 10, 5] : [22, 14, 8];
        for (var k = 0; k < 3; k++) {
          out.push('<path d="' + s.d + '" fill="none" stroke="#000" stroke-width="' + larg[k] +
            '" stroke-linecap="round" opacity="' + base[k] +
            '" transform="translate(' + (s.dx || 0) + ' ' + (s.dy || 0) + ')"/>');
        }
      });
      out.push('</g>');
    }

    /* volume das mangas (por cima da cor, embaixo da sombra de sobreposição) */
    lista.forEach(function (p) {
      if (p.cor !== 'mangas') return;
      out.push('<path d="' + p.d + '" fill="url(#sleeve_' + ids + ')" opacity="0.55"/>');
    });

    /* brilho/opacidade do tecido por cima das cores */
    var silhueta = P.silhueta(lado);
    if (est.acabamento === 'dryfit') {
      out.push('<path d="' + silhueta + '" fill="url(#sheen_' + ids + ')" opacity="0.55"/>');
      out.push('<path d="' + silhueta + '" fill="url(#fold_' + ids + ')" opacity="0.5"/>');
    } else {
      /* algodão: fosco — só um leve escurecimento nas bordas */
      out.push('<path d="' + silhueta + '" fill="url(#fold_' + ids + ')" opacity="0.55"/>');
    }

    /* artes do usuário: presas à peça, giradas pelo ângulo local do tecido */
    if (!semArte) {
      est.artes.forEach(function (a, i) {
        if (!a || !a.src) return;
        var w = a.w || 320;
        var h = a.h || w;
        var ang = (a.rot === undefined || a.rot === null) ? anguloEm(a.x, a.y) : a.rot;
        out.push('<g clip-path="url(#clip_' + ids + ')">' +
          '<g transform="translate(' + a.x + ' ' + a.y + ') rotate(' + ang.toFixed(2) + ') scale(' + ((a.flip ? -1 : 1)) + ' 1)" opacity="' + (a.opac === undefined ? 1 : a.opac) + '">' +
          '<image href="' + esc(a.src) + '" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
          '" preserveAspectRatio="none" data-arte="' + esc(a.id || i) + '"/></g></g>');
      });
    }

    /* costuras — a cor é SEMPRE a do painel, um tom mais escuro (pedido:
       a costura acompanha a cor do recorte) */
    if (!semCostura) {
      P.costuras(lado).forEach(function (c) {
        var cor = escurecer(cores[c.zona || c.painel] || '#334', 0.5);
        out.push('<path d="' + c.d + '" fill="none" stroke="' + cor + '" stroke-width="' + P.COSTURA.espessura +
          '" stroke-dasharray="' + P.COSTURA.tracejado + '" stroke-linecap="round" opacity="' + P.COSTURA.opacidade + '"/>');
      });
    }

    /* zíper e outros elementos fixos */
    P.estrutura(lado).forEach(function (e) {
      if (e.tipo === 'dentes') {
        out.push('<path d="' + e.d + '" fill="none" stroke="' + e.cor + '" stroke-width="' + e.largura + '" stroke-dasharray="' + e.tracejado + '"/>');
      } else {
        out.push('<path d="' + e.d + '" fill="' + e.cor + '"/>');
      }
    });

    /* contorno da peça por último: fecha a silhueta contra o fundo */
    out.push('<path d="' + silhueta + '" fill="none" stroke="' + escurecer(cores.corpo || '#333', 0.55) +
      '" stroke-width="2.6" opacity="0.75"/>');

    out.push('</svg>');
    return out.join('');
  }

  /* rasteriza o SVG em PNG (para a camada da ficha, o .json e a impressão) */
  function paraPNG(est, largura) {
    return new Promise(function (resolve, reject) {
      try {
        var markup = svg(est, { largura: largura || 1400, id: 'png' });
        var blob = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas');
            c.width = largura || 1400;
            c.height = Math.round(c.width * P.VB.h / P.VB.w);
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/png'));
          } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('não foi possível desenhar a peça')); };
        img.src = blob;
      } catch (e) { reject(e); }
    });
  }

  global.PecaRender = {
    svg: svg,
    paraPNG: paraPNG,
    estadoPadrao: estadoPadrao,
    normalizar: normalizar,
    anguloEm: anguloEm,
    escurecer: escurecer,
    clarear: clarear
  };
})(typeof window !== 'undefined' ? window : globalThis);
