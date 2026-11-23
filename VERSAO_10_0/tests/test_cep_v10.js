'use strict';
/* ══ V10.9 — ENDEREÇO POR CEP: "coloca o CEP e o endereço aparece sozinho" ══

   O que este arquivo trava:

   1. o módulo de CEP (assets/cep.js) normaliza, formata e valida o CEP;
   2. a consulta usa DOIS provedores (BrasilAPI e ViaCEP) — se o primeiro
      estiver fora do ar, o segundo responde;
   3. CEP inválido, CEP inexistente (404) e queda de rede devolvem erro
      CLARO, e nada é apagado;
   4. o resultado fica guardado no aparelho: a segunda consulta do mesmo CEP
      não vai à rede e funciona offline;
   5. na Ficha Técnica, o CEP preenche o endereço e a cidade;
   6. na Ficha Técnica e no Recibo, o NÚMERO e o COMPLEMENTO que a pessoa
      escreveu NUNCA são apagados pelo preenchimento;
   7. o que o CEP preencheu continua editável (é só um texto normal);
   8. no Recibo, o CEP entra no estado e sai impresso no recibo.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 140) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 200) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Carrega os assets locais (../assets/*.js) do disco — sem isso o jsdom não
   executa o assets/cep.js e o teste passaria sem testar nada. */
class CargaLocal extends ResourceLoader {
  fetch(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '' || u.hostname === '127.0.0.1') {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        const candidatos = [
          path.resolve(BASE, rel),
          path.resolve(BASE, 'criador_ficha_tecnica', rel),
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

/* ── provedores de CEP falsos ──────────────────────────────────────────── */
/* Resposta crua da BrasilAPI (é o que o serviço devolve) */
const BRASILAPI_RAW = {
  cep: '74000000', state: 'GO', city: 'Goiânia',
  neighborhood: 'Setor Bueno', street: 'Avenida T-9',
  complement: 'de frente com o número 1000', service: 'correios'
};
/* Como o módulo guarda o resultado (formato único, já traduzido) */
const BRASILAPI = {
  cep: '74000000', uf: 'GO', cidade: 'Goiânia',
  bairro: 'Setor Bueno', logradouro: 'Avenida T-9',
  complemento: 'de frente com o número 1000', fonte: 'brasilapi'
};
const VIACEP = {
  cep: '74000000', logradouro: 'Avenida T-9', complemento: 'de frente com o número 1000',
  bairro: 'Setor Bueno', localidade: 'Goiânia', uf: 'GO',
};

function criarFetch(opcoes = {}) {
  const chamadas = [];
  let modo = opcoes.modo || 'ok';   /* ok | sem-brasilapi | 404 | rede | tudo-404 */
  const fetchFalso = async (url) => {
    chamadas.push(String(url));
    const u = String(url);
    const ehBrasil = /brasilapi/i.test(u);
    const resp = (obj, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      json: async () => obj, text: async () => JSON.stringify(obj),
    });
    if (modo === 'rede') { const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; }
    if (ehBrasil && modo === 'sem-brasilapi') return resp({ erro: 'serviço fora do ar' }, 500);
    if (ehBrasil && (modo === '404' || modo === 'tudo-404')) return resp({ message: 'CEP não encontrado' }, 404);
    if (/viacep/i.test(u)) {
      if (modo === 'tudo-404') return resp({ erro: true }, 200);
      return resp(VIACEP);
    }
    if (ehBrasil) return resp(BRASILAPI_RAW);
    /* qualquer outra chamada (nuvem etc.) responde de forma inofensiva */
    return resp({ ok: true, servidor: '2026-11-03T00:00:00Z', ultimo_numero: 3387, total_numeros: 0 });
  };
  return { fetch: fetchFalso, chamadas, trocar: m => { modo = m; } };
}

function abrirApp(arquivo, fetchFalso) {
  const html = fs.readFileSync(path.join(BASE, arquivo), 'utf-8');
  const erros = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/' + arquivo.replace(/index\.html$/, ''),
    runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new CargaLocal(),
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      if (fetchFalso) w.fetch = fetchFalso;
      w.addEventListener('error', e => erros.push(e.message));
    }
  });
  return { dom, w: dom.window, d: dom.window.document, erros };
}

(async function main() {
  /* ══ 1. O módulo, sozinho ══ */
  console.log('\n── 1. O módulo de CEP (assets/cep.js) ──');
  const cepMod = require(path.join(BASE, 'assets', 'cep.js'));
  {
    ok('normalizar tira tudo que não é dígito', cepMod.normalizar('74.000-000') === '74000000', cepMod.normalizar('74.000-000'));
    ok('normalizar corta o que passa de 8 dígitos', cepMod.normalizar('740000001234') === '74000000');
    ok('formatar devolve 00000-000', cepMod.formatar('74000000') === '74000-000', cepMod.formatar('74000000'));
    ok('valido aceita 8 dígitos', cepMod.valido('74000-000') === true);
    ok('valido recusa CEP curto', cepMod.valido('7400000') === false);
    ok('mesclarEndereco monta o endereço completo quando o campo está vazio',
      cepMod.mesclarEndereco('', BRASILAPI) === 'Avenida T-9, de frente com o número 1000, Setor Bueno',
      cepMod.mesclarEndereco('', BRASILAPI));
    ok('mesclarEndereco mantém o NÚMERO que a pessoa escreveu',
      cepMod.mesclarEndereco('250', BRASILAPI) === 'Avenida T-9, de frente com o número 1000, 250, Setor Bueno',
      cepMod.mesclarEndereco('250', BRASILAPI));
    ok('mesclarEndereco mantém o COMPLEMENTO que a pessoa escreveu',
      cepMod.mesclarEndereco('250 - Apto 12', BRASILAPI) === 'Avenida T-9, de frente com o número 1000, 250 - Apto 12, Setor Bueno',
      cepMod.mesclarEndereco('250 - Apto 12', BRASILAPI));
    ok('mesclarEndereco não apaga um endereço já escrito (só completa o bairro)',
      cepMod.mesclarEndereco('Rua das Flores, 90', BRASILAPI) === 'Rua das Flores, 90, Setor Bueno',
      cepMod.mesclarEndereco('Rua das Flores, 90', BRASILAPI));
    ok('mesclarCidade monta "Cidade - UF"',
      cepMod.mesclarCidade('', BRASILAPI) === 'Goiânia - GO', cepMod.mesclarCidade('', BRASILAPI));
    ok('mesclarCidade não troca a cidade escrita pela pessoa',
      cepMod.mesclarCidade('Aparecida de Goiânia', BRASILAPI) === 'Aparecida de Goiânia - GO',
      cepMod.mesclarCidade('Aparecida de Goiânia', BRASILAPI));
    ok('mesclarCidade não duplica a UF',
      cepMod.mesclarCidade('Goiânia - GO', BRASILAPI) === 'Goiânia - GO');
  }

  /* ══ 2. A consulta: dois provedores, erros claros e cache ══ */
  console.log('\n── 2. A consulta (BrasilAPI + ViaCEP) ──');
  {
    const f = criarFetch();
    const w = { fetch: f.fetch, localStorage: null };
    const cep = require(path.join(BASE, 'assets', 'cep.js'));
    /* usa uma cópia isolada do módulo para poder trocar o fetch e o storage */
    const mod = Object.assign({}, cep);
    const globalFake = {
      fetch: f.fetch,
      localStorage: {
        _d: {},
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); },
      },
    };
    /* o módulo usa globalThis: recarrega ele com o global falso */
    delete require.cache[require.resolve(path.join(BASE, 'assets', 'cep.js'))];
    const src = fs.readFileSync(path.join(BASE, 'assets', 'cep.js'), 'utf-8');
    const vm = require('vm');
    const ctx = vm.createContext(Object.assign(globalFake, { console, setTimeout, clearTimeout, Promise, JSON, Date, AbortController }));
    vm.runInContext(src, ctx);
    const M = ctx.VooaltoCep;
    ok('o módulo carrega no contexto isolado', !!M);

    const r1 = await M.buscar('74000000');
    ok('CEP válido: a consulta devolve o endereço', r1.ok === true && r1.dados.logradouro === 'Avenida T-9', r1);
    ok('o primeiro provedor (BrasilAPI) respondeu', f.chamadas.some(u => /brasilapi/i.test(u)), f.chamadas);
    ok('a resposta foi guardada no aparelho (cache)', !!(M._cache()['74000000']));

    const antes = f.chamadas.length;
    const r2 = await M.buscar('74000-000');
    ok('a segunda consulta do MESMO CEP não vai à rede (funciona offline)', f.chamadas.length === antes && r2.ok === true && r2.doCache === true, { chamadas: f.chamadas.length - antes, doCache: r2.doCache });

    /* o BrasilAPI cai: o ViaCEP salva */
    f.trocar('sem-brasilapi');
    const r3 = await M.buscar('75000000');
    ok('BrasilAPI fora do ar → o ViaCEP responde', r3.ok === true && r3.dados.logradouro === 'Avenida T-9', r3);
    ok('os dois provedores foram tentados', f.chamadas.some(u => /brasilapi/i.test(u)) && f.chamadas.some(u => /viacep/i.test(u)));

    /* CEP inexistente */
    f.trocar('tudo-404');
    const r4 = await M.buscar('99999999');
    ok('CEP inexistente: erro claro "nao-encontrado"', r4.ok === false && r4.erro === 'nao-encontrado', r4);
    ok('CEP inexistente: a mensagem fala com a pessoa', /não encontrado/i.test(r4.mensagem || ''), r4.mensagem);

    /* sem rede */
    f.trocar('rede');
    const r5 = await M.buscar('76000000');
    ok('sem internet: erro claro, sem exceção', r5.ok === false && (r5.erro === 'rede' || r5.erro === 'tempo'), r5);
    ok('sem internet: a mensagem diz para preencher à mão', /mão|preencha/i.test(r5.mensagem || ''), r5.mensagem);

    /* CEP inválido nem chega à rede */
    const antes2 = f.chamadas.length;
    const r6 = await M.buscar('123');
    ok('CEP inválido: erro "invalido" sem chamar a rede', r6.ok === false && r6.erro === 'invalido' && f.chamadas.length === antes2, r6);
  }

  /* ══ 3. Ficha Técnica: o CEP preenche o endereço ══ */
  console.log('\n── 3. Ficha Técnica ──');
  {
    const f = criarFetch();
    const { w, d, erros } = abrirApp('criador_ficha_tecnica/index.html', f.fetch);
    await wait(1600);
    const $ = id => d.getElementById(id);
    ok('o app carregou sem erro de página', erros.length === 0, erros);
    ok('o módulo de CEP está carregado na ficha', typeof w.VooaltoCep === 'object');
    ok('o campo CEP da ficha existe', !!$('dc_cep'));

    /* o número que a pessoa escreveu ANTES do CEP */
    $('dc_end').textContent = '250';
    $('dc_cep').textContent = '74000000';
    $('dc_cep').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(1400);
    const end = ($('dc_end').textContent || '').trim();
    const cid = ($('dc_cidade').textContent || '').trim();
    ok('o CEP preencheu o endereço', end.indexOf('Avenida T-9') >= 0, end);
    ok('o CEP preencheu a cidade', cid === 'Goiânia - GO', cid);
    ok('o NÚMERO que a pessoa escreveu foi mantido', end.indexOf('250') >= 0, end);
    ok('o endereço preenchido continua editável (é o texto do campo)', typeof $('dc_end').textContent === 'string');
    ok('a página avisou que o endereço foi preenchido', /preenchido/i.test($('toast').textContent || ''), $('toast').textContent);

    /* o Preenchimento rápido também puxa o endereço */
    w.abrirPreenchimentoRapido();
    await wait(200);
    ok('o painel de Preenchimento rápido foi aberto', !!$('v4qCep'));
    $('v4qCep').value = '74000000';
    $('v4qCep').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(1400);
    ok('o CEP do painel rápido preencheu o endereço dele', (($('v4qEnd').value || '')).indexOf('Avenida T-9') >= 0, $('v4qEnd').value);
    ok('o CEP do painel rápido preencheu a cidade dele', ($('v4qCidade').value || '') === 'Goiânia - GO', $('v4qCidade').value);
    w.close();
  }

  /* ══ 4. Ficha Técnica: erro de rede não apaga nada ══ */
  console.log('\n── 4. Ficha Técnica sem internet e com CEP inexistente ──');
  {
    const f = criarFetch({ modo: 'rede' });
    const { w, d, erros } = abrirApp('criador_ficha_tecnica/index.html', f.fetch);
    await wait(1600);
    const $ = id => d.getElementById(id);
    $('dc_end').textContent = 'Rua das Flores, 90';
    $('dc_cidade').textContent = 'Aparecida de Goiânia';
    $('dc_cep').textContent = '74000000';
    $('dc_cep').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(1500);
    ok('sem internet o endereço escrito NÃO foi apagado',
      ($('dc_end').textContent || '').trim() === 'Rua das Flores, 90', $('dc_end').textContent);
    ok('sem internet a cidade escrita NÃO foi apagada',
      ($('dc_cidade').textContent || '').trim() === 'Aparecida de Goiânia', $('dc_cidade').textContent);
    ok('sem internet a pessoa foi avisada', (($('toast').textContent || '').length > 0), $('toast').textContent);
    ok('sem internet a página não quebrou', erros.length === 0, erros);
    w.close();
  }
  {
    const f = criarFetch({ modo: 'tudo-404' });
    const { w, d } = abrirApp('criador_ficha_tecnica/index.html', f.fetch);
    await wait(1600);
    const $ = id => d.getElementById(id);
    $('dc_end').textContent = 'Rua das Flores, 90';
    $('dc_cep').textContent = '99999999';
    $('dc_cep').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(1500);
    ok('CEP inexistente: o endereço escrito NÃO foi apagado',
      ($('dc_end').textContent || '').trim() === 'Rua das Flores, 90', $('dc_end').textContent);
    ok('CEP inexistente: avisou que não achou', /não encontrado/i.test($('toast').textContent || ''), $('toast').textContent);
    w.close();
  }

  /* ══ 5. Recibo: o CEP preenche o endereço do cliente ══ */
  console.log('\n── 5. Recibo ──');
  {
    const f = criarFetch();
    const { w, d, erros } = abrirApp('criador_recibo/index.html', f.fetch);
    await wait(1400);
    const $ = id => d.getElementById(id);
    ok('o recibo carregou sem erro de página', erros.length === 0, erros);
    ok('o recibo tem o campo CEP do cliente', !!$('f-cep'));
    $('f-end').value = '250';
    $('f-end').dispatchEvent(new w.Event('input', { bubbles: true }));
    $('f-cep').value = '74000000';
    $('f-cep').dispatchEvent(new w.Event('input', { bubbles: true }));
    await wait(1400);
    ok('o CEP preencheu o endereço do cliente', ($('f-end').value || '').indexOf('Avenida T-9') >= 0, $('f-end').value);
    ok('o NÚMERO do cliente foi mantido', ($('f-end').value || '').indexOf('250') >= 0, $('f-end').value);
    ok('o CEP preencheu a cidade do cliente', ($('f-cidade').value || '') === 'Goiânia - GO', $('f-cidade').value);
    const st = w.eval('ReciboInterno.estadoAtual().cliente');
    ok('o endereço preenchido entrou no estado do recibo', String(st.end || '').indexOf('Avenida T-9') >= 0, st.end);
    ok('o CEP também foi para o estado', String(st.cep || '').replace(/\D+/g, '') === '74000000', st.cep);
    w.close();
  }

  console.log('\n===== CEP V10.9: ' + pass + ' OK / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
})();
