import pathlib
import sys
import unittest

VERSION_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VERSION_DIR))
import build_v7_pwa  # noqa: E402


class VooaltoBuildTests(unittest.TestCase):
    def test_service_worker_hash_is_stable_across_builds(self):
        files = build_v7_pwa.file_list()
        self.assertEqual(len(files), len(set(files)))
        before = build_v7_pwa.content_digest(files)
        sw = (VERSION_DIR / "ATUALIZACAO_V7" / "sw.js").read_text(encoding="utf-8")
        # The generated file contains a timestamp and its own cache name; it must
        # not feed itself back into the next cache hash.
        self.assertIn(f"const CACHE = 'vooalto-v7-{before}'", sw)
        after = build_v7_pwa.content_digest(files)
        self.assertEqual(before, after)

    def test_distribution_files_are_present(self):
        files = build_v7_pwa.file_list()
        self.assertIn("server.py", files)
        self.assertIn("server.js", files)
        self.assertIn("instalar_e_abrir_V7.bat", files)
        self.assertIn("assets/pdf.worker.min.js", files)
        self.assertTrue(all((VERSION_DIR / "ATUALIZACAO_V7" / rel).is_file() for rel in files))


if __name__ == "__main__":
    unittest.main()
