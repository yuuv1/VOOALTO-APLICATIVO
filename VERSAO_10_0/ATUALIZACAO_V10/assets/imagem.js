/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO — OTIMIZADOR DE IMAGENS (V10.5)
   --------------------------------------------------------------------------
   "Deu memória cheia" quase sempre é foto de celular: 12 MP viram 5–15 MB
   em base64, e esse peso se repete no autosave, em cada ficha salva, no
   backup e na nuvem. A solução é reduzir a imagem NA ENTRADA — antes de
   ela ser guardada em qualquer lugar:

     * lado maior limitado a 1600 px (a folha A4 tem 794 px; 1600 = impressão
       a ~200 dpi, sem diferença visível na ficha);
     * foto (sem transparência) vira JPEG qualidade 85 — e, se ainda passar
       do alvo (~700 KB), a qualidade/desce em degraus suaves até caber;
     * desenho com transparência tenta WebP com alfa (bem menor que PNG);
       sem WebP, PNG reduzido em degraus;
     * imagem já leve (≤ ~300 KB) passa INTOCADA — logo e ícone não perdem
       qualidade nenhuma; SVG e GIF também passam como estão;
     * se qualquer coisa falhar, devolve a imagem ORIGINAL. Otimizar nunca
       pode impedir o usuário de colocar a imagem.

   API:
     VooaltoImagem.otimizar(dataURL|File|Blob, opcoes?) -> Promise<dataURL>
     VooaltoImagem.otimizarArquivo(file)                -> Promise<dataURL>
     VooaltoImagem.otimizarEmObjeto(obj, opcoes?)       -> Promise<nº trocas>
       (anda pelo objeto — ficha/orçamento — e otimiza todo dataURL grande
        que achar; usado ao SALVAR, para encolher também o que já existia)
   ══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  var PADRAO = {
    maxDim: 1600,        // lado maior, em px
    alvoBytes: 700 * 1024,   // alvo do dataURL final (em caracteres ~ bytes)
    leveBytes: 300 * 1024,   // abaixo disto nem mexe (qualidade 100% intacta)
    qualidade: 0.85,
    minDim: 760          // nunca encolhe abaixo disto para caber no alvo
  };

  var cache = new Map(); // src -> dataURL otimizado (evita reencodar o mesmo)

  function hashRapido(texto) {
    var h = 5381;
    for (var i = 0; i < texto.length; i += 7) h = (Math.imul(h, 33) ^ texto.charCodeAt(i)) | 0;
    return texto.length + ':' + (h >>> 0).toString(36);
  }

  function lerComoDataURL(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var r = new raiz.FileReader();
        r.onload = function () { resolve(String(r.result || '')); };
        r.onerror = function () { reject(new Error('leitura falhou')); };
        r.readAsDataURL(blob);
      } catch (e) { reject(e); }
    });
  }

  /* Decodifica medindo a imagem; resolve {img,w,h,bitmap} ou null. */
  function decodificar(dataURL) {
    return new Promise(function (resolve) {
      var pronto = false;
      var timer = raiz.setTimeout(function () { fim(null); }, 5000);
      function fim(v) { if (pronto) return; pronto = true; raiz.clearTimeout(timer); resolve(v); }
      try {
        if (typeof raiz.createImageBitmap === 'function' && typeof raiz.Blob === 'function' && typeof raiz.fetch === 'function') {
          raiz.fetch(dataURL).then(function (r) { return r.blob(); }).then(function (blob) {
            return raiz.createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return raiz.createImageBitmap(blob); });
          }).then(function (bmp) {
            fim({ img: bmp, w: bmp.width || 0, h: bmp.height || 0, bitmap: true });
          }).catch(function () { viaImage(); });
          return;
        }
      } catch (e) {}
      viaImage();
      function viaImage() {
        try {
          var img = new raiz.Image();
          img.onload = function () { fim({ img: img, w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0, bitmap: false }); };
          img.onerror = function () { fim(null); };
          img.src = dataURL;
        } catch (e) { fim(null); }
      }
    });
  }

  function temTransparencia(ctx, w, h) {
    try {
      var dados = ctx.getImageData(0, 0, w, h).data;
      for (var i = 3; i < dados.length; i += 4 * 13) { // amostra a cada 13 px
        if (dados[i] < 250) return true;
      }
    } catch (e) {}
    return false;
  }

  function suportaWebP() {
    try {
      var cv = raiz.document.createElement('canvas');
      return (cv.toDataURL('image/webp') || '').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  }

  function otimizar(dataURL, opcoes) {
    var cfg = Object.assign({}, PADRAO, opcoes || {});
    if (!dataURL) return Promise.resolve(dataURL);

    return Promise.resolve()
      .then(function () {
        if (typeof dataURL !== 'string') return lerComoDataURL(dataURL); // File/Blob
        return dataURL;
      })
      .then(function (src) {
        if (!src || typeof src !== 'string' || src.indexOf('data:') !== 0) return src;
        if (/^data:image\/svg/i.test(src) || /^data:image\/gif/i.test(src)) return src; // vetor/animação: intocados
        if (src.length <= cfg.leveBytes) return src; // já é leve: qualidade intacta

        var chave = hashRapido(src) + '|' + cfg.maxDim + '|' + cfg.alvoBytes;
        if (cache.has(chave)) return cache.get(chave);

        return decodificar(src).then(function (dec) {
          if (!dec || !dec.w || !dec.h) { cache.set(chave, src); return src; }
          try {
            var escala = Math.min(1, cfg.maxDim / Math.max(dec.w, dec.h));
            var w = Math.max(1, Math.round(dec.w * escala));
            var h = Math.max(1, Math.round(dec.h * escala));

            var cv = raiz.document.createElement('canvas');
            cv.width = w; cv.height = h;
            var ctx = cv.getContext('2d');
            if (!ctx) { cache.set(chave, src); return src; }

            var comAlfa = temTransparencia((function () {
              // mede o alfa numa cópia pequena, sem custo na imagem cheia
              try {
                var mini = raiz.document.createElement('canvas');
                var mw = Math.min(256, w), mh = Math.max(1, Math.round(h * mw / w));
                mini.width = mw; mini.height = mh;
                var mctx = mini.getContext('2d');
                mctx.drawImage(dec.img, 0, 0, mw, mh);
                return mctx;
              } catch (e) { return ctx; }
            })(), Math.min(256, w), Math.max(1, Math.round(h * Math.min(256, w) / w)));

            var formato = comAlfa ? (suportaWebP() ? 'image/webp' : 'image/png') : 'image/jpeg';
            if (!comAlfa) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
            ctx.drawImage(dec.img, 0, 0, w, h);
            if (dec.bitmap && dec.img.close) { try { dec.img.close(); } catch (e) {} }

            var qualidades = formato === 'image/png' ? [1] : [cfg.qualidade, 0.8, 0.74, 0.68];
            var saida = null;
            for (var qi = 0; qi < qualidades.length; qi++) {
              saida = cv.toDataURL(formato, qualidades[qi]);
              if (saida.length <= cfg.alvoBytes) break;
            }
            /* Ainda pesada: desce a dimensão em degraus de 15% até o alvo
               (ou até o piso de minDim — daí aceita o menor que conseguiu). */
            var fator = 1;
            for (var t = 0; t < 6 && saida.length > cfg.alvoBytes; t++) {
              fator *= 0.85;
              var nw = Math.max(1, Math.round(w * fator));
              var nh = Math.max(1, Math.round(h * fator));
              if (Math.min(nw, nh) < cfg.minDim) break;
              cv.width = nw; cv.height = nh;
              if (!comAlfa) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, nw, nh); }
              ctx.drawImage(dec.img, 0, 0, nw, nh);
              saida = cv.toDataURL(formato, formato === 'image/png' ? undefined : 0.78);
            }

            var final = saida && saida.length < src.length ? saida : src;
            cache.set(chave, final);
            return final;
          } catch (e) {
            cache.set(chave, src);
            return src; // falhou: original, sempre
          }
        });
      })
      .catch(function () { return dataURL; });
  }

  function otimizarArquivo(arquivo, opcoes) {
    if (!arquivo) return Promise.resolve('');
    return lerComoDataURL(arquivo).then(function (src) { return otimizar(src, opcoes); });
  }

  /* Anda pelo objeto e otimiza todo dataURL de imagem acima do limite.
     Devolve quantas imagens foram trocadas. Mesma imagem repetida é
     otimizada uma vez só (cache por conteúdo). */
  function otimizarEmObjeto(alvo, opcoes) {
    var cfg = Object.assign({}, PADRAO, opcoes || {});
    var limite = cfg.limiteBytes || 250 * 1024;
    var vistos = new Set();
    var trocas = 0;
    var cadeia = Promise.resolve();

    function andar(no) {
      if (!no || typeof no !== 'object' || vistos.has(no)) return;
      vistos.add(no);
      Object.keys(no).forEach(function (k) {
        var v = no[k];
        if (typeof v === 'string') {
          if (v.indexOf('data:image/') === 0 && v.length > limite && !/^data:image\/(svg|gif)/i.test(v)) {
            cadeia = cadeia.then(function () {
              return otimizar(v, cfg).then(function (novo) {
                if (novo && novo !== v) { no[k] = novo; trocas++; }
              });
            });
          }
        } else if (v && typeof v === 'object') andar(v);
      });
    }
    andar(alvo);
    return cadeia.then(function () { return trocas; });
  }

  var api = {
    otimizar: otimizar,
    otimizarArquivo: otimizarArquivo,
    otimizarEmObjeto: otimizarEmObjeto,
    PADRAO: PADRAO,
    _cache: cache
  };

  raiz.VooaltoImagem = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
