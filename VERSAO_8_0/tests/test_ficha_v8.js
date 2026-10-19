'use strict';
/* V8 — Ficha Técnica: carregamento sem erro, autosave descarregado no pagehide,
   dependências locais, e as funções da barra lateral (que na V8 passam por
   "Minhas fichas" em vez de "Enviar para Catalogação"). */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const { BASE } = require('./_base');

/* A chave do autosave NÃO mudou de nome na V8: manter 'vooalto_v7_ficha_ativa'
   é o que faz a ficha em andamento da V7 continuar abrindo. */
const AUTOSAVE_KEY = 'vooalto_v7_ficha_ativa';

(async () => {
  const oc = fs.readFileSync(BASE + '/criador_ficha_tecnica/index.html', 'utf-8');
  const oerr = [];
  const od = new JSDOM(oc, { url: 'http://localhost:4800/criador_ficha_tecnica/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.print = () => {};
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.HTMLCanvasElement.prototype.getContext = function(){ return new Proxy({}, { get:(t,p)=> (p==='canvas'?this:()=>{}), set:()=>true }); };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
      w.addEventListener('error', e => oerr.push(e.message));
    }
  });
  const ow = od.window;
  await new Promise(r => setTimeout(r, 1600));
  let fail = 0;
  const t = (label, expr) => {
    try {
      const r = ow.eval(expr), ok = r !== undefined && r !== null && r !== false;
      console.log(ok ? '  [OK]' : '  [FAIL]', label, r !== undefined ? '-> ' + JSON.stringify(r).slice(0,90) : '');
      if (!ok) fail++;
      return r;
    } catch(e) { fail++; console.log('  [ERR]', label, ':', e.message); return undefined; }
  };
  console.log('===== FICHA V8 =====');

  ow.document.getElementById('dc_nome').textContent = 'Teste autosave fechamento';
  t('pagehide descarrega autosave imediatamente',
    `v7Autosave(); window.dispatchEvent(new Event('pagehide')); localStorage.getItem(${JSON.stringify(AUTOSAVE_KEY)})`);
  const savedFicha = JSON.parse(ow.localStorage.getItem(AUTOSAVE_KEY) || 'null');
  const autosaveOk = !!savedFicha && savedFicha.dc_nome === 'Teste autosave fechamento';
  console.log(autosaveOk ? '  [OK]' : '  [FAIL]', 'autosave guardou o cliente digitado');
  if (!autosaveOk) fail++;

  t('cloudflare removido', `!document.querySelector('script[src*="cloudflare"]')`);
  t('cropper local', `!!document.querySelector('script[src*="assets/cropper"]')`);
  t('html2canvas local', `!!document.querySelector('script[src*="assets/html2canvas"]')`);
  t('pdf.js não é mais carregado (saiu com a Catalogação)', `!document.querySelector('script[src*="pdf"]')`);

  /* ── Barra lateral / ações da V8 ── */
  t('novaFicha definida', `typeof novaFicha`);
  t('v8NovaFicha definida', `typeof v8NovaFicha`);
  t('v8SalvarFicha definida', `typeof v8SalvarFicha`);
  t('abrirPreenchimentoRapido', `abrirPreenchimentoRapido(); !!document.getElementById('v4QuickModal')`);
  t('rascunho: atalho antigo continua existindo', `typeof v4SalvarRascunho`);
  t('lista Minhas fichas no lugar de Rascunhos+Recentes', `!!document.getElementById('v8FichasList') && !document.getElementById('v4DraftList') && !document.getElementById('fichasRecentesList')`);
  t('sidebar: 4 seções com descrição', `document.querySelectorAll('.sb-section-desc').length >= 4`);
  t('sidebar: botão primário nova ficha', `!!document.querySelector('.sb-btn-primary')`);
  t('sidebar: botão accent rápido', `!!document.querySelector('.sb-btn-accent')`);
  t('chip prontidão existe', `!!document.getElementById('fichaReadiness')`);
  t('CTA flutuante existe', `!!document.getElementById('fichaFloatCta')`);
  t('ficha tem conteúdo quando o cliente está preenchido', `v8FichaTemConteudo()`);
  t('ficha vazia não tem conteúdo', `(function(){document.getElementById('dc_nome').textContent='';layers.length=0;return !v8FichaTemConteudo()})()`);

  /* v8FichaAtualId é escrito por restaurarDeJSON/limparParaNovaFicha, que ficam
     em blocos ANTERIORES ao módulo Minhas fichas. Com `let` isso seria zona
     morta temporal (ReferenceError) se alguma delas rodasse durante a carga. */
  const declaracao = oc.indexOf('var v8FichaAtualId');
  const primeiroUso = oc.search(/\n\s*v8FichaAtualId\s*=/);
  t('v8FichaAtualId declarado com var antes do primeiro uso',
    declaracao > -1 && primeiroUso > declaracao, { declaracao, primeiroUso });

  /* ── O que a V8 removeu: nenhum caminho para a Catalogação ── */
  t('enviarParaCatalogacao não existe mais', `typeof enviarParaCatalogacao === 'undefined'`);
  t('sem listener de edição vinda do catálogo', `!${JSON.stringify(oc)}.includes('vooalto-ficha-edit')`);
  t('pool de clientes não lê mais o catálogo', `!${JSON.stringify(oc)}.includes('vooalto_main_catalog_v2')`);
  t('sugestões de clientes seguem funcionando com o que o módulo lembra',
    `localStorage.setItem('vooalto_ficha_clientes_v7', JSON.stringify({'Escola X':'111'})); document.getElementById('dc_nome').textContent='Esco'; fichaShowSuggestions(); document.getElementById('fichaSugBox').style.display==='block'`);

  /* ═══ BUG V7 — "Nova ficha" só limpava a página 1 ═══════════════════
     limparParaNovaFicha chamava fecharPaginaExtra(), que nunca existiu em
     versão nenhuma. A guarda `typeof === 'function'` era sempre falsa e as
     páginas 2, 3… ficavam com o cliente/modelos da ficha anterior. */
  ow.eval("document.getElementById('dc_nome').textContent='CLIENTE ANTIGO'");
  ow.eval("v7AdicionarPaginaComUndo('normal')");
  ow.eval("v7AdicionarPaginaComUndo('branca')");
  const antes = ow.eval("[paginas.length, document.querySelectorAll('#pw .folha').length, document.querySelectorAll('#pw .folha-branca').length]");
  console.log('  [info] antes de limpar: paginas/folhas/brancas =', JSON.stringify(antes));
  t('página extra conta como conteúdo (não pode ser descartada sem oferecer salvar)', `v8FichaTemConteudo()`);
  ow.eval('limparParaNovaFicha(7)');
  const depois = ow.eval("[paginas.length, totalPaginas, document.querySelectorAll('#pw .folha').length, document.querySelectorAll('#pw .folha-branca').length, document.querySelectorAll('#extraPagesNav .sb-page-group').length]");
  t('nova ficha apaga TODAS as páginas extras (array, contador, DOM e menu)',
    JSON.stringify(depois) === JSON.stringify([0,1,1,0,0]), { depois });
  t('nova ficha não deixa label nem input de página órfão',
    `document.querySelectorAll('#pw .page-label').length === 1 && document.querySelectorAll('input[id^="canvasInput_"]').length === 0`);

  /* ═══ BUG V7 — Preenchimento rápido com metade dos campos ═══════════ */
  ow.eval('abrirPreenchimentoRapido()');
  const ids = ['v4qCliente','v4qDoc','v4qTel','v4qVendedor','v4qEnd','v4qCidade','v4qCep','v4qData','v4qTecido','v4qPrevisao','v4qNum','v4qEntrada'];
  t('preenchimento rápido: todos os campos de cliente/pedido',
    JSON.stringify(ids.filter(id => !ow.document.getElementById(id))) === '[]', { faltando: ids.filter(id => !ow.document.getElementById(id)) });
  t('preenchimento rápido: tabela de medidas (24 campos)',
    `document.querySelectorAll('#v4QuickModal input[data-med]').length === 24`);
  t('preenchimento rápido: painel de cores',
    `!!document.getElementById('v4QuickCores') && document.querySelectorAll('#v4QuickCores .v4-cor-row').length >= 1`);

  ow.eval("document.getElementById('v4qDoc').value='12.345.678/0001-99'");
  ow.eval("document.getElementById('v4qEnd').value='Rua A, 10'");
  ow.eval("document.getElementById('v4qCidade').value='Goiânia - GO'");
  ow.eval("document.getElementById('v4qCep').value='74000-000'");
  ow.eval("document.querySelector('#v4QuickCores [data-cor-nome]').value='Azul'");
  ow.eval("document.querySelector('#v4QuickCores [data-cor-hex]').value='#123456'");
  ow.eval("(function(){var m=document.querySelectorAll('#v4QuickModal input[data-med=\"fem\"]');m[0].value='43';m[1].value='55'})()");
  ow.eval('aplicarPreenchimentoRapido()');
  t('aplicar grava CPF/CNPJ, endereço, cidade e CEP',
    `['dc_doc','dc_end','dc_cidade','dc_cep'].every(id=>document.getElementById(id).textContent.trim()!=='')`);
  t('aplicar grava a cor (hex + nome) na paleta',
    `document.getElementById('chi_1').value==='#123456' && document.getElementById('cni_1').value==='Azul'`);
  t('aplicar grava as medidas de largura/comprimento',
    `(function(){var m=document.querySelectorAll('#folha1 .med-bloco.fem .med-inp');return m[0].value==='43'&&m[1].value==='55'})()`);

  /* ═══ Medidas: "Nova ficha" tem que voltar para a receita de fábrica ═══
     Antes ficavam as medidas digitadas na ficha anterior — numa ficha de
     outro cliente isso é erro de produção (largura/altura erradas). */
  t('receita das medidas capturada antes de qualquer script', `Array.isArray(window.__v8MedFabrica) && window.__v8MedFabrica.length === 24`);
  ow.eval("(function(){var m=document.querySelectorAll('#folha1 .med-bloco.fem .med-inp');m[0].value='99';m[1].value='111'})()");
  ow.eval('limparParaNovaFicha(8)');
  t('Nova ficha devolve as medidas de fábrica',
    `(function(){var m=document.querySelectorAll('#folha1 .med-bloco.fem .med-inp');return m[0].value==='42'&&m[1].value==='54'})()`);

  /* ═══ Salvamento falhando não pode prender o usuário ══════════════════
     Antes: se o IndexedDB recusasse (memória cheia), v8NovaFicha dava return
     e o botão "Nova ficha" ficava sem efeito para sempre. */
  ow.eval("document.getElementById('dc_nome').textContent='TRABALHO IMPORTANTE'");
  ow.eval('window.v8FichasSalvar=async()=>false');
  ow.eval('window.confirm=()=>false');
  await ow.eval('v8NovaFicha()');
  const aindaNaTela = (ow.document.getElementById('dc_nome').textContent || '').includes('TRABALHO');
  console.log(aindaNaTela ? '  [OK]' : '  [FAIL]', 'salvar falhou + usuário recusou -> ficha atual continua na tela');
  if (!aindaNaTela) fail++;
  ow.eval('window.confirm=()=>true');
  await ow.eval('v8NovaFicha()');
  const comecouNova = (ow.document.getElementById('dc_nome').textContent || '') === '';
  console.log(comecouNova ? '  [OK]' : '  [FAIL]', 'salvar falhou + usuário aceitou -> começa a nova mesmo assim');
  if (!comecouNova) fail++;

  /* ═══ V8.1 — RASCUNHO VISÍVEL ═════════════════════════════════════════
     Antes o autosave era invisível: uma linha "Salvo 14:32" no fundo de
     "Minhas fichas" e nada mais. Agora existe um cartão "Rascunho" com
     estado, hora, Restaurar e Descartar. */
  t('rascunho: cartão visível na barra lateral', `!!document.getElementById('v8DraftBox') && !!document.getElementById('v8DraftRestaurar') && !!document.getElementById('v8DraftDescartar')`);
  t('rascunho: estado é legível (hora, conteúdo, backup)', `(function(){var e=v8RascunhoEstado();return typeof e.hora==='string' && 'liveUtil' in e && 'temBackup' in e})()`);
  t('rascunho: Nova ficha guardou a ficha anterior',
    `v8RascunhoEstado().temBackup && document.getElementById('v7SaveChip').textContent.indexOf('anterior') > -1`);
  t('rascunho: a nota diz que a ficha aberta está em branco',
    `document.getElementById('v8DraftNote').textContent.indexOf('em branco') > -1`);
  t('rascunho: Restaurar fica habilitado quando há o que restaurar',
    `document.getElementById('v8DraftRestaurar').disabled === false`);
  ow.eval('window.confirm=()=>true');
  t('rascunho: Restaurar devolve o conteúdo guardado',
    `v8RascunhoRestaurar() && document.getElementById('dc_nome').textContent.indexOf('TRABALHO') > -1`);
  t('rascunho: depois de restaurar, vira o rascunho vivo',
    `v8RascunhoEstado().liveUtil && document.getElementById('v7SaveChip').textContent.indexOf('guardado') > -1`);
  t('rascunho: Descartar apaga o guardado', `v8RascunhoDescartar() && !v8RascunhoEstado().temLive && !v8RascunhoEstado().temBackup`);
  t('rascunho: sem rascunho, os dois botões ficam desabilitados',
    `document.getElementById('v8DraftRestaurar').disabled === true && document.getElementById('v8DraftDescartar').disabled === true`);

  /* ═══ V8.1 — Ctrl+C / Ctrl+X / Ctrl+V de camadas ═══════════════════════ */
  ow.eval("layers.length=0; document.querySelectorAll('#canvasInner .txt-layer').forEach(function(e){e.remove()});");
  t('atalhos: copiar a camada selecionada', `criarTexto(); v8CopiarCamada(false)`);
  t('atalhos: colar cria uma camada nova (id diferente)',
    `v8ColarCamada() && layers.length===2 && layers[0].id!==layers[1].id`);
  t('atalhos: colar desloca 3% para não cobrir o original',
    `Math.abs(layers[1].xp-layers[0].xp-0.03)<0.001 && Math.abs(layers[1].yp-layers[0].yp-0.03)<0.001`);
  t('atalhos: recortar copia e apaga',
    `(function(){var n=layers.length;selLayer(layers[0].id);var ok=v8CopiarCamada(true)&&v8ExcluirSelecionada();return ok&&layers.length===n-1})()`);
  t('atalhos: Ctrl+C dentro de um campo não mexe na folha',
    `(function(){var n=layers.length,c=JSON.stringify(v8ClipLayer);var el=document.getElementById('avisoTxt');el.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true}));return layers.length===n&&JSON.stringify(v8ClipLayer)===c})()`);
  t('atalhos: Ctrl+Z dentro de um campo não desfaz a folha',
    `(function(){var orig=window.undo,chamou=0;window.undo=function(){chamou++};var el=document.getElementById('avisoTxt');el.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));window.undo=orig;return chamou===0})()`);
  t('atalhos: Ctrl+Z fora de campo desfaz a folha',
    `(function(){var orig=window.undo,chamou=0;window.undo=function(){chamou++};document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));window.undo=orig;return chamou===1})()`);
  t('atalhos: Ctrl+V fora de campo cola a camada copiada',
    `(function(){var n=layers.length;document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true}));return layers.length===n+1})()`);

  if (oerr.length) fail++;
  console.log('  page errors:', oerr.length ? oerr : 'none ✓');
  console.log(fail ? `\n═══ FICHA V8: ${fail} FALHA(S) ═══` : '\n═══ FICHA V8: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
