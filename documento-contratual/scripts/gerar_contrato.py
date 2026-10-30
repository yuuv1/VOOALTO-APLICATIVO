#!/usr/bin/env python3
"""Gera o contrato da VOOALTO Uniformes em PDF preenchível e Word (.docx) idênticos."""
from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import escape
from io import BytesIO
import json
import logging
from pathlib import Path

from PIL import Image as PILImage
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT, WD_ROW_HEIGHT_RULE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject,
    FloatObject, NameObject, NumberObject, TextStringObject,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT_NAME = "Contrato_Vooalto_Uniformes"

TITLE = "CONTRATO DE CONFECÇÃO E FORNECIMENTO DE UNIFORMES"
INTRO_TEXT = (
    "Pelo presente instrumento, a VOOALTO UNIFORMES (CONTRATADA) e o(a) cliente identificado(a) "
    "abaixo (CONTRATANTE) contratam o fornecimento nas condições a seguir:"
)
SCOPE_TEXT = (
    "Confecção, personalização e fornecimento dos uniformes descritos abaixo, conforme ficha técnica, "
    "modelos, tecidos, cores, artes e grade de tamanhos acordados entre as partes:"
)
ACCEPTANCE_TEXT = (
    "As partes declaram estar de acordo com os dados da produção, especificações, valores, prazos "
    "e condições estabelecidos neste contrato."
)

W, H = A4
MARGIN_LR_CM = 1.5
M = float(Cm(MARGIN_LR_CM).pt)
USABLE_CM = 18.0
CW = W - 2 * M
BODY_LIMIT = 800.0

HEX_INK = "19232D"
HEX_BODY = "37434E"
HEX_MUTED = "626E78"
HEX_ACCENT = "C5635C"
HEX_LINE = "C9D3DC"
HEX_SUBTLE = "DCE3E9"
HEX_PALE = "F4F7F9"
HEX_REF_BG = "FAFBFD"
HEX_CREAM = "F8F3EC"
HEX_CREAM_BORDER = "E5DACB"

INK = colors.HexColor(f"#{HEX_INK}")
BODY_COLOR = colors.HexColor(f"#{HEX_BODY}")
MUTED = colors.HexColor(f"#{HEX_MUTED}")
ACCENT = colors.HexColor(f"#{HEX_ACCENT}")
LINE = colors.HexColor(f"#{HEX_LINE}")
SUBTLE = colors.HexColor(f"#{HEX_SUBTLE}")
PALE = colors.HexColor(f"#{HEX_PALE}")
REF_BG = colors.HexColor(f"#{HEX_REF_BG}")
CREAM = colors.HexColor(f"#{HEX_CREAM}")
CREAM_BORDER = colors.HexColor(f"#{HEX_CREAM_BORDER}")

PRODUCT_WIDTHS_CM = [1.15, 7.95, 2.70, 1.35, 2.35, 2.50]
PRODUCT_WIDTHS_DETAILED_GRADE_CM = [1.15, 6.45, 4.45, 1.05, 2.30, 2.60]


def sanitize_pdf_textfield_value(value: str) -> str:
    """Garante compatibilidade total com fontes padrão PDF (ISO-8859-1 / WinAnsi)."""
    return (
        (value or "")
        .replace("\u2014", " - ")
        .replace("\u2013", "-")
        .replace("  ", " ")
        .strip()
    )


def fit_pdf_field_fontsize(value: str, width_pt: float, default_size: float = 9.0, min_size: float = 5.8) -> float:
    txt = sanitize_pdf_textfield_value(value)
    if not txt:
        return default_size
    usable = max(24.0, width_pt - 22.0)
    size = default_size
    while size > min_size and pdfmetrics.stringWidth(txt, "Helvetica", size) > usable:
        size = round(size - 0.25, 2)
    return size


def fit_docx_field_fontsize(value: str, width_cm: float, default_size: float = 9.2, min_size: float = 6.2) -> float:
    txt = (value or "").strip()
    if not txt:
        return default_size
    usable_pt = max(24.0, width_cm * 28.3465 - 20.0)
    size = default_size
    while size > min_size and len(txt) * size * 0.52 > usable_pt:
        size = round(size - 0.25, 2)
    return size


def resolve_product_widths_cm(computed: dict) -> list[float]:
    if computed["has_items"] and any(
        "\n" in r.get("grade", "") or len(r.get("grade", "")) > 20
        for r in computed["rows"]
    ):
        return PRODUCT_WIDTHS_DETAILED_GRADE_CM
    return PRODUCT_WIDTHS_CM


def resolve_ref_grid_spec(ref_count: int) -> tuple[int, float, float]:
    """Retorna (colunas_por_linha, largura_card_cm, espaco_entre_cards_cm) somando exatamente 18.0 cm."""
    cols = 3 if ref_count <= 3 else (ref_count if ref_count <= 5 else 4)
    gap_cm = 0.30 if cols == 3 else (0.24 if cols == 4 else 0.20)
    slot_w_cm = (USABLE_CM - gap_cm * (cols - 1)) / cols
    return cols, slot_w_cm, gap_cm


def money(value: Decimal | str) -> str:
    return "R$ " + format(Decimal(value), ",.2f").replace(",", "_").replace(".", ",").replace("_", ".")


def cardinal(n: int) -> str:
    units = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
    teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
    tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
    hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]
    if n < 10:
        return units[n]
    if n < 20:
        return teens[n - 10]
    if n < 100:
        return tens[n // 10] + (" e " + cardinal(n % 10) if n % 10 else "")
    if n == 100:
        return "cem"
    if n < 1000:
        return hundreds[n // 100] + (" e " + cardinal(n % 100) if n % 100 else "")
    if n < 1_000_000:
        result = (cardinal(n // 1000) + " " if n // 1000 > 1 else "") + "mil"
        rest = n % 1000
        if rest:
            result += (" e " if rest < 100 or rest % 100 == 0 else ", ") + cardinal(rest)
        return result
    raise ValueError("Valor por extenso suportado até R$ 999.999,99.")


def amount_words(total: Decimal | str) -> str:
    total = Decimal(total)
    whole = int(total)
    cents = int((total - whole) * 100)
    result = cardinal(whole) + (" real" if whole == 1 else " reais")
    if cents:
        result += " e " + cardinal(cents) + (" centavo" if cents == 1 else " centavos")
    return result


def parse_decimal(raw: str | Decimal | int | float, label: str) -> Decimal:
    try:
        val = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} inválido: {raw!r}") from exc
    if not val.is_finite() or val <= 0 or val != val.quantize(Decimal(".01")):
        raise ValueError(f"{label} precisa ser positivo com duas casas decimais.")
    return val


def validate_data(data: dict) -> dict:
    """Valida e resolve totais/parcelas (tanto em branco quanto preenchidos)."""
    prod = data.get("producao", {})
    items = prod.get("itens", [])
    payment = data.get("pagamento", {})

    if not items:
        blank_rows = prod.get("linhas_em_branco", 4)
        if isinstance(blank_rows, bool) or not isinstance(blank_rows, int) or not (1 <= blank_rows <= 12):
            raise ValueError("linhas_em_branco precisa ser um inteiro entre 1 e 12.")
        return {
            "has_items": False,
            "rows": [
                {"numero": f"{i:02d}", "especificacao": "", "grade": "", "quantidade": "", "unitario": "", "subtotal": ""}
                for i in range(1, blank_rows + 1)
            ],
            "count_display": str(prod.get("quantidade_total", "") or ""),
            "total_display": str(prod.get("valor_total", "") or ""),
            "words_display": "",
            "advance_label": f"{payment['entrada_percentual']}% ANTECIPADO" if payment.get("entrada_percentual") else "ENTRADA / SINAL NA APROVAÇÃO",
            "advance_display": str(payment.get("entrada_valor", "") or ""),
            "balance_label": f"{payment['saldo_percentual']}% NA ENTREGA FINAL" if payment.get("saldo_percentual") else "SALDO NA ENTREGA FINAL",
            "balance_display": str(payment.get("saldo_valor", "") or ""),
        }

    total = Decimal("0.00")
    count = 0
    resolved_rows = []
    for idx, item in enumerate(items, start=1):
        quantity = item.get("quantidade")
        if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
            raise ValueError(f"Quantidade inválida no item {idx}.")
        price = parse_decimal(item.get("valor_unitario"), f"Valor unitário do item {idx}")
        subtotal = quantity * price
        raw_sub = item.get("subtotal_proposta") or item.get("subtotal")
        if raw_sub not in (None, "") and parse_decimal(raw_sub, f"Subtotal do item {idx}") != subtotal:
            raise ValueError(f"Subtotal divergente no item {item.get('numero', idx)}.")
        total += subtotal
        count += quantity
        parts = [p for p in [
            f"Tecido: {item['tecido']}" if item.get("tecido") else "",
            f"Cor: {item['cor']}" if item.get("cor") else "",
            item.get("personalizacao", ""),
        ] if p]
        resolved_rows.append({
            "numero": str(item.get("numero", f"{idx:02d}")),
            "modelo": str(item["modelo"]),
            "detalhes": " · ".join(parts),
            "grade": str(item.get("grade", "")),
            "quantidade": str(quantity),
            "unitario": money(price),
            "subtotal": money(subtotal),
        })

    expected_total = prod.get("valor_total") or data.get("total_proposta")
    if expected_total not in (None, "") and parse_decimal(expected_total, "Total") != total:
        raise ValueError("Total divergente dos subtotais.")

    ep = payment.get("entrada_percentual")
    sp = payment.get("saldo_percentual")
    if ep is not None or sp is not None:
        if (ep or 0) + (sp or 0) != 100:
            raise ValueError("Os percentuais de pagamento precisam somar 100%.")
        advance = (total * Decimal(ep) / 100).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        balance = total - advance
        adv_label = f"{ep}% ANTECIPADO"
        bal_label = f"{sp}% NA ENTREGA FINAL"
        adv_disp = money(advance)
        bal_disp = money(balance)
    else:
        adv_label = "ENTRADA / SINAL NA APROVAÇÃO"
        bal_label = "SALDO NA ENTREGA FINAL"
        adv_disp = str(payment.get("entrada_valor", "") or "")
        bal_disp = str(payment.get("saldo_valor", "") or "")

    return {
        "has_items": True,
        "rows": resolved_rows,
        "count_display": f"{count} PEÇAS",
        "total_display": money(total),
        "words_display": amount_words(total),
        "advance_label": adv_label,
        "advance_display": adv_disp,
        "balance_label": bal_label,
        "balance_display": bal_disp,
    }


def company_header_lines(company: dict) -> tuple[str, str, str]:
    line1 = company["nome_comercial"]
    contact_bits = [f"CNPJ {company['cnpj']}", f"Tel./WhatsApp {company['telefone']}"]
    if company.get("email"):
        contact_bits.append(company["email"])
    line2 = " · ".join(contact_bits)
    line3 = company["endereco"]
    return line1, line2, line3


def boss_caption(company: dict) -> str:
    return f"{company['responsavel']} — {company['cargo']}"


def register_fonts() -> None:
    font_dir = ROOT / "assets/fonts"
    pdfmetrics.registerFont(TTFont("DejaVu", str(font_dir / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(font_dir / "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFontFamily(
        "DejaVu", normal="DejaVu", bold="DejaVu-Bold", italic="DejaVu", boldItalic="DejaVu-Bold"
    )


class ContractPDF:
    def __init__(self, path: Path, data: dict, computed: dict):
        self.data = data
        self.computed = computed
        self.c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
        self.c.setTitle("Contrato de Confecção e Fornecimento de Uniformes")
        self.c.setAuthor(data["empresa"]["nome_comercial"])
        self.c.setSubject("Modelo contratual organizacional — dados do cliente, produção, valores e assinaturas")
        self.signatures: list[dict] = []
        self.pages_started = 1

    def new_page(self) -> float:
        self.draw_footer(self.pages_started)
        self.c.showPage()
        self.pages_started += 1
        return 34.0

    def ensure_space(self, top: float, needed: float) -> float:
        if top + needed > BODY_LIMIT:
            return self.new_page()
        return top

    def p(self, text: str, top: float, *, x: float = M, width: float = CW,
          size: float = 8.4, leading: float = 11.4, color=INK,
          bold: bool = False, align: int = TA_LEFT) -> float:
        style = ParagraphStyle(
            "p", fontName="DejaVu-Bold" if bold else "DejaVu",
            fontSize=size, leading=leading, textColor=color, alignment=align,
        )
        para = Paragraph(text, style)
        _, height = para.wrap(width, H)
        top = self.ensure_space(top, height)
        para.drawOn(self.c, x, H - top - height)
        return top + height

    def text(self, text: str, x: float, top: float, size: float = 8.5,
             color=INK, bold: bool = False) -> None:
        self.c.setFillColor(color)
        self.c.setFont("DejaVu-Bold" if bold else "DejaVu", size)
        self.c.drawString(x, H - top - size, text)

    def rect(self, x: float, top: float, width: float, height: float, fill,
             stroke=None, radius: float = 0, lw: float = 0.6, dashed: bool = False):
        self.c.saveState()
        self.c.setFillColor(fill)
        self.c.setStrokeColor(stroke or fill)
        self.c.setLineWidth(lw)
        if dashed:
            self.c.setDash(3, 2.5)
        self.c.roundRect(x, H - top - height, width, height, radius, fill=1, stroke=1)
        self.c.restoreState()

    def section_title(self, text: str, top: float) -> float:
        top = self.ensure_space(top, 34)
        return self.p(escape(text.upper()), top, size=8.6, leading=11.5, color=INK, bold=True) + 2.5

    def field_row_cm(self, specs: list[tuple[str, str, float, str]], top: float,
                     box_h: float = 17.5, gap_cm: float = 0.35, fill=PALE, border=LINE) -> float:
        total_cm = sum(w for _, _, w, _ in specs) + gap_cm * (len(specs) - 1)
        if abs(total_cm - USABLE_CM) > 0.02:
            raise ValueError(f"Largura inválida nos campos: {total_cm:.3f} cm")
        top = self.ensure_space(top, 10 + box_h)
        gap_pt = float(Cm(gap_cm).pt)
        x = M
        for name, label, width_cm, value in specs:
            w_pt = float(Cm(width_cm).pt)
            clean_val = sanitize_pdf_textfield_value(value or "")
            fsize = fit_pdf_field_fontsize(clean_val, w_pt, default_size=9.0, min_size=7.0)
            self.p(escape(label.upper()), top, x=x, width=w_pt, size=6.8, leading=8.8, color=MUTED, bold=True)
            self.c.acroForm.textfield(
                name=name, tooltip=label, x=x, y=H - top - 9.5 - box_h,
                width=w_pt, height=box_h, fontName="Helvetica", fontSize=fsize,
                textColor=INK, fillColor=fill, borderColor=border, borderWidth=0.6,
                borderStyle="solid", forceBorder=True, value=clean_val, maxlen=260,
            )
            x += w_pt + gap_pt
        return top + 9.5 + box_h

    def draw_footer(self, page_num: int, total_pages: int | None = None) -> None:
        self.c.setStrokeColor(SUBTLE)
        self.c.setLineWidth(0.55)
        self.c.line(M, H - 808, W - M, H - 808)
        self.c.setFont("DejaVu", 7.1)
        self.c.setFillColor(MUTED)
        self.c.drawString(M, H - 822, "VOOALTO UNIFORMES · Contrato de confecção e fornecimento de uniformes")
        if total_pages is not None:
            self.c.drawRightString(W - M, H - 822, f"{page_num} / {total_pages}")

    def draw_fitted_image(self, img_path: Path, x: float, top: float, max_w: float, max_h: float) -> None:
        with PILImage.open(img_path) as im:
            iw, ih = im.size
        scale = min(max_w / iw, max_h / ih)
        dw, dh = iw * scale, ih * scale
        dx = x + (max_w - dw) / 2
        dy = H - top - max_h + (max_h - dh) / 2
        self.c.drawImage(str(img_path), dx, dy, width=dw, height=dh, mask="auto")

    def build(self) -> None:
        company = self.data["empresa"]
        client = self.data["cliente"]
        prod = self.data["producao"]
        payment = self.data["pagamento"]
        exec_data = self.data.get("execucao", {})
        comp = self.computed

        # 1. Cabeçalho da empresa
        self.c.drawImage(str(ROOT / "assets/logo-vooalto.png"), M, H - 62,
                         width=144, height=35.1, mask="auto")
        l1, l2, l3 = company_header_lines(company)
        header_right_w = float(Cm(12.2).pt)
        self.p(
            f"<b><font color='#{HEX_INK}'>{escape(l1)}</font></b><br/>"
            f"{escape(l2)}<br/>{escape(l3)}",
            25, x=W - M - header_right_w, width=header_right_w,
            size=7.35, leading=9.8, color=MUTED, align=TA_RIGHT,
        )
        self.c.setStrokeColor(SUBTLE)
        self.c.setLineWidth(0.7)
        self.c.line(M, H - 70, W - M, H - 70)
        self.c.setStrokeColor(ACCENT)
        self.c.setLineWidth(2.2)
        self.c.line(M, H - 70, M + float(Cm(1.6).pt), H - 70)

        refs = prod.get("imagens_referencia", [])
        dense = comp["has_items"] and (len(comp["rows"]) >= 4 or len(refs) >= 4)
        fbox_h = 16.0 if dense else 17.5
        fgap_y = 2.4 if dense else 3.5

        # 2. Título e texto introdutório
        y = self.p(escape(TITLE), 76 if dense else 78, size=13.4 if dense else 13.8, leading=16.0 if dense else 16.8, bold=True)
        y = self.p(escape(INTRO_TEXT), y + 2.0, size=8.0, leading=10.5, color=BODY_COLOR) + (5.0 if dense else 7.0)

        # 3. Seção 1 — Dados do(a) Contratante
        y = self.section_title("1. Identificação do(a) Contratante (Dados do Cliente)", y)
        y = self.field_row_cm([
            ("cliente_nome_razao_social", "Nome completo ou razão social", 18.0, client.get("nome_razao_social", "")),
        ], y, box_h=fbox_h) + fgap_y
        y = self.field_row_cm([
            ("cliente_cpf_cnpj", "CPF / CNPJ", 4.80, client.get("cpf_cnpj", "")),
            ("cliente_telefone", "Telefone / WhatsApp", 4.60, client.get("telefone", "")),
            ("cliente_email", "E-mail", 7.90, client.get("email", "")),
        ], y, box_h=fbox_h) + fgap_y
        y = self.field_row_cm([
            ("cliente_endereco", "Endereço completo (rua/av., nº, bairro, complemento)", 11.85, client.get("endereco", "")),
            ("cliente_cidade_uf_cep", "Cidade / UF · CEP", 5.80, client.get("cidade_uf_cep", "")),
        ], y, box_h=fbox_h) + (5.5 if dense else 8.0)

        # 4. Seção 2 — Dados da Produção e Ficha Técnica
        y = self.section_title("2. Dados da Produção e Especificações do Pedido", y)
        y = self.p(escape(SCOPE_TEXT), y, size=8.0, leading=10.4, color=BODY_COLOR) + (3.0 if dense else 4.0)

        prod_widths_cm = resolve_product_widths_cm(comp)
        col_pts = [float(Cm(w).pt) for w in prod_widths_cm]
        head_center = ParagraphStyle("hc", fontName="DejaVu-Bold", fontSize=7.0, leading=9.2, textColor=colors.white, alignment=TA_CENTER)
        head_left = ParagraphStyle("hl", parent=head_center, alignment=TA_LEFT)
        head_right = ParagraphStyle("hr", parent=head_center, alignment=TA_RIGHT)
        cell_fs = 7.75 if dense else 8.1
        cell_lead = 9.7 if dense else 10.5
        cell_left = ParagraphStyle("cl", fontName="DejaVu", fontSize=cell_fs, leading=cell_lead, textColor=INK, alignment=TA_LEFT)
        cell_grade = ParagraphStyle("cg", fontName="DejaVu", fontSize=7.15 if dense else 8.0, leading=9.1 if dense else 10.2, textColor=INK, alignment=TA_CENTER)
        cell_center = ParagraphStyle("cc", parent=cell_left, alignment=TA_CENTER)
        cell_right = ParagraphStyle("cr", parent=cell_left, alignment=TA_RIGHT)

        header_cells = [
            Paragraph("ITEM", head_center),
            Paragraph("MODELO / TECIDO / COR / PERSONALIZAÇÃO", head_left),
            Paragraph("GRADE / TAM.", head_center),
            Paragraph("QTD.", head_center),
            Paragraph("UNITÁRIO", head_right),
            Paragraph("SUBTOTAL", head_right),
        ]
        table_rows = [header_cells]
        row_heights = [17.5 if dense else 19.0]
        detail_fs = "7.0" if dense else "7.5"
        for r in comp["rows"]:
            if comp["has_items"]:
                desc = f"<b>{escape(r['modelo'])}</b>"
                if r["detalhes"]:
                    desc += f"<br/><font size='{detail_fs}' color='#{HEX_BODY}'>{escape(r['detalhes'])}</font>"
                grade_html = "<br/>".join(escape(part) for part in str(r["grade"]).splitlines())
                table_rows.append([
                    Paragraph(f"<b>{escape(r['numero'])}</b>", cell_center),
                    Paragraph(desc, cell_left),
                    Paragraph(grade_html, cell_grade),
                    Paragraph(escape(r["quantidade"]), cell_center),
                    Paragraph(escape(r["unitario"]), cell_right),
                    Paragraph(f"<b>{escape(r['subtotal'])}</b>", cell_right),
                ])
                row_heights.append(None)
            else:
                table_rows.append([
                    Paragraph(f"<b>{escape(r['numero'])}</b>", cell_center),
                    Paragraph("", cell_left),
                    Paragraph("", cell_center),
                    Paragraph("", cell_center),
                    Paragraph("", cell_right),
                    Paragraph("", cell_right),
                ])
                row_heights.append(20.5)

        row_pad = 2.8 if dense else 4.0
        table = Table(table_rows, colWidths=col_pts, rowHeights=row_heights, repeatRows=1)
        t_style = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4.5 if dense else 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4.5 if dense else 5),
            ("TOPPADDING", (0, 0), (-1, 0), 4.0 if dense else 4.5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4.0 if dense else 4.5),
            ("TOPPADDING", (0, 1), (-1, -1), row_pad),
            ("BOTTOMPADDING", (0, 1), (-1, -1), row_pad),
            ("BOX", (0, 0), (-1, -1), 0.55, LINE),
            ("LINEBELOW", (0, 1), (-1, -1), 0.45, LINE),
            ("LINEAFTER", (0, 1), (-2, -1), 0.45, LINE),
        ])
        table.setStyle(t_style)
        _, full_h = table.wrap(CW, H * 10)
        if y + full_h + 28 <= BODY_LIMIT:
            table_top = y
            table.drawOn(self.c, M, H - y - full_h)
            t_height = full_h
        else:
            # Paginação automática com repetição de cabeçalho quando houver muitos itens (ex.: 8..30 páginas)
            parts = table.split(CW, max(90.0, BODY_LIMIT - y))
            if not parts:
                y = self.new_page()
                parts = table.split(CW, BODY_LIMIT - y)
            table_top = y
            t_height = 0.0
            for p_i, part in enumerate(parts):
                part.setStyle(t_style)
                _, ph_i = part.wrap(CW, BODY_LIMIT - y + 5)
                if p_i > 0:
                    y = self.new_page()
                part.drawOn(self.c, M, H - y - ph_i)
                if p_i < len(parts) - 1:
                    y += ph_i
                else:
                    t_height = ph_i

        # Campos editáveis nas linhas de produção quando o modelo está em branco
        if not comp["has_items"]:
            row_y = table_top + 19.0
            for idx, r in enumerate(comp["rows"], start=1):
                cx = M + col_pts[0]
                bg = colors.white if idx % 2 == 1 else PALE
                for suffix, label, cw_i in [
                    ("especificacao", f"Item {r['numero']} — Modelo, tecido, cor e personalização", col_pts[1]),
                    ("grade", f"Item {r['numero']} — Grade / tamanhos", col_pts[2]),
                    ("qtd", f"Item {r['numero']} — Quantidade", col_pts[3]),
                    ("unitario", f"Item {r['numero']} — Valor unitário (R$)", col_pts[4]),
                    ("subtotal", f"Item {r['numero']} — Subtotal (R$)", col_pts[5]),
                ]:
                    self.c.acroForm.textfield(
                        name=f"item_{r['numero']}_{suffix}", tooltip=label,
                        x=cx + 1.5, y=H - row_y - 20.5 + 1.5,
                        width=cw_i - 3.0, height=17.5,
                        fontName="Helvetica", fontSize=8.4,
                        textColor=INK, fillColor=bg, borderColor=bg, borderWidth=0,
                        borderStyle="solid", forceBorder=False, value="", maxlen=180,
                    )
                    cx += cw_i
                row_y += 20.5
        y += t_height

        # Barra escura de totais
        bar_h = 26.0
        self.rect(M, y, CW, bar_h, INK)
        if comp["has_items"]:
            self.text(f"TOTAL DE PEÇAS:  {comp['count_display']}", M + 8, y + 4.0, 8.0, colors.white, True)
            if comp["words_display"]:
                self.text(comp["words_display"], M + 8, y + 14.8, 6.8, SUBTLE, False)
            self.c.setFont("DejaVu-Bold", 12.2 if dense else 12.8)
            self.c.setFillColor(colors.white)
            self.c.drawRightString(W - M - 8, H - y - 17.5, f"VALOR TOTAL:  {comp['total_display']}")
        else:
            self.text("TOTAL DE PEÇAS:", M + 8, y + 7.5, 7.6, colors.white, True)
            self.c.acroForm.textfield(
                name="producao_quantidade_total", tooltip="Quantidade total de peças",
                x=M + 84, y=H - y - bar_h + 4, width=82, height=18,
                fontName="Helvetica-Bold", fontSize=9.0,
                textColor=INK, fillColor=colors.white, borderColor=LINE, borderWidth=0.5,
                borderStyle="solid", forceBorder=True, value=comp["count_display"], maxlen=40,
            )
            self.c.setFont("DejaVu-Bold", 7.6)
            self.c.setFillColor(colors.white)
            self.c.drawRightString(W - M - 114, H - y - 15.8, "VALOR TOTAL DO PEDIDO (R$):")
            self.c.acroForm.textfield(
                name="producao_valor_total", tooltip="Valor total do pedido (R$)",
                x=W - M - 108, y=H - y - bar_h + 4, width=100, height=18,
                fontName="Helvetica-Bold", fontSize=9.5,
                textColor=INK, fillColor=colors.white, borderColor=LINE, borderWidth=0.5,
                borderStyle="solid", forceBorder=True, value=comp["total_display"], maxlen=40,
            )
        y += bar_h + (4.2 if dense else 5.0)

        # Prazo de entrega e observações da produção
        y = self.field_row_cm([
            ("producao_prazo_entrega", "Prazo de produção / previsão de entrega", 7.15, prod.get("prazo_entrega", "")),
            ("producao_observacoes", "Observações da produção / detalhes de arte", 10.50, prod.get("observacoes", "")),
        ], y, box_h=16.0 if dense else 17.0) + (4.8 if dense else 5.5)

        # Quadro de imagens de referência das camisetas (Ficha Técnica)
        cols_per_row, slot_w_cm, slot_gap_cm = resolve_ref_grid_spec(len(refs))
        ref_h = 68.0 if cols_per_row <= 3 else (65.0 if cols_per_row == 4 else 62.0)
        y = self.ensure_space(y, 10 + ref_h)
        self.p("CROQUIS / IMAGENS DE REFERÊNCIA DAS CAMISETAS (FICHA TÉCNICA)", y,
               size=6.8, leading=8.8, color=MUTED, bold=True)
        y += 9.0
        slot_gap_pt = float(Cm(slot_gap_cm).pt)
        slot_w_pt = float(Cm(slot_w_cm).pt)
        total_slots = max(cols_per_row, len(refs))
        base_cap_size = 5.85 if cols_per_row >= 5 else (6.3 if cols_per_row == 4 else 6.6)
        for row_start in range(0, total_slots, cols_per_row):
            if row_start > 0:
                y = self.ensure_space(y, ref_h + 7)
            sx = M
            for col_offset in range(cols_per_row):
                idx_ref = row_start + col_offset
                ref = refs[idx_ref] if idx_ref < len(refs) else None
                self.rect(sx, y, slot_w_pt, ref_h, REF_BG, stroke=LINE, radius=2.5, lw=0.6, dashed=(ref is None))
                if ref and ref.get("arquivo") and (ROOT / ref["arquivo"]).exists():
                    self.draw_fitted_image(ROOT / ref["arquivo"], sx + 3.5, y + 2.5, slot_w_pt - 7.0, ref_h - 13.5)
                    caption = ref.get("titulo", f"Referência {idx_ref + 1:02d}")
                    cap_s = base_cap_size
                    while cap_s > 4.9 and pdfmetrics.stringWidth(caption, "DejaVu-Bold", cap_s) > (slot_w_pt - 6.0):
                        cap_s = round(cap_s - 0.2, 2)
                    self.p(escape(caption), y + ref_h - 10.0, x=sx + 2.5, width=slot_w_pt - 5.0,
                           size=cap_s, leading=7.5, color=MUTED, bold=True, align=TA_CENTER)
                else:
                    title = (ref.get("titulo") if ref else None) or f"Referência {idx_ref + 1:02d} — Camiseta"
                    self.p(
                        f"<b>{escape(title)}</b><br/>"
                        f"<font size='6.5' color='#{HEX_MUTED}'>Espaço reservado para imagem / ficha técnica</font>",
                        y + 18, x=sx + 6, width=slot_w_pt - 12,
                        size=7.1, leading=9.5, color=MUTED, align=TA_CENTER,
                    )
                sx += slot_w_pt + slot_gap_pt
            y += ref_h + (5.8 if dense else 7.5)

        # 5. Seção 3 — Condições de Pagamento
        y = self.section_title("3. Condições de Pagamento", y)
        pay_gap = float(Cm(0.35).pt)
        pay_w = float(Cm(8.825).pt)
        card_h = 28.5 if dense else 31.0
        y = self.ensure_space(y, card_h + 34)
        for px, label, val, fname in [
            (M, comp["advance_label"], comp["advance_display"], "pagamento_entrada_valor"),
            (M + pay_w + pay_gap, comp["balance_label"], comp["balance_display"], "pagamento_saldo_valor"),
        ]:
            self.rect(px, y, pay_w, card_h, CREAM, stroke=CREAM_BORDER, radius=3, lw=0.6)
            self.text(label, px + 8, y + (4.0 if dense else 4.5), 6.9, MUTED, True)
            if comp["has_items"] and val:
                self.text(val, px + 8, y + (13.2 if dense else 14.5), 10.8 if dense else 11.2, INK, True)
            else:
                self.text("R$", px + 8, y + 16.0, 9.2, INK, True)
                self.c.acroForm.textfield(
                    name=fname, tooltip=label,
                    x=px + 26, y=H - y - card_h + 3.0, width=pay_w - 34, height=15.0,
                    fontName="Helvetica-Bold", fontSize=9.5,
                    textColor=INK, fillColor=colors.white, borderColor=CREAM_BORDER, borderWidth=0.5,
                    borderStyle="solid", forceBorder=True, value=val, maxlen=50,
                )
        y += card_h + (3.8 if dense else 4.5)

        y = self.field_row_cm([
            ("pagamento_forma", "Forma de pagamento (Pix, depósito bancário ou cartão)", 9.65, payment.get("forma_pagamento", "")),
            ("local_data_assinatura", "Local e data", 8.00, exec_data.get("local_data", "")),
        ], y, box_h=15.5 if dense else 17.0) + (5.0 if dense else 6.5)

        # 6. Concordância e Assinaturas lado a lado
        sig_box_h = 40.0 if dense else 43.0
        y = self.ensure_space(y, 16 + 11 + sig_box_h + 24)
        y = self.p(escape(ACCEPTANCE_TEXT), y, size=7.9, leading=10.2, color=BODY_COLOR) + (4.5 if dense else 5.5)

        sig_gap = float(Cm(0.60).pt)
        sig_w = float(Cm(8.70).pt)
        right_x = M + sig_w + sig_gap
        self.text("CONTRATADA (EMPRESA)", M, y, 7.2, MUTED, True)
        self.text("CONTRATANTE (CLIENTE)", right_x, y, 7.2, MUTED, True)
        y += 10.5

        # Caixa esquerda: assinatura do chefe (Esio Andrade — Proprietário; PNG já traz linha base)
        self.rect(M, y, sig_w, sig_box_h, colors.white, stroke=LINE, radius=2.5, lw=0.6)
        self.draw_fitted_image(ROOT / "assets/assinatura-esio-andrade.png", M + 20, y + 5, sig_w - 40, sig_box_h - 11)

        # Caixa direita: assinatura do contratante do serviço (cliente), com linha base alinhada
        self.rect(right_x, y, sig_w, sig_box_h, colors.white, stroke=LINE, radius=2.5, lw=0.6)
        self.c.setStrokeColor(INK)
        self.c.setLineWidth(0.75)
        self.c.line(right_x + 28, H - y - sig_box_h + 7.5, right_x + sig_w - 28, H - y - sig_box_h + 7.5)
        self.signatures.append({
            "name": "assinatura_digital_contratante",
            "page": self.pages_started - 1,
            "rect": (right_x, H - y - sig_box_h, right_x + sig_w, H - y),
        })

        cap_y = y + sig_box_h + 3.5
        self.p(
            f"<b>{escape(boss_caption(company))}</b><br/>"
            f"<font size='7.1' color='#{HEX_MUTED}'>{escape(company['nome_comercial'])} · CNPJ {escape(company['cnpj'])}</font>",
            cap_y, x=M, width=sig_w, size=8.3, leading=10.5, color=INK,
        )
        self.p(
            "<b>Assinatura do(a) Contratante / Representante</b><br/>"
            f"<font size='7.1' color='#{HEX_MUTED}'>Contratante do serviço (cliente)</font>",
            cap_y, x=right_x, width=sig_w, size=8.3, leading=10.5, color=INK,
        )

        self.draw_footer(self.pages_started, self.pages_started)
        self.c.showPage()
        self.c.save()


def add_digital_signature_fields(source: Path, destination: Path, signatures: list[dict]) -> None:
    """Reserva o campo de assinatura digital/manuscrita do(a) contratante sem aplicar certificado."""
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    reader = PdfReader(source)
    total_pages = len(reader.pages)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    form = writer._root_object["/AcroForm"].get_object()
    form[NameObject("/SigFlags")] = NumberObject(3)
    form[NameObject("/NeedAppearances")] = BooleanObject(False)
    dr = form.get("/DR")
    dr_obj = dr.get_object() if dr is not None else DictionaryObject()
    form[NameObject("/DR")] = dr_obj
    font_dict = dr_obj.get("/Font")
    font_obj = font_dict.get_object() if font_dict is not None else DictionaryObject()
    dr_obj[NameObject("/Font")] = font_obj
    if "/Helv" not in font_obj:
        helv = writer._add_object(DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
            NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
        }))
        font_obj[NameObject("/Helv")] = helv
    for spec in signatures:
        page = writer.pages[spec["page"]]
        x0, y0, x1, y1 = spec["rect"]
        w_box, h_box = x1 - x0, y1 - y0
        stream_cmds = (
            f"q\n"
            f"0.788 0.827 0.863 RG\n0.6 w\n0.5 0.5 {w_box - 1:.3f} {h_box - 1:.3f} re S\n"
            f"0.098 0.137 0.176 RG\n0.75 w\n28 7.5 m {w_box - 28:.3f} 7.5 l S\n"
            f"Q\n"
        )
        appearance = DecodedStreamObject()
        appearance.set_data(stream_cmds.encode("ascii"))
        appearance.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/FormType"): NumberObject(1),
            NameObject("/Resources"): DictionaryObject(),
            NameObject("/BBox"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(w_box), FloatObject(h_box)]),
        })
        widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Sig"),
            NameObject("/T"): TextStringObject(spec["name"]),
            NameObject("/TU"): TextStringObject("Assinatura do(a) contratante — manuscrita ou por certificado digital"),
            NameObject("/F"): NumberObject(4),
            NameObject("/P"): page.indirect_reference,
            NameObject("/Rect"): ArrayObject([FloatObject(v) for v in spec["rect"]]),
            NameObject("/AP"): DictionaryObject({NameObject("/N"): writer._add_object(appearance)}),
            NameObject("/BS"): DictionaryObject({NameObject("/W"): NumberObject(0)}),
        })
        ref = writer._add_object(widget)
        form["/Fields"].append(ref)
        page["/Annots"].get_object().append(ref)

    if total_pages > 1:
        overlay_buf = BytesIO()
        oc = canvas.Canvas(overlay_buf, pagesize=A4)
        for pno in range(1, total_pages):
            oc.setFont("DejaVu", 7.1)
            oc.setFillColor(MUTED)
            oc.drawRightString(W - M, H - 822, f"{pno} / {total_pages}")
            oc.showPage()
        oc.save()
        overlay_buf.seek(0)
        ov_reader = PdfReader(overlay_buf)
        for pno in range(total_pages - 1):
            writer.pages[pno].merge_page(ov_reader.pages[pno])

    with destination.open("wb") as stream:
        writer.write(stream)


# -------------------- Construção idêntica em Microsoft Word (.docx) --------------------

def xml_property(parent, name: str, attrs: dict):
    child = parent.find(qn(name))
    if child is None:
        child = OxmlElement(name)
        parent.append(child)
    for key, value in attrs.items():
        child.set(qn(key), str(value))
    return child


def cell_margins(cell, *, top: int = 55, bottom: int = 55, left: int = 85, right: int = 85):
    margins = xml_property(cell._tc.get_or_add_tcPr(), "w:tcMar", {})
    for tag, value in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        xml_property(margins, f"w:{tag}", {"w:w": value, "w:type": "dxa"})


def cell_borders(cell, *, top=None, bottom=None, left=None, right=None):
    borders = xml_property(cell._tc.get_or_add_tcPr(), "w:tcBorders", {})
    for side, spec in [("top", top), ("bottom", bottom), ("left", left), ("right", right)]:
        if spec is None:
            xml_property(borders, f"w:{side}", {"w:val": "nil"})
        else:
            val, sz, color = spec
            xml_property(borders, f"w:{side}", {"w:val": val, "w:sz": sz, "w:space": "0", "w:color": color})


def all_borders(cell, color: str = HEX_LINE, sz: int = 4, val: str = "single"):
    spec = (val, sz, color)
    cell_borders(cell, top=spec, bottom=spec, left=spec, right=spec)


def fixed_table(doc, widths_cm: list[float], rows: int = 1):
    """Cria tabela A4 de layout fixo com grade, largura total e células 100% consistentes."""
    table = doc.add_table(rows=rows, cols=len(widths_cm))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    widths = [Cm(w) for w in widths_cm]
    pr = table._tbl.tblPr
    xml_property(pr, "w:tblLayout", {"w:type": "fixed"})
    xml_property(pr, "w:tblW", {"w:w": sum(w.twips for w in widths), "w:type": "dxa"})
    xml_property(pr, "w:tblInd", {"w:w": 0, "w:type": "dxa"})
    borders = xml_property(pr, "w:tblBorders", {})
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        xml_property(borders, f"w:{edge}", {"w:val": "nil"})
    cell_mar = xml_property(pr, "w:tblCellMar", {})
    for tag, val in [("top", 0), ("bottom", 0), ("left", 0), ("right", 0)]:
        xml_property(cell_mar, f"w:{tag}", {"w:w": val, "w:type": "dxa"})
    for col, width in zip(table.columns, widths):
        col.width = width
    for row in table.rows:
        row.height_rule = WD_ROW_HEIGHT_RULE.AT_LEAST
        xml_property(row._tr.get_or_add_trPr(), "w:cantSplit", {})
        for cell, width in zip(row.cells, widths):
            cell.width = width
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            cell_margins(cell)
    return table


def shade(cell, fill: str):
    xml_property(cell._tc.get_or_add_tcPr(), "w:shd", {"w:val": "clear", "w:color": "auto", "w:fill": fill})


def run_format(run, size: float = 8.8, bold: bool = False, color: str = HEX_INK):
    run.font.name = "Arial"
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    return run


def format_paragraph(p, after: float = 0, before: float = 0, align=None, line_spacing: float = 1.08):
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = line_spacing
    p.paragraph_format.widow_control = True
    if align is not None:
        p.alignment = align
    return p


def doc_spacer(doc, pt_height: float = 3.0):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(pt_height)
    p.paragraph_format.line_spacing = Pt(1)
    run_format(p.add_run(""), size=1)
    return p


def doc_para(doc, text: str, *, size: float = 8.4, bold: bool = False, color: str = HEX_INK,
             before: float = 0, after: float = 3, line_spacing: float = 1.08):
    p = format_paragraph(doc.add_paragraph(), before=before, after=after, line_spacing=line_spacing)
    run_format(p.add_run(text), size, bold, color)
    return p


def set_cell(cell, text: str, size: float = 8.5, bold: bool = False, color: str = HEX_INK,
             align=None, line_spacing: float = 1.06):
    cell.text = ""
    p = format_paragraph(cell.paragraphs[0], align=align, line_spacing=line_spacing)
    run_format(p.add_run(text), size, bold, color)
    return p


def doc_section_heading(doc, text: str):
    p = doc_para(doc, text.upper(), size=8.6, bold=True, color=HEX_INK, before=5, after=2)
    p.paragraph_format.keep_with_next = True
    return p


def doc_boxed_fields(doc, fields: list[tuple[str, float, str]], *, gap_cm: float = 0.35,
                     box_height_cm: float = 0.56, after_pt: float = 2.5):
    """Linha de campos com rótulo externo acima e caixas delimitadas separadas por coluna-espaço."""
    widths: list[float] = []
    field_indices: list[int] = []
    for idx, (_, w_cm, _) in enumerate(fields):
        if idx > 0:
            widths.append(gap_cm)
        field_indices.append(len(widths))
        widths.append(w_cm)
    if abs(sum(widths) - USABLE_CM) > 0.02:
        raise ValueError(f"Largura inválida na linha de campos do Word: {sum(widths):.3f} cm")

    table = fixed_table(doc, widths, rows=2)
    label_row, input_row = table.rows[0], table.rows[1]
    label_row.height = Cm(0.30)
    input_row.height = Cm(box_height_cm)
    xml_property(label_row._tr.get_or_add_trPr(), "w:tblHeader", {})

    for col_i in range(len(widths)):
        cell_borders(label_row.cells[col_i])
        cell_margins(label_row.cells[col_i], top=0, bottom=18, left=15, right=15)
        if col_i not in field_indices:
            set_cell(label_row.cells[col_i], "", size=6.5)
            cell_borders(input_row.cells[col_i])
            cell_margins(input_row.cells[col_i], top=0, bottom=0, left=0, right=0)
            set_cell(input_row.cells[col_i], "", size=6.5)

    for col_i, (label, w_cm, value) in zip(field_indices, fields):
        lcell = label_row.cells[col_i]
        p_lbl = set_cell(lcell, label.upper(), size=6.8, bold=True, color=HEX_MUTED)
        p_lbl.paragraph_format.keep_with_next = True

        icell = input_row.cells[col_i]
        shade(icell, HEX_PALE)
        all_borders(icell, color=HEX_LINE, sz=4)
        cell_margins(icell, top=36, bottom=36, left=75, right=75)
        fsize = fit_docx_field_fontsize(value or "", w_cm, default_size=9.1, min_size=7.1)
        set_cell(icell, value or "", size=fsize, bold=False, color=HEX_INK)

    if after_pt > 0:
        doc_spacer(doc, after_pt)
    return table


def fit_picture_dims_cm(img_path: Path, max_w_cm: float, max_h_cm: float) -> tuple[float, float]:
    with PILImage.open(img_path) as im:
        iw, ih = im.size
    scale = min(max_w_cm / iw, max_h_cm / ih)
    return iw * scale, ih * scale


def build_docx(data: dict, destination: Path, computed: dict):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin = Cm(0.85)
    sec.bottom_margin = Cm(1.05)
    sec.left_margin = sec.right_margin = Cm(MARGIN_LR_CM)
    sec.footer_distance = Cm(0.45)

    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(8.5)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 1.08

    company = data["empresa"]
    client = data["cliente"]
    prod = data["producao"]
    payment = data["pagamento"]
    exec_data = data.get("execucao", {})

    doc.core_properties.title = "Contrato de Confecção e Fornecimento de Uniformes"
    doc.core_properties.author = company["nome_comercial"]
    doc.core_properties.subject = "Modelo contratual organizacional — VOOALTO Uniformes"

    # 1. Cabeçalho da empresa no corpo do documento
    header = fixed_table(doc, [5.8, 12.2], rows=1)
    h_left, h_right = header.rows[0].cells
    cell_margins(h_left, top=0, bottom=30, left=0, right=40)
    cell_margins(h_right, top=0, bottom=30, left=40, right=0)
    p_logo = set_cell(h_left, "")
    p_logo.add_run().add_picture(str(ROOT / "assets/logo-vooalto.png"), width=Cm(5.05))

    l1, l2, l3 = company_header_lines(company)
    p_co = set_cell(h_right, l1, size=7.8, bold=True, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.RIGHT, line_spacing=1.12)
    run_format(p_co.add_run(f"\n{l2}\n{l3}"), size=7.2, bold=False, color=HEX_MUTED)

    # Linha divisória bicolor (coral à esquerda + cinza sutil à direita, igual ao PDF)
    div_table = fixed_table(doc, [1.6, 16.4], rows=1)
    div_table.rows[0].height = Cm(0.08)
    d_left, d_right = div_table.rows[0].cells
    for dc in (d_left, d_right):
        cell_margins(dc, top=0, bottom=0, left=0, right=0)
        p_d = set_cell(dc, "", size=1, line_spacing=1.0)
        p_d.paragraph_format.line_spacing = Pt(1)
    cell_borders(d_left, bottom=("single", 16, HEX_ACCENT))
    cell_borders(d_right, bottom=("single", 4, HEX_SUBTLE))

    refs = prod.get("imagens_referencia", [])
    dense = computed["has_items"] and (len(computed["rows"]) >= 4 or len(refs) >= 4)
    fbox_cm = 0.50 if dense else 0.56
    fafter_pt = 1.6 if dense else 2.5

    # 2. Título e introdução
    doc_para(doc, TITLE, size=13.2 if dense else 13.6, bold=True, color=HEX_INK, before=3.5 if dense else 5, after=1.5 if dense else 2, line_spacing=1.06)
    doc_para(doc, INTRO_TEXT, size=8.0, color=HEX_BODY, before=0, after=2.5 if dense else 3.5, line_spacing=1.06)

    # 3. Seção 1 — Dados do(a) Contratante
    doc_section_heading(doc, "1. Identificação do(a) Contratante (Dados do Cliente)")
    doc_boxed_fields(doc, [
        ("Nome completo ou razão social", 18.0, client.get("nome_razao_social", "")),
    ], box_height_cm=fbox_cm, after_pt=fafter_pt)
    doc_boxed_fields(doc, [
        ("CPF / CNPJ", 4.80, client.get("cpf_cnpj", "")),
        ("Telefone / WhatsApp", 4.60, client.get("telefone", "")),
        ("E-mail", 7.90, client.get("email", "")),
    ], box_height_cm=fbox_cm, after_pt=fafter_pt)
    doc_boxed_fields(doc, [
        ("Endereço completo (rua/av., nº, bairro, complemento)", 11.85, client.get("endereco", "")),
        ("Cidade / UF · CEP", 5.80, client.get("cidade_uf_cep", "")),
    ], box_height_cm=fbox_cm, after_pt=2.2 if dense else 3.5)

    # 4. Seção 2 — Dados da Produção e Especificações do Pedido
    doc_section_heading(doc, "2. Dados da Produção e Especificações do Pedido")
    doc_para(doc, SCOPE_TEXT, size=8.0, color=HEX_BODY, before=0, after=2.0 if dense else 3.0, line_spacing=1.06)

    prod_widths_cm = resolve_product_widths_cm(computed)
    prod_table = fixed_table(doc, prod_widths_cm, rows=1 + len(computed["rows"]))
    prod_headers = [
        ("ITEM", WD_ALIGN_PARAGRAPH.CENTER),
        ("MODELO / TECIDO / COR / PERSONALIZAÇÃO", WD_ALIGN_PARAGRAPH.LEFT),
        ("GRADE / TAM.", WD_ALIGN_PARAGRAPH.CENTER),
        ("QTD.", WD_ALIGN_PARAGRAPH.CENTER),
        ("UNITÁRIO", WD_ALIGN_PARAGRAPH.RIGHT),
        ("SUBTOTAL", WD_ALIGN_PARAGRAPH.RIGHT),
    ]
    prod_table.rows[0].height = Cm(0.54 if dense else 0.60)
    xml_property(prod_table.rows[0]._tr.get_or_add_trPr(), "w:tblHeader", {})
    last_col = len(prod_headers) - 1
    edge_ink = ("single", 4, HEX_INK)
    for c_idx, (cell, (h_text, h_align)) in enumerate(zip(prod_table.rows[0].cells, prod_headers)):
        shade(cell, HEX_INK)
        cell_borders(
            cell,
            top=edge_ink,
            bottom=edge_ink,
            left=edge_ink if c_idx == 0 else None,
            right=edge_ink if c_idx == last_col else None,
        )
        cell_margins(cell, top=42 if dense else 55, bottom=42 if dense else 55, left=55, right=55)
        set_cell(cell, h_text, size=7.0, bold=True, color="FFFFFF", align=h_align)

    for idx, (row, r) in enumerate(zip(prod_table.rows[1:], computed["rows"])):
        row.height = Cm(0.56 if dense else 0.65)
        row_bg = "FFFFFF" if idx % 2 == 0 else HEX_PALE
        vpad = 30 if dense else 44
        for cell in row.cells:
            shade(cell, row_bg)
            all_borders(cell, color=HEX_LINE, sz=4)
            cell_margins(cell, top=vpad, bottom=vpad, left=55, right=55)
        set_cell(row.cells[0], r["numero"], size=7.9 if dense else 8.2, bold=True, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.CENTER)
        if computed["has_items"]:
            p_desc = set_cell(row.cells[1], r["modelo"], size=7.9 if dense else 8.3, bold=True, color=HEX_INK, line_spacing=1.04)
            if r["detalhes"]:
                run_format(p_desc.add_run("\n" + r["detalhes"]), size=7.1 if dense else 7.6, color=HEX_BODY)
            set_cell(row.cells[2], r["grade"], size=7.3 if dense else 8.1, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.CENTER, line_spacing=1.04)
            set_cell(row.cells[3], r["quantidade"], size=8.0 if dense else 8.3, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.CENTER)
            set_cell(row.cells[4], r["unitario"], size=8.0 if dense else 8.3, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.RIGHT)
            set_cell(row.cells[5], r["subtotal"], size=8.0 if dense else 8.3, bold=True, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.RIGHT)
        else:
            set_cell(row.cells[1], "", size=8.5, color=HEX_INK)
            set_cell(row.cells[2], "", size=8.5, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.CENTER)
            set_cell(row.cells[3], "", size=8.5, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.CENTER)
            set_cell(row.cells[4], "", size=8.5, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.RIGHT)
            set_cell(row.cells[5], "", size=8.5, bold=True, color=HEX_INK, align=WD_ALIGN_PARAGRAPH.RIGHT)

    # Barra escura de totais (com caixas brancas editáveis quando em branco, igual ao PDF)
    if computed["has_items"]:
        total_bar = fixed_table(doc, [9.2, 8.8], rows=1)
        total_bar.rows[0].height = Cm(0.80)
        tb_left, tb_right = total_bar.rows[0].cells
        shade(tb_left, HEX_INK)
        cell_borders(tb_left, top=edge_ink, bottom=edge_ink, left=edge_ink, right=None)
        cell_margins(tb_left, top=55, bottom=55, left=100, right=60)
        shade(tb_right, HEX_INK)
        cell_borders(tb_right, top=edge_ink, bottom=edge_ink, left=None, right=edge_ink)
        cell_margins(tb_right, top=55, bottom=55, left=60, right=100)
        p_tl = set_cell(tb_left, f"TOTAL DE PEÇAS:  {computed['count_display']}", size=8.0, bold=True, color="FFFFFF")
        if computed["words_display"]:
            run_format(p_tl.add_run(f"\n{computed['words_display']}"), size=6.9, color=HEX_SUBTLE)
        set_cell(tb_right, f"VALOR TOTAL:  {computed['total_display']}", size=12.0, bold=True, color="FFFFFF", align=WD_ALIGN_PARAGRAPH.RIGHT)
    else:
        total_bar = fixed_table(doc, [3.05, 2.85, 8.20, 3.60, 0.30], rows=1)
        total_bar.rows[0].height = Cm(0.82)
        c_lbl_q, c_box_q, c_lbl_v, c_box_v, c_pad = total_bar.rows[0].cells
        edge_box = ("single", 28, HEX_INK)
        for dark_c in (c_lbl_q, c_lbl_v, c_pad):
            shade(dark_c, HEX_INK)
            cell_margins(dark_c, top=45, bottom=45, left=95, right=70)
        cell_borders(c_lbl_q, top=edge_ink, bottom=edge_ink, left=edge_ink, right=None)
        cell_borders(c_lbl_v, top=edge_ink, bottom=edge_ink, left=None, right=None)
        cell_borders(c_pad, top=edge_ink, bottom=edge_ink, left=None, right=edge_ink)
        cell_margins(c_pad, top=0, bottom=0, left=0, right=0)
        set_cell(c_lbl_q, "TOTAL DE PEÇAS:", size=7.5, bold=True, color="FFFFFF")
        set_cell(c_lbl_v, "VALOR TOTAL DO PEDIDO (R$):", size=7.5, bold=True, color="FFFFFF", align=WD_ALIGN_PARAGRAPH.RIGHT)
        set_cell(c_pad, "", size=6.0)
        for white_c, val_str, aln in [
            (c_box_q, computed["count_display"], WD_ALIGN_PARAGRAPH.CENTER),
            (c_box_v, computed["total_display"], WD_ALIGN_PARAGRAPH.RIGHT),
        ]:
            shade(white_c, "FFFFFF")
            cell_borders(white_c, top=edge_box, bottom=edge_box, left=edge_ink, right=edge_ink)
            cell_margins(white_c, top=35, bottom=35, left=75, right=75)
            set_cell(white_c, val_str or "", size=9.0, bold=True, color=HEX_INK, align=aln)

    doc_spacer(doc, 1.8 if dense else 2.5)

    # Prazo de entrega e observações da produção
    doc_boxed_fields(doc, [
        ("Prazo de produção / previsão de entrega", 7.15, prod.get("prazo_entrega", "")),
        ("Observações da produção / detalhes de arte", 10.50, prod.get("observacoes", "")),
    ], box_height_cm=0.48 if dense else 0.54, after_pt=2.0 if dense else 3.0)

    # Quadro de imagens de referência das camisetas (Ficha Técnica)
    p_ref_lbl = doc_para(
        doc, "CROQUIS / IMAGENS DE REFERÊNCIA DAS CAMISETAS (FICHA TÉCNICA)",
        size=6.8, bold=True, color=HEX_MUTED, before=0, after=1.5,
    )
    p_ref_lbl.paragraph_format.keep_with_next = True

    cols_per_row, slot_w_cm, slot_gap_cm = resolve_ref_grid_spec(len(refs))
    grid_widths_cm: list[float] = []
    slot_col_indices: list[int] = []
    for c_i in range(cols_per_row):
        if c_i > 0:
            grid_widths_cm.append(slot_gap_cm)
        slot_col_indices.append(len(grid_widths_cm))
        grid_widths_cm.append(slot_w_cm)
    cap_fs = 5.9 if cols_per_row >= 5 else (6.3 if cols_per_row == 4 else 6.6)
    batches = [refs[i:i + cols_per_row] for i in range(0, max(cols_per_row, len(refs)), cols_per_row)]
    for b_idx, batch in enumerate(batches):
        ref_table = fixed_table(doc, grid_widths_cm, rows=1)
        ref_table.rows[0].height = Cm(1.56 if cols_per_row >= 4 else 1.52)
        for col_idx in range(len(grid_widths_cm)):
            if col_idx not in slot_col_indices:
                sc = ref_table.rows[0].cells[col_idx]
                cell_borders(sc)
                cell_margins(sc, top=0, bottom=0, left=0, right=0)
                set_cell(sc, "", size=6.0)
        for slot_i, col_i in enumerate(slot_col_indices):
            rcell = ref_table.rows[0].cells[col_i]
            global_idx = b_idx * cols_per_row + slot_i
            ref = batch[slot_i] if slot_i < len(batch) else None
            shade(rcell, HEX_REF_BG)
            all_borders(rcell, color=HEX_LINE, sz=4, val="dashed" if ref is None else "single")
            hpad = 35 if cols_per_row >= 4 else 65
            cell_margins(rcell, top=32, bottom=32, left=hpad, right=hpad)
            if ref and ref.get("arquivo") and (ROOT / ref["arquivo"]).exists():
                img_path = ROOT / ref["arquivo"]
                w_cm, _ = fit_picture_dims_cm(img_path, slot_w_cm - 0.35, 1.32)
                p_img = set_cell(rcell, "", align=WD_ALIGN_PARAGRAPH.CENTER)
                p_img.add_run().add_picture(str(img_path), width=Cm(w_cm))
                p_cap = format_paragraph(rcell.add_paragraph(), before=1.2, after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
                run_format(p_cap.add_run(ref.get("titulo", f"Referência {global_idx + 1:02d}")), size=cap_fs, bold=True, color=HEX_MUTED)
            else:
                title = (ref.get("titulo") if ref else None) or f"Referência {global_idx + 1:02d} — Camiseta"
                p_slot = set_cell(rcell, title, size=7.1, bold=True, color=HEX_MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, line_spacing=1.12)
                run_format(p_slot.add_run("\nEspaço reservado para imagem / ficha técnica"), size=6.5, color=HEX_MUTED)
        doc_spacer(doc, 2.0 if dense else 3.0)

    # 5. Seção 3 — Condições de Pagamento (sem células mescladas para grade 100% uniforme)
    doc_section_heading(doc, "3. Condições de Pagamento")
    c_bdr = ("single", 4, HEX_CREAM_BORDER)
    if computed["has_items"] and computed["advance_display"]:
        pay_table = fixed_table(doc, [8.825, 0.35, 8.825], rows=1)
        pay_table.rows[0].height = Cm(0.84 if dense else 0.95)
        p_mid = pay_table.rows[0].cells[1]
        cell_borders(p_mid)
        cell_margins(p_mid, top=0, bottom=0, left=0, right=0)
        set_cell(p_mid, "", size=6.0)
        for col_i, label, val in [
            (0, computed["advance_label"], computed["advance_display"]),
            (2, computed["balance_label"], computed["balance_display"]),
        ]:
            pcell = pay_table.rows[0].cells[col_i]
            shade(pcell, HEX_CREAM)
            all_borders(pcell, color=HEX_CREAM_BORDER, sz=4)
            cell_margins(pcell, top=38 if dense else 50, bottom=38 if dense else 50, left=95, right=95)
            set_cell(pcell, label, size=6.9, bold=True, color=HEX_MUTED)
            p_val = format_paragraph(pcell.add_paragraph(), before=1.5 if dense else 2.0, after=0)
            run_format(p_val.add_run(val), size=10.2 if dense else 10.5, bold=True, color=HEX_INK)
    else:
        pay_top = fixed_table(doc, [8.825, 0.35, 8.825], rows=1)
        pay_top.rows[0].height = Cm(0.38)
        xml_property(pay_top.rows[0]._tr.get_or_add_trPr(), "w:tblHeader", {})
        cell_borders(pay_top.rows[0].cells[1])
        cell_margins(pay_top.rows[0].cells[1], top=0, bottom=0, left=0, right=0)
        set_cell(pay_top.rows[0].cells[1], "", size=6.0)
        for col_i, label in [(0, computed["advance_label"]), (2, computed["balance_label"])]:
            tc_l = pay_top.rows[0].cells[col_i]
            shade(tc_l, HEX_CREAM)
            cell_borders(tc_l, top=c_bdr, left=c_bdr, right=c_bdr, bottom=None)
            cell_margins(tc_l, top=38, bottom=10, left=100, right=80)
            p_pt = set_cell(tc_l, label, size=6.9, bold=True, color=HEX_MUTED)
            p_pt.paragraph_format.keep_with_next = True

        pay_bot = fixed_table(doc, [0.95, 7.625, 0.25, 0.35, 0.95, 7.625, 0.25], rows=1)
        pay_bot.rows[0].height = Cm(0.57)
        cell_borders(pay_bot.rows[0].cells[3])
        cell_margins(pay_bot.rows[0].cells[3], top=0, bottom=0, left=0, right=0)
        set_cell(pay_bot.rows[0].cells[3], "", size=6.0)
        c_thick = ("single", 18, HEX_CREAM)
        for base_col, val in [(0, computed["advance_display"]), (4, computed["balance_display"])]:
            b0, b1, b2 = (pay_bot.rows[0].cells[base_col + k] for k in range(3))
            shade(b0, HEX_CREAM)
            cell_borders(b0, bottom=c_bdr, left=c_bdr, top=None, right=None)
            cell_margins(b0, top=22, bottom=38, left=100, right=20)
            set_cell(b0, "R$", size=9.2, bold=True, color=HEX_INK)

            shade(b1, "FFFFFF")
            cell_borders(b1, top=c_bdr, bottom=c_thick, left=c_bdr, right=c_bdr)
            cell_margins(b1, top=20, bottom=20, left=65, right=65)
            set_cell(b1, val or "", size=9.2, bold=True, color=HEX_INK)

            shade(b2, HEX_CREAM)
            cell_borders(b2, bottom=c_bdr, right=c_bdr, top=None, left=None)
            cell_margins(b2, top=0, bottom=0, left=0, right=0)
            set_cell(b2, "", size=6.0)

    doc_spacer(doc, 2.5)
    doc_boxed_fields(doc, [
        ("Forma de pagamento (Pix, depósito bancário ou cartão)", 9.65, payment.get("forma_pagamento", "")),
        ("Local e data", 8.00, exec_data.get("local_data", "")),
    ], box_height_cm=0.54, after_pt=3.0)

    # 6. Concordância e Assinaturas lado a lado
    p_acc = doc_para(doc, ACCEPTANCE_TEXT, size=7.9, color=HEX_BODY, before=1, after=3.0, line_spacing=1.08)
    p_acc.paragraph_format.keep_with_next = True

    sig_table = fixed_table(doc, [8.70, 0.60, 8.70], rows=3)
    lbl_row, box_row, cap_row = sig_table.rows[0], sig_table.rows[1], sig_table.rows[2]
    lbl_row.height = Cm(0.32)
    box_row.height = Cm(1.42)
    cap_row.height = Cm(0.65)

    for r_obj in (lbl_row, box_row, cap_row):
        cell_borders(r_obj.cells[1])
        cell_margins(r_obj.cells[1], top=0, bottom=0, left=0, right=0)
        set_cell(r_obj.cells[1], "", size=6.0)

    for col_i, heading_txt in [(0, "CONTRATADA (EMPRESA)"), (2, "CONTRATANTE (CLIENTE)")]:
        cell_borders(lbl_row.cells[col_i])
        cell_margins(lbl_row.cells[col_i], top=0, bottom=20, left=10, right=10)
        p_h = set_cell(lbl_row.cells[col_i], heading_txt, size=7.2, bold=True, color=HEX_MUTED)
        p_h.paragraph_format.keep_with_next = True

    # Caixa esquerda: imagem da assinatura do proprietário (já traz linha base original)
    left_box = box_row.cells[0]
    shade(left_box, "FFFFFF")
    all_borders(left_box, color=HEX_LINE, sz=4)
    left_box.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.BOTTOM
    cell_margins(left_box, top=35, bottom=55, left=140, right=140)
    sig_w_cm, _ = fit_picture_dims_cm(ROOT / "assets/assinatura-esio-andrade.png", 4.6, 1.05)
    p_sig = set_cell(left_box, "", align=WD_ALIGN_PARAGRAPH.CENTER)
    p_sig.add_run().add_picture(str(ROOT / "assets/assinatura-esio-andrade.png"), width=Cm(sig_w_cm))

    # Caixa direita: espaço limpo do cliente com linha base na mesma altura
    right_box = box_row.cells[2]
    shade(right_box, "FFFFFF")
    all_borders(right_box, color=HEX_LINE, sz=4)
    right_box.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.BOTTOM
    cell_margins(right_box, top=35, bottom=55, left=560, right=560)
    p_csig = set_cell(right_box, " ", size=9.0, align=WD_ALIGN_PARAGRAPH.CENTER)
    sig_line_r = xml_property(p_csig._p.get_or_add_pPr(), "w:pBdr", {})
    xml_property(sig_line_r, "w:bottom", {"w:val": "single", "w:sz": 6, "w:space": "1", "w:color": HEX_INK})

    # Legendas abaixo das duas caixas de assinatura
    left_cap, right_cap = cap_row.cells[0], cap_row.cells[2]
    for cc in (left_cap, right_cap):
        cc.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
        cell_borders(cc)
        cell_margins(cc, top=35, bottom=0, left=10, right=10)

    p_lc = set_cell(left_cap, boss_caption(company), size=8.3, bold=True, color=HEX_INK, line_spacing=1.10)
    run_format(p_lc.add_run(f"\n{company['nome_comercial']} · CNPJ {company['cnpj']}"), size=7.1, color=HEX_MUTED)

    p_rc = set_cell(right_cap, "Assinatura do(a) Contratante / Representante", size=8.3, bold=True, color=HEX_INK, line_spacing=1.10)
    run_format(p_rc.add_run("\nContratante do serviço (cliente)"), size=7.1, color=HEX_MUTED)

    # Rodapé idêntico ao PDF com linha superior e paginação à direita
    footer = format_paragraph(sec.footer.paragraphs[0], line_spacing=1.0)
    footer.paragraph_format.tab_stops.add_tab_stop(Cm(USABLE_CM), WD_TAB_ALIGNMENT.RIGHT)
    f_bdr = xml_property(footer._p.get_or_add_pPr(), "w:pBdr", {})
    xml_property(f_bdr, "w:top", {"w:val": "single", "w:sz": 4, "w:space": "4", "w:color": HEX_SUBTLE})
    run_format(
        footer.add_run("VOOALTO UNIFORMES · Contrato de confecção e fornecimento de uniformes\t1 / 1"),
        size=7.1, color=HEX_MUTED,
    )

    doc.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dados", type=Path, default=ROOT / "dados/contrato.json")
    parser.add_argument("--saida", type=Path, default=ROOT / "entregas")
    parser.add_argument("--nome-base", type=str, default=OUT_NAME)
    args = parser.parse_args()
    data = json.loads(args.dados.read_text(encoding="utf-8"))
    computed = validate_data(data)
    args.saida.mkdir(parents=True, exist_ok=True)
    base_name = args.nome_base.strip() or OUT_NAME
    temporary = args.saida / f".{base_name}.base.pdf"
    pdf_path = args.saida / f"{base_name}.pdf"
    docx_path = args.saida / f"{base_name}.docx"
    register_fonts()
    builder = ContractPDF(temporary, data, computed)
    builder.build()
    add_digital_signature_fields(temporary, pdf_path, builder.signatures)
    temporary.unlink()
    build_docx(data, docx_path, computed)
    print(f"PDF: {pdf_path}\nWord: {docx_path}")
    print("Contrato gerado com layout idêntico em PDF preenchível e Word (.docx).")


if __name__ == "__main__":
    main()
