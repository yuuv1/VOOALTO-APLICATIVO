import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, Image as NapiImage, ImageData as NapiImageData, Path2D, DOMMatrix } from "@napi-rs/canvas";
import { createWorker as nodeCreateWorker } from "tesseract.js";

// Polyfill DOM Canvas + Image + ImageData for headless Node Skia FFI verification
(globalThis as Record<string, unknown>).Path2D = Path2D;
(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = NapiImageData;

function makeSafeCanvas(w = 16, h = 16) {
  const c = createCanvas(Math.max(1, w), Math.max(1, h));
  const origGetCtx = c.getContext.bind(c);
  (c as unknown as Record<string, unknown>).getContext = (type: "2d") => {
    const ctx = origGetCtx(type);
    if (ctx && !(ctx as unknown as Record<string, boolean>).__wrappedPut) {
      const origPut = ctx.putImageData.bind(ctx);
      (ctx as unknown as Record<string, unknown>).putImageData = (
        img: NapiImageData | { data: Uint8ClampedArray; width: number; height: number },
        dx: number,
        dy: number
      ) => {
        const safeImg =
          img instanceof NapiImageData
            ? img
            : new NapiImageData(
                new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength),
                img.width,
                img.height
              );
        return origPut(safeImg, dx, dy);
      };
      (ctx as unknown as Record<string, boolean>).__wrappedPut = true;
    }
    return ctx;
  };
  return c as unknown as HTMLCanvasElement & {
    toDataURL: (mime?: string, quality?: number) => string;
  };
}

class BrowserImageShim extends NapiImage {
  set src(val: string | Buffer) {
    if (typeof val === "string" && val.startsWith("data:")) {
      const b64 = val.split(",")[1] || "";
      super.src = Buffer.from(b64, "base64");
      queueMicrotask(() => {
        if (typeof this.onload === "function") this.onload();
      });
    } else {
      super.src = val as Buffer;
    }
  }
}

(globalThis as Record<string, unknown>).Image = BrowserImageShim;
(globalThis as Record<string, unknown>).document = {
  createElement(tag: string) {
    if (tag === "canvas") {
      return makeSafeCanvas(16, 16);
    }
    return {};
  },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webDir, "..");

const raf = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
const caf = (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
(globalThis as Record<string, unknown>).requestAnimationFrame = raf;
(globalThis as Record<string, unknown>).cancelAnimationFrame = caf;
(globalThis as Record<string, unknown>).window = {
  ...(typeof globalThis.window === "object" && globalThis.window ? globalThis.window : {}),
  location: {
    protocol: "file:",
    href: "file:///Abrir_Sistema_Vooalto.html",
  },
  atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
  requestAnimationFrame: raf,
  cancelAnimationFrame: caf,
};

// Monkeypatch tesseract.js createWorker in Node environment to load our exact local por.traineddata.gz
const langGzDir = path.join(webDir, "public/ocr");
import * as tessModule from "tesseract.js";
const origCreateWorker = nodeCreateWorker;
void tessModule;

async function main() {
  // Inject pre-warmed worker factory via global hook for Node environment while keeping 100% identical OCR engine & model
  const sdk = await import("../src/sdk.js");
  const { PDFDocument } = await import("pdf-lib");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Patch global fetch to guarantee ZERO Python / network server calls succeed
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes("por.traineddata.gz")) {
      const buf = fs.readFileSync(path.join(langGzDir, "por.traineddata.gz"));
      return new Response(buf, { status: 200 });
    }
    throw new Error(`Offline test blocked external fetch: ${u}`);
  };

  console.log("=== TESTE 1: PROPOSTA DE VENDA ANA.pdf (100% Client-Side SDK) ===");
  const anaBytes = fs.readFileSync(path.join(repoRoot, "PROPOSTA DE VENDA ANA.pdf"));
  const anaFile = new File([anaBytes], "PROPOSTA DE VENDA ANA.pdf", { type: "application/pdf" });

  // Provide Node worker fallback inside browserExtractor via langPath local dir
  (globalThis as Record<string, unknown>).window = {
    location: {
      protocol: "http:",
      href: "http://offline.local/index.html",
    },
    atob: (b64: string) => Buffer.from(b64, "base64").toString("binary"),
  };

  void origCreateWorker;
  const anaRes = await sdk.analyzeUploadedFile(anaFile, false, "", (msg) =>
    console.log("  [ANA]", msg)
  );
  console.log("ANA Result Summary:", {
    metodo: anaRes.metodo,
    itens: anaRes.itens.map((i) => ({
      n: i.numero,
      modelo: i.modelo,
      tecido: i.tecido,
      pers: i.personalizacao,
      qtd: i.quantidade,
      unit: i.valor_unitario,
    })),
    refs: anaRes.imagens_sugeridas.length,
    pagamento: anaRes.pagamento,
  });

  assert.equal(anaRes.itens.length, 3, "Proposta Ana deve ter exatamente 3 itens");
  assert.deepEqual(
    anaRes.itens.map((i) => i.quantidade),
    [9, 45, 18],
    "Quantidades exatas [9, 45, 18]"
  );
  assert.deepEqual(
    anaRes.itens.map((i) => i.valor_unitario),
    ["69.90", "59.90", "54.90"],
    "Preços unitários exatos"
  );

  const anaState = sdk.applyAnalysisToState(sdk.createDefaultState(), anaRes);
  const anaSummary = sdk.computeContractSummary(anaState);
  assert.equal(anaSummary.countDisplay, "72 PEÇAS");
  assert.equal(anaSummary.totalDisplay, "R$ 4.312,80");
  assert.equal(anaSummary.advanceDisplay, "R$ 2.156,40");
  assert.equal(anaSummary.balanceDisplay, "R$ 2.156,40");

  const anaBundle = await sdk.generateContractFiles(anaState, false, false);
  assert.equal(anaBundle.geradoPor, "navegador");
  const outDir = "/tmp/vooalto_e2e_verify";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "ana_client.pdf"),
    Buffer.from(await anaBundle.pdfBlob.arrayBuffer())
  );
  fs.writeFileSync(
    path.join(outDir, "ana_client.docx"),
    Buffer.from(await anaBundle.docxBlob.arrayBuffer())
  );
  const anaPdfDoc = await PDFDocument.load(await anaBundle.pdfBlob.arrayBuffer());
  assert.equal(anaPdfDoc.getPageCount(), 1, "PDF Proposta Ana deve ter estritamente 1 página A4");
  assert.ok(anaBundle.docxBlob.size > 15000, "DOCX Proposta Ana válido");
  console.log("✓ TESTE 1 APROVADO: 72 peças | R$ 4.312,80 | 3 croquis | PDF 1 pág. | DOCX válido!\n");

  console.log("=== TESTE 2: FICHA TÉCNICA DE PRODUÇÃO MPTO Nº 3374 (5 páginas, 100% Client-Side SDK) ===");
  const mptoBytes = fs.readFileSync(
    path.join(repoRoot, "contratos/MPTO_Ministerio_Publico_do_Tocantins/FICHA_TECNICA_3374_MPTO_Original.pdf")
  );
  const mptoFile = new File(
    [mptoBytes],
    "FICHA TÉCNICA DE PRODUÇÃO - Ministério Público do Estado do Tocantins MPTO.pdf",
    { type: "application/pdf" }
  );

  const mptoRes = await sdk.analyzeUploadedFile(mptoFile, false, "", (msg) =>
    console.log("  [MPTO]", msg)
  );
  console.log("MPTO Result Summary:", {
    metodo: mptoRes.metodo,
    cliente: mptoRes.cliente,
    execucao: mptoRes.execucao,
    producao: mptoRes.producao,
    itens: mptoRes.itens.map((i) => ({
      n: i.numero,
      modelo: i.modelo,
      cor: i.cor,
      pers: i.personalizacao,
      grade: i.grade,
      qtd: i.quantidade,
      unit: i.valor_unitario,
    })),
    refs: mptoRes.imagens_sugeridas.map((r) => r.titulo),
  });

  assert.deepEqual(mptoRes.avisos, [], "Ficha MPTO real não deve exigir revisão por divergências");
  assert.equal(mptoRes.itens.length, 5, "Ficha MPTO deve extrair exatamente 5 itens");
  assert.equal(mptoRes.cliente.cpf_cnpj, "01.786.078/0001-46", "CNPJ exato do MPTO");
  assert.equal(mptoRes.cliente.telefone, "(63) 99994-1987", "Telefone de 2 linhas reconstruído");
  assert.deepEqual(
    mptoRes.itens.map((i) => i.cor),
    ["Preto", "Branco", "Azul Marinho", "Preto", "Azul Marinho"],
    "5 cores das pílulas invertidas exatas"
  );
  assert.deepEqual(
    mptoRes.itens.map((i) => i.quantidade),
    [32, 16, 27, 12, 12],
    "Quantidades exatas [32, 16, 27, 12, 12] = 99 peças"
  );
  assert.equal(mptoRes.imagens_sugeridas.length, 5, "5 croquis das camisetas recortados");
  // Proteção contra o bug relatado: inspeciona e mede cada croqui; camisetas inteiras, não a página inteira.
  for (let ri = 0; ri < mptoRes.imagens_sugeridas.length; ri++) {
    const ref = mptoRes.imagens_sugeridas[ri];
    const raw = Buffer.from(ref.data_url.split(",")[1] || "", "base64");
    const img = new NapiImage();
    img.src = raw;
    await img.decode();
    assert.ok(img.width >= 650 && img.height >= 450, `Croqui ${ri + 1} muito pequeno/truncado: ${img.width}x${img.height}`);
    assert.ok(img.width / img.height >= 0.8 && img.width / img.height <= 1.7, `Croqui ${ri + 1} proporção inválida: ${img.width}x${img.height}`);
    const checkCv = makeSafeCanvas(img.width, img.height);
    const checkCtx = checkCv.getContext("2d")!;
    checkCtx.drawImage(img, 0, 0);
    const pix = checkCtx.getImageData(0, 0, img.width, img.height).data;
    const bg = [pix[0], pix[1], pix[2]];
    for (const [region, fromY, toY] of [["cabeçalho da arte", 0.02, 0.16], ["parte de baixo das camisetas", 0.64, 0.86]] as const) {
      let dark = 0, samples = 0;
      for (let y = Math.floor(img.height * fromY); y < img.height * toY; y += 6) {
        for (let x = Math.floor(img.width * 0.05); x < img.width * 0.95; x += 6) {
          const off = (y * img.width + x) * 4;
          if (Math.max(Math.abs(pix[off] - bg[0]), Math.abs(pix[off + 1] - bg[1]), Math.abs(pix[off + 2] - bg[2])) > 35) dark++;
          samples++;
        }
      }
      assert.ok(dark / samples > 0.09, `Croqui ${ri + 1}: ${region} cortada (fração de contraste ${(dark / samples).toFixed(3)})`);
    }
    fs.writeFileSync(path.join(outDir, `mpto_mockup_${ri + 1}.jpg`), raw);
  }

  const mptoState = sdk.createDefaultState();
  mptoState.cliente = {
    nome_razao_social: mptoRes.cliente.nome_razao_social || "",
    cpf_cnpj: mptoRes.cliente.cpf_cnpj || "",
    telefone: mptoRes.cliente.telefone || "",
    email: mptoRes.cliente.email || "",
    endereco: mptoRes.cliente.endereco || "",
    cidade_uf_cep: mptoRes.cliente.cidade_uf_cep || "",
  };
  mptoState.producao = {
    itens: mptoRes.itens,
    prazo_entrega: mptoRes.producao.prazo_entrega || "",
    observacoes: mptoRes.producao.observacoes || "",
    imagens_referencia: mptoRes.imagens_sugeridas,
  };
  mptoState.execucao.local_data = mptoRes.execucao?.local_data || "";

  const mptoSummary = sdk.computeContractSummary(mptoState);
  assert.equal(mptoSummary.countDisplay, "99 PEÇAS");
  assert.equal(mptoSummary.totalDisplay, "R$ 5.540,10");
  assert.equal(mptoSummary.advanceDisplay, "R$ 2.770,05");
  assert.equal(mptoSummary.balanceDisplay, "R$ 2.770,05");

  const mptoBundle = await sdk.generateContractFiles(mptoState, false, false);
  assert.equal(mptoBundle.geradoPor, "navegador");
  fs.writeFileSync(
    path.join(outDir, "mpto_client.pdf"),
    Buffer.from(await mptoBundle.pdfBlob.arrayBuffer())
  );
  fs.writeFileSync(
    path.join(outDir, "mpto_client.docx"),
    Buffer.from(await mptoBundle.docxBlob.arrayBuffer())
  );
  const mptoPdfDoc = await PDFDocument.load(await mptoBundle.pdfBlob.arrayBuffer());
  assert.equal(mptoPdfDoc.getPageCount(), 1, "PDF 5 itens MPTO deve ter estritamente 1 página A4");
  assert.ok(mptoBundle.docxBlob.size > 30000, "DOCX 5 itens MPTO válido com 5 imagens");
  const mptoGenerated = await pdfjs.getDocument({ data: new Uint8Array(await mptoBundle.pdfBlob.arrayBuffer()) }).promise;
  const mptoText = (await (await mptoGenerated.getPage(1)).getTextContent()).items
    .map((it) => "str" in it ? it.str : "").join(" ");
  assert.ok(mptoText.indexOf("GRADE DE TAMANHOS POR MODELO") > mptoText.indexOf("VALOR TOTAL"), "PDF deve mostrar grade em seção independente após total");
  assert.ok(mptoText.indexOf("CROQUIS / IMAGENS") > mptoText.indexOf("GRADE DE TAMANHOS"), "Croquis devem vir após grade separada");
  assert.match(mptoText, /11M.*9G.*5GG/, "Grade MPTO completa no PDF, sem corte horizontal");
  const mptoDocXml = await (await import("jszip")).default.loadAsync(await mptoBundle.docxBlob.arrayBuffer());
  const mptoTables = ((await mptoDocXml.file("word/document.xml")!.async("string")).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []);
  const productionTable = mptoTables.find((x) => x.includes("MODELO / TECIDO / COR / PERSONALIZAÇÃO"));
  const gradeTable = mptoTables.find((x) => x.includes("GRADE / TAMANHOS"));
  assert.ok(productionTable && gradeTable && productionTable !== gradeTable, "Word deve ter quadro de grade separado do quadro de itens");
  assert.ok(!productionTable.includes("GRADE / TAMANHOS") && gradeTable.includes("11M") && gradeTable.includes("5GG"));

  console.log("✓ TESTE 2 APROVADO: 99 peças | R$ 5.540,10 | 5 croquis completos | grade separada no PDF/DOCX!");

  console.log("\n=== TESTE 3: FICHA ALTERNATIVE Nº 3371 (duas páginas com texto posicionado) ===");
  const alternativeBytes = fs.readFileSync(path.join(webDir, "tests/fixtures/Ficha_Tecnica_ALTERNATIVE_3371.pdf"));
  const alternativeRes = await sdk.analyzeUploadedFile(
    new File([alternativeBytes], "Ficha_Tecnica_ALTERNATIVE_3371.pdf", { type: "application/pdf" }),
    false, "", (msg) => console.log("  [ALTERNATIVE]", msg)
  );
  assert.equal(alternativeRes.metodo, "navegador_local");
  assert.equal(alternativeRes.paginas.length, 2);
  assert.equal(alternativeRes.itens.length, 2, "Resumo repetido na página 2 não cria itens duplicados; linha 3 é placeholder");
  assert.deepEqual(alternativeRes.itens.map((it) => it.modelo), ["Camiseta gola polo manga curta", "Camiseta gola redonda manga curta"]);
  assert.deepEqual(alternativeRes.itens.map((it) => it.quantidade), [10, 10]);
  assert.deepEqual(alternativeRes.itens.map((it) => it.valor_unitario), ["59.90", "49.90"]);
  assert.deepEqual(alternativeRes.itens.map((it) => it.cor), ["Preto", "Preto"]);
  assert.deepEqual(alternativeRes.itens.map((it) => it.tecido), ["Malha fria PV", "Malha fria PV"]);
  for (const item of alternativeRes.itens) {
    assert.match(item.grade, /Masc \(6\): 2M · 2G · 1GG · 1un 3G/);
    assert.match(item.grade, /Baby look \(4\): 4PP/);
    assert.match(item.personalizacao, /Silk digital/i);
  }
  assert.equal(alternativeRes.cliente.nome_razao_social, "ALTERNATIVE COMÉRCIO E SERVIÇOS TECNOLÓGICOS LTDA");
  assert.equal(alternativeRes.cliente.cpf_cnpj, "33.952.032/0001-46");
  assert.equal(alternativeRes.cliente.telefone, "(62) 9163-8486");
  assert.equal(alternativeRes.cliente.endereco, "Avenida C4, nº 931, Qd. 49, Lts. 01/14, Salas 701A e 1702A, 17º Pavimento, Edifício Terra Office, Jardim América");
  assert.equal(alternativeRes.cliente.cidade_uf_cep, "Goiânia, Goiás");
  assert.equal(alternativeRes.execucao?.local_data, "Goiânia - GO, 16/10/2026");
  assert.match(alternativeRes.producao.prazo_entrega || "", /30 dias.*3371/);
  assert.deepEqual(alternativeRes.pagamento, { entrada_percentual: 100, saldo_percentual: 0 });
  assert.deepEqual(alternativeRes.avisos, ["A ficha não informa CEP. Confira ou preencha o CEP do cliente antes de enviar."]);
  assert.equal(alternativeRes.imagens_sugeridas.length, 2, "Cada modelo deve conservar seu próprio croqui completo");
  assert.notEqual(alternativeRes.imagens_sugeridas[0].data_url, alternativeRes.imagens_sugeridas[1].data_url, "Polo e gola redonda devem conservar artes distintas");
  for (let i = 0; i < 2; i++) {
    const img = new NapiImage();
    img.src = Buffer.from(alternativeRes.imagens_sugeridas[i].data_url.split(",")[1], "base64");
    await img.decode();
    assert.ok(img.width >= 1300 && img.height >= 1300, `Croqui ALTERNATIVE ${i + 1} truncado: ${img.width}×${img.height}`);
    fs.writeFileSync(path.join(outDir, `alternative_mockup_${i + 1}.jpg`), Buffer.from(alternativeRes.imagens_sugeridas[i].data_url.split(",")[1], "base64"));
  }
  const alternativeState = sdk.applyAnalysisToState(sdk.createDefaultState(), alternativeRes);
  const alternativeSummary = sdk.computeContractSummary(alternativeState);
  assert.equal(alternativeSummary.countDisplay, "20 PEÇAS");
  assert.equal(alternativeSummary.totalDisplay, "R$ 1.098,00");
  assert.equal(alternativeSummary.advanceDisplay, "R$ 1.098,00");
  assert.equal(alternativeSummary.balanceDisplay, "R$ 0,00");
  const alternativeBundle = await sdk.generateContractFiles(alternativeState, false, false);
  const alternativePdf = await PDFDocument.load(await alternativeBundle.pdfBlob.arrayBuffer());
  assert.ok(alternativePdf.getPageCount() >= 1, "PDF ALTERNATIVE deve ser válido");
  assert.ok(alternativeBundle.docxBlob.size > 30000, "DOCX ALTERNATIVE com dois croquis");
  const alternativeDocx = await (await import("jszip")).default.loadAsync(await alternativeBundle.docxBlob.arrayBuffer());
  const alternativeXml = await alternativeDocx.file("word/document.xml")!.async("string");
  assert.ok((alternativeXml.match(/<w:drawing>/g) || []).length >= 4, "DOCX deve conter os dois croquis, logo e assinatura");
  // Pagamento ilegível/divergente não pode assumir o padrão 50/50 ao aplicar no editor.
  const { parseNativeFicha } = await import("../src/utils/browserNativeFicha");
  const nativePdf = await pdfjs.getDocument({ data: new Uint8Array(alternativeBytes) }).promise;
  const nativePages = [];
  for (let pi = 1; pi <= nativePdf.numPages; pi++) {
    const pg = await nativePdf.getPage(pi);
    const size = pg.getViewport({ scale: 1 });
    const spans = (await pg.getTextContent()).items.filter((it) => "str" in it && "transform" in it && it.str.trim())
      .map((it) => {
        if (!("str" in it) || !("transform" in it)) throw new Error("Unexpected text span");
        return { text: it.str.trim(), x: it.transform[4], y: size.height - it.transform[5], width: it.width };
      });
    nativePages.push({ width: size.width, height: size.height, spans });
  }
  const wrongEntry = nativePages[0].spans.find((s) => s.text === "1.098,00" && s.x > 530);
  assert.ok(wrongEntry);
  wrongEntry.text = "100,00";
  const uncertain = parseNativeFicha("divergent.pdf", nativePages, alternativeRes.paginas, alternativeRes.imagens_sugeridas.map((r) => r.data_url));
  assert.ok(uncertain);
  assert.equal(uncertain.pagamento.entrada_percentual, null);
  assert.equal(uncertain.pagamento.saldo_percentual, null);
  assert.match(uncertain.avisos?.join(" ") || "", /não foram reconciliados/);
  const uncertainState = sdk.applyAnalysisToState(sdk.createDefaultState(), uncertain);
  assert.equal(uncertainState.pagamento.entrada_percentual, null);
  assert.equal(sdk.computeContractSummary(uncertainState).advanceDisplay, "");

  // Variação rara da mesma ficha: cinco linhas numeradas, resumo continuado na pág. 2,
  // porém apenas dois croquis/grades. Mantém os cinco preços sem associar a arte errada.
  const fivePages = nativePages.map((pg) => ({ ...pg, spans: pg.spans.map((s) => ({ ...s })) }));
  const addRow = (pg: typeof fivePages[number], y: number, n: number, qty: number) => {
    pg.spans.push(
      { text: String(n), x: 28.9, y, width: 4 },
      { text: `MODELO EXTRA ${n}`, x: 41.8, y, width: 92 },
      { text: "39,90", x: 328.8, y, width: 18 },
      { text: String(qty), x: 368, y, width: 10 },
      { text: `R$ ${(qty * 39.9).toFixed(2).replace(".", ",")}`, x: 411, y, width: 40 },
    );
  };
  for (const pg of fivePages) pg.spans = pg.spans.filter((s) => !(s.x < 470 && s.y > 259 && s.y < 268));
  addRow(fivePages[0], 262.5, 3, 3);
  addRow(fivePages[1], 262.5, 4, 4);
  addRow(fivePages[1], 280, 5, 5);
  const fiveNative = parseNativeFicha("cinco-modelos.pdf", fivePages, alternativeRes.paginas, alternativeRes.imagens_sugeridas.map((r) => r.data_url));
  assert.ok(fiveNative);
  assert.deepEqual(fiveNative.itens.map((it) => it.numero), ["01", "02", "03", "04", "05"]);
  assert.deepEqual(fiveNative.itens.map((it) => it.quantidade), [10, 10, 3, 4, 5]);
  assert.deepEqual(fiveNative.itens.map((it) => it.valor_unitario), ["59.90", "49.90", "39.90", "39.90", "39.90"]);
  assert.ok(fiveNative.itens.every((it) => !it.grade), "Não atribuir grade repetida/ambígua a cinco modelos");
  assert.equal(fiveNative.imagens_sugeridas.length, 2, "Conservar artes mesmo sem associação segura");
  assert.match(fiveNative.avisos?.join(" ") || "", /sem associação inequívoca/);
  console.log("✓ TESTE 3 APROVADO: 2 modelos, 20 peças, R$ 1.098,00, entrada 100%, 2 croquis completos; pagamento incerto sinalizado.\n");

  // Regressão multipágina: 12 variações/12 croquis, sem limite artificial de 6 imagens.
  console.log("\n=== TESTE 4: 12 itens / 12 croquis — paginação automática PDF + DOCX ===");
  const extendedState = sdk.createDefaultState();
  extendedState.producao.itens = Array.from({ length: 12 }, (_, i) => ({
    ...mptoRes.itens[i % 5],
    id: `extra-${i}`,
    numero: String(i + 1).padStart(2, "0"),
  }));
  extendedState.producao.imagens_referencia = Array.from({ length: 12 }, (_, i) => ({
    ...mptoRes.imagens_sugeridas[i % 5],
    id: `extra-ref-${i}`,
    titulo: `Ref. ${String(i + 1).padStart(2, "0")} — Camiseta`,
  }));
  const extendedBundle = await sdk.generateContractFiles(extendedState, false, false);
  const extendedPdfBytes = await extendedBundle.pdfBlob.arrayBuffer();
  const extendedPdf = await PDFDocument.load(extendedPdfBytes);
  assert.ok(extendedPdf.getPageCount() >= 2, "Pedido de 12 itens/12 croquis precisa paginar, nunca sobrepor textos ou perder croquis");
  assert.ok(extendedPdf.getPages().every((pg) => Math.abs(pg.getWidth() - 595.28) < 0.1), "Todas as páginas do PDF A4");
  const zipModule = await import("jszip");
  const docxZip = await zipModule.default.loadAsync(await extendedBundle.docxBlob.arrayBuffer());
  const mediaCount = Object.keys(docxZip.files).filter((n) => /^word\/media\//.test(n) && !n.endsWith("/")).length;
  const documentXml = await docxZip.file("word/document.xml")!.async("string");
  const drawingCount = (documentXml.match(/<w:drawing>/g) || []).length;
  assert.ok(mediaCount >= 7, `DOCX deve conter os 5 croquis únicos + logo + assinatura; contém ${mediaCount}`);
  assert.ok(drawingCount >= 14, `DOCX deve inserir os 12 croquis + logo + assinatura, só há ${drawingCount} desenhos`);
  fs.writeFileSync(path.join(outDir, "multi_12_items.pdf"), Buffer.from(extendedPdfBytes));
  fs.writeFileSync(path.join(outDir, "multi_12_items.docx"), Buffer.from(await extendedBundle.docxBlob.arrayBuffer()));
  console.log(`✓ TESTE 4 APROVADO: ${extendedPdf.getPageCount()} páginas A4 PDF | ${drawingCount} desenhos no DOCX | 12/12 croquis!`);

  console.log("\n=== TESTE 5: cinco modelos com grades atípicas/multilinha e ZIP ===");
  const unusualState = sdk.applyAnalysisToState(sdk.createDefaultState(), mptoRes);
  unusualState.producao.itens = unusualState.producao.itens.map((item, i) => ({
    ...item,
    grade: `${item.grade}\nInfantil / juvenil ${i + 1}: 1un 2a · 2un 4a · 3un 6a · 4un 8a · 5un 10a · 6un 12a · 7un 14a\nTamanhos especiais: 1un 3G · 1un 4G · 1un 5G · 1un 6G`,
  }));
  const unusualBundle = await sdk.generateContractFiles(unusualState, false, false);
  const unusualDoc = await pdfjs.getDocument({ data: new Uint8Array(await unusualBundle.pdfBlob.arrayBuffer()) }).promise;
  const unusualTexts: string[] = [];
  for (let n = 1; n <= unusualDoc.numPages; n++) {
    unusualTexts.push((await (await unusualDoc.getPage(n)).getTextContent()).items.map((it) => "str" in it ? it.str : "").join(" "));
  }
  const unusualText = unusualTexts.join(" ");
  assert.equal((unusualText.match(/GRADE DE TAMANHOS POR MODELO/g) || []).length, 1);
  assert.equal((unusualText.match(/Infantil \/ juvenil/g) || []).length, 5, "Todas as 5 grades completas devem constar no PDF");
  assert.equal((unusualText.match(/Tamanhos especiais/g) || []).length, 5);
  assert.match(unusualText, /1un 6G/, "Tamanhos especiais não devem ser truncados");
  assert.match(unusualTexts.at(-1) || "", /Assinatura do\(a\) Contratante/, "Assinaturas permanecem no final mesmo com várias páginas");
  const unusualDocx = await zipModule.default.loadAsync(await unusualBundle.docxBlob.arrayBuffer());
  const unusualXml = await unusualDocx.file("word/document.xml")!.async("string");
  const footerXml = await unusualDocx.file("word/footer1.xml")!.async("string");
  assert.match(footerXml, /<w:instrText[^>]*>PAGE<\/w:instrText>/);
  assert.match(footerXml, /<w:instrText[^>]*>NUMPAGES<\/w:instrText>/);
  assert.equal((unusualXml.match(/Infantil \/ juvenil/g) || []).length, 5);
  assert.equal((unusualXml.match(/Tamanhos especiais/g) || []).length, 5);
  const unusualZip = await zipModule.default.loadAsync(await unusualBundle.zipBlob.arrayBuffer());
  assert.ok(unusualZip.file(`${unusualBundle.nomeBase}.pdf`) && unusualZip.file(`${unusualBundle.nomeBase}.docx`), "ZIP inclui PDF e Word completos");
  fs.writeFileSync(path.join(outDir, "unusual_5_items.pdf"), Buffer.from(await unusualBundle.pdfBlob.arrayBuffer()));
  console.log(`✓ TESTE 5 APROVADO: 5 grades atípicas completas em ${unusualDoc.numPages} página(s), PDF/DOCX/ZIP.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FALHA E2E:", err);
  process.exit(1);
});
