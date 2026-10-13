#!/usr/bin/env python3
"""Servidor de PREVIEW do VOOALTO V7 (só para conferir no navegador).

Serve a pasta ATUALIZACAO_V7 em 0.0.0.0 (para funcionar atrás de proxy/preview)
e publica um PDF de exemplo em /exemplo-ficha.pdf, para testar o leitor interno
da Catalogação sem precisar de arquivo próprio.

    python tools/servir_preview.py            # porta 8080
    PORT=9000 python tools/servir_preview.py

Não é o servidor do app (esse é ATUALIZACAO_V7/server.py, em 127.0.0.1:4700).
"""
from __future__ import annotations

import io
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent / 'ATUALIZACAO_V7'
PORTA = int(os.environ.get('PORT', '8080'))


def montar_pdf_exemplo() -> bytes:
    """PDF 1.4 de 3 páginas, montado à mão (sem dependência externa)."""
    largura, altura = 595, 842
    objetos: list[bytes] = []
    kids = ' '.join(f'{3 + 2 * i} 0 R' for i in range(3))

    def conteudo(n: int) -> bytes:
        texto = (f'BT /F1 20 Tf 60 {altura - 120} Td (Ficha de exemplo - Vooalto V7) Tj ET\n'
                 f'BT /F1 36 Tf 60 {altura - 200} Td (Pagina {n} de 3) Tj ET\n'
                 f'BT /F1 12 Tf 60 {altura - 250} Td (Use este PDF para testar o leitor interno) Tj ET\n'
                 '2 w 60 200 475 120 re S\n')
        return texto.encode('latin-1')

    objetos.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    objetos.append(f'<< /Type /Pages /Kids [{kids}] /Count 3 >>'.encode('latin-1'))
    for i in range(3):
        conteudo_obj = 3 + 2 * i + 1
        objetos.append(
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {largura} {altura}] '
            f'/Contents {conteudo_obj} 0 R /Resources << /Font << /F1 9 0 R >> >> >>'.encode('latin-1'))
        dados = conteudo(i + 1)
        objetos.append(b'<< /Length ' + str(len(dados)).encode() + b' >>\nstream\n' + dados + b'endstream')
    objetos.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    saida = io.BytesIO()
    saida.write(b'%PDF-1.4\n')
    offsets = [0]
    for numero, corpo in enumerate(objetos, start=1):
        offsets.append(saida.tell())
        saida.write(f'{numero} 0 obj\n'.encode() + corpo + b'\nendobj\n')
    inicio_xref = saida.tell()
    saida.write(f'xref\n0 {len(objetos) + 1}\n'.encode())
    saida.write(b'0000000000 65535 f \n')
    for off in offsets[1:]:
        saida.write(f'{off:010d} 00000 n \n'.encode())
    saida.write(f'trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{inicio_xref}\n%%EOF\n'.encode())
    return saida.getvalue()


PDF_EXEMPLO = montar_pdf_exemplo()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RAIZ), **kw)

    def do_GET(self):
        if self.path.split('?')[0] == '/exemplo-ficha.pdf':
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Length', str(len(PDF_EXEMPLO)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(PDF_EXEMPLO)
            return
        super().do_GET()

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
    print(f'preview VOOALTO V7 em http://0.0.0.0:{PORTA}  (pasta {RAIZ})')
    print(f'PDF de exemplo: http://0.0.0.0:{PORTA}/exemplo-ficha.pdf ({len(PDF_EXEMPLO)} bytes)')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
