'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');
const html = fs.readFileSync(path.join(BASE,'criador_recibo','index.html'),'utf8');
const downloads=[], impresso=[];
const dom = new JSDOM(html,{
  url:'http://localhost:4800/criador_recibo/index.html',
  runScripts:'dangerously',pretendToBeVisual:true,
  beforeParse(w){
    w.confirm=()=>true;w.alert=()=>{};
    w.print=()=>{impresso.push(w.document.title)};
    w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
    w.URL.createObjectURL=()=> 'blob:recibo-teste';
    w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)};
    w.html2canvas=async()=>({toBlob:cb=>cb(new w.Blob(['png'],{type:'image/png'}))});
  }
});
(async()=>{
  const w=dom.window, R=w.ReciboInterno;
  assert.ok(R&&R.nomeArquivoRecibo);
  await new Promise(resolve=>setTimeout(resolve,100)); // aguarda DOMContentLoaded/iniciar
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  const hoje=pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear();
  const nome='RECIBO - Oficina São João Pinturas - '+hoje;
  w.Recibo.campo('nome','  Oficina / São João: Pinturas?  ');
  w.Recibo.campo('data','2020-01-05'); // a data do pagamento não substitui a do download
  assert.equal(R.nomeArquivoRecibo(),nome);
  assert.equal(R.nomeArquivoRecibo(null,'2026-12-31'),'RECIBO - Oficina São João Pinturas - 31-12-2026');
  assert.equal(R.nomeArquivoRecibo({cliente:{nome:''}},'2026-11-11'),'RECIBO - SEM CLIENTE - 11-11-2026');
  assert.equal(R.nomeArquivoRecibo({cliente:{nome:'X'.repeat(200)}},'2026-11-11').length,
    'RECIBO - '.length+80+' - 11-11-2026'.length);
  assert.equal(w.Recibo.exportarJSON(),true);
  assert.equal(downloads.at(-1),nome+'.json');
  assert.equal(await w.Recibo.exportarPNG(),true);
  assert.equal(downloads.at(-1),nome+'.png');
  const tituloOriginal=w.document.title;
  w.Recibo.imprimir();
  assert.deepEqual(impresso,[nome],'impressão sugere o mesmo nome para PDF');
  assert.equal(w.document.title,nome);
  w.dispatchEvent(new w.Event('afterprint'));
  assert.equal(w.document.title,tituloOriginal,'título original restaurado após imprimir');
  w.print=()=>{throw new Error('diálogo indisponível')};
  w.Recibo.imprimir();
  assert.equal(w.document.title,tituloOriginal,'título original restaurado se a impressão falhar');
  dom.window.close();
  console.log('✓ Nome do recibo em PDF, PNG e JSON: cliente, data local de hoje e título restaurado');
  process.exit(0);
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
