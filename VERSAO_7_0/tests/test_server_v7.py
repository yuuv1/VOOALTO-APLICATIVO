import http.client
import importlib.util
import pathlib
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer

SRC = pathlib.Path(__file__).resolve().parents[1] / "ATUALIZACAO_V7"
sys.path.insert(0, str(SRC))
import server as server_module  # noqa: E402


class VooaltoPythonServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer((server_module.HOST, 0), server_module.VooaltoHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def fetch(self, path, method="GET", headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        body = response.read()
        headers = dict(response.getheaders())
        status = response.status
        conn.close()
        return status, headers, body

    def test_health_and_static_files(self):
        status, headers, body = self.fetch(server_module.HEALTH_PATH)
        self.assertEqual(status, 200)
        self.assertIn(b'"app": "vooalto-v7"', body)
        self.assertEqual(headers["Cache-Control"], "no-cache")

        status, headers, body = self.fetch("/manifest.webmanifest")
        self.assertEqual(status, 200)
        self.assertIn("manifest+json", headers["Content-type"])
        self.assertIn(b'"id": "./"', body)

        status, _headers, body = self.fetch("/principal_dashboard/")
        self.assertEqual(status, 200)
        self.assertIn("Catalogação".encode(), body)

    def test_loopback_health_check_and_traversal_guard(self):
        self.assertTrue(server_module.is_vooalto_already_running(self.port))
        status, _headers, _body = self.fetch("/", headers={"Host": f"localhost:{self.port}"})
        self.assertEqual(status, 200)
        status, _headers, _body = self.fetch("/", headers={"Host": "attacker.example"})
        self.assertEqual(status, 403)
        self.assertIsNone(server_module.resolve_request_path("/%2e%2e/%2e%2e/etc/passwd"))
        self.assertIsNone(server_module.resolve_request_path("/%00"))
        self.assertIsNotNone(server_module.resolve_request_path("/index.html"))

    def test_head_and_unsupported_method(self):
        status, _headers, body = self.fetch("/", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")

        status, headers, _body = self.fetch("/", "POST")
        self.assertEqual(status, 405)
        self.assertEqual(headers.get("Allow"), "GET, HEAD")


if __name__ == "__main__":
    unittest.main()
