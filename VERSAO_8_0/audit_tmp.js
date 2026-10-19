const {JSDOM}=require('jsdom'),fs=require('fs');
const arq=['ATUALIZACAO_V8/index.html','ATUALIZACAO_V8/criador_ficha_tecnica/index.html','ATUALIZACAO_V8/criador_orcamento/index.html'];
for(const f of arq){
  const html=fs.readFileSync(f,'utf-8');
  const d=new JSDOM(html).window.document;
  console.log('\n═══ '+f+' ═══');
  const ids={},dup=[];
  d.querySelectorAll('[id]').forEach(e=>{ids[e.id]=(ids[e.id]||0)+1});
  Object.keys(ids).forEach(k=>{if(ids[k]>1)dup.push(k+' ×'+ids[k])});
  console.log('IDs duplicados:', dup.length?dup:'nenhum');

  const chamadas=new Set();
  d.querySelectorAll('*').forEach(el=>{
    for(const a of [...el.attributes]){
      if(!/^on/.test(a.name))continue;
      const re=/(?:^|[^.\w$'"-])([A-Za-z_$][\w$]*)\s*\(/g; let m;
      while((m=re.exec(a.value)))chamadas.add(m[1]);
    }
  });
  const chamadasJS=new Set();
  {const re=/(?:^|[^.\w$])window\.([A-Za-z_$][\w$]*)\s*\(/g;let m;while((m=re.exec(html)))chamadasJS.add(m[1]);}
  const nativas=/^(if|for|while|return|typeof|function|new|alert|confirm|prompt|parseInt|parseFloat|Number|String|Boolean|Object|Array|JSON|Math|Date|console|event|setTimeout|setInterval|clearTimeout|clearInterval|encodeURIComponent|decodeURIComponent|isNaN|isFinite|Error|RegExp|Map|Set|Promise|requestAnimationFrame)$/;
  const naoDef=n=>{
    if(nativas.test(n))return false;
    const pistas=['function '+n+'(','function '+n+' (','async function '+n+'(',' '+n+'=function',' '+n+' = function',
                  'let '+n+'=','const '+n+'=','var '+n+'=' ,'window.'+n+'=','.'+n+'=function',n+'=(',
                  'window.'+n+' =','let '+n+' =','const '+n+' =','var '+n+' ='];
    if(pistas.some(p=>html.includes(p)))return false;
    // chamada de função declarada como const arrow: `const x=(...)=>{`  ou `x:function`
    if(new RegExp('(^|[\\s;{(,])'+n+'\\s*[:(]','m').test(html))return false;
    return true;
  };
  const nd=[...chamadas].filter(naoDef);
  console.log('handlers citando função não definida:', nd.length?nd:'nenhuma');

  const sym=new Set([...d.querySelectorAll('symbol[id]')].map(s=>s.id));
  const queb=[...new Set([...d.querySelectorAll('use')].map(u=>u.getAttribute('href')))].filter(h=>!sym.has(h.slice(1)));
  console.log('<use> sem símbolo:', queb.length?queb:'nenhum');

  const semId=new Set();
  [...html.matchAll(/\$\(\s*'([A-Za-z][\w-]*)'\s*\)/g)].forEach(m=>{if(!d.getElementById(m[1]))semId.add(m[1])});
  console.log('$(id) para id inexistente no HTML:', semId.size?[...semId].slice(0,15):'nenhum');
}
