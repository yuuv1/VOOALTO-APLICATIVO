'use strict';
/* ══ V10 — 3ª ferramenta: Criador de Documento Contratual ══
   A V10 embarca o motor de contratos (artefato autônomo do projeto
   `documento-contratual/`) como um iframe, na mesma origem do sistema.

   O motivo deste arquivo existir: o artefato original, no <head>, apaga TODOS
   os caches da origem menos o dele —

       names.forEach(n => { if (n !== "vooalto-contratos-v3") caches.delete(n) })

   Dentro do Vooalto isso apagaria o precache da própria V10 na primeira vez
   que a aba Contrato abrisse, e o sistema perderia o modo offline. A cópia
   embarcada precisa estar corrigida, e este teste falha se alguém recolocar o
   arquivo original sem passar por tools/atualizar_contrato.py. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 90) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 90) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const shellHtml = fs.readFileSync(path.join(BASE, 'index.html'), 'utf-8');
const contratoDir = path.join(BASE, 'criador_contrato');
const contratoHtml = fs.readFileSync(path.join(contratoDir, 'index.html'), 'utf-8');

(async function main() {
  console.log('\n── 1. O motor de contratos está embarcado ──');
  {
    ok('criador_contrato/index.html existe', fs.existsSync(path.join(contratoDir, 'index.html')));
    const tamanho = fs.statSync(path.join(contratoDir, 'index.html')).size;
    ok('é o artefato autônomo (arquivo único, acima de 5 MB)', tamanho > 5 * 1024 * 1024, (tamanho / 1024 / 1024).toFixed(1) + ' MB');
    ok('é HTML de verdade', contratoHtml.startsWith('<!doctype html') || contratoHtml.startsWith('<!DOCTYPE html'));
    ok('tem o app montado (#root)', contratoHtml.includes('id="root"'));
    ok('manifesto e ícones acompanham (caminhos relativos do HTML)',
      fs.existsSync(path.join(contratoDir, 'manifest.webmanifest')) &&
      fs.existsSync(path.join(contratoDir, 'icons', 'icon-192.png')));
    ok('o título do documento é o motor de contratos', /Central Automática de Contratos/.test(contratoHtml));
  }

  console.log('\n── 2. O limpador de cache está limitado ao próprio motor ──');
  {
    ok('existe a correção (só apaga caches vooalto-contratos-*)',
      contratoHtml.includes('n.indexOf("vooalto-contratos-") === 0'));
    ok('NÃO existe mais o limpador que apagava tudo da origem',
      !contratoHtml.includes('if (n !== "vooalto-contratos-v3") caches.delete(n);'));
    /* a única ocorrência da comparação exata deve ser a corrigida */
    const cruas = contratoHtml.split('caches.delete(n)').length - 1;
    ok('só há um ponto de remoção de cache no arquivo', cruas === 1, cruas);
  }

  console.log('\n── 3. O shell tem a terceira aba, e ela é preguiçosa ──');
  {
    const erros = [];
    const frames = {};
    ['ficha', 'orcamento', 'contrato'].forEach(k => {
      frames[k] = { got: [], postMessage: m => frames[k].got.push(m), location: { reload() { frames[k].reloaded = true; } } };
    });
    const dom = new JSDOM(shellHtml, {
      url: 'http://localhost:4800/', runScripts: 'dangerously', pretendToBeVisual: true,
      beforeParse(w) {
        w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        w.addEventListener('error', e => erros.push(e.message));
      }
    });
    const w = dom.window, d = w.document;
    ['ficha', 'orcamento', 'contrato'].forEach(k => {
      const real = d.getElementById('frame-' + k);
      Object.defineProperty(real, 'contentWindow', { value: frames[k], configurable: true });
    });
    await wait(900);
    w.eval('fecharTour()');

    const fr = d.getElementById('frame-contrato');
    ok('a aba Contrato existe na barra', !!d.getElementById('btn-contrato'));
    ok('o iframe do contrato existe', !!fr);
    ok('o contrato NÃO carrega junto com o sistema (~10 MB)', !fr.getAttribute('src') && !!fr.dataset.src);
    ok('o src aponta para o motor embarcado', fr.dataset.src === 'criador_contrato/index.html');
    ok('as três abas estão na barra', d.querySelectorAll('.switch-btn').length === 3);

    w.eval("showProject('contrato')");
    await wait(120);
    ok('abrir Contrato define o src', fr.getAttribute('src') === 'criador_contrato/index.html');
    ok('a aba Contrato fica ativa', fr.classList.contains('active') && !d.getElementById('frame-ficha').classList.contains('active'));
    ok('o botão Contrato fica marcado', d.getElementById('btn-contrato').classList.contains('active'));

    w.eval("showProject('ficha')");
    await wait(60);
    ok('voltar para a Ficha mantém o contrato carregado (não recarrega 10 MB)',
      d.getElementById('frame-ficha').classList.contains('active') && fr.getAttribute('src') === 'criador_contrato/index.html');

    /* o contrato ignora tema: o shell pode mandar, ele não quebra */
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'vooalto-switch-tab', tab: 'contrato' }, origin: 'http://localhost:4800' }));
    await wait(60);
    ok('um módulo pode pedir a aba Contrato', d.getElementById('frame-contrato').classList.contains('active'));
    ok('shell sem erro de página com a nova aba', erros.length === 0, erros);
    dom.window.close();
  }

  console.log('\n── 4. O contrato no ciclo de vida dos dados ──');
  {
    const zerar = fs.readFileSync(path.join(BASE, 'zerar_dados.html'), 'utf-8');
    const limpar = fs.readFileSync(path.join(BASE, 'limpar_cache.html'), 'utf-8');
    ok('zerar dados alcança as chaves do contrato (prefixo vooalto_)',
      zerar.includes("key.startsWith('vooalto_')"));
    ok('zerar/limpar cache reconhecem o cache do motor de contratos',
      /vooalto-contratos-/.test(zerar) && /vooalto-contratos-/.test(limpar));
    ok('o backup inclui o estado do contrato na mesclagem',
      shellHtml.includes("'vooalto_contrato_state_v2'"));
    ok('a chave de API NUNCA vai para o arquivo de backup',
      /SKIP_KEYS=\{[^}]*vooalto_gemini_api_key_v1/.test(shellHtml));
    ok('…nem no backup de emergência do "Zerar dados"',
      /SKIP_KEYS=\{[^}]*vooalto_gemini_api_key_v1/.test(zerar));
    ok('o backup é descrito como incluindo o contrato',
      shellHtml.includes('orçamentos, contrato e preferências'));
  }

  console.log('\n── 5. Build e distribuição ──');
  {
    const sw = fs.readFileSync(path.join(BASE, 'sw.js'), 'utf-8');
    ok('o motor de contratos entra no precache (offline na aba Contrato)',
      sw.includes('"criador_contrato/index.html"'));
    ok('como arquivo pesado (segunda fase), não no addAll atômico',
      /const PRECACHE_PESADOS = \[[^\]]*"criador_contrato\/index.html"/.test(sw));
    ok('o precache obrigatório continua pequeno (addAll não carrega 10 MB)',
      !/const PRECACHE = \[[^\]]*"criador_contrato\/index.html"/.test(sw));
    ok('o service worker do motor de contratos NÃO é embarcado (evita disputa de escopo)',
      !fs.existsSync(path.join(contratoDir, 'sw.js')));
  }

  console.log('\n═══ CONTRATO V10: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
