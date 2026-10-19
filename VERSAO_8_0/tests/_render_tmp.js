const { JSDOM } = require('jsdom'); const fs=require('fs'); const {BASE}=require('./_base');
(async()=>{
  const d=new JSDOM(fs.readFileSync(BASE+'/criador_ficha_tecnica/index.html','utf-8'),{url:'http://localhost:4800/criador_ficha_tecnica/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.print=()=>{};w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=function(){return new Proxy({},{get:(t,p)=>(p==='canvas'?this:()=>{}),set:()=>true});};}});
  await new Promise(r=>setTimeout(r,1500));
  const doc=d.window.document;
  console.log('--- SECOES DA SIDEBAR ---');
  doc.querySelectorAll('#sidebar .sb-section-title').forEach(e=>console.log('  •',e.textContent.trim()));
  console.log('--- RODAPE (botoes, em ordem) ---');
  doc.querySelectorAll('.sb-footer .sb-footer-btn').forEach(b=>console.log('  •',b.textContent.replace(/\s+/g,' ').trim()));
  console.log('--- lista Minhas fichas ---');
  console.log('  ', doc.getElementById('v8FichasList').textContent.replace(/\s+/g,' ').trim());
})();
