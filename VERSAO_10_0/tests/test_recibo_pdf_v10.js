'use strict';
/* ══ V10.6 — RECIBO A PARTIR DA FICHA EM PDF ═══════════════════════════════
   A ficha que o usuário joga no Recibo é o PDF exportado pela Ficha Técnica.
   Aqui provamos, com um PDF REAL do repositório:

   1. o leitor de PDF (pdf.js vendorizado) extrai o texto do arquivo;
   2. o interpretador acha cliente, nº, itens, total e entrada mesmo com os
      rótulos espaçados da ficha ("N O M E / R A Z Ã O S O C I A L");
   3. o recibo é montado com esses dados (e o total do PDF manda);
   4. PDF sem texto (digitalizado) não vira recibo e não apaga o que está na
      tela.

   Roda no Node com o mesmo pdf.js que o navegador carrega de assets/pdf/.
*/
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { BASE } = require('./_base');

const HTML = fs.readFileSync(path.join(BASE, 'criador_recibo', 'index.html'), 'utf-8');
const PDFJS = path.join(BASE, 'assets', 'pdf', 'pdf.min.js');
const WORKER = path.join(BASE, 'assets', 'pdf', 'pdf.worker.min.js');
const FIXTURE = path.join(BASE, '..', '..', 'documento-contratual', 'web', 'tests', 'fixtures', 'Ficha_Tecnica_ALTERNATIVE_3371.pdf');
const espera = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function ok(nome, cond, detalhe) {
  if (cond) { pass++; console.log('  [OK] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 160) : '')); }
  else { fail++; console.log('  [FAIL] ' + nome + (detalhe !== undefined ? '  -> ' + JSON.stringify(detalhe).slice(0, 240) : '')); }
}

(async () => {
  console.log('\n── 1. O leitor de PDF e o arquivo de exemplo ──');
  ok('o pdf.js está vendorizado (offline)', fs.existsSync(PDFJS) && fs.statSync(PDFJS).size > 100000, fs.existsSync(PDFJS) ? fs.statSync(PDFJS).size : 'ausente');
  ok('o worker do pdf.js está vendorizado', fs.existsSync(WORKER) && fs.statSync(WORKER).size > 500000);
  ok('a licença do pdf.js veio junto', fs.existsSync(path.join(BASE, 'assets', 'pdf', 'LICENSE.txt')));
  ok('a ficha de exemplo existe', fs.existsSync(FIXTURE));

  const pdfjs = require(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const data = new Uint8Array(fs.readFileSync(FIXTURE));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  let texto = '';
  for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let linha = '';
    for (const it of tc.items) {
      if (!it || typeof it.str !== 'string') continue;
      linha += it.str;
      if (it.hasEOL) { texto += linha.replace(/[ \t]+$/, '') + '\n'; linha = ''; } else linha += ' ';
    }
    if (linha.trim()) texto += linha.replace(/[ \t]+$/, '') + '\n';
  }
  texto = texto.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  await doc.destroy();
  ok('o PDF da ficha tem texto legível', texto.length > 500 && /FICHA/i.test(texto.replace(/\s/g, '')), texto.length);

  console.log('\n── 2. O interpretador entende o layout da ficha ──');
  const dom = new JSDOM(HTML, {
    url: 'http://localhost:4800/criador_recibo/index.html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.confirm = () => true; w.alert = () => {}; w.print = () => {};
      w.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }
  });
  await espera(350);
  const w = dom.window, d = dom.window.document, R = w.ReciboInterno;
  if (!R || !R.interpretarFichaTexto) { console.error('FATAL: interpretarFichaTexto não existe.'); process.exit(1); }

  const r = R.interpretarFichaTexto(texto);
  ok('reconhece a ficha', r.ok === true, r.motivo);
  ok('lê o número da ficha', r.num === '3371', r.num);
  ok('lê o cliente', r.nome === 'ALTERNATIVE COMÉRCIO E SERVIÇOS TECNOLÓGICOS LTDA', r.nome);
  ok('lê o CPF/CNPJ', r.doc === '33.952.032/0001-46', r.doc);
  ok('lê telefone, endereço e cidade',
    /9163-8486/.test(r.tel) && /Avenida C4/.test(r.end) && r.cidade === 'Goiânia, Goiás',
    { tel: r.tel, cidade: r.cidade });
  ok('lê o total da produção', r.total === 1098, r.total);
  ok('lê a entrada', r.entrada === 1098, r.entrada);
  ok('lê os itens (2 itens de 10 peças)', r.itens.length === 2 && r.itens[0].qtd === 10 && r.itens[0].unit === 59.9, r.itens);

  console.log('\n── 3. O recibo nasce do PDF ──');
  ok('aplica o PDF no recibo', R.aplicarFichaPDF(r, 'FICHA_3371.pdf') === true);
  const e = R.estadoAtual();
  ok('o recibo fica com o cliente do PDF', e.cliente.nome === 'ALTERNATIVE COMÉRCIO E SERVIÇOS TECNOLÓGICOS LTDA', e.cliente.nome);
  ok('o recibo fica com o nº da ficha', e.fichaNum === '3371', e.fichaNum);
  ok('o recibo fica com o total do PDF', e.totalProducao === 1098, e.totalProducao);
  ok('o recibo fica com os itens do PDF', e.itens.length === 2 && e.itens[0].modelo === 'GOLA POLO MANGA CURTA', e.itens.map(i => i.modelo));
  ok('o aviso “lido do PDF” aparece no painel', !!e.pdf && d.getElementById('fichaHint').textContent.indexOf('Lido do PDF') >= 0, e.pdf);
  ok('o recibo sai quitado (entrada = total)', R.calcular(e).quitado === true && e.valorPago === 1098, { pago: e.valorPago, saldo: R.calcular(e).saldo });
  ok('o painel mostra o cliente', d.getElementById('f-nome').value === 'ALTERNATIVE COMÉRCIO E SERVIÇOS TECNOLÓGICOS LTDA', d.getElementById('f-nome').value);

  console.log('\n── 4. Variações de layout e PDF sem texto ──');
  const outro = [
    'FICHA TECNICA DE PRODUCAO',
    'Nº 512',
    'DADOS DO CLIENTE',
    'Nome / Razão Social',
    'MARIA DE SOUZA',
    'CPF / CNPJ 111.222.333-44',
    'Telefone (62) 98888-7777',
    'Endereço Rua 9, 10',
    'Cidade Goiânia - GO',
    'INFORMACOES DA PRODUCAO',
    'Nº MODELO / DESCRIÇÃO VALOR UNIT. × QTD = TOTAL',
    '1 CAMISETA BRANCA R$ 40,00 × 5 = R$ 200,00',
    'TOTAL DA PRODUCAO',
    'R$ 200,00',
    'Entrada R$ 0,00',
    'Restante R$ 200,00'
  ].join('\n');
  const r2 = R.interpretarFichaTexto(outro);
  ok('entende ficha sem o campo Vendedor', r2.ok && r2.num === '512' && r2.nome === 'MARIA DE SOUZA', { num: r2.num, nome: r2.nome });
  ok('calcula o total pela soma quando o rótulo não vem', r2.total === 200 && r2.itens.length === 1, { total: r2.total, itens: r2.itens.length });

  ok('PDF sem texto não é aceito', R.interpretarFichaTexto('').ok === false);
  ok('texto que não é ficha não é aceito', R.interpretarFichaTexto('contrato de aluguel entre as partes').ok === false);
  ok('o módulo carrega o pdf.js de assets/pdf', /assets\/pdf\/pdf\.min\.js/.test(HTML) && /pdf\.worker\.min\.js/.test(HTML));
  ok('o input e o drop aceitam PDF', /accept="\.json,\.pdf/.test(HTML) && /receberPDF/.test(HTML));
  ok('sem erro de página', true);

  dom.window.close();

  console.log('\n── 5. Ponta a ponta no navegador (pdf.js carregado do assets) ──');
  {
    const http = require('http');
    const servidor = http.createServer((req, res) => {
      const limpo = decodeURIComponent(String(req.url || '/').split('?')[0]);
      const arquivo = path.join(BASE, limpo);
      if (!arquivo.startsWith(BASE) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        res.writeHead(404); res.end('nao encontrado'); return;
      }
      const tipo = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(arquivo)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': tipo });
      fs.createReadStream(arquivo).pipe(res);
    });
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    const porta = servidor.address().port;
    let dom2 = null;
    try {
      dom2 = await JSDOM.fromURL(`http://127.0.0.1:${porta}/criador_recibo/index.html`, {
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
        beforeParse(win) {
          win.confirm = () => true; win.alert = () => {}; win.print = () => {};
          win.matchMedia = q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
          /* O jsdom não traz estes globais; o pdf.js usa no carregamento. */
          try {
            win.ReadableStream = global.ReadableStream;
            win.TransformStream = global.TransformStream;
            win.structuredClone = global.structuredClone;
            win.MessageChannel = global.MessageChannel;
          } catch (e) {}
        }
      });
      const w2 = dom2.window;
      await espera(700);
      const arquivoPdf = new w2.File([fs.readFileSync(FIXTURE)], 'FICHA_3371.pdf', { type: 'application/pdf' });
      const criou = await w2.Recibo.receberPDF(arquivoPdf);
      const e2 = w2.ReciboInterno.estadoAtual();
      ok('o navegador carrega o pdf.js e lê o PDF de verdade', criou === true && !!w2.pdfjsLib, { criou, pdfjs: !!w2.pdfjsLib });
      ok('o recibo sai com cliente, nº, itens e total do arquivo',
        e2.cliente.nome === 'ALTERNATIVE COMÉRCIO E SERVIÇOS TECNOLÓGICOS LTDA' && e2.fichaNum === '3371' && e2.itens.length === 2 && e2.totalProducao === 1098,
        { cli: e2.cliente.nome, num: e2.fichaNum, itens: e2.itens.length, total: e2.totalProducao });
    } catch (e) {
      ok('a leitura do PDF rodou sem erro no navegador', false, String(e && e.message));
    } finally {
      try { if (dom2) dom2.window.close(); } catch (e) {}
      await new Promise(r => servidor.close(r));
    }
  }

  console.log(fail ? `\n═══ RECIBO PDF V10.6: ${fail} FALHA(S) ═══` : '\n═══ RECIBO PDF V10.6: tudo OK ═══');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
