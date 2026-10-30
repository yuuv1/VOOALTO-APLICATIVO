import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  TabStopPosition,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import JSZip from "jszip";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { EMBEDDED_LOGO_DATA_URL, EMBEDDED_SIGNATURE_DATA_URL } from "../generatedAssets";
import { ContratoState } from "../types";
import { buildPythonCompatiblePayload, computeContractSummary } from "./calculations";
export { buildPythonCompatiblePayload };

export interface GeneratedBundle {
  nomeBase: string;
  docxBlob: Blob;
  pdfBlob: Blob;
  zipBlob: Blob;
  geradoPor: "python" | "navegador";
}

function base64ToUint8Array(b64OrDataUrl: string): Uint8Array {
  const clean = b64OrDataUrl.includes(",") ? b64OrDataUrl.split(",")[1] : b64OrDataUrl;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeFileSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9À-ÿ_\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 46);
  return cleaned ? `Contrato_Vooalto_${cleaned}` : "Contrato_Vooalto_Uniformes";
}

const CM_TO_DXA = 566.929;
const CM_TO_PT = 28.3465;

function cmDxa(cm: number): number {
  return Math.round(cm * CM_TO_DXA);
}

async function getImageDimensions(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 400, h: 200 });
    img.src = dataUrl;
  });
}

async function generateDocxOffline(
  state: ContratoState,
  logoUrl: string,
  sigUrl: string
): Promise<Blob> {
  const summary = computeContractSummary(state);
  const co = state.empresa;
  const cl = state.cliente;
  const prod = state.producao;

  const NIL_BORDERS = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
  const BOX_BORDERS = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "C9D3DC" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9D3DC" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "C9D3DC" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "C9D3DC" },
  };

  function boxedRow(fields: Array<[string, number, string]>): Table {
    const gap = 0.35;
    const widths: number[] = [];
    const fieldCols: number[] = [];
    fields.forEach((f, idx) => {
      if (idx > 0) widths.push(gap);
      fieldCols.push(widths.length);
      widths.push(f[1]);
    });

    const lblCells = widths.map((w, ci) => {
      const fIdx = fieldCols.indexOf(ci);
      return new TableCell({
        width: { size: cmDxa(w), type: WidthType.DXA },
        borders: NIL_BORDERS,
        margins: { top: 0, bottom: 20, left: 20, right: 20 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: fIdx >= 0 ? fields[fIdx][0].toUpperCase() : "",
                font: "Arial",
                size: 14,
                bold: true,
                color: "626E78",
              }),
            ],
          }),
        ],
      });
    });

    const inpCells = widths.map((w, ci) => {
      const fIdx = fieldCols.indexOf(ci);
      if (fIdx < 0) {
        return new TableCell({
          width: { size: cmDxa(w), type: WidthType.DXA },
          borders: NIL_BORDERS,
          children: [new Paragraph({ children: [] })],
        });
      }
      return new TableCell({
        width: { size: cmDxa(w), type: WidthType.DXA },
        borders: BOX_BORDERS,
        shading: { type: ShadingType.CLEAR, fill: "F4F7F9" },
        margins: {
          top: summary.rows.length >= 5 ? 24 : 45,
          bottom: summary.rows.length >= 5 ? 24 : 45,
          left: 80,
          right: 80,
        },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: fields[fIdx][2] || " ",
                font: "Arial",
                size: summary.rows.length >= 5 ? 16 : 18,
                color: "19232D",
              }),
            ],
          }),
        ],
      });
    });

    return new Table({
      layout: TableLayoutType.FIXED,
      columnWidths: widths.map(cmDxa),
      width: { size: cmDxa(18), type: WidthType.DXA },
      rows: [new TableRow({ children: lblCells }), new TableRow({ children: inpCells })],
    });
  }

  const logoDims = await getImageDimensions(logoUrl);
  const logoW = 190;
  const logoH = Math.round((logoW * logoDims.h) / logoDims.w);

  const sigDims = await getImageDimensions(sigUrl);
  const sigW = 165;
  const sigH = Math.round((sigW * sigDims.h) / sigDims.w);

  const headerTable = new Table({
    layout: TableLayoutType.FIXED,
    columnWidths: [cmDxa(5.8), cmDxa(12.2)],
    width: { size: cmDxa(18), type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: cmDxa(5.8), type: WidthType.DXA },
            borders: NIL_BORDERS,
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    data: base64ToUint8Array(logoUrl),
                    type: "png",
                    transformation: { width: logoW, height: logoH },
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: cmDxa(12.2), type: WidthType.DXA },
            borders: NIL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: co.nome_comercial, font: "Arial", size: 16, bold: true, color: "19232D" }),
                  new TextRun({
                    break: 1,
                    text: `CNPJ ${co.cnpj} · Tel./WhatsApp ${co.telefone}${co.email ? ` · ${co.email}` : ""}`,
                    font: "Arial",
                    size: 14,
                    color: "626E78",
                  }),
                  new TextRun({ break: 1, text: co.endereco, font: "Arial", size: 14, color: "626E78" }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const denseDocx = summary.rows.length >= 5;
  const prodWidths = [1.15, 10.0, 1.3, 2.55, 3.0];
  const prodHeaderLabels: Array<[string, (typeof AlignmentType)[keyof typeof AlignmentType]]> = [
    ["ITEM", AlignmentType.CENTER],
    ["MODELO / TECIDO / COR / PERSONALIZAÇÃO", AlignmentType.LEFT],
    ["QTD.", AlignmentType.CENTER],
    ["UNITÁRIO", AlignmentType.RIGHT],
    ["SUBTOTAL", AlignmentType.RIGHT],
  ];

  const prodRows = [
    new TableRow({
      tableHeader: true,
      children: prodHeaderLabels.map(([txt, al], i) =>
        new TableCell({
          width: { size: cmDxa(prodWidths[i]), type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: "19232D" },
          borders: NIL_BORDERS,
          margins: { top: denseDocx ? 35 : 55, bottom: denseDocx ? 35 : 55, left: 55, right: 55 },
          children: [
            new Paragraph({
              alignment: al,
              children: [new TextRun({ text: txt, font: "Arial", size: 13, bold: true, color: "FFFFFF" })],
            }),
          ],
        })
      ),
    }),
    ...summary.rows.map(
      (r, idx) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: cmDxa(prodWidths[0]), type: WidthType.DXA },
              borders: BOX_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? "FFFFFF" : "F4F7F9" },
              margins: { top: denseDocx ? 24 : 45, bottom: denseDocx ? 24 : 45, left: 50, right: 50 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: r.numero, font: "Arial", size: denseDocx ? 15 : 16, bold: true, color: "19232D" })],
                }),
              ],
            }),
            new TableCell({
              width: { size: cmDxa(prodWidths[1]), type: WidthType.DXA },
              borders: BOX_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? "FFFFFF" : "F4F7F9" },
              margins: { top: denseDocx ? 24 : 45, bottom: denseDocx ? 24 : 45, left: 50, right: 50 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: r.modelo || " ", font: "Arial", size: denseDocx ? 15 : 16, bold: true, color: "19232D" }),
                    ...(r.detalhes
                      ? [new TextRun({ break: 1, text: r.detalhes, font: "Arial", size: denseDocx ? 13 : 15, color: "37434E" })]
                      : []),
                  ],
                }),
              ],
            }),
            ...[r.quantidade, r.unitario, r.subtotal].map((val, cIdx) => {
              const lines = String(val || " ").split("\n");
              return new TableCell({
                width: { size: cmDxa(prodWidths[cIdx + 2]), type: WidthType.DXA },
                borders: BOX_BORDERS,
                shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? "FFFFFF" : "F4F7F9" },
                margins: { top: denseDocx ? 22 : 40, bottom: denseDocx ? 22 : 40, left: 45, right: 45 },
                children: [
                  new Paragraph({
                    alignment: cIdx === 0 ? AlignmentType.CENTER : AlignmentType.RIGHT,
                    children: lines.map(
                      (ln, lIdx) =>
                        new TextRun({
                          break: lIdx > 0 ? 1 : undefined,
                          text: ln || " ",
                          font: "Arial",
                          size: denseDocx ? 15 : 16,
                          bold: cIdx === 2,
                          color: "19232D",
                        })
                    ),
                  }),
                ],
              });
            }),
          ],
        })
    ),
  ];

  // Grade separada: uma linha por modelo, sem limitar o texto a duas linhas.
  // As quebras de linha do editor são preservadas; o Word quebra linhas longas na célula.
  const gradeWidths = [1.15, 6.85, 10.0];
  const gradeRows = [
    new TableRow({ tableHeader: true, children: ["ITEM", "MODELO", "GRADE / TAMANHOS"].map((label, i) =>
      new TableCell({
        width: { size: cmDxa(gradeWidths[i]), type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "19232D" }, borders: NIL_BORDERS,
        margins: { top: 40, bottom: 40, left: 65, right: 65 },
        children: [new Paragraph({ children: [new TextRun({ text: label, font: "Arial", size: 13, bold: true, color: "FFFFFF" })] })],
      })
    ) }),
    ...summary.rows.map((r, idx) => new TableRow({ children: [r.numero, r.modelo || "A preencher", r.grade || "______________________"].map((text, i) =>
      new TableCell({
        width: { size: cmDxa(gradeWidths[i]), type: WidthType.DXA },
        borders: BOX_BORDERS,
        shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? "FFFFFF" : "F4F7F9" },
        margins: { top: denseDocx ? 30 : 45, bottom: denseDocx ? 30 : 45, left: 65, right: 65 },
        children: [new Paragraph({
          children: text.split(/\r?\n/).map((line, li) => new TextRun({
            text: line || " ", break: li > 0 ? 1 : undefined, font: "Arial",
            size: i === 2 ? 15 : 14, bold: i === 0, color: "19232D",
          })),
        })],
      })
    ) })),
  ];

  // Imagens de referência (todas as páginas/variações em grade ampla somando 18.0 cm)
  const colsPerRow =
    prod.imagens_referencia.length <= 3
      ? 3
      : prod.imagens_referencia.length <= 5
      ? prod.imagens_referencia.length
      : 4;
  const refGapCm = colsPerRow === 3 ? 0.3 : colsPerRow === 4 ? 0.24 : 0.2;
  const refSlotCm = (18.0 - refGapCm * (colsPerRow - 1)) / colsPerRow;
  const refColWidthsDxa: number[] = [];
  for (let i = 0; i < colsPerRow; i++) {
    if (i > 0) refColWidthsDxa.push(cmDxa(refGapCm));
    refColWidthsDxa.push(cmDxa(refSlotCm));
  }
  const totalRefSlots = Math.max(colsPerRow, prod.imagens_referencia.length);
  const refTableRows: TableRow[] = [];
  for (let rowStart = 0; rowStart < totalRefSlots; rowStart += colsPerRow) {
    const rowCells: TableCell[] = [];
    for (let c = 0; c < colsPerRow; c++) {
      if (c > 0) {
        rowCells.push(
          new TableCell({
            width: { size: cmDxa(refGapCm), type: WidthType.DXA },
            borders: NIL_BORDERS,
            children: [new Paragraph({ children: [] })],
          })
        );
      }
      const idxRef = rowStart + c;
      const ref = prod.imagens_referencia[idxRef];
      if (ref?.data_url) {
        const dims = await getImageDimensions(ref.data_url);
        const maxPxW = Math.round(refSlotCm * 31);
        const maxPxH = colsPerRow <= 4 ? 76 : 64;
        const scale = Math.min(maxPxW / dims.w, maxPxH / dims.h);
        rowCells.push(
          new TableCell({
            width: { size: cmDxa(refSlotCm), type: WidthType.DXA },
            borders: BOX_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: "FAFBFD" },
            margins: { top: 35, bottom: 35, left: 35, right: 35 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: base64ToUint8Array(ref.data_url),
                    type: ref.data_url.includes("jpeg") ? "jpg" : "png",
                    transformation: {
                      width: Math.max(12, Math.round(dims.w * scale)),
                      height: Math.max(12, Math.round(dims.h * scale)),
                    },
                  }),
                  new TextRun({
                    break: 1,
                    text: ref.titulo,
                    font: "Arial",
                    size: colsPerRow >= 5 ? 11 : 13,
                    bold: true,
                    color: "626E78",
                  }),
                ],
              }),
            ],
          })
        );
      } else {
        rowCells.push(
          new TableCell({
            width: { size: cmDxa(refSlotCm), type: WidthType.DXA },
            borders: {
              top: { style: BorderStyle.DASHED, size: 4, color: "C9D3DC" },
              bottom: { style: BorderStyle.DASHED, size: 4, color: "C9D3DC" },
              left: { style: BorderStyle.DASHED, size: 4, color: "C9D3DC" },
              right: { style: BorderStyle.DASHED, size: 4, color: "C9D3DC" },
            },
            shading: { type: ShadingType.CLEAR, fill: "FAFBFD" },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Referência ${String(idxRef + 1).padStart(2, "0")} — Camiseta`,
                    font: "Arial",
                    size: 14,
                    bold: true,
                    color: "626E78",
                  }),
                  new TextRun({
                    break: 1,
                    text: "Espaço reservado para imagem / ficha técnica",
                    font: "Arial",
                    size: 13,
                    color: "626E78",
                  }),
                ],
              }),
            ],
          })
        );
      }
    }
    refTableRows.push(new TableRow({ children: rowCells }));
  }

  const spacer = () => new Paragraph({ spacing: { after: denseDocx ? 20 : 50 }, children: [] });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: cmDxa(21), height: cmDxa(29.7) },
            margin: {
              top: cmDxa(denseDocx ? 0.65 : 0.85),
              bottom: cmDxa(denseDocx ? 0.65 : 1.05),
              left: cmDxa(1.5),
              right: cmDxa(1.5),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                  new TextRun({
                    text: "VOOALTO UNIFORMES · Contrato de confecção e fornecimento de uniformes\t",
                    font: "Arial",
                    size: 14,
                    color: "626E78",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 14, color: "626E78" }),
                  new TextRun({ text: " / ", font: "Arial", size: 14, color: "626E78" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 14, color: "626E78" }),
                ],
              }),
            ],
          }),
        },
        children: [
          headerTable,
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
              new TextRun({
                text: "CONTRATO DE CONFECÇÃO E FORNECIMENTO DE UNIFORMES",
                font: "Arial",
                size: 27,
                bold: true,
                color: "19232D",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 70 },
            children: [
              new TextRun({
                text: "Pelo presente instrumento, a VOOALTO UNIFORMES (CONTRATADA) e o(a) cliente identificado(a) abaixo (CONTRATANTE) contratam o fornecimento nas condições a seguir:",
                font: "Arial",
                size: 16,
                color: "37434E",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: "1. IDENTIFICAÇÃO DO(A) CONTRATANTE (DADOS DO CLIENTE)",
                font: "Arial",
                size: 17,
                bold: true,
                color: "19232D",
              }),
            ],
          }),
          boxedRow([["Nome completo ou razão social", 18.0, cl.nome_razao_social]]),
          spacer(),
          boxedRow([
            ["CPF / CNPJ", 4.8, cl.cpf_cnpj],
            ["Telefone / WhatsApp", 4.6, cl.telefone],
            ["E-mail", 7.9, cl.email],
          ]),
          spacer(),
          boxedRow([
            ["Endereço completo (rua/av., nº, bairro, complemento)", 11.85, cl.endereco],
            ["Cidade / UF · CEP", 5.8, cl.cidade_uf_cep],
          ]),
          spacer(),
          new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({
                text: "2. DADOS DA PRODUÇÃO E ESPECIFICAÇÕES DO PEDIDO",
                font: "Arial",
                size: 17,
                bold: true,
                color: "19232D",
              }),
            ],
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: prodWidths.map(cmDxa),
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: prodRows,
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: [cmDxa(9.2), cmDxa(8.8)],
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: cmDxa(9.2), type: WidthType.DXA },
                    shading: { type: ShadingType.CLEAR, fill: "19232D" },
                    borders: NIL_BORDERS,
                    margins: { top: 60, bottom: 60, left: 95, right: 60 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `TOTAL DE PEÇAS:  ${summary.countDisplay}`,
                            font: "Arial",
                            size: 16,
                            bold: true,
                            color: "FFFFFF",
                          }),
                          ...(summary.wordsDisplay
                            ? [
                                new TextRun({
                                  break: 1,
                                  text: summary.wordsDisplay,
                                  font: "Arial",
                                  size: 14,
                                  color: "DCE3E9",
                                }),
                              ]
                            : []),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: cmDxa(8.8), type: WidthType.DXA },
                    shading: { type: ShadingType.CLEAR, fill: "19232D" },
                    borders: NIL_BORDERS,
                    margins: { top: 60, bottom: 60, left: 60, right: 95 },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                          new TextRun({
                            text: `VALOR TOTAL:  ${summary.totalDisplay || "R$ ________"}`,
                            font: "Arial",
                            size: 22,
                            bold: true,
                            color: "FFFFFF",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          spacer(),
          new Paragraph({
            spacing: { after: 30 },
            children: [new TextRun({ text: "GRADE DE TAMANHOS POR MODELO", font: "Arial", size: 15, bold: true, color: "19232D" })],
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: gradeWidths.map(cmDxa),
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: gradeRows,
          }),
          spacer(),
          boxedRow([
            ["Prazo de produção / previsão de entrega", 7.15, prod.prazo_entrega],
            ["Observações da produção / detalhes de arte", 10.5, prod.observacoes],
          ]),
          spacer(),
          new Paragraph({
            spacing: { after: 30 },
            children: [
              new TextRun({
                text: "CROQUIS / IMAGENS DE REFERÊNCIA DAS CAMISETAS (FICHA TÉCNICA)",
                font: "Arial",
                size: 14,
                bold: true,
                color: "626E78",
              }),
            ],
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: refColWidthsDxa,
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: refTableRows,
          }),
          spacer(),
          new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [
              new TextRun({
                text: "3. CONDIÇÕES DE PAGAMENTO",
                font: "Arial",
                size: 17,
                bold: true,
                color: "19232D",
              }),
            ],
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: [cmDxa(8.825), cmDxa(0.35), cmDxa(8.825)],
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: cmDxa(8.825), type: WidthType.DXA },
                    shading: { type: ShadingType.CLEAR, fill: "F8F3EC" },
                    borders: BOX_BORDERS,
                    margins: { top: 55, bottom: 55, left: 95, right: 95 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: summary.advanceLabel, font: "Arial", size: 14, bold: true, color: "626E78" }),
                          new TextRun({
                            break: 1,
                            text: summary.advanceDisplay || "R$ ",
                            font: "Arial",
                            size: 21,
                            bold: true,
                            color: "19232D",
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: cmDxa(0.35), type: WidthType.DXA },
                    borders: NIL_BORDERS,
                    children: [new Paragraph({ children: [] })],
                  }),
                  new TableCell({
                    width: { size: cmDxa(8.825), type: WidthType.DXA },
                    shading: { type: ShadingType.CLEAR, fill: "F8F3EC" },
                    borders: BOX_BORDERS,
                    margins: { top: 55, bottom: 55, left: 95, right: 95 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: summary.balanceLabel, font: "Arial", size: 14, bold: true, color: "626E78" }),
                          new TextRun({
                            break: 1,
                            text: summary.balanceDisplay || "R$ ",
                            font: "Arial",
                            size: 21,
                            bold: true,
                            color: "19232D",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          spacer(),
          boxedRow([
            ["Forma de pagamento (Pix, depósito bancário ou cartão)", 9.65, state.pagamento.forma_pagamento],
            ["Local e data", 8.0, state.execucao.local_data],
          ]),
          new Paragraph({
            spacing: { before: 50, after: 55 },
            children: [
              new TextRun({
                text: "As partes declaram estar de acordo com os dados da produção, especificações, valores, prazos e condições estabelecidos neste contrato.",
                font: "Arial",
                size: 16,
                color: "37434E",
              }),
            ],
          }),
          new Table({
            layout: TableLayoutType.FIXED,
            columnWidths: [cmDxa(8.7), cmDxa(0.6), cmDxa(8.7)],
            width: { size: cmDxa(18), type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: cmDxa(8.7), type: WidthType.DXA },
                    borders: BOX_BORDERS,
                    margins: { top: 45, bottom: 45, left: 80, right: 80 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "CONTRATADA (EMPRESA)", font: "Arial", size: 14, bold: true, color: "626E78" }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 40, after: 30 },
                        children: [
                          new ImageRun({
                            data: base64ToUint8Array(sigUrl),
                            type: "png",
                            transformation: { width: sigW, height: sigH },
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${co.responsavel} — ${co.cargo}`,
                            font: "Arial",
                            size: 17,
                            bold: true,
                            color: "19232D",
                          }),
                          new TextRun({
                            break: 1,
                            text: `${co.nome_comercial} · CNPJ ${co.cnpj}`,
                            font: "Arial",
                            size: 14,
                            color: "626E78",
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: cmDxa(0.6), type: WidthType.DXA },
                    borders: NIL_BORDERS,
                    children: [new Paragraph({ children: [] })],
                  }),
                  new TableCell({
                    width: { size: cmDxa(8.7), type: WidthType.DXA },
                    borders: BOX_BORDERS,
                    margins: { top: 45, bottom: 45, left: 80, right: 80 },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "CONTRATANTE (CLIENTE)", font: "Arial", size: 14, bold: true, color: "626E78" }),
                        ],
                      }),
                      new Paragraph({
                        spacing: { before: 520, after: 40 },
                        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "19232D" } },
                        children: [new TextRun({ text: " ", font: "Arial", size: 16 })],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Assinatura do(a) Contratante / Representante",
                            font: "Arial",
                            size: 17,
                            bold: true,
                            color: "19232D",
                          }),
                          new TextRun({
                            break: 1,
                            text: "Contratante do serviço (cliente)",
                            font: "Arial",
                            size: 14,
                            color: "626E78",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

function pdfSafe(raw: string): string {
  return (raw || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    // Mantém todos os caracteres Latin-1 / WinAnsi (incluindo acentos PT-BR e '·') e remove símbolos fora da tabela
    .replace(/[^\x20-\xFF]/g, "")
    .trim();
}

async function generatePdfOffline(
  state: ContratoState,
  logoUrl: string,
  sigUrl: string
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  const summary = computeContractSummary(state);
  const co = state.empresa;
  const cl = state.cliente;
  const prod = state.producao;

  const dense = summary.rows.length >= 5;
  const W = 595.28;
  const H = 841.89;
  const M = 1.5 * CM_TO_PT;
  const CW = W - 2 * M;

  const cInk = rgb(0.098, 0.137, 0.176);
  const cMuted = rgb(0.384, 0.431, 0.471);
  const cLine = rgb(0.788, 0.827, 0.863);
  const cPale = rgb(0.957, 0.969, 0.976);
  const cCream = rgb(0.973, 0.953, 0.925);
  const cAccent = rgb(0.773, 0.388, 0.361);

  const logoImg = await pdfDoc.embedPng(base64ToUint8Array(logoUrl));
  page.drawImage(logoImg, { x: M, y: H - (dense ? 58 : 62), width: 138, height: 33.5 });

  const rightLines = [
    { txt: pdfSafe(co.nome_comercial), bold: true, color: cInk },
    {
      txt: pdfSafe(
        `CNPJ ${co.cnpj} · Tel./WhatsApp ${co.telefone}${co.email ? ` · ${co.email}` : ""}`
      ),
      bold: false,
      color: cMuted,
    },
    { txt: pdfSafe(co.endereco), bold: false, color: cMuted },
  ];
  rightLines.forEach((ln, idx) => {
    const f = ln.bold ? fontBold : fontReg;
    const tw = f.widthOfTextAtSize(ln.txt, 7.2);
    page.drawText(ln.txt, {
      x: W - M - tw,
      y: H - 31 - idx * 9.5,
      size: 7.2,
      font: f,
      color: ln.color,
    });
  });

  const sepY = dense ? H - 64 : H - 70;
  page.drawLine({ start: { x: M, y: sepY }, end: { x: W - M, y: sepY }, thickness: 0.7, color: cLine });
  page.drawLine({ start: { x: M, y: sepY }, end: { x: M + 45, y: sepY }, thickness: 2.2, color: cAccent });

  page.drawText("CONTRATO DE CONFECÇÃO E FORNECIMENTO DE UNIFORMES", {
    x: M,
    y: sepY - 19,
    size: dense ? 12.8 : 13.5,
    font: fontBold,
    color: cInk,
  });
  page.drawText(
    "Pelo presente instrumento, a VOOALTO UNIFORMES (CONTRATADA) e o(a) cliente identificado(a) abaixo (CONTRATANTE) contratam:",
    { x: M, y: sepY - 31, size: 7.5, font: fontReg, color: cMuted }
  );

  let y = dense ? 104 : 118;
  const PDF_BODY_LIMIT = H - 38;
  const allPages = [page];
  const ensurePdfSpace = (neededPt: number, drawRepeatHeader?: () => void) => {
    if (y + neededPt > PDF_BODY_LIMIT) {
      page = pdfDoc.addPage([W, H]);
      allPages.push(page);
      y = 34;
      if (drawRepeatHeader) drawRepeatHeader();
    }
  };

  const fitFieldFont = (txt: string, wPt: number, maxSz = 8.6): number => {
    if (!txt) return maxSz;
    for (let sz = maxSz; sz >= 6.0; sz -= 0.25) {
      if (fontReg.widthOfTextAtSize(txt, sz) <= wPt - 16) return Number(sz.toFixed(2));
    }
    return 6.0;
  };

  const drawFieldRow = (specs: Array<[string, string, number, string]>, boxH = dense ? 14.8 : 17.5) => {
    ensurePdfSpace(10 + boxH);
    let x = M;
    specs.forEach(([name, label, wCm, val]) => {
      const wPt = wCm * CM_TO_PT;
      const cleanVal = pdfSafe(val || "");
      page.drawText(pdfSafe(label.toUpperCase()), {
        x,
        y: H - y - 6.5,
        size: 6.4,
        font: fontBold,
        color: cMuted,
      });
      const tf = form.createTextField(name);
      tf.setText(cleanVal);
      tf.addToPage(page, {
        x,
        y: H - y - 8.5 - boxH,
        width: wPt,
        height: boxH,
        textColor: cInk,
        backgroundColor: cPale,
        borderColor: cLine,
        borderWidth: 0.6,
        font: fontReg,
      });
      tf.setFontSize(fitFieldFont(cleanVal, wPt, dense ? 8.3 : 8.8));
      x += wPt + 0.35 * CM_TO_PT;
    });
    y += 8.5 + boxH + (dense ? 2.6 : 3.8);
  };

  page.drawText("1. IDENTIFICAÇÃO DO(A) CONTRATANTE (DADOS DO CLIENTE)", {
    x: M,
    y: H - y - 7.5,
    size: 8.2,
    font: fontBold,
    color: cInk,
  });
  y += 10.5;
  drawFieldRow([["cliente_nome", "Nome completo ou razão social", 18.0, cl.nome_razao_social]]);
  drawFieldRow([
    ["cliente_cpf_cnpj", "CPF / CNPJ", 4.8, cl.cpf_cnpj],
    ["cliente_telefone", "Telefone / WhatsApp", 4.6, cl.telefone],
    ["cliente_email", "E-mail", 7.9, cl.email],
  ]);
  drawFieldRow([
    ["cliente_endereco", "Endereço completo (rua/av., nº, bairro, complemento)", 11.85, cl.endereco],
    ["cliente_cidade", "Cidade / UF · CEP", 5.8, cl.cidade_uf_cep],
  ]);

  y += dense ? 2.5 : 4;
  page.drawText("2. DADOS DA PRODUÇÃO E ESPECIFICAÇÕES DO PEDIDO", {
    x: M,
    y: H - y - 7.5,
    size: 8.2,
    font: fontBold,
    color: cInk,
  });
  y += 11;

  const colW = [1.15, 10.0, 1.3, 2.55, 3.0].map((c) => c * CM_TO_PT);
  const thH = dense ? 16.5 : 18.5;
  const headers = ["ITEM", "MODELO / TECIDO / COR / PERSONALIZAÇÃO", "QTD.", "UNITÁRIO", "SUBTOTAL"];
  const drawTableHeader = () => {
    page.drawRectangle({ x: M, y: H - y - thH, width: CW, height: thH, color: cInk });
    let hx = M;
    headers.forEach((hTxt, i) => {
      page.drawText(hTxt, { x: hx + 4.5, y: H - y - thH + 5.5, size: 6.7, font: fontBold, color: rgb(1, 1, 1) });
      hx += colW[i];
    });
    y += thH;
  };
  drawTableHeader();

  // Texto sem limite artificial de linhas: não omitir tamanhos ou detalhes de modelos raros.
  const wrapPdfText = (txt: string, maxW: number, sz: number): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of pdfSafe(txt).split(/\s+/).filter(Boolean)) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (fontReg.widthOfTextAtSize(candidate, sz) <= maxW) { cur = candidate; continue; }
      if (cur) { out.push(cur); cur = ""; }
      for (const char of word) {
        if (cur && fontReg.widthOfTextAtSize(cur + char, sz) > maxW) { out.push(cur); cur = ""; }
        cur += char;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  summary.rows.forEach((r, idx) => {
    const modelSize = dense ? 7.2 : 7.8;
    const detSize = dense ? 6.2 : 6.8;
    const modelLines = r.modelo ? wrapPdfText(r.modelo, colW[1] - 10, modelSize) : [];
    const detLines = r.detalhes ? wrapPdfText(r.detalhes, colW[1] - 10, detSize) : [];
    const rh = Math.max(dense ? 18 : 20.5, 7 + modelLines.length * 8.1 + detLines.length * 7.1 + 3);
    ensurePdfSpace(rh, drawTableHeader);
    page.drawRectangle({
      x: M, y: H - y - rh, width: CW, height: rh,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : cPale,
      borderColor: cLine, borderWidth: 0.45,
    });
    let rx = M;
    page.drawText(pdfSafe(r.numero), { x: rx + 7, y: H - y - rh / 2 - 2.5, size: 7.6, font: fontBold, color: cInk });
    rx += colW[0];
    modelLines.forEach((line, li) => page.drawText(line, {
      x: rx + 4.5, y: H - y - 9 - li * 8.1,
      size: modelSize, font: fontBold, color: cInk,
    }));
    detLines.forEach((line, li) => page.drawText(line, {
      x: rx + 4.5, y: H - y - 9 - modelLines.length * 8.1 - li * 7.1,
      size: detSize, font: fontReg, color: cMuted,
    }));
    rx += colW[1];
    page.drawText(pdfSafe(r.quantidade), { x: rx + 6, y: H - y - rh / 2 - 2.5, size: 7.6, font: fontReg, color: cInk });
    rx += colW[2];
    page.drawText(pdfSafe(r.unitario), { x: rx + 4.5, y: H - y - rh / 2 - 2.5, size: 7.5, font: fontReg, color: cInk });
    rx += colW[3];
    page.drawText(pdfSafe(r.subtotal), { x: rx + 4.5, y: H - y - rh / 2 - 2.5, size: 7.6, font: fontBold, color: cInk });
    y += rh;
  });

  const totBarH = dense ? 22 : 24.5;
  ensurePdfSpace(totBarH + 8);
  page.drawRectangle({ x: M, y: H - y - totBarH, width: CW, height: totBarH, color: cInk });
  page.drawText(pdfSafe(`TOTAL DE PEÇAS:  ${summary.countDisplay}`), {
    x: M + 8,
    y: H - y - totBarH / 2 - 3,
    size: 8.0,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  const totStr = pdfSafe(`VALOR TOTAL:  ${summary.totalDisplay || "R$ ________"}`);
  page.drawText(totStr, {
    x: W - M - 8 - fontBold.widthOfTextAtSize(totStr, 11.0),
    y: H - y - totBarH / 2 - 3.5,
    size: 11.0,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  y += totBarH + (dense ? 3.5 : 5);

  // Quadro independente de grades, com quebras de linha e paginação por modelo.
  const gradeW = [1.15, 6.85, 10.0].map((c) => c * CM_TO_PT);
  const gradeHeaderH = 16.5;
  const drawGradeHeader = () => {
    page.drawRectangle({ x: M, y: H - y - gradeHeaderH, width: CW, height: gradeHeaderH, color: cInk });
    let hx = M;
    ["ITEM", "MODELO", "GRADE / TAMANHOS"].forEach((hTxt, i) => {
      page.drawText(hTxt, { x: hx + 5, y: H - y - 11, size: 7, font: fontBold, color: rgb(1, 1, 1) });
      hx += gradeW[i];
    });
    y += gradeHeaderH;
  };
  const gradeRowLayout = (r: (typeof summary.rows)[number]) => {
    const gradeLines = (r.grade || "A preencher").split(/\r?\n/).flatMap((line) => wrapPdfText(line, gradeW[2] - 12, 7.4));
    const modelLines = wrapPdfText(r.modelo || "A preencher", gradeW[1] - 12, 7.1);
    const rh = Math.max(19, 7 + 8.7 * Math.max(gradeLines.length, modelLines.length) + 3);
    return { gradeLines, modelLines, rh };
  };
  ensurePdfSpace(11 + gradeHeaderH + (summary.rows[0] ? gradeRowLayout(summary.rows[0]).rh : 19));
  page.drawText("GRADE DE TAMANHOS POR MODELO", { x: M, y: H - y - 7, size: 8, font: fontBold, color: cInk });
  y += 11;
  drawGradeHeader();
  summary.rows.forEach((r, idx) => {
    const { gradeLines, modelLines, rh } = gradeRowLayout(r);
    ensurePdfSpace(rh, drawGradeHeader);
    page.drawRectangle({ x: M, y: H - y - rh, width: CW, height: rh,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : cPale, borderColor: cLine, borderWidth: 0.45 });
    page.drawText(pdfSafe(r.numero), { x: M + 7, y: H - y - rh / 2 - 2.5, size: 7.6, font: fontBold, color: cInk });
    modelLines.forEach((line, li) => page.drawText(line, {
      x: M + gradeW[0] + 5, y: H - y - 10 - li * 8.7, size: 7.1, font: fontReg, color: cInk,
    }));
    gradeLines.forEach((line, li) => page.drawText(line, {
      x: M + gradeW[0] + gradeW[1] + 5, y: H - y - 10 - li * 8.7, size: 7.4, font: fontReg, color: cInk,
    }));
    y += rh;
  });
  y += dense ? 3 : 5;

  drawFieldRow(
    [
      ["prazo_entrega", "Prazo de produção / previsão de entrega", 7.15, prod.prazo_entrega],
      ["observacoes", "Observações da produção / detalhes de arte", 10.5, prod.observacoes],
    ],
    dense ? 14.5 : 16
  );

  // Reserva o fechamento junto dos croquis quando há até 5 modelos; evita uma segunda
  // folha com somente pagamento/assinaturas em produções com grades longas.
  const payH = dense ? 25 : 28;
  const closingH = 10.5 + payH + (dense ? 3.5 : 5) + 8.5 + (dense ? 14.5 : 16)
    + (dense ? 2.6 : 3.8) + 10 + (dense ? 34 : 39) + 9 + 12;

  // Imagens de referência (todas as páginas/variações em grade ampla com paginação automática)
  const pdfRefCols =
    prod.imagens_referencia.length <= 3
      ? 3
      : prod.imagens_referencia.length <= 5
      ? prod.imagens_referencia.length
      : 4;
  const pdfGapCm = pdfRefCols === 3 ? 0.3 : pdfRefCols === 4 ? 0.24 : 0.2;
  const slotW = ((18.0 - pdfGapCm * (pdfRefCols - 1)) / pdfRefCols) * CM_TO_PT;
  const slotGap = pdfGapCm * CM_TO_PT;
  const slotH = dense && prod.imagens_referencia.length <= 5 ? 54 : 62;
  const totalPdfSlots = Math.max(pdfRefCols, prod.imagens_referencia.length);
  const imageRows = Math.ceil(totalPdfSlots / pdfRefCols);
  ensurePdfSpace(prod.imagens_referencia.length <= 5
    ? 9 + imageRows * (slotH + (dense ? 4.5 : 6.5)) + closingH
    : 10 + slotH);
  page.drawText("CROQUIS / IMAGENS DE REFERÊNCIA DAS CAMISETAS (FICHA TÉCNICA)", {
    x: M,
    y: H - y - 6.5,
    size: 6.5,
    font: fontBold,
    color: cMuted,
  });
  y += 9;
  for (let rowStart = 0; rowStart < totalPdfSlots; rowStart += pdfRefCols) {
    if (rowStart > 0) {
      ensurePdfSpace(slotH + 6);
    }
    for (let colOff = 0; colOff < pdfRefCols; colOff++) {
      const idxRef = rowStart + colOff;
      const sx = M + colOff * (slotW + slotGap);
      page.drawRectangle({
        x: sx,
        y: H - y - slotH,
        width: slotW,
        height: slotH,
        color: rgb(0.98, 0.984, 0.992),
        borderColor: cLine,
        borderWidth: 0.6,
      });
      const ref = prod.imagens_referencia[idxRef];
      if (ref?.data_url) {
        try {
          const bytes = base64ToUint8Array(ref.data_url);
          const emb = ref.data_url.includes("jpeg") ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
          const sc = Math.min((slotW - 7) / emb.width, (slotH - 12) / emb.height);
          const dw = emb.width * sc;
          const dh = emb.height * sc;
          page.drawImage(emb, { x: sx + (slotW - dw) / 2, y: H - y - slotH + 9.5, width: dw, height: dh });
          page.drawText(pdfSafe(ref.titulo).slice(0, 34), {
            x: sx + 4,
            y: H - y - slotH + 2.8,
            size: pdfRefCols >= 5 ? 5.3 : 6.0,
            font: fontBold,
            color: cMuted,
          });
        } catch {
          // Ignora imagem inválida
        }
      } else {
        page.drawText(`Referência ${String(idxRef + 1).padStart(2, "0")} - Camiseta`, {
          x: sx + 12,
          y: H - y - slotH / 2 - 2,
          size: 6.8,
          font: fontBold,
          color: cMuted,
        });
      }
    }
    y += slotH + (dense ? 4.5 : 6.5);
  }

  // Pagamento
  const payW = 8.825 * CM_TO_PT;
  const payGap = 0.35 * CM_TO_PT;
  ensurePdfSpace(closingH);
  page.drawText("3. CONDIÇÕES DE PAGAMENTO", { x: M, y: H - y - 7.5, size: 8.2, font: fontBold, color: cInk });
  y += 10.5;
  [
    [M, summary.advanceLabel, summary.advanceDisplay],
    [M + payW + payGap, summary.balanceLabel, summary.balanceDisplay],
  ].forEach(([px, lbl, val]) => {
    page.drawRectangle({
      x: Number(px),
      y: H - y - payH,
      width: payW,
      height: payH,
      color: cCream,
      borderColor: cLine,
      borderWidth: 0.5,
    });
    page.drawText(pdfSafe(String(lbl)), { x: Number(px) + 8, y: H - y - 9, size: 6.5, font: fontBold, color: cMuted });
    page.drawText(pdfSafe(String(val || "R$ ")), {
      x: Number(px) + 8,
      y: H - y - payH + 5.5,
      size: 10.0,
      font: fontBold,
      color: cInk,
    });
  });
  y += payH + (dense ? 3.5 : 5);

  drawFieldRow(
    [
      ["forma_pagamento", "Forma de pagamento (Pix, depósito bancário ou cartão)", 9.65, state.pagamento.forma_pagamento],
      ["local_data", "Local e data", 8.0, state.execucao.local_data],
    ],
    dense ? 14.5 : 16
  );

  // Assinaturas lado a lado
  const sigW = 8.7 * CM_TO_PT;
  const rightX = M + sigW + 0.6 * CM_TO_PT;
  const boxH = dense ? 34 : 39;
  ensurePdfSpace(10 + boxH + 22);
  page.drawText("CONTRATADA (EMPRESA)", { x: M, y: H - y - 7.5, size: 6.9, font: fontBold, color: cMuted });
  page.drawText("CONTRATANTE (CLIENTE)", { x: rightX, y: H - y - 7.5, size: 6.9, font: fontBold, color: cMuted });
  y += 10;

  page.drawRectangle({ x: M, y: H - y - boxH, width: sigW, height: boxH, color: rgb(1, 1, 1), borderColor: cLine, borderWidth: 0.6 });
  const sigImg = await pdfDoc.embedPng(base64ToUint8Array(sigUrl));
  const sScale = Math.min((sigW - 44) / sigImg.width, (boxH - 8) / sigImg.height);
  const sw = sigImg.width * sScale;
  const sh = sigImg.height * sScale;
  page.drawImage(sigImg, { x: M + (sigW - sw) / 2, y: H - y - boxH + 4, width: sw, height: sh });

  page.drawRectangle({ x: rightX, y: H - y - boxH, width: sigW, height: boxH, color: rgb(1, 1, 1), borderColor: cLine, borderWidth: 0.6 });
  page.drawLine({ start: { x: rightX + 28, y: H - y - boxH + 6 }, end: { x: rightX + sigW - 28, y: H - y - boxH + 6 }, thickness: 0.75, color: cInk });

  y += boxH + 9;
  page.drawText(pdfSafe(`${co.responsavel} - ${co.cargo}`), { x: M, y: H - y, size: 7.9, font: fontBold, color: cInk });
  page.drawText(pdfSafe(`${co.nome_comercial} · CNPJ ${co.cnpj}`), { x: M, y: H - y - 9.5, size: 6.8, font: fontReg, color: cMuted });

  page.drawText("Assinatura do(a) Contratante / Representante", { x: rightX, y: H - y, size: 7.9, font: fontBold, color: cInk });
  page.drawText("Contratante do serviço (cliente)", { x: rightX, y: H - y - 9.5, size: 6.8, font: fontReg, color: cMuted });

  allPages.forEach((pObj, pIdx) => {
    pObj.drawLine({ start: { x: M, y: 28 }, end: { x: W - M, y: 28 }, thickness: 0.5, color: cLine });
    pObj.drawText("VOOALTO UNIFORMES · Contrato de confecção e fornecimento de uniformes", {
      x: M,
      y: 16,
      size: 6.8,
      font: fontReg,
      color: cMuted,
    });
    const pgLabel = `${pIdx + 1} / ${allPages.length}`;
    pObj.drawText(pgLabel, { x: W - M - fontReg.widthOfTextAtSize(pgLabel, 6.8), y: 16, size: 6.8, font: fontReg, color: cMuted });
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
}

export async function generateContractFiles(
  state: ContratoState,
  _backendOnline: boolean,
  salvarEmEntregas: boolean,
  logoUrl = EMBEDDED_LOGO_DATA_URL,
  sigUrl = EMBEDDED_SIGNATURE_DATA_URL
): Promise<GeneratedBundle> {
  const payload = buildPythonCompatiblePayload(state);
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  // Nunca envia dados do contrato à API do sistema hospedeiro por coincidência de caminho.
  if (!isFileProtocol && _backendOnline) {
    try {
      const resp = await fetch("./api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: payload, salvar_em_entregas: salvarEmEntregas }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const docxBlob = new Blob([base64ToUint8Array(json.docx_base64) as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const pdfBlob = new Blob([base64ToUint8Array(json.pdf_base64) as BlobPart], {
          type: "application/pdf",
        });
        const zipBlob = new Blob([base64ToUint8Array(json.zip_base64) as BlobPart], {
          type: "application/zip",
        });
        return {
          nomeBase: json.nome_base || safeFileSlug(state.cliente.nome_razao_social),
          docxBlob,
          pdfBlob,
          zipBlob,
          geradoPor: "python",
        };
      }
    } catch {
      // Segue automaticamente para geração 100% no navegador
    }
  }

  // Geração 100% no navegador (offline / GitHub Pages / celular)
  const nomeBase = safeFileSlug(state.cliente.nome_razao_social);
  const [docxBlob, pdfBlob] = await Promise.all([
    generateDocxOffline(state, logoUrl, sigUrl),
    generatePdfOffline(state, logoUrl, sigUrl),
  ]);
  const zip = new JSZip();
  zip.file(`${nomeBase}.docx`, docxBlob);
  zip.file(`${nomeBase}.pdf`, pdfBlob);
  const zipBlob = await zip.generateAsync({ type: "blob" });

  return {
    nomeBase,
    docxBlob,
    pdfBlob,
    zipBlob,
    geradoPor: "navegador",
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
