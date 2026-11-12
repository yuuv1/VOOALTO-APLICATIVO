/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO V10.2 — ESTÚDIO DA PEÇA

   Monta a peça (frente e costas), pinta os recortes com cor sólida, aplica
   textura por recorte (com escala, giro e posição) e recebe as artes por
   arrastar-e-soltar. Cada arte fica PRESA à peça: ao arrastar, ela acompanha o
   ângulo do tecido naquele ponto (peito em pé, manga inclinada).

   Sem templates, sem pintura à mão livre: cor sólida + textura + imagem.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ZONAS = [
    { id: 'corpo', nome: 'Corpo', desc: 'peito e costas' },
    { id: 'mangas', nome: 'Mangas', desc: 'os dois braços' },
    { id: 'recorte', nome: 'Recortes', desc: 'lateral e manga' },
    { id: 'gola', nome: 'Gola', desc: 'gola alta' },
    { id: 'punho', nome: 'Punhos', desc: 'fim das mangas' }
  ];

  var PALETAS = [
    ['#0B0B0D', '#1F2937', '#4B5563', '#9CA3AF', '#F3F4F6'],
    ['#7C1D1D', '#C2410C', '#F59E0B', '#FDE68A', '#FFFFFF'],
    ['#064E3B', '#15803D', '#22C55E', '#7DD3A0', '#ECFDF5'],
    ['#0C2E4A', '#155E75', '#0EA5E9', '#7DD3FC', '#E0F2FE'],
    ['#3B0764', '#6D28D9', '#8B5CF6', '#C4B5FD', '#EDE9FE']
  ];

  var CORES_NOME = {
    corpo: 'Corpo', mangas: 'Mangas', recorte: 'Recortes', gola: 'Gola', punho: 'Punhos', interior: 'Dentro da gola'
  };

  var state = null;          /* estado da peça (frente e costas) */
  var ladoAtual = 'frente';
  var zonaSel = 'corpo';
  var arteSel = null;
  var root = null;
  var refs = {};
  var onChange = null;
  var historico = [], futuro = [], ultimoEstado = '';
  var rendendo = false;
  var geracao = 0;

  function atualizarHistorico() {
    if (refs.desfazer) refs.desfazer.disabled = !historico.length;
    if (refs.refazer) refs.refazer.disabled = !futuro.length;
  }

  function navegarHistorico(origem, destino) {
    if (!origem.length) return;
    destino.push(JSON.stringify(estado()));
    if (destino.length > 40) destino.shift();
    state = JSON.parse(origem.pop());
    ultimoEstado = JSON.stringify(estado());
    if (!arteAtual()) arteSel = null;
    desenharTudo();
    atualizarHistorico();
    if (typeof onChange === 'function') { try { onChange(estado()); } catch (e) {} }
  }

  function registrarAntes(snapshot) {
    if (snapshot === JSON.stringify(estado())) return;
    if (snapshot) { historico.push(snapshot); if (historico.length > 40) historico.shift(); }
    ultimoEstado = JSON.stringify(estado());
    futuro = [];
    atualizarHistorico();
    if (typeof onChange === 'function') { try { onChange(estado()); } catch (e) {} }
  }

  function desfazer() { navegarHistorico(historico, futuro); }
  function refazer() { navegarHistorico(futuro, historico); }

  /* ── utilidades ───────────────────────────────────────────────────────── */
  function h(tag, attrs, filhos) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) {
      if (f == null) return;
      el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    });
    return el;
  }
  function $(sel, dentro) { return (dentro || root || document).querySelector(sel); }
  function fmt(n) { return Math.round(n * 10) / 10; }

  var toastTimer = null;
  function toast(msg, tipo) {
    var el = refs.toast;
    if (!el) return;
    el.textContent = msg;
    el.className = 'pk-toast pk-on' + (tipo ? ' pk-' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'pk-toast' + (tipo ? ' pk-' + tipo : ''); }, 2600);
  }

  function avisar() {
    var atual = JSON.stringify(estado());
    if (atual === ultimoEstado) return;
    if (ultimoEstado) {
      historico.push(ultimoEstado);
      if (historico.length > 40) historico.shift();
    }
    ultimoEstado = atual;
    futuro = [];
    atualizarHistorico();
    if (typeof onChange === 'function') { try { onChange(estado()); } catch (e) {} }
  }

  /* ── estado ──────────────────────────────────────────────────────────── */
  function estado() {
    return {
      frente: JSON.parse(JSON.stringify(state.frente)),
      costas: JSON.parse(JSON.stringify(state.costas)),
      acabamento: state.acabamento
    };
  }

  function novoLado() {
    return { cores: Object.assign({}, global.Peca.CORES), texturas: {}, artes: [] };
  }

  function carregar(est) {
    geracao++;
    state = { frente: novoLado(), costas: novoLado(), acabamento: 'dryfit' };
    if (est) {
      if (est.acabamento === 'algodao') state.acabamento = 'algodao';
      ['frente', 'costas'].forEach(function (lado) {
        var src = est[lado] || {};
        if (src.cores) state[lado].cores = Object.assign({}, global.Peca.CORES, src.cores);
        if (src.texturas) state[lado].texturas = JSON.parse(JSON.stringify(src.texturas));
        if (Array.isArray(src.artes)) state[lado].artes = JSON.parse(JSON.stringify(src.artes));
      });
    }
    arteSel = null;
    historico = []; futuro = [];
    ultimoEstado = JSON.stringify(estado());
    atualizarHistorico();
  }

  /* ── arquivos → dataURL ──────────────────────────────────────────────── */
  function lerArquivo(arquivo) {
    return new Promise(function (resolve, reject) {
      if (typeof arquivo === 'string') return resolve(arquivo);   /* já é dataURL */
      if (!arquivo) return reject(new Error('arquivo vazio'));
      if (typeof FileReader === 'undefined') return reject(new Error('leitor de arquivos indisponível'));
      var r = new FileReader();
      r.onload = function (ev) { resolve(String(ev.target.result || '')); };
      r.onerror = function () { reject(new Error('não foi possível ler o arquivo')); };
      try { r.readAsDataURL(arquivo); } catch (e) { reject(e); }
    });
  }

  /* reduz a imagem antes de guardar: o estado vai para o .json/impressão e não
     pode carregar foto de celular em resolução cheia */
  var MAX_PX = 1400;
  function normalizarImagem(dataURL) {
    /* Mantém o otimizador de imagens da V10.5 presente na main online. */
    var VooaltoImagemRef = (typeof window !== 'undefined' && window.VooaltoImagem) || (typeof VooaltoImagem !== 'undefined' ? VooaltoImagem : null);
    if (VooaltoImagemRef && typeof dataURL === 'string') {
      return VooaltoImagemRef.otimizar(dataURL, { maxDim: MAX_PX }).then(function (src) {
        return new Promise(function (resolve) {
          var im = new Image();
          var relogio = setTimeout(function () { resolve({ src: src, w: 1, h: 1 }); }, 2500);
          im.onload = function () { clearTimeout(relogio); resolve({ src: src, w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); };
          im.onerror = function () { clearTimeout(relogio); resolve({ src: src, w: 1, h: 1 }); };
          im.src = src;
        });
      }).catch(function () { return normalizarImagemLegado(dataURL); });
    }
    return normalizarImagemLegado(dataURL);
  }
  function normalizarImagemLegado(dataURL) {
    return new Promise(function (resolve) {
      /* se o navegador não conseguir medir a imagem (formato estranho), a arte
         ainda entra: depois de 2,5 s segue com o próprio dataURL */
      var terminou = false;
      function fim(info) { if (!terminou) { terminou = true; resolve(info); } }
      var relogio = setTimeout(function () { fim({ src: dataURL, w: 1, h: 1 }); }, 2500);
      var encerrar = function (info) { clearTimeout(relogio); fim(info); };
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, hh = img.naturalHeight;
          var escala = Math.min(1, MAX_PX / Math.max(w, hh));
          if (escala >= 1) return encerrar({ src: dataURL, w: w, h: hh });
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * escala));
          c.height = Math.max(1, Math.round(hh * escala));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          encerrar({ src: c.toDataURL('image/png'), w: c.width, h: c.height });
        } catch (e) { encerrar({ src: dataURL, w: img.naturalWidth || 1, h: img.naturalHeight || 1 }); }
      };
      img.onerror = function () { encerrar({ src: dataURL, w: 1, h: 1 }); };
      img.src = dataURL;
    });
  }

  /* ── render da peça ──────────────────────────────────────────────────── */
  function svgDoLado(lado) {
    var s = state[lado];
    return global.PecaRender.svg({
      lado: lado,
      cores: s.cores,
      acabamento: state.acabamento,
      texturas: s.texturas,
      artes: s.artes
    }, { id: lado + '_' + (root && root.id || 'x') });
  }

  function desenhar() {
    var lado = ladoAtual;
    rendendo = false;
    refs.canvas.innerHTML = svgDoLado(lado);
    desenharOverlay();
    desenharBadge();
    if (refs.dica) refs.dica.hidden = !!state[lado].artes.length;
  }

  /* overlay: as artes viram elementos HTML por cima do SVG — dá para arrastar,
     redimensionar e girar com o mouse/dedo sem mexer no desenho */
  function desenharOverlay() {
    var ov = refs.overlay;
    ov.innerHTML = '';
    var vb = global.Peca.VB;
    var lista = state[ladoAtual].artes;

    /* área clicável (para soltar imagem e desselecionar) */
    var hit = h('div', { class: 'pk-zonehit' });
    hit.addEventListener('pointerdown', function (e) {
      if (e.target === hit) { arteSel = null; desenhar(); desenharListaArtes(); desenharPropriedades(); }
    });
    ov.appendChild(hit);

    lista.forEach(function (a) {
      var wPct = (a.w / vb.w) * 100;
      var hPct = (a.h / vb.h) * 100;
      var el = h('div', { class: 'pk-arte', 'data-sel': String(a.id === arteSel), 'data-id': a.id });
      el.style.left = ((a.x / vb.w) * 100) + '%';
      el.style.top = ((a.y / vb.h) * 100) + '%';
      el.style.width = wPct + '%';
      el.style.height = hPct + '%';
      el.style.transform = 'translate(-50%,-50%) rotate(' + (a.rot || 0) + 'deg)';
      el.style.opacity = a.opac === undefined ? 1 : a.opac;

      var img = h('img', { src: a.src, alt: '', draggable: 'false' });
      if (a.flip) img.style.transform = 'scaleX(-1)';
      el.appendChild(img);
      el.addEventListener('pointerdown', function (e) { iniciarArraste(e, a, el); });
      ov.appendChild(el);

      if (a.id === arteSel) {
        /* alças dentro da arte: acompanham tamanho e rotação do elemento */
        var hr = h('div', { class: 'pk-handle pk-resize', title: 'Redimensionar (Shift: livre)' });
        hr.addEventListener('pointerdown', function (e) { iniciarTamanho(e, a, el); });
        el.appendChild(hr);

        var hg = h('div', { class: 'pk-handle pk-rot', title: 'Girar' });
        hg.addEventListener('pointerdown', function (e) { iniciarGiro(e, a); });
        el.appendChild(hg);

        var hd = h('button', { type: 'button', class: 'pk-handle pk-del', title: 'Remover arte', 'aria-label': 'Remover arte' }, ['×']);
        hd.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        hd.addEventListener('click', function (e) {
          e.stopPropagation();
          state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
          arteSel = null; desenharTudo(); avisar();
        });
        el.appendChild(hd);
      }
    });
  }

  function desenharBadge() {
    var s = state[ladoAtual];
    var nT = Object.keys(s.texturas || {}).length;
    var nA = (s.artes || []).length;
    refs.badge.textContent = (ladoAtual === 'frente' ? 'Frente' : 'Costas') + ' · ' + nA + ' arte' + (nA === 1 ? '' : 's') +
      ' · ' + nT + ' textura' + (nT === 1 ? '' : 's');
  }

  function posicaoLocal(ev) {
    var r = refs.canvas.getBoundingClientRect();
    var vb = global.Peca.VB;
    var x = r.width ? (ev.clientX - r.left) / r.width * vb.w : vb.w / 2;
    var y = r.height ? (ev.clientY - r.top) / r.height * vb.h : vb.h * 0.40;
    return { x: Math.max(0, Math.min(vb.w, x)), y: Math.max(0, Math.min(vb.h, y)),
             px: ev.clientX - r.left, py: ev.clientY - r.top, r: r };
  }

  function ocultarArteSvg() {
    refs.canvas.querySelectorAll('[data-arte]').forEach(function (img) { img.style.visibility = 'hidden'; });
  }

  function refletirSvg() {
    if (rendendo) return;
    rendendo = true;
    var canvas = refs.canvas, palco = root, lado = ladoAtual, peca = state;
    (global.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); })(function () {
      rendendo = false;
      if (canvas && palco && palco.isConnected && canvas === refs.canvas && lado === ladoAtual && peca === state) canvas.innerHTML = svgDoLado(ladoAtual);
    });
  }

  /* arraste com guias de alinhamento; Alt evita encaixe, Shift preserva giro */
  function iniciarArraste(ev, arte, el) {
    ev.preventDefault();
    var selecionou = arteSel !== arte.id;
    arteSel = arte.id;
    el.setAttribute('data-sel', 'true');
    var r = refs.canvas.getBoundingClientRect(), vb = global.Peca.VB;
    var ini = { x: arte.x, y: arte.y, rot: arte.rot };
    var movido = false;
    var antes = JSON.stringify(estado());
    ocultarArteSvg();
    function mover(e) {
      if (!r.width || !r.height) return;
      var x = Math.max(-40, Math.min(vb.w + 40, ini.x + (e.clientX - ev.clientX) / r.width * vb.w));
      var y = Math.max(-40, Math.min(vb.h + 40, ini.y + (e.clientY - ev.clientY) / r.height * vb.h));
      var guiaX = !e.altKey && Math.abs(x - vb.w / 2) < 12;
      var guiaY = !e.altKey && Math.abs(y - vb.h * 0.40) < 12;
      arte.x = guiaX ? vb.w / 2 : x;
      arte.y = guiaY ? vb.h * 0.40 : y;
      refs.guiaX.classList.toggle('pk-visible', guiaX);
      refs.guiaY.classList.toggle('pk-visible', guiaY);
      if (Math.abs(arte.x - ini.x) + Math.abs(arte.y - ini.y) > 1.5) movido = true;
      arte.rot = e.shiftKey ? ini.rot : fmt(global.PecaRender.anguloEm(arte.x, arte.y));
      refletirSvg();
      el.style.left = (arte.x / vb.w * 100) + '%';
      el.style.top = (arte.y / vb.h * 100) + '%';
      el.style.transform = 'translate(-50%,-50%) rotate(' + arte.rot + 'deg)';
      atualizarPropriedades();
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      refs.guiaX.classList.remove('pk-visible');
      refs.guiaY.classList.remove('pk-visible');
      desenhar();
      if (selecionou || movido) { desenharListaArtes(); desenharPropriedades(); }
      if (movido) registrarAntes(antes);
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  }

  function iniciarTamanho(ev, arte, el) {
    ev.preventDefault(); ev.stopPropagation();
    var r = refs.canvas.getBoundingClientRect(), vb = global.Peca.VB;
    var ini = { w: arte.w, h: arte.h, cx: ev.clientX, cy: ev.clientY, ratio: arte.w / arte.h };
    var rad = (arte.rot || 0) * Math.PI / 180;
    var antes = JSON.stringify(estado());
    ocultarArteSvg();
    function mover(e) {
      if (!r.width || !r.height) return;
      var dx = (e.clientX - ini.cx) / r.width * vb.w;
      var dy = (e.clientY - ini.cy) / r.height * vb.h;
      var localX = dx * Math.cos(rad) + dy * Math.sin(rad);
      var localY = -dx * Math.sin(rad) + dy * Math.cos(rad);
      var livre = e.shiftKey || arte.proporcao === false;
      if (livre) {
        arte.w = Math.max(30, Math.min(2000, ini.w + localX * 2));
        arte.h = Math.max(20, Math.min(2000, ini.h + localY * 2));
      } else {
        var escala = Math.max(0.1, 1 + (localX / ini.w + localY / ini.h));
        arte.w = Math.max(30, Math.min(2000, ini.w * escala));
        arte.h = arte.w / ini.ratio;
      }
      el.style.width = (arte.w / vb.w * 100) + '%';
      el.style.height = (arte.h / vb.h * 100) + '%';
      refletirSvg();
      atualizarPropriedades();
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      desenhar(); registrarAntes(antes);
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  }

  function iniciarGiro(ev, arte) {
    ev.preventDefault(); ev.stopPropagation();
    var r = refs.canvas.getBoundingClientRect();
    var vb = global.Peca.VB;
    var cx = r.left + (arte.x / vb.w) * r.width;
    var cy = r.top + (arte.y / vb.h) * r.height;
    var ang0 = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    var rot0 = arte.rot || 0;
    var antes = JSON.stringify(estado());
    ocultarArteSvg();
    function mover(e) {
      var a = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      arte.rot = fmt(rot0 + (a - ang0));
      refletirSvg();
      var el = refs.overlay.querySelector('.pk-arte[data-id="' + arte.id + '"]');
      if (el) el.style.transform = 'translate(-50%,-50%) rotate(' + arte.rot + 'deg)';
      atualizarPropriedades();
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      desenhar(); registrarAntes(antes);
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
  }

  /* ── soltar imagem ───────────────────────────────────────────────────── */
  function soltarImagem(ev) {
    ev.preventDefault();
    var p = posicaoLocal(ev);
    var arquivos = [];
    if (ev.dataTransfer && ev.dataTransfer.files) {
      for (var i = 0; i < ev.dataTransfer.files.length; i++) arquivos.push(ev.dataTransfer.files[i]);
    }
    if (!arquivos.length) return;
    adicionarArquivos(arquivos, p);
  }

  function adicionarArquivos(arquivos, pos) {
    arquivos = (arquivos || []).filter(function (f) {
      if (!f) return false;
      if (typeof f === 'string') return /^data:image\//.test(f);
      return /^image\//.test(f.type || '');
    });
    if (!arquivos.length) { toast('Só imagem (PNG, JPG, WEBP…)', 'erro'); return; }
    var vb = global.Peca.VB;
    var pendentes = arquivos.slice();
    var base = pos || { x: vb.w / 2, y: vb.h * 0.40 };
    var ladoDestino = ladoAtual;
    var ciclo = geracao;
    var antesImportar = JSON.stringify(estado());
    var adicionadas = 0;
    (function proximo() {
      var f = pendentes.shift();
      if (ciclo !== geracao) return;
      if (!f) { if (adicionadas) { desenharTudo(); registrarAntes(antesImportar); } return; }
      lerArquivo(f).then(normalizarImagem).then(function (info) {
        if (ciclo !== geracao) return;
        var largura = 300;
        var altura = largura * (info.h / info.w || 1);
        if (altura > 420) { altura = 420; largura = altura * (info.w / info.h || 1); }
        var arte = {
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          src: info.src,
          nome: String((f && f.name) || 'arte').replace(/\.[^.]+$/, '').slice(0, 40),
          x: base.x, y: base.y + (arquivos.length - pendentes.length - 1) * 24,
          w: largura, h: altura,
          rot: fmt(global.PecaRender.anguloEm(base.x, base.y)),
          opac: 1
        };
        state[ladoDestino].artes.push(arte);
        adicionadas++;
        if (ladoAtual === ladoDestino) arteSel = arte.id;
        desenharTudo();
        toast('Arte adicionada em ' + (ladoDestino === 'frente' ? 'Frente' : 'Costas'), 'ok');
        proximo();
      }).catch(function (e) { if (ciclo !== geracao) return; toast('Falha ao abrir a imagem: ' + e.message, 'erro'); proximo(); });
    })();
  }

  /* ── painel esquerdo: zonas, cores, texturas ─────────────────────────── */
  function zonaAtiva() {
    return ZONAS.filter(function (z) { return z.id === zonaSel; })[0] || ZONAS[0];
  }

  function desenharZonas() {
    var box = refs.zonas;
    box.innerHTML = '';
    var cores = state[ladoAtual].cores;
    ZONAS.forEach(function (z) {
      var cor = cores[z.id] || '#333';
      var tex = (state[ladoAtual].texturas || {})[z.id];
      var input = h('input', { type: 'color', value: cor, title: 'Cor de ' + z.nome });
      input.addEventListener('input', function () {
        state[ladoAtual].cores[z.id] = input.value;
        var linha = input.closest('.pk-zone');
        if (linha) linha.setAttribute('aria-checked', String(zonaSel === z.id));
        desenhar(); avisar();
      });
      var nome = h('div', { class: 'pk-nome' }, [
        h('b', null, [z.nome]),
        h('span', null, [tex && tex.src ? 'textura aplicada' : z.desc])
      ]);
      var linha = h('div', { class: 'pk-zone', 'aria-checked': String(zonaSel === z.id), role: 'button', tabindex: '0' }, [
        h('div', { class: 'pk-sw' }, [input]), nome
      ]);
      if (tex && tex.src) linha.appendChild(h('span', { class: 'pk-tex-on' }, ['TEX']));
      linha.addEventListener('click', function (e) {
        if (e.target === input) return;
        zonaSel = z.id; arteSel = null;
        desenharZonas(); desenharTextura(); desenharOverlay();
      });
      linha.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zonaSel = z.id; desenharZonas(); desenharTextura(); }
      });
      box.appendChild(linha);
    });

    /* paletas rápidas: aplicam no recorte selecionado */
    var pal = refs.paletas;
    pal.innerHTML = '';
    PALETAS.forEach(function (coresPal, i) {
      coresPal.forEach(function (cor) {
        var b = h('button', { type: 'button', title: 'Aplicar ' + cor + ' em ' + zonaAtiva().nome, style: 'background:' + cor });
        b.addEventListener('click', function () {
          state[ladoAtual].cores[zonaSel] = cor;
          desenhar(); desenharZonas(); avisar();
        });
        pal.appendChild(b);
      });
    });
  }

  function desenharTextura() {
    var box = refs.textura;
    box.innerHTML = '';
    var z = zonaAtiva();
    var t = (state[ladoAtual].texturas || {})[z.id];

    if (!t || !t.src) {
      box.appendChild(h('div', { class: 'pk-texempty' }, [
        'Arraste uma textura para o recorte ', h('b', null, [z.nome]), ' — ou use o botão abaixo. ',
        'Dá para repetir (tecido) ou esticar (uma imagem esticada como no Photoshop).'
      ]));
      box.appendChild(botaoTextura());
      return;
    }

    var preview = h('div', { class: 'pk-teximg', style: 'background-image:url(' + t.src + ')' }, [
      h('span', null, [t.modo === 'esticar' ? 'esticada no recorte' : 'repetida'])
    ]);
    box.appendChild(preview);

    /* modo */
    var seg = h('div', { class: 'pk-seg', style: 'margin-bottom:6px' });
    [['repetir', 'Repetir'], ['esticar', 'Esticar']].forEach(function (par) {
      var b = h('button', { type: 'button', 'aria-pressed': String((t.modo || 'repetir') === par[0]) }, [par[1]]);
      b.addEventListener('click', function () {
        t.modo = par[0]; desenhar(); desenharTextura(); avisar();
        toast(par[0] === 'esticar' ? 'Textura esticada no recorte' : 'Textura repetida (padrão de tecido)');
      });
      seg.appendChild(b);
    });
    box.appendChild(seg);

    /* escala (no modo repetir é o tamanho do padrão; no esticar é o zoom) */
    box.appendChild(slider('Tamanho', 0.2, 6, t.ex || 1, 0.1, function (v) {
      t.ex = v; t.ey = v; desenhar(); avisar(); atualizarRotuloTextura();
    }, 'texEscala'));
    if ((t.modo || 'repetir') === 'repetir') {
      box.appendChild(slider('Largura', 0.2, 6, t.ex || 1, 0.1, function (v) { t.ex = v; desenhar(); avisar(); }, null));
      box.appendChild(slider('Altura', 0.2, 6, t.ey || 1, 0.1, function (v) { t.ey = v; desenhar(); avisar(); }, null));
    }
    box.appendChild(slider('Girar', -180, 180, t.rot || 0, 1, function (v) { t.rot = v; desenhar(); avisar(); }));
    box.appendChild(slider('Opacidade', 0.05, 1, t.opac === undefined ? 0.85 : t.opac, 0.05, function (v) { t.opac = v; desenhar(); avisar(); }));

    var ferramentas = h('div', { class: 'pk-tools' }, [
      botaoTextura('Trocar', true),
      botao('✕ Remover', function () {
        delete state[ladoAtual].texturas[z.id];
        desenhar(); desenharZonas(); desenharTextura(); avisar();
        toast('Textura removida de ' + z.nome);
      })
    ]);
    box.appendChild(ferramentas);
  }

  function atualizarRotuloTextura() {
    var out = refs.textura.querySelector('[data-out="texEscala"]');
    var t = (state[ladoAtual].texturas || {})[zonaSel];
    if (out && t) out.textContent = fmt(t.ex || 1) + '×';
  }

  function botao(rotulo, aoClicar, classe) {
    var b = h('button', { type: 'button', class: 'pk-btn' + (classe ? ' ' + classe : '') }, [rotulo]);
    b.addEventListener('click', aoClicar);
    return b;
  }

  function botaoTextura(rotulo, pequeno) {
    var b = h('button', { type: 'button', class: 'pk-btn' + (pequeno ? '' : ' pk-primary'), style: pequeno ? '' : 'width:100%;justify-content:center;margin-top:8px' },
      [rotulo || '🖼 Escolher textura']);
    b.addEventListener('click', function () { escolherTextura(); });
    return b;
  }

  function slider(rotulo, min, max, valor, passo, aoMudar, dataOut) {
    var out = h('output', dataOut ? { 'data-out': dataOut } : null, [fmt(valor) + (rotulo === 'Girar' ? '°' : rotulo === 'Opacidade' ? '%' : '×')]);
    if (rotulo === 'Opacidade') out.textContent = Math.round(valor * 100) + '%';
    var inp = h('input', { type: 'range', min: min, max: max, step: passo, value: valor });
    inp.addEventListener('input', function () {
      var v = parseFloat(inp.value);
      out.textContent = rotulo === 'Girar' ? fmt(v) + '°' : rotulo === 'Opacidade' ? Math.round(v * 100) + '%' : fmt(v) + '×';
      aoMudar(v);
    });
    return h('div', { class: 'pk-row' }, [h('label', null, [rotulo]), inp, out]);
  }

  var inputTextura = null;
  function escolherTextura() {
    if (!inputTextura) {
      inputTextura = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      inputTextura.addEventListener('change', function () {
        var f = inputTextura.files && inputTextura.files[0];
        inputTextura.value = '';
        if (f) aplicarTexturaArquivo(f);
      });
      document.body.appendChild(inputTextura);
    }
    inputTextura.click();
  }

  function aplicarTexturaArquivo(arquivo, zona) {
    var z = zona || zonaSel;
    var nome = (arquivo && arquivo.name) || 'textura';
    lerArquivo(arquivo).then(normalizarImagem).then(function (info) {
      state[ladoAtual].texturas[z] = {
        src: info.src,
        nome: String(nome).replace(/\.[^.]+$/, '').slice(0, 40),
        modo: 'repetir',
        ex: 1, ey: 1, rot: 0, ox: 0, oy: 0, opac: 0.85
      };
      zonaSel = z;
      desenhar(); desenharZonas(); desenharTextura(); avisar();
      toast('Textura aplicada em ' + (ZONAS.filter(function (x) { return x.id === z; })[0] || { nome: z }).nome, 'ok');
      desenharTextura();
    }).catch(function (e) { toast('Falha na textura: ' + (e && e.message || e), 'erro'); });
  }

  /* ── painel direito: propriedades da arte selecionada ────────────────── */
  function arteAtual() {
    return (state[ladoAtual].artes || []).filter(function (a) { return a.id === arteSel; })[0] || null;
  }

  function desenharPropriedades() {
    var box = refs.props;
    box.innerHTML = '';
    var a = arteAtual();

    if (!a) {
      var lista = state[ladoAtual].artes || [];
      if (!lista.length) {
        box.appendChild(h('div', { class: 'pk-empty' }, ['Arraste uma imagem para a peça. Ela entra presa ao tecido e acompanha o ângulo do recorte quando você move.']));
        return;
      }
      box.appendChild(h('div', { class: 'pk-empty', style: 'border-style:solid' }, ['Clique numa arte na peça (ou na lista) para ajustar.']));
      return;
    }

    /* dimensões no mesmo sistema de coordenadas do SVG exportado */
    box.appendChild(h('div', { class: 'pk-row' }, [
      h('label', null, ['Largura']),
      numInput(a.w, 20, 2000, 1, function (v) {
        if (a.proporcao !== false) a.h = Math.max(20, Math.min(2000, a.h * v / a.w));
        a.w = v; desenhar(); desenharPropriedades(); avisar();
      }, 'largura')
    ]));
    box.appendChild(h('div', { class: 'pk-row' }, [
      h('label', null, ['Altura']),
      numInput(a.h, 20, 2000, 1, function (v) {
        if (a.proporcao !== false) a.w = Math.max(20, Math.min(2000, a.w * v / a.h));
        a.h = v; desenhar(); desenharPropriedades(); avisar();
      }, 'altura')
    ]));
    var trava = h('input', { type: 'checkbox', 'aria-label': 'Manter proporção' });
    trava.checked = a.proporcao !== false;
    trava.addEventListener('change', function () { a.proporcao = trava.checked; avisar(); });
    box.appendChild(h('label', { class: 'pk-lock' }, [trava, 'Manter proporção']));
    box.appendChild(slider('Girar', -180, 180, a.rot || 0, 1, function (v) { a.rot = v; desenhar(); avisar(); }, 'arteGiro'));
    box.appendChild(slider('Opacidade', 0.05, 1, a.opac === undefined ? 1 : a.opac, 0.05, function (v) { a.opac = v; desenhar(); avisar(); }));

    var acoes = h('div', { class: 'pk-tools' }, [
      botao('↺ Seguir o tecido', function () {
        a.rot = fmt(global.PecaRender.anguloEm(a.x, a.y));
        desenhar(); desenharPropriedades(); avisar();
        toast('Ângulo do tecido: ' + fmt(a.rot) + '°');
      }),
      botao('⤢ Centralizar', function () {
        a.x = global.Peca.VB.w / 2; a.y = global.Peca.VB.h * 0.40;
        a.rot = fmt(global.PecaRender.anguloEm(a.x, a.y));
        desenhar(); desenharPropriedades(); avisar();
      }),
      botao('⧉ Duplicar', function () {
        var copia = JSON.parse(JSON.stringify(a));
        copia.id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        copia.x += 30; copia.y += 30;
        state[ladoAtual].artes.push(copia);
        arteSel = copia.id; desenhar(); desenharListaArtes(); desenharPropriedades(); avisar();
      }),
      botao('↑ Trazer para frente', function () { moverCamada(a, 1); }),
      botao('↓ Enviar para trás', function () { moverCamada(a, -1); }),
      botao('⇄ Espelhar', function () {
        a.flip = !a.flip;
        desenhar(); avisar();
      }),
      botao('🗑 Remover', function () {
        state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
        arteSel = null; desenhar(); desenharListaArtes(); desenharPropriedades(); avisar();
      })
    ]);
    box.appendChild(acoes);
    box.appendChild(h('p', { class: 'pk-hint' }, ['Arraste para mover e use as alças para girar e redimensionar. Shift: tamanho livre ou giro fixo ao mover. Alt: sem alinhamento automático. Setas movem; Delete remove.']));
  }

  function moverCamada(a, direcao) {
    var lista = state[ladoAtual].artes;
    var i = lista.indexOf(a), destino = i + direcao;
    if (i < 0 || destino < 0 || destino >= lista.length) return;
    lista.splice(i, 1);
    lista.splice(destino, 0, a);
    desenhar(); desenharListaArtes(); avisar();
  }

  function numInput(valor, min, max, passo, aoMudar, prop) {
    var inp = h('input', { type: 'number', min: min, max: max, step: passo, value: Math.round(valor), 'data-prop': prop });
    inp.addEventListener('change', function () {
      var n = parseFloat(inp.value);
      if (!Number.isFinite(n)) { inp.value = Math.round(valor); return; }
      aoMudar(Math.max(min, Math.min(max, n)));
    });
    return inp;
  }

  function atualizarPropriedades() {
    var a = arteAtual();
    if (!a) return;
    var largura = refs.props.querySelector('[data-prop="largura"]');
    var altura = refs.props.querySelector('[data-prop="altura"]');
    if (largura) largura.value = Math.round(a.w);
    if (altura) altura.value = Math.round(a.h);
    var giro = refs.props.querySelector('[data-out="arteGiro"]');
    if (giro) giro.textContent = fmt(a.rot || 0) + '°';
  }

  function desenharListaArtes() {
    var box = refs.listaArtes;
    if (!box) return;
    box.innerHTML = '';
    var lista = state[ladoAtual].artes || [];
    if (!lista.length) {
      box.appendChild(h('div', { class: 'pk-empty' }, ['Nenhuma arte nesta face']));
      return;
    }
    lista.forEach(function (a) {
      var item = h('div', { class: 'pk-arte-item', 'data-sel': String(a.id === arteSel), role: 'button', tabindex: '0', 'aria-label': 'Selecionar ' + (a.nome || 'arte') }, [
        h('img', { src: a.src, alt: '' }),
        h('div', { class: 'pk-nm' }, [a.nome || 'arte']),
        h('button', { class: 'pk-x', title: 'Remover', 'aria-label': 'Remover ' + (a.nome || 'arte'), type: 'button' }, ['×'])
      ]);
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('pk-x')) {
          state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
          if (arteSel === a.id) arteSel = null;
          desenhar(); desenharListaArtes(); desenharPropriedades(); avisar();
          return;
        }
        arteSel = a.id; desenhar(); desenharListaArtes(); desenharPropriedades();
      });
      item.addEventListener('keydown', function (e) {
        if (e.target === item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); item.click(); }
      });
      box.appendChild(item);
    });
  }

  /* ── montagem da interface ───────────────────────────────────────────── */
  var observadorPalco = null;
  function ajustarPalco() {
    if (!refs.stage || !refs.workspace) return;
    var w = refs.stage.clientWidth, altura = refs.stage.clientHeight;
    if (w && altura) refs.workspace.style.width = Math.max(1, Math.min(560, w - 24, (altura - 24) * global.Peca.VB.w / global.Peca.VB.h)) + 'px';
  }

  function aoTeclar(e) {
    if (!root || !root.isConnected || (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) refazer(); else desfazer();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); refazer(); return; }
    var a = arteAtual();
    if (!a || ctrl || e.altKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
      arteSel = null; desenharTudo(); avisar();
    } else if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault(); e.stopPropagation();
      var passo = e.shiftKey ? 10 : 1;
      a.x = Math.max(0, Math.min(global.Peca.VB.w, a.x + (e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0)));
      a.y = Math.max(0, Math.min(global.Peca.VB.h, a.y + (e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0)));
      a.rot = fmt(global.PecaRender.anguloEm(a.x, a.y));
      desenhar(); atualizarPropriedades(); avisar();
    }
  }

  function aoColar(e) {
    if (!root || !root.isConnected || (e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]'))) return;
    var items = Array.prototype.slice.call(e.clipboardData && e.clipboardData.items || []);
    var imagens = items.filter(function (i) { return /^image\//.test(i.type); }).map(function (i) { return i.getAsFile(); }).filter(Boolean);
    if (imagens.length) { e.preventDefault(); e.stopPropagation(); adicionarArquivos(imagens, null); }
  }

  function montar(container, opcoes) {
    root = container;
    onChange = opcoes && opcoes.onChange;
    carregar(opcoes && opcoes.estado);
    ladoAtual = opcoes && opcoes.lado === 'costas' ? 'costas' : 'frente';

    root.innerHTML = '';
    root.classList.add('pk-studio');

    /* topo */
    var segLado = h('div', { class: 'pk-seg' });
    [['frente', 'Frente'], ['costas', 'Costas']].forEach(function (par) {
      var b = h('button', { type: 'button', 'aria-pressed': String(ladoAtual === par[0]) }, [par[1]]);
      b.addEventListener('click', function () {
        ladoAtual = par[0];
        Array.prototype.forEach.call(segLado.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        arteSel = null;
        desenharTudo();
      });
      segLado.appendChild(b);
    });

    var segAcab = h('div', { class: 'pk-seg' });
    [['dryfit', 'Dry fit (brilho)'], ['algodao', 'Algodão (fosco)']].forEach(function (par) {
      var b = h('button', { type: 'button', 'aria-pressed': String(state.acabamento === par[0]) }, [par[1]]);
      b.addEventListener('click', function () {
        state.acabamento = par[0];
        Array.prototype.forEach.call(segAcab.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        desenhar(); avisar();
        toast(par[0] === 'dryfit' ? 'Acabamento dry fit (leve brilho)' : 'Acabamento algodão (fosco)');
      });
      segAcab.appendChild(b);
    });

    var btnImg = h('button', { type: 'button', class: 'pk-btn pk-primary', title: 'Importar imagens da arte' }, ['+ Adicionar arte']);
    btnImg.addEventListener('click', abrirSeletorArte);
    refs.desfazer = botao('↶ Desfazer', desfazer);
    refs.refazer = botao('↷ Refazer', refazer);
    refs.desfazer.title = 'Desfazer (Ctrl+Z)';
    refs.refazer.title = 'Refazer (Ctrl+Shift+Z ou Ctrl+Y)';
    atualizarHistorico();

    var btnAplicar = h('button', { type: 'button', class: 'pk-btn' }, ['✓ Aplicar na ficha']);
    btnAplicar.addEventListener('click', function () {
      if (opcoes && typeof opcoes.onAplicar === 'function') opcoes.onAplicar(estado());
    });

    var topo = h('div', { class: 'pk-top' }, [
      h('div', { class: 'pk-brand' }, [h('i'), 'Peça']),
      segLado, segAcab,
      h('div', { class: 'pk-spacer' }),
      refs.desfazer, refs.refazer, btnImg, btnAplicar
    ]);

    /* coluna esquerda */
    refs.zonas = h('div');
    refs.paletas = h('div', { class: 'pk-paletas' });
    refs.textura = h('div', { class: 'pk-texbox' });

    refs.cores = h('div', { class: 'pk-cores' });
    var secCores = h('div', { class: 'pk-sec' }, [h('h4', null, ['Cores']), refs.cores]);
    var secOnde = h('div', { class: 'pk-sec' }, [
      h('h4', null, ['Onde aplicar']),
      refs.zonas, refs.paletas
    ]);
    var secTex = h('div', { class: 'pk-sec' }, [
      h('h4', null, ['Textura do recorte']), refs.textura
    ]);
    var esquerda = h('div', { class: 'pk-left' }, [secOnde, secCores, secTex]);

    /* palco */
    refs.canvas = h('div', { class: 'pk-canvas' });
    refs.overlay = h('div', { class: 'pk-overlay' });
    refs.badge = h('div', { class: 'pk-badge' });
    refs.guiaX = h('div', { class: 'pk-guide pk-guide-x' });
    refs.guiaY = h('div', { class: 'pk-guide pk-guide-y' });
    refs.workspace = h('div', { class: 'pk-workspace' }, [refs.canvas, refs.overlay, refs.guiaX, refs.guiaY]);
    refs.dica = h('div', { class: 'pk-stage-tip' }, ['Arraste uma imagem, cole com Ctrl+V ou clique em + Adicionar arte']);
    refs.stage = h('div', { class: 'pk-stage' }, [
      h('div', { class: 'pk-drop' }, ['Solte a imagem aqui']),
      refs.dica, refs.badge, refs.workspace
    ]);

    refs.stage.addEventListener('dragover', function (e) { e.preventDefault(); refs.stage.classList.add('pk-dragover'); });
    refs.stage.addEventListener('dragleave', function () { refs.stage.classList.remove('pk-dragover'); });
    refs.stage.addEventListener('drop', function (e) {
      refs.stage.classList.remove('pk-dragover');
      soltarImagem(e);
    });

    /* coluna direita */
    refs.props = h('div', { class: 'pk-prop' });
    refs.listaArtes = h('div', { class: 'pk-artes' });
    var direita = h('div', { class: 'pk-right' }, [
      h('div', { class: 'pk-sec' }, [h('h4', null, ['Artes nesta face']), refs.listaArtes]),
      h('div', { class: 'pk-sec' }, [h('h4', null, ['Arte selecionada']), refs.props])
    ]);

    root.appendChild(topo);
    root.appendChild(esquerda);
    root.appendChild(refs.stage);
    root.appendChild(direita);

    var st = h('div', { class: 'pk-toast' });
    refs.toast = st;
    root.appendChild(st);

    desenharTudo();
    if (observadorPalco) observadorPalco.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      observadorPalco = new ResizeObserver(ajustarPalco);
      observadorPalco.observe(refs.stage);
    }
    global.removeEventListener('resize', ajustarPalco);
    global.addEventListener('resize', ajustarPalco);
    document.removeEventListener('keydown', aoTeclar, true);
    document.addEventListener('keydown', aoTeclar, true);
    document.removeEventListener('paste', aoColar, true);
    document.addEventListener('paste', aoColar, true);
    ajustarPalco();
  }

  function desenharTudo() {
    desenhar();
    desenharZonas();
    desenharTextura();
    desenharListaArtes();
    desenharPropriedades();
  }

  var inputArte = null;
  function abrirSeletorArte() {
    if (!inputArte) {
      inputArte = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
      inputArte.addEventListener('change', function () {
        var fs = Array.prototype.slice.call(inputArte.files || []);
        inputArte.value = '';
        if (fs.length) adicionarArquivos(fs, null);
      });
      document.body.appendChild(inputArte);
    }
    inputArte.click();
  }

  /* ── API ─────────────────────────────────────────────────────────────── */
  global.PecaEditor = {
    montar: montar,
    estado: estado,
    carregar: carregar,
    aplicarTexturaArquivo: aplicarTexturaArquivo,
    adicionarArquivos: adicionarArquivos,
    ZONAS: ZONAS,
    _state: function () { return state; },
    _setLado: function (l) { ladoAtual = l; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
