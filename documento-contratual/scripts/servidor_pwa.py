#!/usr/bin/env python3
"""Servidor local e de pré-visualização do PWA VOOALTO Contratos (compatível com python.exe e pythonw.exe no Windows)."""
from __future__ import annotations

import argparse
import base64
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import posixpath
import re
import sys
import tempfile
import traceback
from zipfile import ZIP_DEFLATED, ZipFile

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
SERVER_LOG_FILE = LOGS_DIR / "servidor_pwa.log"

# No Windows com pythonw.exe, sys.stdout e sys.stderr são None e quebrariam SimpleHTTPRequestHandler/print
if sys.stdout is None or sys.stderr is None:
    _log_handle = open(SERVER_LOG_FILE, "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _log_handle
    if sys.stderr is None:
        sys.stderr = _log_handle

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from extrair_proposta import analyze_document_bytes  # noqa: E402
from gerar_contrato import (  # noqa: E402
    OUT_NAME,
    ContractPDF,
    add_digital_signature_fields,
    build_docx,
    register_fonts,
    validate_data,
)

DOCS_DIR = ROOT / "docs"
ENTREGAS_DIR = ROOT / "entregas"
FONTS_REGISTERED = False
SERVER_VERSION = "2.1.0"

# Mapa explícito de MIME types para evitar bug do Registro do Windows (HKEY_CLASSES_ROOT\.js = text/plain)
EXPLICIT_MIME_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".wasm": "application/wasm",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".zip": "application/zip",
    ".txt": "text/plain; charset=utf-8",
}


def server_log(message: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {message}\n"
    try:
        with open(SERVER_LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception:
        pass
    try:
        if sys.stdout is not None:
            sys.stdout.write(line)
            sys.stdout.flush()
    except Exception:
        pass


def ensure_fonts() -> None:
    global FONTS_REGISTERED
    if not FONTS_REGISTERED:
        register_fonts()
        FONTS_REGISTERED = True


def safe_slug(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9À-ÿ_\- ]+", "", name).strip()
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned[:48] or OUT_NAME


def decode_data_url_bytes(data_url: str) -> tuple[bytes, str]:
    if "," in data_url:
        header, encoded = data_url.split(",", 1)
    else:
        header, encoded = "data:image/png;base64", data_url
    ext = ".jpg" if "jpeg" in header or "jpg" in header else ".png"
    return base64.b64decode(encoded), ext


def generate_contract_bundle(payload: dict) -> dict:
    """Gera o DOCX e o PDF preenchível idênticos a partir do estado do formulário."""
    ensure_fonts()
    contract_data = json.loads(json.dumps(payload.get("dados", {})))
    save_to_entregas = bool(payload.get("salvar_em_entregas", False))

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp_dir = Path(tmp_str)
        refs_in = contract_data.get("producao", {}).get("imagens_referencia", [])
        resolved_refs = []
        for idx, ref in enumerate(refs_in, start=1):
            titulo = str(ref.get("titulo") or f"Referência {idx:02d}").strip()
            data_url = ref.get("data_url", "")
            arquivo = ref.get("arquivo", "")
            if data_url and data_url.startswith("data:image/"):
                img_bytes, ext = decode_data_url_bytes(data_url)
                rel_img_dir = ENTREGAS_DIR / "referencias" if save_to_entregas else tmp_dir
                rel_img_dir.mkdir(parents=True, exist_ok=True)
                img_file = rel_img_dir / f"ref_{idx:02d}{ext}"
                img_file.write_bytes(img_bytes)
                resolved_refs.append({
                    "titulo": titulo,
                    "arquivo": str(img_file),
                })
            elif arquivo:
                resolved_refs.append({"titulo": titulo, "arquivo": arquivo})
        contract_data.setdefault("producao", {})["imagens_referencia"] = resolved_refs

        computed = validate_data(contract_data)
        base_pdf = tmp_dir / "base.pdf"
        out_pdf = tmp_dir / f"{OUT_NAME}.pdf"
        out_docx = tmp_dir / f"{OUT_NAME}.docx"

        for ref in contract_data["producao"]["imagens_referencia"]:
            p = Path(ref["arquivo"])
            if p.is_absolute():
                try:
                    ref["arquivo"] = str(p.relative_to(ROOT))
                except ValueError:
                    stage_dir = ROOT / ".tmp_refs"
                    stage_dir.mkdir(exist_ok=True)
                    staged = stage_dir / p.name
                    staged.write_bytes(p.read_bytes())
                    ref["arquivo"] = str(staged.relative_to(ROOT))

        try:
            builder = ContractPDF(base_pdf, contract_data, computed)
            builder.build()
            add_digital_signature_fields(base_pdf, out_pdf, builder.signatures)
            build_docx(contract_data, out_docx, computed)
        finally:
            stage_cleanup = ROOT / ".tmp_refs"
            if stage_cleanup.exists():
                for f in stage_cleanup.iterdir():
                    f.unlink(missing_ok=True)
                stage_cleanup.rmdir()

        pdf_bytes = out_pdf.read_bytes()
        docx_bytes = out_docx.read_bytes()

        client_name = contract_data.get("cliente", {}).get("nome_razao_social", "").strip()
        file_base = f"Contrato_Vooalto_{safe_slug(client_name)}" if client_name else OUT_NAME

        if save_to_entregas:
            ENTREGAS_DIR.mkdir(parents=True, exist_ok=True)
            (ENTREGAS_DIR / f"{OUT_NAME}.pdf").write_bytes(pdf_bytes)
            (ENTREGAS_DIR / f"{OUT_NAME}.docx").write_bytes(docx_bytes)
            clean_json = json.loads(json.dumps(contract_data))
            (ROOT / "dados/contrato.json").write_text(
                json.dumps(clean_json, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

        zip_buf = BytesIO()
        with ZipFile(zip_buf, "w", compression=ZIP_DEFLATED) as zf:
            zf.writestr(f"{file_base}.docx", docx_bytes)
            zf.writestr(f"{file_base}.pdf", pdf_bytes)

        return {
            "nome_base": file_base,
            "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            "docx_base64": base64.b64encode(docx_bytes).decode("ascii"),
            "zip_base64": base64.b64encode(zip_buf.getvalue()).decode("ascii"),
            "resumo": {
                "tem_itens": computed["has_items"],
                "quantidade": computed["count_display"],
                "total": computed["total_display"],
                "extenso": computed["words_display"],
                "entrada": computed["advance_display"],
                "saldo": computed["balance_display"],
                "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "salvo_em_entregas": save_to_entregas,
            },
        }


class VooaltoHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        server_log(f"Erro na conexão com {client_address}:\n{traceback.format_exc()}")


class VooaltoPWAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DOCS_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        try:
            server_log(f"{self.address_string()} - {format % args}")
        except Exception:
            pass

    def log_error(self, format: str, *args) -> None:  # noqa: A002
        try:
            server_log(f"ERRO HTTP: {format % args}")
        except Exception:
            pass

    def guess_type(self, path: str) -> str:
        _, ext = posixpath.splitext(str(path).lower())
        if ext in EXPLICIT_MIME_TYPES:
            return EXPLICIT_MIME_TYPES[ext]
        return super().guess_type(path)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/status":
            contrato_atual = json.loads((ROOT / "dados/contrato.json").read_text(encoding="utf-8"))
            logo_b64 = base64.b64encode((ROOT / "assets/logo-vooalto.png").read_bytes()).decode("ascii")
            sig_b64 = base64.b64encode((ROOT / "assets/assinatura-esio-andrade.png").read_bytes()).decode("ascii")
            return self.send_json(HTTPStatus.OK, {
                "ok": True,
                "versao": SERVER_VERSION,
                "modo": "local_python_completo",
                "contrato_inicial": contrato_atual,
                "assets": {
                    "logo": f"data:image/png;base64,{logo_b64}",
                    "assinatura": f"data:image/png;base64,{sig_b64}",
                },
            })

        if path == "/api/exemplo-proposta":
            sample_path = ROOT / "PROPOSTA DE VENDA ANA.pdf"
            if not sample_path.exists():
                return self.send_json(HTTPStatus.NOT_FOUND, {"erro": "Arquivo de exemplo não encontrado."})
            result = analyze_document_bytes(sample_path.name, sample_path.read_bytes())
            return self.send_json(HTTPStatus.OK, result)

        if path == "/api/exemplo-ficha-mpto":
            ficha_path = ROOT / "contratos/MPTO_Ministerio_Publico_do_Tocantins/FICHA_TECNICA_3374_MPTO_Original.pdf"
            if not ficha_path.exists():
                return self.send_json(HTTPStatus.NOT_FOUND, {"erro": "Ficha Técnica MPTO de exemplo não encontrada."})
            result = analyze_document_bytes(ficha_path.name, ficha_path.read_bytes())
            return self.send_json(HTTPStatus.OK, result)

        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            payload = self.read_json_body()
            if path == "/api/analisar":
                filename = str(payload.get("nome", "anexo.pdf"))
                b64_content = str(payload.get("conteudo_base64", ""))
                if "," in b64_content:
                    b64_content = b64_content.split(",", 1)[1]
                raw_bytes = base64.b64decode(b64_content)
                result = analyze_document_bytes(filename, raw_bytes)
                return self.send_json(HTTPStatus.OK, result)

            if path == "/api/gerar":
                bundle = generate_contract_bundle(payload)
                return self.send_json(HTTPStatus.OK, bundle)

            return self.send_json(HTTPStatus.NOT_FOUND, {"erro": f"Rota desconhecida: {path}"})
        except Exception as exc:
            server_log(f"Exceção em {path}:\n{traceback.format_exc()}")
            return self.send_json(HTTPStatus.BAD_REQUEST, {"erro": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    server = VooaltoHTTPServer((args.host, args.port), VooaltoPWAHandler)
    server_log(f"VOOALTO Contratos PWA v{SERVER_VERSION} ativo em http://{args.host}:{args.port} (pasta: {DOCS_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
