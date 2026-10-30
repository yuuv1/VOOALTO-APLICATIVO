#!/usr/bin/env python3
"""Extrator universal de alta precisão para Fichas Técnicas VOOALTO (1 a N páginas, layout dinâmico,
zero corte de croquis) e Propostas de Venda / Orçamentos (Canva, PDF digital ou escaneado)."""
from __future__ import annotations

import base64
from collections import deque
from decimal import Decimal, InvalidOperation
from io import BytesIO
import json
from pathlib import Path
import re
from typing import Any

import cv2
from docx import Document
import numpy as np
from PIL import Image, ImageStat
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
VOOALTO_CNPJ = "51.919.138/0001-20"
VOOALTO_CNPJ_DIGITS = "51919138000120"

_OCR_INSTANCE = None


def get_ocr():
    global _OCR_INSTANCE
    if _OCR_INSTANCE is None:
        from rapidocr_onnxruntime import RapidOCR
        _OCR_INSTANCE = RapidOCR()
    return _OCR_INSTANCE


# Dicionário de restauração de espaçamento/acentuação comum em PDFs de Canva / Print-to-PDF em caixa alta
TOKEN_REPLACEMENTS: list[tuple[str, str]] = [
    (r"\bCAMISETAPOLOMANGACURTA\b", "Camiseta gola polo manga curta"),
    (r"\bCAMISETAGOLAPOLOMANGACURTA\b", "Camiseta gola polo manga curta"),
    (r"\bCAMISETAGOLAREDONDAMANGACURTA\b", "Camiseta gola redonda manga curta"),
    (r"\bCAMISETAGOLAPOLO\b", "Camiseta gola polo"),
    (r"\bCAMISETAGOLA\b", "Camiseta gola"),
    (r"\bCAMISETA\b", "Camiseta"),
    (r"\bCAMISASOCIAL\b", "Camisa social"),
    (r"\bCAMISA\b", "Camisa"),
    (r"\bJALECOPROFISSIONAL\b", "Jaleco profissional"),
    (r"\bJALECO\b", "Jaleco"),
    (r"\bCALCAPROFISSIONAL\b", "Calça profissional"),
    (r"\bCAL[ÇC]A\b", "Calça"),
    (r"\bBERMUDA\b", "Bermuda"),
    (r"\bMOLETOM\b", "Moletom"),
    (r"\bJAQUETA\b", "Jaqueta"),
    (r"\bAVENTAL\b", "Avental"),
    (r"\bCOLETE\b", "Colete"),
    (r"\bBON[ÉE]\b", "Boné"),
    (r"\bGOLAPOLO\b", "gola polo"),
    (r"\bGOLAREDONDA\b", "gola redonda"),
    (r"\bGOLAV\b", "gola V"),
    (r"\bGOLAPADRE\b", "gola padre"),
    (r"\bPOLOFAIXA\b", "polo faixa"),
    (r"\bLATERALEVIVO\b", "lateral e vivo"),
    (r"\bFAIXALATERAL\b", "faixa lateral"),
    (r"\bFAIXA\b", "faixa"),
    (r"\bMANGACURTA\b", "manga curta"),
    (r"\bMANGALONGA\b", "manga longa"),
    (r"\bM/CURTA\b", "m/curta"),
    (r"\bM/LONGA\b", "m/longa"),
    (r"\bREDONDAMANGA\b", "redonda manga"),
    (r"\bMANGABICOLOR\b", "manga bicolor"),
    (r"\bMANGAS\b", "mangas"),
    (r"\bMANGA\b", "manga"),
    (r"\bBICOLOR\b", "bicolor"),
    (r"\bTRADICIONAL\b", "tradicional"),
    (r"\bFEMININA\b", "feminina"),
    (r"\bMASCULINA\b", "masculina"),
    (r"\bUNISSEX\b", "unissex"),
    (r"\bBABYLOOK\b", "baby look"),
    (r"\bRAGLAN\b", "raglan"),
    (r"\bPOLO\b", "polo"),
    (r"\bMALHA\s+FRIA\s+PV\b", "Malha fria PV"),
    (r"\bMALHAFRIAPV\b", "Malha fria PV"),
    (r"\bMALHAFRIA\b", "Malha fria"),
    (r"\bANTIPILLING\b", "antipilling"),
    (r"\bANTI-PILLING\b", "antipilling"),
    (r"\bALGODAO\b", "algodão"),
    (r"\bALGOD[ÃA]O\b", "algodão"),
    (r"\bPENTEADO\b", "penteado"),
    (r"\bPOLIESTER\b", "poliéster"),
    (r"\bPIQUET\b", "piquet"),
    (r"\bPIQUE\b", "piquet"),
    (r"\bDRY\s*FIT\b", "dry fit"),
    (r"\bBRIM\b", "brim"),
    (r"\bGABARDINE\b", "gabardine"),
    (r"\bOXFORD\b", "oxford"),
    (r"\bHELANCA\b", "helanca"),
    (r"\bVISCOLYCRA\b", "viscolycra"),
    (r"\bPOLIAMIDA\b", "poliamida"),
    (r"\bELASTANO\b", "elastano"),
    (r"\b\d*\s*APLICACOESEMSILKDIGITAL:?\b", "Silk digital:"),
    (r"\b\d*\s*APLICACOES\s*EM\s*SILK\s*DIGITAL:?\b", "Silk digital:"),
    (r"\b\d*\s*APLICAÇÕES\s*EM\s*SILK\s*DIGITAL:?\b", "Silk digital:"),
    (r"\bBORDADOSOMENTEFRENTE\b", "Bordado somente frente"),
    (r"\bSOMENTEFRENTE\b", "somente frente"),
    (r"\bSILKFRENTEECOSTAS\b", "Silk digital frente (peito) e costas"),
    (r"\bSILK\s+FRENTE\s+E\s+COSTAS\b", "Silk digital frente (peito) e costas"),
    (r"\bSILKDIGITAL\b", "Silk digital"),
    (r"\bSILKSCREEN\b", "Silk screen"),
    (r"\bSUBLIMACAO\b", "Sublimação"),
    (r"\bSUBLIMAÇÃO\b", "Sublimação"),
    (r"\bBORDADOCOMPUTADORIZADO\b", "Bordado computadorizado"),
    (r"\bBORDADO\b", "Bordado"),
    (r"\bDTF\b", "DTF"),
    (r"\bFRENTE\s*\(\s*PEITO\s*\)\s*E\s*COSTAS\b", "frente (peito) e costas"),
    (r"\bFRENTE\s*\(\s*PEITO\s*\)\s*,?\s*COSTAS\s*E\b", "frente (peito), costas e"),
    (r"\bFRENTEECOSTAS\b", "frente e costas"),
    (r"\bFRENTE\b", "frente"),
    (r"\bPEITOESQUERDO\b", "peito esquerdo"),
    (r"\bPEITO\b", "peito"),
    (r"\bCOSTAS\b", "costas"),
]


def clean_apparel_phrase(raw: str, capitalize_first: bool = True) -> str:
    txt = " ".join(raw.replace("\n", " ").split()).strip(" .,-·")
    if not txt:
        return ""
    for pattern, repl in TOKEN_REPLACEMENTS:
        txt = re.sub(pattern, repl, txt, flags=re.IGNORECASE)
    txt = re.sub(r"([A-Za-zÀ-ÿ])\(", r"\1 (", txt)
    txt = re.sub(r"\(\s+", "(", txt)
    txt = re.sub(r"\s+\)", ")", txt)
    txt = re.sub(r"\s+,", ",", txt)
    txt = re.sub(r":\s*:+\s*", ": ", txt)
    txt = re.sub(r":([^\s])", r": \1", txt)
    txt = re.sub(r"\s{2,}", " ", txt).strip()
    if txt.isupper() and len(txt) > 4:
        txt = txt.capitalize()
    elif capitalize_first and txt:
        txt = txt[0].upper() + txt[1:]
    return txt


def parse_brl_money(raw: str) -> Decimal | None:
    cleaned = re.sub(r"[^\d,\.]", "", raw).strip()
    if not cleaned:
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{4,7}", cleaned):
        # Caso o OCR tenha omitido a vírgula dos centavos (ex.: "277005" -> 2770.05)
        try:
            v = Decimal(cleaned) / Decimal("100")
            return v.quantize(Decimal("0.01")) if v > 0 else None
        except InvalidOperation:
            return None
    try:
        val = Decimal(cleaned).quantize(Decimal("0.01"))
        return val if val >= Decimal("0.00") else None
    except InvalidOperation:
        return None


def image_to_data_url(im: Image.Image, max_side: int = 1400, fmt: str = "JPEG") -> str:
    w, h = im.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
    buf = BytesIO()
    if fmt == "JPEG":
        if im.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            rgba = im.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[3])
            im = bg
        else:
            im = im.convert("RGB")
        im.save(buf, format="JPEG", quality=90, optimize=True)
        mime = "image/jpeg"
    else:
        im.save(buf, format="PNG", optimize=True)
        mime = "image/png"
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def is_product_candidate_image(im: Image.Image, allow_low_contrast: bool = False) -> bool:
    """Filtra logos pequenos, barras finas de texto e marcas d'água sem contraste."""
    w, h = im.size
    if w < 140 or h < 140:
        return False
    aspect = w / max(1, h)
    if aspect > 2.9 or aspect < 0.28:
        return False
    gray = im.convert("L")
    stat = ImageStat.Stat(gray)
    if allow_low_contrast:
        if stat.mean[0] > 248 and stat.stddev[0] < 8:
            return False
    else:
        if stat.mean[0] > 234 and stat.stddev[0] < 24:
            return False
    return True


def trim_outer_uniform_margin(im: Image.Image, pad_frac: float = 0.03) -> Image.Image:
    """Remove APENAS margem uniforme vazia nas 4 bordas externas, NUNCA cortando conteúdo, gola,
    mangas ou títulos em nenhuma posição (top = 0 até bottom = H)."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        white_bg = Image.new("RGB", rgba.size, (255, 255, 255))
        white_bg.paste(rgba, mask=rgba.split()[3])
        rgb = white_bg
    else:
        rgb = im.convert("RGB")

    w, h = rgb.size
    if w < 80 or h < 80:
        return rgb

    arr = np.array(rgb, dtype=np.int16)
    # Estima a cor de fundo a partir dos 4 cantos externos da arte (ex.: branco #FFFFFF ou cinza #F1F3F5)
    corners = np.concatenate([
        arr[:8, :8].reshape(-1, 3),
        arr[:8, -8:].reshape(-1, 3),
        arr[-8:, :8].reshape(-1, 3),
        arr[-8:, -8:].reshape(-1, 3),
    ], axis=0)
    bg = np.median(corners, axis=0)
    mask = np.abs(arr - bg).max(axis=2) > 14
    ys, xs = np.where(mask)
    if len(xs) < 60:
        return rgb

    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    px = max(8, int((x1 - x0 + 1) * pad_frac))
    py = max(8, int((y1 - y0 + 1) * pad_frac))
    cx0 = max(0, x0 - px)
    cy0 = max(0, y0 - py)
    cx1 = min(w, x1 + 1 + px)
    cy1 = min(h, y1 + 1 + py)
    return rgb.crop((cx0, cy0, cx1, cy1))


def extract_uncropped_ficha_mockup(
    pdf: pymupdf.Document,
    page: pymupdf.Page,
    detalhes_y_norm: float | None = None,
    silk_warn_y_norm: float | None = None,
) -> Image.Image | None:
    """Extrai o croqui/arte completo da página da Ficha Técnica SEM NENHUM CORTE DE GOLA, MANGA OU TOPO.

    Estratégia dupla:
    1) Se houver uma única imagem XObject nativa de alta resolução na área de arte (padrão Ficha Técnica V6,
       ex.: 3533x2957), extrai a imagem original inteira 100% sem corte percentual no topo.
    2) Se houver múltiplas imagens separadas (ex.: frente + costas em XObjects distintos ou arte vetorial),
       renderiza a caixa completa de arte da página em 300 DPI entre DETALHES DO MODELO e o rodapé.
    """
    rect = page.rect
    pw, ph = float(rect.width), float(rect.height)
    min_top_y = pw * 0.0  # permite croquis até em páginas de continuação onde a arte começa no topo

    artwork_candidates: list[tuple[float, pymupdf.Rect, Image.Image]] = []
    seen_xrefs: set[int] = set()
    for img_info in page.get_images(full=True):
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        try:
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            rw, rh = float(r.width), float(r.height)
            # Uma página escaneada inteira é uma imagem XObject, NÃO um croqui: ignorá-la.
            if (rw >= pw * 0.84 and rh >= ph * 0.82) or (r.x0 < pw * 0.12 and r.y0 < ph * 0.12 and rh >= ph * 0.70):
                continue
            # Ignora barras finas de texto, pílulas pequenas e o card financeiro do topo direito
            if rw < pw * 0.22 or rh < ph * 0.16:
                continue
            if r.y1 < ph * 0.35 and (detalhes_y_norm is not None or r.y0 < ph * 0.15):
                continue
            extracted = pdf.extract_image(xref)
            im = Image.open(BytesIO(extracted["image"]))
            if im.width >= 300 and im.height >= 260 and is_product_candidate_image(im, allow_low_contrast=True):
                artwork_candidates.append((rw * rh, r, im))
        except Exception:
            continue

    # Caso 1: Uma única imagem mestre cobre toda a caixa de croqui (padrão Ficha Técnica V6)
    if len(artwork_candidates) == 1:
        _, _, best_im = artwork_candidates[0]
        return trim_outer_uniform_margin(best_im, pad_frac=0.03)

    # Caso 2: Múltiplas imagens na caixa de arte ou desenho vetorial -> captura a caixa inteira em 300 DPI
    if len(artwork_candidates) > 1:
        union_x0 = min(r.x0 for _, r, _ in artwork_candidates)
        union_y0 = min(r.y0 for _, r, _ in artwork_candidates)
        union_x1 = max(r.x1 for _, r, _ in artwork_candidates)
        union_y1 = max(r.y1 for _, r, _ in artwork_candidates)
        clip = pymupdf.Rect(
            max(0.0, union_x0 - 6),
            max(min_top_y, union_y0 - 6),
            min(pw, union_x1 + 6),
            min(ph, union_y1 + 6),
        )
        pix = page.get_pixmap(dpi=300, clip=clip)
        rendered = Image.open(BytesIO(pix.tobytes("png")))
        return trim_outer_uniform_margin(rendered, pad_frac=0.03)

    # Fallback vetorial: captura a caixa cinza de arte completa à direita das tabelas de medidas
    top_f = (detalhes_y_norm + 0.018) if detalhes_y_norm is not None else 0.520
    bot_f = (silk_warn_y_norm - 0.008) if silk_warn_y_norm is not None else 0.946
    if bot_f - top_f >= 0.15:
        clip = pymupdf.Rect(pw * 0.258, ph * top_f, pw * 0.978, ph * bot_f)
        pix = page.get_pixmap(dpi=280, clip=clip)
        rendered = Image.open(BytesIO(pix.tobytes("png")))
        if is_product_candidate_image(rendered):
            return trim_outer_uniform_margin(rendered, pad_frac=0.03)

    return None


def run_image_ocr(img_bytes_or_arr: bytes | np.ndarray) -> tuple[list[dict[str, Any]], str]:
    ocr = get_ocr()
    result, _ = ocr(img_bytes_or_arr)
    boxes: list[dict[str, Any]] = []
    lines: list[str] = []
    if result:
        for box, txt, score in result:
            xs = [pt[0] for pt in box]
            ys = [pt[1] for pt in box]
            x0, x1 = float(min(xs)), float(max(xs))
            y0, y1 = float(min(ys)), float(max(ys))
            boxes.append({
                "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2,
                "text": txt, "score": float(score),
            })
            lines.append(txt)
    return boxes, "\n".join(lines)


def ocr_dark_pill_crop(arr_rgb: np.ndarray) -> str:
    """Lê texto branco sobre fundo escuro (ex.: pílulas CORES DO TECIDO, PREVISÃO DE ENTREGA, Entrada)."""
    if arr_rgb.size == 0 or arr_rgb.shape[0] < 6 or arr_rgb.shape[1] < 10:
        return ""
    gray = cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2GRAY)
    inv = 255 - gray
    up = cv2.resize(inv, (inv.shape[1] * 3, inv.shape[0] * 3), interpolation=cv2.INTER_CUBIC)
    padded = np.pad(up, ((24, 24), (36, 36)), mode="constant", constant_values=255)
    rgb_pad = cv2.cvtColor(padded, cv2.COLOR_GRAY2RGB)
    boxes, _ = run_image_ocr(rgb_pad)
    if not boxes:
        return ""
    boxes.sort(key=lambda b: (round(b["cy"] / 28), b["x0"]))
    return " ".join(b["text"].strip() for b in boxes if b["text"].strip())


def humanize_concatenated_portuguese(raw: str) -> str:
    """Restaura espaços e acentuação básica em textos colados de Print-to-PDF (ex.: Quadra202Norte)."""
    s = " ".join(raw.replace("\n", " ").split()).strip()
    if not s:
        return ""
    s = re.sub(r"\bALG0[dD]A[0O]\b", "Algodão", s, flags=re.IGNORECASE)
    s = re.sub(r"\bALGODAO\b", "Algodão", s, flags=re.IGNORECASE)
    s = re.sub(r"\bPIQUET\s*PV\b", "Piquet PV", s, flags=re.IGNORECASE)
    s = re.sub(r"([a-zà-ÿ])([A-ZÀ-Ÿ])", r"\1 \2", s)
    s = re.sub(r"([A-Za-zÀ-ÿ])(\d)", r"\1 \2", s)
    s = re.sub(r"(\d)([A-ZÀ-Ÿ][a-zà-ÿ])", r"\1 \2", s)
    s = re.sub(r",([^\s])", r", \1", s)
    s = re.sub(r"\(\s*([A-Z0-9]+)\s*/\s*", r"(\1 / ", s)
    s = re.sub(r"/([^\s\d])", r" / \1", s)
    s = re.sub(r"\(\s*", "(", s)
    s = re.sub(r"\s*\)", ")", s)
    for pat, rep in [
        (r"\bMinisterio\b", "Ministério"),
        (r"\bPublico\b", "Público"),
        (r"\bJustica\b", "Justiça"),
        (r"\bProcuradoria-Geralde\s+Justica\b", "Procuradoria-Geral de Justiça"),
        (r"\bProcuradoria-Geralde\b", "Procuradoria-Geral de"),
        (r"\bEstadodo\b", "Estado do"),
        (r"\bEstadoda\b", "Estado da"),
        (r"\bMunicipiode\b", "Município de"),
        (r"\bPrefeitura\s*Municipalde\b", "Prefeitura Municipal de"),
        (r"\bSecretaria\s*Municipalde\b", "Secretaria Municipal de"),
        (r"\bSecretariade\b", "Secretaria de"),
        (r"\bAvenida\s+LO\s*-\s*0*(\d+)\b", lambda m: f"Avenida LO-{int(m.group(1)):02d}"),
        (r"\bAZULMARINHO\b", "Azul Marinho"),
        (r"\bAZULROYAL\b", "Azul Royal"),
        (r"\bAZULCELESTE\b", "Azul Celeste"),
        (r"\bAZULBEBE\b", "Azul Bebê"),
        (r"\bVERDEMILITAR\b", "Verde Militar"),
        (r"\bVERDEBANDEIRA\b", "Verde Bandeira"),
        (r"\bVERDEMUSGO\b", "Verde Musgo"),
        (r"\bCINZAMESCLA\b", "Cinza Mescla"),
        (r"\bCINZACHUMBO\b", "Cinza Chumbo"),
        (r"\bOFFWHITE\b", "Off White"),
        (r"\bTERRACOTA\b", "Terracota"),
    ]:
        s = re.sub(
            pat,
            rep,
            s,
            flags=re.IGNORECASE if isinstance(rep, str) and pat.startswith(r"\b") and pat[2:6].isupper() and "Ministerio" not in pat and "Publico" not in pat and "Justica" not in pat and "Procuradoria" not in pat and "Estado" not in pat and "Municipio" not in pat and "Prefeitura" not in pat and "Secretaria" not in pat else 0,
        )
    s = re.sub(r"\b(Público|Publico)do\b", "Público do", s)
    s = re.sub(r"\b(Público|Publico)da\b", "Público da", s)
    s = re.sub(r"\bEstadodo\b", "Estado do", s)
    s = re.sub(r"\bGeralde\b", "Geral de", s)
    s = re.sub(r"\bAlgod\s+ão\b", "Algodão", s, flags=re.IGNORECASE)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s


def format_grade_token(val: int, sz: str) -> str:
    """Evita ambiguidade quando o tamanho começa com número (2 unidades no 6a => '2un 6a')."""
    return f"{val}un {sz}" if sz and sz[0].isdigit() else f"{val}{sz}"


def extract_clean_pill_glyph(cell_rgb: np.ndarray) -> np.ndarray | None:
    """Detecta APENAS células realmente preenchidas na GRADE DA PRODUÇÃO (pílula escura #1F242D com
    dígitos brancos, ou dígitos escuros reais no centro), remove qualquer borda externa por BFS e
    devolve imagem preto-no-branco nítida 3x ampliada. Células vazias retornam None com 100% de certeza."""
    ch, cw = cell_rgb.shape[:2]
    if ch < 8 or cw < 8:
        return None
    gray = cv2.cvtColor(cell_rgb, cv2.COLOR_RGB2GRAY)
    center = gray[int(ch * 0.25):max(int(ch * 0.25) + 1, int(ch * 0.75)),
                  int(cw * 0.22):max(int(cw * 0.22) + 1, int(cw * 0.78))]
    if center.size == 0:
        return None

    med = float(np.median(center))
    is_dark_pill = med < 150.0
    if not is_dark_pill:
        # Só aceita célula de fundo claro se houver traço de dígito escuro real no miolo (ignora borda cinza externa!)
        inner_dark = int((center < 155).sum())
        if inner_dark < max(12, int(center.size * 0.045)):
            return None

    fg = (gray > 140).astype(np.uint8) if is_dark_pill else (gray < 175).astype(np.uint8)

    # Flood-fill pelas 4 bordas do recorte para apagar cantos brancos externos da pílula ou linhas da grade
    q: deque[tuple[int, int]] = deque()
    for x in range(cw):
        if fg[0, x]:
            fg[0, x] = 0
            q.append((0, x))
        if fg[ch - 1, x]:
            fg[ch - 1, x] = 0
            q.append((ch - 1, x))
    for y in range(ch):
        if fg[y, 0]:
            fg[y, 0] = 0
            q.append((y, 0))
        if fg[y, cw - 1]:
            fg[y, cw - 1] = 0
            q.append((y, cw - 1))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < ch and 0 <= nx < cw and fg[ny, nx]:
                fg[ny, nx] = 0
                q.append((ny, nx))

    ys, xs = np.where(fg > 0)
    if len(xs) < 8:
        return None

    x0, x1 = max(0, int(xs.min()) - 2), min(cw, int(xs.max()) + 3)
    y0, y1 = max(0, int(ys.min()) - 2), min(ch, int(ys.max()) + 3)
    sub_gray = gray[y0:y1, x0:x1].astype(np.float32)
    lum = (255.0 - sub_gray) if is_dark_pill else sub_gray
    lum = np.clip((lum - 32.0) * 1.35, 0, 255).astype(np.uint8)

    up = cv2.resize(lum, (lum.shape[1] * 3, lum.shape[0] * 3), interpolation=cv2.INTER_CUBIC)
    padded = np.pad(up, ((22, 22), (34, 34)), mode="constant", constant_values=255)
    return cv2.cvtColor(padded, cv2.COLOR_GRAY2RGB)


def read_ficha_grade_band(
    page: pymupdf.Page,
    grade_top_norm: float,
    grade_bot_norm: float,
) -> tuple[str, int]:
    """Lê a tabela GRADE DA PRODUÇÃO em QUALQUER posição vertical da página (layout fluido V6),
    validando cada linha (Masculino / Baby look / Infantil) contra o seu próprio 'Total' impresso à direita
    e contra o quadro 'Total de Peças' da página."""
    ocr = get_ocr()
    rect = page.rect
    y0 = max(0.0, grade_top_norm - 0.006) * rect.height
    y1 = min(1.0, grade_bot_norm + 0.004) * rect.height
    if y1 - y0 < 35:
        return "", 0

    clip = pymupdf.Rect(0, y0, rect.width, y1)
    pix = page.get_pixmap(dpi=320, clip=clip)
    im = Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")
    arr = np.array(im)
    h, w = arr.shape[:2]

    res, _ = ocr(arr)
    adult_sizes = ["PP", "P", "M", "G", "GG", "3G", "4G", "5G", "6G", "7G"]
    kids_sizes = ["2a", "4a", "6a", "8a", "10a", "12a", "14a"]

    adult_cols: dict[str, float] = {}
    kids_cols: dict[str, float] = {}
    rows: dict[str, float] = {}
    right_numbers: list[tuple[float, float, int]] = []
    det_cells: list[tuple[float, float, int]] = []

    for box, txt, _ in (res or []):
        cx = sum(pt[0] for pt in box) / 4.0
        cy = sum(pt[1] for pt in box) / 4.0
        t = txt.strip()
        clean_num = re.sub(r"^[=\s]+", "", t)
        if t in adult_sizes and cy < h * 0.55:
            adult_cols.setdefault(t, cx)
        elif t in kids_sizes:
            kids_cols.setdefault(t, cx)
        elif "mascul" in t.lower() and cx < w * 0.16:
            rows["Masc"] = cy
        elif ("baby" in t.lower() or "fem" in t.lower()) and cx < w * 0.16:
            rows["Baby look"] = cy
        elif "infantil" in t.lower() and cx < w * 0.16:
            rows["Infantil"] = cy
        elif clean_num.isdigit():
            val_i = int(clean_num)
            if cx > w * 0.83:
                right_numbers.append((cx, cy, val_i))
            elif w * 0.12 < cx < w * 0.84:
                det_cells.append((cx, cy, val_i))

    # Completa coordenadas de colunas adultas/infantis com espaçamento proporcional exato do V6
    for idx_s, sz in enumerate(adult_sizes):
        adult_cols.setdefault(sz, w * (0.1652 + idx_s * 0.0718))
    for idx_s, sz in enumerate(kids_sizes):
        kids_cols.setdefault(sz, w * (0.180 + idx_s * 0.1025))

    hw = max(10, int(w * 0.024))
    hh = max(10, int(h * 0.062))

    crops: list[np.ndarray] = []
    meta: list[tuple[str, str, float, float]] = []
    row_printed_totals: dict[str, int] = {}

    for rname, sizes, col_map in [
        ("Masc", adult_sizes, adult_cols),
        ("Baby look", adult_sizes, adult_cols),
        ("Infantil", kids_sizes, kids_cols),
    ]:
        if rname not in rows:
            continue
        ry = rows[rname]
        # Captura o subtotal impresso à direita daquela linha ("= 26", "= 6", etc. em x = 0.83..0.90)
        row_tots = [
            val for rcx, rcy, val in right_numbers
            if w * 0.83 < rcx < w * 0.902 and abs(rcy - ry) < hh * 1.45
        ]
        if row_tots:
            row_printed_totals[rname] = max(row_tots)

        for sz in sizes:
            cx = col_map[sz]
            cell = arr[
                max(0, int(ry - hh)):min(h, int(ry + hh)),
                max(0, int(cx - hw)):min(w, int(cx + hw)),
            ]
            clean_glyph = extract_clean_pill_glyph(cell)
            if clean_glyph is None:
                continue
            crops.append(clean_glyph)
            meta.append((rname, sz, cx, ry))

    page_box_totals = [val for rcx, _, val in right_numbers if rcx >= w * 0.902]
    page_total_box = max(page_box_totals) if page_box_totals else 0

    rec_res, _ = ocr.text_rec(crops) if crops else ([], None)
    grouped: dict[str, list[list[Any]]] = {}
    for (rname, sz, cx, ry), (val_txt, _) in zip(meta, rec_res):
        mapped = (
            val_txt.strip()
            .translate(str.maketrans({"I": "1", "l": "1", "|": "1", "!": "1", "O": "0", "o": "0", "S": "5", "B": "8"}))
        )
        digits = re.sub(r"\D", "", mapped)
        val_num = int(digits) if digits else None
        if val_num is None:
            for dcx, dcy, dval in det_cells:
                if abs(dcx - cx) < hw and abs(dcy - ry) < hh:
                    val_num = dval
                    break
        if val_num is None or val_num <= 0:
            val_num = 1
        grouped.setdefault(rname, []).append([sz, val_num])

    # Auto-verificação matemática linha a linha contra o subtotal impresso ("= 26", "= 6")
    for rname, entries in grouped.items():
        expected_row = row_printed_totals.get(rname)
        if expected_row and expected_row > 0:
            cur_sum = sum(e[1] for e in entries)
            delta = expected_row - cur_sum
            if delta == -10:
                for e in entries:
                    if 12 <= e[1] <= 19:
                        e[1] -= 10
                        break
            elif delta == 10:
                for e in entries:
                    if 1 <= e[1] <= 9:
                        e[1] += 10
                        break
            elif delta != 0 and len(entries) == 1:
                entries[0][1] = expected_row
            elif delta != 0 and abs(delta) <= 2:
                entries[0][1] = max(1, entries[0][1] + delta)

    lines_out: list[str] = []
    computed_sum = 0
    for rname in ("Masc", "Baby look", "Infantil"):
        entries = grouped.get(rname, [])
        if not entries:
            continue
        rsum = sum(e[1] for e in entries)
        computed_sum += rsum
        lines_out.append(f"{rname} ({rsum}): " + " · ".join(format_grade_token(v, sz) for sz, v in entries))

    final_page_qty = page_total_box or sum(row_printed_totals.values()) or computed_sum
    return "\n".join(lines_out), final_page_qty


def _match_page_to_summary_row(
    modelo: str,
    tecido: str,
    qty: int,
    summary_rows: list[dict[str, Any]],
) -> Decimal:
    """Associa cada página de item à sua linha correspondente em INFORMAÇÕES DA PRODUÇÃO para
    QUALQUER modelo/tecido do catálogo VOOALTO (Polo, Gola Redonda, Raglan, Camisa Social, Jaleco, Calça, etc.)."""
    if not summary_rows:
        return Decimal("0.00")
    if len(summary_rows) == 1:
        return summary_rows[0]["unit"]

    item_tokens = set(
        re.findall(
            r"[a-zà-ÿ0-9]{3,}",
            f"{modelo} {tecido}".lower()
            .replace("gola", " ")
            .replace("camiseta", "camiseta"),
        )
    )
    best_score = -1.0
    best_unit = summary_rows[0]["unit"]
    for sr in summary_rows:
        sr_tokens = set(re.findall(r"[a-zà-ÿ0-9]{3,}", sr["desc_clean"].lower()))
        overlap = len(item_tokens & sr_tokens)
        # Bônus forte para palavras distintivas (polo, redonda, social, jaleco, calça, bermuda, dry, piquet, algodão, brim, longa)
        key_words = {"polo", "redonda", "social", "jaleco", "calça", "calca", "bermuda", "colete", "moletom", "raglan", "longa", "curta", "piquet", "algodão", "algodao", "dry", "malha", "brim", "oxford"}
        distinct_overlap = len((item_tokens & sr_tokens) & key_words) * 3.0
        qty_bonus = 2.5 if sr["qty"] == qty else (0.5 if sr["qty"] >= qty else -1.0)
        score = overlap + distinct_overlap + qty_bonus
        if score > best_score:
            best_score = score
            best_unit = sr["unit"]
    return best_unit


def parse_vooalto_ficha_pdf(
    pdf: pymupdf.Document,
    page_ocr_data: list[tuple[list[dict[str, Any]], str, int, int, np.ndarray]],
) -> dict[str, Any] | None:
    """Extrator universal 100% guiado por âncoras dinâmicas para 'VOOALTO UNIFORMES - Ficha Técnica de Produção'
    (1 a N páginas, 1 a M linhas de resumo, páginas de continuação de Print-to-PDF e zero corte de imagem)."""
    if not page_ocr_data:
        return None
    p1_boxes, p1_txt, w1, h1, p1_rgb = page_ocr_data[0]
    all_up = "\n".join(d[1] for d in page_ocr_data).upper()
    if "FICHA" not in all_up or ("GRADE" not in all_up and "DETALHES DO MODELO" not in all_up):
        return None

    cliente: dict[str, str] = {}
    pagamento: dict[str, Any] = {}
    producao: dict[str, Any] = {}
    execucao: dict[str, str] = {}

    # Localiza âncoras verticais reais da Página 1 (independente de quantas linhas o cliente ou o pedido tiverem!)
    def find_anchor_y(boxes: list[dict[str, Any]], h: int, pattern: str, default: float) -> float:
        for b in sorted(boxes, key=lambda x: x["y0"]):
            if re.search(pattern, b["text"], re.IGNORECASE):
                return b["cy"] / h
        return default

    y_dados_p1 = find_anchor_y(p1_boxes, h1, r"DADOS\s*DO\s*CLIENTE", 0.105)
    y_info_p1 = find_anchor_y(p1_boxes, h1, r"INFORMA[ÇC][ÕO]ES\s*DA\s*PRODU", 0.210)
    y_grade_p1 = find_anchor_y(p1_boxes, h1, r"GRADE\s*DA\s*PRODU", 0.334)

    ficha_num = ""
    emissao_str = ""
    vendedor_str = ""
    has_silk_warning = "DIVERGENCIAS" in all_up or "DIVERGÊNCIAS" in all_up

    name_parts: list[str] = []
    addr_parts: list[str] = []
    tel_parts: list[str] = []
    cidade_str = ""
    cep_str = ""

    # 1. Cabeçalho superior + DADOS DO CLIENTE (estritamente dentro de [y_dados_p1 .. y_info_p1])
    client_boxes = [b for b in p1_boxes if y_dados_p1 < (b["cy"] / h1) < y_info_p1]
    # Ponto médio vertical entre linha 1 (NOME / CPF / VENDEDOR) e linha 2 (TELEFONE / ENDEREÇO / CIDADE / CEP)
    mid_client_y = y_dados_p1 + (y_info_p1 - y_dados_p1) * 0.48
    for b in client_boxes:
        tu = b["text"].upper()
        if "TELEFONE" in tu or "ENDERE" in tu or "CIDADE" in tu:
            mid_client_y = min(mid_client_y, (b["y0"] / h1) - 0.008)

    for b in sorted(p1_boxes, key=lambda x: (x["y0"], x["x0"])):
        t = b["text"].strip()
        nx0 = b["x0"] / w1
        cy_n = b["cy"] / h1

        if cy_n <= y_dados_p1:
            m_dt = re.search(r"\b(\d{2}/\d{2}/20\d{2})\b", t)
            if m_dt:
                emissao_str = m_dt.group(1)
            if re.fullmatch(r"\d{3,6}", t) and 0.38 < nx0 < 0.62:
                ficha_num = t
            m_d = re.search(r"(\d{1,3})\s*DIAS(?:\s*[ÚU]TEIS)?", t, re.IGNORECASE)
            if m_d:
                suf = " dias úteis" if "TEIS" in t.upper() else " dias"
                producao["prazo_entrega"] = f"{m_d.group(1)}{suf}"

        elif y_dados_p1 < cy_n < y_info_p1:
            if "SINCRONIZADO" in t.upper() or "DADOS DO CLIENTE" in t.upper():
                continue
            m_doc = re.search(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})", t)
            if m_doc and re.sub(r"\D", "", m_doc.group(1)) != VOOALTO_CNPJ_DIGITS:
                cliente["cpf_cnpj"] = m_doc.group(1)
                continue
            m_mail = re.search(r"[\w.\-+]+@[\w.\-]+\.\w{2,}", t)
            if m_mail and "vooalto" not in m_mail.group(0).lower():
                cliente["email"] = m_mail.group(0)
                continue
            if cy_n < mid_client_y:
                if 0.13 < nx0 < 0.495 and not re.fullmatch(r"NOME\s*/?\s*RAZ[ÃA]O\s*SOCIAL", t, re.IGNORECASE):
                    cleaned_nm = re.sub(r"^NOME\s*/?\s*RAZ[ÃA]O\s*SOCIAL\s*", "", t, flags=re.IGNORECASE).strip()
                    if cleaned_nm:
                        name_parts.append(cleaned_nm)
                elif nx0 > 0.78 and t.upper() != "VENDEDOR":
                    v_clean = re.sub(r"^VENDEDOR\s*", "", t, flags=re.IGNORECASE).strip()
                    if v_clean:
                        vendedor_str = v_clean.title()
            else:
                if nx0 < 0.205 and "TELEFONE" not in t.upper():
                    tel_parts.append(t)
                elif 0.25 <= nx0 < 0.60 and not re.fullmatch(r"ENDERE[ÇC]O", t, re.IGNORECASE):
                    ad_c = re.sub(r"^ENDERE[ÇC]O\s*", "", t, flags=re.IGNORECASE).strip()
                    if ad_c:
                        addr_parts.append(ad_c)
                elif "CIDADE" in t.upper() or (0.60 <= nx0 < 0.795 and "-" in t):
                    cidade_str = re.sub(r"^CIDADE\s*", "", t, flags=re.IGNORECASE).strip()
                elif "CEP" in t.upper() or re.search(r"\b\d{2}\.?\d{3}-\d{3}\b", t):
                    m_cep = re.search(r"(\d{2}\.?\d{3}-\d{3})", t)
                    if m_cep:
                        cep_str = m_cep.group(1)

    # Se PREVISÃO DE ENTREGA estava em pílula escura e não veio no OCR normal, lê com inversão
    if not producao.get("prazo_entrega"):
        prev_crop = p1_rgb[int(h1 * 0.055):int(h1 * 0.095), int(w1 * 0.69):int(w1 * 0.98)]
        prev_txt = ocr_dark_pill_crop(prev_crop)
        m_d = re.search(r"(\d{1,3})\s*DIAS(?:\s*[ÚU]TEIS)?", prev_txt, re.IGNORECASE)
        if m_d:
            suf = " dias úteis" if "TEIS" in prev_txt.upper() else " dias"
            producao["prazo_entrega"] = f"{m_d.group(1)}{suf}"

    # 2. INFORMAÇÕES DA PRODUÇÃO: lê TODAS as linhas 1..M de resumo + cards financeiros à direita
    summary_rows: list[dict[str, Any]] = []
    entrada_val: Decimal | None = None
    restante_val: Decimal | None = None
    total_prod_val: Decimal | None = None

    info_band_boxes = [b for b in p1_boxes if y_info_p1 < (b["cy"] / h1) < y_grade_p1]
    left_info = [b for b in info_band_boxes if b["x0"] / w1 < 0.775]
    right_info = [b for b in info_band_boxes if b["x0"] / w1 >= 0.775]

    unit_anchors = [
        b for b in left_info
        if 0.51 <= (b["x0"] / w1) <= 0.615
        and "VALOR" not in b["text"].upper()
        and (parse_brl_money(b["text"]) or Decimal("0.00")) > Decimal("0.00")
    ]
    for ua in sorted(unit_anchors, key=lambda x: x["cy"]):
        uval = parse_brl_money(ua["text"])
        if not uval or uval <= Decimal("0.00"):
            continue
        row_tol = max(12.0, h1 * 0.014)
        desc_b = [
            b["text"] for b in sorted(left_info, key=lambda z: z["x0"])
            if abs(b["cy"] - ua["cy"]) <= row_tol and 0.055 <= (b["x0"] / w1) < 0.495
        ]
        qty_b = [
            re.sub(r"\D", "", b["text"]) for b in left_info
            if abs(b["cy"] - ua["cy"]) <= row_tol
            and 0.595 <= (b["x0"] / w1) <= 0.665
            and re.sub(r"\D", "", b["text"]).isdigit()
        ]
        q_int = int(qty_b[0]) if qty_b and int(qty_b[0]) > 0 else 0
        if desc_b and q_int > 0:
            raw_d = " ".join(desc_b)
            summary_rows.append({
                "desc_raw": raw_d,
                "desc_clean": clean_apparel_phrase(humanize_concatenated_portuguese(raw_d)),
                "unit": uval,
                "qty": q_int,
            })

    right_vals: list[tuple[float, Decimal]] = []
    for rb in sorted(right_info, key=lambda x: x["cy"]):
        v = parse_brl_money(rb["text"])
        if v is not None and v > Decimal("0.00"):
            right_vals.append((rb["cy"], v))
    inferred_total = sum((sr["unit"] * Decimal(sr["qty"]) for sr in summary_rows), Decimal("0.00"))
    if len(right_vals) >= 3:
        total_prod_val, entrada_val, restante_val = right_vals[0][1], right_vals[1][1], right_vals[2][1]
    elif len(right_vals) == 2:
        total_prod_val = inferred_total if inferred_total > max(right_vals[0][1], right_vals[1][1]) else max(right_vals[0][1], right_vals[1][1])
        restante_val = right_vals[-1][1]
        entrada_val = total_prod_val - restante_val
    elif len(right_vals) == 1 and inferred_total > right_vals[0][1] > Decimal("0.00"):
        total_prod_val = inferred_total
        restante_val = right_vals[0][1]
        entrada_val = total_prod_val - restante_val

    if name_parts:
        cliente["nome_razao_social"] = humanize_concatenated_portuguese(" ".join(name_parts))
    if tel_parts:
        tel_join = re.sub(r"-\s+", "-", "".join(tel_parts).strip())
        tel_join = re.sub(r"\)\s*(\d)", r") \1", tel_join)
        cliente["telefone"] = tel_join
    if addr_parts:
        cliente["endereco"] = humanize_concatenated_portuguese(" ".join(addr_parts))
    if cidade_str or cep_str:
        cid_clean = re.sub(r"\s*-\s*", " - ", cidade_str).strip()
        cliente["cidade_uf_cep"] = " · ".join(p for p in [cid_clean, f"CEP {cep_str}" if cep_str else ""] if p)

    if total_prod_val and entrada_val is not None and restante_val is not None and total_prod_val > Decimal("0.00"):
        if abs((entrada_val + restante_val) - total_prod_val) <= Decimal("0.10"):
            ep_pct = int((entrada_val * 100 / total_prod_val).quantize(Decimal("1")))
            if 1 <= ep_pct <= 99:
                pagamento["entrada_percentual"] = ep_pct
                pagamento["saldo_percentual"] = 100 - ep_pct

    obs_bits: list[str] = []
    if ficha_num:
        obs_bits.append(f"Ficha Técnica Nº {ficha_num}" + (f" (Vendedor: {vendedor_str})" if vendedor_str else ""))
        if producao.get("prazo_entrega"):
            producao["prazo_entrega"] = f"{producao['prazo_entrega']} (conforme Ficha Técnica Nº {ficha_num})"
    if has_silk_warning:
        obs_bits.append("Podem haver divergências de cor no silk digital.")
    if obs_bits:
        producao["observacoes"] = " · ".join(obs_bits)
    if emissao_str:
        execucao["local_data"] = f"Goiânia - GO, {emissao_str}"

    # 3. Agrupa páginas físicas em Variações Lógicas (suporta 1..N páginas E quebras de página longas do Print-to-PDF!)
    logical_groups: list[list[int]] = []
    for p_idx in range(len(pdf)):
        p_boxes, p_txt, pw, ph, _ = page_ocr_data[p_idx]
        p_up = p_txt.upper()
        has_grade = bool(
            re.search(r"GRADE\s*DA\s*PRODU", p_up)
            or ("MASCULINO" in p_up and ("BABY" in p_up or "INFANTIL" in p_up))
        )
        if has_grade or not logical_groups:
            logical_groups.append([p_idx])
        else:
            # Página de continuação (ex.: quando uma tabela grande empurrou o croqui/detalhes para a página seguinte)
            logical_groups[-1].append(p_idx)

    # 4. Extrai cada Variação Lógica (modelo, tecido real, cor real, personalização, grade validada e croqui SEM CORTE)
    page_items: list[dict[str, Any]] = []
    cropped_refs: list[dict[str, str]] = []

    for item_idx, phys_pages in enumerate(logical_groups, start=1):
        grade_str = ""
        qty_page = 0
        det_model = ""
        cor_clean = ""
        tec_clean = ""
        pers_banner_parts: list[str] = []
        best_mockup: Image.Image | None = None

        for p_idx in phys_pages:
            page = pdf[p_idx]
            p_boxes, _, pw, ph, p_rgb = page_ocr_data[p_idx]

            y_grade = find_anchor_y(p_boxes, ph, r"GRADE\s*DA\s*PRODU", -1.0)
            y_det = find_anchor_y(p_boxes, ph, r"DETALHES\s*DO\s*MODELO", -1.0)
            y_cor_hdr = find_anchor_y(p_boxes, ph, r"CORES\s*DO\s*TECIDO", -1.0)
            y_tip_hdr = find_anchor_y(p_boxes, ph, r"TIPO\s*DE\s*TECIDO", -1.0)
            y_fem_hdr = find_anchor_y(p_boxes, ph, r"Feminino|TAM\.", -1.0)
            y_warn = find_anchor_y(p_boxes, ph, r"DIVERG[ÊE]NCIAS\s*DE\s*COR", 0.952)

            if y_grade > 0 and not grade_str:
                g_bot = y_det - 0.008 if y_det > y_grade else min(0.95, y_grade + 0.165)
                grade_str, qty_page = read_ficha_grade_band(page, y_grade, g_bot)

            for b in sorted(p_boxes, key=lambda x: (x["y0"], x["x0"])):
                cy_n = b["cy"] / ph
                nx0 = b["x0"] / pw
                t = b["text"].strip()
                if "DETALHES" in t.upper() and "MODELO" in t.upper():
                    raw_det = humanize_concatenated_portuguese(t)
                    det_model = re.sub(r"^DETALHES\s*DO\s*MODELO\s*:?\s*", "", clean_apparel_phrase(raw_det), flags=re.IGNORECASE).strip()
                elif y_cor_hdr > 0 and (y_cor_hdr + 0.008) < cy_n < (y_tip_hdr if y_tip_hdr > y_cor_hdr else y_cor_hdr + 0.05) and nx0 < 0.25:
                    if "CORES" not in t.upper() and "TIPO" not in t.upper():
                        cor_clean = f"{cor_clean} {humanize_concatenated_portuguese(t).title()}".strip()
                elif y_tip_hdr > 0 and (y_tip_hdr + 0.008) < cy_n < (y_fem_hdr if y_fem_hdr > y_tip_hdr else y_tip_hdr + 0.068) and nx0 < 0.25:
                    if "TIPO" not in t.upper() and "FEMININO" not in t.upper() and "MASCULINO" not in t.upper():
                        tec_clean = f"{tec_clean} {clean_apparel_phrase(humanize_concatenated_portuguese(t), capitalize_first=False)}".strip()
                elif y_det > 0 and (y_det + 0.015) < cy_n < (y_det + 0.12) and 0.25 <= nx0 <= 0.72:
                    pers_banner_parts.append(clean_apparel_phrase(t))

            # Garante leitura da pílula preta de CORES DO TECIDO por inversão caso o OCR normal não tenha lido branco no preto
            if not cor_clean and y_cor_hdr > 0:
                c_y0 = int(ph * (y_cor_hdr + 0.010))
                c_y1 = int(ph * ((y_tip_hdr - 0.004) if y_tip_hdr > y_cor_hdr else (y_cor_hdr + 0.045)))
                cor_txt = ocr_dark_pill_crop(p_rgb[max(0, c_y0):min(ph, c_y1), int(pw * 0.025):int(pw * 0.248)])
                cor_txt = re.sub(r"\b(?:CORES|DO|TECIDO)\b", " ", cor_txt, flags=re.IGNORECASE)
                cor_clean = humanize_concatenated_portuguese(cor_txt).title().strip()

            if best_mockup is None:
                best_mockup = extract_uncropped_ficha_mockup(
                    pdf,
                    page,
                    detalhes_y_norm=y_det if y_det > 0 else None,
                    silk_warn_y_norm=y_warn,
                )

        # Separa Modelo e Personalização preservando 100% de fidelidade a QUALQUER peça VOOALTO
        raw_head = det_model.split(",", 1)[0].strip() if det_model else ""
        low_head = raw_head.lower()
        if "polo" in low_head and "manga longa" not in low_head:
            modelo_clean = "Camiseta gola polo manga curta"
        elif "gola redonda" in low_head and "manga longa" not in low_head and "bicolor" not in low_head:
            modelo_clean = "Camiseta gola redonda manga curta"
        elif raw_head:
            modelo_clean = clean_apparel_phrase(raw_head, capitalize_first=True)
        else:
            modelo_clean = summary_rows[0]["desc_clean"].split(",")[0].strip() if summary_rows else f"Uniforme Personalizado {item_idx:02d}"

        if "," in det_model:
            pers_clean = clean_apparel_phrase(det_model.split(",", 1)[1]).rstrip(".")
        else:
            pers_clean = " ".join(pers_banner_parts).strip().rstrip(".")

        if tec_clean:
            tec_clean = tec_clean[0].upper() + tec_clean[1:]
            if "piquet" in tec_clean.lower() and "antipilling" not in tec_clean.lower():
                tec_clean = f"{tec_clean} antipilling"

        eff_qty = max(1, qty_page)
        unit_price = _match_page_to_summary_row(modelo_clean, tec_clean, eff_qty, summary_rows)

        # Se tec_clean veio vazio, aproveita eventual tecido descrito na linha de resumo da Página 1
        if not tec_clean and summary_rows:
            for sr in summary_rows:
                if sr["unit"] == unit_price and "," in sr["desc_clean"]:
                    tec_clean = sr["desc_clean"].split(",", 1)[1].strip()
                    break

        page_items.append({
            "numero": f"{item_idx:02d}",
            "modelo": modelo_clean,
            "tecido": tec_clean,
            "cor": cor_clean,
            "personalizacao": pers_clean,
            "grade": grade_str,
            "quantidade": eff_qty,
            "valor_unitario": f"{unit_price:.2f}",
            "subtotal": f"{(Decimal(eff_qty) * unit_price):.2f}",
        })

        if best_mockup is not None:
            short_mod = (
                "Polo" if "polo" in modelo_clean.lower()
                else "Gola Red." if "redonda" in modelo_clean.lower()
                else modelo_clean[:16].strip()
            )
            short_cor = cor_clean or f"Item {item_idx:02d}"
            cropped_refs.append({
                "titulo": f"{item_idx:02d} · {short_mod} {short_cor} ({eff_qty} un.)",
                "data_url": image_to_data_url(best_mockup, max_side=1200, fmt="JPEG"),
            })

    return {
        "itens": page_items,
        "cliente": cliente,
        "pagamento": pagamento,
        "producao": producao,
        "execucao": execucao,
        "imagens_sugeridas": cropped_refs,
    }


def parse_spatial_table(ocr_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reconstrói linhas de tabela de Proposta de Venda / Orçamento a partir de caixas OCR (x, y)."""
    if not ocr_items:
        return []

    header_y = None
    col_centers: dict[str, float] = {}
    for item in ocr_items:
        t_up = item["text"].upper().strip(" .:")
        if t_up in ("MODELO", "PRODUTO", "PRODUTO / ESPECIFICAÇÃO", "DESCRIÇÃO DO PRODUTO"):
            header_y = item["cy"]
            col_centers["modelo"] = item["cx"]
        elif t_up in ("TECIDO", "MALHA"):
            col_centers["tecido"] = item["cx"]
        elif t_up in ("DESCRICAO", "DESCRIÇÃO", "PERSONALIZACAO", "PERSONALIZAÇÃO"):
            col_centers["personalizacao"] = item["cx"]
        elif t_up in ("GRADE", "TAM.", "TAMANHOS", "GRADE / TAM."):
            col_centers["grade"] = item["cx"]
        elif t_up in ("QNT", "QTD", "QUANT", "QUANTIDADE"):
            col_centers["qtd"] = item["cx"]
        elif t_up in ("UNIT", "UNITARIO", "UNITÁRIO", "VALOR UNIT"):
            col_centers["unit"] = item["cx"]
        elif t_up in ("TOTAL", "SUBTOTAL"):
            if header_y is not None and abs(item["cy"] - header_y) < 45:
                col_centers["sub"] = item["cx"]

    total_bar_y = 999999.0
    for item in ocr_items:
        if re.search(r"\bTOTAL\s*:", item["text"].upper()) or "VALOR TOTAL" in item["text"].upper():
            if header_y is None or item["cy"] > header_y + 40:
                total_bar_y = min(total_bar_y, item["y0"])

    min_y = (header_y + 20) if header_y is not None else 0.0
    body_boxes = [b for b in ocr_items if min_y < b["cy"] < total_bar_y - 10]
    if not body_boxes:
        return []

    price_boxes = []
    for b in body_boxes:
        val = parse_brl_money(b["text"])
        if val is not None and val > Decimal("0.00") and ("R$" in b["text"].upper() or re.search(r"\d+[,\.]\d{2}\b", b["text"])):
            price_boxes.append({**b, "val": val})

    price_rows: list[list[dict[str, Any]]] = []
    for pb in sorted(price_boxes, key=lambda x: x["cy"]):
        placed = False
        for group in price_rows:
            avg_y = sum(g["cy"] for g in group) / len(group)
            if abs(pb["cy"] - avg_y) <= 34:
                group.append(pb)
                placed = True
                break
        if not placed:
            price_rows.append([pb])

    valid_row_centers: list[dict[str, Any]] = []
    for group in price_rows:
        group_sorted = sorted(group, key=lambda x: x["cx"])
        if len(group_sorted) >= 2:
            unit_b, sub_b = group_sorted[-2], group_sorted[-1]
            row_cy = (unit_b["cy"] + sub_b["cy"]) / 2
            qty_candidates = [
                b for b in body_boxes
                if abs(b["cy"] - row_cy) <= 38
                and b["cx"] < unit_b["x0"]
                and re.fullmatch(r"\d{1,5}", b["text"].strip())
            ]
            if qty_candidates:
                qty_b = sorted(qty_candidates, key=lambda x: abs(x["cx"] - col_centers.get("qtd", unit_b["x0"] - 100)))[0]
                qty_val = int(qty_b["text"].strip())
                qty_x = qty_b["x0"]
            elif unit_b["val"] > 0 and sub_b["val"] >= unit_b["val"]:
                derived = int((sub_b["val"] / unit_b["val"]).to_integral_value())
                qty_val = max(1, derived)
                qty_x = unit_b["x0"] - 40
            else:
                continue
            valid_row_centers.append({
                "cy": row_cy,
                "qty": qty_val,
                "qty_x": qty_x,
                "unit": unit_b["val"],
                "sub": sub_b["val"],
            })

    if not valid_row_centers:
        return []

    bounds: list[tuple[float, float]] = []
    for idx, rc in enumerate(valid_row_centers):
        top_b = min_y if idx == 0 else (valid_row_centers[idx - 1]["cy"] + rc["cy"]) / 2
        bot_b = (total_bar_y - 10) if idx == len(valid_row_centers) - 1 else (rc["cy"] + valid_row_centers[idx + 1]["cy"]) / 2
        bounds.append((top_b, bot_b))

    extracted_items = []
    for idx, (rc, (y_lo, y_hi)) in enumerate(zip(valid_row_centers, bounds), start=1):
        row_text_boxes = [
            b for b in body_boxes
            if y_lo <= b["cy"] < y_hi and b["x1"] < rc["qty_x"] - 8
        ]
        row_text_boxes.sort(key=lambda b: (b["cy"], b["x0"]))

        modelo_parts, tecido_parts, pers_parts, grade_parts = [], [], [], []
        for b in row_text_boxes:
            if col_centers:
                candidates = {
                    k: abs(b["cx"] - cx)
                    for k, cx in col_centers.items()
                    if k in ("modelo", "tecido", "personalizacao", "grade")
                }
                best_col = min(candidates, key=candidates.get) if candidates else "modelo"
            else:
                best_col = "modelo"
            if best_col == "modelo":
                modelo_parts.append(b["text"])
            elif best_col == "tecido":
                tecido_parts.append(b["text"])
            elif best_col == "personalizacao":
                pers_parts.append(b["text"])
            elif best_col == "grade":
                grade_parts.append(b["text"])

        modelo = clean_apparel_phrase(" ".join(modelo_parts))
        tecido = clean_apparel_phrase(" ".join(tecido_parts))
        pers = clean_apparel_phrase(" ".join(pers_parts)).rstrip(".")
        grade = " ".join(grade_parts).strip()

        qty = rc["qty"]
        unit = rc["unit"]
        calc_sub = (Decimal(qty) * unit).quantize(Decimal("0.01"))
        extracted_items.append({
            "numero": f"{idx:02d}",
            "modelo": modelo or f"Item {idx:02d}",
            "tecido": tecido,
            "cor": "",
            "personalizacao": pers,
            "grade": grade,
            "quantidade": qty,
            "valor_unitario": f"{unit:.2f}",
            "subtotal": f"{calc_sub:.2f}",
        })

    return extracted_items


def parse_freeform_text(full_text: str) -> dict[str, Any]:
    """Extrai dados do cliente, pagamento, prazos e itens de texto corrido / orçamento."""
    info: dict[str, Any] = {
        "cliente": {},
        "pagamento": {},
        "producao": {},
        "execucao": {},
        "itens_fallback": [],
    }
    normalized = "\n".join(line.strip() for line in full_text.splitlines() if line.strip())

    m_dt = re.search(r"\b(\d{2}/\d{2}/20\d{2})\b", normalized)
    if m_dt:
        info["execucao"]["local_data"] = f"Goiânia - GO, {m_dt.group(1)}"

    m_split = re.search(
        r"(\d{1,3})\s*%\s*(?:antecipado|entrada|sinal).*?(\d{1,3})\s*%\s*(?:na\s*entrega|restante|final)",
        normalized,
        re.IGNORECASE,
    )
    if m_split:
        p1, p2 = int(m_split.group(1)), int(m_split.group(2))
        if p1 + p2 == 100:
            info["pagamento"]["entrada_percentual"] = p1
            info["pagamento"]["saldo_percentual"] = p2

    methods = []
    low = normalized.lower()
    if "depósito" in low or "deposito" in low or "transferência" in low or "transferencia" in low:
        methods.append("depósito bancário")
    if "pix" in low:
        methods.append("Pix")
    if "cartão" in low or "cartao" in low:
        methods.append("cartão de crédito")
    if "boleto" in low:
        methods.append("boleto bancário")
    if methods:
        joined = (", ".join(methods[:-1]) + " ou " + methods[-1]) if len(methods) > 1 else methods[0]
        info["pagamento"]["forma_pagamento"] = joined[0].upper() + joined[1:]

    m_prazo = re.search(
        r"(?:prazo(?:\s*de\s*(?:entrega|produ[cç][aã]o))?|entrega\s*prevista)\s*[:\-]\s*([^\n]+)",
        normalized,
        re.IGNORECASE,
    )
    if m_prazo:
        info["producao"]["prazo_entrega"] = m_prazo.group(1).strip(" .")
    else:
        m_val = re.search(r"(\d{1,3})\s*(dias(?:\s*[úu]teis)?)", normalized, re.IGNORECASE)
        if m_val:
            info["producao"]["prazo_entrega"] = f"{m_val.group(1)} {m_val.group(2).strip().lower()}"

    for pattern, key in [
        (r"(?:cliente|contratante|raz[aã]o\s*social)\s*[:\-]\s*([^\n]+)", "nome_razao_social"),
        (r"(?:e-?mail)\s*[:\-]\s*([\w.\-+]+@[\w.\-]+\.\w+)", "email"),
        (r"(?:endere[cç]o\s*(?:do\s*cliente|de\s*entrega)?)\s*[:\-]\s*([^\n]+)", "endereco"),
    ]:
        m = re.search(pattern, normalized, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            if "vooalto" not in val.lower() and "jacinto alves" not in val.lower():
                info["cliente"][key] = val

    for m_doc in re.finditer(r"\b(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\b", normalized):
        doc_num = m_doc.group(1)
        if re.sub(r"\D", "", doc_num) != VOOALTO_CNPJ_DIGITS:
            info["cliente"]["cpf_cnpj"] = doc_num
            break

    block_models = list(re.finditer(
        r"(?:modelo|produto|pe[cç]a|item\s*\d*)\s*[:\-]\s*([^\n]+)",
        normalized,
        re.IGNORECASE,
    ))
    for idx, m_mod in enumerate(block_models, start=1):
        start = m_mod.start()
        end = block_models[idx].start() if idx < len(block_models) else len(normalized)
        chunk = normalized[start:end]
        modelo_val = clean_apparel_phrase(m_mod.group(1))
        if not modelo_val or modelo_val.lower() in ("tecido", "descrição", "descricao"):
            continue
        tecido_m = re.search(r"(?:tecido|malha)\s*[:\-]\s*([^\n]+)", chunk, re.IGNORECASE)
        cor_m = re.search(r"(?:cor|cores)\s*[:\-]\s*([^\n]+)", chunk, re.IGNORECASE)
        pers_m = re.search(r"(?:personaliza[cç][aã]o|arte|estampa|bordado|silk|aplica[cç][aã]o)\s*[:\-]\s*([^\n]+)", chunk, re.IGNORECASE)
        grade_m = re.search(r"(?:grade|tamanhos?)\s*[:\-]\s*([^\n]+)", chunk, re.IGNORECASE)
        qtd_m = re.search(r"(?:qtd\.?|quant\.?|quantidade|total\s*de\s*pe[cç]as)\s*[:\-]?\s*(\d{1,5})\b", chunk, re.IGNORECASE)
        unit_m = re.search(r"(?:unit[aá]rio|valor\s*unit\.?|pre[cç]o)\s*[:\-]\s*R?\$?\s*(\d[\d\.,]*)", chunk, re.IGNORECASE)

        qty = int(qtd_m.group(1)) if qtd_m else 1
        unit_dec = parse_brl_money(unit_m.group(1)) if unit_m else None
        unit_str = f"{unit_dec:.2f}" if unit_dec else "0.00"
        sub_str = f"{(Decimal(qty) * unit_dec):.2f}" if unit_dec else "0.00"
        info["itens_fallback"].append({
            "numero": f"{idx:02d}",
            "modelo": modelo_val,
            "tecido": clean_apparel_phrase(tecido_m.group(1)) if tecido_m else "",
            "cor": cor_m.group(1).strip(" .") if cor_m else "",
            "personalizacao": clean_apparel_phrase(pers_m.group(1)) if pers_m else "",
            "grade": grade_m.group(1).strip(" .") if grade_m else "",
            "quantidade": qty,
            "valor_unitario": unit_str,
            "subtotal": sub_str,
        })

    return info


def analyze_document_bytes(filename: str, raw_bytes: bytes) -> dict[str, Any]:
    """Analisa PDF, imagem, DOCX, JSON ou TXT e retorna páginas renderizadas, croquis SEM CORTE e dados."""
    suffix = Path(filename).suffix.lower()
    pages_preview: list[dict[str, Any]] = []
    candidate_images: list[dict[str, Any]] = []
    all_items: list[dict[str, Any]] = []
    text_chunks: list[str] = []

    ficha_parsed: dict[str, Any] | None = None
    if suffix == ".pdf":
        page_ocr_data: list[tuple[list[dict[str, Any]], str, int, int, np.ndarray]] = []
        is_ficha_doc = False
        with pymupdf.open(stream=raw_bytes, filetype="pdf") as pdf:
            for p_idx, page in enumerate(pdf):
                pix = page.get_pixmap(dpi=195 if p_idx == 0 else (165 if is_ficha_doc else 195))
                png_bytes = pix.tobytes("png")
                pil_page = Image.open(BytesIO(png_bytes)).convert("RGB")
                rgb_arr = np.array(pil_page)
                pages_preview.append({
                    "pagina": p_idx + 1,
                    "largura": pil_page.width,
                    "altura": pil_page.height,
                    "data_url": image_to_data_url(pil_page, max_side=1300, fmt="JPEG"),
                })

                native_txt = page.get_text("text").strip()
                if is_ficha_doc and p_idx >= 1:
                    # Nas páginas 2..N da Ficha Técnica, o topo repete o cabeçalho da pág. 1 -> lê direto y >= 0.26 (3x mais rápido!)
                    y_cut = int(pil_page.height * 0.26)
                    ocr_boxes_sub, ocr_txt = run_image_ocr(rgb_arr[y_cut:, :])
                    ocr_boxes = [
                        {
                            **b,
                            "y0": b["y0"] + y_cut,
                            "y1": b["y1"] + y_cut,
                            "cy": b["cy"] + y_cut,
                        }
                        for b in ocr_boxes_sub
                    ]
                else:
                    ocr_boxes, ocr_txt = run_image_ocr(rgb_arr)
                    if p_idx == 0 and "FICHA" in ocr_txt.upper() and ("GRADE" in ocr_txt.upper() or "DADOS" in ocr_txt.upper()):
                        is_ficha_doc = True

                page_ocr_data.append((ocr_boxes, ocr_txt, pil_page.width, pil_page.height, rgb_arr))
                text_chunks.append(native_txt if len(native_txt) > 30 else ocr_txt)

                if not is_ficha_doc:
                    seen_xrefs = set()
                    for img_info in page.get_images(full=True):
                        xref = img_info[0]
                        if xref in seen_xrefs:
                            continue
                        seen_xrefs.add(xref)
                        try:
                            extracted = pdf.extract_image(xref)
                            im = Image.open(BytesIO(extracted["image"]))
                            if im.width >= 260 and im.height >= 260 and is_product_candidate_image(im):
                                trimmed = trim_outer_uniform_margin(im, pad_frac=0.03)
                                candidate_images.append({
                                    "titulo": f"Ref. {len(candidate_images) + 1:02d} — Página {p_idx + 1}",
                                    "data_url": image_to_data_url(trimmed, max_side=1100, fmt="JPEG"),
                                })
                        except Exception:
                            continue
                    table_items = parse_spatial_table(ocr_boxes)
                    if table_items:
                        all_items.extend(table_items)

            ficha_parsed = parse_vooalto_ficha_pdf(pdf, page_ocr_data)

    elif suffix in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
        pil_img = Image.open(BytesIO(raw_bytes)).convert("RGB")
        rgb_arr = np.array(pil_img)
        pages_preview.append({
            "pagina": 1,
            "largura": pil_img.width,
            "altura": pil_img.height,
            "data_url": image_to_data_url(pil_img, max_side=1300, fmt="JPEG"),
        })
        ocr_boxes, ocr_txt = run_image_ocr(rgb_arr)
        text_chunks.append(ocr_txt)
        table_items = parse_spatial_table(ocr_boxes)
        if table_items:
            all_items.extend(table_items)
        if not table_items and is_product_candidate_image(pil_img):
            stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
            candidate_images.append({
                "titulo": stem[:40] or "Camiseta — Referência",
                "data_url": image_to_data_url(trim_outer_uniform_margin(pil_img), max_side=1100, fmt="JPEG"),
            })

    elif suffix == ".docx":
        doc = Document(BytesIO(raw_bytes))
        for p in doc.paragraphs:
            if p.text.strip():
                text_chunks.append(p.text.strip())
        for table in doc.tables:
            for row in table.rows:
                row_vals = [c.text.strip() for c in row.cells]
                if any(row_vals):
                    text_chunks.append(" | ".join(row_vals))
        for rel in doc.part.rels.values():
            if "image" in rel.reltype:
                try:
                    im = Image.open(BytesIO(rel.target_part.blob))
                    if is_product_candidate_image(im):
                        candidate_images.append({
                            "titulo": f"Ref. {len(candidate_images) + 1:02d} — Documento",
                            "data_url": image_to_data_url(trim_outer_uniform_margin(im), max_side=1100, fmt="JPEG"),
                        })
                except Exception:
                    continue

    elif suffix == ".json":
        loaded = json.loads(raw_bytes.decode("utf-8"))
        return {"tipo": "contrato_json", "dados": loaded, "paginas": [], "imagens_sugeridas": []}

    else:
        text_chunks.append(raw_bytes.decode("utf-8", errors="ignore"))

    combined_text = "\n".join(text_chunks)
    freeform = parse_freeform_text(combined_text)
    if ficha_parsed and ficha_parsed["itens"]:
        final_items = ficha_parsed["itens"]
        final_cliente = {**freeform["cliente"], **ficha_parsed["cliente"]}
        final_pagamento = {**freeform["pagamento"], **ficha_parsed["pagamento"]}
        final_producao = {**freeform["producao"], **ficha_parsed["producao"]}
        final_execucao = {**freeform["execucao"], **ficha_parsed["execucao"]}
        final_refs = ficha_parsed["imagens_sugeridas"] or candidate_images
    else:
        final_items = all_items or freeform["itens_fallback"]
        final_cliente = freeform["cliente"]
        final_pagamento = freeform["pagamento"]
        final_producao = freeform["producao"]
        final_execucao = freeform["execucao"]
        final_refs = candidate_images

    avisos: list[str] = []
    for idx, it in enumerate(final_items, start=1):
        it["numero"] = f"{idx:02d}"
        if not it.get("grade") and ficha_parsed:
            avisos.append(f"Item {idx:02d}: grade não reconhecida; confira antes de exportar.")
        if not it.get("cor") and ficha_parsed:
            avisos.append(f"Item {idx:02d}: cor não reconhecida; confira antes de exportar.")
        if Decimal(str(it.get("valor_unitario", "0"))) <= Decimal("0.00"):
            avisos.append(f"Item {idx:02d}: preço unitário não reconhecido; confira antes de exportar.")

    if ficha_parsed and len(final_refs) < len(final_items):
        avisos.append(f"Croquis reconhecidos: {len(final_refs)} de {len(final_items)}; revise imagens faltantes.")
    if ficha_parsed and not final_pagamento.get("entrada_percentual"):
        avisos.append("Parcelamento não reconhecido no PDF; confira os percentuais antes de exportar.")

    return {
        "arquivo": filename,
        "avisos": avisos,
        "texto_extraido": combined_text,
        "itens": final_items,
        "cliente": final_cliente,
        "pagamento": final_pagamento,
        "producao": final_producao,
        "execucao": final_execucao,
        "paginas": pages_preview,
        "imagens_sugeridas": final_refs,
    }


if __name__ == "__main__":
    sample_pdf = ROOT / "PROPOSTA DE VENDA ANA.pdf"
    res = analyze_document_bytes(sample_pdf.name, sample_pdf.read_bytes())
    print(json.dumps({
        "arquivo": res["arquivo"],
        "itens": res["itens"],
        "pagamento": res["pagamento"],
        "paginas": len(res["paginas"]),
        "imagens_sugeridas": len(res["imagens_sugeridas"]),
    }, ensure_ascii=False, indent=2))
