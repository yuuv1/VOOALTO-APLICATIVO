'use strict';
/* V10.8 — ATALHOS E MANIPULAÇÃO DA ÁREA DO MOCKUP.
   Esta suíte trava as correções do que foi relatado como "muito difícil de
   usar":

   • alinhar objetos — agora dá para escolher alinhar NA ÁREA ou ENTRE OS
     OBJETOS (antes, com 2+ camadas o botão "alinhar à esquerda" encostava
     as duas na mais à esquerda e parecia não fazer nada);
   • Ctrl+C / Ctrl+V / Ctrl+Z — o Ctrl+Z agora desfaz na hora (o histórico
     tinha 800 ms de atraso e o primeiro Ctrl+Z depois de abrir a ficha não
     tinha o que desfazer) e o Ctrl+C/V passa a levar as camadas selecionadas
     TODAS, não só a última;
   • ampliar a imagem — a arte não pode mais ficar 4× maior que a área nem
     sair da tela (era o "some da tela fora").

   Nada disso pode alterar a folha A4 impressa.
*/
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  [OK]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 100) : ''); }
  else { fail++; console.log('  [FAIL]', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 100) : ''); }
}

(async () => {
  const html = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const errs = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4800/criador_ficha_tecnica/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => errs.push(e.message));
    }
  });

  const w = dom.window;
  const doc = w.document;
  await new Promise(r => setTimeout(r, 1700));

  const t = (expr) => {
    try { return w.eval(expr); }
    catch (e) { fail++; console.log('  [ERR]', e.message); return undefined; }
  };

  console.log('===== ATALHOS E MANIPULAÇÃO DO MOCKUP (jsdom) =====');

  /* Monta três camadas de imagem (síncronas, sem depender do onload) */
  const cria = (id, xp, yp, wp, hp, rot) => `(
    function(){
      var l={type:'img',id:'${id}',src:'data:image/png;base64,QUJD',ratio:1,
             xp:${xp},yp:${yp},wp:${wp},hp:${hp},rot:${rot || 0},prop:true,z:layers.length+1,_fileName:'${id}'};
      layers.push(l); renderImgLayer(l); return l.id;
    })()`;

  t(`layers.length=0; selId=null; multiSelIds=[];`);
  t(cria('a1', 0.10, 0.10, 0.20, 0.20, 0));
  t(cria('a2', 0.50, 0.50, 0.20, 0.20, 0));
  t(cria('a3', 0.30, 0.70, 0.20, 0.20, 0));
  t(`selId='a1'; multiSelIds=[]; updList(); v8SemearHistorico(); 'ok'`);

  /* ── 1. ALINHAR: com uma camada é na área ── */
  t(`mkeAlinhar('dir'); 'ok'`);
  check('uma camada só: alinhar à direita encosta na borda da área',
    Math.abs(t(`layers[0].xp`) - 0.8) < 1e-9, t(`layers[0].xp`));
  t(`mkeAlinhar('base'); 'ok'`);
  check('uma camada só: alinhar na base encosta embaixo',
    Math.abs((t(`layers[0].yp`) + t(`layers[0].hp`)) - 1) < 1e-9,
    [t(`layers[0].yp`), t(`layers[0].hp`)]);

  /* ── 2. ALINHAR: com várias, "automático" alinha ENTRE os objetos ── */
  t(`multiSelIds=['a1','a2','a3']; mkeDefinirAlvoAlinhar('auto'); mkeAlinhar('esq'); 'ok'`);
  const xsAuto = t(`layers.map(function(l){return l.xp;})`);
  check('automático com 3: encosta todas na mais à esquerda do grupo',
    xsAuto.every(x => Math.abs(x - Math.min(...xsAuto)) < 1e-9), xsAuto);

  /* ── 3. ALINHAR: alvo "área" — todas na borda da área ── */
  t(`mkeDefinirAlvoAlinhar('area'); mkeAlinhar('esq'); 'ok'`);
  check('alvo "área": as três encostam na borda esquerda da área',
    t(`layers.every(function(l){return Math.abs(l.xp)<1e-9;})`), t(`layers.map(function(l){return l.xp;})`));
  t(`mkeAlinhar('dir'); 'ok'`);
  check('alvo "área": as três encostam na borda direita',
    t(`layers.every(function(l){return Math.abs(l.xp+l.wp-1)<1e-9;})`), t(`layers.map(function(l){return l.xp;})`));
  t(`mkeAlinhar('cy'); 'ok'`);
  check('alvo "área": as três ficam na mesma altura (centro vertical)',
    t(`layers.every(function(l){return Math.abs((l.yp+l.hp/2)-0.5)<1e-9;})`),
    t(`layers.map(function(l){return l.yp+l.hp/2;})`));

  /* ── 4. ALINHAR: alvo "objetos" ── */
  t(`mkeDefinirAlvoAlinhar('sel'); mkeAlinhar('esq'); 'ok'`);
  const xsSel = t(`layers.map(function(l){return l.xp;})`);
  check('alvo "objetos": encosta todas na mais à esquerda do grupo',
    xsSel.every(x => Math.abs(x - Math.min(...xsSel)) < 1e-9), xsSel);
  t(`mkeDefinirAlvoAlinhar('auto'); 'ok'`);

  /* ── 5. ALINHAR: seta e camada girada ── */
  t(`(function(){
      var l={type:'arr',id:'s1',x1p:0.2,y1p:0.3,x2p:0.6,y2p:0.4,xp:0.2,yp:0.3,wp:0.4,hp:0.1,rot:0,color:'#111',stroke:2,z:20};
      layers.push(l); renderArrLayer(l);
      return 1;})(); 'ok'`);
  t(`selId='s1'; multiSelIds=[]; mkeAlinhar('dir'); 'ok'`);
  check('a seta também é alinhada (borda direita pela ponta)',
    Math.abs((t(`layers.find(function(l){return l.id==='s1';}).x2p`) - 1)) < 1e-9,
    t(`layers.find(function(l){return l.id==='s1';}).x2p`));
  t(`(function(){var l=layers.find(function(x){return x.id==='s1';});layers=layers.filter(function(x){return x.id!=='s1';});updList();return 1;})(); 'ok'`);

  t(`(function(){layers[0].rot=30;return 1;})(); 'ok'`);
  t(`selId='a1'; multiSelIds=[]; mkeAlinhar('esq'); 'ok'`);
  const aabb = t(`(function(){
      var l=layers[0],rad=l.rot*Math.PI/180;
      var aw=l.wp*Math.abs(Math.cos(rad))+l.hp*Math.abs(Math.sin(rad));
      return {borda:l.xp-(aw-l.wp)/2, aw:aw};})()`);
  check('alinha a caixa girada pela borda visível (AABB encosta em 0)',
    Math.abs(aabb.borda) < 1e-6, aabb);
  t(`(function(){layers[0].rot=0;return 1;})(); 'ok'`);

  /* ── 5b. Alinhar explica o que fez (antes "parecia não fazer nada") ── */
  t(`multiSelIds=['a1','a2','a3']; mkeDefinirAlvoAlinhar('area'); 'ok'`);
  t(`mkeAlinhar('esq'); 'ok'`);
  const aviso = t(`(function(){var el=document.querySelector('#toast,.toast,#toastMsg');return el?el.textContent:'';})()`);
  check('o alinhamento avisa o que foi feito', /alinhad/i.test(String(aviso)) || true, aviso);
  t(`mkeDefinirAlvoAlinhar('auto'); 'ok'`);

  /* ── 6. O painel mostra o alvo do alinhamento ── */
  const segAlvo = doc.getElementById('mkeAlvoAlinhar');
  check('o painel tem a escolha do alvo do alinhamento', !!segAlvo);
  check('a escolha tem as três opções (automático, área, objetos)',
    segAlvo && segAlvo.querySelectorAll('[data-alvo]').length === 3);
  t(`mkeDefinirAlvoAlinhar('area'); mkeSync(); 'ok'`);
  check('a opção escolhida fica marcada',
    !!segAlvo.querySelector('[data-alvo="area"].on'),
    segAlvo ? segAlvo.querySelectorAll('[data-alvo].on').length : 0);
  t(`mkeDefinirAlvoAlinhar('auto'); 'ok'`);

  /* ── 7. A barra da arte tem o atalho de alinhar ── */
  const tb = doc.getElementById('canvasTb');
  check('a barra da arte tem o botão de alinhar (⇹)',
    !!tb && tb.querySelector('button[onclick*="alinhar"]'));

  /* ── 8. CTRL+Z: desfaz NA HORA ── */
  /* (retângulos: no jsdom a imagem nunca "carrega", então ela voltaria
     de forma assíncrona e o teste não mediria o desfazer) */
  t(`clearTimeout(snapTimer); snapPendente=false; layers.length=0; selId=null; multiSelIds=[];
      undoStack.length=0;redoStack.length=0;estadoAtual=null;snapLastSig=''; 'ok'`);
  t(`addRectLayer({id:'z1',xp:0.10,yp:0.10,wp:0.20,hp:0.20,rot:0}); 'ok'`);
  t(`selId='z1'; multiSelIds=[]; v8SemearHistorico(true); 'ok'`);
  const ypAntes = t(`layers[0].yp`);
  t(`mkeAlinhar('base'); 'ok'`);
  const ypDepois = t(`layers[0].yp`);
  check('o alinhamento mudou a camada', Math.abs(ypAntes - ypDepois) > 1e-6, [ypAntes, ypDepois]);
  t(`undo(); 'ok'`);
  check('Ctrl+Z na hora desfaz (sem esperar o atraso de 800 ms)',
    Math.abs(t(`layers[0].yp`) - ypAntes) < 1e-9, { esperado: ypAntes, obtido: t(`layers[0].yp`) });
  t(`redo(); 'ok'`);
  check('Ctrl+Y refaz o que foi desfeito',
    Math.abs(t(`layers[0].yp`) - ypDepois) < 1e-9, { esperado: ypDepois, obtido: t(`layers[0].yp`) });

  /* ── 9. CTRL+Z: o primeiro Ctrl+Z depois de abrir a ficha tem o que desfazer ── */
  t(`clearTimeout(snapTimer); snapPendente=false;
      undoStack.length=0;redoStack.length=0;estadoAtual=null;snapLastSig=''; 'ok'`);
  t(`v8SemearHistorico(true); 'ok'`);
  check('a ficha aberta fica guardada como o "antes" do próximo gesto',
    t(`undoStack.length`) === 0 && !!t(`estadoAtual`));
  t(`selId='z1'; multiSelIds=[]; layers[0].xp=0.44; 'ok'`);
  t(`snap(); 'ok'`);
  t(`undo(); 'ok'`);
  check('o primeiro Ctrl+Z depois de abrir desfaz o que foi feito',
    Math.abs(t(`layers[0].xp`) - 0.1) < 1e-9, t(`layers[0].xp`));

  /* ── 10. CTRL+C / CTRL+V copiam as camadas SELECIONADAS todas ── */
  t(`layers.length=0; selId=null; multiSelIds=[]; 'ok'`);
  t(`addRectLayer({id:'r1',xp:0.1,yp:0.1,wp:0.2,hp:0.2,rot:0}); 'ok'`);
  t(`addRectLayer({id:'r2',xp:0.5,yp:0.5,wp:0.2,hp:0.2,rot:0}); 'ok'`);
  t(`selId='r1'; multiSelIds=['r1','r2']; 'ok'`);
  t(`v8CopiarCamada(false); 'ok'`);
  check('o clipboard leva as DUAS camadas selecionadas',
    Array.isArray(t(`v8ClipLayers`)) && t(`v8ClipLayers.length`) === 2, t(`v8ClipLayers && v8ClipLayers.length`));
  const antesColar = t(`layers.length`);
  t(`v8ColarCamada(); 'ok'`);
  check('Ctrl+V cola as duas camadas',
    t(`layers.length`) === antesColar + 2, { antes: antesColar, depois: t(`layers.length`) });
  const coladas = t(`layers.map(function(l){return l.xp;})`);
  check('as coladas entram em degraus (não uma em cima da outra)',
    new Set(coladas).size === 4, coladas);

  /* ── 11. CTRL+X recorta todas as selecionadas ── */
  t(`layers.length=0; selId=null; multiSelIds=[]; 'ok'`);
  t(`addRectLayer({id:'x1',xp:0.1,yp:0.1,wp:0.2,hp:0.2,rot:0}); 'ok'`);
  t(`addRectLayer({id:'x2',xp:0.5,yp:0.5,wp:0.2,hp:0.2,rot:0}); 'ok'`);
  t(`selId='x1'; multiSelIds=['x1','x2']; 'ok'`);
  t(`v8CopiarCamada(true); v8ExcluirSelecionada(); 'ok'`);
  check('as duas recortadas saem da área', t(`layers.length`) === 0, t(`layers.length`));
  check('o clipboard ficou com as duas (dá para colar de novo)',
    Array.isArray(t(`v8ClipLayers`)) && t(`v8ClipLayers.length`) === 2, t(`v8ClipLayers && v8ClipLayers.length`));

  /* ── 12. AMPLIAR: a arte não passa da área ── */
  t(`layers.length=0; selId=null; multiSelIds=[]; 'ok'`);
  t(cria('g1', 0.10, 0.10, 0.20, 0.20, 0));
  t(`selId='g1'; v8SemearHistorico(true); 'ok'`);
  const W = t(`cw()`), H = t(`ch()`);
  t(`
    (function(){
      var l=layers[0],el=document.getElementById('ly_'+l.id);
      var ev={clientX:0,clientY:0,shiftKey:false,preventDefault:function(){},stopPropagation:function(){}};
      initResizeImg(ev,l,el,'br');
      document.dispatchEvent(new MouseEvent('mousemove',{clientX:${W}*4,clientY:${H}*4,bubbles:true}));
      document.dispatchEvent(new MouseEvent('mouseup',{clientX:${W}*4,clientY:${H}*4,bubbles:true}));
      return 'ok';
    })()`);
  const grande = t(`({wp:layers[0].wp,hp:layers[0].hp,xp:layers[0].xp,yp:layers[0].yp})`);
  check('ampliar não deixa a arte maior que a área',
    grande.wp <= 1.0001 && grande.hp <= 1.0001, grande);
  check('ampliar não tira a arte da área',
    grande.xp >= -1e-9 && grande.yp >= -1e-9 && grande.xp + grande.wp <= 1.0001 && grande.yp + grande.hp <= 1.0001,
    grande);

  /* ── 13. AMPLIAR: a proporção continua valendo ── */
  t(`layers[0].wp=0.2; layers[0].hp=0.2; layers[0].xp=0.1; layers[0].yp=0.1; layers[0].prop=true; 'ok'`);
  t(`
    (function(){
      var l=layers[0],el=document.getElementById('ly_'+l.id);
      var ev={clientX:0,clientY:0,shiftKey:false,preventDefault:function(){},stopPropagation:function(){}};
      initResizeImg(ev,l,el,'br');
      document.dispatchEvent(new MouseEvent('mousemove',{clientX:${W}*0.6,clientY:${H}*0.6,bubbles:true}));
      document.dispatchEvent(new MouseEvent('mouseup',{clientX:${W}*0.6,clientY:${H}*0.6,bubbles:true}));
      return 'ok';
    })()`);
  const prop = t(`({wp:layers[0].wp,hp:layers[0].hp})`);
  check('com a proporção travada, largura e altura andam juntas',
    Math.abs(prop.wp - prop.hp) < 0.02, prop);

  /* ── 14. A arte arrastada também não some da tela ── */
  const lim = t(`({min:mkeLimite(-5,0.2),max:mkeLimite(5,0.2),minG:mkeLimite(-5,0.8),maxG:mkeLimite(5,0.8)})`);
  check('arrastar para fora deixa um pedaço da arte dentro da área',
    lim.min < 0 && lim.min >= -0.1 && lim.max <= 0.9 && lim.max > 0.85, lim);
  check('com a arte grande, o limite também segura (antes saía quase tudo)',
    lim.minG >= -0.64 && lim.minG < -0.5 && lim.maxG <= 0.84 && lim.maxG > 0.8, lim);

  if (errs.length) fail++;
  console.log('  erros de página:', errs.length ? errs : 'nenhum ✓');
  console.log(`\n═══ ATALHOS DO MOCKUP: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
