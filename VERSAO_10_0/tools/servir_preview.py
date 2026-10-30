#!/usr/bin/env python3
"""Servidor de PREVIEW do VOOALTO V10 (só para conferir no navegador).

Serve a pasta ATUALIZACAO_V10 em 0.0.0.0, para funcionar atrás de proxy/preview.

    python tools/servir_preview.py            # porta 8080
    PORT=9000 python tools/servir_preview.py

Não é o servidor do app (esse é ATUALIZACAO_V10/server.py, em 127.0.0.1:4800,
que de propósito só aceita conexões do próprio computador).
"""
from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent / 'ATUALIZACAO_V10'
PORTA = int(os.environ.get('PORT', '8080'))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RAIZ), **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')       # preview sempre fresco
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s\n' % (fmt % args))


def main() -> int:
    if not (RAIZ / 'index.html').exists():
        print(f'não achei o app em {RAIZ}', file=sys.stderr)
        return 1
    servidor = ThreadingHTTPServer(('0.0.0.0', PORTA), Handler)
    servidor.daemon_threads = True
    print(f'preview VOOALTO V10 em http://0.0.0.0:{PORTA}  (pasta {RAIZ})', flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
