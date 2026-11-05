'use strict';
/* ══ V10.4 — Nome do PDF, rascunho duplicado e zoom só da folha ══════════

   Três pedidos do usuário:

   1. ao salvar a ficha técnica como PDF, o nome sugerido é
      "Ficha técnica <Cliente> <data de hoje>";
   2. rascunho com o MESMO nome nunca duplica: a nova versão SUBSTITUI a
      antiga (e duplicados que já existam são limpos na abertura);
   3. dar zoom na ficha/orçamento sem dar zoom no aplicativo inteiro
      (botões e Ctrl+rolagem só na folha; imprimir/exportar sai em 100%).
*/
const { JSDOM, ResourceLoader } = require('jsdom');
const path = require('path');
const fs = require('fs');
const { BASE } = require('./_base');
const { criarIDBFalso } = require('./_fake_idb');

const DB = 'vooalto_ficha_rascunhos_db_v4';
const STORE = 'drafts';
const META = 'vooalto_ficha_rascunhos_v4_meta';
const ORC_DRAFTS = 'vooalto_orcamento_rascunhos_v7';

let pass = 0, fail = 0;
const ok = (label, v, extra) => {
  if (v) { pass++; console.log('  [OK]', label); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 160) : ''); }
};
const hoje = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear(); };
const espera = ms => new Promise(r => setTimeout(r, ms));

/* Os <script src="../assets/..."> precisam vir do disco no teste (sem servidor). */
class CargaLocal extends ResourceLoader {
  fetch(url) {
    try {
      const u = new URL(url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const candidatos = [path.resolve(BASE, rel), path.resolve(BASE, 'criador_ficha_tecnica', rel), path.resolve(BASE, 'criador_orcamento', rel)];
      for (const arq of candidatos) {
        if (arq.startsWith(BASE) && fs.existsSync(arq) && fs.statSync(arq).isFile()) return Promise.resolve(fs.readFileSync(arq));
      }
    } catch (e) {}
    return null;
  }
}

function baseBeforeParse(extra) {
  return function (w) {
    w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.print = () => {};
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
    w.prompt = () => null;
    w.confirm = () => true;
    if (extra) extra(w);
  };
}

(async () => {
  console.log('════ V10.4 · PDF / DUPLICADOS / ZOOM ════');

  /* ───────────────────────────── FICHA TÉCNICA ─────────────────────────── */
  {
    const { indexedDB, bancos } = criarIDBFalso({
      [DB]: { version: 1, stores: { [STORE]: {
        'd_um': { _version: 1, _nome: 'Ficha Escola Ana', dc_nome: 'Escola Ana', fichaNum: '100' },
        'd_dois': { _version: 1, _nome: 'ficha escola ana', dc_nome: 'Escola Ana', fichaNum: '101' },
        'd_tres': { _version: 1, _nome: 'FICHA ESCOLA ANA', dc_nome: 'Escola Ana', fichaNum: '102' },
      } } },
    });
    const d = new JSDOM(fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8'), {
      url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true, resources: new CargaLocal(),
      beforeParse: baseBeforeParse(w => {
        w.indexedDB = indexedDB;
        w.localStorage.setItem(META, JSON.stringify([
          { id: 'd_tres', name: 'FICHA ESCOLA ANA', date: '03/01/2026 09:00' },
          { id: 'd_dois', name: 'ficha escola ana', date: '02/01/2026 09:00' },
          { id: 'd_um', name: 'Ficha Escola Ana', date: '01/01/2026 09:00' },
        ]));
      }),
    });
    const w = d.window;
    await espera(1800);
    const meta = () => JSON.parse(w.localStorage.getItem(META) || '[]');
    const dados = id => bancos.get(DB).stores.get(STORE).get(id);

    /* 2) duplicados que já existiam somem na abertura (fica a mais recente) */
    ok('duplicados de mesmo nome são limpos ao abrir', meta().length === 1, meta());
    ok('ficou a versão mais recente da lista', meta()[0] && meta()[0].id === 'd_tres', meta());
    ok('os dados dos duplicados foram apagados do banco', !dados('d_um') && !dados('d_dois') && !!dados('d_tres'));

    /* 1) nome do PDF */
    w.eval(`document.getElementById('dc_nome').textContent='Escola Ana';`);
    const titulo = w.eval('v7TituloPDF()');
    ok('o título do PDF é "Ficha técnica <Cliente> <data>"', titulo === 'Ficha técnica Escola Ana ' + hoje(), titulo);
    const nomeArq = w.eval('v7NomeArquivo()');
    ok('o nome do PNG também leva a data', nomeArq.endsWith('_' + hoje()), nomeArq);
    w.eval('v7AplicarTituloPDF()');
    ok('o título da página vira o nome do PDF', w.document.title === titulo, w.document.title);

    /* 2) salvar com o mesmo nome substitui (não cria outro) */
    w.eval(`document.getElementById('fichaNum').value='7777'; window.prompt=()=>'ficha ESCOLA ana';`);
    const salvou = await w.eval('v8SalvarFicha()');
    ok('salvar com o mesmo nome funciona', salvou === true);
    ok('continua existindo UMA ficha com esse nome', meta().length === 1, meta());
    ok('a versão nova é a que ficou (nº atualizado)', dados(meta()[0].id) && dados(meta()[0].id)._numFicha === '7777', dados(meta()[0].id));

    /* 3) zoom só da folha */
    ok('o ZoomFolha carregou na ficha', !!w.ZoomFolha);
    ok('os botões de zoom existem', !!w.document.querySelector('.zoom-folha-ctrl'));
    const inst = w.ZoomFolha.instancias()[0];
    ok('o zoom foi instalado na área das folhas (#pw)', !!inst && inst.alvo.id === 'pw');
    inst.definir(1.4);
    ok('o zoom aplica na folha (140%)', w.document.getElementById('pw').style.zoom === '1.4', w.document.getElementById('pw').style.zoom);
    ok('o zoom NÃO aplica no resto do app (sidebar)', !w.document.getElementById('sidebar').style.zoom, w.document.getElementById('sidebar').style.zoom);
    inst.definir(99);
    ok('o zoom tem teto (não estoura a tela)', inst.nivel === 2.5, inst.nivel);
    const voltar = w.ZoomFolha.suspenderTudo();
    ok('suspender volta a folha a 100% p/ exportar', w.document.getElementById('pw').style.zoom === '1');
    voltar();
    ok('restaurar devolve o zoom do usuário', w.document.getElementById('pw').style.zoom === '2.5');
    w.close();
  }

  /* ───────────────────────────── ORÇAMENTO ─────────────────────────────── */
  {
    const d = new JSDOM(fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8'), {
      url: 'http://localhost:4800/criador_orcamento/', runScripts: 'dangerously', pretendToBeVisual: true, resources: new CargaLocal(),
      beforeParse: baseBeforeParse(w => {
        w.localStorage.setItem(ORC_DRAFTS, JSON.stringify([
          { id: 'orc_3', name: 'Proposta Ana', date: '03/01/2026', state: { version: 'x', form: {}, pages: [] } },
          { id: 'orc_2', name: 'proposta ana', date: '02/01/2026', state: { version: 'x', form: {}, pages: [] } },
          { id: 'orc_1', name: 'PROPOSTA ANA', date: '01/01/2026', state: { version: 'x', form: {}, pages: [] } },
          { id: 'orc_9', name: 'Proposta Beto', date: '01/01/2026', state: { version: 'x', form: {}, pages: [] } },
        ]));
      }),
    });
    const w = d.window;
    await espera(1500);
    const drafts = () => JSON.parse(w.localStorage.getItem(ORC_DRAFTS) || '[]');

    ok('duplicados de orçamento são limpos ao abrir', drafts().length === 2, drafts().map(x => x.name));
    ok('ficou a versão mais recente da Proposta Ana', drafts()[0].id === 'orc_3', drafts().map(x => x.id));

    /* salvar com o mesmo nome substitui o registro (mesmo id, sem duplicar) */
    w.eval(`window.prompt=()=>'Proposta Ana';`);
    await w.eval('salvarRascunhoOrcamento()');
    ok('salvar com o mesmo nome não duplica', drafts().filter(x => x.name.toLowerCase().includes('ana')).length === 1, drafts().map(x => x.name));
    ok('o registro substituído manteve o id', drafts().find(x => x.name === 'Proposta Ana').id === 'orc_3', drafts().map(x => x.id));

    /* zoom só da folha do orçamento */
    ok('o ZoomFolha carregou no orçamento', !!w.ZoomFolha);
    const inst = w.ZoomFolha.instancias()[0];
    ok('o zoom foi instalado nas folhas do orçamento', !!inst && inst.alvo.id === 'preview-pages-container');
    inst.definir(0.7);
    ok('o zoom aplica nas folhas (70%)', w.document.getElementById('preview-pages-container').style.zoom === '0.7');
    w.close();
  }

  console.log(`\n═══ PDF/DUPLICADOS/ZOOM: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
