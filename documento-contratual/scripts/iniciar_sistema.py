#!/usr/bin/env python3
"""Inicializador confiável no Windows: limpa instâncias antigas travadas, sobe o servidor em background com log real e abre o navegador."""
from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOGS_DIR / "servidor_pwa.log"
EXPECTED_VERSION = "2.1.0"


def check_healthy_server(port: int, timeout: float = 1.5) -> bool:
    base = f"http://127.0.0.1:{port}"
    try:
        with urllib.request.urlopen(f"{base}/api/status", timeout=timeout) as r1:
            if r1.status != 200:
                return False
            data = json.loads(r1.read().decode("utf-8"))
            if not data.get("ok") or data.get("versao") != EXPECTED_VERSION:
                return False
        with urllib.request.urlopen(f"{base}/", timeout=timeout) as r2:
            html = r2.read().decode("utf-8", errors="ignore")
            return r2.status == 200 and 'id="root"' in html
    except Exception:
        return False


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.35)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def cleanup_stale_python_on_port(port: int) -> None:
    """Se houver python/pythonw antigo ou travado ocupando a porta 8765 no Windows, encerra-o automaticamente."""
    if os.name != "nt" or not is_port_in_use(port):
        return
    try:
        out = subprocess.check_output(
            ["netstat", "-ano", "-p", "TCP"],
            text=True,
            encoding="oem",
            errors="ignore",
        )
        pids: set[int] = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and f":{port}" in parts[1] and parts[3].upper() == "LISTENING":
                if parts[4].isdigit() and int(parts[4]) > 0:
                    pids.add(int(parts[4]))
        for pid in pids:
            proc_info = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True,
                text=True,
                encoding="oem",
                errors="ignore",
            ).stdout.lower()
            if "python" in proc_info:
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                )
        time.sleep(0.4)
    except Exception:
        pass


def pick_port(preferred: int = 8765) -> int:
    for port in range(preferred, preferred + 15):
        if check_healthy_server(port):
            return port
        if not is_port_in_use(port):
            return port
    return preferred


def spawn_server_background(port: int) -> None:
    log_handle = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    cmd = [sys.executable, str(SCRIPTS_DIR / "servidor_pwa.py"), "--host", "127.0.0.1", "--port", str(port)]
    kwargs: dict = {
        "cwd": str(ROOT),
        "stdin": subprocess.DEVNULL,
        "stdout": log_handle,
        "stderr": log_handle,
        "close_fds": False,
    }
    if os.name == "nt":
        # CREATE_NO_WINDOW (0x08000000) evita janela preta e mantém stdout/stderr válidos no arquivo de log
        kwargs["creationflags"] = 0x08000000 | subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(cmd, **kwargs)


def open_app_window(url: str) -> None:
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe",
            Path(os.environ.get("ProgramFiles", "")) / "Microsoft/Edge/Application/msedge.exe",
            Path(os.environ.get("ProgramFiles", "")) / "Google/Chrome/Application/chrome.exe",
            Path(os.environ.get("ProgramFiles(x86)", "")) / "Google/Chrome/Application/chrome.exe",
            Path(os.environ.get("LocalAppData", "")) / "Google/Chrome/Application/chrome.exe",
        ]
        for exe in candidates:
            if exe.is_file():
                subprocess.Popen(
                    [str(exe), f"--app={url}"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return
    webbrowser.open(url)


def main() -> int:
    preferred_port = 8765
    if not check_healthy_server(preferred_port):
        cleanup_stale_python_on_port(preferred_port)

    port = pick_port(preferred_port)
    url = f"http://127.0.0.1:{port}"

    if not check_healthy_server(port):
        print(f"Iniciando servidor local VOOALTO Contratos em {url} ...")
        spawn_server_background(port)
        for _ in range(60):
            if check_healthy_server(port, timeout=1.0):
                break
            time.sleep(0.25)

    if not check_healthy_server(port, timeout=2.0):
        print("\n[ERRO] O servidor local nao respondeu a tempo.")
        print(f"Consulte o log detalhado em: {LOG_FILE}\n")
        if LOG_FILE.exists():
            lines = LOG_FILE.read_text(encoding="utf-8", errors="ignore").splitlines()[-25:]
            print("\n".join(lines))
        return 1

    (ROOT / ".runtime_url.txt").write_text(url, encoding="utf-8")
    print(f"Servidor pronto e verificado com sucesso: {url}")
    if "--no-browser" not in sys.argv:
        open_app_window(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
