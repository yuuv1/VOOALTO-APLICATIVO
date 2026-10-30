import type { AnaliseResultado } from "./browserExtractor";
import type { ItemProducao, PaginaDocumento } from "../types";
import { formatBRLFromCents, parseCents, uid } from "./calculations";

/** PDF.js native text layer: one positioned text fragment per PDF text operation. */
export interface NativeSpan {
  text: string;
  x: number;
  y: number; // page coordinates, from top
  width: number;
}
export interface NativeFichaPage {
  width: number;
  height: number;
  spans: NativeSpan[];
}

const bare = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
const normalizedText = (text: string) => text.replace(/\s+/g, " ").trim();
const numeric = (sp: NativeSpan) => sp.text.trim().replace(/\s/g, "");
const money = (text: string) => parseCents(text.replace(/^[^\d]+/, ""));
const near = (sp: NativeSpan, y: number, tolerance = 5) => Math.abs(sp.y - y) <= tolerance;
const byPosition = (a: NativeSpan, b: NativeSpan) => a.y - b.y || a.x - b.x;

function anchor(page: NativeFichaPage, keyword: string): NativeSpan | undefined {
  const direct = page.spans.find((sp) => bare(sp.text).includes(keyword));
  if (direct) return direct;
  // PDF.js may split a letter-spaced title (e.g. “D E T A L H E S D O M O D E L O”)
  // into several adjacent operations on the same baseline.
  for (const part of page.spans) {
    if (!part.text.trim() || !keyword.startsWith(bare(part.text))) continue;
    const line = page.spans.filter((sp) => sp.text.trim() && near(sp, part.y, 2) && sp.x >= part.x)
      .sort((a, b) => a.x - b.x);
    if (bare(line.map((sp) => sp.text).join(" ")).includes(keyword)) return part;
  }
  return undefined;
}

function normalizeModel(raw: string): string {
  const cleaned = normalizedText(raw);
  if (/\bGOLA\s*(?:O|REDONDA)\s+MANGA\s+CURTA\b/i.test(cleaned)) return "Camiseta gola redonda manga curta";
  if (/\bGOLA\s+POLO\s+MANGA\s+CURTA\b/i.test(cleaned)) return "Camiseta gola polo manga curta";
  if (/^CAMISETA\b/i.test(cleaned)) return cleaned.toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return cleaned;
}

interface SummaryRow {
  numero: number;
  descricao: string;
  modelo: string;
  quantidade: number;
  unitCents: number;
  subCents: number | null;
}

function productionRows(page: NativeFichaPage, warnings: string[]): SummaryRow[] {
  const h = page.height, w = page.width;
  const info = anchor(page, "INFORMACOESDAPRODUCAO");
  const grade = anchor(page, "GRADEDAPRODUCAO");
  if (!info || !grade) return [];
  const within = page.spans.filter((s) => s.y > info.y + 5 && s.y < grade.y - 7);
  const nums = within.filter((s) => s.x < w * 0.07 && /^\d{1,2}$/.test(numeric(s)));
  const rows: SummaryRow[] = [];
  for (const n of nums) {
    const desc = within.filter((s) => near(s, n.y) && s.x > w * 0.07 && s.x < w * 0.48)
      .sort((a, b) => a.x - b.x).map((s) => s.text).join(" ").trim();
    const price = within.find((s) => near(s, n.y) && s.x >= w * 0.53 && s.x < w * 0.60 && /^\d[\d.]*,\d{2}$/.test(numeric(s)));
    const quantity = within.find((s) => near(s, n.y) && s.x >= w * 0.60 && s.x < w * 0.66 && /^\d{1,5}$/.test(numeric(s)));
    if (!desc || !price || !quantity) continue; // ignores unfilled placeholder rows
    const q = Number(numeric(quantity));
    const u = money(price.text);
    if (!q || !u || /DESCRI[CÇ][AÃ]O\s+DO\s+PRODUTO/i.test(desc)) continue;
    const subtotal = within.find((s) => near(s, n.y) && s.x >= w * 0.67 && s.x < w * 0.79 && /R\$\s*[\d.,]+/.test(s.text));
    const subCents = subtotal ? money(subtotal.text) : null;
    if (subCents !== null && q * u !== subCents) {
      warnings.push(`Item ${n.text.trim()}: quantidade × valor unitário diverge do subtotal impresso.`);
    }
    rows.push({ numero: Number(numeric(n)), descricao: desc, modelo: normalizeModel(desc), quantidade: q, unitCents: u, subCents });
  }
  return rows.sort((a, b) => a.numero - b.numero);
}

function readGrade(page: NativeFichaPage, warnings: string[], pageNum: number): { grade: string; quantity: number } {
  const w = page.width;
  const grade = anchor(page, "GRADEDAPRODUCAO");
  const details = anchor(page, "DETALHESDOMODELO");
  if (!grade || !details || details.y <= grade.y) return { grade: "", quantity: 0 };
  const band = page.spans.filter((s) => s.y >= grade.y + 5 && s.y < details.y - 5);
  const adultSizes = new Set(["PP", "P", "M", "G", "GG", "3G", "4G", "5G", "6G", "7G"]);
  const kidSizes = new Set(["2A", "4A", "6A", "8A", "10A", "12A", "14A"]);
  const rows: Array<[string, RegExp]> = [
    ["Masc", /^MASCULINO$/i], ["Baby look", /^BABY\s*LOOK/i], ["Infantil", /^INFANTIL$/i],
  ];
  let sum = 0;
  const lines: string[] = [];
  for (const [label, pattern] of rows) {
    const row = band.find((sp) => sp.x < w * 0.14 && pattern.test(sp.text.trim()));
    if (!row) continue;
    const sizeNames = label === "Infantil" ? kidSizes : adultSizes;
    const headings = band.filter((sp) =>
      sizeNames.has(bare(sp.text)) && sp.x > w * 0.12 && sp.x < w * 0.83 && sp.y < row.y - 6 && row.y - sp.y < (label === "Infantil" ? 30 : 48)
    );
    // For adults the size heading is above Masc; Baby look uses the same first heading.
    const adultHeadings = label === "Baby look" ? band.filter((sp) =>
      adultSizes.has(bare(sp.text)) && sp.x > w * 0.12 && sp.x < w * 0.83 && sp.y < row.y && row.y - sp.y < 70
    ) : headings;
    const cols = label === "Baby look" ? adultHeadings : headings;
    const values = band.filter((sp) => /^\d{1,3}$/.test(numeric(sp)) && near(sp, row.y, 5) && sp.x >= w * 0.12 && sp.x < w * 0.83);
    const tokens: string[] = [];
    let rowSum = 0;
    for (const v of values) {
      const closest = [...cols].sort((a, b) => Math.abs(a.x + a.width / 2 - (v.x + v.width / 2)) - Math.abs(b.x + b.width / 2 - (v.x + v.width / 2)))[0];
      if (!closest || Math.abs((v.x + v.width / 2) - (closest.x + closest.width / 2)) > w * 0.036) continue;
      const size = closest.text.trim();
      const count = Number(numeric(v));
      if (count > 0) {
        tokens.push(/^\d/.test(size) ? `${count}un ${size}` : `${count}${size}`);
        rowSum += count;
      }
    }
    const printed = band.find((sp) => near(sp, row.y, 5) && sp.x > w * 0.85 && sp.x < w * 0.91 && /^\d+$/.test(numeric(sp)));
    if (printed && Number(numeric(printed)) !== rowSum) warnings.push(`Página ${pageNum}: total da grade ${label} (${rowSum}) diverge do impresso (${numeric(printed)}).`);
    if (tokens.length) { lines.push(`${label} (${rowSum}): ${tokens.join(" · ")}`); sum += rowSum; }
  }
  const boxed = band.find((sp) => sp.x > w * 0.91 && /^\d{1,5}$/.test(numeric(sp)) && sp.y > grade.y + 15 && sp.y < grade.y + 65);
  if (boxed && Number(numeric(boxed)) !== sum) warnings.push(`Página ${pageNum}: grade soma ${sum} peças, mas a ficha indica ${numeric(boxed)}.`);
  return { grade: lines.join("\n"), quantity: sum };
}

function textRightOf(page: NativeFichaPage, label: string, maxX: number, minY: number, maxY: number): string {
  const l = anchor(page, label);
  if (!l) return "";
  return page.spans.filter((s) => s.x >= l.x + l.width + 2 && s.x < maxX && s.y >= minY && s.y <= maxY)
    .sort(byPosition).map((s) => s.text.trim()).filter(Boolean).join(" ");
}

/**
 * Parse the text layer BEFORE OCR: print-to-PDF V6 sometimes has positioned text operations,
 * letter-spaced headers and no textual model under “DETALHES DO MODELO”.
 * Its item description/prices come from the first-page summary; each page has its own grade/mockup.
 * Never substitute default 50/50 payment or fabricate missing prices.
 */
export function parseNativeFicha(
  filename: string,
  pages: NativeFichaPage[],
  preview: PaginaDocumento[],
  mockups: Array<string | null>
): AnaliseResultado | null {
  const first = pages[0];
  if (!first || !anchor(first, "INFORMACOESDAPRODUCAO") || !anchor(first, "GRADEDAPRODUCAO") || !anchor(first, "DADOSDOCLIENTE")) return null;
  const avisos: string[] = [];
  // O resumo pode se repetir ou continuar nas páginas seguintes. A chave é o Nº do item,
  // não a página: repetir uma linha não dobra a produção, e linhas 4/5 não se perdem.
  const byNumber = new Map<number, SummaryRow>();
  for (let p = 0; p < pages.length; p++) {
    for (const row of productionRows(pages[p], avisos)) {
      const prior = byNumber.get(row.numero);
      if (!prior) byNumber.set(row.numero, row);
      else if (prior.descricao !== row.descricao || prior.quantidade !== row.quantidade || prior.unitCents !== row.unitCents) {
        avisos.push(`Página ${p + 1}: item ${row.numero} diverge do resumo anterior; confira descrição, quantidade e preço.`);
      }
    }
  }
  const rows = [...byNumber.values()].sort((a, b) => a.numero - b.numero);
  if (!rows.length) return null; // scanned/ambiguous PDFs are handled by OCR, never by a guessed default
  if (rows.some((r, i) => r.numero !== i + 1)) avisos.push("Numeração dos itens não é sequencial; confira se faltam modelos no resumo.");
  const w = first.width, h = first.height;
  const doc = first.spans.find((sp) => /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(sp.text) && sp.x < w * .80 && sp.y < h * .22);
  const rawDate = first.spans.filter((s) => s.x > w * .83 && s.y >= h * .025 && s.y < h * .06 && /^(\d{1,4}|\/)$/i.test(s.text.trim())).sort((a, b) => a.x - b.x).map((s) => s.text).join("");
  const dataEmissao = /^\d{2}\/\d{2}\/\d{4}$/.test(rawDate) ? rawDate : "";
  const headerNumber = first.spans.find((sp) => sp.x > w * .40 && sp.x < w * .60 && sp.y < h * .10 && /^\d{3,6}$/.test(sp.text.trim()));
  const days = first.spans.find((sp) => sp.x > w * .77 && sp.y < h * .11 && /\d+\s*DIAS/i.test(sp.text));
  const seller = textRightOf(first, "VENDEDOR", w * .97, h * .13, h * .16);
  const name = textRightOf(first, "NOMERAZAOSOCIAL", w * .50, h * .12, h * .16);
  const phoneRaw = textRightOf(first, "TELEFONE", w * .21, h * .16, h * .21);
  const phoneDigits = phoneRaw.replace(/[^\d]/g, "");
  const telefone = phoneDigits.length === 10 || phoneDigits.length === 11
    ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, -4)}-${phoneDigits.slice(-4)}`
    : phoneRaw;
  const endereco = textRightOf(first, "ENDERECO", w * .61, h * .16, h * .22);
  const cidade = textRightOf(first, "CIDADE", w * .82, h * .16, h * .21);
  const cep = textRightOf(first, "CEP", w * .99, h * .16, h * .21).match(/\d{2}\.?\d{3}-?\d{3}/)?.[0] || "";
  if (!cep) avisos.push("A ficha não informa CEP. Confira ou preencha o CEP do cliente antes de enviar.");

  const totalPrinted = first.spans.find((sp) => sp.x > w * .80 && sp.y > h * .24 && sp.y < h * .29 && /R\$\s*[\d.,]+/.test(sp.text));
  const totalCents = totalPrinted ? money(totalPrinted.text) : 0;
  const lineCents = rows.reduce((acc, r) => acc + r.unitCents * r.quantidade, 0);
  if (totalCents && totalCents !== lineCents) avisos.push(`Total impresso ${formatBRLFromCents(totalCents)} difere da soma dos itens ${formatBRLFromCents(lineCents)}.`);
  const entradaSpan = first.spans.find((sp) => sp.x > w * .87 && sp.y > h * .28 && sp.y < h * .31 && /^\d[\d.]*,\d{2}$/.test(sp.text.trim()));
  const saldoSpan = first.spans.find((sp) => sp.x > w * .87 && sp.y > h * .31 && sp.y < h * .35 && /^\d[\d.]*,\d{2}$/.test(sp.text.trim()));
  const entrada = entradaSpan ? money(entradaSpan.text) : NaN;
  const saldo = saldoSpan ? money(saldoSpan.text) : NaN;
  // Null explicitly clears the editor's default 50/50 when payment cannot be verified.
  const pagamento: AnaliseResultado["pagamento"] = { entrada_percentual: null, saldo_percentual: null };
  if (totalCents > 0 && Number.isFinite(entrada) && Number.isFinite(saldo) && entrada + saldo === totalCents) {
    const entryPct = Math.round(entrada * 100 / totalCents);
    // Rounding to integer percent only if amounts are within one cent of the calculated split.
    if (Math.abs(Math.round(totalCents * entryPct / 100) - entrada) <= 1) {
      pagamento.entrada_percentual = entryPct;
      pagamento.saldo_percentual = 100 - entryPct;
    } else avisos.push("Entrada/saldo em valores não correspondem a percentuais inteiros; revise o pagamento.");
  } else avisos.push("Entrada, saldo ou total não foram reconciliados; revise o pagamento (não aplicar 50/50 automaticamente).");

  // A tabela define os modelos/preços mesmo que não haja uma página para cada modelo.
  // Uma grade/croqui só é vinculada quando a posição E a quantidade conferem, ou quando
  // a quantidade identifica unicamente um item ainda não vinculado. Nunca replica grades.
  const itens: ItemProducao[] = rows.map((row) => ({
    id: uid(), numero: String(row.numero).padStart(2, "0"), modelo: row.modelo,
    tecido: "", cor: "", personalizacao: "Conforme croqui (técnica a confirmar)",
    grade: "", quantidade: row.quantidade, valor_unitario: (row.unitCents / 100).toFixed(2),
  }));
  const refs: AnaliseResultado["imagens_sugeridas"] = [];
  const assigned = new Set<number>();
  for (let p = 0; p < pages.length; p++) {
    const pg = pages[p];
    const detail = anchor(pg, "DETALHESDOMODELO");
    const colorLabel = anchor(pg, "CORESDOTECIDO");
    const fabricLabel = anchor(pg, "TIPODETECIDO");
    const colorTxt = colorLabel && fabricLabel ? pg.spans.filter((s) => s.x > pg.width * .07 && s.x < pg.width * .25 && s.y > colorLabel.y + 5 && s.y < fabricLabel.y - 5 && /[A-ZÀ-Ÿ]/i.test(s.text)).sort(byPosition).map((s) => s.text) : [];
    const cor = normalizedText([...new Set(colorTxt.map((t) => t.trim()))].join(" ")).toLowerCase().replace(/^./, (c) => c.toUpperCase());
    const fabricEnd = pg.spans.find((s) => s.y > (fabricLabel?.y || 0) && s.x < pg.width * .25 && /FEMININO/i.test(s.text));
    const fabric = fabricLabel ? pg.spans.filter((s) => s.x < pg.width * .25 && s.y > fabricLabel.y + 5 && s.y < (fabricEnd?.y ?? fabricLabel.y + 80) && /[A-ZÀ-Ÿ]/.test(s.text)).sort(byPosition).map((s) => s.text).join(" ") : "";
    const { grade, quantity } = readGrade(pg, avisos, p + 1);
    const possible = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => !assigned.has(i) && quantity > 0 && r.quantidade === quantity);
    const rowIndex = rows.length === pages.length && rows[p]?.quantidade === quantity && !assigned.has(p)
      ? p : possible.length === 1 ? possible[0].i : -1;
    const related = rowIndex < 0 ? undefined : itens[rowIndex];
    if (related) {
      related.grade = grade;
      related.cor = cor;
      related.tecido = /MALHA\s*FRIA/i.test(fabric) && /\bPV\b/.test(fabric) ? "Malha fria PV" : normalizedText(fabric);
      assigned.add(rowIndex);
    } else avisos.push(`Página ${p + 1}: grade (${quantity} peças) e croqui sem associação inequívoca a um item do resumo; confira manualmente.`);
    if (mockups[p]) refs.push({ id: uid(), titulo: related
      ? `${related.numero} · ${related.modelo}${cor ? ` · ${cor}` : ""} (${quantity} un.)`
      : `Página ${p + 1} · croqui sem modelo confirmado`, data_url: mockups[p]! });
    else avisos.push(`Página ${p + 1}: croqui não encontrado; confira a arte original.`);
    if (!detail) avisos.push(`Página ${p + 1}: área de detalhes do modelo não encontrada.`);
  }
  for (let i = 0; i < itens.length; i++) {
    if (!assigned.has(i)) avisos.push(`Item ${itens[i].numero}: não há grade/croqui associado com segurança; preencha ou confirme manualmente.`);
  }
  if (rows.length !== pages.length) avisos.push(`O resumo contém ${rows.length} modelo(s) e há ${pages.length} página(s); confira a associação dos croquis.`);
  if (!dataEmissao) avisos.push("Data de emissão não identificada; confira.");
  if (!name) avisos.push("Razão social não identificada; confira.");
  const local = normalizedText(cidade).replace(/,\s*Goiás$/i, " - GO");

  const result: AnaliseResultado = {
    arquivo: filename, itens,
    cliente: { nome_razao_social: normalizedText(name), cpf_cnpj: doc?.text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] || "", telefone,
      endereco: normalizedText(endereco), cidade_uf_cep: normalizedText(`${cidade}${cep ? ` · CEP ${cep}` : ""}`) },
    pagamento,
    producao: { prazo_entrega: days ? `${days.text.trim().toLowerCase()}${headerNumber ? ` (conforme Ficha Técnica Nº ${headerNumber.text.trim()})` : ""}` : "",
      observacoes: [headerNumber ? `Ficha Técnica Nº ${headerNumber.text.trim()}${seller ? ` (Vendedor: ${seller})` : ""}` : ""].filter(Boolean).join(" · ") },
    execucao: { local_data: dataEmissao ? `${local ? `${local}, ` : ""}${dataEmissao}` : "" },
    paginas: preview, imagens_sugeridas: refs, avisos, metodo: "navegador_local",
  };
  return result;
}
