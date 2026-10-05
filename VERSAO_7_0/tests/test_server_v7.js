'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer, HEALTH_PATH, ROOT, isVooaltoAlreadyRunning, resolveRequestPath } = require('../ATUALIZACAO_V7/server');

function request(port, method, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: requestPath, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  assert.equal(resolveRequestPath('/index.html').filePath.endsWith('/index.html'), true);
  assert.equal(resolveRequestPath('/%00').error, 400);
  assert.equal(resolveRequestPath('/%ZZ').error, 400);
  const traversal = resolveRequestPath('/../../etc/passwd');
  assert.equal(traversal.error, undefined);
  assert.equal(require('node:path').relative(ROOT, traversal.filePath).startsWith('..'), false);

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;

  try {
    assert.equal(await isVooaltoAlreadyRunning(port), true, 'server health route confirms the running V7 instance');
    const health = await request(port, 'GET', HEALTH_PATH);
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { app: 'vooalto-v7', version: '7.1.0' });
    assert.equal(health.headers['cache-control'], 'no-store');

    const localhostHome = await request(port, 'GET', '/', { Host: `localhost:${port}` });
    assert.equal(localhostHome.status, 200, 'the canonical PWA hostname is allowed');

    const home = await request(port, 'GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /text\/html/);
    assert.match(home.body, /Vooalto V7/);
    assert.equal(home.headers['x-content-type-options'], 'nosniff');

    const manifest = await request(port, 'GET', '/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers['content-type'], /application\/manifest\+json/);

    const module = await request(port, 'GET', '/principal_dashboard/');
    assert.equal(module.status, 200);
    assert.match(module.body, /Catalogação/);

    const missing = await request(port, 'GET', '/missing-file.html');
    assert.equal(missing.status, 404);

    const badPath = await request(port, 'GET', '/%00');
    assert.equal(badPath.status, 400);

    const rebindingHost = await request(port, 'GET', '/', { Host: 'attacker.example' });
    assert.equal(rebindingHost.status, 403);

    const disallowedMethod = await request(port, 'POST', '/');
    assert.equal(disallowedMethod.status, 405);
    assert.equal(disallowedMethod.headers.allow, 'GET, HEAD');

    const head = await request(port, 'HEAD', '/');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');

    console.log('===== SERVIDOR V7: verificações OK =====');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
