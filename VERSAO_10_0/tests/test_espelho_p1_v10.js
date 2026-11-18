'use strict';
/* ══ V10 — A folha 1 é a configuração da ficha; as páginas novas são cópias ══

   A ficha técnica monta a página 1 com tudo: número, data, previsão,
   separador (texto e tamanho), títulos das seções (cores e tecido), o aviso,
   a paleta de cores, a grade de produção, as medidas e os valores.

   Quando o usuário adiciona a página 2 (ou 3, 4…), ela tem de nascer IGUAL —
   é a mesma ficha, só com outra arte. O que este arquivo trava:

   1. cópia na criação (copiarP1paraExtra): os campos acima (V10.7: MENOS a
      grade de produção — a página nova nasce com a grade VAZIA);
   2. espelho depois disso: mudou na folha 1, muda nas outras páginas — antes
      só as medidas (v8MedSync) e os dados do cliente (sincTodasPaginas)
      acompanhavam, então trocar o título das cores, o texto do aviso, o
      tamanho do separador ou acrescentar uma cor deixava a página 2 com a
      configuração antiga, e a ficha impressa saía inconsistente.
   3. V10.7 — a grade é de cada página: não espelha, não acompanha; o botão
      “Mesma grade” na lateral copia a grade da página anterior (caso raro de
      folhas com a mesma grade de tamanhos).
   4. V10.7.3 — a paleta de cores e o tipo de tecido também são de cada
      página: a página nova nasce sem cor e sem tipo de tecido, e a folha 1
      não os espelha mais (ver test_pagina_nova_v10.js). */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 100) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 100) : '')); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function main() {
  const html = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const erros = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.print = () => {};
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : () => {}), set: () => true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => erros.push(e.message));
    }
  });
  const w = dom.window, d = w.document;
  await wait(1800);
  const $ = id => d.getElementById(id);

  /* ── 1. configuração da página 1 ── */
  console.log('\n── 1. Configuração montada na folha 1 ──');
  $('fichaNum').value = '1234';
  $('fichaData').value = '2026-03-04';
  $('previsao').value = '45 dias';
  $('sepTxt').value = '▸ DETALHES DO PEDIDO ◂';
  $('sepFontSize').value = '12';
  w.eval("applySepFontSize('sepTxt','sepFontSize')");
  $('coresTitulo').value = 'CORES DO CLIENTE';
  $('tipoTitulo').value = 'TECIDO ESPECIAL';
  $('avisoTxt').value = '⚠ PEÇA SOB MEDIDA NÃO TEM TROCA';
  $('tipoTecido').textContent = 'PIQUET PREMIUM';
  $('dc_nome').textContent = 'CLIENTE TESTE LTDA';
  /* a paleta nasce com uma cor padrão; limpar deixa a contagem determinística */
  w.eval("document.getElementById('coresList').innerHTML=''; adicionarCor('#FF0000','VERMELHO'); adicionarCor('#00AA55','VERDE');");
  w.eval([
    "document.querySelectorAll('#folha1 .gi[data-g=\"m\"]').forEach((e,i)=>e.value=String(i+1));",
    "document.querySelectorAll('#folha1 .gi[data-g=\"b\"]').forEach((e,i)=>e.value=String(i+2));",
    "document.querySelectorAll('#folha1 .gi[data-g=\"i\"]').forEach((e,i)=>e.value=String(i+3));",
    "recalcGrade();",
    "document.querySelectorAll('#folha1 .med-bloco.fem .med-inp').forEach((e,i)=>e.value=String(40+i));",
    "document.querySelectorAll('#folha1 .med-bloco.masc .med-inp').forEach((e,i)=>e.value=String(50+i));",
    "document.querySelectorAll('#prodLinhas tr').forEach((tr,i)=>{const inp=tr.querySelectorAll('input');inp[0].value='CAMISA '+(i+1);inp[1].value='10,50';inp[2].value='100';});",
    "calcTotal(); document.getElementById('entradaVal').value='500,00'; calcEntrada();"
  ].join('\n'));
  ok('página 1 configurada (2 cores, 10/10/7 na grade)', w.eval("document.querySelectorAll('#coresList [id^=\"ci_\"]').length") === 2);

  /* ── 2. a página nova nasce igual ── */
  console.log('\n── 2. Página 2 nasce com a mesma configuração ──');
  w.eval('adicionarPagina()');
  await wait(400);
  ok('a página 2 existe', !!$('folha_p2'));
  ok('número da ficha', $('fichaNum_p2') && $('fichaNum_p2').value === '1234', $('fichaNum_p2') && $('fichaNum_p2').value);
  ok('data de emissão', $('fichaData_p2') && $('fichaData_p2').value === '2026-03-04');
  ok('previsão de entrega', $('previsao_p2') && $('previsao_p2').value === '45 dias');
  ok('texto do separador', $('sepTxt_p2') && $('sepTxt_p2').value === '▸ DETALHES DO PEDIDO ◂', $('sepTxt_p2') && $('sepTxt_p2').value);
  ok('TAMANHO do separador (campo)', $('sepFS_p2') && $('sepFS_p2').value === '12', $('sepFS_p2') && $('sepFS_p2').value);
  ok('TAMANHO do separador (aplicado no texto)', $('sepTxt_p2') && $('sepTxt_p2').style.fontSize === '12px', $('sepTxt_p2') && $('sepTxt_p2').style.fontSize);
  ok('título das cores', $('coresTitulo_p2') && $('coresTitulo_p2').value === 'CORES DO CLIENTE', $('coresTitulo_p2') && $('coresTitulo_p2').value);
  ok('título do tecido', $('tipoTitulo_p2') && $('tipoTitulo_p2').value === 'TECIDO ESPECIAL', $('tipoTitulo_p2') && $('tipoTitulo_p2').value);
  ok('texto do aviso', $('avisoTxt_p2') && $('avisoTxt_p2').value === '⚠ PEÇA SOB MEDIDA NÃO TEM TROCA', $('avisoTxt_p2') && $('avisoTxt_p2').value);
  /* V10.7.3 — o tipo de tecido é de cada página: a página nova nasce vazio. */
  ok('tipo de tecido NÃO é copiado (nasc vazio)', $('tipoTecido_p2') && $('tipoTecido_p2').textContent === '', $('tipoTecido_p2') && $('tipoTecido_p2').textContent);
  ok('dados do cliente', $('syn_nome_p2') && $('syn_nome_p2').textContent === 'CLIENTE TESTE LTDA');

  const cores2 = [...d.querySelectorAll('#coresList_p2 [id^="ci_"]')].map(it => {
    const i = it.id.replace('ci_', '');
    return ($('cni_' + i) || {}).value + '|' + ($('chi_' + i) || {}).value;
  });
  /* V10.7.3 — a paleta de cores é de cada página: a página nova nasce sem
     as cores da folha 1 (ver test_pagina_nova_v10.js). */
  ok('paleta de cores NÃO é copiada (nasce vazia)', cores2.length === 0, cores2);

  /* V10.7 — a grade da página nova nasce VAZIA (é a exceção do espelho).
     O botão “Mesma grade” fica na lateral da grade para os casos raros em
     que a página usa a mesma grade da anterior. */
  const gradeP2 = g => [...d.querySelectorAll(`#folha_p2 .gi[data-g="p2${g}"]`)].map(e => e.value).join(',');
  ok('grade masculino nasce vazia', gradeP2('m') === ',,,,,,,,,', gradeP2('m'));
  ok('grade baby look nasce vazia', gradeP2('b') === ',,,,,,,,,', gradeP2('b'));
  ok('grade infantil nasce vazia', gradeP2('i') === ',,,,,,', gradeP2('i'));
  ok('total de peças da página 2 fica em —', ($('totalPecas_p2') || {}).textContent === '—', ($('totalPecas_p2') || {}).textContent);
  ok('o botão “Mesma grade” existe na página 2', !!$('gradeCopiar_p2'), !!$('gradeCopiar_p2'));

  const med = sel => [...d.querySelectorAll(sel)].map(e => e.value).join(',');
  ok('medidas femininas', med('#folha_p2 .med-bloco.fem .med-inp') === med('#folha1 .med-bloco.fem .med-inp'));
  ok('medidas masculinas', med('#folha_p2 .med-bloco.masc .med-inp') === med('#folha1 .med-bloco.masc .med-inp'));

  const prod = pid => [...d.querySelectorAll(`#prodLinhas_${pid} tr`)].map(tr => [...tr.querySelectorAll('input')].map(i => i.value).join('|')).join(' / ');
  ok('linhas de produção', prod('p2') === prod('prodLinhas') || prod('p2') === [...d.querySelectorAll('#prodLinhas tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value).join('|')).join(' / '), prod('p2'));
  ok('entrada', $('entradaVal_p2') && $('entradaVal_p2').value === '500,00', $('entradaVal_p2') && $('entradaVal_p2').value);

  /* ── 2b. o botão “Mesma grade” copia a grade da página anterior ── */
  console.log('\n── 2b. Botão “Mesma grade” copia a grade da página anterior ──');
  w.eval("copiarGradePaginaAnterior('p2')");
  await wait(250);
  ok('grade masculino copiada da folha 1', gradeP2('m') === '1,2,3,4,5,6,7,8,9,10', gradeP2('m'));
  ok('grade baby look copiada', gradeP2('b') === '2,3,4,5,6,7,8,9,10,11', gradeP2('b'));
  ok('grade infantil copiada', gradeP2('i') === '3,4,5,6,7,8,9', gradeP2('i'));
  ok('total de peças acompanha a cópia', ($('totalPecas_p2') || {}).textContent === '162', ($('totalPecas_p2') || {}).textContent);

  /* ── 3. mexer na folha 1 depois continua espelhando ── */
  console.log('\n── 3. Mudança na folha 1 depois da página criada ──');
  $('sepTxt').value = '▸ NOVO SEPARADOR ◂';
  $('sepTxt').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('sepFontSize').value = '9';
  $('sepFontSize').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('coresTitulo').value = 'CORES REVISADAS';
  $('coresTitulo').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('avisoTxt').value = '⚠ AVISO REVISADO';
  $('avisoTxt').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('tipoTitulo').value = 'TECIDO REVISADO';
  $('tipoTitulo').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('fichaNum').value = '9999';
  $('fichaNum').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('previsao').value = '60 dias';
  $('previsao').dispatchEvent(new w.Event('input', { bubbles: true }));
  const g1 = d.querySelectorAll('#folha1 .gi[data-g="m"]')[0];
  g1.value = '77';
  g1.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.eval("adicionarCor('#0000FF','AZUL')");
  await wait(500);

  ok('separador novo', $('sepTxt_p2').value === '▸ NOVO SEPARADOR ◂', $('sepTxt_p2').value);
  ok('tamanho novo do separador aplicado', $('sepTxt_p2').style.fontSize === '9px', $('sepTxt_p2').style.fontSize);
  /* V10.7.4 — o título da seção é de cada página: a página 2 guarda o dela
     (a alteração de texto feita nela não é revertida pelo espelho). */
  ok('título das cores da página 2 fica o dela', $('coresTitulo_p2').value === 'CORES DO CLIENTE', $('coresTitulo_p2').value);
  ok('aviso novo', $('avisoTxt_p2').value === '⚠ AVISO REVISADO', $('avisoTxt_p2').value);
  ok('título do tecido da página 2 fica o dele', $('tipoTitulo_p2').value === 'TECIDO ESPECIAL', $('tipoTitulo_p2').value);
  ok('número novo', $('fichaNum_p2').value === '9999', $('fichaNum_p2').value);
  ok('previsão nova', $('previsao_p2').value === '60 dias', $('previsao_p2').value);
  /* V10.7 — a grade da página 2 é independente: mudou na folha 1, a página
     2 mantém os números que já tem (a cópia só acontece pelo botão). */
  ok('grade da folha 1 mudou', d.querySelectorAll('#folha1 .gi[data-g="m"]')[0].value === '77', d.querySelectorAll('#folha1 .gi[data-g="m"]')[0].value);
  ok('grade da página 2 NÃO acompanha (fica independente)', d.querySelectorAll('#folha_p2 .gi[data-g="p2m"]')[0].value === '1', d.querySelectorAll('#folha_p2 .gi[data-g="p2m"]')[0].value);
  /* V10.7.3 — a paleta é de cada página: a cor nova da folha 1 NÃO entra na
     página 2 (e a página 2 continua com a paleta que ela tiver). */
  ok('cor nova da folha 1 NÃO entra na página 2',
    d.querySelectorAll('#coresList_p2 [id^="ci_"]').length === 0,
    d.querySelectorAll('#coresList_p2 [id^="ci_"]').length);
  ok('a folha 1 ficou com as 3 cores dela',
    d.querySelectorAll('#coresList [id^="ci_"]').length === 3,
    d.querySelectorAll('#coresList [id^="ci_"]').length);

  /* a cor continua editável na página 2 (não é só um retrato) */
  w.eval("adicionarCorExtra('p2','#FF0000','VERMELHO'); adicionarCorExtra('p2','#00AA55','VERDE'); adicionarCorExtra('p2','#0000FF','AZUL');");
  await wait(250);
  ok('cor da página 2 continua com os mesmos nomes',
    [...d.querySelectorAll('#coresList_p2 [id^="ci_"]')].map(it => {
      const i = it.id.replace('ci_', '');
      return ($('cni_' + i) || {}).value;
    }).join(',') === 'VERMELHO,VERDE,AZUL',
    [...d.querySelectorAll('#coresList_p2 [id^="ci_"]')].map(it => ($('cni_' + it.id.replace('ci_', '')) || {}).value));

  /* ── 4. terceira página herda o estado já revisado ── */
  console.log('\n── 4. Página 3 herda a revisão (e a grade vem da página 2 pelo botão) ──');
  w.eval('adicionarPagina()');
  await wait(400);
  ok('página 3 com o separador revisado', $('sepTxt_p3') && $('sepTxt_p3').value === '▸ NOVO SEPARADOR ◂', $('sepTxt_p3') && $('sepTxt_p3').value);
  ok('página 3 com o aviso revisado', $('avisoTxt_p3') && $('avisoTxt_p3').value === '⚠ AVISO REVISADO');
  ok('página 3 com a paleta VAZIA (a cor é de cada página)', d.querySelectorAll('#coresList_p3 [id^="ci_"]').length === 0, d.querySelectorAll('#coresList_p3 [id^="ci_"]').length);
  ok('página 3 com a grade VAZIA', d.querySelectorAll('#folha_p3 .gi[data-g="p3m"]')[0].value === '', d.querySelectorAll('#folha_p3 .gi[data-g="p3m"]')[0].value);
  /* o “anterior” da página 3 é a página 2 (não a folha 1): a página 2 tem a
     grade copiada antes da revisão da folha 1, então o primeiro número é 1. */
  w.eval("copiarGradePaginaAnterior('p3')");
  await wait(250);
  ok('botão da página 3 copia a grade da página 2', d.querySelectorAll('#folha_p3 .gi[data-g="p3m"]')[0].value === '1', d.querySelectorAll('#folha_p3 .gi[data-g="p3m"]')[0].value);
  ok('página 2 não foi duplicada nem apagada (as 3 cores continuam nela)', d.querySelectorAll('#coresList_p2 [id^="ci_"]').length === 3, d.querySelectorAll('#coresList_p2 [id^="ci_"]').length);

  /* ── 5. remover uma página do meio e adicionar outra ── */
  console.log('\n── 5. Remover página do meio e adicionar de novo ──');
  w.eval("removerPagina('p2')");
  await wait(250);
  w.eval('adicionarPagina()');
  await wait(400);
  const idsFolhas = [...d.querySelectorAll('#pw .folha')].map(f => f.id);
  ok('nenhuma folha duplicada depois de remover e adicionar', idsFolhas.length === new Set(idsFolhas).size, idsFolhas);
  ok('a página nova herdou a configuração revisada',
    [...d.querySelectorAll('#pw .folha')].filter(f => f.id !== 'folha1' && f.id !== 'folha_p3')
      .every(f => {
        const pid = f.id.replace('folha_', '');
        return ($('sepTxt_' + pid) || {}).value === '▸ NOVO SEPARADOR ◂' &&
          ($('coresTitulo_' + pid) || {}).value === 'CORES REVISADAS';
      }),
    idsFolhas);
  ok('o rodapé conta só as páginas que existem',
    /de 3$/.test(($('rodNum') || {}).textContent || ''), ($('rodNum') || {}).textContent);
  const rotulos = [...d.querySelectorAll('#pw .page-label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()).join(' / ');
  ok('numeração das páginas segue a ordem', rotulos === '— PÁGINA 1 — / — PÁGINA 2 — / — PÁGINA 3 —', rotulos);
  ok('a página nova nasce sem cor (a paleta é de cada página)',
    [...d.querySelectorAll('#pw .folha')].filter(f => f.id !== 'folha1' && f.id !== 'folha_p3')
      .every(f => d.querySelectorAll('#coresList_' + f.id.replace('folha_', '') + ' [id^="ci_"]').length === 0),
    [...d.querySelectorAll('#pw .folha')].map(f => f.id));

  /* ── 6. o tamanho do separador entra no estado salvo ── */
  console.log('\n── 6. Separador sobrevive ao salvar/restaurar ──');
  $('sepFontSize').value = '14';
  w.eval("applySepFontSize('sepTxt','sepFontSize')");
  const estado = w.eval('JSON.parse(JSON.stringify(capState()))');
  ok('capState guarda o tamanho do separador', estado.sepFontSize === '14', estado.sepFontSize);
  $('sepFontSize').value = '5';
  $('sepFontSize').dispatchEvent(new w.Event('input', { bubbles: true }));
  await wait(350);
  ok('antes de restaurar, as páginas extras foram para 5',
    [...d.querySelectorAll('#pw .folha')].filter(f => f.id !== 'folha1')
      .every(f => ($('sepFS_' + f.id.replace('folha_', '')) || {}).value === '5'));
  w.eval(`restState(${JSON.stringify(estado)})`);
  await wait(300);
  ok('restaurar devolve o tamanho do campo', $('sepFontSize').value === '14', $('sepFontSize').value);
  ok('restaurar devolve o tamanho aplicado no separador', $('sepTxt').style.fontSize === '14px', $('sepTxt').style.fontSize);
  ok('restaurar espelha o tamanho nas páginas extras',
    [...d.querySelectorAll('#pw .folha')].filter(f => f.id !== 'folha1')
      .every(f => ($('sepFS_' + f.id.replace('folha_', '')) || {}).value === '14'),
    [...d.querySelectorAll('#pw .folha')].map(f => f.id));

  /* ── 7. página branca continua existindo e não quebra ── */
  console.log('\n── 5. Página branca ──');
  w.eval('adicionarPaginaBranca()');
  await wait(300);
  const branca = w.eval('paginas[paginas.length-1].id');
  ok('página branca criada', !!$('folha_' + branca), branca);
  ok('a página branca não tem campos da ficha (é canvas livre)',
    !$('coresList_' + branca) && !!$('canvasInner_' + branca), branca);
  ok('nada estourou durante os testes', erros.length === 0, erros.slice(0, 3));

  console.log('\n═══ ESPELHO DA FOLHA 1: ' + pass + ' OK, ' + fail + ' FAIL ═══');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
