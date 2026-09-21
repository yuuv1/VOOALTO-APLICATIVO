const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4700;
const HOST = '0.0.0.0';

process.on('uncaughtException', err => {
  console.error('\n[ERRO FATAL] ' + err.message);
  if (err && err.code === 'EADDRINUSE') {
    console.error('A porta ' + PORT + ' ja esta em uso. Feche o outro Vooalto V7 antes de rodar.');
  }
  console.error('\nPressione Ctrl+C ou feche esta janela.');
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([.][.][/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n[ERRO] Porta ' + PORT + ' ja esta em uso.');
    console.error('O Vooalto V7 provavelmente ja esta rodando em http://localhost:' + PORT);
    console.error('Feche a outra instancia e tente novamente.\n');
  } else {
    console.error('\n[ERRO ao iniciar o servidor] ' + err.message + '\n');
  }
});

server.listen(PORT, HOST, () => {
  console.log('===================================================');
  console.log('  Vooalto V7 - servidor local no ar');
  console.log('  URL: http://localhost:' + PORT);
  console.log('  Para parar, feche esta janela ou pressione Ctrl+C');
  console.log('===================================================');
});
