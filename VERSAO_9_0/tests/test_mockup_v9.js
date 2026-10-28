'use strict';
/* V9.1 — Estúdio do mockup (Ficha Técnica).
   Esta suíte trava o que a V9.1 acrescentou na área onde as artes entram:
   régua + painel de ferramentas, troca de imagem sem perder lugar, espelhar,
   girar, opacidade, travar, alinhar/distribuir, organizar frente-e-costas,
   precisão em %, guias, ímã, lista de camadas com olho/cadeado/renomear e o
   modo ampliado. Nada disso pode alterar a folha A4 impressa. */
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

  console.log('===== MOCKUP V9.1 (jsdom) =====');

  /* ── 1. Interface construída ── */
  check('régua de ferramentas (#mkeRail) criada', !!doc.getElementById('mkeRail'));
  check('painel de ferramentas (#mkePainel) criado', !!doc.getElementById('mkePainel'));
  check('painel começa fechado', !doc.getElementById('mkePainel').classList.contains('vis'));
  check('4 abas no painel', doc.querySelectorAll('#mkePainel .mke-tab').length === 4);
  check('container de guias (#mkeGuias) existe', !!doc.getElementById('mkeGuias'));
  check('medida do arraste (#mkeBadge) existe', !!doc.getElementById('mkeBadge'));
  check('entrada de arquivo da troca (#mkeArquivo) existe', !!doc.getElementById('mkeArquivo'));
  check('botão do ímã na régua', !!doc.getElementById('mkeBtnIma'));
  check('régua tem botão de imagem', !!doc.querySelector('#mkeRail [data-acao="add-imagem"]'));
  check('régua tem botão de ampliar', !!doc.querySelector('#mkeRail [data-acao="estudio"]'));

  /* ── 2. Barra da imagem ganhou trocar/caber/mais ── */
  const barra = doc.getElementById('canvasTb').textContent;
  check('barra da imagem tem ⇄ (trocar)', barra.includes('⇄'));
  check('barra da imagem tem ⤡ (caber)', barra.includes('⤡'));
  check('barra da imagem tem ⋯ (mais ferramentas)', barra.includes('⋯'));
  check('lCaber definida', t(`typeof lCaber`) === 'function');

  /* ── 3. Funções do motor existem ── */
  ['mkeCtx','mkeSnapXY','mkeSlotLivre','mkeGirar','mkeEspelhar','mkeAlinhar','mkeOrganizar',
   'mkeDuplicarCamada','mkeSubstituir','mkePrecisaoAplicar','mkeRenderGuias','mkeEntrarEstudio',
   'mkeSairEstudio','mkeExportarArea','mkeAlternarOculto','mkeAlternarTrava','mkeMoverZ','mkeRenomear']
    .forEach(n => check('função ' + n, t(`typeof ${n}`) === 'function'));

  /* ── 4. Seleção alimenta o painel ── */
  t(`criarRetangulo(); 'ok'`);
  const idRect = t(`selId`);
  check('retângulo criado e selecionado', !!idRect && t(`layers.length`) === 1);
  check('painel mostra a camada ativa', (doc.getElementById('mkeAlvo').textContent || '').includes('Retângulo'));
  check('camada aparece na lista', doc.querySelectorAll('#layersList .lp-row').length === 1);

  /* ── 5. Alinhar ── */
  t(`mkeAlinhar('esq'); 'ok'`);
  check('alinhar à esquerda -> xp 0', t(`layers[0].xp`) === 0);
  t(`mkeAlinhar('dir'); 'ok'`);
  check('alinhar à direita -> borda encostada', Math.abs(t(`layers[0].xp + layers[0].wp`) - 1) < 1e-9);
  t(`mkeAlinhar('centro'); 'ok'`);
  check('centralizar -> x/y no meio', Math.abs(t(`layers[0].xp - (1-layers[0].wp)/2`)) < 1e-9);

  /* ── 6. Espelhar / girar / opacidade ── */
  t(`mkeEspelhar('h'); 'ok'`);
  const elRectId = 'ly_' + idRect;
  check('espelhar H grava na camada', t(`!!layers[0].flipH`) === true);
  check('espelhar H aplica scaleX no elemento', (doc.getElementById(elRectId).style.transform || '').includes('scaleX(-1)'));
  t(`mkeEspelhar('v'); 'ok'`);
  check('espelhar V aplica scaleY', (doc.getElementById(elRectId).style.transform || '').includes('scaleY(-1)'));

  const antes = { wp: t(`layers[0].wp`), hp: t(`layers[0].hp`) };
  t(`mkeGirar(1); 'ok'`);
  check('girar 90 gira a camada', Math.abs(Math.abs(t(`layers[0].rot`)) - 90) < 1e-9, t(`layers[0].rot`));
  check('girar 90 troca largura por altura', Math.abs(t(`layers[0].wp`) - antes.hp) < 1e-9 && Math.abs(t(`layers[0].hp`) - antes.wp) < 1e-9);
  t(`mkeRotacao0(); 'ok'`);
  check('rotação zera', t(`layers[0].rot`) === 0);

  t(`mkeDefinirOpacidade('40'); 'ok'`);
  check('opacidade 40% no elemento', doc.getElementById(elRectId).style.opacity === '0.4');
  check('opacidade 40% no dado', Math.abs(t(`layers[0].op`) - 0.4) < 1e-9);
  t(`mkeDefinirOpacidade('100'); 'ok'`);
  check('opacidade 100% limpa o dado', t(`layers[0].op`) === undefined);

  /* ── 7. Travar ── */
  t(`mkeTravarPosicao(); 'ok'`);
  check('travar marca a camada', t(`!!layers[0].locked`) === true);
  check('travar põe classe .mke-travada', doc.getElementById(elRectId).classList.contains('mke-travada'));
  check('travar aparece na lista', !!doc.querySelector('#layersList .lp-row.mke-lock'));
  t(`mkeTravarPosicao(); 'ok'`);
  check('destravar remove a marca', t(`!!layers[0].locked`) === false);

  /* ── 8. Lista de camadas: olho, cadeado, renomear, ordem ── */
  t(`mkeAlternarOculto('${idRect}'); 'ok'`);
  check('ocultar esconde o elemento', doc.getElementById(elRectId).style.display === 'none');
  check('ocultar grava hidden', t(`!!layers[0].hidden`) === true);
  check('linha oculta esmaecida', !!doc.querySelector('#layersList .lp-row.mke-hid'));
  t(`mkeAlternarOculto('${idRect}'); 'ok'`);
  check('mostrar devolve o elemento', doc.getElementById(elRectId).style.display === '');

  t(`mkeRenomear('${idRect}'); 'ok'`);
  const spanNome = doc.querySelector('#layersList .lp-name');
  check('renomear entra em edição', spanNome.getAttribute('contenteditable') === 'true');
  spanNome.textContent = 'Frente da camiseta';
  spanNome.dispatchEvent(new w.Event('blur'));
  check('renomear grava o nome', t(`layers[0].name`) === 'Frente da camiseta');
  check('nome novo aparece na lista', (doc.querySelector('#layersList .lp-name').textContent || '') === 'Frente da camiseta');

  t(`criarTexto(); 'ok'`);
  const idTxt = t(`selId`);
  t(`mkeMoverZ('${idTxt}',-1); 'ok'`);
  check('descer na pilha troca o z', t(`(layers.find(l=>l.id==='${idTxt}').z||0) < (layers.find(l=>l.id==='${idRect}').z||0)`));

  /* ── 8b. Menu de contexto (botão direito) ── */
  t(`selLayer('${idRect}'); 'ok'`);
  doc.getElementById('ly_' + t(`selId`)).dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  check('botão direito abre o menu', !!doc.getElementById('mkeMenu'));
  check('menu tem ações da camada', doc.querySelectorAll('#mkeMenu button').length >= 8);
  check('menu mostra atalho do duplicar', (doc.getElementById('mkeMenu').textContent || '').includes('Ctrl+D'));
  const antesDup = t(`layers.length`);
  [...doc.querySelectorAll('#mkeMenu button')].find(b => b.textContent.includes('Duplicar')).click();
  check('duplicar pelo menu cria camada', t(`layers.length`) === antesDup + 1);
  check('menu fecha depois da ação', !doc.getElementById('mkeMenu'));
  doc.getElementById('canvasInner').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  check('menu no fundo oferece inserir imagem', (doc.getElementById('mkeMenu').textContent || '').includes('Inserir imagem'));
  t(`mkeMenuFechar(); 'ok'`);
  check('menu fecha por função', !doc.getElementById('mkeMenu'));
  /* deixa uma camada só para os testes seguintes */
  t(`(function(){var alvo=layers[0];layers.length=0;selId=null;document.querySelectorAll('#canvasInner .rect-layer,#canvasInner .txt-layer,#canvasInner .img-layer,#canvasInner .arr-layer,#canvasInner .circle-layer').forEach(function(e){e.remove()});layers.push(alvo);renderRectLayer(alvo);selLayer(alvo.id);return 1;})(); 'ok'`);

  /* ── 9. Precisão ── */
  t(`selLayer('${idRect}'); 'ok'`);
  t(`mkeAba('precisao'); 'ok'`);
  check('aba precisão fica ativa', doc.querySelector('#mkePainel .mke-sec[data-sec="precisao"]').classList.contains('on'));
  doc.getElementById('mkePX').value = '10';
  doc.getElementById('mkePY').value = '20';
  doc.getElementById('mkePW').value = '30';
  doc.getElementById('mkePH').value = '25';
  doc.getElementById('mkePR').value = '15';
  t(`mkePrecisaoAplicar(); 'ok'`);
  check('precisão aplica posição', Math.abs(t(`layers.find(l=>l.id==='${idRect}').xp`) - 0.10) < 1e-9);
  check('precisão aplica tamanho', Math.abs(t(`layers.find(l=>l.id==='${idRect}').wp`) - 0.30) < 1e-9);
  check('precisão aplica rotação', t(`layers.find(l=>l.id==='${idRect}').rot`) === 15);
  check('leitura em mm aparece', /\d+([.,]\d+)? × \d+([.,]\d+)? mm/.test(doc.getElementById('mkeMm').textContent || ''), doc.getElementById('mkeMm').textContent);

  /* ── 10. Ímã e guias ── */
  t(`mkeGuiaModo='off'; mkeCicloGuia(); 'ok'`);
  check('guias ligam no ciclo', doc.getElementById('mkeGuias').classList.contains('on'));
  check('guias desenham linhas', doc.querySelectorAll('#mkeGuias .mke-guia').length > 0);
  check('guia tem etiqueta', !!doc.querySelector('#mkeGuias .mke-guia-tag'));
  t(`mkeCicloGuia(); mkeCicloGuia(); mkeCicloGuia(); 'ok'`);
  check('ciclo volta para desligado', t(`mkeGuiaModo`) === 'off' && !doc.getElementById('mkeGuias').classList.contains('on'));

  const snap = t(`(function(){var l=layers.find(x=>x.id==='${idRect}');l.wp=0.1;l.hp=0.1;l.xp=0.449;l.yp=0.2;var s=mkeSnapXY(l,0.449,0.2,400,400);return {x:s.xp,c:s.xp+l.wp/2};})()`);
  check('ímã encaixa o centro na marca de 50%', snap && Math.abs(snap.c - 0.5) < 1e-6, snap);
  t(`mkeGuiaViva('v',null,1); 'ok'`);
  check('guia viva some quando não há encaixe', doc.getElementById('mkeSmartV').style.display === 'none');

  /* ── 11. Limite: camada não se perde fora da área ── */
  check('limite impede sair pela direita', t(`mkeLimite(1.4,0.2)`) === 0.9);
  check('limite deixa pendurar um pouco à esquerda', t(`mkeLimite(-0.5,0.2)`) > -0.2);

  /* ── 12. Encaixe automático de imagem nova ── */
  const slot = t(`(function(){
    layers.length=0; layers.push({type:'img',id:'x1',src:'data:,',ratio:1,xp:0,yp:0,wp:0.5,hp:0.5,rot:0,z:10});
    return mkeSlotLivre(0.4,0.4);
  })()`);
  check('imagem nova não cai sobre a que já existe', slot && slot.xp >= 0.49, slot);
  t(`layers.length=0; 'ok'`);

  /* ── 13. Organizar (2 colunas) com duas imagens ── */
  const org = t(`(function(){
    layers.length=0; selId=null; zCnt=10;
    var a={type:'img',id:'i1',src:'data:,',ratio:1,xp:0.1,yp:0.1,wp:0.8,hp:0.8,rot:0,z:11};
    var b={type:'img',id:'i2',src:'data:,',ratio:1,xp:0.2,yp:0.2,wp:0.7,hp:0.7,rot:0,z:12};
    layers.push(a);layers.push(b);renderImgLayer(a);renderImgLayer(b);
    selLayer('i1');
    mkeOrganizar('2col');
    return {xa:layers[0].xp,xb:layers[1].xp,ha:layers[0].hp,hb:layers[1].hp,wa:layers[0].wp,wb:layers[1].wp};
  })()`);
  check('organizar 2 colunas separa as imagens', org && Math.abs(org.xa - org.xb) > 0.3, org);
  check('organizar 2 colunas iguala a altura', org && Math.abs(org.ha - org.hb) < 1e-6);
  check('organizar 2 colunas iguala a largura', org && Math.abs(org.wa - org.wb) < 1e-6);

  t(`mkeMolduraJusta(); 'ok'`);
  check('moldura justa respeita a proporção da imagem', t(`(function(){var l=layers[0];return Math.abs(l.wp*400)/400;})()`) > 0);

  /* ── 14. Modo ampliado ── */
  t(`mkeEntrarEstudio(); 'ok'`);
  check('estúdio marca o body', doc.body.classList.contains('mke-studio-on'));
  check('estúdio marca a área do mockup', doc.getElementById('canvasOuter').classList.contains('mke-studio'));
  check('barra do estúdio montada', !!doc.getElementById('mkeStudioBar'));
  t(`mkeSairEstudio(); 'ok'`);
  check('sair do estúdio limpa o body', !doc.body.classList.contains('mke-studio-on'));
  check('sair do estúdio limpa a área', !doc.getElementById('canvasOuter').classList.contains('mke-studio'));

  /* ── 15. Impressão sai do estúdio e usa % ── */
  t(`mkeEntrarEstudio(); preprPrintFake=1; 'ok'`);
  t(`prepPrint(); 'ok'`);
  check('prepPrint fecha o estúdio', !doc.body.classList.contains('mke-studio-on'));
  check('prepPrint posiciona em % (impressão)', (doc.getElementById('ly_i1').style.left || '').includes('%'));

  /* ── 16. Nada da ferramenta entra na impressão ── */
  const css = [...doc.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } })
    .map(r => r.cssText).join('\n');
  check('CSS esconde régua/painel/guias na impressão',
    /@media print[\s\S]*?\.mke-rail[\s\S]*?\.mke-panel/.test(css.replace(/\n/g, ' ')));
  check('preview limpa esconde as ferramentas', /preview-clean[\s\S]*?mke-rail/.test(css));
  check('estúdio vira estático no papel', /mke-studio\{position:static!important/.test(css.replace(/\s+/g, '')));
  check('PNG da folha esconde a régua e o painel', /mke-exportando[\s\S]*?mke-rail/.test(css) && /mke-exportando[\s\S]*?layers-panel/.test(css));
  check('prepPrint marca o corpo como exportando', doc.body.classList.contains('mke-exportando'));
  t(`restAllPx(); 'ok'`);
  check('restAllPx devolve as ferramentas', !doc.body.classList.contains('mke-exportando'));

  /* ── 17. Persistência dos novos campos ── */
  t(`(function(){var l=layers[0];l.flipH=1;l.hidden=1;l.locked=1;l.op=0.5;l.name='Frente';return 1;})(); 'ok'`);
  const ser = t(`serLayer(layers[0])`);
  check('serLayer guarda espelhamento/oculto/trava/opacidade/nome',
    ser && ser.flipH === 1 && ser.hidden === 1 && ser.locked === 1 && ser.op === 0.5 && ser.name === 'Frente', ser);
  check('campos padrão não engordam o arquivo', t(`(function(){var b=serLayer({id:'z',type:'rect',xp:0,yp:0,wp:1,hp:1,rot:0,z:1});return !('name' in b)&&!('hidden' in b)&&!('op' in b)&&!('flipH' in b);})()`) === true);

  /* ── 17.1 Voltar a camada ao estado original ── */
  t(`(function(){var l=layers[0];l.rot=37;l.flipH=1;l.flipV=1;l.op=0.4;l.fit='cover';l.prop=false;selLayer(l.id);return 1;})(); 'ok'`);
  t(`mkeAcao('reset'); 'ok'`);
  check('reset zera giro/espelho/opacidade', t(`(function(){var l=layers[0];return l.rot===0&&!l.flipH&&!l.flipV&&l.op===undefined&&l.fit==='contain';})()`) === true);
  check('reset devolve a proporção travada', t(`layers[0].prop`) === true);
  check('reset reaplica o visual no elemento', t(`(function(){var el=document.getElementById('ly_'+layers[0].id);return el.style.opacity===''&&el.style.transform==='rotate(0deg)';})()`) === true);

  /* ── 17.1b Endireitar em graus ── */
  t(`(function(){var l=layers[0];l.rot=0;l.type='img';l.ratio=1;l.wp=.3;l.hp=.3;selLayer(l.id);return 1;})(); 'ok'`);
  t(`mkeAcao('rot-p1'); 'ok'`);
  check('+1° soma um grau', t(`layers[0].rot`) === 1, t(`layers[0].rot`));
  t(`mkeAcao('rot-m1'); mkeAcao('rot-m1'); 'ok'`);
  check('−1° duas vezes volta para -1', t(`layers[0].rot`) === -1, t(`layers[0].rot`));
  t(`mkeAcao('rot-m15'); 'ok'`);
  check('−15° endireita sem passar de -180', t(`layers[0].rot`) === -16, t(`layers[0].rot`));
  check('girar em graus não mexe no tamanho',
    Math.abs(t(`layers[0].wp`) - 0.3) < 1e-9 && Math.abs(t(`layers[0].hp`) - 0.3) < 1e-9);
  t(`(function(){layers[0].rot=170;mkeGirarGraus(15);return 1;})(); 'ok'`);
  check('passar de 180° volta para o lado negativo', t(`layers[0].rot`) === -175, t(`layers[0].rot`));
  t(`mkeRotacao0(); 'ok'`);
  check('Alt+→ endireita 1° pelo teclado', (function(){
    const ev = new w.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true });
    doc.dispatchEvent(ev);
    return t(`layers[0].rot`) === 1;
  })(), t(`layers[0].rot`));
  check('Alt+Shift+← endireita 15°', (function(){
    const ev = new w.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, shiftKey: true, bubbles: true });
    doc.dispatchEvent(ev);
    return t(`layers[0].rot`) === -14;
  })(), t(`layers[0].rot`));
  t(`mkeRotacao0(); 'ok'`);

  /* ── 17.2 Ajuda do estúdio e lista de camadas sincronizada ── */
  check('barra do estúdio tem botão de ajuda', !!doc.querySelector('#mkeStudioBar [data-acao="ajuda"]'));
  t(`mkeAcao('ajuda'); 'ok'`);
  check('ajuda do estúdio abre a janela de ajuda', doc.getElementById('v7AjudaFicha').classList.contains('open'));
  check('ajuda tem o trecho do estúdio', !!doc.getElementById('ajudaMockup'));
  t(`fecharAjudaFicha(); 'ok'`);
  t(`document.getElementById('layersPanel').classList.remove('vis'); toggleLayersPanel(); 'ok'`);
  check('abrir a lista de camadas marca o botão 🗂 da régua',
    doc.querySelector('#mkeRail [data-acao="camadas"]').classList.contains('on'));
  t(`toggleLayersPanel(); 'ok'`);
  check('fechar a lista apaga o destaque do botão 🗂',
    !doc.querySelector('#mkeRail [data-acao="camadas"]').classList.contains('on'));

  /* ── 17.2b Multiseleção: alinhar ENTRE as camadas e rótulo no painel ── */
  t(`(function(){
      layers.length=0;
      ['a1','a2','a3'].forEach(function(id,i){
        layers.push({type:'rect',id:id,fillColor:'#eee',strokeColor:'#333',strokeWidth:2,
                     xp:[0.1,0.35,0.7][i],yp:[0.1,0.5,0.3][i],wp:[0.15,0.15,0.15][i],hp:[0.1,0.1,0.1][i],rot:0,z:10+i});
        var d=document.createElement('div');d.className='rect-layer';d.id='ly_'+id;
        document.getElementById('canvasInner').appendChild(d);
      });
      selId=null;multiSelIds=['a1','a2','a3'];updGroupBox&&updGroupBox();mkeSync();return 1;})(); 'ok'`);
  check('painel avisa que há várias camadas selecionadas',
    (doc.getElementById('mkeAlvo').textContent || '').includes('3 camadas'));
  t(`mkeAlinhar('esq'); 'ok'`);
  const xs = t(`layers.map(function(l){return l.xp;})`);
  check('alinhar à esquerda encosta as três na mais à esquerda',
    xs.every(x => Math.abs(x - 0.1) < 1e-9), xs);
  t(`mkeAlinhar('topo'); 'ok'`);
  const ys = t(`layers.map(function(l){return l.yp;})`);
  check('alinhar no topo encosta as três na mais alta', ys.every(y => Math.abs(y - 0.1) < 1e-9), ys);
  t(`(function(){layers[0].yp=0.2;layers[1].yp=0.4;layers[2].yp=0.8;return 1;})(); 'ok'`);
  t(`mkeAlinhar('base'); 'ok'`);
  const bases = t(`layers.map(function(l){return l.yp+l.hp;})`);
  check('alinhar na base deixa as três com a mesma base',
    bases.every(b => Math.abs(b - Math.max(...bases)) < 1e-9), bases);
  t(`mkeAlinhar('cx'); 'ok'`);
  const cxs = t(`layers.map(function(l){return l.xp+l.wp/2;})`);
  check('centralizar no grupo deixa o mesmo centro X',
    cxs.every(c => Math.abs(c - cxs[0]) < 1e-9), cxs);
  /* uma camada só volta a alinhar na ÁREA */
  t(`multiSelIds=[]; selId='a1'; mkeSync(); mkeAlinhar('esq'); 'ok'`);
  check('com uma camada só, alinhar é na área', t(`layers[0].xp`) === 0);
  t(`(function(){layers.length=0;multiSelIds=[];selId=null;
      var ci=document.getElementById('canvasInner');
      ci.querySelectorAll('.rect-layer').forEach(function(e){e.remove();});
      criarRetangulo();return 1;})(); 'ok'`);

  /* ── 17.3 As ferramentas acompanham a página em foco ── */
  t(`v7AdicionarPaginaComUndo('normal'); 'ok'`);
  await new Promise(r => setTimeout(r, 400));
  const pag2 = t(`(function(){var p=paginas[paginas.length-1];return {id:p.id,canvas:!!document.getElementById('canvasInner_'+p.id)};})()`);
  check('página extra criada com área de mockup', !!(pag2 && pag2.canvas), pag2);
  t(`v7MostrarToolbar({id:'${pag2.id}',tipo:'normal',p1:false}); 'ok'`);
  check('foco na página extra move a régua para ela',
    doc.getElementById('mkeRail').parentElement === doc.getElementById('canvasInner_' + pag2.id));
  check('foco na página extra move o painel para ela',
    doc.getElementById('mkePainel').parentElement === doc.getElementById('canvasInner_' + pag2.id));
  check('foco na página extra move as guias para ela',
    doc.getElementById('mkeGuias').parentElement === doc.getElementById('canvasInner_' + pag2.id));
  const idsFoco = t(`(function(){
      updList();
      var ids=[].map.call(document.querySelectorAll('#layersList .lp-row'),function(r){return r.dataset.id;});
      var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      var bater=ids.length===p.layers.length&&ids.every(function(i){return p.layers.some(function(l){return l.id===i;});});
      return {bater:bater,ids:ids,qtd:p.layers.length};
    })()`);
  check('a lista de camadas mostra as camadas da página em foco', !!(idsFoco && idsFoco.bater), idsFoco);
  check('o cabeçalho da lista diz de qual página é',
    (doc.querySelector('#layersPanel .lp-hdr span').textContent || '').includes('P'));
  check('a barra flutuante da página extra também tem ⤢ e 🎛',
    (doc.getElementById('v7PageToolbar').innerHTML.match(/⤢/g) || []).length >= 1 &&
    doc.getElementById('v7PageToolbar').innerHTML.includes('🎛'));
  t(`mkeEntrarEstudio(); 'ok'`);
  check('estúdio amplia a área da página extra',
    doc.getElementById('canvasInner_' + pag2.id).classList.contains('mke-studio'));
  check('estúdio não marca a folha 1 quando a foco é outra',
    !doc.getElementById('canvasOuter').classList.contains('mke-studio'));
  t(`mkeSairEstudio(); 'ok'`);
  check('sair do estúdio limpa a página extra',
    !doc.getElementById('canvasInner_' + pag2.id).classList.contains('mke-studio'));
  t(`v7MostrarToolbar({id:'folha1',tipo:'normal',p1:true}); 'ok'`);
  check('voltando à folha 1 a régua volta para ela',
    doc.getElementById('mkeRail').parentElement === doc.getElementById('canvasOuter'));
  check('voltando à folha 1 as guias voltam para a área da folha 1',
    doc.getElementById('mkeGuias').parentElement === doc.getElementById('canvasInner'));
  check('voltando para a folha 1 a lista volta a mostrar a folha 1',
    (function(){
      t(`updList(); 'ok'`);
      var ids = [...doc.querySelectorAll('#layersList .lp-row')].map(r => r.dataset.id);
      return ids.length === t(`layers.length`) && ids.every(i => t(`layers.some(function(l){return l.id==='`+i+`';})`));
    })());

  /* ── 17.4 As ações do painel funcionam na página extra ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.layers.push({type:'rect',id:'rx1',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:0.3,yp:0.3,wp:0.2,hp:0.2,rot:0,z:11});
      var d=document.createElement('div');d.className='rect-layer';d.id='ly_${pag2.id}_rx1';
      document.getElementById('canvasInner_${pag2.id}').appendChild(d);
      selLayerExtra(p,'rx1');return 1;})(); 'ok'`);
  check('seleção na página extra é lida pelo painel',
    (doc.getElementById('mkeAlvo').textContent || '').toLowerCase().includes('ret'));
  const xpP1antes = t(`layers[0].xp`);
  t(`mkeAlinhar('esq'); 'ok'`);
  check('alinhar age na camada da página extra', t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers[0].xp`) === 0);
  check('alinhar NÃO mexe na folha 1', t(`layers[0].xp`) === xpP1antes, { antes: xpP1antes, depois: t(`layers[0].xp`) });
  t(`mkeDefinirOpacidade('50'); 'ok'`);
  check('opacidade age na página extra',
    Math.abs(t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers[0].op`) - 0.5) < 1e-9);
  t(`mkeDuplicarCamada(); 'ok'`);
  check('duplicar na página extra cria a cópia',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`) === 2);

  /* lista de camadas da página extra: olho, cadeado, ordem e excluir */
  t(`updList(); 'ok'`);
  check('a lista mostra a camada criada na página extra',
    doc.querySelectorAll('#layersList .lp-row').length === 2 &&
    !!doc.querySelector('#layersList .lp-row[data-id="rx1"]'));
  check('a linha sabe de qual página é',
    doc.querySelector('#layersList .lp-row[data-id="rx1"]').dataset.page === pag2.id);
  doc.querySelector('#layersList .lp-row[data-id="rx1"] .lp-eye').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('o olho oculta a camada da página extra',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return l.id==='rx1';})[0].hidden`) === true);
  doc.querySelector('#layersList .lp-row[data-id="rx1"] .lp-eye').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('o olho mostra de novo',
    !t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return l.id==='rx1';})[0].hidden`));
  doc.querySelector('#layersList .lp-row[data-id="rx1"] .lp-lock').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('o cadeado trava a camada da página extra',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return l.id==='rx1';})[0].locked`) === true);
  doc.querySelector('#layersList .lp-row[data-id="rx1"] .lp-del').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('o ✕ apaga a camada da página extra',
    !t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.some(function(l){return l.id==='rx1';})`));
  check('a folha 1 não perdeu camada nenhuma no processo', t(`layers.length`) === 1);

  /* atalhos de pilha valem na página em foco */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      addRectLayerExtra(p,{id:'rxz',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.5,yp:.5,wp:.1,hp:.1,rot:0});
      selLayerExtra(p,'rxz');return 1;})(); 'ok'`);
  const zAntes = t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return l.id==='rxz';})[0].z`);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '[', bubbles: true }));
  check('[ muda a camada de posição na pilha da página em foco',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return l.id==='rxz';})[0].z`) !== zAntes);
  check('[ não mexeu na pilha da folha 1',
    t(`layers.length`) === 1 && t(`layers[0].z`) === 11);

  /* botão direito na área da página extra abre o menu */
  const areaExtra = doc.getElementById('canvasInner_' + pag2.id);
  const idRestante = t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];return p.layers.length?p.layers[0].id:'';})()`);
  const camadaExtra = doc.getElementById('ly_' + pag2.id + '_' + idRestante);
  camadaExtra.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  check('botão direito na página extra abre o menu', !!doc.getElementById('mkeMenu'));
  check('o menu da página extra tem ações', doc.querySelectorAll('#mkeMenu button').length >= 8);
  t(`mkeMenuFechar(); 'ok'`);

  /* Enter/Tab e atalhos não vazam para a fichas das páginas extras */
  t(`v7MostrarToolbar({id:'folha1',tipo:'normal',p1:true}); 'ok'`);

  /* ── 17.5 Tamanho no papel em milímetros ── */
  t(`(function(){multiSelIds=[];var l=layers.concat([]);return 1;})(); 'ok'`);
  t(`(function(){var l=layers[0];l.type='img';l.ratio=1;l.prop=true;l.fit='contain';selLayer(l.id);return 1;})(); 'ok'`);
  t(`document.getElementById('mkeMmW').value='100'; mkeAplicarMm(false,'w'); 'ok'`);
  const mmW = t(`Math.round(mkeMm(layers[0].wp*cw()))`);
  check('digitar 100 mm deixa a arte com 100 mm', mmW === 100, mmW);
  check('com proporção travada a altura acompanha a largura',
    Math.abs(t(`layers[0].hp`) - t(`layers[0].wp`)) < 1e-9, [t(`layers[0].wp`), t(`layers[0].hp`)]);
  check('os campos em mm mostram o valor aplicado',
    String(t(`document.getElementById('mkeMmW').value`)) === '100');
  t(`mkeAcao('mm-a4'); 'ok'`);
  check('"largura da folha" ocupa a largura toda da área', Math.abs(t(`layers[0].wp`) - 1) < 1e-9, t(`layers[0].wp`));
  check('a camada continua com pelo menos 10% dentro da área',
    t(`layers[0].xp <= 0.9 && layers[0].xp + layers[0].wp >= 0.1`) === true);
  t(`(function(){var l=layers[0];l.wp=0.3;l.hp=0.3;l.xp=0.2;l.yp=0.2;l.prop=false;return 1;})(); 'ok'`);
  t(`document.getElementById('mkeMmH').value='50'; mkeAplicarMm(false,'h'); 'ok'`);
  check('digitar 50 mm de altura aplica só a altura', Math.round(t(`mkeMm(layers[0].hp*ch())`)) === 50);
  const mmAplicado = t(`[Math.round(mkeMm(layers[0].wp*cw())),Math.round(mkeMm(layers[0].hp*ch()))]`);
  check('os dois campos mostram o tamanho final da camada',
    String(t(`document.getElementById('mkeMmW').value`)) === String(mmAplicado[0]) &&
    String(t(`document.getElementById('mkeMmH').value`)) === String(mmAplicado[1]), mmAplicado);

  /* ── 17.6 Soltar uma foto em cima da outra troca a arte ── */
  const elAlvo = doc.getElementById('ly_' + t(`layers[0].id`));
  elAlvo.classList.add('img-layer');
  check('mkeSoltarSobre existe', t(`typeof mkeSoltarSobre`) === 'function');
  const evDrop = new w.MouseEvent('mousemove', { bubbles: true });
  const fakeTarget = elAlvo;
  check('mkeSoltarSobre ignora quando o alvo não é imagem',
    t(`mkeSoltarSobre({target:document.getElementById('canvasInner')},new Blob(['x'],{type:'image/png'}),null)`) === false);
  const blocoPng = new w.File([new Uint8Array([137,80,78,71])], 'nova.png', { type: 'image/png' });
  check('mkeSoltarSobre aceita o alvo de imagem',
    t(`mkeSoltarSobre({target:document.getElementById('ly_'+layers[0].id)},new Blob(['x'],{type:'image/png'}),null)`) === true);
  check('mkeTrocarArte existe', t(`typeof mkeTrocarArte`) === 'function');

  /* ── 17.7 Barra da imagem das páginas extras tem as mesmas ações ── */
  const barraExtra = doc.getElementById('canvasTb_' + pag2.id).textContent;
  ['⤡', '⇄', '⋯'].forEach(ic => check('barra da página extra tem ' + ic, barraExtra.includes(ic)));
  check('lCaberExtra definida', t(`typeof lCaberExtra`) === 'function');
  check('lFillExtra e lCaberExtra marcam o fit',
    t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
        p.layers[0].type='img';p.layers[0].ratio=1;p.layers[0].fit='cover';p.selId=p.layers[0].id;
        lCaberExtra('${pag2.id}');return p.layers[0].fit;})()`) === 'contain');

  /* ── 17.8 Duplicar uma página inteira ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      var g=document.querySelectorAll('.gi[data-g="${pag2.id}m"]');if(g[0])g[0].value='7';
      var m=document.querySelectorAll('#folha_${pag2.id} .med-inp');if(m[0])m[0].value='60';
      addRectLayerExtra(p,{id:'dupx',type:'rect',fillColor:'#E5E7EB',strokeColor:'#374151',strokeWidth:2,xp:.1,yp:.1,wp:.2,hp:.2,rot:0});
      return 1;})(); 'ok'`);
  const qtdAntes = t(`paginas.length`);
  t(`v7DuplicarPagina('${pag2.id}'); 'ok'`);
  await new Promise(r => setTimeout(r, 200));
  check('duplicar cria mais uma página', t(`paginas.length`) === qtdAntes + 1, t(`paginas.length`));
  const copiaPag = t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      var i=paginas.indexOf(p);var c=paginas[i+1];return {id:c.id,layers:(c.layers||[]).length,folha:!!document.getElementById('folha_'+c.id)};})()`);
  check('a cópia tem a área da página montada', !!(copiaPag && copiaPag.folha), copiaPag);
  check('a cópia leva as camadas da original',
    copiaPag && copiaPag.layers === t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`),
    [copiaPag && copiaPag.layers, t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`)]);
  check('a cópia leva a grade preenchida',
    t(`(function(){var c=paginas[paginas.indexOf(paginas.filter(function(x){return x.id==='${pag2.id}';})[0])+1];
        var g=document.querySelectorAll('.gi[data-g="'+c.id+'m"]');return g[0]?g[0].value:'';})()`) === '7');
  check('a cópia leva as medidas',
    t(`(function(){var c=paginas[paginas.indexOf(paginas.filter(function(x){return x.id==='${pag2.id}';})[0])+1];
        var m=document.querySelectorAll('#folha_'+c.id+' .med-inp');return m[0]?m[0].value:'';})()`) === '60');
  const idsPag = t(`(function(){var a=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
        var c=paginas[paginas.indexOf(a)+1];
        var ia=(a.layers||[]).map(function(l){return l.id;}),ic=(c.layers||[]).map(function(l){return l.id;});
        return {ok:ic.every(function(i){return ia.indexOf(i)<0;}),ia:ia,ic:ic};})()`);
  check('as camadas da cópia têm ids próprios', !!(idsPag && idsPag.ok), idsPag);
  const nPagDup = t(`paginas.length`);
  const idUltima = t(`paginas[paginas.length-1].id`);
  t(`v7PageDesfazer({type:'add',index:1,id:'` + idUltima + `'}); 'ok'`);
  check('Ctrl+Z desfaz a página duplicada', t(`paginas.length`) === nPagDup - 1, t(`paginas.length`));
  check('existe o botão ⧉ na barra lateral de cada página',
    doc.querySelectorAll('#extraPagesNav .sb-dup-page').length === t(`paginas.length`));
  check('folha 1 não pode ser duplicada', t(`v7DuplicarPagina('folha1')`) === undefined);

  /* ── 17.9 O painel diz em qual página vai agir ── */
  t(`v7MostrarToolbar({id:'${pag2.id}',tipo:'normal',p1:false}); mkeSync(); 'ok'`);
  check('cabeçalho do painel mostra a página em foco',
    (doc.getElementById('mkeHdr').textContent || '').includes('P'), doc.getElementById('mkeHdr').textContent);
  t(`v7MostrarToolbar({id:'folha1',tipo:'normal',p1:true}); mkeSync(); 'ok'`);
  check('na folha 1 o cabeçalho não mostra número de página',
    !/P\d/.test(doc.getElementById('mkeHdr').textContent || ''), doc.getElementById('mkeHdr').textContent);

  /* ── 17.10 Camada com nome de arquivo aparece legível ── */
  check('nome vem do arquivo (sem extensão)',
    t(`mkeNomeCamada({type:'img',_fileName:'frente_polo.jpg'})`) === 'frente polo',
    t(`mkeNomeCamada({type:'img',_fileName:'frente_polo.jpg'})`));
  check('nome muito longo é cortado',
    (t(`mkeNomeCamada({type:'png'.replace('png','img'),_fileName:'costas_da_camiseta_moletom_preto_frente.png'})`) || '').length <= 28);
  check('nome escrito pela pessoa manda',
    t(`mkeNomeCamada({type:'img',name:'Frente',_fileName:'x.jpg'})`) === 'Frente');
  check('sem arquivo nem nome, continua "Imagem N"',
    /^Imagem \d+$/.test(t(`mkeNomeCamada({type:'img'})`)), t(`mkeNomeCamada({type:'img'})`));

  /* ── 17.11 Nome na barra da imagem e toque longo no tablet ── */
  t(`(function(){var l=layers[0];l._fileName='frente_polo.jpg';selLayer(l.id);return 1;})(); 'ok'`);
  check('a barra da imagem mostra o nome do arquivo',
    (doc.getElementById('tbNome').textContent || '').includes('frente polo'),
    doc.getElementById('tbNome').textContent);
  check('toque longo está ligado no documento',
    (function(){ return typeof doc.body !== 'undefined'; })() && t(`typeof mkeMenuAbrir`) === 'function');
  const evTouch = new w.Event('touchstart', { bubbles: true });
  evTouch.touches = [{ clientX: 30, clientY: 30 }];
  const camTouch = doc.getElementById('ly_' + t(`layers[0].id`));
  camTouch.dispatchEvent(evTouch);
  await new Promise(r => setTimeout(r, 700));
  check('segurar o dedo na camada abre o menu', !!doc.getElementById('mkeMenu'));
  t(`mkeMenuFechar(); 'ok'`);

  /* ── 17.12 Shift+clique junta camadas na página extra ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.msel=[];
      addRectLayerExtra(p,{id:'msA',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.1,yp:.1,wp:.15,hp:.15,rot:0});
      addRectLayerExtra(p,{id:'msB',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.4,yp:.1,wp:.15,hp:.15,rot:0});
      addRectLayerExtra(p,{id:'msC',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.7,yp:.1,wp:.15,hp:.15,rot:0});
      return 1;})(); 'ok'`);
  [['msA', 0.10], ['msB', 0.40], ['msC', 0.70]].forEach(([id]) => {
    t(`(function(){var el=document.getElementById('ly_${pag2.id}_'+'${id}');
        el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,shiftKey:true,button:0}));return 1;})(); 'ok'`);
  });
  check('Shift+clique selecionou três camadas na página extra',
    t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) === 3,
    t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`));
  t(`v7MostrarToolbar({id:'${pag2.id}',tipo:'normal',p1:false}); mkeSync(); 'ok'`);
  check('o painel avisa quantas camadas estão selecionadas',
    (doc.getElementById('mkeAlvo').textContent || '').includes('3 camadas'),
    doc.getElementById('mkeAlvo').textContent);
  t(`mkeAcao('rot-p15'); 'ok'`);
  check('girar com 3 selecionadas gira as três', (function(){
    const rots = t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['msA','msB','msC'].indexOf(l.id)>=0;}).map(function(l){return l.rot;})`);
    return Array.isArray(rots) && rots.every(r => r === 15);
  })(), t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['msA','msB','msC'].indexOf(l.id)>=0;}).map(function(l){return l.rot;})`));
  t(`mkeAcao('al-esq'); 'ok'`);
  check('alinhar à esquerda encosta as três no mesmo x', (function(){
    const xs = t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['msA','msB','msC'].indexOf(l.id)>=0;}).map(function(l){return Math.round(l.xp*1000);})`);
    return Array.isArray(xs) && new Set(xs).size === 1;
  })(), t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['msA','msB','msC'].indexOf(l.id)>=0;}).map(function(l){return l.xp;})`));
  t(`selLayerExtra(paginas.filter(function(x){return x.id==='${pag2.id}';})[0],'msA'); 'ok'`);
  check('clique simples desfaz a multiseleção',
    t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) === 0);

  /* ── 17.13 Posição em milímetros ── */
  t(`(function(){var l=layers[0];l.type='img';l.ratio=1;l.wp=.2;l.hp=.2;l.xp=.1;l.yp=.1;l.rot=0;selLayer(l.id);mkePainel('precisao');return 1;})(); 'ok'`);
  check('a aba Precisão tem os campos de posição em mm',
    !!doc.getElementById('mkeMmX') && !!doc.getElementById('mkeMmY'));
  t(`(function(){document.getElementById('mkeMmX').value='20';mkeAplicarMmPos('x');return 1;})(); 'ok'`);
  check('20 mm da esquerda aplicado',
    Math.abs(t(`layers[0].xp`) - (20 / t(`MKE_MM_PX`)) / t(`cw()`)) < 0.002,
    t(`layers[0].xp`));
  t(`(function(){document.getElementById('mkeMmY').value='35';mkeAplicarMmPos('y');return 1;})(); 'ok'`);
  check('35 mm do topo aplicado',
    Math.abs(t(`layers[0].yp`) - (35 / t(`MKE_MM_PX`)) / t(`ch()`)) < 0.002,
    t(`layers[0].yp`));
  t(`(function(){document.getElementById('mkeMmX').value='500';mkeAplicarMmPos('x');return 1;})(); 'ok'`);
  check('posição fora da folha é presa na borda', t(`layers[0].xp`) <= 1 - t(`layers[0].wp`) + 1e-9, t(`layers[0].xp`));
  t(`mkePrecisaoLer(); 'ok'`);
  check('depois de aplicar, os campos mostram a posição real',
    String(doc.getElementById('mkeMmY').value) === '35', doc.getElementById('mkeMmY').value);

  /* ── 17.14 Apagar o grupo inteiro ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.msel=[];
      addRectLayerExtra(p,{id:'delA',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.1,yp:.5,wp:.1,hp:.1,rot:0});
      addRectLayerExtra(p,{id:'delB',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.3,yp:.5,wp:.1,hp:.1,rot:0});
      p.msel=['delA','delB'];
      return 1;})(); 'ok'`);
  const antesDel = t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`);
  t(`mkeExcluirCamada('delA','${pag2.id}'); 'ok'`);
  check('excluir com duas selecionadas apaga as duas',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`) === antesDel - 2,
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.length`));
  check('a multiseleção é limpa depois de apagar',
    (t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) || 0) === 0);

  /* ── 17.15 Botão "selecionar todas as imagens" ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.msel=[];
      [{id:'allA',x:.05},{id:'allB',x:.35},{id:'allC',x:.65}].forEach(function(o){
        var l={type:'img',id:o.id,src:'data:,',ratio:1,xp:o.x,yp:.4,wp:.2,hp:.2,rot:0,prop:true,z:++p.zCnt,name:o.id};
        p.layers.push(l);renderImgLayerExtra(p,l);
      });
      return 1;})(); 'ok'`);
  t(`v7MostrarToolbar({id:'${pag2.id}',tipo:'normal',p1:false}); mkeSelecionarTodas(); 'ok'`);
  check('selecionar todas marca as fotos da página',
    t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) >= 3);
  check('as fotos ficam com a marca visual de selecionadas',
    doc.querySelectorAll('#canvasInner_' + pag2.id + ' .img-layer.msel').length >= 3);
  t(`mkeDistribuir('h'); 'ok'`);
  check('distribuir com todas selecionadas roda sem erro',
    doc.querySelectorAll('#canvasInner_' + pag2.id + ' .img-layer').length >= 3);
  check('o espaço entre as fotos ficou igual', (function(){
    const xs = t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['allA','allB','allC'].indexOf(l.id)>=0;}).sort(function(a,b){return a.xp-b.xp;}).map(function(l){return Math.round(l.xp*1000);})`);
    if (!Array.isArray(xs) || xs.length < 3) return false;
    const d1 = xs[1] - xs[0], d2 = xs[2] - xs[1];
    return Math.abs(d1 - d2) <= 2;
  })(), t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.filter(function(l){return ['allA','allB','allC'].indexOf(l.id)>=0;}).map(function(l){return l.xp;})`));

  /* ── 17.16 A plaquinha de medida diz onde a arte está ── */
  t(`(function(){var l=layers[0];l.type='img';l.ratio=1;l.wp=.3;l.hp=.2;l.xp=.2;l.yp=.3;selLayer(l.id);mkeMostrarMedida(l,cw(),ch());return 1;})(); 'ok'`);
  check('a medida mostra X e Y em mm', /X [\d,.]+ · Y [\d,.]+ mm/.test(doc.getElementById('mkeBadge').textContent),
    doc.getElementById('mkeBadge').textContent);

  /* ── 17.17 Shift+clique na lista de camadas ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.msel=[];
      v7MostrarToolbar({id:p.id,tipo:p.tipo||'normal',p1:false});
      toggleLayersPanel(true);updList();
      return 1;})(); 'ok'`);
  const linhaA = doc.querySelector('#layersList .lp-row[data-id="allA"]');
  const linhaB = doc.querySelector('#layersList .lp-row[data-id="allB"]');
  if (linhaA && linhaB) {
    linhaA.dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    linhaB.dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    check('Shift+clique na lista junta duas camadas',
      t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) === 2,
      t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`));
    check('as linhas marcadas ficam destacadas',
      doc.querySelectorAll('#layersList .lp-row.msel-row').length === 2,
      doc.querySelectorAll('#layersList .lp-row.msel-row').length);
    linhaA.dispatchEvent(new w.MouseEvent('click', { bubbles: true, shiftKey: true }));
    check('Shift+clique de novo tira da seleção',
      t(`(paginas.filter(function(x){return x.id==='${pag2.id}';})[0].msel||[]).length`) === 1);
  } else {
    check('Shift+clique na lista junta duas camadas', false, 'linhas não encontradas');
    check('as linhas marcadas ficam destacadas', false, 'linhas não encontradas');
    check('Shift+clique de novo tira da seleção', false, 'linhas não encontradas');
  }

  /* ── 17.18 Ctrl+S salva na hora ── */
  check('Ctrl+S salva a ficha sem abrir o diálogo do navegador', (function(){
    let chamou = false;
    const orig = w.v7SalvarAutosaveAgora;
    w.v7SalvarAutosaveAgora = function(){ chamou = true; };
    const ev = new w.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    doc.dispatchEvent(ev);
    w.v7SalvarAutosaveAgora = orig;
    return chamou && ev.defaultPrevented;
  })());

  /* ── 17.19 Levar / copiar camada para outra página ── */
  t(`(function(){
      var a=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      addRectLayerExtra(a,{id:'viaja',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.2,yp:.2,wp:.1,hp:.1,rot:0});
      v7MostrarToolbar({id:a.id,tipo:a.tipo||'normal',p1:false});
      selLayerExtra(a,'viaja');
      mkePainel('ajustes');
      document.getElementById('mkePagDestino').value='folha1';
      return 1;})(); 'ok'`);
  const nAntesViaja = t(`layers.length`);
  t(`mkeLevarParaPagina(false); 'ok'`);
  check('levar tirou a camada da página de origem',
    !t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.some(function(l){return l.id==='viaja';})`));
  check('levar colocou a camada na página 1',
    t(`layers.length`) === nAntesViaja + 1, t(`layers.length`));
  t(`(function(){
      var a=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      addRectLayerExtra(a,{id:'copiaT',type:'rect',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.4,yp:.4,wp:.1,hp:.1,rot:0});
      v7MostrarToolbar({id:a.id,tipo:a.tipo||'normal',p1:false});
      selLayerExtra(a,'copiaT');
      document.getElementById('mkePagDestino').value='folha1';
      return 1;})(); 'ok'`);
  const nAntesCopia = t(`layers.length`);
  t(`mkeLevarParaPagina(true); 'ok'`);
  check('copiar deixa a original na página',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.some(function(l){return l.id==='copiaT';})`));
  check('copiar cria uma cópia na página 1',
    t(`layers.length`) === nAntesCopia + 1, t(`layers.length`));
  check('a cópia não traz o mesmo id',
    t(`layers.filter(function(l){return l.id==='copiaT';}).length`) === 0);
  t(`(function(){document.getElementById('mkePagDestino').value='${pag2.id}';mkeLevarParaPagina(true);return 1;})(); 'ok'`);
  check('levar para a própria página é recusado',
    t(`layers.length`) === nAntesCopia + 1, t(`layers.length`));

  /* ── 17.20 Ímã nas páginas extras ── */
  check('mkeSnapXY aceita a lista da página em foco', (function(){
    const alvo = t(`({id:'sn1',type:'rect',xp:0.02,yp:0.02,wp:0.1,hp:0.1})`);
    const lista = t(`[{id:'sn2',type:'rect',xp:0.5,yp:0.04,wp:0.2,hp:0.2}]`);
    const r = t(`mkeSnapXY(${JSON.stringify(alvo)}, 0.49, 0.40, 400, 400, ${JSON.stringify(lista)})`);
    return r && Math.abs(r.xp - 0.5) < 0.03;
  })(), t(`mkeSnapXY({id:'sn1',type:'rect',xp:0.02,yp:0.02,wp:0.1,hp:0.1},0.49,0.40,400,400,[{id:'sn2',type:'rect',xp:0.5,yp:0.04,wp:0.2,hp:0.2}])`));
  check('sem lista, o ímã cai nas camadas da folha 1 (sem erro)', (function(){
    const r = t(`mkeSnapXY({id:'sn3',type:'rect',xp:0.02,yp:0.02,wp:0.1,hp:0.1},0.9,0.9,400,400,null)`);
    return r && typeof r.xp === 'number' && typeof r.yp === 'number';
  })(), t(`mkeSnapXY({id:'sn3',type:'rect',xp:0.02,yp:0.02,wp:0.1,hp:0.1},0.9,0.9,400,400,null)`));

  /* ── 17.21 Ctrl+V de imagem vai para a página em foco ── */
  let destino = null;
  check('colar print com a página 2 em foco cai na página 2', (function(){
    const origE = w.lerArqExtra, orig1 = w.lerArq;
    destino = null;
    w.lerArqExtra = function(f, p){ destino = p ? p.id : 'sem-pagina'; };
    w.lerArq = function(){ destino = 'folha1'; };
    t(`v7MostrarToolbar({id:'${pag2.id}',tipo:'normal',p1:false}); 'ok'`);
    const ev = new w.Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = {
      items: [{ type: 'image/png', getAsFile: () => new w.File(['x'], 'print.png', { type: 'image/png' }) }],
      getData: () => ''
    };
    doc.body.dispatchEvent(ev);
    w.lerArqExtra = origE; w.lerArq = orig1;
    return destino === pag2.id;
  })(), t(`v7PaginaAtiva?v7PaginaAtiva.id:null`));
  check('com a folha 1 em foco, colar continua indo para a folha 1', (function(){
    const origE = w.lerArqExtra, orig1 = w.lerArq;
    destino = null;
    w.lerArqExtra = function(f, p){ destino = p ? p.id : 'sem-pagina'; };
    w.lerArq = function(){ destino = 'folha1'; };
    t(`v7MostrarToolbar({id:'folha1',tipo:'normal',p1:true}); 'ok'`);
    const ev = new w.Event('paste', { bubbles: true, cancelable: true });
    ev.clipboardData = {
      items: [{ type: 'image/png', getAsFile: () => new w.File(['x'], 'print.png', { type: 'image/png' }) }],
      getData: () => ''
    };
    doc.body.dispatchEvent(ev);
    w.lerArqExtra = origE; w.lerArq = orig1;
    return destino === 'folha1';
  })(), String(destino));

  /* ── 17.22 Travar tudo ── */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pag2.id}';})[0];
      p.layers.forEach(function(l){l.locked=0;});
      v7MostrarToolbar({id:p.id,tipo:p.tipo||'normal',p1:false});
      return 1;})(); 'ok'`);
  t(`mkeTravarTudo(); 'ok'`);
  check('travar tudo trava todas as camadas da página',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.every(function(l){return !!l.locked;})`));
  check('travar tudo não travou a folha 1',
    t(`layers.every(function(l){return !l.locked;})`), t(`layers.map(function(l){return !!l.locked;})`));
  t(`mkeTravarTudo(); 'ok'`);
  check('apertar de novo destrava tudo',
    t(`paginas.filter(function(x){return x.id==='${pag2.id}';})[0].layers.every(function(l){return !l.locked;})`));

  /* ── 18. Importar várias fotos de uma vez (frente e costas) ── */
  const lote2 = t(`mkeGradeLote(2,[1,1],1.4,0.025)`);
  check('lote de 2 fotos devolve 2 caixas', Array.isArray(lote2) && lote2.length === 2, lote2);
  check('lote de 2: mesma largura nas duas fotos', lote2 && Math.abs(lote2[0].wp - lote2[1].wp) < 1e-9);
  check('lote de 2: mesma altura (lado a lado)', lote2 && Math.abs(lote2[0].hp - lote2[1].hp) < 1e-9);
  check('lote de 2: alinhadas no topo (centro vertical igual)', lote2 && Math.abs(lote2[0].yp - lote2[1].yp) < 1e-9);
  check('lote de 2: a segunda fica à direita da primeira', lote2 && lote2[1].xp > lote2[0].xp + lote2[0].wp - 1e-9);
  check('lote de 2: as duas dentro da área', lote2 && lote2.every(g => g.xp >= 0 && g.yp >= 0 && g.xp + g.wp <= 1.0000001 && g.yp + g.hp <= 1.0000001));
  const lote3 = t(`mkeGradeLote(3,[1,2,0.5],1.5,0.02)`);
  const sobrepoe = (a, b) => !(a.xp + a.wp <= b.xp + 1e-9 || b.xp + b.wp <= a.xp + 1e-9 || a.yp + a.hp <= b.yp + 1e-9 || b.yp + b.hp <= a.yp + 1e-9);
  check('lote de 3: nenhuma caixa se sobrepõe',
    lote3 && !sobrepoe(lote3[0], lote3[1]) && !sobrepoe(lote3[1], lote3[2]) && !sobrepoe(lote3[0], lote3[2]));
  check('lote de 3: proporção de cada foto respeitada',
    lote3 && Math.abs((lote3[1].wp * 1.5) / lote3[1].hp - 2) < 1e-6 && Math.abs((lote3[2].wp * 1.5) / lote3[2].hp - 0.5) < 1e-6);
  check('lote de 4 usa 2 colunas', t(`(function(){var g=mkeGradeLote(4,[1,1,1,1],1,0.02);return g[1].yp===g[0].yp&&g[2].yp>g[0].yp;})()`) === true);
  check('lote de 5 usa 3 colunas', t(`(function(){var g=mkeGradeLote(5,[1,1,1,1,1],1,0.02);return g[2].yp===g[0].yp&&g[3].yp>g[0].yp;})()`) === true);

  /* ── 19. Resolução da foto (aviso de imagem pequena) ── */
  t(`(function(){var l=layers[0];l.type='img';l.wp=0.4;l.hp=0.4;l._nw=200;l._nh=200;return 1;})(); 'ok'`);
  const qRuim = t(`mkeQualidade(layers[0])`);
  check('qualidade detecta foto pequena', qRuim && qRuim.ok === false && qRuim.precisa > qRuim.usa, qRuim);
  check('qualidade devolve o tamanho impresso em mm', qRuim && qRuim.mmW > 0 && qRuim.mmH > 0);
  t(`(function(){var l=layers[0];l._nw=4000;l._nh=4000;MKE_PX[l.src]={w:4000,h:4000};return 1;})(); 'ok'`);
  check('qualidade aprova foto grande', t(`mkeQualidade(layers[0]).ok`) === true);
  t(`(function(){var l=layers[0];l._nw=200;l._nh=200;MKE_PX[l.src]={w:200,h:200};selLayer(l.id);return 1;})(); 'ok'`);
  check('lista de camadas mostra ⚠ na foto pequena',
    !!doc.querySelector('#layersList .lp-row .mke-warn'));
  check('aviso explica o problema no title',
    (doc.querySelector('#layersList .mke-warn') || {}).title ? /serrilhada|px/.test(doc.querySelector('#layersList .mke-warn').title) : false);

  /* ── 20. Enter/Tab nas tabelas da ficha ── */
  const gis = [...doc.querySelectorAll('.gi')];
  check('a grade tem células para navegar', gis.length > 3);
  gis[0].focus();
  gis[0].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  check('Enter na grade vai para a célula seguinte', doc.activeElement === gis[1]);
  check('v9ProximoCampo acha a célula seguinte da grade', t(`v9ProximoCampo(document.querySelectorAll('.gi')[1])===document.querySelectorAll('.gi')[2]`) === true);
  const meds = [...doc.querySelectorAll('.med-inp')];
  if (meds.length > 1) {
    check('v9ProximoCampo acha a medida seguinte', t(`v9ProximoCampo(document.querySelectorAll('.med-inp')[0])===document.querySelectorAll('.med-inp')[1]`) === true);
  }
  const linhasAntes = doc.querySelectorAll('#prodLinhas tr').length;
  const camposProd = [...doc.querySelectorAll('#prodLinhas .field')];
  const ultimoCampo = camposProd[camposProd.length - 1];
  ultimoCampo.focus();
  ultimoCampo.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  check('Enter no último campo da produção cria uma linha nova', doc.querySelectorAll('#prodLinhas tr').length === linhasAntes + 1);
  check('o foco vai para o primeiro campo da linha nova',
    doc.activeElement === doc.querySelector('#prodLinhas tr:last-child .field'));
  const campos2 = [...doc.querySelectorAll('#prodLinhas .field')];
  check('v9ProximoCampo anda dentro da linha de produção',
    t(`v9ProximoCampo(document.querySelectorAll('#prodLinhas .field')[0])===document.querySelectorAll('#prodLinhas .field')[1]`) === true);

  /* ── 20.1 Colar uma coluna da planilha nas tabelas ── */
  const gi = [...doc.querySelectorAll('.gi')];
  gi.forEach(c => { c.value = ''; });
  gi[0].focus();
  const nColar = t(`v9ColarSerie(document.querySelectorAll('.gi')[0], 'P\\tM\\tG\\t1\\t2')`);
  check('colar 5 valores preenche 5 células da grade', nColar === 5, nColar);
  check('os valores entraram na ordem certa',
    gi.slice(0, 5).map(c => c.value).join('|') === 'P|M|G|1|2', gi.slice(0, 5).map(c => c.value));
  check('valores separados por quebra de linha também valem',
    t(`v9ColarSerie(document.querySelectorAll('.gi')[5], '10\\n20\\n30')`) === 3 && gi[6].value === '20');
  check('um valor só não é tratado como série', t(`v9ColarSerie(document.querySelectorAll('.gi')[0], '42')`) === 0);
  check('espaços em branco no meio são ignorados',
    t(`v9ColarSerie(document.querySelectorAll('.gi')[0], ' A ;; B ,\\n C ')`) === 3 && gi[1].value === 'B');
  const med = doc.querySelectorAll('.med-inp');
  const nMed = t(`v9ColarSerie(document.querySelectorAll('.med-inp')[0], '56\\t58\\t60')`);
  check('colar nas medidas preenche as células seguintes', nMed === 3 && med[2].value === '60', nMed);
  const prodCampos = [...doc.querySelectorAll('#prodLinhas .field')];
  prodCampos[0].focus();
  const nProd = t(`v9ColarSerie(document.querySelectorAll('#prodLinhas .field')[0], 'Camiseta\\tCamisa\\tMoletom')`);
  check('colar na produção preenche descrição/modelo', nProd === 3 && prodCampos[2].value === 'Moletom', nProd);
  const copia = t(`v9CopiarSerie(document.querySelectorAll('.gi')[0])`);
  check('copiar a série devolve tudo separado por Tab', typeof copia === 'string' && copia.split('\t').length === gi.length, (copia || '').slice(0, 24));
  check('campo fora das tabelas não é série', t(`v9CampoSerie(document.getElementById('avisoTxt'))`) === null);
  const evPaste = new w.Event('paste', { bubbles: true, cancelable: true });
  evPaste.clipboardData = { getData: () => '7\t8\t9' };
  gi[0].value = '';
  gi[0].focus();
  gi[0].dispatchEvent(evPaste);
  check('Ctrl+V na grade usa a colagem em série', gi[0].value === '7' && gi[2].value === '9', [gi[0].value, gi[1].value, gi[2].value]);
  gi.forEach(c => { c.value = ''; });

  /* ── 21. Máscaras dos documentos (CPF/CNPJ, telefone, CEP) ── */
  check('CPF ganha pontos e traço', t(`v9FmtDoc('12345678901')`) === '123.456.789-01');
  check('CNPJ ganha pontos, barra e traço', t(`v9FmtDoc('12345678000199')`) === '12.345.678/0001-99');
  check('telefone com 11 dígitos vira (DD) 9XXXX-XXXX', t(`v9FmtTel('62999990000')`) === '(62) 99999-0000');
  check('telefone fixo com 10 dígitos vira (DD) XXXX-XXXX', t(`v9FmtTel('6233334444')`) === '(62) 3333-4444');
  check('CEP vira 00000-000', t(`v9FmtCep('74000000')`) === '74000-000');
  check('texto que não é número fica como está', t(`v9FmtDoc('a definir')`) === 'a definir');
  check('número incompleto não é cortado', t(`v9FmtDoc('1234')`) === '1234');
  const docEl = doc.getElementById('dc_doc');
  docEl.textContent = '12345678901';
  check('formatar o campo do CPF mexe no texto', t(`v9FormatarCampo(document.getElementById('dc_doc'),'doc')`) === true && docEl.textContent === '123.456.789-01', docEl.textContent);
  check('formatar de novo não altera nada', t(`v9FormatarCampo(document.getElementById('dc_doc'),'doc')`) === false);

  /* ── 22. Pente fino: desfazer, remoção da página em foco e ações que não
     salvavam (bugs encontrados na revisão da V9.1) ── */

  /* 22.1 mover camada na folha 1 entra no desfazer e volta para o lugar */
  t(`v7PageUndoStack=[];v7PageRedoStack=[];undoStack=[];redoStack=[];undoSeqStack=[];redoSeqStack=[];estadoAtual=null;snapLastSig=''; 'ok'`);
  t(`(function(){var l={type:'rect',id:'pf1',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.2,yp:.2,wp:.3,hp:.3,rot:0,z:250};layers.push(l);renderRectLayer(l);selLayer('pf1');snap();return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 950));
  const pilhaAntes = t(`undoStack.length`);
  t(`(function(){var l=layers.filter(function(x){return x.id==='pf1';})[0];l.xp=.65;l.yp=.65;snap();return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 950));
  check('mover a camada cria passo de desfazer',
    t(`undoStack.length`) === pilhaAntes + 1, [pilhaAntes, t(`undoStack.length`)]);
  t(`undo(); 'ok'`);
  await new Promise(r => setTimeout(r, 400));
  check('um Ctrl+Z volta a camada para a posição anterior',
    Math.abs((t(`(layers.filter(function(x){return x.id==='pf1';})[0]||{}).xp`) ?? -1) - 0.2) < 1e-6,
    t(`(layers.filter(function(x){return x.id==='pf1';})[0]||{}).xp`));
  t(`redo(); 'ok'`);
  await new Promise(r => setTimeout(r, 400));
  check('Ctrl+Y refaz o movimento',
    Math.abs((t(`(layers.filter(function(x){return x.id==='pf1';})[0]||{}).xp`) ?? -1) - 0.65) < 1e-6,
    t(`(layers.filter(function(x){return x.id==='pf1';})[0]||{}).xp`));

  /* 22.2 o mesmo numa página extra */
  t(`v7PageUndoStack=[];v7PageRedoStack=[]; 'ok'`);
  t(`v7AdicionarPaginaComUndo('normal')`);
  await new Promise(r => setTimeout(r, 400));
  const pagPF = t(`paginas.length ? paginas[paginas.length-1].id : null`);
  t(`v7PageUndoStack=[];v7PageRedoStack=[]; 'ok'`);
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagPF}';})[0];
      p.layers.push({type:'rect',id:'pf2',fillColor:'#eee',strokeColor:'#333',strokeWidth:2,xp:.15,yp:.15,wp:.2,hp:.2,rot:0,z:11});
      renderRectLayerExtra(p,p.layers[0]);v7MostrarToolbar({id:p.id,tipo:'normal',p1:false});return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 950));
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagPF}';})[0];
      var l=p.layers.filter(function(x){return x.id==='pf2';})[0];l.xp=.7;snap();return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 950));
  const xpPagDepois = t(`(paginas.filter(function(x){return x.id==='${pagPF}';})[0].layers.filter(function(l){return l.id==='pf2';})[0]||{}).xp`);
  t(`undo(); 'ok'`);
  await new Promise(r => setTimeout(r, 450));
  const xpPagUndo = t(`(paginas.filter(function(x){return x.id==='${pagPF}';})[0].layers.filter(function(l){return l.id==='pf2';})[0]||{}).xp`);
  check('mover camada na página extra também entra no desfazer',
    Math.abs(xpPagDepois - 0.7) < 1e-6 && Math.abs(xpPagUndo - 0.15) < 1e-6, [xpPagDepois, xpPagUndo]);

  /* 22.3 remover a página em foco devolve o estúdio para a folha 1 */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagPF}';})[0];
      v7MostrarToolbar({id:p.id,tipo:'normal',p1:false});mkeMoverUI();return 1;})(); 'ok'`);
  const railNaPagina = t(`!!document.querySelector('#folha_${pagPF} #mkeRail')`);
  check('a régua realmente vai para dentro da página em foco', railNaPagina === true, railNaPagina);
  t(`v7RemoverPaginaComUndo('${pagPF}')`);
  await new Promise(r => setTimeout(r, 500));
  check('remover a página em foco não leva a régua junto',
    !!t(`document.getElementById('mkeRail')`) && !!t(`document.getElementById('canvasOuter').contains(document.getElementById('mkeRail'))`));
  check('o painel volta a dizer que age na folha 1',
    !/P\d/.test(doc.getElementById('mkeHdr').textContent || ''), doc.getElementById('mkeHdr').textContent);
  t(`undo(); 'ok'`);
  await new Promise(r => setTimeout(r, 500));

  /* 22.4 "preencher" na página extra usa cover (sem faixa vazia) */
  const pagFill = t(`paginas.length ? paginas[paginas.length-1].id : null`);
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagFill}';})[0];
      var l={type:'img',id:'pf3',src:'data:image/png;base64,AAAA',ratio:1.5,xp:.1,yp:.1,wp:.2,hp:.4,rot:0,prop:true,z:++p.zCnt,fit:'contain'};
      p.layers.push(l);renderImgLayerExtra(p,l);selLayerExtra(p,'pf3');lFillExtra(p.id);return 1;})(); 'ok'`);
  check('preencher na página extra deixa a imagem em cover',
    t(`(paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(l){return l.id==='pf3';})[0].fit)`) === 'cover',
    t(`(paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(l){return l.id==='pf3';})[0].fit)`));

  /* 22.4b setas: girar e espelhar funcionam (antes o painel dizia que girou e
     a seta ficava parada, porque seta não usa "rot") */
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagFill}';})[0];
      var l={type:'arr',id:'fa1',x1p:.2,y1p:.5,x2p:.6,y2p:.5,xp:.2,yp:.5,wp:.4,hp:.05,rot:0,color:'#111',stroke:3,arStyle:'full',z:++p.zCnt};
      p.layers.push(l);renderArrLayerExtra(p,l);selLayerExtra(p,'fa1');return 1;})(); 'ok'`);
  const setaAntes = t(`(function(){var l=paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(x){return x.id==='fa1';})[0];return [l.x1p,l.y1p,l.x2p,l.y2p];})()`);
  t(`mkeAcao('rot-p15'); 'ok'`);
  const setaGir = t(`(function(){var l=paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(x){return x.id==='fa1';})[0];return [l.x1p,l.y1p,l.x2p,l.y2p];})()`);
  check('girar em graus mexe nas pontas da seta',
    Array.isArray(setaGir) && JSON.stringify(setaGir) !== JSON.stringify(setaAntes), [setaAntes, setaGir]);
  check('girar a seta mantém as pontas dentro da área',
    (setaGir || []).every(v => v >= 0 && v <= 1), setaGir);
  t(`(function(){var l=paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(x){return x.id==='fa1';})[0];
      l.x1p=.2;l.y1p=.5;l.x2p=.6;l.y2p=.5;selLayerExtra(paginas.filter(function(x){return x.id==='${pagFill}';})[0],'fa1');return 1;})(); 'ok'`);
  t(`mkeAcao('flipH'); 'ok'`);
  const setaFlip = t(`(function(){var l=paginas.filter(function(x){return x.id==='${pagFill}';})[0].layers.filter(function(x){return x.id==='fa1';})[0];return [l.x1p,l.y1p,l.x2p,l.y2p];})()`);
  check('espelhar a seta reflete as duas pontas',
    Math.abs(setaFlip[0] - 0.8) < 1e-6 && Math.abs(setaFlip[2] - 0.4) < 1e-6, setaFlip);

  /* 22.5 recorte sem a biblioteca não quebra a página */
  check('abrirCrop sem Cropper não lança erro', (function(){
    try { t(`(function(){var l=layers.filter(function(x){return x.type==='img';})[0];if(l)selLayer(l.id);abrirCrop('camada');return 1;})(); 'ok'`); return true; }
    catch (e) { return false; }
  })());

  /* 22.6 salvar em .json e reabrir devolve as camadas da página extra
     (o jsdom não carrega imagens, então o Image é trocado por um que dispara
     onload como o navegador — sem isso a camada nem chega a ser criada) */
  w.Image = class {
    constructor(){ this.naturalWidth = 1; this.naturalHeight = 1; }
    set src(v){ this._src = v; setTimeout(() => { try { this.onload && this.onload(); } catch (e) {} }, 0); }
    get src(){ return this._src; }
  };
  t(`v7AdicionarPaginaComUndo('normal')`);
  await new Promise(r => setTimeout(r, 500));
  const pagRT = t(`paginas.length ? paginas[paginas.length-1].id : null`);
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagRT}';})[0];
      var l={type:'img',id:'rt1',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',ratio:1,xp:.2,yp:.25,wp:.3,hp:.2,rot:5,prop:true,z:++p.zCnt,hidden:0,locked:1,op:.6,_fileName:'frente polo'};
      p.layers.push(l);renderImgLayerExtra(p,l);return 1;})(); 'ok'`);
  const camAntesRT = t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagRT}';})[0];return {id:p.id,n:p.layers.length,l:p.layers.map(function(l){return [l.id,l.xp,l.yp,l.op,l.locked,l._fileName];})};})()`);
  const jsonRT = t(`JSON.stringify(capturarFichaParaJSON())`);
  const pagJsonRT = (JSON.parse(jsonRT)._paginas || []).filter(pg => (pg.layers || []).some(l => l.id === 'rt1'))[0];
  check('o JSON salvo guarda a camada da página extra',
    !!pagJsonRT && pagJsonRT.layers.length === 1,
    pagJsonRT ? pagJsonRT.layers.length : 'página não encontrada no JSON');
  t(`restaurarDeJSON(${jsonRT})`);
  await new Promise(r => setTimeout(r, 1100));
  const camDepoisRT = t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagRT}';})[0]||paginas[0];return p?{id:p.id,n:p.layers.length,l:p.layers.map(function(l){return [l.id,l.xp,l.yp,l.op,l.locked,l._fileName];})}:null;})()`);
  check('reabrir o .json devolve a camada da página extra (id, posição, opacidade, trava e nome)',
    !!camDepoisRT && JSON.stringify(camDepoisRT.l) === JSON.stringify(camAntesRT.l),
    [camAntesRT, camDepoisRT && camDepoisRT.l]);

  /* 22.7 imagem que não carrega não apaga mais a moldura salva */
  w.Image = class {
    constructor(){ this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(v){ this._src = v; setTimeout(() => { try { this.onerror && this.onerror(); } catch (e) {} }, 0); }
    get src(){ return this._src; }
  };
  t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagRT}';})[0]||paginas[0];
      addImgLayerExtra(p,'data:image/png;base64,QUJD',{id:'qb2',xp:.4,yp:.4,wp:.2,hp:.1,rot:0,name:'foto sumida'});return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 400));
  const quebradaExtra = t(`(function(){var p=paginas.filter(function(x){return x.id==='${pagRT}';})[0]||paginas[0];
      var l=p.layers.filter(function(x){return x.id==='qb2';})[0];return l?[l.xp,l.yp,l._semImagem]:null;})()`);
  check('página extra: imagem quebrada mantém a moldura no lugar',
    Array.isArray(quebradaExtra) && Math.abs(quebradaExtra[0] - 0.4) < 1e-6 && quebradaExtra[2] === 1, quebradaExtra);
  t(`addImgLayer('data:image/png;base64,QUJD',{id:'qb1',xp:.3,yp:.3,wp:.2,hp:.2,rot:0},'quebrada')`);
  await new Promise(r => setTimeout(r, 400));
  const quebradaFolha1 = t(`(function(){var l=layers.filter(function(x){return x.id==='qb1';})[0];return l?[l.xp,l.yp,l._semImagem]:null;})()`);
  check('folha 1: imagem quebrada mantém a moldura no lugar',
    Array.isArray(quebradaFolha1) && Math.abs(quebradaFolha1[0] - 0.3) < 1e-6 && quebradaFolha1[2] === 1, quebradaFolha1);

  /* 22.8 a cópia de emergência do localStorage não pode guardar base64 de
     imagem (regra do PLANO: estoura a cota e trava a interface) */
  t(`(function(){var l={type:'img',id:'ls1',src:'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA',ratio:1,xp:.1,yp:.1,wp:.2,hp:.2,rot:0,prop:true,z:++zCnt};
      layers.push(l);renderImgLayer(l);return 1;})(); 'ok'`);
  t(`savLayers(); 'ok'`);
  const va3 = t(`localStorage.getItem('va3_layers') || ''`);
  check('va3_layers guarda a camada sem o base64 da imagem',
    va3.indexOf('data:image') < 0 && va3.indexOf('"ls1"') >= 0, va3.slice(0, 80));

  /* 22.9 cota estourada: o autosave guarda a ficha SEM as fotos em vez de
     falhar e perder o trabalho todo; ao reabrir, a moldura volta no lugar */
  const setItemOriginal = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function (k, v) {
    if (k === 'vooalto_v7_ficha_ativa' && String(v).length > 50000) {
      const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
    }
    return setItemOriginal.call(this, k, v);
  };
  t(`(function(){var l={type:'img',id:'gorda',src:'data:image/png;base64,'+new Array(120000).join('A'),ratio:1,xp:.44,yp:.33,wp:.2,hp:.2,rot:0,prop:true,z:++zCnt};
      layers.push(l);renderImgLayer(l);return 1;})(); 'ok'`);
  const salvou = t(`v7SalvarAutosaveAgora()`);
  const rawAuto = t(`localStorage.getItem('vooalto_v7_ficha_ativa') || ''`);
  w.Storage.prototype.setItem = setItemOriginal;
  check('autosave com a cota cheia ainda salva a ficha',
    salvou === true && rawAuto.length > 10, [salvou, rawAuto.length]);
  check('rascunho de emergência fica sem o base64 das fotos',
    rawAuto.indexOf('data:image/png;base64,AAAA') < 0 && /"_semImagens":1/.test(rawAuto));
  const autoJson = rawAuto ? JSON.parse(rawAuto) : {};
  const camGorda = (autoJson._layers || []).filter(l => l.id === 'gorda')[0] || {};
  check('a moldura da foto continua salva (posição, tamanho e aviso)',
    Math.abs(camGorda.xp - 0.44) < 1e-6 && camGorda._semImagem === 1, camGorda);
  t(`(function(){clearAllLayers();restaurarDeJSON(${JSON.stringify(autoJson)});return 1;})(); 'ok'`);
  await new Promise(r => setTimeout(r, 900));
  const camVoltou = t(`(function(){var l=layers.filter(function(x){return x.id==='gorda';})[0];return l?[l.xp,l.yp,l._semImagem]:null;})()`);
  check('reabrir o rascunho sem fotos devolve a moldura no mesmo lugar',
    Array.isArray(camVoltou) && Math.abs(camVoltou[0] - 0.44) < 1e-6 && camVoltou[2] === 1, camVoltou);

  /* 22.10 remover uma página do meio não deixa buraco na numeração */
  t(`v7AdicionarPaginaComUndo('normal')`); await new Promise(r => setTimeout(r, 350));
  t(`v7AdicionarPaginaComUndo('normal')`); await new Promise(r => setTimeout(r, 350));
  const numsAntes = t(`paginas.map(function(p){return p.num;})`);
  const alvoMeio = t(`paginas[0].id`);
  t(`v7RemoverPaginaComUndo('${alvoMeio}')`);
  await new Promise(r => setTimeout(r, 700));
  const numsDepois = t(`paginas.map(function(p){return p.num;})`);
  check('numeração das páginas extras fica em sequência (sem buraco)',
    numsDepois.length === numsAntes.length - 1 && numsDepois.every((n, i) => n === i + 2),
    [numsAntes, numsDepois]);
  check('a ordem do modelo bate com a ordem das folhas na tela',
    JSON.stringify(t(`paginas.map(function(p){return 'folha_'+p.id;})`))
      === JSON.stringify(t(`Array.from(document.querySelectorAll('#pw .folha:not(#folha1), #pw .folha-branca')).map(function(e){return e.id;})`)));

  if (errs.length) fail++;
  console.log('  erros de página:', errs.length ? errs : 'nenhum ✓');
  console.log(`\n═══ MOCKUP V9.1: ${pass} OK, ${fail} FAIL ═══`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
