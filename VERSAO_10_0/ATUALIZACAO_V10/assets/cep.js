/* ══════════════════════════════════════════════════════════════════════════
   VOOALTO — ENDEREÇO POR CEP (V10.9)
   --------------------------------------------------------------------------
   "Coloca o CEP e o endereço aparece sozinho."

   Este arquivo é autocontido: não depende de nenhuma biblioteca, funciona no
   app, em página file:// e nos testes (jsdom).

   API:
     VooaltoCep.normalizar(v)          -> '74000000' (só dígitos, até 8)
     VooaltoCep.formatar(v)            -> '74000-000'
     VooaltoCep.valido(v)              -> true/false
     VooaltoCep.buscar(v, opcoes?)     -> Promise<{ok, dados|erro, ...}>
     VooaltoCep.montarEndereco(dados)  -> 'Rua X, Bairro Y'
     VooaltoCep.montarCidade(dados)    -> 'Goiânia - GO'
     VooaltoCep.ligar(opcoes)          -> conecta um campo de CEP
     VooaltoCep.cacheLimpar()

   COMO A CONSULTA FUNCIONA
     * DOIS provedores, um atrás do outro: BrasilAPI e ViaCEP. Se um está
       fora do ar (ou o navegador bloqueia), o outro responde.
     * O resultado é guardado no localStorage. Como o app é 100% offline, a
       segunda consulta do MESMO CEP funciona sem internet — e um CEP já
       consultado nunca é consultado de novo.
     * A consulta tem TEMPO LIMITE: o app não pode travar esperando a rede.
     * NADA é apagado em caso de erro: um CEP não encontrado ou a falta de
       internet apenas avisa, e a pessoa preenche à mão.

   POR QUE OS DADOS FICAM EDITÁVEIS
     O CEP só PREENCHE o que está vazio. O que a pessoa digitou não é
     sobrescrito (o "nº 250" do cliente continua). E o que foi preenchido
     pelo CEP continua editável como qualquer outro texto — inclusive o
     número, que o CEP não traz.
   ══════════════════════════════════════════════════════════════════════════ */
(function (raiz) {
  'use strict';

  var CFG = {
    provedores: [
      { nome: 'brasilapi', url: 'https://brasilapi.com.br/api/cep/v1/{cep}', ms: 7000 },
      { nome: 'viacep', url: 'https://viacep.com.br/ws/{cep}/json/', ms: 7000 }
    ],
    cacheKey: 'vooalto_v10_cep_cache',
    cacheMax: 400,          /* quantos CEPs ficam guardados no aparelho */
    debounceMs: 700         /* espera a pessoa parar de digitar */
  };

  var LS = { cache: CFG.cacheKey };

  /* ── armazenamento ───────────────────────────────────────────────────── */
  function lsGet(k) {
    try { var s = raiz.localStorage; return s ? s.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { var s = raiz.localStorage; if (s) s.setItem(k, v); } catch (e) {}
  }
  function cacheLer() {
    var raw = lsGet(LS.cache);
    if (!raw) return {};
    try {
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function cacheSalvar(cep, dados) {
    var c = cacheLer();
    c[cep] = { d: dados, q: Date.now() };
    var chaves = Object.keys(c);
    if (chaves.length > CFG.cacheMax) {
      /* descarta os mais antigos (o CEP guardado tem timestamp) */
      chaves.sort(function (a, b) { return (c[a].q || 0) - (c[b].q || 0); });
      chaves.slice(0, chaves.length - CFG.cacheMax).forEach(function (k) { delete c[k]; });
    }
    lsSet(LS.cache, JSON.stringify(c));
  }
  function cacheLimpar() { lsSet(LS.cache, '{}'); }

  /* ── normalização ────────────────────────────────────────────────────── */
  function normalizar(v) {
    return String(v == null ? '' : v).replace(/\D+/g, '').slice(0, 8);
  }
  function formatar(v) {
    var d = normalizar(v);
    if (d.length !== 8) return d;
    return d.slice(0, 5) + '-' + d.slice(5);
  }
  function valido(v) { return normalizar(v).length === 8; }

  /* ── rede ────────────────────────────────────────────────────────────── */
  function temFetch() { return typeof raiz.fetch === 'function'; }

  function buscarComTimeout(url, ms) {
    return new Promise(function (resolve) {
      var ctrl = null;
      try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) {}
      var feito = false;
      var terminar = function (v) { if (!feito) { feito = true; resolve(v); } };
      var timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        terminar({ ok: false, erro: 'tempo', mensagem: 'A consulta do CEP demorou demais.' });
      }, ms || 7000);
      var opcoes = ctrl ? { signal: ctrl.signal } : undefined;
      try {
        raiz.fetch(url, opcoes).then(function (res) {
          clearTimeout(timer);
          if (!res || !res.ok) {
            /* 404 = CEP não existe (não é falha de rede) */
            if (res && res.status === 404) return terminar({ ok: false, erro: 'nao-encontrado', status: 404 });
            return terminar({ ok: false, erro: 'http', status: res ? res.status : 0 });
          }
          return res.json().then(function (json) {
            clearTimeout(timer);
            terminar({ ok: true, json: json });
          }, function () {
            clearTimeout(timer);
            terminar({ ok: false, erro: 'json' });
          });
        }, function () {
          clearTimeout(timer);
          terminar({ ok: false, erro: 'rede' });
        });
      } catch (e) {
        clearTimeout(timer);
        terminar({ ok: false, erro: 'rede' });
      }
    });
  }

  /* Cada provedor responde com nomes diferentes; aqui tudo vira o mesmo
     formato: {cep, logradouro, complemento, bairro, cidade, uf, fonte}. */
  function traduzir(provedor, json) {
    if (!json || typeof json !== 'object') return null;
    if (json.erro === true || json.erro === 'true') return null;
    if (json.type === 'service_error' || json.name === 'CepPromiseError') return null;
    var d;
    if (provedor === 'brasilapi') {
      d = {
        logradouro: json.street || '',
        complemento: json.complement || json.complemento || '',
        bairro: json.neighborhood || json.bairro || '',
        cidade: json.city || json.localidade || '',
        uf: json.state || json.uf || ''
      };
    } else {
      d = {
        logradouro: json.logradouro || '',
        complemento: json.complemento || '',
        bairro: json.bairro || '',
        cidade: json.localidade || json.cidade || '',
        uf: json.uf || json.state || ''
      };
    }
    if (!d.cidade && !d.uf && !d.logradouro && !d.bairro) return null;
    d.cep = normalizar(json.cep || '');
    d.fonte = provedor;
    return d;
  }

  /**
   * Consulta um CEP.
   * Devolve sempre um Promise. Nunca rejeita: o erro vem no próprio objeto,
   * para o chamador só avisar a pessoa.
   *   { ok:true,  dados:{...}, doCache:false }
   *   { ok:false, erro:'nao-encontrado'|'rede'|'tempo'|'http', mensagem:'...' }
   */
  function buscar(valor, opcoes) {
    var o = opcoes || {};
    var cep = normalizar(valor);
    if (cep.length !== 8) {
      return Promise.resolve({ ok: false, erro: 'invalido', mensagem: 'O CEP precisa ter 8 dígitos.' });
    }
    var cache = cacheLer();
    if (cache[cep] && cache[cep].d) {
      return Promise.resolve({ ok: true, dados: cache[cep].d, doCache: true });
    }
    if (!temFetch()) {
      return Promise.resolve({ ok: false, erro: 'sem-rede', mensagem: 'Este navegador não consegue consultar o CEP.' });
    }
    /* tenta os provedores em ordem; o primeiro que responder ganha */
    var ordem = CFG.provedores.slice();
    var i = 0;
    var ultimoErro = 'rede';

    function proximo() {
      if (i >= ordem.length) {
        return Promise.resolve({
          ok: false, erro: ultimoErro,
          mensagem: ultimoErro === 'nao-encontrado'
            ? 'CEP não encontrado. Confira o número.'
            : 'Não consegui consultar o CEP (sem internet?). Preencha o endereço à mão.'
        });
      }
      var p = ordem[i++];
      var url = p.url.replace('{cep}', cep);
      return buscarComTimeout(url, o.timeoutMs || p.ms).then(function (res) {
        if (!res.ok) {
          if (res.erro === 'nao-encontrado') {
            /* os provedores usam a mesma base de CEPs: se um não achou,
               os outros também não vão achar. */
            ultimoErro = 'nao-encontrado';
            return { ok: false, erro: 'nao-encontrado', mensagem: 'CEP não encontrado. Confira o número.' };
          }
          ultimoErro = res.erro;
          return proximo();
        }
        var d = traduzir(p.nome, res.json);
        if (!d) {
          ultimoErro = 'nao-encontrado';
          return { ok: false, erro: 'nao-encontrado', mensagem: 'CEP não encontrado. Confira o número.' };
        }
        cacheSalvar(cep, d);
        return { ok: true, dados: d, doCache: false };
      });
    }
    return proximo();
  }

  /* ── comparação de textos (sem acento, sem pontuação) ───────────────── */
  function norm(t) {
    return String(t == null ? '' : t)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  /* "contém" por palavra: GO não casa dentro de GOIÂNIA */
  function contem(txt, parte) {
    var a = norm(txt), b = norm(parte);
    if (!b) return false;
    if (b.length <= 3) return new RegExp('(^|[^a-z0-9])' + b + '([^a-z0-9]|$)').test(a);
    return a.indexOf(b) >= 0;
  }
  /* palavras que NÃO provam que a pessoa já escreveu um logradouro */
  var PALAVRAS_COMPLEMENTO = ['apto', 'apartamento', 'bloco', 'bl', 'sala', 'casa', 'kit',
    'lote', 'andar', 'conjunto', 'conj', 'fundos', 'terreo', 'subsolo', 'edificio',
    'edif', 'predio', 'galpao', 'unidade', 'un'];
  /* o texto só tem número/complemento (ex.: "250", "250 - Apto 12")? */
  function soNumeroComplemento(txt) {
    var tokens = String(txt == null ? '' : txt).toLowerCase().match(/[a-z\u00c0-\u00ff]+/g) || [];
    var resto = tokens.filter(function (t) { return PALAVRAS_COMPLEMENTO.indexOf(t) < 0; });
    return resto.length === 0;
  }

  /* ── complemento: o que o CEP traz NÃO é o complemento do cliente ──────
     Os provedores devolvem no campo "complemento" a FAIXA da rua coberta
     pelo CEP, não o complemento (sala/apto/bloco) de quem mora lá:
        "de 612 a 1510 - lado par"   (ViaCEP)
        "até 653 - lado ímpar"       (ViaCEP)
        "de frente com o número 1000" (BrasilAPI/OpenCEP)
     Isso não serve como endereço e polui o campo. Então: quando o texto
     parece FAIXA/indicação de logradouro, ele é descartado; quando parece
     complemento de verdade ("Bloco A", "Sala 12", "Apto 301"), é aproveitado.
     O complemento que a PESSOA escreveu no campo nunca é mexido. */
  var RE_FAIXA = [
    /\blado\s+(par|[íi]mpar)\b/,
    /\bde\s+\d+\s+a\s+\d+\b/,
    /\bat[ée]\s+\d+\b/,
    /^\s*\d+\s*-\s*\d+\s*$/,
    /\bde\s+frente\s+com\b/,
    /\breferente\s+a\b/,
    /\bentre\s+os\s+n[úu]meros\b/,
    /\bnum\.?\s*\d+\s*a\s*\d+\b/
  ];
  /* palavras que indicam um complemento de verdade */
  var PALAVRAS_COMPLEMENTO_REAL = ['bloco', 'apto', 'apartamento', 'sala', 'loja',
    'casa', 'kit', 'conjunto', 'andar', 'fundos', 'terreo', 'subsolo', 'box',
    'unidade', 'edificio', 'edif', 'predio', 'galpao', 'pavilhao', 'grupo',
    'bl', 'conj', 'un'];
  function ehFaixa(txt) {
    var t = String(txt == null ? '' : txt).toLowerCase();
    if (!t.trim()) return false;
    for (var i = 0; i < RE_FAIXA.length; i++) {
      if (RE_FAIXA[i].test(t)) return true;
    }
    return false;
  }
  function ehComplementoReal(txt) {
    var t = norm(txt);
    if (!t) return false;
    var tokens = t.split(' ');
    for (var i = 0; i < tokens.length; i++) {
      if (PALAVRAS_COMPLEMENTO_REAL.indexOf(tokens[i]) >= 0) return true;
    }
    return false;
  }
  /* devolve o complemento que vale a pena escrever no endereço:
     só quando for um complemento DE VERDADE (bloco, sala, apto...). */
  function complementoUtil(bruto) {
    var txt = String(bruto == null ? '' : bruto).trim();
    if (!txt) return '';
    if (ehFaixa(txt)) return '';
    if (!ehComplementoReal(txt)) return '';
    return txt;
  }

  /* ── pequenos utilitários de texto ────────────────────────────────────── */
  /* a "chave" de uma palavra: sem acento, sem caixa e sem pontuação */
  function chavePalavra(p) {
    return String(p == null ? '' : p).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  function palavras(txt) {
    return String(txt == null ? '' : txt).split(/\s+/)
      .filter(function (p) { return p.length; })
      .map(function (p) { return { t: p, k: chavePalavra(p) }; });
  }
  /* tira separadores órfãos: ", ,", "- 250", "250 ," */
  function limparSeparadores(txt) {
    var t = String(txt == null ? '' : txt);
    t = t.replace(/\s*,\s*,\s*/g, ', ');
    t = t.replace(/^[\s,\-\u2013\u2014]+/, '').replace(/[\s,\-\u2013\u2014]+$/, '');
    return t.replace(/\s+/g, ' ').trim();
  }
  /* remove um trecho do texto comparando palavra a palavra (sem acento,
     sem caixa e ignorando a pontuação). Devolve o texto restante. */
  function removerTrecho(txt, trecho) {
    var alvo = palavras(trecho).map(function (p) { return p.k; });
    if (!alvo.length) return txt;
    var ps = palavras(txt);
    for (var i = 0; i + alvo.length <= ps.length; i++) {
      var igual = true;
      for (var j = 0; j < alvo.length; j++) {
        if (ps[i + j].k !== alvo[j]) { igual = false; break; }
      }
      if (!igual) continue;
      var resto = ps.slice(0, i).concat(ps.slice(i + alvo.length))
        .map(function (p) { return p.t; }).join(' ');
      return limparSeparadores(resto);
    }
    return txt;
  }

  /* ── montagem dos textos ─────────────────────────────────────────────── */
  function juntar(partes) {
    return partes.filter(function (p) { return String(p || '').trim(); })
      .map(function (p) { return String(p).trim(); })
      .join(', ');
  }
  function montarEndereco(dados) {
    if (!dados) return '';
    return juntar([dados.logradouro, complementoUtil(dados.complemento), dados.bairro]);
  }
  function montarCidade(dados) {
    if (!dados) return '';
    var c = String(dados.cidade || '').trim();
    var u = String(dados.uf || '').trim();
    if (c && u) return c + ' - ' + u;
    return c || u;
  }

  /* ── MESCLAGEM: o CEP preenche, mas NUNCA apaga o que a pessoa escreveu ──
     Regras:
       * campo vazio            -> recebe o endereço inteiro do CEP
       * campo com o logradouro  -> mantém tudo (nº, complemento) e só
                                    acrescenta o bairro que faltava
       * campo só com número    -> "Rua X, 250, Bairro" (o número fica)
       * campo com outro texto  -> fica como está; o CEP só completa o bairro
     É isto que garante o número e o complemento intactos. */
  /* ctx (opcional) diz o que o CEP escreveu antes neste campo:
       { anteriorLog, anteriorBairro, anteriorCidadeTexto }
     Serve para TROCAR DE CEP: o logradouro e a cidade que o CEP tinha
     posto saem e os novos entram — mas o que a PESSOA escreveu (número,
     complemento) fica exatamente como está. */
  function mesclarEndereco(atual, dados, ctx) {
    var txt = String(atual == null ? '' : atual).trim();
    if (!dados) return txt;
    var log = String(dados.logradouro || '').trim();
    var comp = complementoUtil(dados.complemento);
    var bairro = String(dados.bairro || '').trim();
    if (!txt) return juntar([log, comp, bairro]);
    /* o logradouro que o CEP escreveu ANTES ainda está no campo: a pessoa
       não mexeu no endereço, só trocou o CEP. Então o velho sai, o novo
       entra, e o que a pessoa escreveu (nº, complemento) fica. */
    if (ctx && ctx.anteriorLog && ctx.anteriorLog !== log && contem(txt, ctx.anteriorLog)) {
      var resto = removerTrecho(txt, ctx.anteriorLog);
      if (ctx.anteriorBairro) resto = removerTrecho(resto, ctx.anteriorBairro);
      resto = limparSeparadores(resto);
      if (resto !== txt) return juntar([log, comp, resto, bairro]);
    }
    if (log && contem(txt, log)) {
      /* o logradouro já está escrito: o nº e o complemento ficam como
         estão e só o bairro que faltava é acrescentado */
      var partes = [txt];
      if (bairro && !contem(txt, bairro)) partes.push(bairro);
      return partes.join(', ');
    }
    if (soNumeroComplemento(txt)) return juntar([log, comp, txt, bairro]);
    /* já tem endereço escrito: não mexe — só completa o bairro */
    if (bairro && !contem(txt, bairro)) return txt + ', ' + bairro;
    return txt;
  }
  function mesclarCidade(atual, dados, ctx) {
    var txt = String(atual == null ? '' : atual).trim();
    if (!dados) return txt;
    var cidade = String(dados.cidade || '').trim();
    var uf = String(dados.uf || '').trim();
    if (!txt) return cidade ? (uf ? cidade + ' - ' + uf : cidade) : (uf || '');
    /* a cidade que o CEP escreveu ANTES ainda está no campo, intacta: a
       pessoa não mexeu nela, só trocou o CEP. Então a cidade nova entra
       no lugar — sem apagar nada que a pessoa tenha escrito. */
    if (ctx && ctx.anteriorCidadeTexto && norm(txt) === norm(ctx.anteriorCidadeTexto)) {
      return cidade ? (uf ? cidade + ' - ' + uf : cidade) : (uf || '');
    }
    if (cidade && !contem(txt, cidade)) return txt;   /* outro endereço: mantém */
    if (uf && !contem(txt, uf) && !/[-\u2013\u2014]/.test(txt)) return txt + ' - ' + uf;
    return txt;
  }

  /* ── o que o CEP já preencheu (compartilhado entre os campos) ──────────
     O painel de Preenchimento rápido COPIA o endereço da folha 1 para os
     campos dele. Se cada campo lembrasse sozinho do seu preenchimento, o
     painel não saberia que aquele logradouro veio do CEP — e não trocaria
     o endereço quando a pessoa digitasse outro CEP.

     Guardamos aqui os últimos preenchimentos do CEP (os mais recentes
     primeiro). Para saber se um logradouro no campo é "do CEP" ou "da
     pessoa", procuramos o registro mais recente cujo logradouro está
     naquele texto. Aí dá para trocar de CEP sem perder o número e o
     complemento que a pessoa digitou. */
  var cepPreenchidos = [];
  var CEP_PREENCHIDOS_MAX = 20;

  function registrarCep(dados) {
    var reg = {
      log: String(dados.logradouro || '').trim(),
      bairro: String(dados.bairro || '').trim(),
      cidadeTexto: montarCidade(dados),
    };
    if (!reg.log && !reg.cidadeTexto) return;
    cepPreenchidos.unshift(reg);
    if (cepPreenchidos.length > CEP_PREENCHIDOS_MAX) cepPreenchidos.length = CEP_PREENCHIDOS_MAX;
  }
  /* o registro do CEP que escreveu aquele logradouro (mais recente primeiro) */
  function cepQueEscreveu(txt) {
    var t = String(txt == null ? '' : txt);
    if (!t.trim()) return null;
    for (var i = 0; i < cepPreenchidos.length; i++) {
      var r = cepPreenchidos[i];
      if (r.log && contem(t, r.log)) return r;
    }
    return null;
  }
  /* o registro do CEP que escreveu aquela cidade */
  function cepQueEscreveuCidade(txt) {
    var t = String(txt == null ? '' : txt).trim();
    if (!t) return null;
    for (var i = 0; i < cepPreenchidos.length; i++) {
      var r = cepPreenchidos[i];
      if (r.cidadeTexto && norm(t) === norm(r.cidadeTexto)) return r;
    }
    return null;
  }

  /* ── ligar um campo de CEP ───────────────────────────────────────────── */
  /* opcoes:
       campoCep     elemento (input ou contenteditable) do CEP
       campoEndereco  elemento que recebe o endereço
       campoCidade   elemento que recebe "cidade - UF"
       soPreencherVazios  (padrão true) — não sobrescreve o que a pessoa já escreveu
       avisar(msg,tipo)   notificação (toast)
       aoPreencher(dados, textos)  retorno depois de preencher
       forcarAoBuscar      (padrão false) — true = busca mesmo com o CEP repetido
  */
  function ligar(opcoes) {
    var o = opcoes || {};
    var elCep = o.campoCep;
    if (!elCep) return null;
    var timer = null;
    var emCurso = false;
    var ultimoConsultado = '';

    /* o que ESTE lookup preencheu — para distinguir "a pessoa escreveu" de
       "foi o CEP que preencheu". O que a pessoa escreveu NUNCA é
       sobrescrito; o que o CEP preencheu pode ser refeito (é assim que
       trocar de CEP atualiza o endereço e a cidade sem perder o nº). */
    var preenchido = { end: '', cidade: '' };
    /* o que o CEP escreveu neste campo: permite trocar de CEP mantendo o
       número/complemento que a pessoa digitou */
    var doCep = { log: '', bairro: '', cidadeTexto: '' };

    function ehCampoFormulario(el) {
      if (!el || !el.tagName) return false;
      var tg = String(el.tagName).toUpperCase();
      return tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT';
    }
    function lerValor(el) {
      if (!el) return '';
      if (ehCampoFormulario(el)) return el.value == null ? '' : String(el.value);
      if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) {
        return el.textContent || '';
      }
      return el.value != null ? String(el.value) : (el.textContent || '');
    }
    function escrever(el, txt) {
      if (!el) return;
      if (ehCampoFormulario(el)) el.value = txt;
      else el.textContent = txt;
    }
    function digitos(el) { return normalizar(lerValor(el)); }

    function avisar(msg, tipo) {
      if (typeof o.avisar === 'function') { try { o.avisar(msg, tipo); } catch (e) {} }
    }

    /* preenche um campo: sobrescreve se estiver vazio OU se for exatamente o
       que o CEP escreveu antes (aí o dado do CEP está desatualizado);
       nunca sobrescreve texto escrito pela pessoa. */
    function aplicarCampo(el, txt, rotulo, mantidos, mesclar, dados, ctx) {
      if (!el) return false;
      var atual = String(lerValor(el) || '').trim();
      var novo = (typeof mesclar === 'function') ? String(mesclar(atual, dados, ctx) || '').trim() : txt;
      if (!novo) { if (atual) mantidos.push(rotulo); return false; }
      if (novo === atual) { mantidos.push(rotulo); return false; }
      escrever(el, novo);
      preenchido[rotulo] = novo;
      return true;
    }

    function mesclarEnd(atual, dados) {
      var reg = cepQueEscreveu(atual);
      var ctx = {
        anteriorLog: reg ? reg.log : '',
        anteriorBairro: reg ? reg.bairro : '',
      };
      if (typeof o.mesclarEndereco === 'function') return o.mesclarEndereco(atual, dados, ctx);
      return atual ? atual : montarEndereco(dados);
    }
    function mesclarCid(atual, dados) {
      var reg = cepQueEscreveuCidade(atual);
      var ctx = { anteriorCidadeTexto: reg ? reg.cidadeTexto : '' };
      if (typeof o.mesclarCidade === 'function') return o.mesclarCidade(atual, dados, ctx);
      return atual ? atual : montarCidade(dados);
    }

    function preencher(dados) {
      var mantidos = [];
      var mEnd = aplicarCampo(o.campoEndereco, null, 'endereço', mantidos, mesclarEnd, dados);
      var mCid = aplicarCampo(o.campoCidade, null, 'cidade', mantidos, mesclarCid, dados);
      /* guarda o que o CEP colocou desta vez — é o que será trocado se a
         pessoa digitar outro CEP depois (mantendo o que ela escreveu) */
      doCep.log = String(dados.logradouro || '').trim();
      doCep.bairro = String(dados.bairro || '').trim();
      doCep.cidadeTexto = montarCidade(dados);
      registrarCep(dados);
      return { mudou: mEnd || mCid, mantidos: mantidos, end: mEnd ? lerValor(o.campoEndereco) : '', cidade: mCid ? lerValor(o.campoCidade) : '' };
    }

    function consultar(forcar) {
      var d = digitos(elCep);
      if (d.length !== 8) return Promise.resolve(null);
      if (emCurso) return Promise.resolve(null);
      if (!forcar && d === ultimoConsultado) return Promise.resolve(null);
      emCurso = true;
      return buscar(d, { timeoutMs: o.timeoutMs }).then(function (res) {
        emCurso = false;
        if (!res || !res.ok) {
          if (res && res.erro === 'nao-encontrado') avisar('CEP não encontrado. Confira o número.', 'erro');
          else avisar((res && res.mensagem) || 'Não consegui consultar o CEP.', 'erro');
          return null;
        }
        ultimoConsultado = d;
        var r = preencher(res.dados);
        if (r.mudou) {
          avisar('Endereço preenchido pelo CEP — pode editar.', '');
        } else if (r.mantidos.length) {
          var oQue = r.mantidos.length > 1 ? 'endereço e cidade' : r.mantidos[0];
          avisar('CEP consultado — ' + oQue + ' já estava preenchido e foi mantido.', '');
        }
        if (typeof o.aoPreencher === 'function') {
          try { o.aoPreencher(res.dados, r, res.doCache); } catch (e) {}
        }
        return res;
      }, function () {
        emCurso = false;
        avisar('Não consegui consultar o CEP.', 'erro');
        return null;
      });
    }

    function agendar() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { consultar(false); }, CFG.debounceMs);
    }

    function aoDigitar() {
      var d = digitos(elCep);
      if (d.length === 8) agendar();
    }

    function aoSair() {
      if (timer) { clearTimeout(timer); timer = null; }
      consultar(false);
    }

    if (elCep.addEventListener) {
      elCep.addEventListener('input', aoDigitar);
      elCep.addEventListener('blur', aoSair);
      /* Enter no contenteditable não sai do campo: força a consulta */
      elCep.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); consultar(true); }
      });
    }

    return {
      consultar: consultar,
      consultarAgora: function () { return consultar(true); },
      parar: function () { if (timer) clearTimeout(timer); }
    };
  }

  var api = {
    normalizar: normalizar,
    formatar: formatar,
    valido: valido,
    buscar: buscar,
    montarEndereco: montarEndereco,
    montarCidade: montarCidade,
    mesclarEndereco: mesclarEndereco,
    mesclarCidade: mesclarCidade,
    norm: norm,
    contem: contem,
    soNumeroComplemento: soNumeroComplemento,
    complementoUtil: complementoUtil,
    ehFaixa: ehFaixa,
    ligar: ligar,
    cacheLimpar: cacheLimpar,
    CFG: CFG,
    _cache: cacheLer
  };

  raiz.VooaltoCep = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
