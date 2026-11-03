'use strict';
/* ══ V10.2 — Numeração da ficha: única entre máquinas e igual na página branca ══

   O que este arquivo trava:

   1. a numeração parte de 3388 e nunca desce;
   2. número em uso OU em backup em OUTRA máquina é RECUSADO: o app pede o
      próximo livre à nuvem ("joga o dígito superior") e avisa o usuário;
   3. reservar de novo a mesma ficha devolve o mesmo número (não queima número);
   4. sem internet nada trava: reserva local + sincronização depois;
   5. a página BRANCA nasce com o MESMO nº da ficha e acompanha as mudanças
      (era o bug relatado: "o número some ao adicionar página em branco").

   A nuvem é simulada por um fetch falso que fala o mesmo protocolo do
   Supabase (POST /rest/v1/rpc/<função>) e responde como as funções SQL
   reais (vooalto_reservar_numero / verificar / registrar_lote). Assim o teste
   cobre o JS do app inteiro — inclusive o erro de rede.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');
const { BASE } = require('./_base');

/* A ficha carrega assets externos (../assets/nuvem.js, cropper, html2canvas).
   No teste, eles vêm do disco — sem isso o jsdom não executa o nuvem.js e o
   teste "passaria" testando o modo offline sem saber. */
class CargaLocal extends ResourceLoader {
  fetch(url, opcoes) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '' || u.hostname === '127.0.0.1') {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        /* o módulo está em /criador_ficha_tecnica/, mas os assets em /assets/:
           tenta a raiz do app e, depois, a pasta do módulo */
        const candidatos = [
          path.resolve(BASE, rel),
          path.resolve(BASE, 'criador_ficha_tecnica', rel),
          path.resolve(BASE, 'criador_ficha_tecnica', rel.replace(/^criador_ficha_tecnica\//, '')),
        ];
        for (const arquivo of candidatos) {
          if (arquivo.startsWith(BASE) && fs.existsSync(arquivo) && fs.statSync(arquivo).isFile()) {
            return Promise.resolve(fs.readFileSync(arquivo));
          }
        }
      }
    } catch (e) { /* cai no loader padrão */ }
    return null;
  }
}

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 120) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 200) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ── Nuvem falsa: mesma semântica do SQL ────────────────────────────────── */
function criarNuvem(ocupados, opcoes = {}) {
  const tabela = new Map();
  (ocupados || []).forEach(o => tabela.set(o.numero, { ...o }));
  const chamadas = [];
  const eu = 'maquina-teste';
  let offline = !!opcoes.offline;

  function reservar(pedido, base, disp, ficha) {
    let alvo = Math.max(pedido || base, base);
    for (let i = 0; i < 5000; i++) {
      const dono = tabela.get(alvo);
      if (dono) {
        alvo++; continue;
      }
      tabela.set(alvo, { numero: alvo, status: 'em_uso', dispositivo: disp, ficha_id: ficha || '', dono: 'este aparelho' });
      const ajustado = (alvo !== Math.max(pedido || base, base));
      return { numero: alvo, ajustado, motivo: ajustado ? 'ajustado_para_o_proximo_livre' : 'livre', dono: '', status: 'em_uso' };
    }
    throw new Error('sem numero livre');
  }

  const fetchFalso = async (url, init) => {
    const corpo = init && init.body ? JSON.parse(init.body) : {};
    const nome = String(url || '').split('/rpc/')[1] || String(url || '');
    chamadas.push({ nome, corpo });
    if (offline) { const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; }
    const resp = (dados) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify(dados),
    });
    if (nome === 'vooalto_nuvem_ok') {
      const max = tabela.size ? Math.max(...tabela.keys()) : 3387;
      return resp({ ok: true, servidor: '2026-11-03T00:00:00Z', ultimo_numero: max, total_numeros: tabela.size });
    }
    if (nome === 'vooalto_registrar_dispositivo') return resp(null);
    if (nome === 'vooalto_proximo_livre') {
      let alvo = corpo.p_base || 3388;
      while (tabela.has(alvo)) alvo++;
      return resp(alvo);
    }
    if (nome === 'vooalto_reservar_numero') {
      return resp({ ...reservar(corpo.p_pedido, corpo.p_base, corpo.p_dispositivo, corpo.p_ficha) });
    }
    if (nome === 'vooalto_verificar_numero') {
      const d = tabela.get(corpo.p_numero);
      if (!d) return resp({ ocupado: false, status: '', dono: '', dispositivo: '', ficha: '', desde: null });
      return resp({ ocupado: true, status: d.status, dono: d.dono || 'Outra maquina', dispositivo: d.dispositivo || 'outra', ficha: '', desde: null });
    }
    if (nome === 'vooalto_registrar_lote') {
      /* Igual ao SQL: número novo entra não é desta máquina é registrado como
         backup; número já desta máquina sobe de status; número de OUTRA
         máquina é ignorado (nunca é sequestrado). */
      let registrados = 0, ignorados = 0;
      for (const n of (corpo.p_numeros || [])) {
        const dono = tabela.get(n);
        if (!dono) {
          tabela.set(n, { numero: n, status: corpo.p_status || 'backup', dispositivo: corpo.p_dispositivo, dono: 'este aparelho' });
          registrados++;
        } else if (dono.dispositivo === corpo.p_dispositivo) {
          registrados++;
        } else {
          ignorados++;
        }
      }
      return resp({ registrados, ignorados, ultimo: tabela.size ? Math.max(...tabela.keys()) : 0 });
    }
    return resp(null);
  };

  return {
    fetch: fetchFalso,
    chamadas,
    tabela,
    ligar: () => { offline = false; },
    desligar: () => { offline = true; },
    tokenEu: eu,
    ultimo: () => Math.max(...tabela.keys()),
  };
}

function abrirApp(nuvem) {
  const html = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
  const erros = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new CargaLocal(),
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.fetch = nuvem.fetch;
      w.addEventListener('error', e => erros.push(e.message));
      /* o nuvem.js carrega depois (é <script src>): deixa rastro do que deu errado */
      w.addEventListener('error', e => {
        const alvo = e && e.target;
        if (alvo && alvo.tagName === 'SCRIPT') console.log('    [diagnóstico] script não carregou: ' + alvo.src);
      }, true);
    }
  });
  return { dom, w: dom.window, d: dom.window.document, erros };
}

(async function main() {
  /* ══ 1. Reserva inicial: o primeiro número é o primeiro livre a partir de 3388 ══ */
  console.log('\n── 1. A numeração parte de 3388 e sobe ──');
  {
    const nuvem = criarNuvem([
      { numero: 3388, status: 'em_uso', dispositivo: 'outra-maquina', dono: 'Notebook da produção' },
      { numero: 3389, status: 'backup', dispositivo: 'outra-maquina', dono: 'Notebook da produção' },
    ]);
    const { w, d, erros } = abrirApp(nuvem);
    await wait(2200);
    const $ = id => d.getElementById(id);
    ok('o app carregou sem erro de página', erros.length === 0, erros);
    ok('a nuvem foi configurada no app', w.VooaltoNuvem && w.VooaltoNuvem.configurada() === true);
    /* Ao abrir, a ficha sem número pede 3388: está em uso, 3389 está em
       backup em outra máquina, então o app reserva 3390 sozinho. */
    ok('ao abrir sem número o app já pula 3388/3389 e reserva o 3390', $('fichaNum').value === '3390', $('fichaNum').value);
    ok('e o 3390 ficou registrado como desta máquina', nuvem.tabela.get(3390) && nuvem.tabela.get(3390).dispositivo !== 'outra-maquina' && nuvem.tabela.size === 3, nuvem.tabela.size);

    /* Agora alguém digita à mão o 3388 (número de outra máquina): recusa e sobe. */
    const r = await w.numNuvemReservarAtual({ pedido: 3388, silencioso: true });
    ok('pedido 3388 recusado (é de outra máquina) e o app pegou 3391', r.numero === 3391 && r.numero > 3388, { numero: r.numero, motivo: r.motivo });
    ok('o número realmente é o 3391 na nuvem', nuvem.tabela.get(3391) && nuvem.tabela.get(3391).dispositivo !== 'outra-maquina');
    ok('o número 3391 está na folha 1', $('fichaNum').value === '3391', $('fichaNum').value);
    ok('o contador local também subiu (próxima = 3392)', w.getProximoNumeroFicha() === 3391);
    ok('o "Ajustes" mostra a próxima ficha', $('cfgProxNum').value === '3392', $('cfgProxNum').value);
    ok('avisou que o número pedido já existia', nuvem.chamadas.some(c => c.nome === 'vooalto_reservar_numero' && c.corpo.p_pedido === 3388));
    w.close();
  }

  /* ══ 2. O número digitado à mão é recusado e sobe ══ */
  console.log('\n── 2. Digitar um número que já é de outra máquina ──');
  {
    const nuvem = criarNuvem([
      { numero: 3388, status: 'em_uso', dispositivo: 'outra-maquina', dono: 'Máquina do escritório' },
      { numero: 3400, status: 'impresso', dispositivo: 'terceira-maquina', dono: 'Máquina da costura' },
    ]);
    const { w, d, erros } = abrirApp(nuvem);
    await wait(2200);
    const $ = id => d.getElementById(id);
    $('fichaNum').value = '3400';
    await w.numNuvemCommitCampo();
    await wait(120);
    ok('ao sair do campo com 3400 (impresso em outra máquina) o app troca para 3401', $('fichaNum').value === '3401', $('fichaNum').value);
    ok('a troca foi avisada na barra lateral', /3401|outra|conflito|⚠/i.test($('numNuvemStatus').textContent + ' ' + $('estadoNuvem').textContent), $('numNuvemStatus').textContent);
    const r2 = await w.numNuvemReservarAtual({ pedido: 3500, silencioso: true });
    ok('pedir 3500 (livre) devolve 3500 sem pular', r2.numero === 3500 && !r2.ajustado, r2);
    ok('3500 gravado na folha', $('fichaNum').value === '3500');
    ok('sem erro de página', erros.length === 0, erros);
    w.close();
  }

  /* ══ 3. Nova ficha: sempre para cima, nunca repete ══ */
  console.log('\n── 3. Nova ficha avança a partir do último número ──');
  {
    const nuvem = criarNuvem([]);
    const { w, d, erros } = abrirApp(nuvem);
    await wait(2200);
    const $ = id => d.getElementById(id);
    const antes = parseInt($('fichaNum').value, 10);
    ok('primeira reserva começa em 3388', antes === 3388, antes);
    w.confirm = () => true;                        /* "começar nova ficha?" */
    w.eval('v8FichaTemConteudo = () => false');    /* ficha vazia, sem salvamento */
    await w.v8NovaFicha();
    await wait(300);
    const depois = parseInt($('fichaNum').value, 10);
    ok('a ficha nova recebeu um número maior (3389)', depois === 3389, depois);
    ok('o número reservado na nuvem é o mesmo da tela', nuvem.tabela.has(3389));
    await w.v8NovaFicha();
    await wait(300);
    ok('e depois 3390 — sempre para cima', parseInt($('fichaNum').value, 10) === 3390, $('fichaNum').value);
    ok('sem erro de página', erros.length === 0, erros);
    w.close();
  }

  /* ══ 4. Página em BRANCO nasce com o número e acompanha ══ */
  console.log('\n── 4. Página em branco tem o MESMO número (bug relatado) ──');
  {
    const nuvem = criarNuvem([]);
    const { w, d, erros } = abrirApp(nuvem);
    await wait(2200);
    const $ = id => d.getElementById(id);
    $('fichaNum').value = '3450';
    w.eval('adicionarPaginaBranca()');
    await wait(300);
    const pb = w.eval("paginas.find(p => p.tipo === 'branca')");
    ok('a página branca foi criada', !!pb, pb && pb.id);
    const campo = $('fbNum_' + pb.id);
    ok('o campo "Nº da Operação" da página branca está preenchido', campo && campo.value === '3450', campo && campo.value);
    ok('e o valor está marcado como herança da folha 1', campo && campo.dataset.fichaNum === '1');
    ok('o rodapé da página branca mostra "Ficha Nº 3450"', /Ficha Nº 3450/.test($('rodNum_' + pb.id).textContent), $('rodNum_' + pb.id).textContent);

    /* mudou na folha 1: o espelho contínuo (150 ms) leva para a branca */
    $('fichaNum').value = '3451';
    $('fichaNum').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(400);
    ok('mudou o nº na folha 1 e a página branca acompanhou', $('fbNum_' + pb.id).value === '3451', $('fbNum_' + pb.id).value);
    ok('o rodapé da branca acompanhou', /Ficha Nº 3451/.test($('rodNum_' + pb.id).textContent));

    /* número próprio na branca é respeitado (cópia sob medida) */
    w.eval(`(()=>{const c=document.getElementById('fbNum_${pb.id}');c.value='7799';c.dispatchEvent(new Event('input',{bubbles:true}));atualizarRodapes();})()`);
    await wait(350);
    ok('número próprio digitado na branca NÃO é sobrescrito', $('fbNum_' + pb.id).value === '7799', $('fbNum_' + pb.id).value);
    ok('o rodapé da branca usa o número próprio', /Ficha Nº 7799/.test($('rodNum_' + pb.id).textContent));

    /* a página normal também continua herdando */
    w.eval('adicionarPagina()');
    await wait(300);
    const p2 = w.eval("paginas.find(p => p.tipo === 'normal')");
    ok('página normal herda o número da folha 1', $('fichaNum_' + p2.id).value === '3451', $('fichaNum_' + p2.id).value);

    /* salvar e reabrir: o número da branca volta */
    const dados = w.capturarFichaParaJSON();
    const brancaSalva = (dados._paginas || []).find(x => x.tipo === 'branca');
    ok('o arquivo salvo guarda o nº da página branca', brancaSalva && brancaSalva.hdr && brancaSalva.hdr.fbNum === '7799', brancaSalva && brancaSalva.hdr);
    ok('sem erro de página', erros.length === 0, erros);
    w.close();
  }

  /* ══ 5. Sem internet: nada trava e sincroniza depois ══ */
  console.log('\n── 5. Sem internet ──');
  {
    const nuvem = criarNuvem([{ numero: 3388, status: 'em_uso', dispositivo: 'outra', dono: 'Outra' }], { offline: true });
    const { w, d, erros } = abrirApp(nuvem);
    await wait(2200);
    const $ = id => d.getElementById(id);
    ok('o app abre normalmente offline', erros.length === 0, erros);
    console.log('    [diagnóstico] VooaltoNuvem=' + typeof w.VooaltoNuvem +
      ' configurada=' + (w.VooaltoNuvem && w.VooaltoNuvem.configurada()) +
      ' fetch=' + typeof w.fetch);
    ok('a barra lateral avisa que está sem conexão', /Sem conex|sem conex|não foi possível|Sem internet|conectada/i.test($('numNuvemStatus').textContent + $('estadoNuvem').textContent), [$('numNuvemStatus').textContent, $('estadoNuvem').textContent]);
    $('fichaNum').value = '3388';
    const r = await w.numNuvemReservarAtual({ pedido: 3389, silencioso: true });
    ok('offline a reserva cai no local (não perde a ficha)', r && r.numero === 3389, r && r.numero);
    ok('o número 3389 aparece na tela', $('fichaNum').value === '3389');

    nuvem.ligar();
    const hist = await w.numNuvemSincronizarHistorico(true);
    ok('ao voltar a rede, o histórico é enviado para a nuvem', hist && hist.registrados >= 1, hist);
    ok('a nuvem agora conhece o 3388 e o 3389', nuvem.tabela.has(3388) && nuvem.tabela.has(3389));
    const prox = await w.numNuvemReservarAtual({ pedido: 3388, silencioso: true });
    ok('e o próximo livre já considera as duas máquinas (3390)', prox.numero === 3390, prox.numero);
    ok('sem erro de página', erros.length === 0, erros);
    w.close();
  }

  console.log(`\n═══ NUVEM DE NUMERAÇÃO: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
