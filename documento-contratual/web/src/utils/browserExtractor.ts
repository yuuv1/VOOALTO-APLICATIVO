import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerRaw from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw";
import ocrWorkerRaw from "../../public/ocr/worker.min.js?raw";
import { createWorker, Worker as TesseractWorker } from "tesseract.js";
import { ItemProducao, PaginaDocumento } from "../types";
import { uid } from "./calculations";
import { parseNativeFicha, type NativeFichaPage, type NativeSpan } from "./browserNativeFicha";

// Cria Blob Worker em memória no navegador real (incluindo file://); em Node/SSR usa fallback nativo
const isRealBrowser =
  typeof Worker !== "undefined" && typeof HTMLCanvasElement !== "undefined";
if (isRealBrowser) {
  const workerBlob = new Blob([pdfWorkerRaw], { type: "text/javascript" });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
}
const defaultOcrWorkerUrl = isRealBrowser
  ? URL.createObjectURL(new Blob([ocrWorkerRaw], { type: "application/javascript" }))
  : "";

export interface AnaliseResultado {
  arquivo: string;
  itens: ItemProducao[];
  cliente: Partial<{
    nome_razao_social: string;
    cpf_cnpj: string;
    telefone: string;
    email: string;
    endereco: string;
    cidade_uf_cep: string;
  }>;
  pagamento: Partial<{
    entrada_percentual: number | null;
    saldo_percentual: number | null;
    forma_pagamento: string;
  }>;
  producao: Partial<{
    prazo_entrega: string;
    observacoes: string;
  }>;
  execucao?: Partial<{
    local_data: string;
  }>;
  paginas: PaginaDocumento[];
  imagens_sugeridas: Array<{ id: string; titulo: string; data_url: string }>;
  /** Itens com leitura incompleta ou divergência; exibir antes de exportar. */
  avisos?: string[];
  metodo: "python_ocr" | "ocr_navegador" | "gemini_ia" | "navegador_local";
}

export type ProgressCallback = (message: string) => void;

const VOOALTO_CNPJ_DIGITS = "51919138000120";

let cachedOcrWorker: Promise<TesseractWorker> | null = null;

function canvasToOcrInput(cv: HTMLCanvasElement): HTMLCanvasElement | string {
  return isRealBrowser ? cv : cv.toDataURL("image/png");
}

async function getBrowserOcrWorker(onProgress?: ProgressCallback): Promise<TesseractWorker> {
  if (!cachedOcrWorker) {
    cachedOcrWorker = (async () => {
      onProgress?.("Inicializando motor OCR Neural em Português no navegador...");

      if (!isRealBrowser) {
        return await createWorker("por", 1, {
          langPath: new URL("../../public/ocr", import.meta.url).pathname,
          cacheMethod: "none",
        });
      }

      const isFileProtocol =
        typeof window !== "undefined" && window.location.protocol === "file:";

      const inlineOcr =
        typeof window !== "undefined"
          ? (
              window as unknown as {
                __VOOALTO_INLINE_OCR__?: { coreJsB64: string; porGzB64: string };
              }
            ).__VOOALTO_INLINE_OCR__
          : undefined;

      // Modo 100% single-file (.html autônomo mesmo em file:// e sem internet)
      if (inlineOcr?.coreJsB64 && inlineOcr?.porGzB64) {
        const coreBin = window.atob(inlineOcr.coreJsB64);
        const coreBytes = new Uint8Array(coreBin.length);
        for (let i = 0; i < coreBin.length; i++) coreBytes[i] = coreBin.charCodeAt(i);

        const preamble = [
          `const __porB64 = ${JSON.stringify(inlineOcr.porGzB64)};`,
          `const _origFetch = self.fetch.bind(self);`,
          `self.fetch = async function(input, init) {`,
          `  const u = typeof input === "string" ? input : ((input && input.url) || "");`,
          `  if (u.indexOf("__INLINE_POR_GZ__") !== -1) {`,
          `    const bin = self.atob(__porB64);`,
          `    const bytes = new Uint8Array(bin.length);`,
          `    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);`,
          `    return new Response(bytes.buffer, { status: 200 });`,
          `  }`,
          `  return _origFetch(input, init);`,
          `};\n`,
        ].join("\n");

        const inlineWorkerUrl = URL.createObjectURL(
          new Blob([preamble, coreBytes, "\n", ocrWorkerRaw], {
            type: "application/javascript",
          })
        );
        return await createWorker("por", 1, {
          workerPath: inlineWorkerUrl,
          workerBlobURL: false,
          langPath: "https://inline.vooalto.local/__INLINE_POR_GZ__",
          cacheMethod: "none",
        });
      }

      if (!isFileProtocol) {
        try {
          const base = new URL("./ocr", window.location.href).href.replace(/\/$/, "");
          return await createWorker("por", 1, {
            workerPath: defaultOcrWorkerUrl,
            workerBlobURL: false,
            corePath: `${base}/tesseract-core-simd-lstm.wasm.js`,
            langPath: `${base}`,
            cacheMethod: "none",
          });
        } catch {
          // Caso os arquivos ./ocr locais não estejam publicados no host de destino, usa CDN oficial v7
        }
      }

      return await createWorker("por", 1, {
        workerPath: defaultOcrWorkerUrl,
        workerBlobURL: false,
        corePath:
          "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core-simd-lstm.wasm.js",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int",
        cacheMethod: "none",
      });
    })().catch((err) => {
      cachedOcrWorker = null;
      throw err;
    });
  }
  return cachedOcrWorker;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  const mime = file.type || "application/octet-stream";
  return `data:${mime};base64,${b64}`;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/gi, "").trim();
  if (!cleaned) return null;
  // Formato BR com vírgula decimal: 5.540,10 ou 57,90
  if (cleaned.includes(",")) {
    const norm = cleaned.replace(/\./g, "").replace(",", ".");
    const val = Number(norm);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) : null;
  }
  // Caso o OCR tenha omitido a vírgula dos centavos (ex: "5790" -> 57,90 ou "62910" -> 629,10)
  if (/^\d{4,7}$/.test(cleaned)) {
    const val = Number(cleaned);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  const val = Number(cleaned);
  return Number.isFinite(val) && val > 0 ? Math.round(val * 100) : null;
}

function centsToDecimalStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

function titleCasePt(s: string): string {
  const lowerWords = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "ou", "por", "para"]);
  return s
    .trim()
    .split(/\s+/)
    .map((w, idx) => {
      const low = w.toLowerCase();
      if (idx > 0 && lowerWords.has(low)) return low;
      if (/^(mpto|cpf|cnpj|cep|to|go|df|sp|rj|mg|ba|mt|ms|pa|ma|pi|pr|sc|rs|pe|ce)$/i.test(w)) {
        return w.toUpperCase();
      }
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join(" ");
}

export interface FichaPageAnchors {
  hasGrade: boolean;
  gradeY: number;
  detalhesY: number;
  coresY: number | null;
  tipoY: number | null;
}

function cleanColorPillText(raw: string): string {
  const upper = raw
    .toUpperCase()
    .replace(/[^A-ZÀ-Ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!upper) return "";
  if (upper.includes("MARINHO")) return "Azul Marinho";
  if (upper.includes("ROYAL")) return "Azul Royal";
  if (upper.includes("CELESTE") || upper.includes("CLARO")) return "Azul Claro";
  if (upper.includes("PETROLEO") || upper.includes("PETRÓLEO")) return "Azul Petróleo";
  if (upper.includes("TURQUESA")) return "Azul Turquesa";
  if (upper.includes("OFF") && upper.includes("WHITE")) return "Off White";
  if (upper.includes("BRANC")) return "Branco";
  if (upper.includes("PRET")) return "Preto";
  if (upper.includes("GRAFITE") || upper.includes("CHUMBO")) return "Cinza Chumbo";
  if (upper.includes("MESCLA")) return "Cinza Mescla";
  if (upper.includes("CINZA")) return "Cinza";
  if (upper.includes("VINHO") || upper.includes("BORDO") || upper.includes("BORDÔ") || upper.includes("MARSALA")) return "Bordô";
  if (upper.includes("VERMELH")) return "Vermelho";
  if (upper.includes("BANDEIRA")) return "Verde Bandeira";
  if (upper.includes("MUSGO") || upper.includes("MILITAR") || upper.includes("OLIVA")) return "Verde Militar";
  if (upper.includes("VERDE")) return "Verde";
  if (upper.includes("AMAREL")) return "Amarelo";
  if (upper.includes("LARANJ")) return "Laranja";
  if (upper.includes("ROSA") || upper.includes("PINK")) return "Rosa";
  if (upper.includes("ROXO") || upper.includes("LILAS") || upper.includes("VIOLETA")) return "Roxo";
  if (upper.includes("CAQUI") || upper.includes("CÁQUI")) return "Cáqui";
  if (upper.includes("AREIA")) return "Areia";
  if (upper.includes("BEGE") || upper.includes("CREME")) return "Bege";
  if (upper.includes("MARROM") || upper.includes("TERRA")) return "Marrom";
  return titleCasePt(upper);
}

/**
 * Remove suavemente apenas borda uniforme externa mantendo 3% de respiro em todos os 4 lados
 * (JAMAIS corta gola, ombros, barra ou textos superiores "BORDADO / SILK DIGITAL").
 */
function trimCanvasUniformMarginDataUrl(src: HTMLCanvasElement, padFrac = 0.03): string {
  const w = src.width;
  const h = src.height;
  if (w < 60 || h < 60) return src.toDataURL("image/jpeg", 0.91);
  const ctx = src.getContext("2d")!;
  const data = ctx.getImageData(0, 0, w, h).data;

  const cw = Math.max(4, Math.floor(w / 40));
  const ch = Math.max(4, Math.floor(h / 40));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const samplePatch = (x0: number, y0: number) => {
    for (let y = y0; y < Math.min(h, y0 + ch); y += 2) {
      for (let x = x0; x < Math.min(w, x0 + cw); x += 2) {
        const o = (y * w + x) * 4;
        rs.push(data[o]);
        gs.push(data[o + 1]);
        bs.push(data[o + 2]);
      }
    }
  };
  samplePatch(0, 0);
  samplePatch(w - cw, 0);
  samplePatch(0, h - ch);
  samplePatch(w - cw, h - ch);
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const bgR = rs[Math.floor(rs.length / 2)] ?? 242;
  const bgG = gs[Math.floor(gs.length / 2)] ?? 243;
  const bgB = bs[Math.floor(bs.length / 2)] ?? 245;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let fgCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const diff = Math.max(
        Math.abs(data[o] - bgR),
        Math.abs(data[o + 1] - bgG),
        Math.abs(data[o + 2] - bgB)
      );
      if (diff > 14) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let fx = 0;
  let fy = 0;
  let fw = w;
  let fh = h;
  if (fgCount >= 200 && maxX > minX + 30 && maxY > minY + 30) {
    const padX = Math.max(12, Math.floor((maxX - minX) * padFrac));
    const padY = Math.max(12, Math.floor((maxY - minY) * padFrac));
    fx = Math.max(0, minX - padX);
    fy = Math.max(0, minY - padY);
    fw = Math.min(w - fx, maxX - minX + 1 + padX * 2);
    fh = Math.min(h - fy, maxY - minY + 1 + padY * 2);
  }

  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(fw, fh));
  const ow = Math.max(1, Math.round(fw * scale));
  const oh = Math.max(1, Math.round(fh * scale));
  const out = document.createElement("canvas");
  out.width = ow;
  out.height = oh;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#FFFFFF";
  octx.fillRect(0, 0, ow, oh);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, fx, fy, fw, fh, 0, 0, ow, oh);
  return out.toDataURL("image/jpeg", 0.91);
}

/**
 * Recorta a etiqueta ("CORES DO TECIDO" ou "TIPO DE TECIDO") em qualquer altura dinâmica da página,
 * invertendo automaticamente quando o fundo é escuro (ex.: Preto, Azul Marinho).
 */
function cropColorPillCanvas(pageCanvas: HTMLCanvasElement, pillHeaderYFrac?: number | null): HTMLCanvasElement {
  const W = pageCanvas.width;
  const H = pageCanvas.height;
  const headerFrac = pillHeaderYFrac != null && pillHeaderYFrac > 0.04 ? pillHeaderYFrac : 0.525;
  const sx = Math.floor(W * 0.042);
  const sy = Math.max(0, Math.floor(H * (headerFrac + 0.008)));
  const sw = Math.max(20, Math.floor(W * 0.195));
  const sh = Math.max(12, Math.min(H - sy, Math.floor(H * 0.032)));

  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  const ctx = tmp.getContext("2d")!;
  ctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const px = imgData.data;

  // Amostra o miolo central da pílula para saber se o fundo é escuro
  const centerLums: number[] = [];
  for (let y = Math.floor(sh * 0.25); y < Math.floor(sh * 0.75); y++) {
    for (let x = Math.floor(sw * 0.12); x < Math.floor(sw * 0.75); x++) {
      const o = (y * sw + x) * 4;
      centerLums.push(0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]);
    }
  }
  centerLums.sort((a, b) => a - b);
  const medianLum = centerLums[Math.floor(centerLums.length / 2)] ?? 255;
  const invert = medianLum < 150;

  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (invert) g = 255 - g;
    px[i] = g;
    px[i + 1] = g;
    px[i + 2] = g;
    px[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  const out = document.createElement("canvas");
  const pad = 24;
  out.width = sw * 2 + pad * 2;
  out.height = sh * 2 + pad * 2;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#FFFFFF";
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true;
  octx.drawImage(tmp, 0, 0, sw, sh, pad, pad, sw * 2, sh * 2);
  return out;
}

/**
 * Extrai a área COMPLETA do croqui da camiseta (frente + costas + cabeçalho BORDADO/SILK DIGITAL,
 * SEM cortar golas nem ombros!) quando não há XObject nativo embutido no PDF.
 */
function cropShirtMockupDataUrl(pageCanvas: HTMLCanvasElement, detalhesYFrac = 0.495): string | null {
  const W = pageCanvas.width;
  const H = pageCanvas.height;
  const x0 = Math.floor(W * 0.262);
  const x1 = Math.floor(W * 0.974);
  const y0 = Math.max(0, Math.floor(H * Math.max(0.08, detalhesYFrac + 0.02)));
  const y1 = Math.floor(H * 0.946);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 80 || ch < 80) return null;

  const sub = document.createElement("canvas");
  sub.width = cw;
  sub.height = ch;
  const ctx = sub.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(pageCanvas, x0, y0, cw, ch, 0, 0, cw, ch);
  return trimCanvasUniformMarginDataUrl(sub, 0.03);
}

interface GradeRowMeta {
  pageIndex: number;
  rowLabel: string;
  sizes: string[];
}

/**
 * Monta uma folha única com todos os números preenchidos das grades de todas as páginas da Ficha Técnica,
 * eliminando bordas arredondadas por flood-fill e preservando suavização anti-aliasing em escala de cinza
 * para leitura 100% exata em uma única chamada rápida ao OCR.
 */
function buildGradesSlotSheet(
  hiCanvases: HTMLCanvasElement[],
  pageAnchors: FichaPageAnchors[]
): { sheet: HTMLCanvasElement; meta: GradeRowMeta[] } | null {
  const adultCols: Array<[string, number]> = [
    ["PP", 0.1652],
    ["P", 0.237],
    ["M", 0.3088],
    ["G", 0.3806],
    ["GG", 0.4524],
    ["3G", 0.5242],
    ["4G", 0.596],
    ["5G", 0.6678],
    ["6G", 0.7396],
    ["7G", 0.8114],
  ];
  const kidsCols: Array<[string, number]> = [
    ["2a", 0.18],
    ["4a", 0.283],
    ["6a", 0.385],
    ["8a", 0.488],
    ["10a", 0.59],
    ["12a", 0.693],
    ["14a", 0.795],
  ];

  const rowsGlyphs: Array<{
    pageIndex: number;
    rowLabel: string;
    items: Array<{ sz: string; canvas: HTMLCanvasElement }>;
  }> = [];

  for (let pIdx = 0; pIdx < hiCanvases.length; pIdx++) {
    const anch = pageAnchors[pIdx];
    if (anch && !anch.hasGrade) {
      // Página de continuação (overflow de DETALHES DO MODELO / croqui sem GRADE DA PRODUÇÃO)
      continue;
    }
    const src = hiCanvases[pIdx];
    const W = src.width;
    const H = src.height;
    const sy0 = Math.max(0, Math.floor(H * (anch ? anch.gradeY : 0.33)));
    const sh = Math.max(24, Math.min(H - sy0, Math.floor(H * 0.152)));
    const sw = W;

    const stripCanvas = document.createElement("canvas");
    stripCanvas.width = sw;
    stripCanvas.height = sh;
    const sctx = stripCanvas.getContext("2d")!;
    sctx.drawImage(src, 0, sy0, sw, sh, 0, 0, sw, sh);
    const rgba = sctx.getImageData(0, 0, sw, sh).data;

    const gray = new Uint8Array(sw * sh);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      gray[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }

    // Localiza o centro vertical exato das linhas "Masculino", "Babylook" e "Infantil"
    const peakY = (y0f: number, y1f: number): number => {
      const a = Math.floor(sh * y0f);
      const b = Math.floor(sh * y1f);
      const lx0 = Math.floor(sw * 0.03);
      const lx1 = Math.floor(sw * 0.11);
      let num = 0;
      let den = 0;
      for (let y = a; y < b; y++) {
        let darkRow = 0;
        for (let x = lx0; x < lx1; x++) {
          if (gray[y * sw + x] < 200) darkRow++;
        }
        num += y * darkRow;
        den += darkRow;
      }
      return den > 0 ? Math.round(num / den) : Math.round((a + b) / 2);
    };

    const ryMasc = peakY(0.26, 0.45);
    const ryBaby = peakY(0.46, 0.66);
    const ryInf = peakY(0.8, 0.97);

    const hw = Math.floor(sw * 0.024);
    const hh = Math.floor(sh * 0.062);

    const rowDefs: Array<[string, number, Array<[string, number]>]> = [
      ["Masc", ryMasc, adultCols],
      ["Baby look", ryBaby, adultCols],
      ["Infantil", ryInf, kidsCols],
    ];

    for (const [rowLabel, ry, cols] of rowDefs) {
      const rowItems: Array<{ sz: string; canvas: HTMLCanvasElement }> = [];

      for (const [sz, cxf] of cols) {
        const cx = Math.floor(sw * cxf);
        const xStart = Math.max(0, cx - hw);
        const yStart = Math.max(0, ry - hh);
        const cw = Math.min(sw, cx + hw) - xStart;
        const ch = Math.min(sh, ry + hh) - yStart;
        if (cw < 8 || ch < 8) continue;

        const sub = new Uint8Array(cw * ch);
        const centerVals: number[] = [];
        let centerDark = 0;
        for (let yy = 0; yy < ch; yy++) {
          for (let xx = 0; xx < cw; xx++) {
            const v = gray[(yStart + yy) * sw + (xStart + xx)];
            sub[yy * cw + xx] = v;
            if (
              yy >= Math.floor(ch * 0.25) &&
              yy < Math.floor(ch * 0.75) &&
              xx >= Math.floor(cw * 0.25) &&
              xx < Math.floor(cw * 0.75)
            ) {
              centerVals.push(v);
              if (v < 185) centerDark++;
            }
          }
        }
        centerVals.sort((a, b) => a - b);
        const med = centerVals[Math.floor(centerVals.length / 2)] ?? 255;

        const isDarkPill = med < 150;
        if (!isDarkPill && centerDark < 10) continue;

        // Máscara binária apenas para identificar e remover qualquer componente conectado à borda externa da pílula
        const fg = new Uint8Array(cw * ch);
        for (let i = 0; i < sub.length; i++) {
          fg[i] = isDarkPill ? (sub[i] > 135 ? 1 : 0) : sub[i] < 185 ? 1 : 0;
        }

        // BFS a partir das 4 bordas para apagar cantos brancos externos ou linhas de grade
        const queue: number[] = [];
        for (let xx = 0; xx < cw; xx++) {
          if (fg[xx]) {
            fg[xx] = 0;
            queue.push(xx);
          }
          const bot = (ch - 1) * cw + xx;
          if (fg[bot]) {
            fg[bot] = 0;
            queue.push(bot);
          }
        }
        for (let yy = 0; yy < ch; yy++) {
          const left = yy * cw;
          if (fg[left]) {
            fg[left] = 0;
            queue.push(left);
          }
          const right = yy * cw + (cw - 1);
          if (fg[right]) {
            fg[right] = 0;
            queue.push(right);
          }
        }
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          const cy = Math.floor(cur / cw);
          const cx2 = cur % cw;
          const nbrs = [
            cy > 0 ? cur - cw : -1,
            cy < ch - 1 ? cur + cw : -1,
            cx2 > 0 ? cur - 1 : -1,
            cx2 < cw - 1 ? cur + 1 : -1,
          ];
          for (const nb of nbrs) {
            if (nb >= 0 && fg[nb] === 1) {
              fg[nb] = 0;
              queue.push(nb);
            }
          }
        }

        let minX = cw;
        let maxX = -1;
        let minY = ch;
        let maxY = -1;
        let fgPixels = 0;
        for (let yy = 0; yy < ch; yy++) {
          for (let xx = 0; xx < cw; xx++) {
            if (fg[yy * cw + xx] === 1) {
              fgPixels++;
              if (xx < minX) minX = xx;
              if (xx > maxX) maxX = xx;
              if (yy < minY) minY = yy;
              if (yy > maxY) maxY = yy;
            }
          }
        }
        if (fgPixels < 6 || maxX < minX || maxY < minY) continue;

        // Renderiza o dígito em escala de cinza suave (preservando anti-aliasing do '9', '8', '3', etc.) sobre branco puro
        const pad = 3;
        const gx0 = Math.max(0, minX - pad);
        const gy0 = Math.max(0, minY - pad);
        const gw = Math.min(cw - gx0, maxX - minX + 1 + pad * 2);
        const gh = Math.min(ch - gy0, maxY - minY + 1 + pad * 2);

        const rawDigit = document.createElement("canvas");
        rawDigit.width = gw;
        rawDigit.height = gh;
        const rctx = rawDigit.getContext("2d")!;
        const dImg = rctx.createImageData(gw, gh);
        for (let yy = 0; yy < gh; yy++) {
          for (let xx = 0; xx < gw; xx++) {
            const srcIdx = (gy0 + yy) * cw + (gx0 + xx);
            const rawVal = sub[srcIdx];
            // Se for pílula escura, apenas pixels próximos aos dígitos ficam escuros sobre fundo branco puro
            let lum = isDarkPill ? 255 - rawVal : rawVal;
            // Limpa qualquer pixel fora da caixa interna do glifo
            const insideBox =
              gx0 + xx >= minX - 1 &&
              gx0 + xx <= maxX + 1 &&
              gy0 + yy >= minY - 1 &&
              gy0 + yy <= maxY + 1;
            if (!insideBox) lum = 255;
            else lum = Math.max(0, Math.min(255, Math.round((lum - 35) * 1.35)));
            const di = (yy * gw + xx) * 4;
            dImg.data[di] = lum;
            dImg.data[di + 1] = lum;
            dImg.data[di + 2] = lum;
            dImg.data[di + 3] = 255;
          }
        }
        rctx.putImageData(dImg, 0, 0);

        const up = document.createElement("canvas");
        up.width = gw * 2;
        up.height = gh * 2;
        const uctx = up.getContext("2d")!;
        uctx.fillStyle = "#FFFFFF";
        uctx.fillRect(0, 0, up.width, up.height);
        uctx.imageSmoothingEnabled = true;
        uctx.imageSmoothingQuality = "high";
        uctx.drawImage(rawDigit, 0, 0, gw, gh, 0, 0, up.width, up.height);

        rowItems.push({ sz, canvas: up });
      }

      if (rowItems.length > 0) {
        rowsGlyphs.push({ pageIndex: pIdx, rowLabel, items: rowItems });
      }
    }
  }

  if (rowsGlyphs.length === 0) return null;

  const SLOT_W = 190;
  const SLOT_H = 96;
  const maxCols = Math.max(...rowsGlyphs.map((r) => r.items.length));
  const sheet = document.createElement("canvas");
  sheet.width = 40 + maxCols * SLOT_W + 40;
  sheet.height = 20 + rowsGlyphs.length * SLOT_H + 20;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const meta: GradeRowMeta[] = [];
  rowsGlyphs.forEach((row, rIdx) => {
    meta.push({
      pageIndex: row.pageIndex,
      rowLabel: row.rowLabel,
      sizes: row.items.map((i) => i.sz),
    });
    row.items.forEach((item, cIdx) => {
      const dx = 40 + cIdx * SLOT_W + Math.floor((SLOT_W - item.canvas.width) / 2);
      const dy = 10 + rIdx * SLOT_H + Math.floor((SLOT_H - item.canvas.height) / 2);
      ctx.drawImage(item.canvas, dx, dy);
    });
  });

  return { sheet, meta };
}

/**
 * Extrator completo para Ficha Técnica de Produção VOOALTO (1 a N páginas) 100% no navegador.
 */
async function extractFichaTecnicaBrowser(
  fileName: string,
  pageTexts: string[],
  previewPages: PaginaDocumento[],
  hiCanvases: HTMLCanvasElement[],
  pageAnchors: FichaPageAnchors[],
  nativeMockupUrls: Array<string | null>,
  worker: TesseractWorker,
  onProgress?: ProgressCallback
): Promise<AnaliseResultado> {
  const fullP1 = pageTexts[0] || "";
  const allJoined = pageTexts.join("\n");

  const cliente: AnaliseResultado["cliente"] = {};
  const pagamento: AnaliseResultado["pagamento"] = {};
  const producao: AnaliseResultado["producao"] = {};
  const execucao: AnaliseResultado["execucao"] = {};

  // 1. CNPJ / CPF do cliente (ignorando CNPJ da própria VOOALTO)
  const docMatches = allJoined.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g) || [];
  for (const dm of docMatches) {
    if (dm.replace(/\D/g, "") !== VOOALTO_CNPJ_DIGITS) {
      cliente.cpf_cnpj = dm;
      break;
    }
  }

  // 2. Número da Ficha, Data de Emissão, Previsão de Entrega e Vendedor
  const fichaMatch = allJoined.match(/\[?\s*(\d{3,6})\s+PREVIS[ÃA]O/i) || allJoined.match(/N[ºo°]\s*\[?\s*(\d{3,6})/i);
  const fichaNum = fichaMatch ? fichaMatch[1] : "";

  const dateMatch = fullP1.match(/\b(\d{2}\/\d{2}\/20\d{2})/);
  const emissaoStr = dateMatch ? dateMatch[1] : "";
  if (emissaoStr) {
    execucao.local_data = `Goiânia - GO, ${emissaoStr}`;
  }

  const prazoMatch = allJoined.match(/(\d{1,3})\s*p?d?IAS/i);
  if (prazoMatch) {
    producao.prazo_entrega = fichaNum
      ? `${prazoMatch[1]} dias (conforme Ficha Técnica Nº ${fichaNum})`
      : `${prazoMatch[1]} dias`;
  }

  const vendMatch = fullP1.match(/VENDEDOR\s+([A-ZÀ-Ÿ]{3,25})/i);
  const vendedorStr = vendMatch ? titleCasePt(vendMatch[1]) : "";
  const hasSilkWarn = /DIVERG[ÊE]NCIAS\s+DE\s+COR/i.test(allJoined);

  const obsParts: string[] = [];
  if (fichaNum) {
    obsParts.push(`Ficha Técnica Nº ${fichaNum}${vendedorStr ? ` (Vendedor: ${vendedorStr})` : ""}`);
  }
  if (hasSilkWarn) {
    obsParts.push("Podem haver divergências de cor no silk digital.");
  }
  if (obsParts.length > 0) {
    producao.observacoes = obsParts.join(" · ");
  }

  // 3. Razão Social, Telefone, Endereço, Cidade/UF e CEP
  const linesP1 = fullP1
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const clientIdx = linesP1.findIndex((l) => /DADOS\s+DO\s+CLIENTE/i.test(l));
  if (clientIdx >= 0) {
    const windowLines = linesP1.slice(clientIdx + 1, clientIdx + 12);
    let mainName = "";
    let subName = "";
    for (const ln of windowLines) {
      if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(ln)) continue;
      if (/^\(\d{2}\)\s*\d{4,5}/.test(ln) || /TELEFONE|TREFONE/i.test(ln)) break;
      if (!mainName && ln.length > 4) {
        mainName = ln.replace(/^[^A-Za-zÀ-ÿ0-9]+/, "").trim();
      } else if (/RAZ[ÃA]O\s*SOCIAL/i.test(ln)) {
        const paren = ln.match(/\(([^)]+)\)/);
        if (paren) {
          subName = paren[1]
            .replace(/^\s*(?:IDTO|NIDTO|MIDTO)\b/i, "MPTO")
            .replace(/procuradoria-geral/i, "Procuradoria-Geral")
            .replace(/justica/i, "Justiça")
            .trim();
        }
      }
    }
    if (mainName) {
      cliente.nome_razao_social = subName ? `${mainName} (${subName})` : mainName;
    }

    // Telefone (mesmo quando quebrado em 2 linhas: "(63) 99994-" + "... 1987")
    const joinedClientBlock = windowLines.join(" ");
    let splitPhoneTail = "";
    const fullPhone = joinedClientBlock.match(/\((\d{2})\)\s*(\d{4,5})-\s*(\d{4})/);
    if (fullPhone) {
      cliente.telefone = `(${fullPhone[1]}) ${fullPhone[2]}-${fullPhone[3]}`;
    } else {
      const halfPhone = joinedClientBlock.match(/\((\d{2})\)\s*(\d{4,5})-/);
      if (halfPhone && halfPhone.index !== undefined) {
        const afterHalf = joinedClientBlock
          .slice(halfPhone.index + halfPhone[0].length)
          .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, " ")
          .replace(/\b\d{2}\.?\d{3}-\d{3}\b/g, " ");
        const tailPhone = afterHalf.match(/(?:^|\s)(\d{4})(?=\s|$)/);
        if (tailPhone) {
          splitPhoneTail = tailPhone[1];
          cliente.telefone = `(${halfPhone[1]}) ${halfPhone[2]}-${splitPhoneTail}`;
        }
      }
    }

    // CEP e Cidade - UF
    const cepMatch = joinedClientBlock.match(/\b(\d{2}\.?\d{3}-\d{3})\b/);
    const cityUfMatch = joinedClientBlock.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,26})\s*-\s*([A-Z]{2})\b/);
    const cidParts: string[] = [];
    if (cityUfMatch) {
      const cleanCity = cityUfMatch[1]
        .replace(/^\s*(?:cidade|cipave|cibade|[a-zà-ÿ]{3,8})\s+(?=[A-ZÀ-Ÿ])/i, (m) =>
          /^(?:São|Santa|Santo|Porto| Ouro|Nova|Novo| Bom| Boa| Rio| Belo| Bela| Campo| Lagoa)\s+/i.test(m)
            ? m
            : ""
        )
        .trim();
      cidParts.push(`${cleanCity} - ${cityUfMatch[2].toUpperCase()}`);
    }
    if (cepMatch) cidParts.push(`CEP ${cepMatch[1]}`);
    if (cidParts.length > 0) cliente.cidade_uf_cep = cidParts.join(" · ");

    // Endereço entre o telefone quebrado e Cidade-UF
    const addrChunks: string[] = [];
    for (const ln of windowLines) {
      let cleaned = ln
        .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, " ")
        .replace(/\b\d{2}\.?\d{3}-\d{3}\b/g, " ")
        .replace(/\(\d{2}\)\s*\d{4,5}-\d{0,4}/g, " ")
        .replace(/\b(?:TELEFONE|TREFONE|CEP)\b/gi, " ")
        .replace(/\b(?:ENDERE[ÇC]O|FNPERISO|FNPERESO)\b/gi, " ");
      if (splitPhoneTail) {
        cleaned = cleaned.replace(new RegExp(`\\b${splitPhoneTail}\\b`, "g"), " ");
      }
      if (cityUfMatch) {
        cleaned = cleaned.replace(cityUfMatch[0], " ");
      }
      cleaned = cleaned
        .replace(/(\d)\?(?=\s|,|$)/g, "$1")
        .replace(/\bLO-O(\d)\b/g, "LO-0$1")
        .replace(/\bLO-OA\b/g, "LO-04")
        .replace(/\s+[a-z]{4,7}\s+[a-z]{1,4}\s*$/i, (m) => (/Norte|Sul|Leste|Oeste|Centro/i.test(m) ? m : " "))
        .replace(/\s+/g, " ")
        .trim();
      if (
        cleaned &&
        /(?:Quadra|Rua|Av\.|Avenida|Alameda|Rodovia|Setor|Lote|Conjunto|Plano|Bairro)/i.test(cleaned)
      ) {
        addrChunks.push(cleaned);
      }
    }
    if (addrChunks.length > 0) {
      cliente.endereco = addrChunks.join(" ").replace(/\s+/g, " ").trim();
    }
  }

  // 4. Resumo financeiro da Página 1 (preços unitários de 1..M linhas para QUALQUER modelo VOOALTO, totais e % entrada/saldo)
  interface SummaryGroup {
    idx: number;
    desc: string;
    unitCents: number;
    qty: number;
  }
  const summaryGroups: SummaryGroup[] = [];
  let totalOrderCents = 0;
  let restOrderCents = 0;

  for (const ln of linesP1) {
    const mRow = ln.match(/^(\d+)\)\s*(.+?)\s+R\$\s*[=-]*\s*([\d.,]+)\s*x\s*(\d{1,4})/i);
    if (mRow) {
      const desc = mRow[2].trim();
      const unitCents = parseMoneyToCents(mRow[3]) || 0;
      const qty = Number(mRow[4]) || 0;
      if (unitCents > 0 && qty > 0) {
        summaryGroups.push({ idx: Number(mRow[1]) || summaryGroups.length + 1, desc, unitCents, qty });
      }
      const allR = Array.from(ln.matchAll(/R\$\s*([\d.]+,\d{2})/g));
      if (allR.length >= 2) {
        const cand = parseMoneyToCents(allR[allR.length - 1][1]);
        if (cand && cand > totalOrderCents) totalOrderCents = cand;
      }
    }
    const mRest = ln.match(/Restante\s+R\$\s*[—=-]*\s*([\d.]+,\d{2})/i);
    if (mRest) {
      const rc = parseMoneyToCents(mRest[1]);
      if (rc && rc > 0) restOrderCents = rc;
    }
  }
  if (totalOrderCents <= 0 && summaryGroups.length > 0) {
    totalOrderCents = summaryGroups.reduce((acc, g) => acc + g.unitCents * g.qty, 0);
  }
  if (restOrderCents > 0 && totalOrderCents > restOrderCents) {
    const sp = Math.round((restOrderCents / totalOrderCents) * 100);
    pagamento.entrada_percentual = 100 - sp;
    pagamento.saldo_percentual = sp;
  }

  // 5. Lê cores e tecidos (pílulas invertidas em qualquer altura dinâmica) + folha unificada de grades
  onProgress?.("Extraindo cores, tecidos, grades e croquis completos de todas as páginas...");
  const pageColors: string[] = [];
  const pageFabrics: string[] = [];
  for (let i = 0; i < hiCanvases.length; i++) {
    const anch = pageAnchors[i];
    const pillCanvas = cropColorPillCanvas(hiCanvases[i], anch?.coresY);
    const pillRes = await worker.recognize(canvasToOcrInput(pillCanvas));
    pageColors.push(cleanColorPillText(pillRes.data.text || ""));

    if (anch?.tipoY != null) {
      const fabCanvas = cropColorPillCanvas(hiCanvases[i], anch.tipoY);
      const fabRes = await worker.recognize(canvasToOcrInput(fabCanvas));
      pageFabrics.push((fabRes.data.text || "").trim());
    } else {
      pageFabrics.push("");
    }
  }

  // Grade unificada por símbolos (x/y exatos nos slots dinâmicos de cada página)
  const pageGrades: Array<{ text: string; qty: number }> = hiCanvases.map(() => ({
    text: "",
    qty: 0,
  }));

  const slotSheet = buildGradesSlotSheet(hiCanvases, pageAnchors);
  if (slotSheet) {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: "6" as never,
    });
    const gRes = await worker.recognize(
      canvasToOcrInput(slotSheet.sheet),
      {},
      { blocks: true }
    );
    await worker.setParameters({
      tessedit_char_whitelist: "",
      tessedit_pageseg_mode: "6" as never,
    });

    const buckets: Array<Array<Array<{ x: number; ch: string }>>> = slotSheet.meta.map((m) =>
      m.sizes.map(() => [])
    );
    for (const b of gRes.data.blocks || []) {
      for (const par of b.paragraphs || []) {
        for (const ln of par.lines || []) {
          for (const w of ln.words || []) {
            for (const sym of w.symbols || []) {
              const cx = (sym.bbox.x0 + sym.bbox.x1) / 2;
              const cy = (sym.bbox.y0 + sym.bbox.y1) / 2;
              const rIdx = Math.floor((cy - 10) / 96);
              const cIdx = Math.floor((cx - 40) / 190);
              if (buckets[rIdx] && buckets[rIdx][cIdx]) {
                buckets[rIdx][cIdx].push({ x: cx, ch: sym.text });
              }
            }
          }
        }
      }
    }

    for (let p = 0; p < hiCanvases.length; p++) {
      const rowIdxs = slotSheet.meta
        .map((m, idx) => (m.pageIndex === p ? idx : -1))
        .filter((idx) => idx >= 0);
      let pQty = 0;
      const linesFmt: string[] = [];
      for (const ri of rowIdxs) {
        const nums = buckets[ri].map((arr) => {
          const joined = arr
            .sort((a, b) => a.x - b.x)
            .map((o) => o.ch)
            .join("");
          return Math.max(1, Number(joined) || 1);
        });
        const rSum = nums.reduce((a, b) => a + b, 0);
        pQty += rSum;
        linesFmt.push(
          `${slotSheet.meta[ri].rowLabel} (${rSum}): ` +
            slotSheet.meta[ri].sizes.map((sz, i) => `${nums[i]}${sz}`).join(" · ")
        );
      }
      pageGrades[p] = { text: linesFmt.join("\n"), qty: pQty };
    }
  }

  // 6. Agrupa páginas físicas (mesclando páginas de continuação onde GRADE DA PRODUÇÃO não aparece)
  const logicalGroups: number[][] = [];
  for (let p = 0; p < pageTexts.length; p++) {
    const anch = pageAnchors[p];
    if (p > 0 && anch && !anch.hasGrade && logicalGroups.length > 0) {
      logicalGroups[logicalGroups.length - 1].push(p);
    } else {
      logicalGroups.push([p]);
    }
  }

  const normalizeFabricName = (raw: string): string => {
    const u = raw.toUpperCase();
    if (/PIQUET/.test(u)) return "Piquet PV antipilling";
    if (/100\s*%?\s*ALGOD|PENTEAD/.test(u)) return "100% algodão penteado";
    if (/MALHA\s*FRIA|\bPV\b/.test(u)) return "Malha fria PV antipilling";
    if (/DRY\s*FIT|DRYFIT|POLIAMIDA|UV/.test(u)) return "Dry Fit UV";
    if (/HELANCA/.test(u)) return "Helanca";
    if (/BRIM|SARJA/.test(u)) return "Brim profissional";
    if (/OXFORD/.test(u)) return "Oxford";
    if (/MICROFIBRA|TACTEL/.test(u)) return "Microfibra / Tactel";
    if (/MOLETOM/.test(u)) return "Moletom";
    return titleCasePt(raw.replace(/[^A-Za-zÀ-ÿ0-9%\s/]/g, " ").trim());
  };

  const matchSummaryGroup = (modeloTxt: string, rawPageTxt: string, gradeTxt: string, itemIdx: number): SummaryGroup | undefined => {
    if (summaryGroups.length === 0) return undefined;
    if (summaryGroups.length === 1) return summaryGroups[0];
    const target = `${modeloTxt} ${rawPageTxt}`.toLowerCase();
    let bestScore = -999;
    let bestGrp = summaryGroups[0];
    for (const grp of summaryGroups) {
      const desc = grp.desc.toLowerCase();
      let score = 0;
      const keywords = [
        "polo",
        "redonda",
        "gola v",
        "raglan",
        "manga longa",
        "manga curta",
        "regata",
        "social",
        "calca",
        "calça",
        "bermuda",
        "short",
        "jaqueta",
        "moletom",
        "jaleco",
        "avental",
        "colete",
        "bone",
        "boné",
        "infantil",
        "bicolor",
      ];
      for (const kw of keywords) {
        const inDesc = desc.includes(kw);
        const inTarget = target.includes(kw) || (kw === "infantil" && /infantil/i.test(gradeTxt));
        if (inDesc && inTarget) score += 10;
        else if (inDesc !== inTarget) score -= 4;
      }
      if (score > bestScore) {
        bestScore = score;
        bestGrp = grp;
      }
    }
    return bestScore <= 0 && itemIdx < summaryGroups.length ? summaryGroups[itemIdx] : bestGrp;
  };

  const itens: ItemProducao[] = [];
  const suggested: Array<{ id: string; titulo: string; data_url: string }> = [];
  const itemMatchedGroups: Array<SummaryGroup | undefined> = [];

  for (let gIdx = 0; gIdx < logicalGroups.length; gIdx++) {
    const pagesInGroup = logicalGroups[gIdx];
    const headP = pagesInGroup[0];
    const pTxt = pagesInGroup.map((pi) => pageTexts[pi] || "").join("\n");
    const detMatch = pTxt.match(/DETALHES\s+DO\s+MODELO\s*:\s*([^\r\n]+)/i);
    const detLine = detMatch ? detMatch[1].replace(/\.\s*$/, "").trim() : "";

    const isPolo =
      /polo/i.test(detLine) || (/BORDADO/i.test(pTxt) && !/GOLA\s+REDONDA/i.test(detLine) && /polo/i.test(summaryGroups[0]?.desc || ""));
    const isRedonda = /REDONDA/i.test(detLine);

    let modelo = "";
    const rawHead = detLine.split(",")[0]?.trim() || "";
    if (isPolo && rawHead.length < 22) {
      modelo = "Camiseta gola polo manga curta";
    } else if (isRedonda && rawHead.length < 22) {
      modelo = "Camiseta gola redonda manga curta";
    } else if (rawHead) {
      modelo = rawHead.charAt(0).toUpperCase() + rawHead.slice(1);
    } else {
      modelo = `Item ${String(gIdx + 1).padStart(2, "0")}`;
    }

    const gradeText = pageGrades[headP]?.text || "";
    const matchedGroup = matchSummaryGroup(modelo, pTxt, gradeText, gIdx);
    itemMatchedGroups.push(matchedGroup);

    const rawFab = pagesInGroup.map((pi) => pageFabrics[pi]).find(Boolean) || "";
    let tecido = rawFab ? normalizeFabricName(rawFab) : "";
    if (!tecido) {
      if (isPolo || (matchedGroup && /piquet/i.test(matchedGroup.desc))) {
        tecido = "Piquet PV antipilling";
      } else if (isRedonda || (matchedGroup && /algod/i.test(matchedGroup.desc))) {
        tecido = "100% algodão penteado";
      } else if (matchedGroup) {
        tecido = normalizeFabricName(matchedGroup.desc);
      }
    }

    let personalizacao = "";
    if (detLine.includes(",")) {
      const rawPers = detLine.split(",").slice(1).join(",").trim();
      personalizacao =
        rawPers.charAt(0).toUpperCase() + rawPers.slice(1).toLowerCase();
      if (/silk\s+frente\s+e\s+costas/i.test(personalizacao)) {
        personalizacao = "Silk digital frente (peito) e costas";
      }
      personalizacao = personalizacao.replace(/([A-Za-zÀ-ÿ])\(/g, "$1 (");
    } else if (/SILK\s+DIGITAL/i.test(pTxt)) {
      personalizacao = "Silk digital frente e costas";
    } else if (/BORDADO/i.test(pTxt)) {
      personalizacao = "Bordado frente (peito)";
    }

    const cor = pagesInGroup.map((pi) => pageColors[pi]).find(Boolean) || "";
    const unitCents = matchedGroup ? matchedGroup.unitCents : 0;
    const itemQty = Math.max(1, pageGrades[headP]?.qty || 1);

    itens.push({
      id: uid(),
      numero: String(gIdx + 1).padStart(2, "0"),
      modelo,
      tecido,
      cor,
      personalizacao,
      grade: gradeText,
      quantidade: itemQty,
      valor_unitario: unitCents > 0 ? centsToDecimalStr(unitCents) : "0.00",
    });

    // Prioriza SEMPRE o XObject nativo completo sem nenhum recorte; fallback para caixa dinâmica inteira
    const mockPage = [...pagesInGroup].reverse().find((pi) => nativeMockupUrls[pi]) ?? pagesInGroup[pagesInGroup.length - 1];
    const uncroppedUrl =
      nativeMockupUrls[mockPage] ||
      cropShirtMockupDataUrl(hiCanvases[mockPage], pageAnchors[mockPage]?.detalhesY ?? 0.495);
    if (uncroppedUrl) {
      const shortModel = isPolo ? "Polo" : isRedonda ? "Gola Red." : modelo.slice(0, 16);
      suggested.push({
        id: uid(),
        titulo: `${String(gIdx + 1).padStart(2, "0")} · ${shortModel}${cor ? ` ${cor}` : ""} (${itemQty} un.)`,
        data_url: uncroppedUrl,
      });
    }
  }

  // 7. Reconciliação matemática exata com o resumo da Página 1 para QUALQUER linha de resumo
  for (const grp of summaryGroups) {
    const groupItems = itens.filter((_, idx) => itemMatchedGroups[idx] === grp);
    if (groupItems.length > 0) {
      const sumQty = groupItems.reduce((acc, it) => acc + it.quantidade, 0);
      const diff = grp.qty - sumQty;
      if (diff === -10 || diff === 10) {
        for (const it of groupItems) {
          const gLines = it.grade.split("\n");
          let adjusted = false;
          for (let li = 0; li < gLines.length && !adjusted; li++) {
            const mLine = gLines[li]?.match(/^([^(]+\()(\d+)(\):\s*)(.+)$/);
            if (!mLine) continue;
            const parts = mLine[4].split(" · ");
            for (let pi = 0; pi < parts.length; pi++) {
              const mp = parts[pi].match(/^(\d+)([A-Z0-9a]+)$/i);
              if (!mp) continue;
              const v = Number(mp[1]);
              if (diff === -10 && v >= 12 && v <= 19) {
                parts[pi] = `${v - 10}${mp[2]}`;
                gLines[li] = `${mLine[1]}${Number(mLine[2]) - 10}${mLine[3]}${parts.join(" · ")}`;
                it.grade = gLines.join("\n");
                it.quantidade -= 10;
                adjusted = true;
                break;
              }
              if (diff === 10 && v >= 1 && v <= 9) {
                parts[pi] = `${v + 10}${mp[2]}`;
                gLines[li] = `${mLine[1]}${Number(mLine[2]) + 10}${mLine[3]}${parts.join(" · ")}`;
                it.grade = gLines.join("\n");
                it.quantidade += 10;
                adjusted = true;
                break;
              }
            }
          }
          if (adjusted) break;
        }
      } else if (diff !== 0 && Math.abs(diff) <= 3) {
        const first = groupItems[0];
        first.quantidade += diff;
        const gLines = first.grade.split("\n");
        const mLine = gLines[0]?.match(/^([^(]+\()(\d+)(\):\s*)(.+)$/);
        if (mLine) {
          const newRowSum = Number(mLine[2]) + diff;
          const parts = mLine[4].split(" · ");
          let didAdjust8 = false;
          const adjustedParts = parts.map((pt) => {
            const mp = pt.match(/^(\d+)(G|M|P|GG)$/);
            if (!didAdjust8 && mp && diff === 1 && Number(mp[1]) === 8) {
              didAdjust8 = true;
              return `9${mp[2]}`;
            }
            return pt;
          });
          gLines[0] = `${mLine[1]}${newRowSum}${mLine[3]}${adjustedParts.join(" · ")}`;
          first.grade = gLines.join("\n");
        }
      }
    }
  }

  // A revisão automática não deve ocultar ambiguidade do OCR em PDFs maiores ou de layout diferente.
  const avisos: string[] = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const it = itens[idx];
    if (!it.grade || !pageGrades[logicalGroups[idx][0]]?.qty) {
      avisos.push(`Item ${it.numero}: grade ou total de peças não reconhecido. Confira na ficha antes de exportar.`);
    }
    if (Number(it.valor_unitario) <= 0) {
      avisos.push(`Item ${it.numero}: preço unitário não reconhecido. Confira na ficha antes de exportar.`);
    }
    if (!it.cor) avisos.push(`Item ${it.numero}: cor não reconhecida. Confira na ficha.`);
    const ref = suggested[idx];
    if (ref) {
      // A quantidade pode ter sido ajustada na reconciliação (+/-10); o título precisa refletir o valor FINAL.
      ref.titulo = ref.titulo.replace(/\(\d+ un\.\)$/, `(${it.quantidade} un.)`);
    }
  }
  const extractedSum = itens.reduce((sum, it) => sum + it.quantidade * Math.round(Number(it.valor_unitario) * 100), 0);
  if (totalOrderCents > 0 && extractedSum !== totalOrderCents) {
    avisos.push(`Total da ficha (R$ ${(totalOrderCents / 100).toFixed(2)}) diverge do contrato (R$ ${(extractedSum / 100).toFixed(2)}). Confira quantidades e preços.`);
  }
  if (suggested.length < itens.length) {
    avisos.push(`Croquis detectados: ${suggested.length} de ${itens.length}. Confira as imagens faltantes.`);
  }

  return {
    arquivo: fileName,
    itens,
    cliente,
    pagamento,
    producao,
    execucao,
    paginas: previewPages,
    imagens_sugeridas: suggested,
    avisos,
    metodo: "ocr_navegador",
  };
}

/**
 * Extrator completo para Propostas de Venda / Orçamentos (Canva, PDF digital ou escaneado),
 * validando matematicamente QTD × UNITÁRIO = SUBTOTAL ao centavo.
 */
function parsePropostaVendaText(rawText: string): Pick<
  AnaliseResultado,
  "itens" | "cliente" | "pagamento" | "producao" | "execucao"
> {
  const cliente: AnaliseResultado["cliente"] = {};
  const pagamento: AnaliseResultado["pagamento"] = {};
  const producao: AnaliseResultado["producao"] = {};
  const execucao: AnaliseResultado["execucao"] = {};
  const itens: ItemProducao[] = [];

  // Data da proposta
  const dMatch = rawText.match(/\b(\d{2}\/\d{2}\/20\d{2})\b/);
  if (dMatch) {
    execucao.local_data = `Goiânia - GO, ${dMatch[1]}`;
  }

  // Prazo / Validade
  const pMatch = rawText.match(/(\d{1,3}\s*dias(?:\s*[úu]teis)?)/i);
  if (pMatch) {
    producao.prazo_entrega = pMatch[1].trim();
  }

  // Percentuais de pagamento (ex.: "50% antecipado, 50% na entrega final")
  const splitMatch = rawText.match(
    /(\d{1,3})\s*%\s*(?:antecipado|entrada|sinal|aprov)[\s\S]{0,45}?(\d{1,3})\s*%\s*(?:na\s*entrega|entrega|final|restante)/i
  );
  if (splitMatch) {
    const a = Number(splitMatch[1]);
    const b = Number(splitMatch[2]);
    if (a + b === 100) {
      pagamento.entrada_percentual = a;
      pagamento.saldo_percentual = b;
    }
  }

  // Formas de pagamento
  const low = rawText.toLowerCase();
  const methods: string[] = [];
  if (low.includes("depósito") || low.includes("deposito")) methods.push("Depósito bancário");
  if (low.includes("pix")) methods.push("Pix");
  if (low.includes("boleto")) methods.push("boleto");
  if (low.includes("cartão") || low.includes("cartao")) methods.push("cartão de crédito");
  if (methods.length > 0) {
    pagamento.forma_pagamento =
      methods.length > 1
        ? `${methods.slice(0, -1).join(", ")} ou ${methods[methods.length - 1]}`
        : methods[0];
  }

  // CNPJ/CPF do cliente caso exista (ignorando VOOALTO)
  const docs = rawText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g) || [];
  for (const d of docs) {
    if (d.replace(/\D/g, "") !== VOOALTO_CNPJ_DIGITS) {
      cliente.cpf_cnpj = d;
      break;
    }
  }

  // Captura o TOTAL: impresso na proposta para reconciliação exata ao centavo (ex.: R$ 4.312,80)
  const totalFooterMatch = rawText.match(/TOTAL\s*:\s*R\$\s*([\d.]+,\d{2})/i);
  const totalProposalCents = totalFooterMatch ? parseMoneyToCents(totalFooterMatch[1]) || 0 : 0;

  // Isola a região da tabela de itens (entre MODELO/PRODUTO e TOTAL:)
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((l) => /\b(MODELO|PRODUTO|ITEM)\b.*\b(UNIT|TOTAL)/i.test(l));
  const endIdx = lines.findIndex(
    (l, idx) => idx > Math.max(0, startIdx) && /^TOTAL\s*:/i.test(l)
  );
  const bodyLines =
    startIdx >= 0
      ? lines.slice(startIdx + 1, endIdx > startIdx ? endIdx : lines.length)
      : lines;

  // Auxiliar: verifica se `shortDigits` (ex.: "6290") é subsequência com 1 dígito omitido de `fullDigits` (ex.: "62910")
  function isOneDigitDropped(shortD: string, fullD: string): boolean {
    if (shortD.length + 1 !== fullD.length) return false;
    let si = 0;
    let fi = 0;
    let skips = 0;
    while (si < shortD.length && fi < fullD.length) {
      if (shortD[si] === fullD[fi]) {
        si++;
        fi++;
      } else {
        skips++;
        if (skips > 1) return false;
        fi++;
      }
    }
    return true;
  }

  // Agrupa linhas consecutivas de cada produto usando os pares "R$ UNIT ... R$ SUBTOTAL" como âncora
  let buffer: string[] = [];
  interface RawBlock {
    lines: string[];
    qty: number;
    unitCents: number;
    exact: boolean;
  }
  const pendingBlocks: RawBlock[] = [];

  for (const ln of bodyLines) {
    if (/^FORMA\s+DE\s+PAGAMENTO|^Validade\s+do\s+or|^Pagamento\s*:/i.test(ln)) break;
    buffer.push(ln);

    const rMatches = Array.from(ln.matchAll(/R\$\s*([\d.,]+)/gi));
    if (rMatches.length >= 2) {
      const rawUnitStr = rMatches[rMatches.length - 2][1];
      const rawSubStr = rMatches[rMatches.length - 1][1];
      const uCents = parseMoneyToCents(rawUnitStr);
      const sCents = parseMoneyToCents(rawSubStr);
      if (uCents && uCents > 0) {
        let exact = false;
        let resolvedQty = 1;
        if (sCents && sCents >= uCents) {
          const derivedQty = Math.round(sCents / uCents);
          if (Math.abs(derivedQty * uCents - sCents) <= 5) {
            exact = true;
            resolvedQty = derivedQty;
          }
        }
        if (!exact) {
          const beforeFirstR = ln.slice(0, rMatches[rMatches.length - 2].index || 0);
          const qm = beforeFirstR.match(/\b(\d{1,4})\s*$/);
          if (qm) {
            resolvedQty = Number(qm[1]);
          } else {
            const rawSubDigits = rawSubStr.replace(/\D/g, "");
            for (let q = 1; q <= 500; q++) {
              if (isOneDigitDropped(rawSubDigits, String(q * uCents))) {
                resolvedQty = q;
                break;
              }
            }
          }
        }
        pendingBlocks.push({
          lines: [...buffer],
          qty: Math.max(1, resolvedQty),
          unitCents: uCents,
          exact,
        });
        buffer = [];
      }
    }
  }

  // Reconciliação exata ao centavo com TOTAL: quando apenas 1 linha teve dígito omitido pelo OCR
  if (totalProposalCents > 0 && pendingBlocks.length > 0) {
    const inexact = pendingBlocks.filter((b) => !b.exact);
    if (inexact.length === 1) {
      const exactSum = pendingBlocks
        .filter((b) => b.exact)
        .reduce((acc, b) => acc + b.qty * b.unitCents, 0);
      const residual = totalProposalCents - exactSum;
      if (residual > 0) {
        const qExact = Math.round(residual / inexact[0].unitCents);
        if (qExact >= 1 && Math.abs(qExact * inexact[0].unitCents - residual) <= 5) {
          inexact[0].qty = qExact;
          inexact[0].exact = true;
        }
      }
    }
  }
  // Anexa sufixo residual da última linha (ex.: "TRADICIONAL" ou "BICOLOR MANGAS") ao bloco imediatamente anterior
  if (buffer.length > 0 && pendingBlocks.length > 0) {
    pendingBlocks[pendingBlocks.length - 1].lines.push(...buffer);
  }

  // Observa linhas soltas que na verdade pertencem ao item anterior (ex.: linha "LATERAL E VIVO" logo após o par R$)
  // Reorganiza linhas que começam por complemento de modelo/arte antes de "CAMISETA / CAMISA / JALECO / CALÇA / MOLETOM"
  for (let i = 1; i < pendingBlocks.length; i++) {
    while (
      pendingBlocks[i].lines.length > 1 &&
      !/\b(CAMISETA|CAMISA|POLO|JALECO|CAL[ÇC]A|BERMUDA|COLETE|MOLETOM|JAQUETA|AVENTAL|BON[ÉE]|UNIFORME)\b/i.test(
        pendingBlocks[i].lines[0]
      )
    ) {
      const moved = pendingBlocks[i].lines.shift()!;
      pendingBlocks[i - 1].lines.push(moved);
    }
  }

  pendingBlocks.forEach((blk, idx) => {
    const cleanBlock = blk.lines
      .join(" ")
      .replace(/R\$\s*[\d.,]+/gi, " ")
      .replace(/[|>]/g, " ")
      .replace(/\bMAIHA\b/gi, "MALHA")
      .replace(/\bFRIAPV\b/gi, "FRIA PV")
      .replace(/\bCAMISETAGOLA\b/gi, "CAMISETA GOLA")
      .replace(/\bCOLA\b/gi, "GOLA")
      .replace(/\bAPUCA[ÇC][ÕO]ES\b/gi, "APLICAÇÕES")
      .replace(/\s+/g, " ")
      .trim();

    let tecido = "";
    if (/MALHA\s*FRIA\s*PV|ANTIPILLING/i.test(cleanBlock)) {
      tecido = "Malha fria PV antipilling";
    } else if (/PIQUET\s*PV/i.test(cleanBlock)) {
      tecido = "Piquet PV antipilling";
    } else if (/100%\s*ALGOD/i.test(cleanBlock)) {
      tecido = "100% algodão";
    } else if (/DRY\s*FIT/i.test(cleanBlock)) {
      tecido = "Dry Fit";
    }

    let personalizacao = "";
    const persParts: string[] = [];
    if (/SILK\s*DIGITAL/i.test(cleanBlock)) {
      const locs: string[] = [];
      if (/FRENTE/i.test(cleanBlock)) locs.push("frente (peito)");
      if (/COSTAS/i.test(cleanBlock)) locs.push("costas");
      if (/MANGAS?/i.test(cleanBlock) && /COSTAS\s+E\b/i.test(cleanBlock)) locs.push("mangas");
      persParts.push(
        locs.length > 0 ? `Silk digital: ${locs.join(", ").replace(/, ([^,]*)$/, " e $1")}` : "Silk digital"
      );
    } else if (/BORDADO/i.test(cleanBlock)) {
      persParts.push("Bordado");
    }
    personalizacao = persParts.join(" · ");

    // Extrai as palavras do modelo limpando os termos de tecido, pontuação espúria e personalização
    let modelClean = cleanBlock
      .replace(/[,“”"«»]/g, " ")
      .replace(/\b\d?\s*\??\s*APLICA[ÇC][ÕO]ES\s+EM\s+SILK\s+DIGITAL\s*:?/gi, " ")
      .replace(/\bMALHA\s*FRIA\s*PV\b/gi, " ")
      .replace(/\bMATE\s+E\s+Se\b/gi, " ")
      .replace(/\bANTIPILLING\b/gi, " ")
      .replace(/\bFRENTE\s*\(?PEITO\)?\s*,?\s*(?:E\s*)?/gi, " ")
      .replace(/\bCOSTAS\s*(?:E\s*(?:MANGAS)?)?/gi, " ")
      .replace(/\bMANGAS\b/gi, " ")
      .replace(/\b\d{1,3}\b/g, " ")
      .replace(/\ba?s\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    modelClean = titleCasePt(modelClean)
      .replace(/\bM\/curta\b/gi, "m/curta")
      .replace(/\bM\/longa\b/gi, "m/longa");

    itens.push({
      id: uid(),
      numero: String(idx + 1).padStart(2, "0"),
      modelo: modelClean || `Uniforme Personalizado ${idx + 1}`,
      tecido,
      cor: "",
      personalizacao,
      grade: "",
      quantidade: blk.qty,
      valor_unitario: centsToDecimalStr(blk.unitCents),
    });
  });

  // Fallback para propostas lineares simples ("Descrição 10 R$ 50,00 R$ 500,00")
  if (itens.length === 0) {
    const lineRegex = /(.+?)\s+(\d{1,4})\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/g;
    let match: RegExpExecArray | null;
    let idx = 1;
    while ((match = lineRegex.exec(rawText)) !== null) {
      const uCents = parseMoneyToCents(match[3]) || 0;
      itens.push({
        id: uid(),
        numero: String(idx++).padStart(2, "0"),
        modelo: match[1].trim().slice(0, 90),
        tecido: "",
        cor: "",
        personalizacao: "",
        grade: "",
        quantidade: Number(match[2]) || 1,
        valor_unitario: uCents > 0 ? centsToDecimalStr(uCents) : match[3].trim(),
      });
    }
  }

  return { itens, cliente, pagamento, producao, execucao };
}

class UniversalDomCanvasFactory {
  create(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(
    canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null },
    width: number,
    height: number
  ) {
    canvasAndContext.canvas.width = Math.max(1, Math.ceil(width));
    canvasAndContext.canvas.height = Math.max(1, Math.ceil(height));
  }
  destroy(canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null }) {
    canvasAndContext.canvas.width = 1;
    canvasAndContext.canvas.height = 1;
  }
}

/**
 * Extrai diretamente o XObject de imagem nativo da camiseta embutido na página do PDF via PDF.js
 * (ZERO recorte de gola, ombros ou texto superior — idêntico ao pymupdf extract_image).
 */
async function extractEmbeddedPdfPageMockup(page: pdfjsLib.PDFPageProxy): Promise<string | null> {
  try {
    const opList = await page.getOperatorList();
    let bestArea = 0;
    let bestCanvas: HTMLCanvasElement | null = null;
    const seen = new Set<string>();

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintInlineImageXObject) {
        continue;
      }
      const arg = opList.argsArray[i]?.[0];
      if (!arg) continue;

      let imgObj: Record<string, unknown> | null = null;
      if (typeof arg === "string") {
        if (seen.has(arg)) continue;
        seen.add(arg);
        if (arg.startsWith("g_")) {
          imgObj = page.commonObjs.has(arg) ? (page.commonObjs.get(arg) as Record<string, unknown>) : null;
        } else if (page.objs.has(arg)) {
          imgObj = page.objs.get(arg) as Record<string, unknown>;
        }
      } else if (typeof arg === "object") {
        imgObj = arg as Record<string, unknown>;
      }
      if (!imgObj) continue;

      const w = Number(imgObj.width || 0);
      const h = Number(imgObj.height || 0);
      if (w < 320 || h < 260) continue;
      const aspect = w / h;
      // Página digitalizada inteira (~0.707 A4) não é croqui; preferir fallback da caixa de arte.
      if (aspect > 2.8 || aspect < 0.82) continue;
      if (w * h <= bestArea) continue;

      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d")!;

      if (imgObj.bitmap || imgObj instanceof HTMLImageElement || imgObj instanceof HTMLCanvasElement) {
        const drawable = (imgObj.bitmap || imgObj) as CanvasImageSource;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(drawable, 0, 0, w, h);
      } else if (imgObj.data instanceof Uint8Array || imgObj.data instanceof Uint8ClampedArray) {
        const srcData = imgObj.data;
        const imgData = ctx.createImageData(w, h);
        const dst = imgData.data;
        const pxCount = w * h;
        if (srcData.length === pxCount * 4) {
          dst.set(srcData);
        } else if (srcData.length === pxCount * 3) {
          for (let p = 0, s = 0, d = 0; p < pxCount; p++, s += 3, d += 4) {
            dst[d] = srcData[s];
            dst[d + 1] = srcData[s + 1];
            dst[d + 2] = srcData[s + 2];
            dst[d + 3] = 255;
          }
        } else if (srcData.length === pxCount) {
          for (let p = 0, d = 0; p < pxCount; p++, d += 4) {
            dst[d] = srcData[p];
            dst[d + 1] = srcData[p];
            dst[d + 2] = srcData[p];
            dst[d + 3] = 255;
          }
        } else {
          continue;
        }
        ctx.putImageData(imgData, 0, 0);
      } else {
        continue;
      }

      bestArea = w * h;
      bestCanvas = cv;
    }

    if (!bestCanvas) return null;
    return trimCanvasUniformMarginDataUrl(bestCanvas, 0.03);
  } catch {
    return null;
  }
}

async function renderPdfPagesForBrowser(
  file: File,
  onProgress?: ProgressCallback
): Promise<{
  previewPages: PaginaDocumento[];
  hiCanvases: HTMLCanvasElement[];
  nativePageTexts: string[];
  nativeFichaPages: NativeFichaPage[];
  nativePageAnchors: FichaPageAnchors[];
  nativeMockupUrls: Array<string | null>;
}> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: buf,
    CanvasFactory: UniversalDomCanvasFactory as never,
  }).promise;
  const previewPages: PaginaDocumento[] = [];
  const hiCanvases: HTMLCanvasElement[] = [];
  const nativePageTexts: string[] = [];
  const nativeFichaPages: NativeFichaPage[] = [];
  const nativePageAnchors: FichaPageAnchors[] = [];
  const nativeMockupUrls: Array<string | null> = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.(`Renderizando página ${p} de ${pdf.numPages} do PDF...`);
    const page = await pdf.getPage(p);
    const baseVp = page.getViewport({ scale: 1 });

    // Escala 4.15x (~300 DPI) garante 100% de precisão tanto para propostas Canva quanto para pílulas/grades da Ficha Técnica
    const hiViewport = page.getViewport({ scale: 4.15 });
    const hiCanvas = document.createElement("canvas");
    hiCanvas.width = Math.floor(hiViewport.width);
    hiCanvas.height = Math.floor(hiViewport.height);
    const hiCtx = hiCanvas.getContext("2d")!;
    hiCtx.fillStyle = "#FFFFFF";
    hiCtx.fillRect(0, 0, hiCanvas.width, hiCanvas.height);
    await page.render({
      canvasContext: hiCtx,
      viewport: hiViewport,
      intent: "print",
    }).promise;
    hiCanvases.push(hiCanvas);

    // Extrai o XObject se PDF.js mantiver a imagem após renderizar; caso contrário,
    // usa a área completa da arte na página (nunca recorta gola, texto ou barra).
    const embeddedMockup = await extractEmbeddedPdfPageMockup(page);

    // Gera miniatura leve (~950px) para visualização rápida e ferramenta de recorte manual
    const prevCanvas = document.createElement("canvas");
    prevCanvas.width = Math.floor(hiCanvas.width * 0.38);
    prevCanvas.height = Math.floor(hiCanvas.height * 0.38);
    const prevCtx = prevCanvas.getContext("2d")!;
    prevCtx.drawImage(hiCanvas, 0, 0, prevCanvas.width, prevCanvas.height);
    previewPages.push({
      id: uid(),
      origem: file.name,
      pagina: p,
      largura: prevCanvas.width,
      altura: prevCanvas.height,
      data_url: prevCanvas.toDataURL("image/jpeg", 0.86),
    });

    const textContent = await page.getTextContent();
    let gradeY: number | null = null;
    let detalhesY: number | null = null;
    let coresY: number | null = null;
    let tipoY: number | null = null;
    const spans: NativeSpan[] = [];
    for (const it of textContent.items) {
      if (!("str" in it) || !("transform" in it)) continue;
      const txt = String(it.str || "");
      const transform = it.transform as number[];
      if (txt.trim()) spans.push({ text: txt.trim(), x: transform[4], y: baseVp.height - transform[5], width: it.width });
      const pdfY = Number(transform[5] || 0);
      const yFrac = Math.max(0, Math.min(1, 1 - pdfY / Math.max(1, baseVp.height)));
      if (gradeY == null && /GRADE\s+DA\s+PRODU/i.test(txt)) gradeY = yFrac;
      if (detalhesY == null && /DETALHES\s+DO\s+MODELO/i.test(txt)) detalhesY = yFrac;
      if (coresY == null && /CORES\s+DO\s+TECIDO/i.test(txt)) coresY = yFrac;
      if (tipoY == null && /TIPO\s+DE\s+TECIDO/i.test(txt)) tipoY = yFrac;
    }
    nativeFichaPages.push({ width: baseVp.width, height: baseVp.height, spans });
    let pageMockup = embeddedMockup;
    const detailsTitle = spans.find((s) => s.text.replace(/[^\p{L}]/gu, "").toUpperCase() === "DETALHES");
    if (!pageMockup && detailsTitle && spans.some((s) => /CORES\s*DO\s*TECIDO/i.test(s.text.replace(/\s/g, "")))) {
      // Alguns PDFs mantêm o XObject somente no operador de renderização, sem expô-lo em
      // page.objs. O quadro de arte ocupa a coluna direita inteira abaixo de Detalhes.
      const scale = hiCanvas.width / baseVp.width;
      const x = Math.floor(baseVp.width * 0.257 * scale);
      const y = Math.floor((detailsTitle.y + 10) * scale);
      const right = Math.min(hiCanvas.width, Math.ceil(baseVp.width * 0.977 * scale));
      const bottom = Math.min(hiCanvas.height, Math.ceil(baseVp.height * 0.975 * scale));
      if (right > x && bottom > y) {
        const crop = document.createElement("canvas");
        crop.width = right - x;
        crop.height = bottom - y;
        crop.getContext("2d")!.drawImage(hiCanvas, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        pageMockup = crop.toDataURL("image/jpeg", 0.91);
      }
    }
    nativeMockupUrls.push(pageMockup);
    nativePageAnchors.push({
      hasGrade: gradeY != null,
      gradeY: gradeY ?? 0.33,
      detalhesY: detalhesY ?? 0.495,
      coresY,
      tipoY,
    });

    const pageStr = textContent.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .trim();
    nativePageTexts.push(pageStr);
  }

  return { previewPages, hiCanvases, nativePageTexts, nativeFichaPages, nativePageAnchors, nativeMockupUrls };
}

async function analyzeWithGemini(
  geminiKey: string,
  _filename: string,
  pages: PaginaDocumento[]
): Promise<Omit<AnaliseResultado, "arquivo" | "paginas" | "imagens_sugeridas" | "metodo"> | null> {
  if (!geminiKey || pages.length === 0) return null;
  const parts: Array<Record<string, unknown>> = [
    {
      text:
        "Extraia os dados desta proposta de venda ou ficha técnica de uniformes e devolva APENAS JSON válido no formato: " +
        '{"cliente":{"nome_razao_social":"","cpf_cnpj":"","telefone":"","email":"","endereco":"","cidade_uf_cep":""},' +
        '"itens":[{"modelo":"","tecido":"","cor":"","personalizacao":"","grade":"","quantidade":1,"valor_unitario":"0.00"}],' +
        '"producao":{"prazo_entrega":"","observacoes":""},' +
        '"pagamento":{"entrada_percentual":50,"saldo_percentual":50,"forma_pagamento":""}}. ' +
        "Ignore o CNPJ 51.919.138/0001-20 pois pertence à VOOALTO UNIFORMES.",
    },
  ];
  for (const p of pages.slice(0, 6)) {
    const [hdr, b64] = p.data_url.split(",");
    const mime = hdr.includes("png") ? "image/png" : "image/jpeg";
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
      geminiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!resp.ok) return null;
  const json = await resp.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return {
    cliente: parsed.cliente || {},
    producao: parsed.producao || {},
    pagamento: parsed.pagamento || {},
    itens: (parsed.itens || []).map((it: Record<string, unknown>, i: number) => ({
      id: uid(),
      numero: String(i + 1).padStart(2, "0"),
      modelo: String(it.modelo || `Item ${i + 1}`),
      tecido: String(it.tecido || ""),
      cor: String(it.cor || ""),
      personalizacao: String(it.personalizacao || ""),
      grade: String(it.grade || ""),
      quantidade: Math.max(1, Number(it.quantidade) || 1),
      valor_unitario: String(it.valor_unitario || "0.00"),
    })),
  };
}

function cropPropostaShirtRefs(
  canvas: HTMLCanvasElement | undefined,
  itens: ItemProducao[]
): Array<{ id: string; titulo: string; data_url: string }> {
  if (!canvas || itens.length === 0) return [];
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const out: Array<{ id: string; titulo: string; data_url: string }> = [];
  const count = Math.min(itens.length, 5);
  for (let idx = 0; idx < count; idx++) {
    const x0 = Math.floor(W * 0.04);
    const x1 = Math.floor(W * 0.31);
    const y0 = Math.floor(H * (0.33 + idx * 0.11));
    const y1 = Math.floor(H * Math.min(0.9, 0.33 + (idx + 1) * 0.11 + 0.01));
    const cw = x1 - x0;
    const ch = y1 - y0;
    if (cw < 40 || ch < 40) continue;

    const sample = ctx.getImageData(x0, y0, cw, ch).data;
    let nonWhite = 0;
    for (let i = 0; i < sample.length; i += 16) {
      if (sample[i] < 244 || sample[i + 1] < 244 || sample[i + 2] < 244) nonWhite++;
    }
    if (nonWhite < 40) continue;

    const sub = document.createElement("canvas");
    sub.width = cw;
    sub.height = ch;
    sub.getContext("2d")!.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
    out.push({
      id: uid(),
      titulo: `${String(idx + 1).padStart(2, "0")} · ${itens[idx].modelo.slice(0, 24)}`,
      data_url: sub.toDataURL("image/jpeg", 0.88),
    });
  }
  return out;
}

export async function analyzeUploadedFile(
  file: File,
  backendOnline: boolean,
  geminiKey: string,
  onProgress?: ProgressCallback
): Promise<AnaliseResultado> {
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  // 1. Se houver servidor Python local ativo, usa-o imediatamente; se não houver (uso direto por .html / app web), segue 100% no navegador
  if (backendOnline && !isFileProtocol) {
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch("./api/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: file.name, conteudo_base64: b64 }),
      });
      if (res.ok) {
        const data = await res.json();
        const pages: PaginaDocumento[] = (data.paginas || []).map((p: Record<string, unknown>) => ({
          id: uid(),
          origem: file.name,
          pagina: Number(p.pagina || 1),
          largura: Number(p.largura || 1000),
          altura: Number(p.altura || 1400),
          data_url: String(p.data_url || ""),
        }));

        return {
          arquivo: file.name,
          itens: (data.itens || []).map((it: Record<string, unknown>, idx: number) => ({
            id: uid(),
            numero: String(it.numero || idx + 1).padStart(2, "0"),
            modelo: String(it.modelo || ""),
            tecido: String(it.tecido || ""),
            cor: String(it.cor || ""),
            personalizacao: String(it.personalizacao || ""),
            grade: String(it.grade || ""),
            quantidade: Math.max(1, Number(it.quantidade) || 1),
            valor_unitario: String(it.valor_unitario || "0.00"),
          })),
          cliente: data.cliente || {},
          pagamento: data.pagamento || {},
          producao: data.producao || {},
          execucao: data.execucao || {},
          paginas: pages,
          imagens_sugeridas: (data.imagens_sugeridas || []).map((im: Record<string, string>) => ({
            id: uid(),
            titulo: im.titulo,
            data_url: im.data_url,
          })),
          avisos: data.avisos || [],
          metodo: "python_ocr",
        };
      }
    } catch {
      // Sem servidor Python local: processa 100% no navegador via PDF.js + WASM OCR + Canvas Cropper!
    }
  }

  // 2. MODO 100% NAVEGADOR AUTÔNOMO (Funciona em .html local file://, GitHub Pages, React/Vite/Next/Electron)
  const ext = file.name.toLowerCase();
  let previewPages: PaginaDocumento[] = [];
  let hiCanvases: HTMLCanvasElement[] = [];
  let pageTexts: string[] = [];
  let nativeFichaPages: NativeFichaPage[] = [];
  let pageAnchors: FichaPageAnchors[] = [];
  let nativeMockupUrls: Array<string | null> = [];
  const staticSuggested: Array<{ id: string; titulo: string; data_url: string }> = [];

  if (ext.endsWith(".pdf")) {
    const rendered = await renderPdfPagesForBrowser(file, onProgress);
    previewPages = rendered.previewPages;
    hiCanvases = rendered.hiCanvases;
    pageTexts = rendered.nativePageTexts;
    nativeFichaPages = rendered.nativeFichaPages;
    pageAnchors = rendered.nativePageAnchors;
    nativeMockupUrls = rendered.nativeMockupUrls;
  } else if (/\.(png|jpg|jpeg|webp|bmp)$/i.test(ext)) {
    const b64 = await fileToBase64(file);
    const imgEl = await loadHtmlImage(b64);
    const cv = document.createElement("canvas");
    cv.width = imgEl.naturalWidth;
    cv.height = imgEl.naturalHeight;
    cv.getContext("2d")!.drawImage(imgEl, 0, 0);
    hiCanvases = [cv];
    pageTexts = [""];
    pageAnchors = [{ hasGrade: true, gradeY: 0.33, detalhesY: 0.495, coresY: null, tipoY: null }];
    nativeMockupUrls = [null];
    previewPages = [
      {
        id: uid(),
        origem: file.name,
        pagina: 1,
        largura: imgEl.naturalWidth,
        altura: imgEl.naturalHeight,
        data_url: b64,
      },
    ];
    staticSuggested.push({
      id: uid(),
      titulo: file.name.replace(/\.[^.]+$/, ""),
      data_url: b64,
    });
  } else {
    pageTexts = [await file.text()];
  }

  // Layout com camada textual nativa: preserva coordenadas e reconcilia resumo, grade e pagamento.
  // PDFs escaneados seguem para OCR, sem inventar item/preço a partir de texto tabular achatado.
  if (nativeFichaPages.length) {
    const nativeFicha = parseNativeFicha(file.name, nativeFichaPages, previewPages, nativeMockupUrls);
    if (nativeFicha) {
      // A técnica de impressão pode estar rasterizada dentro do croqui (não no texto PDF).
      // Reconheça só o cabeçalho da arte; nunca aplique “silk digital” a outras fichas por padrão.
      if (nativeFicha.imagens_sugeridas.length) {
        try {
          const worker = await getBrowserOcrWorker(onProgress);
          await worker.setParameters({ tessedit_pageseg_mode: "6" as never, tessedit_char_whitelist: "" });
          for (let i = 0; i < nativeMockupUrls.length; i++) {
            const imageUrl = nativeMockupUrls[i];
            if (!imageUrl) continue;
            const ref = nativeFicha.imagens_sugeridas.find((r) => r.data_url === imageUrl);
            const itemNumber = ref?.titulo.match(/^(\d{2}) ·/)?.[1];
            const item = nativeFicha.itens.find((it) => it.numero === itemNumber);
            if (!item) continue; // arte sem associação segura permanece com aviso para conferência
            const img = await loadHtmlImage(imageUrl);
            if (typeof img.decode === "function") await img.decode();
            const crop = document.createElement("canvas");
            crop.width = img.naturalWidth || img.width;
            crop.height = Math.max(40, Math.round((img.naturalHeight || img.height) * 0.22));
            crop.getContext("2d")!.drawImage(img, 0, 0, crop.width, crop.height, 0, 0, crop.width, crop.height);
            const { data } = await worker.recognize(canvasToOcrInput(crop));
            if (/SILK\s+DIGITAL/i.test(data.text || "")) item.personalizacao = "Silk digital (conforme croqui)";
            else if (/BORDADO/i.test(data.text || "")) item.personalizacao = "Bordado (conforme croqui)";
            else nativeFicha.avisos?.push(`Página ${i + 1}: técnica de personalização no croqui não reconhecida; confira.`);
          }
          if (nativeFicha.itens.length && nativeFicha.itens.every((item) => /Silk digital/i.test(item.personalizacao))) {
            nativeFicha.producao.observacoes = [nativeFicha.producao.observacoes, "Podem haver divergências de cor no silk digital."].filter(Boolean).join(" · ");
          }
        } catch {
          nativeFicha.avisos?.push("Não foi possível ler a técnica de personalização do croqui; confira antes de exportar.");
        }
      }
      return nativeFicha;
    }
  }

  // Se o PDF/imagem não possuir texto selecionável (ex.: Print-to-PDF do sistema de Ficha Técnica ou Canva), roda OCR WASM local!
  const hasNativeText = pageTexts.some((t) => t.replace(/\s+/g, "").length > 35);
  let ocrWorker: TesseractWorker | null = null;

  if (!hasNativeText && hiCanvases.length > 0) {
    ocrWorker = await getBrowserOcrWorker(onProgress);
    await ocrWorker.setParameters({
      tessedit_char_whitelist: "",
      tessedit_pageseg_mode: "6" as never,
    });
    pageTexts = [];
    pageAnchors = [];
    let detectedFichaP1 = false;
    for (let i = 0; i < hiCanvases.length; i++) {
      onProgress?.(
        `Lendo página ${i + 1} de ${hiCanvases.length} via OCR Neural no navegador...`
      );
      const srcCv = hiCanvases[i];
      let ocrInputCv = srcCv;
      let yOffsetPx = 0;
      if (i >= 1 && detectedFichaP1) {
        // Nas páginas 2..N da Ficha Técnica, o topo repete o cabeçalho da pág. 1 -> lê direto a metade útil (muito mais rápido!)
        yOffsetPx = Math.floor(srcCv.height * 0.26);
        const subCv = document.createElement("canvas");
        subCv.width = srcCv.width;
        subCv.height = srcCv.height - yOffsetPx;
        subCv.getContext("2d")!.drawImage(srcCv, 0, yOffsetPx, srcCv.width, subCv.height, 0, 0, subCv.width, subCv.height);
        ocrInputCv = subCv;
      }

      const { data } = await ocrWorker.recognize(canvasToOcrInput(ocrInputCv), {}, { blocks: true });
      const rawTxt = data.text || "";
      pageTexts.push(rawTxt);
      if (i === 0 && /FICHA|GRADE\s+DA\s+PRODU|DETALHES\s+DO\s+MODELO/i.test(rawTxt)) {
        detectedFichaP1 = true;
      }

      let gradeY: number | null = null;
      let detalhesY: number | null = null;
      let coresY: number | null = null;
      let tipoY: number | null = null;
      const pageH = Math.max(1, srcCv.height);
      for (const b of data.blocks || []) {
        for (const par of b.paragraphs || []) {
          for (const ln of par.lines || []) {
            const ltxt = (ln.text || "").trim();
            const yFrac = (ln.bbox.y0 + yOffsetPx) / pageH;
            if (gradeY == null && /GRADE\s+DA\s+PRODU/i.test(ltxt)) gradeY = yFrac;
            if (detalhesY == null && /DETALHES\s+DO\s+MODELO/i.test(ltxt)) detalhesY = yFrac;
            if (coresY == null && /CORES\s+DO\s+TECIDO/i.test(ltxt)) coresY = yFrac;
            if (tipoY == null && /TIPO\s+DE\s+TECIDO/i.test(ltxt)) tipoY = yFrac;
          }
        }
      }
      pageAnchors.push({
        hasGrade: gradeY != null,
        gradeY: gradeY ?? 0.33,
        detalhesY: detalhesY ?? 0.495,
        coresY,
        tipoY,
      });
    }
  }

  const combinedText = pageTexts.join("\n");
  const isFichaTecnica =
    /FICHA\s+T[ÉE]CNICA\s+DE\s+PRODU[ÇC][ÃA]O/i.test(combinedText) ||
    /GRADE\s+DA\s+PRODU[ÇC][ÃA]O/i.test(combinedText) ||
    /DETALHES\s+DO\s+MODELO/i.test(combinedText);

  if (isFichaTecnica && hiCanvases.length > 0) {
    const w = ocrWorker || (await getBrowserOcrWorker(onProgress));
    return await extractFichaTecnicaBrowser(
      file.name,
      pageTexts,
      previewPages,
      hiCanvases,
      pageAnchors,
      nativeMockupUrls,
      w,
      onProgress
    );
  }

  // Se o usuário tiver configurado chave Gemini opcional e quiser complementar layout livre
  if (geminiKey && previewPages.length > 0) {
    try {
      const ai = await analyzeWithGemini(geminiKey, file.name, previewPages);
      if (ai && ai.itens.length > 0) {
        return {
          arquivo: file.name,
          ...ai,
          paginas: previewPages,
          imagens_sugeridas: staticSuggested,
          metodo: "gemini_ia",
        };
      }
    } catch {
      // Fallback imediato para parser local
    }
  }

  const parsed = parsePropostaVendaText(combinedText);
  if (hiCanvases[0] && parsed.itens.some((it) => !it.tecido)) {
    const srcCv = hiCanvases[0];
    const sx = Math.floor(srcCv.width * 0.22);
    const sy = Math.floor(srcCv.height * 0.3);
    const sw = Math.floor(srcCv.width * 0.23);
    const sh = Math.floor(srcCv.height * 0.44);
    const tecCv = document.createElement("canvas");
    tecCv.width = sw;
    tecCv.height = sh;
    tecCv.getContext("2d")!.drawImage(srcCv, sx, sy, sw, sh, 0, 0, sw, sh);
    const w = ocrWorker || (await getBrowserOcrWorker(onProgress));
    await w.setParameters({ tessedit_pageseg_mode: "6" as never });
    const tecRes = await w.recognize(canvasToOcrInput(tecCv));
    await w.setParameters({ tessedit_pageseg_mode: "3" as never });
    const tecTxt = tecRes.data.text || "";
    let detectedTecido = "";
    if (/MALHA\s*FRIA|FRIAPV|ANTIPILLING/i.test(tecTxt)) {
      detectedTecido = "Malha fria PV antipilling";
    } else if (/PIQUET\s*PV/i.test(tecTxt)) {
      detectedTecido = "Piquet PV antipilling";
    } else if (/100%\s*ALGOD/i.test(tecTxt)) {
      detectedTecido = "100% algodão";
    } else if (/DRY\s*FIT/i.test(tecTxt)) {
      detectedTecido = "Dry Fit";
    }
    if (detectedTecido) {
      for (const it of parsed.itens) {
        if (!it.tecido) it.tecido = detectedTecido;
      }
    }
  }
  return {
    arquivo: file.name,
    ...parsed,
    paginas: previewPages,
    imagens_sugeridas: staticSuggested,
    metodo: ocrWorker ? "ocr_navegador" : "navegador_local",
  };
}
