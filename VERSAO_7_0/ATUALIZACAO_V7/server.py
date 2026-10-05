#!/usr/bin/env python3
"""Fallback local server for Vooalto V7 when Node.js is unavailable."""

from __future__ import annotations

import argparse
import errno
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent
APP_ID = "vooalto-v7"
APP_VERSION = "7.1.0"
HEALTH_PATH = "/__vooalto_health"
HOST = "127.0.0.1"


def get_port() -> int:
    raw = os.environ.get("PORT", "4700")
    try:
        port = int(raw)
    except (TypeError, ValueError):
        return 4700
    return port if 1 <= port <= 65535 else 4700


def resolve_request_path(request_path: str, root: Path = ROOT) -> Path | None:
    """Resolve a URL path safely inside the V7 folder; never serve parent files."""
    try:
        pathname = unquote(urlsplit(request_path).path, errors="strict")
    except (UnicodeDecodeError, ValueError):
        return None

    if "\x00" in pathname:
        return None

    segments = [segment for segment in pathname.replace("\\", "/").split("/") if segment and segment != "."]
    if any(segment == ".." or ":" in segment for segment in segments):
        return None

    base = root.resolve()
    target = base.joinpath(*segments).resolve()
    if target != base and base not in target.parents:
        return None
    if pathname.endswith("/") or target == base:
        target = target / "index.html"
    return target


class VooaltoHandler(SimpleHTTPRequestHandler):
    server_version = "VooaltoV7/7"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def parse_request(self):
        if not super().parse_request():
            return False
        try:
            hostname = urlsplit("//" + self.headers.get("Host", "")).hostname
        except ValueError:
            hostname = None
        if hostname not in {"localhost", "127.0.0.1", "::1"}:
            self.send_error(403, "Local requests only")
            return False
        return True

    def translate_path(self, request_path: str) -> str:
        target = resolve_request_path(request_path)
        return str(target) if target is not None else str(ROOT / "__vooalto_invalid_path__")

    def list_directory(self, path):
        self.send_error(404, "Not Found")
        return None

    def do_GET(self):
        if urlsplit(self.path).path == HEALTH_PATH:
            self._send_health()
            return
        super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path == HEALTH_PATH:
            self._send_health(head_only=True)
            return
        super().do_HEAD()

    def do_POST(self):
        self._send_method_not_allowed()

    def do_PUT(self):
        self._send_method_not_allowed()

    def do_DELETE(self):
        self._send_method_not_allowed()

    def _send_method_not_allowed(self):
        body=b'405 Method Not Allowed'
        self.send_response(405)
        self.send_header('Allow','GET, HEAD')
        self.send_header('Content-Type','text/plain; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)

    def _send_health(self, head_only: bool = False):
        body = json.dumps({"app": APP_ID, "version": APP_VERSION}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def log_message(self, format_string, *args):
        # Keep the server window useful: static asset requests can otherwise drown
        # out startup and port-conflict messages.
        return


def is_vooalto_already_running(port: int) -> bool:
    url = f"http://127.0.0.1:{port}{HEALTH_PATH}"
    try:
        with urllib.request.urlopen(url, timeout=1.5) as response:
            result = json.loads(response.read().decode("utf-8"))
            return response.status == 200 and result.get("app") == APP_ID and result.get("version") == APP_VERSION
    except (OSError, urllib.error.URLError, ValueError, json.JSONDecodeError):
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Servidor local do Vooalto V7")
    parser.add_argument("--open", action="store_true", help="abre o app no navegador depois de iniciar")
    args = parser.parse_args(argv)
    port = get_port()

    try:
        server = ThreadingHTTPServer((HOST, port), VooaltoHandler)
    except OSError as error:
        if error.errno in (errno.EADDRINUSE, 10048):
            if is_vooalto_already_running(port):
                url = f"http://localhost:{port}/"
                print(f"O servidor Vooalto V7 ja esta ativo em {url}")
                if args.open:
                    webbrowser.open(url, new=1)
                return 0
            print(f"ERRO: a porta {port} ja esta ocupada por outro processo.", file=sys.stderr)
            print("Feche o outro servidor/aplicativo que usa essa porta e tente novamente.", file=sys.stderr)
            return 1
        print(f"ERRO ao iniciar o servidor local: {error}", file=sys.stderr)
        return 1

    url = f"http://localhost:{port}/"
    print("====================================================")
    print(f"  Vooalto V7 ativo em: {url}")
    print("  Este servidor aceita conexoes somente deste computador.")
    print("  Minimize esta janela; mantenha-a aberta durante o uso.")
    print("====================================================")
    if args.open:
        webbrowser.open(url, new=1)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor Vooalto V7 encerrado.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
