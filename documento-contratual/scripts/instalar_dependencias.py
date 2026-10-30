#!/usr/bin/env python3
"""Instala todas as dependências Python do sistema VOOALTO e configura atalhos no Windows."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def create_windows_shortcuts() -> None:
    """Cria os atalhos 'VOOALTO Contratos.lnk' na Área de Trabalho e no Menu Iniciar."""
    if os.name != "nt":
        return
    ps_script = (
        "$root = $args[0]; "
        "$wsh = New-Object -ComObject WScript.Shell; "
        "$targets = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')); "
        "foreach ($dir in $targets) { "
        "  if ($dir -and (Test-Path $dir)) { "
        "    $lnk = $wsh.CreateShortcut((Join-Path $dir 'VOOALTO Contratos.lnk')); "
        "    $lnk.TargetPath = 'wscript.exe'; "
        "    $lnk.Arguments = '\"' + (Join-Path $root 'scripts\\abrir_janela_invisivel.vbs') + '\"'; "
        "    $lnk.WorkingDirectory = $root; "
        "    $lnk.Description = 'Gerador Automatico de Contratos VOOALTO Uniformes'; "
        "    $ico = Join-Path $root 'assets\\vooalto-icon.ico'; "
        "    if (Test-Path $ico) { $lnk.IconLocation = $ico } "
        "    $lnk.Save(); "
        "  } "
        "}"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script, str(ROOT)],
            check=False,
        )
    except Exception:
        pass


def main() -> None:
    req = ROOT / "requirements.txt"
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip", "-q"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req)])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-deps", "rapidocr-onnxruntime"])
    # Valida importação imediata de todos os motores essenciais
    subprocess.check_call(
        [
            sys.executable,
            "-c",
            "import pymupdf, reportlab, PIL, docx, pypdf, onnxruntime, cv2, numpy, rapidocr_onnxruntime",
        ]
    )
    create_windows_shortcuts()
    print("Dependências Python e atalhos configurados com sucesso.")


if __name__ == "__main__":
    main()
