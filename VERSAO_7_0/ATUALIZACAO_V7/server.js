const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4700;
const SHOULD_OPEN = process.argv.includes('--open');

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

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe')
      ];
      for (const exe of candidates) {
        if (exe && fs.existsSync(exe)) {
          const child = spawn(exe, ['--app=' + url], { detached: true, stdio: 'ignore' });
          child.unref();
          return;
        }
      }
      const child = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    // Se nao conseguir abrir automaticamente, o usuario pode acessar pelo link exibido no console.
  }
}

const server = http.createServer((req, res) => {
  let urlPath = '/';
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    urlPath = '/';
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([.][.][/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }
  fs.stat(filePath, (stErr, stat) => {
    if (!stErr && stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.on('error', (err) => {
  const url = 'http://localhost:' + PORT;
  if (err && err.code === 'EADDRINUSE') {
    console.log('Servidor Vooalto V7 ja esta em execucao em ' + url);
    if (SHOULD_OPEN) openBrowser(url);
    process.exit(0);
  }
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});

// Listen sem especificar host aceita conexoes tanto IPv6 (::1 localhost no Windows) quanto IPv4 (127.0.0.1 / 0.0.0.0)
server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('====================================================');
  console.log('  Vooalto V7 ativo em: ' + url);
  console.log('  (Nao feche esta janela enquanto usar o aplicativo)');
  console.log('====================================================');
  if (SHOULD_OPEN) openBrowser(url);
});
