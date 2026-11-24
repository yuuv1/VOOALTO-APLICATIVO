'use strict';
/* ══════════════════════════════════════════════════════════════════════
   V10.12 — IMAGENS NA FOLHA DO ORÇAMENTO (arrastar e soltar)

   O pedido: "a gente joga a imagem la e onde ela ficar ela sai no pdf
   final (ou png)". Aqui provamos que:

     1. a imagem vira uma camada de verdade dentro da folha A4;
     2. a posição é POSICIONAL — o ponto onde o arquivo foi solto é o
        ponto onde a imagem nasce (e a folha é a referência, não a tela);
     3. a posição vira PORCENTAGEM da folha — assim sai igual no PNG
        (html2canvas) e no PDF (impressão A4), com a mesma proporção;
     4. várias imagens por folha, cada uma no seu lugar;
     5. mover, redimensionar (sem esticar) e remover;
     6. a UI de edição (botões/alça) NUNCA sai no PNG nem no PDF;
     7. a imagem sobrevive ao autosave, ao rascunho, ao .json e ao
        "orçamento novo" limpa tudo.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

let pass = 0, fail = 0;
const ok = (nome, cond, det) => {
  if (cond) { pass++; console.log('  [OK] ' + nome); }
  else { fail++; console.log('  [FAIL] ' + nome + (det !== undefined ? '  -> ' + JSON.stringify(det).slice(0, 200) : '')); }
};

const HTML = fs.readFileSync(BASE + '/criador_orcamento/index.html', 'utf-8');

/* PNG 1x1 transparente — dataURL de imagem de verdade */
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  console.log('===== ORÇAMENTO V10.12: IMAGENS NA FOLHA (ARRASTAR E SOLTAR) =====');

  const erros = [];
  const dom = new JSDOM(HTML, {
    url: 'http://localhost:4800/criador_orcamento/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => PNG_1x1;
      w.URL.createObjectURL = () => 'blob:test';
      w.addEventListener('error', e => erros.push(e.message));
    }
  });

  const w = dom.window;
  const doc = w.document;
  await new Promise(r => setTimeout(r, 1600));

  const t = expr => {
    try { return w.eval(expr); }
    catch(e) { fail++; console.log('  [ERR] ' + e.message); return undefined; }
  };

  /* ── 1. estrutura do recurso ───────────────────────────────────── */
  ok('bloco de estilo das imagens existe', !!doc.getElementById('v10-orc-imagens-css'));
  ok('bloco de script das imagens existe', !!doc.getElementById('v10-orc-imagens-js'));
  ok('API pública orcImg exposta', typeof w.orcImg === 'object');
  ok('botão "Imagem na folha" no painel', !!doc.querySelector('button[onclick*="orcImgEscolher"]'));
  ok('input de arquivo de imagem existe (#orcImgInput)', !!doc.getElementById('orcImgInput'));
  ok('input aceita várias imagens', (doc.getElementById('orcImgInput') || {}).multiple === true);

  /* ── 2. a folha ganha a camada de imagens ──────────────────────── */
  const camada = doc.querySelector('#printable-a4-page-1 .orc-img-layer');
  ok('camada de imagens existe dentro da folha A4', !!camada);
  ok('a camada está dentro da folha (position absolute)', camada && camada.parentElement && camada.parentElement.id === 'printable-a4-page-1');
  ok('a camada não é contenteditable', camada && camada.getAttribute('contenteditable') === null);

  /* ── 3. inserção: a imagem nasce ONDE foi pedida ───────────────── */
  const antes = t('documentPages[0].images.length');
  t(`orcImgAdicionar(1, ${JSON.stringify(PNG_1x1)}, 120, 300, 'foto.png', 800, 400); 'ok'`);
  const depois = t('documentPages[0].images.length');
  ok('imagem entra na lista da página', depois === antes + 1, { antes, depois });

  const img = t('documentPages[0].images[0]');
  ok('posição X guardada em px da folha', img && img.x === 120, img && img.x);
  ok('posição Y guardada em px da folha', img && img.y === 300, img && img.y);
  ok('largura guardada', img && img.w > 0, img && img.w);
  ok('altura guardada', img && img.h > 0, img && img.h);
  ok('a proporção natural foi mantida (800x400)', img && Math.abs((img.w / img.h) - 2) < 0.06, img && (img.w / img.h));

  /* a posição vira porcentagem da folha -> mesma no PNG e no PDF */
  const el = doc.querySelector('#printable-a4-page-1 .orc-img');
  ok('a imagem aparece desenhada na folha', !!el);
  ok('left em % da folha', el && el.style.left === (120 / 794 * 100) + '%', el && el.style.left);
  ok('top em % da folha', el && el.style.top === (300 / 1120 * 100) + '%', el && el.style.top);
  ok('width em % da folha', el && /^[\d.]+%$/.test(el.style.width), el && el.style.width);
  ok('height em % da folha', el && /^[\d.]+%$/.test(el.style.height), el && el.style.height);
  ok('a imagem tem um <img> dentro', !!(el && el.querySelector('img')));
  ok('o <img> não é arrastável (não atrapalha o drop)', !!(el && el.querySelector('img').getAttribute('draggable') === 'false'));
  ok('a imagem recién inserida fica selecionada', el && el.classList.contains('sel'));

  /* ── 4. converter ponto da tela -> ponto da folha ───────────────── */
  const folha = doc.getElementById('printable-a4-page-1');
  folha.getBoundingClientRect = () => ({ left: 100, top: 50, width: 794, height: 1120, right: 894, bottom: 1170, x: 100, y: 50 });
  const p1 = t(`orcImgPonto(document.getElementById('printable-a4-page-1'), 100, 50)`);
  ok('canto superior esquerdo da folha -> (0,0)', p1 && p1.x === 0 && p1.y === 0, p1);
  const p2 = t(`orcImgPonto(document.getElementById('printable-a4-page-1'), 497, 610)`);
  ok('metade da folha -> (397, 560)', p2 && Math.abs(p2.x - 397) < 0.01 && Math.abs(p2.y - 560) < 0.01, p2);

  /* com zoom da folha (CSS zoom) a conversão continua correta */
  folha.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1588, height: 2240, right: 1688, bottom: 2290, x: 100, y: 50 });
  const p3 = t(`orcImgPonto(document.getElementById('printable-a4-page-1'), 894, 1170)`);
  ok('com zoom 200% o ponto continua sendo o mesmo da folha', p3 && Math.abs(p3.x - 397) < 0.01 && Math.abs(p3.y - 560) < 0.01, p3);
  folha.getBoundingClientRect = () => ({ left: 100, top: 50, width: 794, height: 1120, right: 894, bottom: 1170, x: 100, y: 50 });

  /* ── 5. várias imagens por folha ───────────────────────────────── */
  t(`orcImgAdicionar(1, ${JSON.stringify(PNG_1x1)}, 400, 700, 'logo.png', 300, 300); 'ok'`);
  ok('duas imagens na mesma folha', t('documentPages[0].images.length') === 2);
  ok('cada imagem tem posição própria', t('documentPages[0].images[1].x') === 400 && t('documentPages[0].images[1].y') === 700);
  ok('as duas imagens estão desenhadas na folha', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length === 2);

  /* imagens de outra página NÃO aparecem na primeira */
  t(`addDocumentPage(); 'ok'`);
  t(`orcImgAdicionar(2, ${JSON.stringify(PNG_1x1)}, 50, 50, 'p2.png', 200, 200); 'ok'`);
  ok('a página 2 tem a sua própria imagem', t('documentPages[1].images.length') === 1);
  ok('a página 2 não repete as imagens da página 1', t('documentPages[1].images.length') === 1 && t('documentPages[0].images.length') === 2);
  ok('folha 2 desenhada com 1 imagem', doc.querySelectorAll('#printable-a4-page-2 .orc-img').length === 1);

  /* ── 6. mover e redimensionar ───────────────────────────────────── */
  const idImg = t('documentPages[0].images[0].id');
  const el0 = doc.querySelector('#printable-a4-page-1 .orc-img[data-img-id="' + idImg + '"]');
  ok('a imagem da página 1 continua desenhada', !!el0);

  /* simula arrastar: pointerdown na imagem + pointermove + pointerup
     (jsdom não tem PointerEvent — o MouseEvent carrega o que importa) */
  function arrasta(el, x0, y0, x1, y1, alvoHandle) {
    const alvo = alvoHandle ? el.querySelector('.orc-img-handle') : el;
    const ev = (tipo, x, y) => {
      const e = new w.MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      e.pointerId = 1;
      return e;
    };
    alvo.dispatchEvent(ev('pointerdown', x0, y0));
    doc.dispatchEvent(ev('pointermove', x1, y1));
    doc.dispatchEvent(ev('pointerup', x1, y1));
  }
  arrasta(el0, 100, 50, 300, 150, false);
  const movida = t('documentPages[0].images[0]');
  ok('arrastar move a imagem (nova posição X)', movida && movida.x === 320, movida && movida.x);
  ok('arrastar move a imagem (nova posição Y)', movida && movida.y === 400, movida && movida.y);
  ok('a largura não muda ao mover', movida && movida.w === img.w, movida && movida.w);
  ok('o desenho reflete a nova posição', (doc.querySelector('#printable-a4-page-1 .orc-img[data-img-id="' + idImg + '"]') || { style: {} }).style.left === (320 / 794 * 100) + '%');

  /* redimensionar pela alça: mantém a proporção */
  const el1 = doc.querySelector('#printable-a4-page-1 .orc-img[data-img-id="' + idImg + '"]');
  const wAntes = t('documentPages[0].images[0].w');
  const hAntes = t('documentPages[0].images[0].h');
  arrasta(el1, 100, 50, 300, 150, true);
  const redim = t('documentPages[0].images[0]');
  ok('redimensionar aumenta a largura', redim && redim.w > wAntes, { antes: wAntes, depois: redim && redim.w });
  ok('redimensionar mantém a proporção (não estica)', redim && Math.abs((redim.w / redim.h) - (wAntes / hAntes)) < 0.05, redim && (redim.w / redim.h));

  /* ── 7. remover ────────────────────────────────────────────────── */
  const id2 = t('documentPages[0].images[1].id');
  const el2 = doc.querySelector('#printable-a4-page-1 .orc-img[data-img-id="' + id2 + '"]');
  const btnDel = el2.querySelector('.orc-img-del');
  ok('a imagem tem botão de remover', !!btnDel);
  btnDel.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  ok('remover tira a imagem do estado', t('documentPages[0].images.length') === 1);
  ok('remover tira a imagem do desenho', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length === 1);

  /* ── 8. a UI de edição NÃO sai no arquivo final ────────────────── */
  const css = doc.getElementById('v10-orc-imagens-css').textContent;
  ok('CSS esconde a UI das imagens na impressão', /@media print[\s\S]*\.orc-img-ui\{display:none!important\}/.test(css));
  ok('export PNG esconde a UI das imagens', doc.documentElement.innerHTML.includes("'.orc-img-ui'"));
  ok('o contorno de seleção some ao exportar', /body\.orc-exportando \.orc-img\{[^}]*outline:none!important/.test(css));
  ok('a camada de imagens não usa pointer-events:none no img (a imagem é clicável)', /\.orc-img\{[^}]*pointer-events:auto/.test(css));
  ok('os botões ficam sem clique quando a imagem não está selecionada', /\.orc-img-ui \.orc-img-btn,\.orc-img-ui \.orc-img-handle\{pointer-events:none\}/.test(css));
  ok('os botões ficam clicáveis com a imagem selecionada', /\.orc-img\.sel \.orc-img-ui \.orc-img-btn[^}]*pointer-events:auto/.test(css));
  ok('a folha continua com overflow hidden (nada invade a página vizinha)', /\.page\s*\{[\s\S]{0,2500}?overflow:\s*hidden/.test(HTML));

  /* ── 9. persistência: autosave, rascunho e .json ───────────────── */
  const estado = t('orcCollectState()');
  ok('o estado guardado tem as imagens da página', estado && estado.pages[0] && Array.isArray(estado.pages[0].images) && estado.pages[0].images.length === 1);
  ok('a imagem guardada tem a posição', estado && estado.pages[0].images[0] && typeof estado.pages[0].images[0].x === 'number' && typeof estado.pages[0].images[0].y === 'number');
  ok('a imagem guardada tem o src (dataURL)', estado && estado.pages[0].images[0] && String(estado.pages[0].images[0].src).indexOf('data:image/') === 0);

  t(`saveOrcautosaveNow(); 'ok'`);
  const bruto = t(`localStorage.getItem('vooalto_orcamento_autosave_v7')`);
  ok('o autosave guardou as imagens', bruto && String(bruto).indexOf('data:image/') !== -1);
  ok('o autosave guardou a posição da imagem', bruto && /"x":\d+/.test(String(bruto)));

  /* restaura do zero (como se fosse outro navegador) */
  const antes2 = t('documentPages[0].images.length');
  t(`orcRestoreState(JSON.parse(localStorage.getItem('vooalto_orcamento_autosave_v7'))); 'ok'`);
  ok('restaurar do autosave devolve as imagens', t('documentPages[0].images.length') === antes2, { antes: antes2, depois: t('documentPages[0].images.length') });
  ok('restaurar do autosave devolve a posição', t('documentPages[0].images[0].x') === movida.x && t('documentPages[0].images[0].y') === movida.y);
  ok('restaurar redesenha a imagem na folha', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length >= 1);

  /* rascunho */
  w.prompt = () => 'Rascunho com imagem';
  await t(`salvarRascunhoOrcamento()`) ;
  await new Promise(r => setTimeout(r, 300));
  const rascunhos = t('orcGetDrafts()');
  ok('o rascunho guarda as imagens', rascunhos && rascunhos.length >= 1 && rascunhos[0].state.pages[0].images.length >= 1);

  /* .json (exportar/importar usam o mesmo estado) */
  const json = JSON.stringify(t('orcCollectState()'));
  ok('o .json carrega a imagem', json.indexOf('data:image/') !== -1);

  /* ── 10. segurança: estado malformado não quebra ───────────────── */
  const saneado = t(`orcImgSanear([{id:'x',src:'http://exemplo.com/a.png',x:10,y:10,w:100,h:100},{src:'data:image/png;base64,AA',x:'abc',y:null,w:0,h:-5},null])`);
  ok('imagem que não é dataURL é descartada', saneado.length === 1, saneado.length);
  ok('posição inválida vira número', saneado[0] && typeof saneado[0].x === 'number' && saneado[0].x >= 0, saneado[0]);
  ok('tamanho inválido vira tamanho útil', saneado[0] && saneado[0].w > 0 && saneado[0].h > 0, saneado[0]);

  /* ── 11. "Novo orçamento" limpa as imagens ─────────────────────── */
  w.confirm = () => true;
  t(`novoOrcamento(); 'ok'`);
  ok('orçamento novo começa sem imagens', t('documentPages[0].images.length') === 0);
  ok('orçamento novo deixa a folha sem camadas com imagem', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length === 0);

  /* ── 12. duplicar página leva as imagens junto ─────────────────── */
  t(`orcImgAdicionar(1, ${JSON.stringify(PNG_1x1)}, 100, 100, 'a.png', 400, 400); 'ok'`);
  t(`duplicateDocumentPage(0); 'ok'`);
  ok('a página duplicada leva as imagens', t('documentPages[1].images.length') === 1);
  ok('a cópia tem id próprio (dá para mexer nas duas)', t('documentPages[1].images[0].id') !== t('documentPages[0].images[0].id'));
  ok('as duas páginas mostram 1 imagem cada', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length === 1 && doc.querySelectorAll('#printable-a4-page-2 .orc-img').length === 1);

  ok('nenhum erro de script durante o teste', erros.length === 0, erros.slice(0, 3));

  /* ══ 13. O DROP DE VERDADE: soltar o arquivo cria a imagem no ponto ══ */
  /* (faz o drop de verdade na folha, com dataTransfer de arquivo) */
  const w2 = dom.window;
  w2.VooaltoImagem = { otimizarArquivo: () => Promise.resolve(PNG_1x1) };
  /* Image falsa que "decodifica" — o jsdom não carrega imagens de verdade */
  w2.Image = class {
    set src(v) { this._src = v; setTimeout(() => { this.naturalWidth = 800; this.naturalHeight = 400; if (this.onload) this.onload(); }, 0); }
    get src() { return this._src; }
  };

  const folha2 = doc.getElementById('printable-a4-page-1');
  folha2.getBoundingClientRect = () => ({ left: 100, top: 50, width: 794, height: 1120, right: 894, bottom: 1170, x: 100, y: 50 });
  const antesDrop = t('documentPages[0].images.length');
  const arquivo = new w2.File(['conteudo'], 'uniforme.png', { type: 'image/png' });
  const dt = { types: ['Files'], files: [arquivo], dropEffect: '' };
  const evDrop = new w2.MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 100 + 200, clientY: 50 + 400 });
  evDrop.dataTransfer = dt;
  folha2.dispatchEvent(evDrop);
  await new Promise(r => setTimeout(r, 250));

  ok('soltar o arquivo cria a imagem', t('documentPages[0].images.length') === antesDrop + 1, { antes: antesDrop, depois: t('documentPages[0].images.length') });
  const solta = t('documentPages[0].images[documentPages[0].images.length-1]');
  ok('a imagem nasce no ponto solto (X = 200 da folha)', solta && solta.x === 200, solta && solta.x);
  ok('a imagem nasce no ponto solto (Y = 400 da folha)', solta && solta.y === 400, solta && solta.y);
  ok('o nome do arquivo foi guardado', solta && solta.nome === 'uniforme.png', solta && solta.nome);
  ok('o drop não deixou a página com o contorno de "soltar aqui"', !folha2.classList.contains('orc-drop-ativo'));

  /* soltar o arquivo FORA da folha não pode abrir o arquivo no navegador */
  const evFora = new w2.MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
  evFora.dataTransfer = { types: ['Files'], files: [arquivo] };
  doc.body.dispatchEvent(evFora);
  ok('soltar fora da folha é impedido (o app não abre o arquivo)', evFora.defaultPrevented === true);

  /* ══ 14. A matemática do PDF: a % volta a px na folha impressa ══ */
  const elSolta = doc.querySelector('#printable-a4-page-1 .orc-img[data-img-id="' + solta.id + '"]');
  const pct = elSolta && {
    left: parseFloat(elSolta.style.left),
    top: parseFloat(elSolta.style.top),
    w: parseFloat(elSolta.style.width),
    h: parseFloat(elSolta.style.height)
  };
  ok('posição em % calculada', !!pct && isFinite(pct.left) && isFinite(pct.top));
  /* tela: 794 x 1120 */
  const pxTela = pct && { x: pct.left / 100 * 794, y: pct.top / 100 * 1120, w: pct.w / 100 * 794, h: pct.h / 100 * 1120 };
  ok('na TELA volta ao pixel exato', pxTela && Math.abs(pxTela.x - solta.x) < 0.01 && Math.abs(pxTela.y - solta.y) < 0.01, pxTela);
  /* impressão A4 sem margens: 793,7 x 1120 (o @page do app é margin:0) */
  const pxPapel = pct && { x: pct.left / 100 * 793.7, y: pct.top / 100 * 1120, w: pct.w / 100 * 793.7, h: pct.h / 100 * 1120 };
  ok('no PAPEL (A4 sem margens) a posição é a mesma (diferença < 0,5px)', pxPapel && Math.abs(pxPapel.x - solta.x) < 0.5 && Math.abs(pxPapel.y - solta.y) < 0.5, pxPapel);
  ok('no PAPEL a largura também é a mesma (diferença < 0,5px)', pxPapel && Math.abs(pxPapel.w - solta.w) < 0.5, pxPapel);
  ok('no PAPEL a altura é exatamente a mesma', pxPapel && Math.abs(pxPapel.h - solta.h) < 0.01, pxPapel);
  ok('a proporção é a mesma na tela e no papel', pxTela && pxPapel && Math.abs((pxTela.w / pxTela.h) - (pxPapel.w / pxPapel.h)) < 0.01);

  /* ══ 15. A imagem está DENTRO da folha — é o que faz ela sair no PNG ══ */
  const dentro = doc.querySelectorAll('#printable-a4-page-1 .orc-img').length;
  ok('toda imagem desenhada está dentro da folha 1', dentro === t('documentPages[0].images.length'), { desenhadas: dentro, estado: t('documentPages[0].images.length') });
  ok('a camada de imagens é filha da folha (o html2canvas leva junto)', camada && camada.parentElement.id === 'printable-a4-page-1');

  /* ══ 16. Folha RECRIADA com imagens no estado = folha vazia? ══ */
  /* (a folha é apagada do DOM e recriada — a camada nova precisa ser
     desenhada de novo, senão a imagem some da tela mas continua no estado) */
  t(`orcImgAdicionar(1, ${JSON.stringify(PNG_1x1)}, 60, 60, 'z.png', 300, 300); 'ok'`);
  const totalAntes = t('documentPages[0].images.length');
  const folhaRec = doc.getElementById('printable-a4-page-1');
  const camadaRec = folhaRec.querySelector('.orc-img-layer');
  folhaRec.removeChild(camadaRec);          /* simula a folha recriada */
  t(`syncDocumentPagesDOM(); 'ok'`);
  ok('folha recriada: a camada voltou', !!doc.querySelector('#printable-a4-page-1 .orc-img-layer'));
  ok('folha recriada: as imagens voltaram a ser desenhadas', doc.querySelectorAll('#printable-a4-page-1 .orc-img').length === totalAntes, { desenhadas: doc.querySelectorAll('#printable-a4-page-1 .orc-img').length, estado: totalAntes });

  /* ══ 17. Esc solta a seleção da imagem (sem apagar) ══ */
  t(`orcImgSelecionar({pageId:1, id: documentPages[0].images[0].id}); 'ok'`);
  ok('a imagem fica selecionada', t('!!orcImgSel'));
  doc.dispatchEvent(new w2.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  ok('Esc solta a seleção', t('!orcImgSel'));
  ok('Esc não apaga a imagem', t('documentPages[0].images.length') === totalAntes);

  console.log('\n===== IMAGENS NO ORÇAMENTO V10.12: ' + pass + ' OK, ' + fail + ' FAIL =====');
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1); });
