#!/usr/bin/env python3
"""Copia o motor de contratos para dentro do app da V10, já com a correção.

O `Abrir_Sistema_Vooalto.html` (na pasta `documento-contratual/`) é o artefato
autônomo gerado por `cd documento-contratual/web && npm run build`. A V10
embarca uma CÓPIA dele em `ATUALIZACAO_V10/criador_contrato/index.html`, porque
o servidor local só serve a pasta do app.

Por que um script e não uma cópia manual:

  O app de contrato traz, no <head>, um limpador de cache que apaga TODOS os
  caches da origem, menos o dele:

      names.forEach(n => { if (n !== "vooalto-contratos-v3") caches.delete(n) })

  Dentro do Vooalto (mesma origem, mesma porta) isso apagaria o precache da
  própria V10 na primeira vez que a aba Contrato abrisse — e o sistema
  perderia o modo offline. A cópia feita aqui troca essa linha por uma versão
  que só apaga caches `vooalto-contratos-*`, ou seja, os do próprio contrato.

Uso:
    python3 tools/atualizar_contrato.py

Se o texto original mudar (nova versão do motor), o script FALHA em vez de
copiar sem corrigir.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

VERSAO = Path(__file__).resolve().parent.parent
ORIGEM = VERSAO.parent / "documento-contratual"
DESTINO = VERSAO / "ATUALIZACAO_V10" / "criador_contrato"

FONTE_HTML = ORIGEM / "Abrir_Sistema_Vooalto.html"

# A linha que apaga caches alheios e a versão corrigida (só o prefixo do contrato).
ALVO = 'if (n !== "vooalto-contratos-v3") caches.delete(n);'
CORRIGIDO = ('if (n !== "vooalto-contratos-v3" '
             '&& n.indexOf("vooalto-contratos-") === 0) caches.delete(n);')


def copiar_html() -> int:
    if not FONTE_HTML.is_file():
        print(f"ERRO: não encontrei {FONTE_HTML}", file=sys.stderr)
        print("Rode antes: cd documento-contratual/web && npm ci && npm run build",
              file=sys.stderr)
        return 1

    html = FONTE_HTML.read_text(encoding="utf-8")
    if ALVO not in html:
        print("ERRO: o trecho que limpa os caches mudou no motor de contratos.", file=sys.stderr)
        print(f"Esperava encontrar: {ALVO}", file=sys.stderr)
        print("Revise o script antes de copiar: copiar sem corrigir faz a aba", file=sys.stderr)
        print("Contrato apagar o cache offline da V10.", file=sys.stderr)
        return 1

    corrigido = html.replace(ALVO, CORRIGIDO, 1)
    DESTINO.mkdir(parents=True, exist_ok=True)
    (DESTINO / "index.html").write_text(corrigido, encoding="utf-8", newline="\n")
    print(f"criador_contrato/index.html ({len(corrigido) / 1024 / 1024:.1f} MB, "
          f"limpador de cache limitado ao próprio app)")
    return 0


def copiar_pwa() -> int:
    """Manifesto e ícones: o HTML aponta para eles com caminho relativo."""
    docs = ORIGEM / "docs"
    manifesto = docs / "manifest.webmanifest"
    if manifesto.is_file():
        shutil.copy2(manifesto, DESTINO / "manifest.webmanifest")
        print("criador_contrato/manifest.webmanifest")

    icones = docs / "icons"
    if icones.is_dir():
        (DESTINO / "icons").mkdir(exist_ok=True)
        for icone in sorted(icones.iterdir()):
            if icone.is_file():
                shutil.copy2(icone, DESTINO / "icons" / icone.name)
                print(f"criador_contrato/icons/{icone.name}")
    return 0


def main() -> int:
    if not ORIGEM.is_dir():
        print(f"ERRO: pasta {ORIGEM} não existe neste checkout.", file=sys.stderr)
        return 1
    erro = copiar_html()
    if erro:
        return erro
    return copiar_pwa()


if __name__ == "__main__":
    raise SystemExit(main())
