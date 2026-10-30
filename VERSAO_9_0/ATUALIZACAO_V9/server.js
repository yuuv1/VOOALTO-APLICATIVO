'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname);
const HOST = '127.0.0.1';
/* V9.1.2 — identidade em UM lugar (version.json), lida pelos dois servidores.
   Antes o número estava copiado em server.js, server.py e package.json, e o
   health check compara a versão EXATA: quando um deles atrasava, o .bat
   acusava "outra versão do Vooalto na porta" para o próprio app. */
function lerIdentidade() {
  try {
    const dados = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));
    if (dados && typeof dados.app === 'string' && typeof dados.version === 'string') return dados;
  } catch (error) {
    /* fallback silencioso: o servidor precisa subir mesmo sem o arquivo */
  }
  return { app: 'vooalto-v9', version: '0.0.0' };
}
const IDENTIDADE = lerIdentidade();
const APP_ID = IDENTIDADE.app;
const APP_VERSION = IDENTIDADE.version;
const HEALTH_PATH = '/__vooalto_health';
const requestedPort = Number(process.env.PORT);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
  ? requestedPort
  : 4800;
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
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.pdf': 'application/pdf'
};

function sendText(res, statusCode, text, extraHeaders = {}, headOnly = false) {
  const body = Buffer.from(String(text));
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(headOnly ? undefined : body);
}

/** Resolve a URL to a file strictly inside the V8 folder. */
function resolveRequestPath(requestUrl, root = ROOT) {
  let pathname;
  try {
    const parsed = new URL(requestUrl, 'http://localhost');
    pathname = decodeURIComponent(parsed.pathname);
  } catch (error) {
    return { error: 400, message: '400 Bad Request' };
  }

  if (pathname.includes('\0')) return { error: 400, message: '400 Bad Request' };

  const segments = pathname.split(/[\\/]+/).filter(segment => segment && segment !== '.');
  if (segments.some(segment => segment === '..' || segment.includes(':'))) {
    return { error: 403, message: '403 Forbidden' };
  }

  const absoluteRoot = path.resolve(root);
  let filePath = path.resolve(absoluteRoot, ...segments);
  if (filePath !== absoluteRoot && !filePath.startsWith(absoluteRoot + path.sep)) {
    return { error: 403, message: '403 Forbidden' };
  }
  if (pathname.endsWith('/') || filePath === absoluteRoot) {
    filePath = path.join(filePath, 'index.html');
  }
  return { filePath };
}

function isLocalHostHeader(hostHeader) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(String(hostHeader || '').trim());
}

function createServer({ root = ROOT } = {}) {
  const absoluteRoot = path.resolve(root);
  return http.createServer((req, res) => {
    // A loopback-only bind is necessary but not sufficient against DNS rebinding;
    // refuse requests whose Host header is not a local address.
    if (!isLocalHostHeader(req.headers.host)) {
      sendText(res, 403, '403 Forbidden', {}, req.method === 'HEAD');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, '405 Method Not Allowed', { Allow: 'GET, HEAD' }, req.method === 'HEAD');
      return;
    }

    if (req.url === HEALTH_PATH || req.url.startsWith(HEALTH_PATH + '?')) {
      const body = JSON.stringify({ app: APP_ID, version: APP_VERSION });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    const resolved = resolveRequestPath(req.url || '/', absoluteRoot);
    if (resolved.error) {
      sendText(res, resolved.error, resolved.message, {}, req.method === 'HEAD');
      return;
    }

    const sendFile = filePath => {
      fs.readFile(filePath, (error, data) => {
        if (error) {
          if (error.code === 'EACCES' || error.code === 'EPERM') {
            sendText(res, 403, '403 Forbidden', {}, req.method === 'HEAD');
          } else {
            sendText(res, 404, '404 Not Found', {}, req.method === 'HEAD');
          }
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Content-Length': data.length,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'same-origin'
        });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    };

    fs.stat(resolved.filePath, (error, stat) => {
      if (!error && stat.isDirectory()) {
        const indexPath = path.join(resolved.filePath, 'index.html');
        fs.stat(indexPath, (indexError, indexStat) => {
          if (indexError || !indexStat.isFile()) {
            sendText(res, 404, '404 Not Found', {}, req.method === 'HEAD');
            return;
          }
          sendFile(indexPath);
        });
        return;
      }
      if (!error && !stat.isFile()) {
        sendText(res, 404, '404 Not Found', {}, req.method === 'HEAD');
        return;
      }
      sendFile(resolved.filePath);
    });
  });
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === 'win32') {
    // Abre o navegador padrão em uma aba normal. A janela --app da versão anterior
    // não era uma PWA instalada e podia gerar um atalho temporário na barra de tarefas.
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', error => {
      console.warn('Nao foi possivel abrir o navegador automaticamente:', error.message);
      console.log('Abra manualmente: ' + url);
    });
    child.unref();
  } catch (error) {
    console.warn('Nao foi possivel abrir o navegador automaticamente:', error.message);
    console.log('Abra manualmente: ' + url);
  }
}

/** Lê o /__vooalto_health de quem já estiver na porta. null = não é Vooalto. */
function vooaltoHealth(port = PORT) {
  return new Promise(resolve => {
    const request = http.get({ hostname: HOST, port, path: HEALTH_PATH, timeout: 1500 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(response.statusCode === 200 && result && typeof result.app === 'string' ? result : null);
        } catch (error) {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

/** true só quando é ESTA versão do Vooalto (mesmo app e mesma versão). */
async function isVooaltoAlreadyRunning(port = PORT) {
  const health = await vooaltoHealth(port);
  return !!health && health.app === APP_ID && health.version === APP_VERSION;
}

function startServer({ port = PORT, shouldOpen = SHOULD_OPEN } = {}) {
  const server = createServer();
  const url = `http://localhost:${port}/`;

  server.on('error', async error => {
    if (error && error.code === 'EADDRINUSE') {
      if (await isVooaltoAlreadyRunning(port)) {
        console.log('O servidor Vooalto V9 ja esta ativo em ' + url);
        if (shouldOpen) openBrowser(url);
        process.exitCode = 0;
        return;
      }
      const outraVersao = await vooaltoHealth(port);
      if (outraVersao && outraVersao.app.startsWith('vooalto-v')) {
        console.error(`A porta ${port} esta sendo usada por outra versao do Vooalto (${outraVersao.app} ${outraVersao.version}).`);
        console.error('Feche a janela preta do servidor antigo e execute este BAT novamente.');
        process.exitCode = 1;
        return;
      }
      console.error(`A porta ${port} ja esta ocupada por outro processo.`);
      console.error('Feche o outro aplicativo/servidor que usa essa porta e execute este BAT novamente.');
      process.exitCode = 1;
      return;
    }
    console.error('Erro ao iniciar o servidor local:', error && error.message ? error.message : error);
    process.exitCode = 1;
  });

  server.listen(port, HOST, () => {
    console.log('====================================================');
    console.log('  Vooalto V9 ativo em: ' + url);
    console.log('  Este servidor aceita conexoes somente deste computador.');
    console.log('  Minimize esta janela; mantenha-a aberta durante o uso.');
    console.log('====================================================');
    if (shouldOpen) openBrowser(url);
  });
  return server;
}

if (require.main === module) startServer();

module.exports = {
  APP_ID,
  IDENTIDADE,
  APP_VERSION,
  HEALTH_PATH,
  HOST,
  MIME,
  PORT,
  ROOT,
  createServer,
  isLocalHostHeader,
  isVooaltoAlreadyRunning,
  resolveRequestPath,
  vooaltoHealth,
  startServer
};
