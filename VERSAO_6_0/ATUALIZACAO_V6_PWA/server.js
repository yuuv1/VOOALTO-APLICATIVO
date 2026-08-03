/* Vooalto V6 — servidor local
   Porta configurável:
     node server.js            -> usa 4085 (padrão)
     node server.js 4090       -> usa 4090
     set PORT=4090 & node server.js
*/
const http=require('http'),fs=require('fs'),path=require('path');

const PADRAO=4085;
function lerPorta(){
  const arg=process.argv[2];
  const bruto=(arg!==undefined&&arg!=='')?arg:process.env.PORT;
  const n=parseInt(bruto,10);
  if(!bruto) return PADRAO;
  if(isNaN(n)||n<1024||n>65535){
    console.log('Porta invalida: "'+bruto+'". Use um numero entre 1024 e 65535. Usando '+PADRAO+'.');
    return PADRAO;
  }
  return n;
}
const PORT=lerPorta(),ROOT=__dirname;

const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.ico':'image/x-icon','.svg':'image/svg+xml'};
function safe(u){let c=decodeURIComponent(u.split('?')[0]);if(c==='/'||c==='')c='/index.html';const f=path.normalize(path.join(ROOT,c));return f.startsWith(ROOT)?f:null}

const server=http.createServer((req,res)=>{const f=safe(req.url);if(!f){res.writeHead(403);return res.end('403')}fs.readFile(f,(e,d)=>{if(e){fs.readFile(path.join(ROOT,'index.html'),(e2,fb)=>{if(e2){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fb)});return}res.writeHead(200,{'Content-Type':types[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':path.extname(f)==='.html'?'no-cache':'public, max-age=3600'});res.end(d)})});

server.on('error',err=>{
  console.log('');
  if(err.code==='EADDRINUSE'){
    console.log('  ATENCAO: a porta '+PORT+' ja esta sendo usada.');
    console.log('');
    console.log('  Isso costuma acontecer quando o Vooalto ja esta aberto em');
    console.log('  outra janela, ou outro programa ocupou a porta.');
    console.log('');
    console.log('  Como resolver:');
    console.log('   1) Feche as outras janelas pretas do Vooalto e tente de novo; ou');
    console.log('   2) No menu, escolha a opcao de trocar a porta (ex.: '+(PORT+1)+').');
  }else if(err.code==='EACCES'){
    console.log('  ATENCAO: sem permissao para usar a porta '+PORT+'.');
    console.log('  Escolha uma porta acima de 1024 no menu (ex.: 4085).');
  }else{
    console.log('  Erro ao iniciar o servidor: '+err.message+' ('+err.code+')');
  }
  console.log('');
  console.log('  Pressione uma tecla para fechar...');
  console.log('');
  /* Sem isso a janela some antes de a pessoa conseguir ler o aviso. */
  try{
    process.stdin.setRawMode&&process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data',()=>process.exit(1));
    setTimeout(()=>process.exit(1),30000);
  }catch(e){ process.exit(1); }
});

/* Escuta em IPv4 e IPv6.
   Ficar preso em '127.0.0.1' fazia o servidor "abrir" mas o navegador nao
   conectar: no Windows atual localhost resolve primeiro para ::1 (IPv6) e a
   conexao era recusada. Sem host, o Node aceita ambos. */
server.listen(PORT,()=>{
  console.log('');
  console.log('  Vooalto V6 rodando!');
  console.log('  Abra no navegador:  http://localhost:'+PORT);
  console.log('');
  console.log('  (mantenha esta janela aberta enquanto usa o sistema)');
  console.log('');
});
