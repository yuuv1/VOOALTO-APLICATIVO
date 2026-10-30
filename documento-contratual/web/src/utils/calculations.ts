import { ContratoState, ItemProducao } from "../types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function parseCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const str = String(raw).trim().replace(/[R$\s]/gi, "");
  if (!str) return 0;
  let normalized = str;
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      normalized = str.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    normalized = str.replace(/\./g, "").replace(",", ".");
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatBRLFromCents(cents: number): string {
  const whole = Math.floor(Math.abs(cents) / 100);
  const rem = Math.abs(cents) % 100;
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${wholeFormatted},${rem.toString().padStart(2, "0")}`;
}

function cardinalPt(n: number): string {
  const units = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (n < 10) return units[n];
  if (n < 20) return teens[n - 10];
  if (n < 100) {
    const r = n % 10;
    return tens[Math.floor(n / 10)] + (r ? ` e ${cardinalPt(r)}` : "");
  }
  if (n === 100) return "cem";
  if (n < 1000) {
    const r = n % 100;
    return hundreds[Math.floor(n / 100)] + (r ? ` e ${cardinalPt(r)}` : "");
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    let res = (th > 1 ? `${cardinalPt(th)} ` : "") + "mil";
    if (rest) {
      res += (rest < 100 || rest % 100 === 0 ? " e " : ", ") + cardinalPt(rest);
    }
    return res;
  }
  return `${(n / 100).toFixed(2)} reais`;
}

export function amountInWordsPt(totalCents: number): string {
  if (totalCents <= 0) return "";
  const whole = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  let out = cardinalPt(whole) + (whole === 1 ? " real" : " reais");
  if (cents > 0) {
    out += ` e ${cardinalPt(cents)} ${cents === 1 ? "centavo" : "centavos"}`;
  }
  return out;
}

export interface ComputedSummary {
  hasValidItems: boolean;
  rows: Array<{
    numero: string;
    modelo: string;
    detalhes: string;
    grade: string;
    quantidade: string;
    unitario: string;
    subtotal: string;
    unitCents: number;
    subCents: number;
  }>;
  totalPieces: number;
  totalCents: number;
  countDisplay: string;
  totalDisplay: string;
  wordsDisplay: string;
  advanceLabel: string;
  advanceDisplay: string;
  balanceLabel: string;
  balanceDisplay: string;
}

export function computeContractSummary(state: ContratoState): ComputedSummary {
  const validItems = state.producao.itens.filter(
    (it) => it.modelo.trim() !== "" && it.quantidade > 0 && parseCents(it.valor_unitario) > 0
  );

  if (validItems.length === 0) {
    const nRows = Math.max(1, Math.min(12, state.producao.linhas_em_branco || 4));
    const blankRows = Array.from({ length: nRows }, (_, i) => {
      const existing = state.producao.itens[i];
      const detalhes = existing
        ? [
            existing.tecido ? `Tecido: ${existing.tecido}` : "",
            existing.cor ? `Cor: ${existing.cor}` : "",
            existing.personalizacao || "",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
      return {
        numero: String(i + 1).padStart(2, "0"),
        modelo: existing?.modelo || "",
        detalhes,
        grade: existing?.grade || "",
        quantidade: existing && existing.quantidade > 0 ? String(existing.quantidade) : "",
        unitario: existing && parseCents(existing.valor_unitario) > 0 ? formatBRLFromCents(parseCents(existing.valor_unitario)) : "",
        subtotal: "",
        unitCents: 0,
        subCents: 0,
      };
    });

    const ep = state.pagamento.entrada_percentual;
    const sp = state.pagamento.saldo_percentual;
    return {
      hasValidItems: false,
      rows: blankRows,
      totalPieces: 0,
      totalCents: 0,
      countDisplay: state.producao.quantidade_total || "",
      totalDisplay: state.producao.valor_total || "",
      wordsDisplay: "",
      advanceLabel: ep ? `${ep}% ANTECIPADO` : "ENTRADA / SINAL NA APROVAÇÃO",
      advanceDisplay: state.pagamento.entrada_valor || "",
      balanceLabel: sp ? `${sp}% NA ENTREGA FINAL` : "SALDO NA ENTREGA FINAL",
      balanceDisplay: state.pagamento.saldo_valor || "",
    };
  }

  let totalPieces = 0;
  let totalCents = 0;
  const rows = validItems.map((it: ItemProducao, idx: number) => {
    const unitCents = parseCents(it.valor_unitario);
    const subCents = it.quantidade * unitCents;
    totalPieces += it.quantidade;
    totalCents += subCents;
    const detalhes = [
      it.tecido ? `Tecido: ${it.tecido}` : "",
      it.cor ? `Cor: ${it.cor}` : "",
      it.personalizacao || "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      numero: String(idx + 1).padStart(2, "0"),
      modelo: it.modelo.trim(),
      detalhes,
      grade: it.grade.trim(),
      quantidade: String(it.quantidade),
      unitario: formatBRLFromCents(unitCents),
      subtotal: formatBRLFromCents(subCents),
      unitCents,
      subCents,
    };
  });

  const ep = state.pagamento.entrada_percentual;
  const sp = state.pagamento.saldo_percentual;
  let advanceLabel = "ENTRADA / SINAL NA APROVAÇÃO";
  let balanceLabel = "SALDO NA ENTREGA FINAL";
  let advanceDisplay = state.pagamento.entrada_valor || "";
  let balanceDisplay = state.pagamento.saldo_valor || "";

  if (ep !== null && sp !== null && ep + sp === 100) {
    const advCents = Math.round((totalCents * ep) / 100);
    const balCents = totalCents - advCents;
    advanceLabel = `${ep}% ANTECIPADO`;
    balanceLabel = `${sp}% NA ENTREGA FINAL`;
    advanceDisplay = formatBRLFromCents(advCents);
    balanceDisplay = formatBRLFromCents(balCents);
  }

  return {
    hasValidItems: true,
    rows,
    totalPieces,
    totalCents,
    countDisplay: `${totalPieces} PEÇAS`,
    totalDisplay: formatBRLFromCents(totalCents),
    wordsDisplay: amountInWordsPt(totalCents),
    advanceLabel,
    advanceDisplay,
    balanceLabel,
    balanceDisplay,
  };
}

export function buildPythonCompatiblePayload(state: ContratoState) {
  const summary = computeContractSummary(state);
  const validItems = state.producao.itens.filter(
    (it) => it.modelo.trim() !== "" && it.quantidade > 0 && parseCents(it.valor_unitario) > 0
  );

  return {
    fonte_identidade: "PROPOSTA DE VENDA ANA.pdf",
    empresa: state.empresa,
    cliente: state.cliente,
    producao: {
      linhas_em_branco: state.producao.linhas_em_branco || 4,
      itens: summary.hasValidItems
        ? validItems.map((it, idx) => {
            const unitCents = parseCents(it.valor_unitario);
            const subCents = it.quantidade * unitCents;
            return {
              numero: String(idx + 1).padStart(2, "0"),
              modelo: it.modelo.trim(),
              tecido: it.tecido.trim(),
              cor: it.cor.trim(),
              personalizacao: it.personalizacao.trim(),
              grade: it.grade.trim(),
              quantidade: it.quantidade,
              valor_unitario: centsToDecimalString(unitCents),
              subtotal: centsToDecimalString(subCents),
            };
          })
        : [],
      quantidade_total: state.producao.quantidade_total,
      valor_total: state.producao.valor_total,
      prazo_entrega: state.producao.prazo_entrega,
      observacoes: state.producao.observacoes,
      imagens_referencia: state.producao.imagens_referencia.map((ref) => ({
        titulo: ref.titulo,
        data_url: ref.data_url,
      })),
    },
    pagamento: {
      entrada_percentual:
        state.pagamento.entrada_percentual !== null &&
        state.pagamento.saldo_percentual !== null &&
        state.pagamento.entrada_percentual + state.pagamento.saldo_percentual === 100
          ? state.pagamento.entrada_percentual
          : null,
      entrada_valor: state.pagamento.entrada_valor,
      saldo_percentual:
        state.pagamento.entrada_percentual !== null &&
        state.pagamento.saldo_percentual !== null &&
        state.pagamento.entrada_percentual + state.pagamento.saldo_percentual === 100
          ? state.pagamento.saldo_percentual
          : null,
      saldo_valor: state.pagamento.saldo_valor,
      forma_pagamento: state.pagamento.forma_pagamento,
    },
    execucao: {
      local_data: state.execucao.local_data,
    },
  };
}
