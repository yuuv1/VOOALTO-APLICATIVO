/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO — NUVEM DE NUMERAÇÃO (V10.2)
   --------------------------------------------------------------------------
   O número da ficha deixou de ser um contador solto no navegador. Agora ele é
   uma RESERVA única, centralizada no Supabase, e vale para todas as máquinas:

     * parte de 3388 e só ANDA PARA CIMA;
     * número em uso OU em backup em OUTRA máquina é recusado — o sistema
       "joga o dígito superior" e pega o próximo livre;
     * reservar duas vezes a mesma ficha devolve o mesmo número (idempotente);
     * sem internet o app reserva localmente (para não travar a produção) e
       sincroniza na volta.

   Este arquivo é autocontido: não depende de nenhuma biblioteca, funciona no
   app, em página file:// e nos testes (jsdom). A credencial usada é a
   publicável (anon), que só executa as funções `vooalto_*` do banco.
   ══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  var CFG = {
    url: 'https://eeurdquvrdmoyjgzgpac.supabase.co',
    anon: 'sb_publishable_ebcfV_dIMgKSe_d1SlX5aw_EBT3P1pS',
    base: 3388,
    versao: ''            // preenchida por configurar()
  };

  var LS = {
    token: 'vooalto_nuvem_token_v1',
    conf: 'vooalto_nuvem_estado_v1',
    tentativas: 'vooalto_nuvem_tentativas_v1'
  };

  var estado = {
    origem: 'local',      // 'nuvem' | 'local' | 'cache'
    ultimo: 0,            // maior número que a nuvem já tinha quando a máquina olhou
    total: 0,             // quantos números a nuvem já guardou (todas as máquinas)
    donoBase: '',         // se a base (3388) já era de outra máquina, o nome dela
    erro: ''              // último motivo de falha (para o aviso da barra lateral)
  };

  /* ── ambiente ─────────────────────────────────────────────────────────── */
  function armazem() {
    try { if (raiz.localStorage) return raiz.localStorage; } catch (e) {}
    return null;
  }
  function lsGet(k) { try { var s = armazem(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { var s = armazem(); if (s) s.setItem(k, v); } catch (e) {} }

  function temFetch() { return typeof raiz.fetch === 'function'; }
  function urlValida() { return /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(CFG.url || ''); }
  function configurada() { return urlValida() && !!(CFG.anon || '').trim() && temFetch(); }

  /* ── identidade da máquina ────────────────────────────────────────────── */
  function gerarId() {
    var rnd = '';
    try {
      var buf = new Uint8Array(9);
      if (raiz.crypto && raiz.crypto.getRandomValues) raiz.crypto.getRandomValues(buf);
      else for (var i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
      rnd = Array.prototype.map.call(buf, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) {
      rnd = String(Date.now().toString(36)) + String(Math.random()).slice(2, 10);
    }
    return 'maq-' + rnd;
  }

  function nomeDoDispositivo() {
    var salvo = lsGet('va4_dispositivo_nome');
    if (salvo && salvo.trim()) return salvo.trim();
    var n = '';
    try {
      var ua = (raiz.navigator && raiz.navigator.userAgent) || '';
      var plataforma = (raiz.navigator && raiz.navigator.platform) || '';
      n = (raiz.navigator && raiz.navigator.userAgentData && raiz.navigator.userAgentData.platform)
        || plataforma || '';
      if (/\bWin/i.test(plataforma) || /Windows/i.test(ua)) n = 'Windows';
      else if (/Mac/i.test(plataforma)) n = 'Mac';
      else if (/Android/i.test(ua)) n = 'Android';
      else if (/iPhone|iPad|iPod/i.test(ua)) n = 'iPhone/iPad';
      else if (/Linux/i.test(plataforma)) n = 'Linux';
      n = (n || 'Computador') + ' ' + String(Math.random()).slice(2, 5);
    } catch (e) { n = 'Computador'; }
    lsSet('va4_dispositivo_nome', n);
    return n;
  }

  var _token = null;
  function token() {
    if (_token) return _token;
    _token = lsGet(LS.token);
    if (!_token) { _token = gerarId(); lsSet(LS.token, _token); }
    return _token;
  }
  function dispositivoNome() { return nomeDoDispositivo(); }

  function plataforma() {
    try {
      var ua = (raiz.navigator && raiz.navigator.userAgent) || '';
      var m = ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/[\d.]+/);
      return (m ? m[1] : 'Navegador') + ' / ' + ((raiz.navigator && raiz.navigator.platform) || '');
    } catch (e) { return 'Navegador'; }
  }

  function fichaIdAtual() {
    try {
      if (raiz.v8FichaAtualId) return String(raiz.v8FichaAtualId);
      var d = raiz.document;
      if (d) {
        var campo = d.getElementById('fichaNum');
        if (campo && campo.dataset && campo.dataset.fichaId) return campo.dataset.fichaId;
      }
    } catch (e) {}
    return '';
  }

  function clienteAtual() {
    try {
      var d = raiz.document;
      var el = d && d.getElementById('dc_nome');
      return el ? String(el.textContent || '').trim().slice(0, 160) : '';
    } catch (e) { return ''; }
  }

  /* ── HTTP ─────────────────────────────────────────────────────────────── */
  function esperar(ms) {
    return new Promise(function (res) { raiz.setTimeout(res, ms); });
  }

  function rpc(nome, args, opcoes) {
    opcoes = opcoes || {};
    var tentativas = opcoes.tentativas == null ? 3 : opcoes.tentativas;
    var espera = opcoes.espera == null ? 500 : opcoes.espera;
    var timeout = opcoes.timeout == null ? 12000 : opcoes.timeout;
    var alvo = CFG.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + nome;

    function umaVez(n) {
      var controle = null;
      var abortado = false;
      try { if (raiz.AbortController) controle = new raiz.AbortController(); } catch (e) {}
      var timer = controle ? raiz.setTimeout(function () { abortado = true; try { controle.abort(); } catch (e) {} }, timeout) : null;
      return raiz.fetch(alvo, {
        method: 'POST',
        headers: {
          apikey: CFG.anon,
          authorization: 'Bearer ' + CFG.anon,
          'content-type': 'application/json',
          accept: 'application/json',
          'x-client-info': 'vooalto-v10' + (CFG.versao ? '/' + CFG.versao : '')
        },
        body: JSON.stringify(args || {}),
        signal: controle ? controle.signal : undefined,
        cache: 'no-store'
      }).then(function (resp) {
        if (timer) raiz.clearTimeout(timer);
        return resp.text().then(function (texto) {
          var corpo = null;
          try { corpo = texto ? JSON.parse(texto) : null; } catch (e) { corpo = null; }
          if (!resp.ok) {
            var msg = (corpo && (corpo.message || corpo.hint || corpo.details)) || ('HTTP ' + resp.status);
            var erro = new Error(msg);
            erro.status = resp.status;
            erro.corpo = corpo;
            throw erro;
          }
          return corpo;
        });
      }).catch(function (erro) {
        if (timer) raiz.clearTimeout(timer);
        if (abortado) { var e2 = new Error('tempo esgotado'); e2.status = 0; e2.timeout = true; throw e2; }
        throw erro;
      });
    }

    function comRetentativa(n) {
      return umaVez(n).catch(function (erro) {
        var status = erro && erro.status;
        var podeRepetir = !status || status >= 500 || status === 429;
        if (n + 1 < tentativas && podeRepetir) {
          return esperar(espera * (n + 1)).then(function () { return comRetentativa(n + 1); });
        }
        throw erro;
      });
    }
    return comRetentativa(0);
  }

  function primeiraLinha(resposta) {
    if (Array.isArray(resposta)) return resposta[0] || null;
    return resposta || null;
  }

  /* ── chamadas de alto nível ───────────────────────────────────────────── */
  function nuvemOk() {
    if (!configurada()) return Promise.resolve({ ok: false, motivo: 'nao_configurada' });
    return rpc('vooalto_nuvem_ok', {}, { tentativas: 1, timeout: 6000 })
      .then(function (r) {
        var d = primeiraLinha(r) || {};
        estado.origem = 'nuvem';
        estado.erro = '';
        estado.ultimo = Number(d.ultimo_numero) || 0;
        estado.total = Number(d.total_numeros) || estado.total;
        return { ok: true, servidor: d.servidor, ultimo: estado.ultimo, total: d.total_numeros };
      })
      .catch(function (e) {
        estado.origem = 'local';
        estado.erro = e && e.message ? e.message : String(e);
        return { ok: false, motivo: 'sem_rede', erro: estado.erro };
      });
  }

  function registrarDispositivo() {
    if (!configurada()) return Promise.resolve(false);
    return rpc('vooalto_registrar_dispositivo', {
      p_id: token(),
      p_nome: dispositivoNome(),
      p_plataforma: plataforma(),
      p_versao: CFG.versao || ''
    }, { tentativas: 1, timeout: 8000 }).then(function () { return true; }).catch(function () { return false; });
  }

  function proximoLivre(base) {
    base = Number(base) || CFG.base;
    if (!configurada()) return Promise.reject(new Error('nuvem nao configurada'));
    return rpc('vooalto_proximo_livre', { p_base: base }, { timeout: 8000 })
      .then(function (r) { return Number(primeiraLinha(r)) || base; });
  }

  function reservar(pedido, extra) {
    extra = extra || {};
    var base = Number(extra.base) || CFG.base;
    var n = parseInt(pedido, 10);
    if (!n || n < 1) n = base;
    if (!configurada()) return Promise.reject(new Error('nuvem nao configurada'));
    return rpc('vooalto_reservar_numero', {
      p_pedido: n,
      p_base: base,
      p_ficha: extra.ficha == null ? (fichaIdAtual() || null) : extra.ficha,
      p_dispositivo: token(),
      p_dispositivo_nome: dispositivoNome(),
      p_cliente: extra.cliente == null ? (clienteAtual() || null) : extra.cliente
    }, { timeout: 12000 }).then(function (r) {
      var d = primeiraLinha(r);
      if (!d) throw new Error('resposta vazia da nuvem');
      var numero = Number(d.numero) || n;
      estado.origem = 'nuvem';
      estado.erro = '';
      if (/ja_era_desta_maquina/.test(d.motivo || '')) { estado.donoBase = ''; }
      else if (d.ajustado && !estado.donoBase) { estado.donoBase = EstadoAviso.baseOriginal || ''; }
      return {
        numero: numero,
        proposto: n,
        ajustado: !!d.ajustado,
        motivo: String(d.motivo || ''),
        dono: String(d.dono || ''),
        status: String(d.status || 'em_uso'),
        sufixo: (d.ajustado && numero !== n) ? '-' + String(n) : ''
      };
    });
  }

  function reservarComCache(pedido, extra) {
    return reservar(pedido, extra).catch(function (erro) {
      // Sem rede: o número local pedido é usado (padStart abaixo) e o aviso fica
      // na barra lateral. A próxima reserva com rede sobe para o livre da nuvem.
      estado.origem = 'cache';
      estado.erro = erro && erro.message ? erro.message : String(erro);
      var n = parseInt(pedido, 10) || CFG.base;
      return { numero: n, proposto: n, ajustado: false, motivo: 'sem_rede', dono: '', status: 'local', sufixo: '' };
    });
  }

  function registrar(numero, opcoes) {
    opcoes = opcoes || {};
    if (!configurada() || !numero) return Promise.resolve({ ok: true, ignorado: true });
    return rpc('vooalto_registrar_numero', {
      p_numero: parseInt(numero, 10),
      p_ficha: opcoes.ficha == null ? (fichaIdAtual() || null) : opcoes.ficha,
      p_status: opcoes.status || 'em_uso',
      p_dispositivo: token(),
      p_dispositivo_nome: dispositivoNome(),
      p_cliente: opcoes.cliente == null ? (clienteAtual() || null) : opcoes.cliente
    }, { timeout: 10000 }).then(function (r) {
      var d = primeiraLinha(r) || {};
      return { ok: !!d.ok, dono: String(d.dono || ''), motivo: String(d.motivo || ''), status: String(d.status || '') };
    }).catch(function (erro) {
      return { ok: false, motivo: 'sem_rede', erro: erro && erro.message ? erro.message : String(erro) };
    });
  }

  function registrarLote(numeros, opcoes) {
    opcoes = opcoes || {};
    var lista = (numeros || []).map(function (n) { return parseInt(n, 10); })
      .filter(function (n) { return n >= 1; });
    if (!configurada() || !lista.length) return Promise.resolve({ registrados: 0, ignorados: 0, sem: true });
    return rpc('vooalto_registrar_lote', {
      p_numeros: lista,
      p_status: opcoes.status || 'backup',
      p_dispositivo: token(),
      p_dispositivo_nome: dispositivoNome(),
      p_versao: CFG.versao || ''
    }, { timeout: 20000 }).then(function (r) {
      var d = primeiraLinha(r) || {};
      return { registrados: Number(d.registrados) || 0, ignorados: Number(d.ignorados) || 0, ultimo: Number(d.ultimo) || 0 };
    }).catch(function (erro) {
      return { registrados: 0, ignorados: 0, erro: erro && erro.message ? erro.message : String(erro) };
    });
  }

  /* Confere o número que já está na tela ao abrir a ficha: se ele pertence a
     OUTRA máquina (em uso/backup), devolve ocupado com o dono. */
  function verificar(numero) {
    var n = parseInt(numero, 10);
    if (!configurada() || !n) return Promise.resolve({ ocupado: false, dono: '', status: '' });
    return rpc('vooalto_verificar_numero', { p_numero: n }, { timeout: 8000 })
      .then(function (r) {
        var d = primeiraLinha(r) || {};
        var donoDeOutra = !!d.ocupado && String(d.dispositivo || '') !== token();
        return { ocupado: donoDeOutra, dono: String(d.dono || ''), status: String(d.status || '') };
      })
      .catch(function () { return { ocupado: false, dono: '', status: '', sem_rede: true }; });
  }

  /* ── estado salvo (para a barra lateral mostrar "modo local" etc.) ─────── */
  function salvarEstado() {
    lsSet(LS.conf, JSON.stringify({
      origem: estado.origem, ultimo: estado.ultimo, total: estado.total,
      donoBase: estado.donoBase, erro: estado.erro, quando: Date.now()
    }));
  }
  function lerEstado() {
    try {
      var d = JSON.parse(lsGet(LS.conf) || 'null');
      if (d && typeof d === 'object') {
        estado.origem = d.origem || estado.origem;
        estado.ultimo = Number(d.ultimo) || estado.ultimo;
        estado.total = Number(d.total) || estado.total;
        estado.donoBase = d.donoBase || estado.donoBase;
        estado.erro = d.erro || estado.erro;
      }
    } catch (e) {}
    return estado;
  }

  var EstadoAviso = { baseOriginal: '' };

  function base() { return CFG.base; }
  function configurar(c) {
    if (!c) return CFG;
    if (c.url) CFG.url = String(c.url).replace(/\/+$/, '');
    if (c.anon) CFG.anon = String(c.anon);
    if (c.base) CFG.base = parseInt(c.base, 10) || CFG.base;
    if (c.versao) CFG.versao = String(c.versao);
    return CFG;
  }

  var api = {
    configurar: configurar,
    configurada: configurada,
    base: base,
    token: token,
    dispositivoNome: dispositivoNome,
    nuvemOk: nuvemOk,
    registrarDispositivo: registrarDispositivo,
    proximoLivre: proximoLivre,
    reservar: reservar,
    reservarComCache: reservarComCache,
    registrar: registrar,
    registrarLote: registrarLote,
    verificar: verificar,
    estado: function () { return estado; },
    lerEstado: lerEstado,
    salvarEstado: salvarEstado,
    avisoBase: function (dono) { EstadoAviso.baseOriginal = dono || ''; },
    _estadoAviso: function () { return EstadoAviso; }
  };

  raiz.VooaltoNuvem = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
