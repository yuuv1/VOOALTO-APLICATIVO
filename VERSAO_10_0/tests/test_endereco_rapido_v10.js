'use strict';
/* ══ V10.10 — ENDEREÇO MAIS RÁPIDO ══

   O pedido: *"só quero que seja mais rápido de preencher o endereço da
   ficha técnica"*.

   O que este arquivo trava:
     1. o módulo de CEP acha o CEP dentro de um endereço colado (e NÃO
        confunde um telefone de 10 dígitos com um CEP);
     2. o CEP é separado do texto colado;
     3. na Ficha Técnica existe o botão de busca do CEP, e ele consulta
        na hora (sem esperar a pessoa parar de digitar);
     4. colar o endereço inteiro no campo "Endereço" preenche o CEP, a
        cidade e mantém o resto do endereço como veio;
     5. colar só o CEP preenche o endereço e a cidade;
     6. o NÚMERO e o COMPLEMENTO que a pessoa escreveu continuam no lugar;
     7. nada é apagado quando o CEP não existe ou falta internet.
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

/* Carrega os assets locais (../assets/*.js) do disco. */
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

const BRASILAPI_RAW = {
  cep: '74000000', state: 'GO', city: 'Goiânia',
  neighborhood: 'Setor Bueno', street: 'Avenida T-9',
  complement: 'de frente com o número 1000', service: 'correios'
};
const VIACEP = {
  cep: '74000000', logradouro: 'Avenida T-9', complemento: 'Bloco A',
  bairro: 'Setor Bueno', localidade: 'Goiânia', uf: 'GO',
};

function criarFetch(opcoes = {}) {
  const chamadas = [];
  let modo = opcoes.modo || 'ok';
  const fetchFalso = async (url) => {
    chamadas.push(String(url));
    const u = String(url);
    const resp = (obj, status = 200) => ({
      ok: status >= 200 && status < 300, status,
      json: async () => obj, text: async () => JSON.stringify(obj),
    });
    if (modo === 'rede') { const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; }
    if (/brasilapi/i.test(u) && modo === 'tudo-404') return resp({ message: 'CEP não encontrado' }, 404);
    if (/viacep/i.test(u)) {
      if (modo === 'tudo-404') return resp({ erro: true }, 200);
      return resp(VIACEP);
    }
    if (/brasilapi/i.test(u)) return resp(BRASILAPI_RAW);
    return resp({ ok: true });
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
  /* ══ 1. O módulo: achar e tirar o CEP de um texto colado ══ */
  console.log('\n── 1. O módulo (assets/cep.js) ──');
  const cepMod = require(path.join(BASE, 'assets', 'cep.js'));
  {
    ok('acha o CEP no fim de um endereço colado',
      cepMod.extrairCep('Rua das Flores, 120, Centro, Goiânia - GO, 74000-000') === '74000000',
      cepMod.extrairCep('Rua das Flores, 120, Centro, Goiânia - GO, 74000-000'));
    ok('acha o CEP sem o traço',
      cepMod.extrairCep('Rua das Flores, 74000000') === '74000000',
      cepMod.extrairCep('Rua das Flores, 74000000'));
    ok('acha o CEP colado sozinho',
      cepMod.extrairCep('74000-000') === '74000000', cepMod.extrairCep('74000-000'));
    ok('NÃO confunde telefone de 10 dígitos com CEP',
      cepMod.extrairCep('9812345678') === '', cepMod.extrairCep('9812345678'));
    ok('NÃO confunde telefone com máscara com CEP',
      cepMod.extrairCep('(11) 98123-4567') === '', cepMod.extrairCep('(11) 98123-4567'));
    ok('tira o CEP do endereço e devolve o resto',
      cepMod.tirarCep('Rua das Flores, 120, 74000-000') === 'Rua das Flores, 120',
      cepMod.tirarCep('Rua das Flores, 120, 74000-000'));
    ok('tirar o CEP de um texto só com CEP devolve vazio',
      cepMod.tirarCep('74000-000') === '', cepMod.tirarCep('74000-000'));
  }

  /* ══ 2. A Ficha Técnica: busca na hora e endereço colado ══ */
  console.log('\n── 2. Ficha Técnica ──');
  const f = criarFetch();
  const { w, d, erros } = abrirApp('criador_ficha_tecnica/index.html', f.fetch);
  await wait(1600);
  const $ = id => d.getElementById(id);
  ok('o app carregou sem erro de página', erros.length === 0, erros);
  ok('existe o botão de busca do CEP', !!$('dcCepBtn'), !!$('dcCepBtn'));
  ok('o botão tem a dica de busca', /preencher|buscar/i.test($('dcCepBtn').getAttribute('title') || ''), $('dcCepBtn').getAttribute('title'));
  ok('existe a dica de colar o endereço', !!d.querySelector('.dc-dica'), !!d.querySelector('.dc-dica'));

  /* 2.1 — o botão consulta na hora */
  $('dc_cep').textContent = '74000-000';
  const antes = f.chamadas.length;
  w.eval('v10CepBuscar()');
  await wait(1200);
  ok('o botão vai à rede na hora (sem esperar)', f.chamadas.length > antes, f.chamadas.length - antes);
  ok('o botão preencheu o endereço', ($('dc_end').textContent || '').indexOf('Avenida T-9') >= 0, $('dc_end').textContent);
  ok('o botão preencheu a cidade', ($('dc_cidade').textContent || '').trim() === 'Goiânia - GO', $('dc_cidade').textContent);
  ok('o botão volta ao normal depois da consulta', ($('dcCepBtn').textContent || '').indexOf('🔍') >= 0, $('dcCepBtn').textContent);

  /* 2.2 — colar o endereço inteiro */
  $('dc_end').textContent = '';
  $('dc_cidade').textContent = '';
  $('dc_cep').textContent = '';
  $('dc_end').textContent = 'Rua das Flores, 120, Setor Bueno, Goiânia - GO, 74000-000';
  const colou = w.eval("v10CepProcessarColado(document.getElementById('dc_end'))");
  ok('a função reconhece o CEP no texto colado', colou === true, colou);
  ok('o CEP foi para o campo CEP', ($('dc_cep').textContent || '').trim() === '74000-000', $('dc_cep').textContent);
  ok('a cidade foi para o campo da cidade', ($('dc_cidade').textContent || '').trim() === 'Goiânia - GO', $('dc_cidade').textContent);
  ok('o endereço ficou com o que a pessoa colou (sem o CEP)',
    ($('dc_end').textContent || '').trim() === 'Rua das Flores, 120, Setor Bueno', $('dc_end').textContent);
  await wait(1200);
  ok('a consulta do CEP colado rodou', f.chamadas.some(u => /74000000/.test(u)), f.chamadas.slice(-2));
  ok('o número da pessoa continua no endereço', ($('dc_end').textContent || '').indexOf('120') >= 0, $('dc_end').textContent);

  /* 2.3 — colar SÓ o CEP: o endereço e a cidade aparecem */
  $('dc_end').textContent = '';
  $('dc_cidade').textContent = '';
  $('dc_cep').textContent = '';
  $('dc_end').textContent = '74000-000';
  w.eval("v10CepProcessarColado(document.getElementById('dc_end'))");
  await wait(1200);
  ok('colar só o CEP preencheu o endereço', ($('dc_end').textContent || '').indexOf('Avenida T-9') >= 0, $('dc_end').textContent);
  ok('colar só o CEP preencheu a cidade', ($('dc_cidade').textContent || '').trim() === 'Goiânia - GO', $('dc_cidade').textContent);
  ok('o CEP continua no campo CEP', ($('dc_cep').textContent || '').trim() === '74000-000', $('dc_cep').textContent);

  /* 2.4 — o número e o complemento da pessoa não são apagados */
  $('dc_end').textContent = '250 - Apto 12';
  $('dc_cep').textContent = '74000-000';
  $('dc_cep').dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(1400);
  const end = ($('dc_end').textContent || '').trim();
  ok('o NÚMERO continua no endereço', end.indexOf('250') >= 0, end);
  ok('o COMPLEMENTO continua no endereço', /Apto 12/i.test(end), end);

  /* 2.5 — CEP que não existe: avisa e não apaga nada */
  const f2 = criarFetch({ modo: 'tudo-404' });
  const app2 = abrirApp('criador_ficha_tecnica/index.html', f2.fetch);
  await wait(1600);
  const d2 = app2.d, w2 = app2.w;
  const $2 = id => d2.getElementById(id);
  $2('dc_end').textContent = 'Rua Antiga, 10';
  $2('dc_cep').textContent = '74000-000';
  $2('dc_cep').dispatchEvent(new w2.Event('input', { bubbles: true }));
  await wait(1400);
  ok('CEP inexistente: o endereço da pessoa NÃO foi apagado',
    ($2('dc_end').textContent || '').indexOf('Rua Antiga') >= 0, $2('dc_end').textContent);
  ok('CEP inexistente: a página avisou', /não encontrado/i.test($2('toast').textContent || ''), $2('toast').textContent);
  app2.w.close();

  /* 2.6 — sem internet: avisa e não apaga nada */
  const f3 = criarFetch({ modo: 'rede' });
  const app3 = abrirApp('criador_ficha_tecnica/index.html', f3.fetch);
  await wait(1600);
  const d3 = app3.d, w3 = app3.w;
  const $3 = id => d3.getElementById(id);
  $3('dc_end').textContent = 'Rua Antiga, 10';
  $3('dc_cep').textContent = '74000-000';
  $3('dc_cep').dispatchEvent(new w3.Event('input', { bubbles: true }));
  await wait(1500);
  ok('sem internet: o endereço da pessoa NÃO foi apagado',
    ($3('dc_end').textContent || '').indexOf('Rua Antiga') >= 0, $3('dc_end').textContent);
  app3.w.close();

  w.close();
  console.log('\n═══ ENDEREÇO RÁPIDO V10.10: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
