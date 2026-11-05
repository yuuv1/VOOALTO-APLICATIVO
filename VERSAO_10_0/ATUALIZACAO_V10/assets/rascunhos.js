/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO — RASCUNHOS ONLINE (V10.3)
   --------------------------------------------------------------------------
   Até a V10.2 os rascunhos SALVOS viviam só no navegador de cada aparelho
   (IndexedDB / localStorage): as fichas de "Minhas fichas" e os rascunhos de
   orçamento NÃO existiam nas outras máquinas. Agora eles são compartilhados
   na nuvem (Supabase).

   O trabalho EM ANDAMENTO (autosave da ficha/proposta aberta) NÃO entra
   aqui de propósito: cada computador edita uma ficha diferente ao mesmo
   tempo, e compartilhar esse slot único faria um aparelho pisar no outro.
   Compartilha-se só o que tem registro próprio (botão Salvar).

     * TODOS os aparelhos conectados veem/editam os MESMOS rascunhos;
     * salvar num aparelho aparece nos outros em segundos (polling);
     * apagar num aparelho apaga nos outros;
     * conflito (dois editando ao mesmo tempo) = a edição mais recente
       vence, e o aparelho que perde guarda uma cópia de segurança local;
     * sem internet NADA trava: o trabalho continua local e sincroniza
       sozinho quando a rede volta.

   O armazenamento local continua sendo a fonte de leitura dos módulos
   (nada muda no formato dos dados); este arquivo apenas espelha esse
   armazenamento na tabela `vooalto_rascunhos`, via funções RPC — o mesmo
   padrão da nuvem de numeração (assets/nuvem.js), com a mesma credencial
   publicável e a mesma identidade de aparelho.

   API:
     VooaltoRascunhos.iniciarColecao({
       tipo: 'ficha_salva',                      // namespace na nuvem
       listar:  async () => [{chave, titulo, payload}...],
       aplicar: async ({chave, titulo, payload, dispositivo_nome}) => {},
       remover: async (chave) => {},
       aoMudar: () => {}                          // repintar a lista etc.
     })
     VooaltoRascunhos.agendar()                   // força um ciclo em breve
     VooaltoRascunhos.estado()                    // {origem, erro, ultimoCiclo}
   ══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  var CFG = {
    url: 'https://eeurdquvrdmoyjgzgpac.supabase.co',
    anon: 'sb_publishable_ebcfV_dIMgKSe_d1SlX5aw_EBT3P1pS',
    intervaloMs: 12000,     // ciclo de sincronização (puxa + empurra)
    limiteBytes: 9000000    // mesmo teto do banco (~9 MB por rascunho)
  };

  var LS_SYNC = 'vooalto_rasc_sync_v1';       // {itens:{tipo|chave:{h,localEm,nuvemEm}}, cursor}
  var LS_TOKEN = 'vooalto_nuvem_token_v1';    // mesma identidade da numeração
  var LS_NOME = 'va4_dispositivo_nome';
  var LS_CONFLITO = 'vooalto_rasc_conflito_'; // cópia de segurança em conflito

  var estado = { origem: 'local', erro: '', ultimoCiclo: 0, ciclos: 0 };
  var colecoes = {};        // tipo -> adaptador
  var rodando = false;
  var agendado = null;
  var iniciado = false;

  /* ── armazenamento local ──────────────────────────────────────────────── */
  function armazem() { try { if (raiz.localStorage) return raiz.localStorage; } catch (e) {} return null; }
  function lsGet(k) { try { var s = armazem(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { var s = armazem(); if (s) s.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { var s = armazem(); if (s) s.removeItem(k); } catch (e) {} }

  function lerSync() {
    try {
      var d = JSON.parse(lsGet(LS_SYNC) || 'null');
      if (d && typeof d === 'object' && d.itens) { if (!d.cursors) d.cursors = {}; return d; }
    } catch (e) {}
    return { itens: {}, cursors: {} };
  }
  function gravarSync(s) { lsSet(LS_SYNC, JSON.stringify(s)); }

  /* ── identidade do aparelho (a mesma da nuvem de numeração) ───────────── */
  function gerarId() {
    var rnd = '';
    try {
      var buf = new Uint8Array(9);
      if (raiz.crypto && raiz.crypto.getRandomValues) raiz.crypto.getRandomValues(buf);
      else for (var i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
      rnd = Array.prototype.map.call(buf, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (e) { rnd = String(Date.now().toString(36)) + String(Math.random()).slice(2, 10); }
    return 'maq-' + rnd;
  }
  function token() {
    if (raiz.VooaltoNuvem && raiz.VooaltoNuvem.token) { try { return raiz.VooaltoNuvem.token(); } catch (e) {} }
    var t = lsGet(LS_TOKEN);
    if (!t) { t = gerarId(); lsSet(LS_TOKEN, t); }
    return t;
  }
  function dispositivoNome() {
    if (raiz.VooaltoNuvem && raiz.VooaltoNuvem.dispositivoNome) { try { return raiz.VooaltoNuvem.dispositivoNome(); } catch (e) {} }
    return (lsGet(LS_NOME) || 'Computador').trim() || 'Computador';
  }

  /* ── HTTP (mesmo protocolo do nuvem.js) ───────────────────────────────── */
  function temFetch() { return typeof raiz.fetch === 'function'; }
  function configurada() { return temFetch() && /^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(CFG.url || '') && !!(CFG.anon || '').trim(); }

  function rpc(nome, args, timeout) {
    var alvo = CFG.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + nome;
    var controle = null, abortado = false;
    try { if (raiz.AbortController) controle = new raiz.AbortController(); } catch (e) {}
    var timer = controle ? raiz.setTimeout(function () { abortado = true; try { controle.abort(); } catch (e) {} }, timeout || 20000) : null;
    return raiz.fetch(alvo, {
      method: 'POST',
      headers: {
        apikey: CFG.anon, authorization: 'Bearer ' + CFG.anon,
        'content-type': 'application/json', accept: 'application/json',
        'x-client-info': 'vooalto-v10-rascunhos'
      },
      body: JSON.stringify(args || {}),
      signal: controle ? controle.signal : undefined,
      cache: 'no-store'
    }).then(function (resp) {
      if (timer) raiz.clearTimeout(timer);
      return resp.text().then(function (texto) {
        var corpo = null;
        try { corpo = texto ? JSON.parse(texto) : null; } catch (e) {}
        if (!resp.ok) {
          var erro = new Error((corpo && (corpo.message || corpo.hint || corpo.details)) || ('HTTP ' + resp.status));
          erro.status = resp.status;
          throw erro;
        }
        return corpo;
      });
    }).catch(function (erro) {
      if (timer) raiz.clearTimeout(timer);
      if (abortado) { var e2 = new Error('tempo esgotado'); e2.status = 0; throw e2; }
      throw erro;
    });
  }

  function salvarRemoto(tipo, chave, titulo, payload) {
    return rpc('vooalto_rascunho_salvar', {
      p_tipo: tipo, p_chave: chave, p_titulo: titulo || '',
      p_payload: payload == null ? {} : payload,
      p_dispositivo: token(), p_dispositivo_nome: dispositivoNome()
    }, 30000).then(function (r) {
      var d = Array.isArray(r) ? r[0] : r;
      if (!d || !d.atualizado_em) throw new Error('resposta vazia da nuvem');
      return d;
    });
  }
  function excluirRemoto(tipo, chave) {
    return rpc('vooalto_rascunho_excluir', {
      p_tipo: tipo, p_chave: chave,
      p_dispositivo: token(), p_dispositivo_nome: dispositivoNome()
    }, 15000).then(function (r) { return Array.isArray(r) ? r[0] : r; });
  }
  function baixarMudancas(desdeIso, tipo) {
    return rpc('vooalto_rascunhos_desde', {
      p_desde: desdeIso || '1970-01-01T00:00:00Z', p_limite: 500, p_tipo: tipo || null
    }, 30000).then(function (r) { return Array.isArray(r) ? r : []; });
  }

  /* ── hash barato do conteúdo (detectar edição local) ──────────────────── */
  function hashDe(texto) {
    var h1 = 0x811c9dc5, h2 = 5381;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = (Math.imul(h2, 33) ^ c) | 0;
    }
    return texto.length + ':' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }
  function serializar(payload) {
    try { return JSON.stringify(payload == null ? null : payload); } catch (e) { return null; }
  }

  function guardarConflito(tipo, chave, payloadLocal) {
    /* A edição que perdeu o conflito não some: fica guardada neste aparelho
       para o usuário recuperar manualmente se precisar. */
    try { lsSet(LS_CONFLITO + tipo + '_' + chave, JSON.stringify({ quando: new Date().toISOString(), payload: payloadLocal })); } catch (e) {}
  }

  /* Estado por rascunho (em LS_SYNC.itens["tipo|chave"]):
       syncH   hash do conteúdo que a nuvem tinha no último acordo
       seenH   último hash visto neste aparelho
       editEm  quando este aparelho editou por último (desempate)
     "Sujo" = conteúdo local diferente do que a nuvem tem (seenH != syncH). */

  /* ── um ciclo completo: puxa o que mudou, empurra o que mudou ─────────── */
  function ciclo() {
    if (rodando || !configurada()) return Promise.resolve(false);
    var tipos = Object.keys(colecoes);
    if (!tipos.length) return Promise.resolve(false);
    rodando = true;

    var sync = lerSync();
    var mudouLocal = false;

    function locaisDe(tipo) {
      return Promise.resolve()
        .then(function () { return colecoes[tipo].listar(); })
        .then(function (lista) {
          var mapa = {};
          (lista || []).forEach(function (it) {
            if (it && it.chave != null && it.payload !== undefined) mapa[String(it.chave)] = it;
          });
          return mapa;
        })
        /* Falha de leitura NÃO é lista vazia: devolve null e o tipo é
           pulado neste ciclo (sem aplicar, sem enviar e — o principal —
           SEM propagar exclusão). É a trava que protege os rascunhos que
           já existem de um IndexedDB/localStorage momentaneamente
           inacessível ser confundido com "usuário apagou tudo". */
        .catch(function () { return null; });
    }

    var cadeiaTipos = Promise.resolve();
    tipos.forEach(function (tipo) {
      cadeiaTipos = cadeiaTipos.then(function () {
        var ad = colecoes[tipo];
        var cursorTipo = (sync.cursors && sync.cursors[tipo]) || '';
        return baixarMudancas(cursorTipo, tipo).then(function (remotos) {
          estado.origem = 'nuvem'; estado.erro = '';
          var maiorCursor = cursorTipo;
          remotos.forEach(function (r) {
            if (r.atualizado_em && r.atualizado_em > maiorCursor) maiorCursor = r.atualizado_em;
          });
          return locaisDe(tipo).then(function (locais) {
            if (!locais) return null; // leitura local falhou: não mexe em nada (nem no cursor)
            var promessas = Promise.resolve();

            /* 1) o que veio da nuvem */
            remotos.forEach(function (r) {
              promessas = promessas.then(function () {
                var chave = String(r.chave);
                var idSync = tipo + '|' + chave;
                var reg = sync.itens[idSync];
                var local = locais[chave];
                var hashLocal = local ? hashDe(serializar(local.payload) || '') : null;
                var sujoLocal = !!(local && (!reg || reg.syncH !== hashLocal));

                if (r.excluido) {
                  if (local && !sujoLocal) {
                    return Promise.resolve(ad.remover(chave)).then(function () {
                      delete sync.itens[idSync]; delete locais[chave]; mudouLocal = true;
                    });
                  }
                  if (!local) delete sync.itens[idSync];
                  return null; // local sujo ganha da exclusão: será reenviado abaixo
                }

                var hashRemoto = hashDe(serializar(r.payload) || '');
                if (hashLocal === hashRemoto) { // já igual (inclui o eco do nosso envio)
                  sync.itens[idSync] = { syncH: hashRemoto, seenH: hashRemoto, editEm: (reg && reg.editEm) || Date.parse(r.atualizado_em) || Date.now(), nuvemEm: r.atualizado_em };
                  return null;
                }
                if (local && sujoLocal && ((reg && reg.editEm) || 0) > (Date.parse(r.atualizado_em) || 0)) {
                  return null; // edição local é mais nova: o push abaixo resolve
                }
                if (local && sujoLocal) guardarConflito(tipo, chave, local.payload);
                return Promise.resolve(ad.aplicar({
                  chave: chave, titulo: r.titulo || '', payload: r.payload,
                  dispositivo_nome: r.dispositivo_nome || '', atualizado_em: r.atualizado_em
                })).then(function () {
                  sync.itens[idSync] = { syncH: hashRemoto, seenH: hashRemoto, editEm: Date.parse(r.atualizado_em) || Date.now(), nuvemEm: r.atualizado_em };
                  locais[chave] = { chave: chave, titulo: r.titulo || '', payload: r.payload };
                  mudouLocal = true;
                });
              });
            });

            /* 2) o que mudou aqui (envia) + exclusões locais (propaga) */
            promessas = promessas.then(function () {
              var envios = Promise.resolve();
              Object.keys(locais).forEach(function (chave) {
                var it = locais[chave];
                var texto = serializar(it.payload);
                if (texto == null) return;
                var idSync = tipo + '|' + chave;
                var reg = sync.itens[idSync];
                var h = hashDe(texto);
                if (reg && reg.syncH === h) { reg.seenH = h; return; }
                if (texto.length > CFG.limiteBytes) {
                  estado.erro = 'rascunho grande demais para a nuvem (' + chave + ')';
                  return;
                }
                envios = envios.then(function () {
                  return salvarRemoto(tipo, chave, it.titulo || '', it.payload).then(function (d) {
                    sync.itens[idSync] = { syncH: h, seenH: h, editEm: (reg && reg.editEm) || Date.now(), nuvemEm: d.atualizado_em };
                    if (d.atualizado_em > maiorCursor) maiorCursor = d.atualizado_em;
                  }).catch(function () { /* sem rede: tenta no próximo ciclo */ });
                });
              });
              /* chave conhecida que sumiu daqui = exclusão local */
              Object.keys(sync.itens).forEach(function (idSync) {
                if (idSync.indexOf(tipo + '|') !== 0) return;
                var chave = idSync.slice(tipo.length + 1);
                if (locais[chave]) return;
                envios = envios.then(function () {
                  return excluirRemoto(tipo, chave).then(function (d) {
                    delete sync.itens[idSync];
                    if (d && d.atualizado_em > maiorCursor) maiorCursor = d.atualizado_em;
                  }).catch(function () {});
                });
              });
              return envios;
            });

            return promessas.then(function () {
              if (!sync.cursors) sync.cursors = {};
              sync.cursors[tipo] = maiorCursor;
            });
          });
        });
      });
    });

    return cadeiaTipos.then(function () {
      gravarSync(sync);
      estado.ultimoCiclo = Date.now(); estado.ciclos++;
      if (mudouLocal) tipos.forEach(function (t) {
        try { if (colecoes[t].aoMudar) colecoes[t].aoMudar(); } catch (e) {}
      });
      return true;
    })
      .catch(function (e) {
        estado.origem = 'local';
        estado.erro = e && e.message ? e.message : String(e);
        return false;
      })
      .then(function (r) { rodando = false; return r; }, function (e) { rodando = false; throw e; });
  }

  /* Observa edições locais entre ciclos para carimbar a hora da edição
     (usada no desempate de conflito) sem precisar de hooks em cada módulo. */
  function observarEdicoes() {
    var sync = lerSync();
    var alterou = false;
    var cadeia = Promise.resolve();
    Object.keys(colecoes).forEach(function (tipo) {
      cadeia = cadeia.then(function () {
        return Promise.resolve().then(function () { return colecoes[tipo].listar(); }).then(function (lista) {
          (lista || []).forEach(function (it) {
            if (!it || it.chave == null || it.payload === undefined) return;
            var idSync = tipo + '|' + String(it.chave);
            var h = hashDe(serializar(it.payload) || '');
            var reg = sync.itens[idSync];
            if (!reg) { sync.itens[idSync] = { syncH: null, seenH: h, editEm: Date.now() }; alterou = true; }
            else if (reg.seenH !== h) { reg.seenH = h; reg.editEm = Date.now(); alterou = true; }
          });
        }).catch(function () {});
      });
    });
    return cadeia.then(function () { if (alterou) gravarSync(sync); });
  }

  function agendar(ms) {
    if (!configurada()) return;
    if (agendado) raiz.clearTimeout(agendado);
    agendado = raiz.setTimeout(function () { agendado = null; ciclo(); }, ms == null ? 800 : ms);
  }

  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    if (!configurada()) { estado.erro = 'nuvem nao configurada'; return; }
    agendar(600);
    raiz.setInterval(function () { observarEdicoes().then(function () { ciclo(); }); }, CFG.intervaloMs);
    try {
      raiz.addEventListener('online', function () { agendar(300); });
      if (raiz.document) raiz.document.addEventListener('visibilitychange', function () {
        if (!raiz.document.hidden) agendar(500);
      });
    } catch (e) {}
  }

  var api = {
    configurar: function (c) { if (c) { if (c.url) CFG.url = String(c.url).replace(/\/+$/, ''); if (c.anon) CFG.anon = String(c.anon); if (c.intervaloMs) CFG.intervaloMs = c.intervaloMs; } return CFG; },
    configurada: configurada,
    token: token,
    dispositivoNome: dispositivoNome,
    salvar: salvarRemoto,
    excluir: excluirRemoto,
    baixarMudancas: baixarMudancas,
    ciclo: ciclo,
    agendar: agendar,
    estado: function () { return estado; },
    iniciarColecao: function (adaptador) {
      if (!adaptador || !adaptador.tipo || typeof adaptador.listar !== 'function') return false;
      colecoes[adaptador.tipo] = {
        listar: adaptador.listar,
        aplicar: typeof adaptador.aplicar === 'function' ? adaptador.aplicar : function () {},
        remover: typeof adaptador.remover === 'function' ? adaptador.remover : function () {},
        aoMudar: adaptador.aoMudar || null
      };
      iniciar();
      agendar(600);
      return true;
    },
    _colecoes: function () { return colecoes; },
    _hash: hashDe
  };

  raiz.VooaltoRascunhos = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
