/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO V9.2 — ESTÚDIO DA PEÇA

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

  function avisar (cb) { if (typeof onChange === 'function') { try { onChange(estado()); } catch (e) {} } }

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
    refs.canvas.innerHTML = svgDoLado(lado);
    desenharOverlay();
    desenharBadge();
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
      if (e.target === hit) { arteSel = null; desenhar(); }
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
      el.appendChild(img);
      el.addEventListener('pointerdown', function (e) { iniciarArraste(e, a, el); });
      ov.appendChild(el);

      if (a.id === arteSel) {
        /* alça de tamanho (canto) e de giro (topo) */
        var hr = h('div', { class: 'pk-handle', title: 'Redimensionar' });
        hr.style.left = ((a.x / vb.w) * 100 + wPct / 2) + '%';
        hr.style.top = ((a.y / vb.h) * 100 + hPct / 2) + '%';
        hr.addEventListener('pointerdown', function (e) { iniciarTamanho(e, a); });
        ov.appendChild(hr);

        var hg = h('div', { class: 'pk-handle pk-rot', title: 'Girar' });
        hg.style.left = ((a.x / vb.w) * 100) + '%';
        hg.style.top = ((a.y / vb.h) * 100 - hPct / 2 - 3) + '%';
        hg.addEventListener('pointerdown', function (e) { iniciarGiro(e, a); });
        ov.appendChild(hg);

        var hd = h('div', { class: 'pk-handle pk-del', title: 'Remover', html: '×' });
        hd.style.left = ((a.x / vb.w) * 100 - wPct / 2) + '%';
        hd.style.top = ((a.y / vb.h) * 100 - hPct / 2) + '%';
        hd.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
          state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
          arteSel = null; desenhar(); avisar();
        });
        ov.appendChild(hd);
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
    var x = (ev.clientX - r.left) / r.width * vb.w;
    var y = (ev.clientY - r.top) / r.height * vb.h;
    return { x: Math.max(0, Math.min(vb.w, x)), y: Math.max(0, Math.min(vb.h, y)),
             px: ev.clientX - r.left, py: ev.clientY - r.top, r: r };
  }

  /* arrastar a arte: ela anda pela peça e o ângulo vem do tecido */
  function iniciarArraste(ev, arte, el) {
    ev.preventDefault();
    arteSel = arte.id;
    var p0 = posicaoLocal(ev);
    var ini = { x: arte.x, y: arte.y };
    var movido = false;
    el.setPointerCapture && el.setPointerCapture(ev.pointerId);
    function mover(e) {
      var p = posicaoLocal(e);
      var vb = global.Peca.VB;
      var dx = (e.clientX - ev.clientX) / p.r.width * vb.w;
      var dy = (e.clientY - ev.clientY) / p.r.height * vb.h;
      if (Math.abs(dx) + Math.abs(dy) > 1.5) movido = true;
      arte.x = Math.max(-40, Math.min(vb.w + 40, ini.x + dx));
      arte.y = Math.max(-40, Math.min(vb.h + 40, ini.y + dy));
      /* acompanha o tecido: o ângulo é recalculado a cada movimento */
      arte.rot = fmt(global.PecaRender.anguloEm(arte.x, arte.y));
      el.style.left = ((arte.x / vb.w) * 100) + '%';
      el.style.top = ((arte.y / vb.h) * 100) + '%';
      el.style.transform = 'translate(-50%,-50%) rotate(' + arte.rot + 'deg)';
      atualizarPropriedades();
      desenharHandlesRapido(arte);
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      if (movido) { avisar(); toast('Arte presa à peça · ' + fmt(arte.rot) + '°'); }
      desenhar();
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  }

  function desenharHandlesRapido(arte) {
    /* durante o arraste atualiza só as alças (evita redesenhar o SVG) */
    var vb = global.Peca.VB;
    var wPct = (arte.w / vb.w) * 100, hPct = (arte.h / vb.h) * 100;
    var hs = refs.overlay.querySelectorAll('.pk-handle');
    if (hs[0]) { hs[0].style.left = ((arte.x / vb.w) * 100 + wPct / 2) + '%'; hs[0].style.top = ((arte.y / vb.h) * 100 + hPct / 2) + '%'; }
    if (hs[1]) { hs[1].style.left = ((arte.x / vb.w) * 100) + '%'; hs[1].style.top = ((arte.y / vb.h) * 100 - hPct / 2 - 3) + '%'; }
    if (hs[2]) { hs[2].style.left = ((arte.x / vb.w) * 100 - wPct / 2) + '%'; hs[2].style.top = ((arte.y / vb.h) * 100 - hPct / 2) + '%'; }
  }

  function iniciarTamanho(ev, arte) {
    ev.preventDefault(); ev.stopPropagation();
    var r = refs.canvas.getBoundingClientRect();
    var vb = global.Peca.VB;
    var ini = { w: arte.w, h: arte.h, cx: ev.clientX, cy: ev.clientY, ratio: (arte.w || 1) / (arte.h || 1) };
    function mover(e) {
      var dx = (e.clientX - ini.cx) / r.width * vb.w;
      var dy = (e.clientY - ini.cy) / r.height * vb.h;
      var delta = Math.max(dx, dy);
      var w = Math.max(30, ini.w + delta * 2);
      if (e.shiftKey) {
        arte.w = w;
        arte.h = w / ini.ratio;
      } else {
        arte.w = w;
        arte.h = Math.max(20, ini.h + delta * 2);
      }
      desenharOverlay(); atualizarPropriedades();
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      desenhar(); avisar();
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  }

  function iniciarGiro(ev, arte) {
    ev.preventDefault(); ev.stopPropagation();
    var r = refs.canvas.getBoundingClientRect();
    var vb = global.Peca.VB;
    var cx = r.left + (arte.x / vb.w) * r.width;
    var cy = r.top + (arte.y / vb.h) * r.height;
    var ang0 = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    var rot0 = arte.rot || 0;
    function mover(e) {
      var a = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      arte.rot = fmt(rot0 + (a - ang0));
      var el = refs.overlay.querySelector('.pk-arte[data-id="' + arte.id + '"]');
      if (el) el.style.transform = 'translate(-50%,-50%) rotate(' + arte.rot + 'deg)';
      atualizarPropriedades();
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      desenhar(); avisar();
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
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
    (function proximo() {
      var f = pendentes.shift();
      if (!f) { desenhar(); avisar(); return; }
      lerArquivo(f).then(normalizarImagem).then(function (info) {
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
        state[ladoAtual].artes.push(arte);
        arteSel = arte.id;
        desenhar();
        toast('Arte adicionada e presa à peça (' + fmt(arte.rot) + '°)', 'ok');
        proximo();
      }).catch(function (e) { toast('Falha ao abrir a imagem: ' + e.message, 'erro'); proximo(); });
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

    /* posição e tamanho em número, para quem quer precisão */
    box.appendChild(h('div', { class: 'pk-row' }, [
      h('label', null, ['Largura']),
      numInput(a.w, 20, 2000, 1, function (v) { a.w = v; if (a._proporcao !== false) a.h = a.h * (v / (a.w || v)); desenhar(); avisar(); })
    ]));
    box.appendChild(h('div', { class: 'pk-row' }, [
      h('label', null, ['Altura']),
      numInput(a.h, 20, 2000, 1, function (v) { a.h = v; desenhar(); avisar(); })
    ]));
    box.appendChild(slider('Girar', -180, 180, a.rot || 0, 1, function (v) { a.rot = v; desenhar(); avisar(); }));
    box.appendChild(slider('Opacidade', 0.05, 1, a.opac === undefined ? 1 : a.opac, 0.05, function (v) { a.opac = v; desenhar(); avisar(); }));

    var acoes = h('div', { class: 'pk-tools' }, [
      botao('↺ Seguir o tecido', function () {
        a.rot = fmt(global.PecaRender.anguloEm(a.x, a.y));
        desenhar(); avisar();
        toast('Ângulo do tecido: ' + fmt(a.rot) + '°');
      }),
      botao('⤢ Centralizar', function () {
        a.x = global.Peca.VB.w / 2; a.y = global.Peca.VB.h * 0.40;
        a.rot = fmt(global.PecaRender.anguloEm(a.x, a.y));
        desenhar(); avisar();
      }),
      botao('⧉ Duplicar', function () {
        var copia = JSON.parse(JSON.stringify(a));
        copia.id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        copia.x += 30; copia.y += 30;
        state[ladoAtual].artes.push(copia);
        arteSel = copia.id; desenhar(); avisar();
      }),
      botao('⇄ Espelhar', function () {
        var el = refs.overlay.querySelector('.pk-arte[data-id="' + a.id + '"] img');
        a.flip = !a.flip;
        desenhar(); avisar();
      }),
      botao('🗑 Remover', function () {
        state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
        arteSel = null; desenhar(); avisar();
      })
    ]);
    box.appendChild(acoes);
    box.appendChild(h('p', { class: 'pk-hint' }, ['Arraste na peça para mover. A imagem acompanha o ângulo do recorte (peito em pé, manga inclinada). Shift ao redimensionar mantém a proporção.']));
  }

  function numInput(valor, min, max, passo, aoMudar) {
    var inp = h('input', { type: 'number', min: min, max: max, step: passo, value: Math.round(valor) });
    inp.addEventListener('change', function () {
      var v = Math.max(min, Math.min(max, parseFloat(inp.value) || min));
      aoMudar(v);
    });
    return inp;
  }

  function atualizarPropriedades() {
    /* durante o arraste, só os números mudam */
    var a = arteAtual();
    if (!a) return;
    var hd = refs.overlay.querySelector('.pk-handle');
    desenharHandlesRapido(a);
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
      var item = h('div', { class: 'pk-arte-item', 'data-sel': String(a.id === arteSel) }, [
        h('img', { src: a.src, alt: '' }),
        h('div', { class: 'pk-nm' }, [a.nome || 'arte']),
        h('button', { class: 'pk-x', title: 'Remover', type: 'button' }, ['×'])
      ]);
      item.addEventListener('click', function (e) {
        if (e.target.classList.contains('pk-x')) {
          state[ladoAtual].artes = state[ladoAtual].artes.filter(function (x) { return x.id !== a.id; });
          if (arteSel === a.id) arteSel = null;
          desenhar(); avisar();
          return;
        }
        arteSel = a.id; desenhar();
      });
      box.appendChild(item);
    });
  }

  /* ── montagem da interface ───────────────────────────────────────────── */
  function montar(container, opcoes) {
    root = container;
    onChange = opcoes && opcoes.onChange;
    carregar(opcoes && opcoes.estado);
    if (opcoes && opcoes.lado) ladoAtual = opcoes.lado === 'costas' ? 'costas' : 'frente';

    root.innerHTML = '';
    root.classList.add('pk-studio');

    /* topo */
    var segLado = h('div', { class: 'pk-seg' });
    [['frente', 'Frente'], ['costas', 'Costas'], ['ambos', 'Frente e Costas']].forEach(function (par) {
      var b = h('button', { type: 'button', 'aria-pressed': String(ladoAtual === par[0]) }, [par[1]]);
      b.addEventListener('click', function () {
        ladoAtual = par[0];
        Array.prototype.forEach.call(segLado.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        refs.cavas.classList.toggle('pk-duplo', ladoAtual === 'ambos');
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

    var btnImg = h('button', { type: 'button', class: 'pk-btn pk-primary' }, ['+ Imagem']);
    btnImg.addEventListener('click', abrirSeletorArte);

    var btnAplicar = h('button', { type: 'button', class: 'pk-btn' }, ['✓ Aplicar na ficha']);
    btnAplicar.addEventListener('click', function () {
      if (opcoes && typeof opcoes.onAplicar === 'function') opcoes.onAplicar(estado());
    });

    var topo = h('div', { class: 'pk-top' }, [
      h('div', { class: 'pk-brand' }, [h('i'), 'Peça']),
      segLado, segAcab,
      h('div', { class: 'pk-spacer' }),
      btnImg, btnAplicar
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
    refs.stage = h('div', { class: 'pk-stage' }, [
      h('div', { class: 'pk-drop' }, ['Solte a imagem aqui']),
      refs.badge, refs.canvas, refs.overlay
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
