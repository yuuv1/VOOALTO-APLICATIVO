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

    def test_missing_generated_sw_does_not_break_a_clean_build(self):
        """sw.js e gerado pelo proprio build: nao pode contar como faltante."""
        src = (VERSION_DIR / "build_v9_pwa.py").read_text(encoding="utf-8")
        self.assertIn("rel != 'sw.js'", src)


if __name__ == "__main__":
    unittest.main()
