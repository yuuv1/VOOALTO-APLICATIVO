#!/usr/bin/env python3
"""Reapply approved changes to ficha_tecnica.html from clean backup:
1. Shapes (rect/circle) + shape toolbar
2. Footer: remove "Finalizar e Salvar", add "Exportar PNG", highlight Catalogação
3. Version V6
4. html2canvas CDN for PNG export
KEEPS: original eyedropper, sidebar action buttons, no quick-add toolbar"""

filepath = '/home/user/VERSAO_6_0/ATUALIZACAO_V6/fontes/criador_ficha_tecnica.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ═══ 1. Add html2canvas CDN script ═══
old_script = '<script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js"></script>'
new_script = old_script + '\n  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>'
content = content.replace(old_script, new_script)

# ═══ 2. Add Shape CSS ═══
shape_css = """
/* ═══ SHAPE LAYERS ═══ */
.rect-layer,.circle-layer{position:absolute;user-select:none;touch-action:none;cursor:move;z-index:50}
.rect-layer.sel{outline:2px dashed #3B82F6;outline-offset:4px}
.circle-layer.sel{outline:2px dashed #8B5CF6;outline-offset:4px}
.shape-tb{position:absolute;left:50%;transform:translateX(-50%);top:8px;display:none;gap:6px;align-items:center;background:rgba(255,255,255,.98);border:1px solid var(--bd);border-radius:16px;padding:8px 14px;z-index:504;white-space:nowrap;box-shadow:0 14px 44px rgba(15,23,42,.18);backdrop-filter:blur(12px)}
.shape-tb.vis{display:flex}
.shape-tb::before{content:'Forma';font-size:9px;font-weight:900;color:#3B82F6;text-transform:uppercase;letter-spacing:.8px;margin-right:4px}
"""
content = content.replace('.sb-footer{\n', shape_css + '.sb-footer{\n')

# ═══ 3. Update footer CSS ═══
old_save_css = """.sb-save{background:linear-gradient(135deg,#10B981,#059669);color:#fff}
.sb-pdf{background:linear-gradient(135deg,var(--accent-1),#B01060);color:#fff}
.sb-catalog{background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff}"""

new_footer_css = """.sb-pdf{background:linear-gradient(135deg,var(--accent-1),#B01060);color:#fff}
.sb-png{background:linear-gradient(135deg,#10B981,#059669);color:#fff}
.sb-catalog{
  background:linear-gradient(135deg,#2563EB,#7C3AED,#1D4ED8);color:#fff;
  font-size:13px;padding:13px 16px;
  box-shadow:0 6px 28px rgba(37,99,235,.5),0 0 0 1px rgba(124,58,237,.3);
  position:relative;overflow:hidden;
}
.sb-catalog:hover{transform:translateY(-3px)!important;box-shadow:0 10px 36px rgba(37,99,235,.6),0 0 0 1px rgba(124,58,237,.5)!important}
.sb-catalog::before{content:'';position:absolute;inset:-3px;border-radius:calc(var(--radius-btn) + 3px);background:linear-gradient(135deg,#2563EB,#7C3AED,#60A5FA);z-index:-1;opacity:0;animation:catalogGlow 2.5s ease-in-out infinite}
@keyframes catalogGlow{0%,100%{opacity:0;transform:scale(1)}50%{opacity:.55;transform:scale(1.02)}}
.sb-catalog .qa-ico-big{font-size:18px}
.sb-export-row{display:flex;gap:6px}
.sb-export-half{flex:1;padding:10px 12px;font-size:10px}"""
content = content.replace(old_save_css, new_footer_css)

# ═══ 4. Replace footer HTML ═══
old_footer_html = """<div class="sb-footer">
<div class="sb-ur">
<button id="btnUndo" onclick="undo()" disabled title="Desfazer Ctrl+Z">↩ Desfazer</button>
<button id="btnRedo" onclick="redo()" disabled title="Refazer Ctrl+Y">↪ Refazer</button>
</div>
<button class="sb-footer-btn sb-save" onclick="finalizarESalvar()">
<span style="font-size:14px">💾</span>
<span>Finalizar e Salvar</span>
</button>
<button class="sb-footer-btn sb-catalog" onclick="enviarParaCatalogacao()">
<span style="font-size:14px">📋</span>
<span>Enviar para Catalogação</span>
</button>
<button class="sb-footer-btn sb-pdf" onclick="exportarPDF()">
<span style="font-size:14px">🖨</span>
<span>Exportar PDF A4</span>
</button>
<div class="sb-version">VOOALTO UNIFORMES · v4.0</div>
</div>"""

new_footer_html = """<div class="sb-footer">
<div class="sb-ur">
<button id="btnUndo" onclick="undo()" disabled title="Desfazer Ctrl+Z">↩ Desfazer</button>
<button id="btnRedo" onclick="redo()" disabled title="Refazer Ctrl+Y">↪ Refazer</button>
</div>
<button class="sb-footer-btn sb-catalog" onclick="enviarParaCatalogacao()">
<span class="qa-ico-big">📋</span>
<span style="font-size:13px;font-weight:900">Enviar para Catalogação</span>
</button>
<div class="sb-export-row">
<button class="sb-footer-btn sb-pdf sb-export-half" onclick="exportarPDF()">
<span style="font-size:14px">🖨</span>
<span>Exportar PDF</span>
</button>
<button class="sb-footer-btn sb-png sb-export-half" onclick="exportarPNG()">
<span style="font-size:14px">📸</span>
<span>Exportar PNG</span>
</button>
</div>
<div class="sb-version">VOOALTO UNIFORMES · V6</div>
</div>"""
content = content.replace(old_footer_html, new_footer_html)

# ═══ 5. Add shape toolbar HTML (inside canvas area, after arr-tb) ═══
old_layers_panel = '<div class="layers-panel" id="layersPanel">'
shape_tb_html = """<div class="shape-tb" id="shapeTb">
<input type="color" class="tt-color" id="shFillColor" value="#E5E7EB" oninput="applyShapeProps()">
<span class="tt-label">Fundo</span>
<div class="ct-sep"></div>
<input type="color" class="tt-color" id="shStrokeColor" value="#374151" oninput="applyShapeProps()">
<span class="tt-label">Borda</span>
<div class="ct-sep"></div>
<input class="tt-num" id="shStrokeWidth" type="number" value="2" min="0" max="20" onchange="applyShapeProps()" style="width:42px">
<span class="tt-label">Esp</span>
<div class="ct-sep"></div>
<button class="ct-btn" onclick="lFrente()">⬆</button>
<button class="ct-btn" onclick="lTras()">⬇</button>
<button class="ct-btn" onclick="lCentro()">⊕ Centro</button>
<div class="ct-sep"></div>
<button class="ct-btn" style="color:var(--vm)" onclick="excluirSel()">🗑</button>
<button class="ct-btn" onclick="deselecionarTudo()">✕</button>
</div>
<div class="layers-panel" id="layersPanel">"""
content = content.replace(old_layers_panel, shape_tb_html)

# ═══ 6. Update selLayer for shapes ═══
old_selLayer = """function selLayer(id){
selId=id;document.querySelectorAll('#canvasInner .img-layer,#canvasInner .txt-layer,#canvasInner .arr-layer').forEach(el=>el.classList.remove('sel'));
const target=document.getElementById('ly_'+id);if(target)target.classList.add('sel');const l=layers.find(x=>x.id===id);if(!l)return;fecharLogo();
canvasTb.classList.remove('vis');textTb.classList.remove('vis');arrTb.classList.remove('vis');
if(l.type==='img'){canvasTb.classList.add('vis');$('tbNome').textContent=`Imagem ${layers.filter(x=>x.type==='img').indexOf(l)+1}`;$('propBtn').classList.toggle('on',l.prop);}
else if(l.type==='txt'){textTb.classList.add('vis');$('ttFont').value=l.font;$('ttSize').value=l.size;$('ttColor').value=l.color;$('ttBold').classList.toggle('on',l.bold);$('ttItalic').classList.toggle('on',l.italic);}
else if(l.type==='arr'){arrTb.classList.add('vis');$('arColor').value=l.color;$('arStroke').value=l.stroke;const s=l.arStyle||'full';currentArrStyle=s;['Full','Open','None'].forEach(k=>document.getElementById('arStyle'+k).classList.toggle('on',k.toLowerCase()===s));}
updList();
}"""

new_selLayer = """function selLayer(id){
selId=id;document.querySelectorAll('#canvasInner .img-layer,#canvasInner .txt-layer,#canvasInner .arr-layer,#canvasInner .rect-layer,#canvasInner .circle-layer').forEach(el=>el.classList.remove('sel'));
const target=document.getElementById('ly_'+id);if(target)target.classList.add('sel');const l=layers.find(x=>x.id===id);if(!l)return;fecharLogo();
canvasTb.classList.remove('vis');textTb.classList.remove('vis');arrTb.classList.remove('vis');$('shapeTb').classList.remove('vis');
if(l.type==='img'){canvasTb.classList.add('vis');$('tbNome').textContent=`Imagem ${layers.filter(x=>x.type==='img').indexOf(l)+1}`;$('propBtn').classList.toggle('on',l.prop);}
else if(l.type==='txt'){textTb.classList.add('vis');$('ttFont').value=l.font;$('ttSize').value=l.size;$('ttColor').value=l.color;$('ttBold').classList.toggle('on',l.bold);$('ttItalic').classList.toggle('on',l.italic);}
else if(l.type==='arr'){arrTb.classList.add('vis');$('arColor').value=l.color;$('arStroke').value=l.stroke;const s=l.arStyle||'full';currentArrStyle=s;['Full','Open','None'].forEach(k=>document.getElementById('arStyle'+k).classList.toggle('on',k.toLowerCase()===s));}
else if(l.type==='rect'||l.type==='circle'){$('shapeTb').classList.add('vis');$('shFillColor').value=l.fillColor||'#E5E7EB';$('shStrokeColor').value=l.strokeColor||'#374151';$('shStrokeWidth').value=l.strokeWidth||2;}
updList();
}"""
content = content.replace(old_selLayer, new_selLayer)

# ═══ 7. Update deselecionarTudo for shapes ═══
old_deselec = """function deselecionarTudo(){
layers.filter(x=>x.type==='txt'&&x._editing).forEach(l=>{l._editing=false;const el=document.getElementById('ly_'+l.id);if(!el)return;el.classList.remove('editing');const tc=el.querySelector('.tc');if(tc){tc.contentEditable='false';l.richHtml=tc.innerHTML;l.txt=tc.textContent||'Texto';}});
selId=null;document.querySelectorAll('#canvasInner .img-layer,#canvasInner .txt-layer,#canvasInner .arr-layer').forEach(el=>el.classList.remove('sel'));
canvasTb.classList.remove('vis');textTb.classList.remove('vis');arrTb.classList.remove('vis');
}"""

new_deselec = """function deselecionarTudo(){
layers.filter(x=>x.type==='txt'&&x._editing).forEach(l=>{l._editing=false;const el=document.getElementById('ly_'+l.id);if(!el)return;el.classList.remove('editing');const tc=el.querySelector('.tc');if(tc){tc.contentEditable='false';l.richHtml=tc.innerHTML;l.txt=tc.textContent||'Texto';}});
selId=null;document.querySelectorAll('#canvasInner .img-layer,#canvasInner .txt-layer,#canvasInner .arr-layer,#canvasInner .rect-layer,#canvasInner .circle-layer').forEach(el=>el.classList.remove('sel'));
canvasTb.classList.remove('vis');textTb.classList.remove('vis');arrTb.classList.remove('vis');$('shapeTb').classList.remove('vis');
}"""
content = content.replace(old_deselec, new_deselec)

# ═══ 8. Update serLayer for shapes ═══
old_serLayer = """function serLayer(l){
const b={id:l.id,type:l.type,xp:l.xp,yp:l.yp,wp:l.wp,hp:l.hp,rot:l.rot||0,z:l.z};
if(l.type==='img'){b.src=l.src;b.ratio=l.ratio;b.prop=l.prop;}
if(l.type==='txt'){b.txt=l.txt;b.font=l.font;b.size=l.size;b.color=l.color;b.bold=l.bold;b.italic=l.italic;b.richHtml=l.richHtml||'';}
if(l.type==='arr'){b.color=l.color;b.stroke=l.stroke;b.arStyle=l.arStyle||'full';b.x1p=l.x1p;b.y1p=l.y1p;b.x2p=l.x2p;b.y2p=l.y2p;}
return b;
}"""

new_serLayer = """function serLayer(l){
const b={id:l.id,type:l.type,xp:l.xp,yp:l.yp,wp:l.wp,hp:l.hp,rot:l.rot||0,z:l.z};
if(l.type==='img'){b.src=l.src;b.ratio=l.ratio;b.prop=l.prop;}
if(l.type==='txt'){b.txt=l.txt;b.font=l.font;b.size=l.size;b.color=l.color;b.bold=l.bold;b.italic=l.italic;b.richHtml=l.richHtml||'';}
if(l.type==='arr'){b.color=l.color;b.stroke=l.stroke;b.arStyle=l.arStyle||'full';b.x1p=l.x1p;b.y1p=l.y1p;b.x2p=l.x2p;b.y2p=l.y2p;}
if(l.type==='rect'||l.type==='circle'){b.fillColor=l.fillColor;b.strokeColor=l.strokeColor;b.strokeWidth=l.strokeWidth;}
return b;
}"""
content = content.replace(old_serLayer, new_serLayer)

# ═══ 9. Update capturarFichaParaJSON layer serialization for shapes ═══
old_layer_capture = """if(l.type==='arr') { b.color=l.color; b.stroke=l.stroke; b.arStyle=l.arStyle||'full'; b.x1p=l.x1p; b.y1p=l.y1p; b.x2p=l.x2p; b.y2p=l.y2p; }
    return b;"""
new_layer_capture = """if(l.type==='arr') { b.color=l.color; b.stroke=l.stroke; b.arStyle=l.arStyle||'full'; b.x1p=l.x1p; b.y1p=l.y1p; b.x2p=l.x2p; b.y2p=l.y2p; }
    if(l.type==='rect'||l.type==='circle') { b.fillColor=l.fillColor; b.strokeColor=l.strokeColor; b.strokeWidth=l.strokeWidth; }
    return b;"""
content = content.replace(old_layer_capture, new_layer_capture)

# ═══ 10. Update restaurarDeJSON for shape layer types ═══
old_restaurar = """(d._layers || []).forEach(x => {
    if(x.type==='img') { const ov = Object.assign({}, x); if(x._newSrc) ov.src = x._newSrc; addImgLayer(ov.src, ov); }
    else if(x.type==='txt') addTxtLayer(x);
    else if(x.type==='arr') addArrLayer(x);
  });"""
new_restaurar = """(d._layers || []).forEach(x => {
    if(x.type==='img') { const ov = Object.assign({}, x); if(x._newSrc) ov.src = x._newSrc; addImgLayer(ov.src, ov); }
    else if(x.type==='txt') addTxtLayer(x);
    else if(x.type==='arr') addArrLayer(x);
    else if(x.type==='rect') addRectLayer(x);
    else if(x.type==='circle') addCirculoLayer(x);
  });"""
content = content.replace(old_restaurar, new_restaurar)

# ═══ 11. Fix posEl for shapes (height) ═══
content = content.replace(
    "if(l.type==='img')el.style.height=usePct?(l.hp*100)+'%':(l.hp*H)+'px';",
    "if(l.type==='img'||l.type==='rect'||l.type==='circle')el.style.height=usePct?(l.hp*100)+'%':(l.hp*H)+'px';"
)

# ═══ 12. Fix posElExtra for shapes (height) ═══
content = content.replace(
    "if(l.type==='img')el.style.height=usePct?(l.hp*100)+'%':(l.hp*H)+'px';\n}\nfunction posArrElExtra",
    "if(l.type==='img'||l.type==='rect'||l.type==='circle')el.style.height=usePct?(l.hp*100)+'%':(l.hp*H)+'px';\n}\nfunction posArrElExtra"
)

# ═══ 13. Update deselecionarTudoExtra for shapes ═══
old_deselec_extra = """document.querySelectorAll(`#canvasInner_${pid} .img-layer,#canvasInner_${pid} .txt-layer,#canvasInner_${pid} .arr-layer`).forEach(el=>el.classList.remove('sel'));"""
new_deselec_extra = """document.querySelectorAll(`#canvasInner_${pid} .img-layer,#canvasInner_${pid} .txt-layer,#canvasInner_${pid} .arr-layer,#canvasInner_${pid} .rect-layer,#canvasInner_${pid} .circle-layer`).forEach(el=>el.classList.remove('sel'));"""
content = content.replace(old_deselec_extra, new_deselec_extra)

# ═══ 14. Add shape JS functions after criarTexto ═══
shape_js = """

/* ═══ FORMAS: Retângulo e Círculo ═══ */
function criarRetangulo(){
  if(modoSeta)desativarModoSeta();
  const id=uid();
  const l={type:'rect',id,fillColor:'#E5E7EB',strokeColor:'#374151',strokeWidth:2,xp:0.25,yp:0.3,wp:0.5,hp:0.35,rot:0,z:++zCnt};
  layers.push(l);renderRectLayer(l);selLayer(id);updPh();updList();savLayers();snap();
  toast('▭ Retângulo adicionado');
}
function criarCirculo(){
  if(modoSeta)desativarModoSeta();
  const id=uid();
  const l={type:'circle',id,fillColor:'#FDE68A',strokeColor:'#B45309',strokeWidth:2,xp:0.35,yp:0.25,wp:0.3,hp:0.3,rot:0,z:++zCnt};
  layers.push(l);renderCirculoLayer(l);selLayer(id);updPh();updList();savLayers();snap();
  toast('● Círculo adicionado');
}
function renderRectLayer(l){
  const old=document.getElementById('ly_'+l.id);if(old)old.remove();
  const el=document.createElement('div');el.className='rect-layer';el.id='ly_'+l.id;
  posEl(l,el,false);
  el.style.background=l.fillColor||'#E5E7EB';
  el.style.border=(l.strokeWidth||2)+'px solid '+((l.strokeColor||'#374151'));
  el.style.borderRadius='6px';
  const rs=document.createElement('div');rs.className='tl-resize';el.appendChild(rs);
  const rh=document.createElement('div');rh.className='tl-rot';el.appendChild(rh);
  el.addEventListener('mousedown',e=>{if(eyeAtivo||modoSeta)return;if(e.target===rs||e.target===rh)return;e.stopPropagation();selLayer(l.id);initDragXY(e,l,el);});
  rs.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayer(l.id);initResizeArr(e,l,el);});
  rh.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayer(l.id);initRotEl(e,l,el);});
  canvasInner.appendChild(el);
}
function addRectLayer(ov){
  const id=(ov&&ov.id)||uid();
  const l=Object.assign({type:'rect',fillColor:'#E5E7EB',strokeColor:'#374151',strokeWidth:2,xp:0.25,yp:0.3,wp:0.5,hp:0.35,rot:0,z:++zCnt},ov,{id,type:'rect'});
  layers.push(l);renderRectLayer(l);updPh();updList();savLayers();
}
function renderCirculoLayer(l){
  const old=document.getElementById('ly_'+l.id);if(old)old.remove();
  const el=document.createElement('div');el.className='circle-layer';el.id='ly_'+l.id;
  posEl(l,el,false);
  el.style.background=l.fillColor||'#FDE68A';
  el.style.border=(l.strokeWidth||2)+'px solid '+((l.strokeColor||'#B45309'));
  el.style.borderRadius='50%';
  const rs=document.createElement('div');rs.className='tl-resize';el.appendChild(rs);
  const rh=document.createElement('div');rh.className='tl-rot';el.appendChild(rh);
  el.addEventListener('mousedown',e=>{if(eyeAtivo||modoSeta)return;if(e.target===rs||e.target===rh)return;e.stopPropagation();selLayer(l.id);initDragXY(e,l,el);});
  rs.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayer(l.id);initResizeArr(e,l,el);});
  rh.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayer(l.id);initRotEl(e,l,el);});
  canvasInner.appendChild(el);
}
function addCirculoLayer(ov){
  const id=(ov&&ov.id)||uid();
  const l=Object.assign({type:'circle',fillColor:'#FDE68A',strokeColor:'#B45309',strokeWidth:2,xp:0.35,yp:0.25,wp:0.3,hp:0.3,rot:0,z:++zCnt},ov,{id,type:'circle'});
  layers.push(l);renderCirculoLayer(l);updPh();updList();savLayers();
}
function applyShapeProps(){
  const l=layers.find(x=>x.id===selId&&(x.type==='rect'||x.type==='circle'));
  if(!l)return;
  l.fillColor=$('shFillColor').value;l.strokeColor=$('shStrokeColor').value;l.strokeWidth=parseInt($('shStrokeWidth').value)||0;
  const el=document.getElementById('ly_'+l.id);
  if(el){el.style.background=l.fillColor;el.style.border=l.strokeWidth+'px solid '+l.strokeColor;if(l.type==='circle')el.style.borderRadius='50%';else el.style.borderRadius='6px';}
  savLayers();snap();
}

/* ═══ PNG Export ═══ */
function exportarPNG(){
  prepPrint();
  toast('📸 Preparando exportação PNG...');
  const doExport=async()=>{
    const folhas=document.querySelectorAll('.folha,.folha-branca');
    for(let i=0;i<folhas.length;i++){
      try{
        const canvas=await html2canvas(folhas[i],{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,windowWidth:794,windowHeight:1123});
        const link=document.createElement('a');
        const nomeCliente=($('dc_nome')?($('dc_nome').textContent||'').trim():'')||'';
        const numFicha=($('fichaNum')?$('fichaNum').value:'')||'';
        let nome='Ficha_Tecnica';
        if(nomeCliente)nome+='_'+nomeCliente.replace(/[^a-zA-Z0-9À-ÿ]/g,'_');
        if(numFicha)nome+='_N'+numFicha;
        link.download=nome+'_Pag'+(i+1)+'.png';
        link.href=canvas.toDataURL('image/png');
        link.click();
      }catch(err){console.error('html2canvas error:',err);toast('❌ Erro ao exportar página '+String(i+1),'erro');}
    }
    restAllPx();toast('✅ PNG exportado com sucesso!');
  };
  if(window.html2canvas){doExport();}
  else{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=()=>setTimeout(doExport,300);s.onerror=()=>{toast('❌ Erro ao carregar html2canvas','erro');restAllPx();};document.head.appendChild(s);}
}
"""

old_criarTexto_end = "function criarTexto(){if(modoSeta)desativarModoSeta();const id=uid();const l={type:'txt',id,txt:'Texto Aqui',richHtml:'',font:\"'Segoe UI',sans-serif\",size:22,color:'#1E2937',bold:false,italic:false,xp:0.15,yp:0.4,wp:0.7,rot:0,z:++zCnt};layers.push(l);renderTxtLayer(l);selLayer(id);updPh();updList();savLayers();snap();toast('✍ Duplo clique para editar','',2500);}"
content = content.replace(old_criarTexto_end, old_criarTexto_end + shape_js)

# ═══ 15. Update print CSS — hide shape toolbar ═══
content = content.replace(
    "#sidebar,#sidebar-toggle,#cropModal,#toast,#edPreview,.arr-draw-hint,#arrowPreview,#richBar{display:none!important}",
    "#sidebar,#sidebar-toggle,#cropModal,#toast,#edPreview,.arr-draw-hint,#arrowPreview,#richBar,.shape-tb{display:none!important}"
)

content = content.replace(
    ".logo-tb,.lh,.lh-rot,.cor-painel,.btn-add-cor,.cor-rect input[type=\"color\"],.canvas-tb,.text-tb,.arr-tb,.layers-panel,.canvas-add-img,.canvas-ph,.lyr-h,.lyr-rot,.tl-resize,.tl-rot,.arr-h,.arr-rot,.arr-ep,.del-btn,.ed-btn,#eyedropOverlay,.sep-toolbar{display:none!important}",
    ".logo-tb,.lh,.lh-rot,.cor-painel,.btn-add-cor,.cor-rect input[type=\"color\"],.canvas-tb,.text-tb,.arr-tb,.shape-tb,.layers-panel,.canvas-add-img,.canvas-ph,.lyr-h,.lyr-rot,.tl-resize,.tl-rot,.arr-h,.arr-rot,.arr-ep,.del-btn,.ed-btn,#eyedropOverlay,.sep-toolbar{display:none!important}"
)

content = content.replace(
    "img-layer,.txt-layer,.arr-layer{outline:none!important;cursor:default!important}",
    "img-layer,.txt-layer,.arr-layer,.rect-layer,.circle-layer{outline:none!important;cursor:default!important}"
)

# ═══ 16. Update v4-preview-clean CSS for shapes ═══
content = content.replace(
    "body.v4-preview-clean .canvas-tb,body.v4-preview-clean .text-tb,body.v4-preview-clean .arr-tb,body.v4-preview-clean .layers-panel,body.v4-preview-clean .canvas-add-img,body.v4-preview-clean .canvas-ph",
    "body.v4-preview-clean .canvas-tb,body.v4-preview-clean .text-tb,body.v4-preview-clean .arr-tb,body.v4-preview-clean .shape-tb,body.v4-preview-clean .layers-panel,body.v4-preview-clean .canvas-add-img,body.v4-preview-clean .canvas-ph"
)
content = content.replace(
    "body.v4-preview-clean .img-layer,body.v4-preview-clean .txt-layer,body.v4-preview-clean .arr-layer{outline:none!important}",
    "body.v4-preview-clean .img-layer,body.v4-preview-clean .txt-layer,body.v4-preview-clean .arr-layer,body.v4-preview-clean .rect-layer,body.v4-preview-clean .circle-layer{outline:none!important}"
)

# ═══ 17. Update updList for shapes ═══
old_updList = """function updList(){\nconst ll=$('layersList');if(!ll)return;ll.innerHTML='';\n[...layers].reverse().forEach((l,i)=>{const row=document.createElement('div');row.className='lp-row'+(l.id===selId?' sel-row':'');row.onclick=()=>selLayer(l.id);const icon=l.type==='txt'?`<div class=\"lp-icon\" style=\"font-size:10px;font-weight:900;color:var(--az)\">T</div>`:l.type==='arr'?`<div class=\"lp-icon\" style=\"font-size:11px\">➜</div>`:`<img class=\"lp-thumb\" src=\"${l.src}\" alt=\"\">`;const name=l.type==='txt'?`Texto: \"${(l.txt||'').slice(0,8)}\"`:l.type==='arr'?'Seta':`Img ${layers.length-i}`;row.innerHTML=`${icon}<span class=\"lp-name\">${name}</span><button class=\"lp-del\" onclick=\"event.stopPropagation();excluirId('${l.id}')\">✕</button>`;ll.appendChild(row);});}"""

new_updList = """function updList(){
const ll=$('layersList');if(!ll)return;ll.innerHTML='';
[...layers].reverse().forEach((l,i)=>{const row=document.createElement('div');row.className='lp-row'+(l.id===selId?' sel-row':'');row.onclick=()=>selLayer(l.id);
const icon=l.type==='txt'?`<div class=\"lp-icon\" style=\"font-size:10px;font-weight:900;color:var(--az)\">T</div>`:l.type==='arr'?`<div class=\"lp-icon\" style=\"font-size:11px\">➜</div>`:l.type==='rect'?`<div class=\"lp-icon\" style=\"font-size:10px;font-weight:900;color:#3B82F6\">▭</div>`:l.type==='circle'?`<div class=\"lp-icon\" style=\"font-size:10px;font-weight:900;color:#8B5CF6\">●</div>`:`<img class=\"lp-thumb\" src=\"${l.src}\" alt=\"\">`;
const name=l.type==='txt'?`Texto: "${(l.txt||'').slice(0,8)}"`:l.type==='arr'?'Seta':l.type==='rect'?'Retângulo':l.type==='circle'?'Círculo':`Img ${layers.length-i}`;
row.innerHTML=`${icon}<span class=\"lp-name\">${name}</span><button class=\"lp-del\" onclick=\"event.stopPropagation();excluirId('${l.id}')\">✕</button>`;ll.appendChild(row);});}"""
content = content.replace(old_updList, new_updList)

# ═══ 18. Update version in rodape ═══
content = content.replace('VOOALTO UNIFORMES · Ficha Técnica de Produção v4.0', 'VOOALTO UNIFORMES · Ficha Técnica de Produção V6')

# ═══ 19. Add shape buttons to sidebar P1 page actions ═══
# Insert after "Desenhar Seta" button, before "Painel de Camadas"
old_seta_btn = """<button class="sb-btn" id="btnSeta" onclick="toggleModoSeta()">
<div class="sb-btn-icon">➜</div>
<span class="sb-btn-label">Desenhar Seta</span>
</button>
<button class="sb-btn" onclick="toggleLayersPanel()">"""

new_seta_btn = """<button class="sb-btn" id="btnSeta" onclick="toggleModoSeta()">
<div class="sb-btn-icon">➜</div>
<span class="sb-btn-label">Desenhar Seta</span>
</button>
<button class="sb-btn" onclick="criarRetangulo()">
<div class="sb-btn-icon">▭</div>
<span class="sb-btn-label">Retângulo</span>
</button>
<button class="sb-btn" onclick="criarCirculo()">
<div class="sb-btn-icon">●</div>
<span class="sb-btn-label">Círculo</span>
</button>
<button class="sb-btn" onclick="toggleLayersPanel()">"""
content = content.replace(old_seta_btn, new_seta_btn)

# ═══ 20. Add extra page shape functions + shape buttons in extra page sidebar ═══
# Add criarRetanguloExtra and criarCirculoExtra after toggleModoSetaExtra
old_toggle_extra = "function toggleModoSetaExtra(pid){const p=paginas.find(x=>x.id===pid);if(!p)return;p.modoSeta?desativarModoSetaExtra(p):ativarModoSetaExtra(p);}"

extra_shapes = """function toggleModoSetaExtra(pid){const p=paginas.find(x=>x.id===pid);if(!p)return;p.modoSeta?desativarModoSetaExtra(p):ativarModoSetaExtra(p);}
function criarRetanguloExtra(pid){const p=paginas.find(x=>x.id===pid);if(!p)return;if(p.modoSeta)desativarModoSetaExtra(p);const id=uid();const l={type:'rect',id,fillColor:'#E5E7EB',strokeColor:'#374151',strokeWidth:2,xp:0.25,yp:0.3,wp:0.5,hp:0.35,rot:0,z:++p.zCnt};p.layers.push(l);renderRectLayerExtra(p,l);selLayerExtra(p,id);updPhExtra(p);snap();toast('▭ Retângulo adicionado');}
function criarCirculoExtra(pid){const p=paginas.find(x=>x.id===pid);if(!p)return;if(p.modoSeta)desativarModoSetaExtra(p);const id=uid();const l={type:'circle',id,fillColor:'#FDE68A',strokeColor:'#B45309',strokeWidth:2,xp:0.35,yp:0.25,wp:0.3,hp:0.3,rot:0,z:++p.zCnt};p.layers.push(l);renderCirculoLayerExtra(p,l);selLayerExtra(p,id);updPhExtra(p);snap();toast('● Círculo adicionado');}
function renderRectLayerExtra(p,l){const old=document.getElementById('ly_'+p.id+'_'+l.id);if(old)old.remove();const el=document.createElement('div');el.className='rect-layer';el.id='ly_'+p.id+'_'+l.id;posElExtra(p,l,el,false);el.style.background=l.fillColor||'#E5E7EB';el.style.border=(l.strokeWidth||2)+'px solid '+((l.strokeColor||'#374151'));el.style.borderRadius='6px';const rs=document.createElement('div');rs.className='tl-resize';el.appendChild(rs);const rh=document.createElement('div');rh.className='tl-rot';el.appendChild(rh);el.addEventListener('mousedown',e=>{if(p.modoSeta)return;if(e.target===rs||e.target===rh)return;e.stopPropagation();selLayerExtra(p,l.id);initDragXYExtra(e,p,l,el);});rs.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayerExtra(p,l.id);initResizeArrExtra(e,p,l,el);});rh.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayerExtra(p,l.id);initRotElExtra(e,p,l,el);});$('canvasInner_'+p.id).appendChild(el);}
function addRectLayerExtra(p,ov){const id=(ov&&ov.id)||uid();const l=Object.assign({type:'rect',fillColor:'#E5E7EB',strokeColor:'#374151',strokeWidth:2,xp:0.25,yp:0.3,wp:0.5,hp:0.35,rot:0,z:++p.zCnt},ov,{id,type:'rect'});p.layers.push(l);renderRectLayerExtra(p,l);updPhExtra(p);}
function renderCirculoLayerExtra(p,l){const old=document.getElementById('ly_'+p.id+'_'+l.id);if(old)old.remove();const el=document.createElement('div');el.className='circle-layer';el.id='ly_'+p.id+'_'+l.id;posElExtra(p,l,el,false);el.style.background=l.fillColor||'#FDE68A';el.style.border=(l.strokeWidth||2)+'px solid '+((l.strokeColor||'#B45309'));el.style.borderRadius='50%';const rs=document.createElement('div');rs.className='tl-resize';el.appendChild(rs);const rh=document.createElement('div');rh.className='tl-rot';el.appendChild(rh);el.addEventListener('mousedown',e=>{if(p.modoSeta)return;if(e.target===rs||e.target===rh)return;e.stopPropagation();selLayerExtra(p,l.id);initDragXYExtra(e,p,l,el);});rs.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayerExtra(p,l.id);initResizeArrExtra(e,p,l,el);});rh.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();selLayerExtra(p,l.id);initRotElExtra(e,p,l,el);});$('canvasInner_'+p.id).appendChild(el);}
function addCirculoLayerExtra(p,ov){const id=(ov&&ov.id)||uid();const l=Object.assign({type:'circle',fillColor:'#FDE68A',strokeColor:'#B45309',strokeWidth:2,xp:0.35,yp:0.25,wp:0.3,hp:0.3,rot:0,z:++p.zCnt},ov,{id,type:'circle'});p.layers.push(l);renderCirculoLayerExtra(p,l);updPhExtra(p);}
"""

content = content.replace(old_toggle_extra, extra_shapes)

# Add shape buttons in extra page sidebar template
old_seta_extra = """<button class="sb-btn" id="sbSeta_${p.id}" onclick="toggleModoSetaExtra('${p.id}')">
<div class="sb-btn-icon">➜</div>
<span class="sb-btn-label">Desenhar Seta</span>
</button>
${!isBranca?"""

new_seta_extra = """<button class="sb-btn" id="sbSeta_${p.id}" onclick="toggleModoSetaExtra('${p.id}')">
<div class="sb-btn-icon">➜</div>
<span class="sb-btn-label">Desenhar Seta</span>
</button>
<button class="sb-btn" onclick="criarRetanguloExtra('${p.id}')">
<div class="sb-btn-icon">▭</div>
<span class="sb-btn-label">Retângulo</span>
</button>
<button class="sb-btn" onclick="criarCirculoExtra('${p.id}')">
<div class="sb-btn-icon">●</div>
<span class="sb-btn-label">Círculo</span>
</button>
${!isBranca?"""
content = content.replace(old_seta_extra, new_seta_extra)

# ═══ FINAL ═══
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("All patches applied successfully!")
print("File size:", len(content), "chars")
