#!/usr/bin/env python3
"""Gera ícones oficiais do PWA (.png e .ico Windows) e módulo de assets base64 para modo offline."""
from __future__ import annotations

import base64
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def extract_clean_monogram(logo_path: Path) -> Image.Image:
    logo = Image.open(logo_path).convert("RGBA")
    w, h = logo.size
    monogram = logo.crop((0, 0, min(w, int(h * 1.20)), h))
    bbox = monogram.getbbox()
    return monogram.crop(bbox) if bbox else monogram


def make_square_brand_icon(monogram: Image.Image, size: int, maskable: bool = False) -> Image.Image:
    ss = 4  # Supersampling 4x para cantos perfeitamente suaves
    big = size * ss
    canvas = Image.new("RGBA", (big, big), (25, 35, 45, 255))
    draw = ImageDraw.Draw(canvas)

    pad = int(big * (0.14 if maskable else 0.065))
    radius = int(big * 0.19)
    draw.rounded_rectangle(
        [pad, pad, big - pad, big - pad],
        radius=radius,
        fill=(248, 243, 236, 255),
    )
    accent_h = max(12, int(big * 0.042))
    ax0 = pad + int((big - 2 * pad) * 0.14)
    ax1 = big - pad - int((big - 2 * pad) * 0.14)
    ay0 = big - pad - int((big - 2 * pad) * 0.15)
    draw.rounded_rectangle([ax0, ay0, ax1, ay0 + accent_h], radius=accent_h // 2, fill=(197, 99, 92, 255))

    max_inner = int((big - 2 * pad) * 0.56)
    scale = min(max_inner / monogram.width, max_inner / monogram.height)
    nw, nh = max(1, int(monogram.width * scale)), max(1, int(monogram.height * scale))
    resized = monogram.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (big - nw) // 2
    oy = pad + int(((ay0 - pad) - nh) * 0.52)
    canvas.alpha_composite(resized, (ox, oy))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    logo_path = ROOT / "assets/logo-vooalto.png"
    sig_path = ROOT / "assets/assinatura-esio-andrade.png"
    monogram = extract_clean_monogram(logo_path)

    icons_dir = ROOT / "web/public/icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    icon_512 = make_square_brand_icon(monogram, 512, maskable=False)
    icon_192 = make_square_brand_icon(monogram, 192, maskable=False)
    icon_180 = make_square_brand_icon(monogram, 180, maskable=False)
    mask_512 = make_square_brand_icon(monogram, 512, maskable=True)

    icon_512.save(icons_dir / "icon-512.png", optimize=True)
    icon_192.save(icons_dir / "icon-192.png", optimize=True)
    icon_180.save(icons_dir / "apple-touch-icon.png", optimize=True)
    mask_512.save(icons_dir / "maskable-512.png", optimize=True)

    ico_path = ROOT / "assets/vooalto-icon.ico"
    icon_512.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    src_dir = ROOT / "web/src"
    src_dir.mkdir(parents=True, exist_ok=True)
    logo_b64 = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    sig_b64 = base64.b64encode(sig_path.read_bytes()).decode("ascii")
    ts_content = (
        "// Arquivo gerado automaticamente por scripts/gerar_icones_pwa.py\n"
        f'export const EMBEDDED_LOGO_DATA_URL = "data:image/png;base64,{logo_b64}";\n'
        f'export const EMBEDDED_SIGNATURE_DATA_URL = "data:image/png;base64,{sig_b64}";\n'
    )
    (src_dir / "generatedAssets.ts").write_text(ts_content, encoding="utf-8")
    print("Ícones de alta definição gerados com sucesso.")


if __name__ == "__main__":
    main()
