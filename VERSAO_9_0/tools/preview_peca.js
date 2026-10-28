/* dev: monta um SVG da peça para inspeção visual (não faz parte do app) */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'ATUALIZACAO_V9', 'mockup');
const g = {};
['peca.js', 'peca_render.js'].forEach(f => new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(g));
const lado = process.argv[2] || 'frente';
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const cores = Object.assign({}, g.Peca.CORES, extra.cores || {});
const svg = g.PecaRender.svg(Object.assign({ lado, cores }, extra), { id: 'p' });
fs.writeFileSync('/tmp/peca_' + lado + '.svg', svg);
console.log('ok /tmp/peca_' + lado + '.svg');
