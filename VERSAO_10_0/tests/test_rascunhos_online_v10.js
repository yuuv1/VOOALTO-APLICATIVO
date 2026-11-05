'use strict';
/* ══ V10.3 — Rascunhos online: os mesmos rascunhos em todos os aparelhos ══

   O que este arquivo trava:

   1. salvar um rascunho num aparelho ENVIA para a nuvem (RPC salvar);
   2. outro aparelho (localStorage vazio) BAIXA e aplica esse rascunho;
   3. editar num aparelho atualiza o outro no ciclo seguinte;
   4. apagar num aparelho apaga no outro (a tumba viaja);
   5. sem rede nada quebra: o ciclo devolve false e tenta de novo depois;
   6. salvar o mesmo conteúdo de novo NÃO gera tráfego duplicado de escrita
      desnecessária no ciclo seguinte (hash bate = nada a enviar);
   7. os módulos Ficha Técnica e Orçamento carregam o assets/rascunhos.js e
      registram SÓ as coleções de rascunhos salvos (ficha_salva, orcamento)
      — o trabalho em andamento (ficha_viva/orcamento_vivo) fica LOCAL,
      porque cada computador edita uma ficha diferente ao mesmo tempo;
   8. a migration dos rascunhos existe com as 4 funções e a tabela fechada.

   A nuvem é um fetch falso que fala o mesmo protocolo do Supabase
   (POST /rest/v1/rpc/<função>) com a mesma semântica do SQL real.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 240) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ── Nuvem falsa: mesma semântica das funções SQL vooalto_rascunho* ────── */
function criarNuvem() {
  const tabela = new Map(); // "tipo|chave" -> linha
  let relogio = Date.parse('2026-11-05T12:00:00Z');
  let offline = false;
  const chamadas = [];
  const carimbo = () => new Date(relogio += 1000).toISOString();

  const fetchFalso = async (url, init) => {
    if (offline) throw new Error('sem rede (simulado)');
    const fn = String(url).split('/rpc/')[1];
    const args = JSON.parse(init.body || '{}');
    chamadas.push(fn);
    const resp = (corpo) => ({ ok: true, status: 200, text: async () => JSON.stringify(corpo) });
    if (fn === 'vooalto_rascunho_salvar') {
      const id = args.p_tipo + '|' + args.p_chave;
      const antigo = tabela.get(id);
      const igual = antigo && !antigo.excluido &&
        JSON.stringify(antigo.payload) === JSON.stringify(args.p_payload) && antigo.titulo === (args.p_titulo || '');
      const linha = {
        tipo: args.p_tipo, chave: args.p_chave, titulo: args.p_titulo || '',
        payload: args.p_payload, dispositivo: args.p_dispositivo,
        dispositivo_nome: args.p_dispositivo_nome, excluido: false,
        atualizado_em: igual ? antigo.atualizado_em : carimbo(),
      };
      tabela.set(id, linha);
      return resp([{ tipo: linha.tipo, chave: linha.chave, titulo: linha.titulo, dispositivo_nome: linha.dispositivo_nome, atualizado_em: linha.atualizado_em }]);
    }
    if (fn === 'vooalto_rascunho_excluir') {
      const id = args.p_tipo + '|' + args.p_chave;
      const antigo = tabela.get(id);
      const linha = Object.assign({}, antigo || { tipo: args.p_tipo, chave: args.p_chave, titulo: '', payload: {} },
        { excluido: true, payload: {}, atualizado_em: antigo && antigo.excluido ? antigo.atualizado_em : carimbo() });
      tabela.set(id, linha);
      return resp([{ tipo: linha.tipo, chave: linha.chave, excluido: true, atualizado_em: linha.atualizado_em }]);
    }
    if (fn === 'vooalto_rascunhos_desde') {
      const desde = args.p_desde || '1970-01-01T00:00:00Z';
      const linhas = [...tabela.values()]
        .filter(r => r.atualizado_em > desde && (!args.p_tipo || r.tipo === args.p_tipo))
        .sort((a, b) => a.atualizado_em < b.atualizado_em ? -1 : 1)
        .slice(0, args.p_limite || 500);
      return resp(linhas);
    }
    throw new Error('RPC desconhecida: ' + fn);
  };
  return { tabela, chamadas, fetchFalso, setOffline: v => { offline = v; } };
}

/* Um "aparelho": jsdom próprio (localStorage próprio) + coleção em memória */
function criarAparelho(nuvem, tokenAparelho) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.fetch = nuvem.fetchFalso;
  w.localStorage.setItem('vooalto_nuvem_token_v1', tokenAparelho);
  w.localStorage.setItem('va4_dispositivo_nome', tokenAparelho);
  w.eval(fs.readFileSync(path.join(BASE, 'assets', 'rascunhos.js'), 'utf8'));
  const api = w.VooaltoRascunhos;
  api.configurar({ intervaloMs: 60000 }); // o teste chama ciclo() na mão
  const dados = new Map();
  const aparelho = { falharLeitura: false };
  api.iniciarColecao({
    tipo: 'orcamento',
    listar: async () => {
      if (aparelho.falharLeitura) throw new Error('leitura local falhou (simulado)');
      return [...dados.entries()].map(([chave, payload]) => ({ chave, titulo: payload.name || '', payload }));
    },
    aplicar: async (item) => { dados.set(item.chave, item.payload); },
    remover: async (chave) => { dados.delete(chave); },
  });
  return { w, api, dados, aparelho };
}

(async () => {
  console.log('═══ RASCUNHOS ONLINE (V10.3) ═══');
  const nuvem = criarNuvem();

  /* 1+2) A salva, B (vazio) baixa */
  const A = criarAparelho(nuvem, 'maquina-A');
  A.dados.set('orc_1', { id: 'orc_1', name: 'Proposta Ana', state: { total: 100 } });
  ok('ciclo do aparelho A sincroniza sem erro', await A.api.ciclo() === true);
  ok('a nuvem recebeu o rascunho de A', nuvem.tabela.has('orcamento|orc_1'), [...nuvem.tabela.keys()]);

  const B = criarAparelho(nuvem, 'maquina-B');
  ok('ciclo do aparelho B sincroniza sem erro', await B.api.ciclo() === true);
  ok('o rascunho de A apareceu no aparelho B', B.dados.get('orc_1') && B.dados.get('orc_1').name === 'Proposta Ana', B.dados.get('orc_1'));

  /* 3) B edita, A recebe */
  B.dados.set('orc_1', { id: 'orc_1', name: 'Proposta Ana (revisada)', state: { total: 250 } });
  await wait(20);
  await B.api.ciclo();
  await A.api.ciclo();
  ok('a edição feita em B chegou ao aparelho A', A.dados.get('orc_1').state.total === 250, A.dados.get('orc_1'));

  /* 6) ciclo sem mudança não reenvia */
  const salvamentosAntes = nuvem.chamadas.filter(c => c === 'vooalto_rascunho_salvar').length;
  await A.api.ciclo();
  const salvamentosDepois = nuvem.chamadas.filter(c => c === 'vooalto_rascunho_salvar').length;
  ok('sem mudança local, o ciclo não reenvia o rascunho', salvamentosDepois === salvamentosAntes, { salvamentosAntes, salvamentosDepois });

  /* 4) A apaga, B perde também */
  A.dados.delete('orc_1');
  await A.api.ciclo();
  await B.api.ciclo();
  ok('apagar em A apagou também no aparelho B', !B.dados.has('orc_1'));

  /* 5) offline: nada quebra, e ao voltar sincroniza */
  nuvem.setOffline(true);
  B.dados.set('orc_2', { id: 'orc_2', name: 'Feito sem rede', state: {} });
  ok('sem rede o ciclo devolve false (sem lançar)', await B.api.ciclo() === false);
  ok('o estado marca modo local no offline', B.api.estado().origem === 'local', B.api.estado());
  nuvem.setOffline(false);
  await B.api.ciclo();
  ok('quando a rede volta, o rascunho offline sobe sozinho', nuvem.tabela.has('orcamento|orc_2'));

  /* 9) RASCUNHOS QUE JÁ EXISTIAM: intactos na ida e na volta ──────────────
     Simula um aparelho da versão antiga: já tem rascunhos salvos (com foto
     em base64 e estrutura aninhada) ANTES da primeira sincronização. */
  const nuvem2 = criarNuvem();
  const antigo = criarAparelho(nuvem2, 'maquina-antiga');
  const fichaAntiga = {
    id: 'orc_antigo_1', name: 'Proposta antiga — não pode quebrar',
    state: { form: { cliente: 'Ana' }, pages: [{ tableItems: [{ modelo: 'Polo', qtd: 45 }] }], signature: 'data:image/png;base64,iVBORw0KGgo=' },
  };
  antigo.dados.set('orc_antigo_1', fichaAntiga);
  const copiaLocalAntes = JSON.stringify(antigo.dados.get('orc_antigo_1'));
  await antigo.api.ciclo();
  ok('rascunho antigo sobe para a nuvem na primeira sincronização', nuvem2.tabela.has('orcamento|orc_antigo_1'));
  ok('o rascunho antigo LOCAL fica intacto (byte a byte)', JSON.stringify(antigo.dados.get('orc_antigo_1')) === copiaLocalAntes);
  const novo = criarAparelho(nuvem2, 'maquina-nova');
  await novo.api.ciclo();
  ok('o rascunho antigo chega intacto ao outro aparelho',
    JSON.stringify(novo.dados.get('orc_antigo_1')) === copiaLocalAntes, novo.dados.get('orc_antigo_1'));

  /* 10) FALHA DE LEITURA NÃO APAGA NADA (a trava principal) ──────────────
     Se o armazenamento local falhar por um instante, o motor tem que
     entender "não sei" — nunca "o usuário apagou tudo". */
  antigo.aparelho.falharLeitura = true;
  antigo.dados.delete('orc_antigo_1'); // nem deletando local com leitura quebrada...
  const excluidasAntes = nuvem2.chamadas.filter(c => c === 'vooalto_rascunho_excluir').length;
  await antigo.api.ciclo();
  const excluidasDepois = nuvem2.chamadas.filter(c => c === 'vooalto_rascunho_excluir').length;
  ok('com a leitura local falhando, NENHUMA exclusão é propagada', excluidasDepois === excluidasAntes, { excluidasAntes, excluidasDepois });
  ok('e o rascunho continua vivo na nuvem', (() => { const l = nuvem2.tabela.get('orcamento|orc_antigo_1'); return l && !l.excluido; })());
  antigo.aparelho.falharLeitura = false;
  await antigo.api.ciclo();
  ok('quando a leitura volta, a exclusão legítima volta a propagar',
    (() => { const l = nuvem2.tabela.get('orcamento|orc_antigo_1'); return l && l.excluido; })());
  antigo.w.close(); novo.w.close();

  /* 11) trava escrita no código do motor */
  const motor = fs.readFileSync(path.join(BASE, 'assets', 'rascunhos.js'), 'utf8');
  ok('o motor aborta o tipo quando a leitura local falha', motor.includes('if (!locais) return null'));

  A.w.close(); B.w.close();

  /* 7) integração nos módulos */
  const ficha = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf8');
  const orc = fs.readFileSync(path.join(BASE, 'criador_orcamento', 'index.html'), 'utf8');
  ok('a Ficha Técnica carrega o assets/rascunhos.js', ficha.includes('../assets/rascunhos.js'));
  ok('o Orçamento carrega o assets/rascunhos.js', orc.includes('../assets/rascunhos.js'));
  ok("a Ficha registra a coleção 'ficha_salva' (Minhas fichas)", ficha.includes("tipo:'ficha_salva'"));
  ok("o Orçamento registra a coleção 'orcamento' (rascunhos salvos)", orc.includes("tipo: 'orcamento'"));
  /* Decisão do usuário: cada computador edita uma ficha DIFERENTE ao mesmo
     tempo, então o trabalho EM ANDAMENTO (slot único) NÃO pode compartilhar —
     senão um aparelho pisa no outro. Estes tipos nunca podem ser registrados. */
  for (const proibido of ["tipo:'ficha_viva'", "tipo:'ficha_anterior'"])
    ok('a Ficha NÃO compartilha ' + proibido + ' (em andamento é local)', !ficha.includes(proibido));
  ok("o Orçamento NÃO compartilha 'orcamento_vivo' (em edição é local)", !orc.includes("tipo: 'orcamento_vivo'"));

  /* 8) migration */
  const mig = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261105000100_vooalto_rascunhos_online.sql'), 'utf8');
  for (const fn of ['vooalto_rascunho_salvar', 'vooalto_rascunho_excluir', 'vooalto_rascunhos_desde', 'vooalto_rascunhos_resumo'])
    ok('a migration cria ' + fn, mig.includes(fn));
  ok('a tabela vooalto_rascunhos fica com RLS ligado', /alter table public\.vooalto_rascunhos enable row level security/.test(mig));
  ok('a sincronização filtra por tipo (cursor por módulo)', mig.includes('p_tipo'));

  console.log(`\n═══ RASCUNHOS ONLINE: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
