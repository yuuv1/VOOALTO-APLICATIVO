#!/usr/bin/env python3
"""Fix sidebar buttons removal and eyedropper → spectrum replacement"""
import re

filepath = '/home/user/VERSAO_6_0/ATUALIZACAO_V6/fontes/criador_ficha_tecnica.html'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ═══ 1. Remove sidebar action buttons from P1 ═══
# Find the sb-page-actions div block in the sidebar for P1
# Pattern: <div class="sb-page-actions">...all buttons...</div>
# This div is inside sb-page-group#pgGroup1

# Strategy: find the line with "sb-page-actions" that's in the sidebar (not CSS)
# and remove it along with its contents

idx = content.find('<div class="sb-page-actions">\n')
# Skip the CSS definition (it's at line 150), find the HTML one
# The HTML one is after the sidebar nav starts
sidebar_start = content.find('<nav id="sidebar"')
if sidebar_start > 0:
    idx = content.find('<div class="sb-page-actions">\n', sidebar_start)
    print(f"P1 sb-page-actions HTML at index: {idx}")
    
    if idx > 0:
        # Find the closing </div> for sb-page-actions
        # The structure is: <div class="sb-page-actions">...buttons...</div>
        # followed by </div> (closing sb-page-group)
        close_idx = idx
        depth = 1
        pos = idx + len('<div class="sb-page-actions">\n')
        while depth > 0 and pos < len(content):
            next_open = content.find('<div', pos)
            next_close = content.find('</div>', pos)
            if next_close < next_open or next_open == -1:
                depth -= 1
                pos = next_close + len('</div>')
            else:
                depth += 1
                pos = next_open + len('<div')
        # pos is now at the end of the closing </div> for sb-page-actions
        print(f"Closing </div> at index: {pos - len('</div>')}")
        print(f"Removing {pos - idx} chars")
        
        # Remove the entire sb-page-actions div
        removed = content[idx:pos]
        content = content[:idx] + content[pos:]
        print("Removed P1 action buttons")
        print("Preview of removed content (first 100 chars):", removed[:100])

# ═══ 2. Remove extra page sidebar action buttons ═══
# Find the atualizarNavSidebar function template
nav_idx = content.find('function atualizarNavSidebar')
print(f"\natualizarNavSidebar at index: {nav_idx}")

if nav_idx > 0:
    # Find the grp.innerHTML template
    inner_idx = content.find('grp.innerHTML=`', nav_idx)
    inner_end = content.find('`;', inner_idx) + 2
    print(f"Template from {inner_idx} to {inner_end}")
    old_template = content[inner_idx:inner_end]
    print(f"Old template ({len(old_template)} chars):")
    print(old_template[:200])
    
    # Replace with simplified version (just header, no action buttons)
    new_template = """grp.innerHTML=`
<div class="sb-page-header">
<div class="sb-page-num">${p.num}</div>
<span>Página ${p.num}${isBranca?' 🗋':''}</span>
<button class="sb-remove-page" onclick="removerPagina('${p.id}')">✕ Remover</button>
</div>`;"""
    
    content = content[:inner_idx] + new_template + content[inner_end:]
    print("Replaced extra page nav template")

# ═══ 3. Replace eyedropper JS with spectrum picker JS ═══
eye_idx = content.find('let eyeAtivo=false;\nconst eyeOvl')
print(f"\neyeAtivo JS at index: {eye_idx}")

if eye_idx > 0:
    # Find the end of the eyedropper code block
    # It ends at "function aplicarCorCapturada"
    end_marker = content.find('function aplicarCorCapturada(hex)')
    if end_marker > 0:
        # Find the end of that function
        func_end = content.find('\n\n/* ═══ LOGO ═══ */', end_marker)
        if func_end > 0:
            old_eye_block = content[eye_idx:func_end]
            print(f"Removing eyedropper block from {eye_idx} to {func_end} ({len(old_eye_block)} chars)")
            
            spectrum_js = """/* ═══ ESPECTRO DE COR (replaces broken eyedropper) ═══ */
let eyeAtivo=false; /* kept for compatibility but never activated */

/* HSV ↔ RGB ↔ Hex conversions */
function hsvToRgb(h,s,v){
  const i=Math.floor(h/60)%6,f=h/60-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
  let r,g,b;
  switch(i){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
  return{r:Math.round(r*255),g:Math.round(g*255),b:Math.round(b*255)};
}
function rgbToHsv(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h,s,v=max;s=max===0?0:d/max;
  if(max===min)h=0;else{switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;}h*=60;}
  return{h,s,v};
}
function hexToRgb(hex){
  hex=hex.replace('#','');
  if(hex.length===3)hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return{r:parseInt(hex.substr(0,2),16),g:parseInt(hex.substr(2,2),16),b:parseInt(hex.substr(4,2),16)};
}
function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');}

/* Spectrum picker state */
let espHue=220,espSat=0.74,espVal=0.96;
let espTargetId=null;

function toggleEspectro(){
  const panel=document.getElementById('espectroPanel');
  if(panel.classList.contains('open')){fecharEspectro();return;}
  const itens=document.querySelectorAll('#coresList [id^="ci_"]');
  espTargetId=null;
  for(const it of itens){const i=it.id.replace('ci_','');const ni=document.getElementById('cni_'+i);if(ni&&ni.value.trim().toUpperCase()==='COR'){espTargetId=i;break;}}
  let startHex='#3B82F6';
  if(espTargetId){const chi=document.getElementById('chi_'+espTargetId);if(chi&&chi.value)startHex=chi.value;}
  const rgb=hexToRgb(startHex);const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
  espHue=hsv.h;espSat=hsv.s;espVal=hsv.v;
  espUpdateUI();
  panel.classList.add('open');
}
function fecharEspectro(){document.getElementById('espectroPanel').classList.remove('open');}

function espUpdateUI(){
  const rgb=hsvToRgb(espHue,espSat,espVal);const hex=rgbToHex(rgb.r,rgb.g,rgb.b);
  document.getElementById('espSVWhite').style.background='linear-gradient(to right,#fff,hsl('+espHue+',100%,50%))';
  document.getElementById('espSVBlack').style.background='linear-gradient(to top,#000,transparent)';
  document.getElementById('espSVMarker').style.left=(espSat*100)+'%';
  document.getElementById('espSVMarker').style.top=((1-espVal)*100)+'%';
  document.getElementById('espSVMarker').style.background=hex;
  document.getElementById('espHueMarker').style.left=(espHue/360*100)+'%';
  document.getElementById('espSwatch').style.background=hex;
  document.getElementById('espHex').textContent=hex.toUpperCase();
  document.getElementById('espRGB').textContent='RGB('+rgb.r+', '+rgb.g+', '+rgb.b+')';
}

function espSVDown(e){
  e.preventDefault();const rect=document.getElementById('espSV').getBoundingClientRect();
  const move=ev=>{const x=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));const y=Math.max(0,Math.min(1,(ev.clientY-rect.top)/rect.height));espSat=x;espVal=1-y;espUpdateUI();};
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
  move(e);
}
function espHueDown(e){
  e.preventDefault();const rect=document.getElementById('espHue').getBoundingClientRect();
  const move=ev=>{const x=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));espHue=x*360;espUpdateUI();};
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
  move(e);
}

function aplicarEspectro(){
  const rgb=hsvToRgb(espHue,espSat,espVal);const hex=rgbToHex(rgb.r,rgb.g,rgb.b).toUpperCase();
  if(espTargetId){updCorVisual(espTargetId,hex);document.getElementById('chi_'+espTargetId).value=hex;document.getElementById('cp_'+espTargetId).value=hex;savCores();toast('✔ Cor aplicada: '+hex);}
  else{adicionarCor(hex,'COR');toast('✔ Nova cor adicionada: '+hex);}
  fecharEspectro();
}
function aplicarEspectroNova(){
  const rgb=hsvToRgb(espHue,espSat,espVal);const hex=rgbToHex(rgb.r,rgb.g,rgb.b).toUpperCase();
  adicionarCor(hex,'COR');toast('✔ Nova cor adicionada: '+hex);
  fecharEspectro();
}

/* Keep for backward compat */
function aplicarCorCapturada(hex){
  const rgb=hexToRgb(hex);const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
  espHue=hsv.h;espSat=hsv.s;espVal=hsv.v;espUpdateUI();
  toggleEspectro();
}

"""
            content = content[:eye_idx] + spectrum_js + content[func_end:]
            print("Replaced eyedropper JS with spectrum picker JS")

# ═══ 4. Remove eyedropOverlay from P1 canvas ═══
overlay_idx = content.find('<div id="eyedropOverlay" onclick="eyedropCapturar(event)"></div>')
print(f"\neyedropOverlay HTML at: {overlay_idx}")
if overlay_idx > 0:
    content = content[:overlay_idx] + content[overlay_idx + len('<div id="eyedropOverlay" onclick="eyedropCapturar(event)"></div>'):]
    print("Removed eyedropOverlay from P1 canvas")

# ═══ 5. Remove edPreview ═══
edp_idx = content.find('<div id="edPreview"></div>')
print(f"edPreview at: {edp_idx}")
if edp_idx > 0:
    content = content[:edp_idx] + content[edp_idx + len('<div id="edPreview"></div>'):]
    print("Removed edPreview")

# ═══ 6. Add spectrum picker HTML panel ═══
# Insert before <div id="pw">
pw_idx = content.find('<div id="pw">')
toast_idx = content.find('<div id="toast"></div>')
print(f"\ntoast at: {toast_idx}, pw at: {pw_idx}")

# Insert spectrum panel HTML between toast and pw
spectrum_html = """
<div id="espectroPanel">
<div class="espectro-card">
<div class="espectro-head">
<h3>🎨 Espectro de Cor</h3>
<button onclick="fecharEspectro()">✕</button>
</div>
<div class="espectro-body">
<div class="espectro-sv" id="espSV" onmousedown="espSVDown(event)">
<div class="espectro-sv-white" id="espSVWhite"></div>
<div class="espectro-sv-black" id="espSVBlack"></div>
<div class="espectro-sv-marker" id="espSVMarker"></div>
</div>
<div class="espectro-hue" id="espHue" onmousedown="espHueDown(event)">
<div class="espectro-hue-marker" id="espHueMarker"></div>
</div>
<div class="espectro-preview">
<div class="espectro-swatch" id="espSwatch"></div>
<div class="espectro-info">
<div class="espectro-hex" id="espHex">#3B82F6</div>
<div class="espectro-rgb" id="espRGB">RGB(59, 130, 246)</div>
</div>
</div>
<div class="espectro-apply">
<button class="esp-cancel" onclick="fecharEspectro()">Cancelar</button>
<button class="esp-apply" onclick="aplicarEspectro()">✔ Aplicar Cor</button>
<button class="esp-new" onclick="aplicarEspectroNova()">+ Nova Cor</button>
</div>
</div>
</div>
</div>

"""

if toast_idx > 0 and pw_idx > 0:
    content = content[:toast_idx + len('<div id="toast"></div>')] + spectrum_html + content[pw_idx:]
    print("Added spectrum panel HTML")

# ═══ 7. Replace "Gotas" button with "Espectro" ═══
gotas_idx = content.find('<button class="ed-btn" id="edBtn" onclick="toggleEyedropper()">')
print(f"\nGotas button at: {gotas_idx}")
if gotas_idx > 0:
    # Find end of button
    btn_end = content.find('</button>', gotas_idx) + len('</button>')
    content = content[:gotas_idx] + '<button class="ed-btn" id="edBtn" onclick="toggleEspectro()" style="font-size:7px;padding:2px 8px;border-radius:6px">🎨 Espectro</button>' + content[btn_end:]
    print("Replaced Gotas button with Espectro")

# ═══ 8. Remove eyedropper CSS ═══
# Remove #eyedropOverlay CSS
css_eye_start = content.find('#eyedropOverlay{position:absolute;inset:0;z-index:300;pointer-events:none;cursor:crosshair;background:transparent}')
print(f"\neyedropOverlay CSS at: {css_eye_start}")
if css_eye_start > 0:
    # Find end of this CSS block (up to the next CSS property or closing brace)
    # This block spans 3 lines
    css_end = content.find('#edPreview{display:none;position:fixed;z-index:99999;', css_eye_start)
    if css_end > 0:
        # Find end of edPreview CSS block too
        edp_css_end = content.find('\n', content.find('}', css_end))
        old_css = content[css_eye_start:edp_css_end]
        content = content[:css_eye_start] + content[edp_css_end:]
        print(f"Removed eyedropper CSS ({len(old_css)} chars)")

# ═══ 9. Remove pulse-ed animation ═══
pulse_idx = content.find('@keyframes pulse-ed{')
if pulse_idx > 0:
    pulse_end = content.find('}', pulse_idx) + 1
    pulse_line_end = content.find('\n', pulse_end)
    content = content[:pulse_idx] + content[pulse_line_end:]
    print("Removed pulse-ed animation")

# ═══ 10. Update ed-btn.ativo CSS (no longer needed for eyedropper) ═══
ativo_idx = content.find('.ed-btn.ativo{background:var(--ro);border-color:var(--ro)')
if ativo_idx > 0:
    ativo_end = content.find('\n', ativo_idx)
    content = content[:ativo_idx] + content[ativo_end:]
    print("Removed .ed-btn.ativo CSS")

# ═══ 11. Add spectrum picker CSS ═══
# Insert before @media print
media_print_idx = content.find('@media print{\n@page')
print(f"\n@media print at: {media_print_idx}")

spectrum_css = """/* ═══ ESPECTRO DE COR ═══ */
#espectroPanel{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10060;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
#espectroPanel.open{display:flex}
.espectro-card{background:#fff;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5);overflow:hidden;width:min(420px,92vw)}
.espectro-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#F8FAFC;border-bottom:1px solid #E5E7EB}
.espectro-head h3{font-size:14px;margin:0;color:#111827}
.espectro-head button{border:none;background:none;cursor:pointer;font-size:13px;color:#6B7280;font-family:inherit}
.espectro-body{padding:18px}
.espectro-sv{position:relative;width:100%;height:220px;border-radius:12px;cursor:crosshair;overflow:hidden;margin-bottom:14px}
.espectro-sv-white{position:absolute;inset:0;background:linear-gradient(to right,#fff,hsl(0,100%,50%))}
.espectro-sv-black{position:absolute;inset:0;background:linear-gradient(to top,#000,transparent)}
.espectro-sv-marker{position:absolute;width:16px;height:16px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 2px 6px rgba(0,0,0,.4);transform:translate(-50%,-50%);pointer-events:none;z-index:5}
.espectro-hue{position:relative;width:100%;height:28px;border-radius:10px;cursor:pointer;background:linear-gradient(to right,#ff0000,#ff8800,#ffff00,#00ff00,#00ffff,#0000ff,#8800ff,#ff0088,#ff0000);margin-bottom:14px}
.espectro-hue-marker{position:absolute;top:-2px;width:8px;height:32px;border:2px solid #fff;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.2),0 2px 6px rgba(0,0,0,.3);transform:translateX(-50%);pointer-events:none;z-index:5}
.espectro-preview{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.espectro-swatch{width:48px;height:48px;border-radius:12px;border:2px solid #E5E7EB;flex-shrink:0}
.espectro-info{flex:1;display:flex;flex-direction:column;gap:4px}
.espectro-hex{font-size:18px;font-weight:900;color:#111827;font-family:monospace;letter-spacing:1px}
.espectro-rgb{font-size:11px;color:#6B7280}
.espectro-apply{display:flex;gap:8px}
.espectro-apply button{border:none;border-radius:12px;padding:10px 18px;font-weight:900;cursor:pointer;font-family:inherit;font-size:12px;transition:all .15s}
.espectro-apply .esp-cancel{background:#E5E7EB;color:#374151}
.espectro-apply .esp-cancel:hover{background:#D1D5DB}
.espectro-apply .esp-apply{background:#2563EB;color:#fff}
.espectro-apply .esp-apply:hover{background:#1D4ED8}
.espectro-apply .esp-new{background:#10B981;color:#fff}
.espectro-apply .esp-new:hover{background:#059669}
@media print{#espectroPanel{display:none!important}}

"""

if media_print_idx > 0:
    content = content[:media_print_idx] + spectrum_css + content[media_print_idx:]
    print("Added spectrum CSS")

# ═══ 12. Update @media print to hide espectroPanel ═══
# Already added in spectrum CSS above, but also need to hide it in the general print hide
old_print_hide = """#sidebar,#sidebar-toggle,#cropModal,#toast,.arr-draw-hint,#arrowPreview,#richBar,#quickAddBar,.shape-tb{display:none!important}"""
new_print_hide = """#sidebar,#sidebar-toggle,#cropModal,#toast,.arr-draw-hint,#arrowPreview,#richBar,#quickAddBar,.shape-tb,#espectroPanel{display:none!important}"""
content = content.replace(old_print_hide, new_print_hide)

# ═══ 13. Also remove ed-btn from the print layer hide list ═══
# It's currently: "...logo-tb,.lh,.lh-rot,.cor-painel,.btn-add-cor,.cor-rect input[type="color"],.canvas-tb,.text-tb,.arr-tb,.shape-tb,.layers-panel,.canvas-add-img,.canvas-ph,.lyr-h,.lyr-rot,.tl-resize,.tl-rot,.arr-h,.arr-rot,.arr-ep,.del-btn,.ed-btn,#eyedropOverlay,.sep-toolbar{display:none!important}"
# Remove .ed-btn and #eyedropOverlay
content = content.replace('.ed-btn,#eyedropOverlay,.sep-toolbar', ',.sep-toolbar')

# ═══ 14. Remove eyedropOverlay from v4-preview-clean CSS ═══  
content = content.replace('#eyedropOverlay,', '')

# ═══ FINAL ═══
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nFile saved, size: {len(content)} chars")
