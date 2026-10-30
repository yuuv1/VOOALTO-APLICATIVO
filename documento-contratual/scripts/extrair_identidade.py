#!/usr/bin/env python3
"""Extrai as imagens reais do PDF original, removendo somente o fundo claro."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from PIL import Image
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "PROPOSTA DE VENDA ANA.pdf"
SOURCE_SHA256 = "3a3d5a3e57705510baabba7280fff0ca233e5b0f19560a2aea95e337c15bcb3f"


def main():
    if sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("O PDF fonte mudou. Confira as referências das imagens antes de extrair.")
    with pymupdf.open(SOURCE) as source:
        for xref, name, threshold in [(5, "logo-vooalto", 220), (9, "assinatura-esio-andrade", 185)]:
            extracted = source.extract_image(xref)
            image = Image.open(BytesIO(extracted["image"])).convert("RGB")
            gray = image.convert("L")
            # Preserva os pixels/traços escuros originais, sem gerar ou redesenhar a imagem.
            alpha = gray.point(lambda value: 255 - value if value < threshold else 0)
            output = Image.new("RGBA", image.size, (0, 0, 0, 0))
            output.putalpha(alpha)
            output = output.crop(alpha.getbbox())
            path = ROOT / "assets" / f"{name}.png"
            path.parent.mkdir(parents=True, exist_ok=True)
            output.save(path, optimize=True)
            print(path)


if __name__ == "__main__":
    main()
