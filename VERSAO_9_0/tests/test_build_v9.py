import pathlib
import sys
import unittest

VERSION_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VERSION_DIR))
import build_v9_pwa  # noqa: E402


class VooaltoBuildTests(unittest.TestCase):
    def test_service_worker_hash_is_stable_across_builds(self):
        files = build_v9_pwa.file_list()
        self.assertEqual(len(files), len(set(files)))
        before = build_v9_pwa.content_digest(files)
        sw = (VERSION_DIR / "ATUALIZACAO_V9" / "sw.js").read_text(encoding="utf-8")
        # The generated file contains a timestamp and its own cache name; it must
        # not feed itself back into the next cache hash.
        self.assertIn(f"const CACHE = 'vooalto-v9-{before}'", sw)
        after = build_v9_pwa.content_digest(files)
        self.assertEqual(before, after)

    def test_distribution_files_are_present(self):
        files = build_v9_pwa.file_list()
        self.assertIn("server.py", files)
        self.assertIn("server.js", files)
        self.assertIn("instalar_e_abrir_V9.bat", files)
        self.assertIn("criador_ficha_tecnica/index.html", files)
        self.assertIn("criador_orcamento/index.html", files)
        self.assertTrue(all((VERSION_DIR / "ATUALIZACAO_V9" / rel).is_file() for rel in files))

    def test_catalogacao_files_are_gone(self):
        """V8 removeu a Catalogacao e, com ela, o leitor de PDF (pdf.js)."""
        files = set(build_v9_pwa.file_list())
        for removido in (
            "principal_dashboard/index.html",
            "assets/pdf.min.js",
            "assets/pdf.worker.min.js",
        ):
            self.assertNotIn(removido, files)
            self.assertFalse((VERSION_DIR / "ATUALIZACAO_V9" / removido).exists())


    def test_every_referenced_file_is_shipped_and_precached(self):
        """V9.1.2 — o precache era uma lista manual: arquivo novo fora de
        assets/ e icons/ ficava de fora do cache E do hash de conteúdo, então
        quem já tinha o app instalado nunca recebia a atualização e tomava 404
        offline. Agora a pasta é a fonte da verdade e isto trava a regra."""
        import re

        src = VERSION_DIR / "ATUALIZACAO_V9"
        files = set(build_v9_pwa.file_list())
        precache = set(build_v9_pwa.precache_list(build_v9_pwa.file_list()))

        htmls = [rel for rel in files if rel.endswith(".html")]
        self.assertIn("index.html", htmls)
        faltando_no_disco, faltando_no_precache = [], []
        for rel in htmls:
            pasta = (src / rel).parent
            texto = (src / rel).read_text(encoding="utf-8")
            for m in re.finditer(r'(?:src|href)="([^"]+)"', texto):
                alvo = m.group(1)
                if alvo.startswith(("http:", "https:", "data:", "#", "mailto:")) or alvo.startswith("//"):
                    continue
                # ignora referência montada em JS ("'+var+'") e query string
                if not re.fullmatch(r"[A-Za-z0-9_.\-/]+", alvo):
                    continue
                if alvo.startswith("/"):
                    # referência absoluta: resolve a partir da raiz do app
                    caminho = (src / alvo.lstrip("/")).resolve()
                    nome = caminho.relative_to(src.resolve()).as_posix()
                else:
                    caminho = (pasta / alvo).resolve()
                    if not str(caminho).startswith(str(src.resolve())):
                        continue
                    nome = caminho.relative_to(src.resolve()).as_posix()
                if not caminho.is_file():
                    faltando_no_disco.append(f"{rel} -> {alvo}")
                elif nome not in precache:
                    faltando_no_precache.append(f"{rel} -> {alvo}")

        self.assertEqual(faltando_no_disco, [], "referência a arquivo que não existe")
        self.assertEqual(faltando_no_precache, [], "arquivo usado pelo app ficou fora do precache")

    def test_arquivos_do_estudio_da_peca_vao_no_pacote(self):
        """A peça é servida por arquivos soltos em mockup/: se ficarem fora do
        file_list() saem do ZIP e do precache (tela em branco offline)."""
        files = build_v9_pwa.file_list()
        precache = build_v9_pwa.precache_list(files)
        for rel in ('mockup/peca.js', 'mockup/peca_render.js', 'mockup/peca_editor.js',
                    'mockup/peca_editor.css', 'mockup/index.html',
                    'assets/fonts.css', 'assets/tema-v9.css'):
            self.assertIn(rel, files)
            self.assertIn(rel, precache)

    def test_service_worker_stays_out_of_the_precache(self):
        """sw.js não pode se auto-referenciar no cache (loop de hash)."""
        precache = build_v9_pwa.precache_list(build_v9_pwa.file_list())
        self.assertNotIn("sw.js", precache)
        self.assertNotIn("server.js", precache)
        self.assertNotIn("version.json", precache)

    def test_identidade_unica_entre_servidores_e_package(self):
        """A versão morava em server.js, server.py e package.json; o health
        check compara a versão EXATA, então divergir quebrava o .bat."""
        import json

        identidade = json.loads((VERSION_DIR / "ATUALIZACAO_V9" / "version.json").read_text(encoding="utf-8"))
        pacote = json.loads((VERSION_DIR / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(set(identidade), {"app", "version"})
        self.assertEqual(identidade["version"], pacote["version"])

        src_do_app = str(VERSION_DIR / "ATUALIZACAO_V9")
        if src_do_app not in sys.path:
            sys.path.insert(0, src_do_app)
        import server as servidor_py  # noqa: E402
        self.assertEqual(servidor_py.APP_ID, identidade["app"])
        self.assertEqual(servidor_py.APP_VERSION, identidade["version"])

        js = (VERSION_DIR / "ATUALIZACAO_V9" / "server.js").read_text(encoding="utf-8")
        self.assertIn("version.json", js, "server.js deve ler version.json")
        self.assertIn("lerIdentidade", js)
        # nenhum número de versão cravado no código dos servidores
        self.assertNotIn("APP_VERSION = '9.", js)

    def test_python_server_handles_the_same_methods_as_node(self):
        """O .bat cai para o Python quando não há Node: os dois precisam
        responder igual. OPTIONS dava 501 no Python e 405 no Node."""
        py = (VERSION_DIR / "ATUALIZACAO_V9" / "server.py").read_text(encoding="utf-8")
        for metodo in ("do_POST", "do_PUT", "do_DELETE", "do_OPTIONS", "do_PATCH"):
            self.assertIn(f"def {metodo}(", py, f"{metodo} deveria recusar com 405")

    def test_missing_generated_sw_does_not_break_a_clean_build(self):
        """sw.js e gerado pelo proprio build: nao pode contar como faltante."""
        src = (VERSION_DIR / "build_v9_pwa.py").read_text(encoding="utf-8")
        self.assertIn("rel != 'sw.js'", src)


if __name__ == "__main__":
    unittest.main()
