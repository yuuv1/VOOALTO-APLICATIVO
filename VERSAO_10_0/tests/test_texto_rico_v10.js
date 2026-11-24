'use strict';
/* ══ V10.10 — A EDIÇÃO DE TEXTO EM TODAS AS PARTES DIGITÁVEIS ══

   O pedido: *"a edição de texto que tem no tipo de tecido tem que existir
   em todas as partes digitáveis"* e *"as opções de formatação devem ser
   um pouco mais discretas"*.

   O que este arquivo trava:
     1. a barra de formatação ficou DISCRETA (mini barra, sem rótulos e sem
        a faixa pesada de antes);
     2. ela abre em TODAS as partes digitáveis da Ficha Técnica — e não só
        no "tipo de tecido": nº, previsão, entrada, separador, títulos,
        aviso, medidas, grade e linhas de produção;
     3. num campo simples (<input>) a formatação vale para o campo
        inteiro (é o máximo que um input guarda) e a barra avisa "campo";
     4. o negrito, o itálico, o tamanho, a cor e o destaque são aplicados;
     5. "Limpar" devolve o campo ao jeito que estava;
     6. o formato SOBREVIVE: ao Ctrl+Z, ao salvar (.json) e ao reabrir;
     7. o formato da folha 1 é ESPELHADO nas páginas extras;
     8. o texto editável (contenteditable) continua funcionando como
        antes — com formatação só do trecho selecionado.
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

class CargaLocal extends ResourceLoader {
  fetch(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '' || u.hostname === '127.0.0.1') {
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        for (const arquivo of [path.resolve(BASE, rel), path.resolve(BASE, 'criador_ficha_tecnica', rel)]) {
          if (arquivo.startsWith(BASE) && fs.existsSync(arquivo) && fs.statSync(arquivo).isFile()) {
            return Promise.resolve(fs.readFileSync(arquivo));
          }
        }
      }
    } catch (e) { /* loader padrão */ }
    return null;
  }
}

function abrirApp() {
  const html = fs.readFileSync(path.join(BASE, 'criador_ficha_tecnica', 'index.html'), 'utf-8');
  const erros = [];
  const comandos = [];
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
      w.Range.prototype.getBoundingClientRect = function () { return { top: 100, left: 100, width: 80, height: 14, bottom: 114, right: 180 }; };
      w.document.queryCommandState = () => false;
      /* o jsdom não formata texto: o execCommand é anotado para o teste */
      w.document.execCommand = function (cmd) { comandos.push(cmd); return true; };
      w.addEventListener('error', e => erros.push(e.message));
    }
  });
  return { dom, w: dom.window, d: dom.window.document, erros, comandos };
}

(async function main() {
  const { w, d, erros, comandos } = abrirApp();
  await wait(1800);
  const $ = id => d.getElementById(id);
  const barra = $('richBar');

  /* ══ 1. A barra ficou discreta ══ */
  console.log('\n── 1. A barra de formatação ficou discreta ──');
  const htmlBarra = barra.outerHTML;
  ok('a barra não tem mais os rótulos "Formato/Tamanho/Cor/Marcador"',
    !/Formato:|Tamanho:|Cor:|Marcador:/.test(htmlBarra), htmlBarra.slice(0, 120));
  ok('a barra não tem a faixa pesada (padding grande)',
    !/padding:8px 12px/.test(htmlBarra + (d.documentElement.innerHTML.match(/#richBar\{[^}]*\}/g) || []).join('')));
  ok('a barra tem o botão de itálico (era só negrito)',
    !!$('rbItalic'), !!$('rbItalic'));
  ok('a barra continua com os botões: negrito, tamanho, cor, destaque e limpar',
    !!$('rbBold') && !!$('rbSize') && !!$('rbColor') && !!$('rbHL'));

  /* ══ 2. A barra abre em TODAS as partes digitáveis ══ */
  console.log('\n── 2. A barra abre nas partes digitáveis ──');
  /* seleciona o texto de um input e abre a barra */
  const selecionar = (id) => {
    const el = $(id);
    if (!el) return false;
    el.focus();
    try { el.setSelectionRange(0, (el.value || '').length); } catch (e) { }
    w.eval('rfShow()');
    return barra.classList.contains('vis');
  };
  const campos = ['fichaNum', 'previsao', 'entradaVal', 'sepTxt', 'coresTitulo', 'tipoTitulo', 'avisoTxt'];
  for (const id of campos) {
    $(id).value = 'TEXTO';
    const abriu = selecionar(id);
    ok('a barra abre no campo "' + id + '"', abriu && barra.classList.contains('modo-campo'), id);
  }
  /* a grade e as medidas também */
  const grade = d.querySelector('.gi[data-g="m"]');
  grade.value = '12';
  grade.focus();
  try { grade.setSelectionRange(0, 2); } catch (e) { }
  w.eval('rfShow()');
  ok('a barra abre numa célula da grade', barra.classList.contains('vis') && barra.classList.contains('modo-campo'));
  const med = d.querySelector('#folha1 .med-inp');
  med.value = '42';
  med.focus();
  try { med.setSelectionRange(0, 2); } catch (e) { }
  w.eval('rfShow()');
  ok('a barra abre numa medida', barra.classList.contains('vis') && barra.classList.contains('modo-campo'));

  /* o texto editável continua no modo antigo (formatação do TRECHO) */
  $('tipoTecido').textContent = 'PIQUET PA';
  const r = d.createRange(); r.selectNodeContents($('tipoTecido'));
  const sel = w.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  w.eval('rfShow()');
  ok('a barra abre no tipo de tecido (modo texto editável)',
    barra.classList.contains('vis') && !barra.classList.contains('modo-campo'));
  ok('a barra não é mostrada em campo que não é da ficha', (() => {
    const fora = d.createElement('input'); d.body.appendChild(fora);
    fora.focus(); try { fora.setSelectionRange(0, 3); } catch (e) { }
    w.eval('rfShow()');
    const vis = barra.classList.contains('vis');
    fora.remove();
    return !vis;
  })());

  /* ══ 3. A formatação é aplicada no campo ══ */
  console.log('\n── 3. Negrito, itálico, tamanho, cor e destaque ──');
  $('previsao').value = '30 dias';
  selecionar('previsao');
  w.eval("rfApply('bold')");
  ok('o negrito foi aplicado no campo', $('previsao').style.fontWeight === 'bold', $('previsao').style.fontWeight);
  w.eval("rfApply('italic')");
  ok('o itálico foi aplicado no campo', $('previsao').style.fontStyle === 'italic', $('previsao').style.fontStyle);
  $('rbSize').value = '18';
  w.eval('rfApplySize()');
  ok('o tamanho foi aplicado no campo', $('previsao').style.fontSize === '18px', $('previsao').style.fontSize);
  $('rbColor').value = '#ff0000';
  w.eval("rfApply('color')");
  ok('a cor foi aplicada no campo', $('previsao').style.color === 'rgb(255, 0, 0)', $('previsao').style.color);
  $('rbHL').value = '#ffff00';
  w.eval('rfHL()');
  ok('o destaque foi aplicado no campo', $('rbHL').value === '#ffff00' && !!$('previsao').style.backgroundColor, $('previsao').style.backgroundColor);
  /* o seletor de cor abre uma janela do sistema: a barra pode se esconder
     antes de a cor chegar — mesmo assim a cor tem que ir no campo */
  selecionar('previsao');
  w.eval('rfHide()');
  $('rbColor').value = '#00ff00';
  w.eval("rfCor('color')");
  ok('a cor vai no campo mesmo com a barra escondida',
    $('previsao').style.color === 'rgb(0, 255, 0)', $('previsao').style.color);

  /* ══ 4. "Limpar" devolve o campo ao jeito que estava ══ */
  console.log('\n── 4. Limpar ──');
  const originalPeso = $('previsao').__rfOrig ? $('previsao').__rfOrig.fontWeight : '700';
  selecionar('previsao');
  w.eval('rfClear()');
  ok('o negrito foi Tirado', $('previsao').style.fontWeight === originalPeso, $('previsao').style.fontWeight);
  ok('a cor voltou ao original', $('previsao').style.color === 'rgb(255, 255, 255)', $('previsao').style.color);

  /* ══ 5. O formato sobrevive ao Ctrl+Z, ao salvar e ao reabrir ══ */
  console.log('\n── 5. O formato é salvo (desfazer, .json, reabrir) ──');
  $('previsao').value = '30 dias';
  selecionar('previsao');
  w.eval("rfApply('bold')");
  ok('o negrito está no campo', $('previsao').style.fontWeight === 'bold');
  await wait(1000);   /* deixa o snap (histórico) acontecer */
  const estado = w.eval('JSON.parse(JSON.stringify(capState()))');
  ok('o estado guarda a formatação do campo',
    !!(estado._fmt && estado._fmt['id:previsao'] && estado._fmt['id:previsao'].b === true),
    estado._fmt);
  /* desfazer: volta ao estado sem negrito */
  w.eval('undo()');
  await wait(300);
  ok('o Ctrl+Z tirou o negrito', $('previsao').style.fontWeight !== 'bold', $('previsao').style.fontWeight);
  w.eval('redo()');
  await wait(300);
  ok('o Ctrl+Y voltou o negrito', $('previsao').style.fontWeight === 'bold', $('previsao').style.fontWeight);

  /* .json */
  const dump = w.eval('JSON.parse(JSON.stringify(capturarFichaParaJSON()))');
  ok('o .json guarda a formatação', !!(dump._fmt && dump._fmt['id:previsao'] && dump._fmt['id:previsao'].b === true), dump._fmt);
  $('previsao').style.fontWeight = 'normal';
  w.eval(`restaurarDeJSON(${JSON.stringify(dump)})`);
  await wait(800);
  ok('ao reabrir, o negrito volta', $('previsao').style.fontWeight === 'bold', $('previsao').style.fontWeight);

  /* ══ 6. O espelho: a página extra recebe a formatação ══ */
  console.log('\n── 6. O espelho das páginas extras ──');
  w.eval('adicionarPagina()');
  await wait(700);
  const pid = w.eval('paginas[paginas.length-1].id');
  const destino = $('previsao_' + pid);
  ok('a página extra existe', !!destino, pid);
  ok('a formatação foi espelhada na página extra',
    destino && destino.style.fontWeight === 'bold', destino && destino.style.fontWeight);

  /* ══ 7. O texto editável continua formatando o TRECHO ══ */
  console.log('\n── 7. O texto editável (tipo de tecido) continua igual ──');
  comandos.length = 0;
  $('tipoTecido').textContent = 'PIQUET PA';
  const r2 = d.createRange(); r2.selectNodeContents($('tipoTecido'));
  const sel2 = w.getSelection(); sel2.removeAllRanges(); sel2.addRange(r2);
  w.eval('rfShow()');
  w.eval("rfApply('bold')");
  ok('o negrito do trecho continua sendo aplicado pelo navegador',
    comandos.indexOf('bold') >= 0, comandos);
  /* mesmo depois de formatar um campo simples, o texto editável continua
     sendo o alvo (o "último mirado" não pode roubar o formato) */
  ok('o texto editável continua no modo texto editável',
    !d.getElementById('richBar').classList.contains('modo-campo'));

  ok('nada estourou durante os testes', erros.length === 0, erros.slice(0, 3));
  w.close();
  console.log('\n═══ TEXTO RICO V10.10: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
