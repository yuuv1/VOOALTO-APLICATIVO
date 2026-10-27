'use strict';
/* IndexedDB de mentira para os testes — só o que o Vooalto usa:
   open/upgrade, transações, object stores, put/get/delete/getAllKeys e openCursor
   (com update/continue). Existe para testar a migração v2 → v3 (PDF base64 → Blob)
   e o coletor de arquivos órfãos sem depender de navegador.
   Detalhe proposital: os callbacks (onsuccess/oncomplete) só disparam em setTimeout,
   igual ao IndexedDB de verdade — é isso que faz o código assíncrono do app funcionar. */

function criarIDBFalso(iniciais = {}) {
  const bancos = new Map(); // nome -> { nome, version, stores: Map<store, Map<chave, valor>> }

  for (const [nome, cfg] of Object.entries(iniciais)) {
    const db = definirApi(novoBanco(nome));
    db.version = cfg.version || 1;
    for (const [store, valores] of Object.entries(cfg.stores || {})) {
      db.stores.set(store, new Map(Object.entries(valores)));
    }
    bancos.set(nome, db);
  }

  function novoBanco(nome) {
    return { nome, version: 0, stores: new Map(), close() {} };
  }

  function itemStore(db, nome) { return db.stores.get(nome); }

  function transacao(db, modo) {
    const tx = {
      mode: modo,
      db,
      error: null,
      oncomplete: null,
      onerror: null,
      _pendentes: 0,
      _agendado: false,
      _fim: null
    };
    tx._talvezCompletar = () => {
      if (tx._pendentes > 0 || tx._agendado) return;
      tx._agendado = true;
      setTimeout(() => {
        tx._agendado = false;
        if (tx._pendentes > 0) return tx._talvezCompletar();
        if (tx.oncomplete) tx.oncomplete();
        if (tx._fim) tx._fim();
      }, 0);
    };
    tx._agendar = fn => {
      tx._pendentes++;
      setTimeout(() => {
        try { fn(); } catch (err) { tx.error = err; if (tx.onerror) tx.onerror(); }
        tx._pendentes--;
        tx._talvezCompletar();
      }, 0);
    };
    tx._quandoTerminar = cb => { tx._fim = cb; tx._talvezCompletar(); };
    tx.objectStore = nome => objetoStore(tx, nome);
    return tx;
  }

  function objetoStore(tx, nome) {
    const store = () => {
      const s = itemStore(tx.db, nome);
      if (!s) throw new Error('object store inexistente: ' + nome);
      return s;
    };
    const pedido = () => ({ onsuccess: null, onerror: null, result: undefined });
    const disparar = (rq, fn) => {
      tx._agendar(() => {
        rq.result = fn();
        if (rq.onsuccess) rq.onsuccess({ target: rq });
      });
      return rq;
    };
    return {
      put(valor, chave) { return disparar(pedido(), () => { store().set(chave, valor); return chave; }); },
      get(chave) { return disparar(pedido(), () => (store().has(chave) ? store().get(chave) : undefined)); },
      delete(chave) { return disparar(pedido(), () => { store().delete(chave); return undefined; }); },
      getAllKeys() { return disparar(pedido(), () => [...store().keys()]); },
      openCursor() {
        const rq = pedido();
        const chaves = [...store().keys()];
        let i = 0;
        const passo = () => tx._agendar(() => {
          if (i >= chaves.length) {
            rq.result = null;
            if (rq.onsuccess) rq.onsuccess({ target: rq });
            return;
          }
          const chave = chaves[i++];
          const cursor = {
            key: chave,
            primaryKey: chave,
            value: store().get(chave),
            update(novo) { store().set(chave, novo); return pedido(); },
            delete() { store().delete(chave); return pedido(); },
            continue() { passo(); }
          };
          rq.result = cursor;
          if (rq.onsuccess) rq.onsuccess({ target: rq });
        });
        passo();
        return rq;
      }
    };
  }

  function definirApi(db) {
    db.objectStoreNames = { contains: nome => db.stores.has(nome) };
    db.createObjectStore = nome => { db.stores.set(nome, new Map()); return {}; };
    db.transaction = (nomes, modo) => transacao(db, modo || 'readonly');
    return db;
  }

  const indexedDB = {
    open(nome, versao) {
      const rq = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null, transaction: null };
      setTimeout(() => {
        let db = bancos.get(nome);
        const antiga = db ? db.version : 0;
        const alvo = (versao === undefined || versao === null) ? (db ? db.version : 1) : versao;
        if (!db) { db = definirApi(novoBanco(nome)); bancos.set(nome, db); }
        rq.result = db;
        if (alvo > antiga) {
          db.version = alvo;
          const tx = transacao(db, 'versionchange');
          rq.transaction = { objectStore: nomeStore => objetoStore(tx, nomeStore) };
          if (rq.onupgradeneeded) rq.onupgradeneeded({ oldVersion: antiga, newVersion: alvo, target: rq });
          // o pedido só "abre" depois que a transação de upgrade termina (igual ao navegador)
          tx._quandoTerminar(() => { if (rq.onsuccess) rq.onsuccess({ target: rq }); });
        } else {
          if (rq.onsuccess) rq.onsuccess({ target: rq });
        }
      }, 0);
      return rq;
    },
    deleteDatabase(nome) {
      const rq = { onsuccess: null, onerror: null, result: undefined };
      setTimeout(() => { bancos.delete(nome); if (rq.onsuccess) rq.onsuccess({ target: rq }); }, 0);
      return rq;
    },
    databases: async () => [...bancos.keys()].map(name => ({ name }))
  };

  return { indexedDB, bancos };
}

const base64De = texto => Buffer.from(texto, 'utf8').toString('base64');

module.exports = { criarIDBFalso, base64De };
