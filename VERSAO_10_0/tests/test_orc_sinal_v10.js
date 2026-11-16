'use strict';
/* ══ V10.7 — Sinal da produção no Orçamento ══

   O Orçamento mostra, junto do Total geral, o SINAL da produção: por padrão
   EXATAMENTE 50% do total, com a porcentagem editável e — para os casos
   raros — o valor pode ser digitado por cima (valor fixo).

   O que este arquivo trava:
   1. o campo existe, nasce em 50% e acompanha o total dos itens;
   2. mudar a porcentagem recalcula (25% → um quarto do total);
   3. digitar por cima vira valor FIXO (para de acompanhar), formatado ao
      sair do campo, e o botão ↺ volta ao cálculo pela porcentagem;
   4. o modo/valor sobrevivem ao autosave (orcCollectState/orcRestoreState);
   5. “Novo orçamento” devolve o padrão (50% calculado). */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 90) : ''); }
}

(async () => {
  const html = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');
  const errs = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_orcamento/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.URL.createObjectURL = () => 'blob:test';
      w.addEventListener('error', e => errs.push(e.message));
    }
  });

  const w = dom.window;
  const doc = w.document;
  await new Promise(r => setTimeout(r, 1500));

  const t = expr => {
    try { return w.eval(expr); }
    catch(e) { fail++; console.log('  [ERR]', e.message); return undefined; }
  };

  console.log('===== ORÇAMENTO V10.7: SINAL DA PRODUÇÃO (50% DO TOTAL) =====');

  /* ── 1. o campo existe e nasce certo ── */
  check('caixa do sinal (#orcSinalBox) existe', !!doc.getElementById('orcSinalBox'));
  check('campo de porcentagem nasce em 50', t(`document.getElementById('orcSinalPct').value`) === '50');
  check('sub-título anuncia 50% do total', t(`document.getElementById('orcSinalSub').textContent`) === 'Exatamente 50% do Total geral · acompanha os itens', t(`document.getElementById('orcSinalSub').textContent`));
  check('botão ↺ (voltar ao percentual) existe', !!doc.getElementById('orcSinalReset'));

  /* ── 2. acompanha o total: 2 itens × R$ 100 = R$ 200 → sinal R$ 100,00 ── */
  t(`addTableRow(); documentPages[0].tableItems[0].modelo='Camisa'; documentPages[0].tableItems[0].qnt=2; documentPages[0].tableItems[0].unit=100; renderItemsEditor(); updatePreviewFromForm(); 'ok'`);
  check('total geral é R$ 200,00', t(`document.getElementById('orcRunningTotal').textContent`) === 'R$ 200,00', t(`document.getElementById('orcRunningTotal').textContent`));
  check('sinal = exatamente 50% (R$ 100,00)', t(`document.getElementById('orcSinalVal').value`) === '100,00', t(`document.getElementById('orcSinalVal').value`));

  /* muda um item → o sinal acompanha */
  t(`documentPages[0].tableItems[0].qnt=4; updatePreviewFromForm(); 'ok'`);
  check('item mudou → sinal acompanha (R$ 200,00)', t(`document.getElementById('orcSinalVal').value`) === '200,00', t(`document.getElementById('orcSinalVal').value`));

  /* ── 3. porcentagem editável ── */
  t(`document.getElementById('orcSinalPct').value='25'; orcSinalAoMudarPct(); 'ok'`);
  check('25% do total (R$ 400,00 × 25%)', t(`document.getElementById('orcSinalVal').value`) === '100,00', t(`document.getElementById('orcSinalVal').value`));
  check('sub-título anuncia a nova porcentagem', (t(`document.getElementById('orcSinalSub').textContent`) || '').includes('25%'));
  t(`document.getElementById('orcSinalPct').value='30'; orcSinalAoMudarPct(); 'ok'`);
  check('30% de R$ 400,00 = R$ 120,00', t(`document.getElementById('orcSinalVal').value`) === '120,00', t(`document.getElementById('orcSinalVal').value`));

  /* ── 4. valor fixo (caso raro) ── */
  t(`(function(){var el=document.getElementById('orcSinalVal');el.value='350';el.dispatchEvent(new window.Event('input',{bubbles:true}));return 'ok'})()`);
  check('digitar por cima vira valor fixo', t(`orcSinalModo`) === 'fixo', t(`orcSinalModo`));
  check('o valor digitado não é reformatado enquanto digita', t(`document.getElementById('orcSinalVal').value`) === '350');
  check('sub-título avisa que é valor fixo', (t(`document.getElementById('orcSinalSub').textContent`) || '').includes('Valor fixo'));

  /* itens mudam → valor fixo NÃO acompanha */
  t(`documentPages[0].tableItems[0].qnt=10; updatePreviewFromForm(); 'ok'`);
  check('total mudou…', t(`document.getElementById('orcRunningTotal').textContent`) === 'R$ 1.000,00', t(`document.getElementById('orcRunningTotal').textContent`));
  check('…mas o valor fixo continua', t(`document.getElementById('orcSinalVal').value`) === '350', t(`document.getElementById('orcSinalVal').value`));

  /* ao sair do campo, o valor é formatado */
  t(`orcSinalAoSair(); 'ok'`);
  check('ao sair do campo, "350" vira "350,00"', t(`document.getElementById('orcSinalVal').value`) === '350,00', t(`document.getElementById('orcSinalVal').value`));

  /* mudar a porcentagem volta ao cálculo */
  t(`document.getElementById('orcSinalPct').value='50'; orcSinalAoMudarPct(); 'ok'`);
  check('porcentagem alterada volta ao modo calculado', t(`orcSinalModo`) === 'percentual');
  check('50% de R$ 1.000,00 = R$ 500,00', t(`document.getElementById('orcSinalVal').value`) === '500,00', t(`document.getElementById('orcSinalVal').value`));

  /* valor fixo de novo e botão ↺ */
  t(`(function(){var el=document.getElementById('orcSinalVal');el.value='123,45';el.dispatchEvent(new window.Event('input',{bubbles:true}));return 'ok'})()`);
  check('virou fixo de novo', t(`orcSinalModo`) === 'fixo');
  t(`orcSinalVoltarAoPercentual(); 'ok'`);
  check('botão ↺ volta ao percentual', t(`orcSinalModo`) === 'percentual');
  check('↺ recalcula: 50% de R$ 1.000,00', t(`document.getElementById('orcSinalVal').value`) === '500,00', t(`document.getElementById('orcSinalVal').value`));

  /* ── 5. sobrevive ao autosave (orcCollectState / orcRestoreState) ── */
  t(`(function(){var el=document.getElementById('orcSinalVal');el.value='700';el.dispatchEvent(new window.Event('input',{bubbles:true}));return 'ok'})()`);
  const estado = t(`JSON.parse(JSON.stringify(orcCollectState()))`);
  check('estado guarda o sinal', !!(estado && estado.sinal && estado.sinal.modo === 'fixo' && estado.sinal.fixo === '700'), estado && estado.sinal);
  /* restaura em outro estado: percentual 40% */
  t(`orcRestoreState({version:'vooalto_orcamento_v9',form:{},pages:[{id:1,tableItems:[{modelo:'X',qnt:1,unit:100}]}],sinal:{pct:'40',modo:'percentual'}}); 'ok'`);
  t(`orcUpdateRunningTotal(); 'ok'`);
  check('restaurado: porcentagem 40%', t(`document.getElementById('orcSinalPct').value`) === '40');
  check('restaurado: modo percentual', t(`orcSinalModo`) === 'percentual');
  check('restaurado: 40% de R$ 100,00 = R$ 40,00', t(`document.getElementById('orcSinalVal').value`) === '40,00', t(`document.getElementById('orcSinalVal').value`));
  /* e com valor fixo no arquivo */
  t(`orcRestoreState({version:'vooalto_orcamento_v9',form:{},pages:[{id:1,tableItems:[{modelo:'X',qnt:1,unit:100}]}],sinal:{pct:'50',modo:'fixo',fixo:'88,00'}}); 'ok'`);
  t(`orcUpdateRunningTotal(); 'ok'`);
  check('restaurado: valor fixo volta', t(`document.getElementById('orcSinalVal').value`) === '88,00', t(`document.getElementById('orcSinalVal').value`));
  check('restaurado: continua fixo após recalcular o total', t(`orcSinalModo`) === 'fixo');

  /* estado antigo (sem sinal) não quebra: volta ao padrão */
  t(`orcRestoreState({version:'vooalto_orcamento_v9',form:{},pages:[{id:1,tableItems:[]}]}); 'ok'`);
  t(`orcUpdateRunningTotal(); 'ok'`);
  check('arquivo sem sinal: modo segue o que havia (não quebra)', t(`typeof orcSinalModo`) === 'string');

  /* ── 6. novo orçamento volta ao padrão ── */
  w.confirm = () => true;
  t(`novoOrcamento(); 'ok'`);
  check('novo orçamento: porcentagem volta a 50', t(`document.getElementById('orcSinalPct').value`) === '50');
  check('novo orçamento: modo percentual', t(`orcSinalModo`) === 'percentual');
  check('novo orçamento: valor zerado', t(`document.getElementById('orcSinalVal').value`) === '', t(`document.getElementById('orcSinalVal').value`));

  /* ── 7. nada estourou ── */
  check('nenhum erro de página durante os testes', errs.length === 0, errs);

  console.log(`\n═══ SINAL DA PRODUÇÃO: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})();
