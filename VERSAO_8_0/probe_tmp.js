const {JSDOM}=require('jsdom'),fs=require('fs');const {BASE}=require('./tests/_base');
(async()=>{
const oc=fs.readFileSync(BASE+'/criador_ficha_tecnica/index.html','utf-8');
const err=[];
const od=new JSDOM(oc,{url:'http://localhost:4800/criador_ficha_tecnica/',runScripts:'dangerously',pretendToBeVisual:true,
 beforeParse(w){w.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.print=()=>{};w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>(p==='canvas'?this:()=>{}),set:()=>true})};w.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,AAAA';w.addEventListener('error',e=>err.push(e.message));}});
const w=od.window; await new Promise(r=>setTimeout(r,1500));
const q=s=>w.document.querySelectorAll(s).length;
console.log('erros ao carregar:',err);
w.document.getElementById('dc_nome').textContent='CLIENTE ANTIGO';
try{ w.eval("v7AdicionarPaginaComUndo('normal')"); }catch(e){ console.log('adicionar p2 falhou:',e.message); }
try{ w.eval("v7AdicionarPaginaComUndo('branca')"); }catch(e){ console.log('adicionar branca falhou:',e.message); }
console.log('paginas no array:',w.eval('paginas.length'));
console.log('folhas no DOM:',q('#pw .folha'),'+ brancas:',q('#pw .folha-branca'));
w.eval('limparParaNovaFicha(7)');
await new Promise(r=>setTimeout(r,200));
console.log('DEPOIS -> paginas:',w.eval('paginas.length'),'| totalPaginas:',w.eval('totalPaginas'));
console.log('         folhas:',q('#pw .folha'),'| brancas:',q('#pw .folha-branca'),'| labels:',q('#pw .page-label'));
console.log('         nav sidebar:',q('#extraPagesNav .sb-page-group'));
console.log('         inputs canvasInput_:',q('input[id^="canvasInput_"]'));
// quick fill
console.log('---- preenchimento rapido ----');
w.eval('abrirPreenchimentoRapido()');
['v4qCliente','v4qDoc','v4qTel','v4qVendedor','v4qEnd','v4qCidade','v4qCep','v4qData','v4qTecido','v4qPrevisao','v4qNum','v4qEntrada'].forEach(id=>{
  if(!w.document.getElementById(id))console.log('  FALTA',id);
});
console.log('  med inputs:',q('#v4QuickModal input[data-med]'),'| cores linhas:',q('#v4QuickCores .v4-cor-row'));
w.eval("document.getElementById('v4qDoc').value='12.345.678/0001-99'");
w.eval("document.getElementById('v4qEnd').value='Rua A, 10'");
w.eval("document.getElementById('v4qCidade').value='Goiania - GO'");
w.eval("document.getElementById('v4qCep').value='74000-000'");
w.eval("document.querySelector('#v4QuickCores [data-cor-nome]').value='Azul'");
w.eval("document.querySelector('#v4QuickCores [data-cor-hex]').value='#123456'");
w.eval("var m=document.querySelectorAll('#v4QuickModal input[data-med=\"fem\"]');m[0].value='43';m[1].value='55';");
w.eval('aplicarPreenchimentoRapido()');
console.log('  dc_doc:',JSON.stringify(w.document.getElementById('dc_doc').textContent));
console.log('  dc_end:',JSON.stringify(w.document.getElementById('dc_end').textContent));
console.log('  dc_cidade:',JSON.stringify(w.document.getElementById('dc_cidade').textContent));
console.log('  dc_cep:',JSON.stringify(w.document.getElementById('dc_cep').textContent));
console.log('  cores na ficha:',q('#coresList .cor-item'),'| primeira:',(w.document.getElementById('chi_1')||{}).value,(w.document.getElementById('cni_1')||{}).value);
const med=w.document.querySelectorAll('#folha1 .med-bloco.fem .med-inp');
console.log('  medidas fem [0],[1]:',med[0].value,med[1].value);
console.log('erros finais:',err);
})();
