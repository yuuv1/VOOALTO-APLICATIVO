'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { BASE } = require('./_base');

const SRC = path.join(__dirname, '..', 'ATUALIZACAO_V7');
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.webmanifest'), 'utf8'));

async function testInstallIdentity() {
  assert.equal(manifest.id, './', 'PWA id stays tied to its original start URL');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  const identity = new URL(manifest.id, 'http://localhost:4700/manifest.webmanifest');
  const start = new URL(manifest.start_url, 'http://localhost:4700/');
  assert.equal(identity.href, start.href, 'explicit id must preserve the existing localhost PWA identity');

  const shell = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  assert.match(shell, /beforeinstallprompt/);
  assert.match(shell, /appinstalled/);
  assert.match(shell, /display-mode:\s*standalone/);

  const launcher = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');
  assert.match(launcher, /url\.dll,FileProtocolHandler/);
  assert.doesNotMatch(launcher, /--app=/, 'BAT launcher must not create a temporary browser app window');
  const bat = fs.readFileSync(path.join(SRC, 'instalar_e_abrir_V7.bat'), 'utf8');
  assert.match(bat, /server\.js" --open/);
  assert.match(bat, /server\.py" --open/);
  assert.match(bat, /sys\.version_info\[1\] >= 10/, 'Python fallback requires a supported runtime');
  assert.doesNotMatch(bat, /call :open_browser|--app=/, 'browser opens only after the server is ready');

  const worker = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  assert.match(worker, /CACHE_PREFIX = 'vooalto-v7-'/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(worker, /url\.pathname === '\/__vooalto_health'/);
  assert.doesNotMatch(worker, /for \(const k of keys\) if \(k !== CACHE\) await caches\.delete\(k\)/);
}

async function testCacheCleanupIsScoped() {
  const html = fs.readFileSync(path.join(SRC, 'limpar_cache.html'), 'utf8');
  const caches = new Map([
    ['vooalto-v7-old', true],
    ['another-app-cache', true]
  ]);
  const removedRegistrations = [];
  const registrations = [
    { scope: 'http://localhost:4700/', unregister: async () => { removedRegistrations.push('vooalto'); return true; } },
    { scope: 'http://localhost:4700/other-app/', unregister: async () => { removedRegistrations.push('other'); return true; } }
  ];
  const dom = new JSDOM(html, {
    url: 'http://localhost:4700/limpar_cache.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'caches', { configurable: true, value: {
        keys: async () => [...caches.keys()],
        delete: async key => caches.delete(key)
      } });
      Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: {
        getRegistrations: async () => registrations
      } });
    }
  });
  try {
    await dom.window.eval('limparCache()');
    assert.deepEqual([...caches.keys()], ['another-app-cache']);
    assert.deepEqual(removedRegistrations, ['vooalto']);
    assert.match(dom.window.document.getElementById('log').textContent, /dados.*NAO foram tocados/i);
  } finally {
    dom.window.close();
  }
}

async function testFullResetIncludesLegacyDataAndPreservesOtherApps() {
  const html = fs.readFileSync(path.join(SRC, 'zerar_dados.html'), 'utf8');
  const storage = new Map([
    ['vooalto_main_catalog_v2', '{}'],
    ['vooalto_orcamento_autosave_v7', '{}'],
    ['va3_dados', '{}'],
    ['va4_ficha_counter', '7'],
    ['v4_text_toolbar_pos', '{}'],
    ['v5_orcamento_toolbar_pos', '{}'],
    ['unrelated_app_data', 'keep']
  ]);
  const databases = new Set(['vooalto_pdf_store_v2', 'vooalto_ficha_rascunhos_db_v4']);
  const caches = new Map([['vooalto-v7-current', true], ['other-cache', true]]);
  const removedRegistrations = [];
  const registrations = [
    { scope: 'http://localhost:4700/', unregister: async () => { removedRegistrations.push('vooalto'); return true; } },
    { scope: 'http://localhost:4700/other-app/', unregister: async () => { removedRegistrations.push('other'); return true; } }
  ];
  const fakeLocalStorage = {
    get length() { return storage.size; },
    key(index) { return [...storage.keys()][index] || null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(String(key), String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const fakeIndexedDB = {
    databases: async () => [...databases].map(name => ({ name })),
    deleteDatabase(name) {
      const request = {};
      setTimeout(() => {
        databases.delete(name);
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
  const dom = new JSDOM(html, {
    url: 'http://localhost:4700/zerar_dados.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: fakeLocalStorage });
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: fakeIndexedDB });
      Object.defineProperty(window, 'caches', { configurable: true, value: {
        keys: async () => [...caches.keys()],
        delete: async key => caches.delete(key)
      } });
      Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: {
        getRegistrations: async () => registrations
      } });
      window.confirm = () => true;
    }
  });
  try {
    await dom.window.eval('zerar(1)');
    await dom.window.eval('zerar(2)');
    assert.deepEqual([...storage.keys()], ['unrelated_app_data']);
    assert.deepEqual([...databases], []);
    assert.deepEqual([...caches.keys()], ['other-cache']);
    assert.deepEqual(removedRegistrations, ['vooalto']);
    assert.match(dom.window.document.getElementById('log').textContent, /DADOS DO VOOALTO APAGADOS/i);
  } finally {
    dom.window.close();
  }
}

(async () => {
  await testInstallIdentity();
  await testCacheCleanupIsScoped();
  await testFullResetIncludesLegacyDataAndPreservesOtherApps();
  console.log('===== PWA / RESET V7: 3 grupos de verificações OK =====');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
