/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO — ZOOM SÓ DA FOLHA (V10.4)
   --------------------------------------------------------------------------
   Dar zoom com Ctrl+rolagem ou com a pinça do navegador aumenta o
   APLICATIVO INTEIRO (barra lateral, botões, tudo) — e a folha continua
   difícil de ler. Este arquivo dá zoom apenas na folha (Ficha Técnica ou
   Orçamento), sem tocar no resto da interface:

     * botões flutuantes − / % / + e "caber" no canto da área da folha;
     * Ctrl + rolagem do mouse sobre a folha (o navegador NÃO dá zoom);
     * o nível fica lembrado por módulo neste aparelho;
     * imprimir/PDF e exportar PNG sempre saem em 100% (o zoom é só de
       tela) — via @media print e via suspender() nas exportações.

   Uso: ZoomFolha.instalar({ seletor: '#pw', chave: 'vooalto_zoom_ficha' })
   ══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  var MIN = 0.4, MAX = 2.5, PASSO = 0.1;
  var instancias = [];

  function lsGet(k) { try { return raiz.localStorage ? raiz.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (raiz.localStorage) raiz.localStorage.setItem(k, v); } catch (e) {} }

  function limitar(v) { return Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100)); }

  /* O CSS de impressão garante a folha em 100% no papel/PDF, não importa o
     zoom de tela. Uma folha só por documento, então uma regra serve. */
  var estiloInjetado = false;
  function injetarEstilo() {
    if (estiloInjetado || !raiz.document) return;
    estiloInjetado = true;
    var st = raiz.document.createElement('style');
    st.id = 'zoom-folha-css';
    st.textContent =
      '@media print{[data-zoom-folha]{zoom:1!important}}' +
      '.zoom-folha-ctrl{position:fixed;right:14px;bottom:76px;z-index:9800;display:flex;align-items:center;gap:2px;' +
      'background:rgba(17,24,39,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;' +
      'padding:4px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:inherit;user-select:none}' +
      '.zoom-folha-ctrl button{min-width:34px;height:30px;border:none;border-radius:999px;background:transparent;' +
      'color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;line-height:1}' +
      '.zoom-folha-ctrl button:hover{background:rgba(255,255,255,.16)}' +
      '.zoom-folha-ctrl .zoom-folha-nivel{min-width:52px;text-align:center;font-size:12px;font-weight:800;cursor:pointer}' +
      '@media print{.zoom-folha-ctrl{display:none!important}}';
    raiz.document.head.appendChild(st);
  }

  function instalar(opcoes) {
    opcoes = opcoes || {};
    if (!raiz.document) return null;
    var alvo = typeof opcoes.seletor === 'string'
      ? raiz.document.querySelector(opcoes.seletor) : opcoes.seletor;
    if (!alvo) return null;
    injetarEstilo();

    var chave = opcoes.chave || 'vooalto_zoom_folha';
    var salvo = parseFloat(lsGet(chave) || '');
    var nivel = limitar(isNaN(salvo) ? 1 : salvo);

    var inst = { alvo: alvo, chave: chave, nivel: nivel };
    instancias.push(inst);

    function aplicar() {
      alvo.setAttribute('data-zoom-folha', '1');
      alvo.style.zoom = String(inst.nivel);
      var rotulo = ctrl.querySelector('.zoom-folha-nivel');
      if (rotulo) rotulo.textContent = Math.round(inst.nivel * 100) + '%';
    }
    inst.definir = function (v, semSalvar) {
      inst.nivel = limitar(Number(v) || 1);
      if (!semSalvar) lsSet(chave, String(inst.nivel));
      aplicar();
      return inst.nivel;
    };
    /* Volta a 100% só durante uma exportação e devolve o nível depois. */
    inst.suspender = function () {
      var antes = inst.nivel;
      alvo.style.zoom = '1';
      return function () { alvo.style.zoom = String(antes); };
    };

    /* ── controles flutuantes ── */
    var ctrl = raiz.document.createElement('div');
    ctrl.className = 'zoom-folha-ctrl';
    ctrl.setAttribute('role', 'group');
    ctrl.setAttribute('aria-label', 'Zoom da folha');
    ctrl.innerHTML =
      '<button type="button" data-z="menos" title="Diminuir o zoom da folha">−</button>' +
      '<span class="zoom-folha-nivel" title="Voltar a 100%">100%</span>' +
      '<button type="button" data-z="mais" title="Aumentar o zoom da folha">+</button>' +
      '<button type="button" data-z="caber" title="Ajustar a folha à largura da tela" style="font-size:12px">⤢</button>';
    raiz.document.body.appendChild(ctrl);
    ctrl.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button,.zoom-folha-nivel') : null;
      if (!b) return;
      if (b.classList.contains('zoom-folha-nivel')) { inst.definir(1); return; }
      var acao = b.getAttribute('data-z');
      if (acao === 'mais') inst.definir(inst.nivel + PASSO);
      else if (acao === 'menos') inst.definir(inst.nivel - PASSO);
      else if (acao === 'caber') inst.definir(caber());
    });

    /* Largura que faz a folha (794px) caber na área visível do alvo. */
    function caber() {
      try {
        var folha = alvo.querySelector('.folha,.folha-branca,.page') || alvo;
        var wFolha = folha.offsetWidth || 794;
        var wArea = (alvo.parentElement ? alvo.parentElement.clientWidth : raiz.innerWidth) || wFolha;
        return limitar((wArea - 32) / wFolha);
      } catch (e) { return 1; }
    }
    inst.caber = caber;

    /* ── Ctrl + rolagem sobre a folha: zoom da folha, NÃO do navegador ── */
    alvo.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); // sem isto o navegador dá zoom no app inteiro
      var passo = e.deltaY < 0 ? PASSO : -PASSO;
      inst.definir(inst.nivel + passo);
    }, { passive: false });

    aplicar();
    return inst;
  }

  var api = {
    instalar: instalar,
    instancias: function () { return instancias; },
    /* Atalho para as exportações (PNG): suspende todas e devolve p/ restaurar. */
    suspenderTudo: function () {
      var voltar = instancias.map(function (i) { return i.suspender(); });
      return function () { voltar.forEach(function (f) { try { f(); } catch (e) {} }); };
    },
    _limitar: limitar
  };

  raiz.ZoomFolha = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
