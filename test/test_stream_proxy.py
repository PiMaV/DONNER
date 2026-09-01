"""Allowlist and same-origin /stream-npy proxy (run: python3 -m unittest)."""

from __future__ import annotations

import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from stream_proxy import StreamNpyMixin, allowed_stream_url  # noqa: E402


class AllowlistTests(unittest.TestCase):
    def test_loopback_and_lan(self):
        self.assertIsNotNone(
            allowed_stream_url("http://127.0.0.1:5055/evt?filename=stack.npy")
        )
        self.assertIsNotNone(allowed_stream_url("http://192.168.178.30:5055/evt"))
        self.assertIsNotNone(allowed_stream_url("http://localhost:5055/x"))

    def test_rejects_public_and_file(self):
        self.assertIsNone(allowed_stream_url("http://8.8.8.8/evt"))
        self.assertIsNone(allowed_stream_url("https://example.com/evt"))
        self.assertIsNone(allowed_stream_url("file:///etc/passwd"))
        self.assertIsNone(allowed_stream_url("http://user:pass@127.0.0.1:5055/x"))


class _Sidecar(BaseHTTPRequestHandler):
    body = b"\x93NUMPYfake"

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *_args):
        return


class _Proxy(StreamNpyMixin, SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        return


class ProxyTests(unittest.TestCase):
    def test_proxies_loopback_npy(self):
        sidecar = ThreadingHTTPServer(("127.0.0.1", 0), _Sidecar)
        proxy = ThreadingHTTPServer(("127.0.0.1", 0), _Proxy)
        threads = [
            threading.Thread(target=sidecar.serve_forever, daemon=True),
            threading.Thread(target=proxy.serve_forever, daemon=True),
        ]
        for t in threads:
            t.start()
        try:
            target = f"http://127.0.0.1:{sidecar.server_address[1]}/evt?filename=stack.npy"
            url = f"http://127.0.0.1:{proxy.server_address[1]}/stream-npy?u={quote(target, safe='')}"
            with urlopen(url, timeout=5) as res:
                self.assertEqual(res.read(), _Sidecar.body)
        finally:
            sidecar.shutdown()
            sidecar.server_close()
            proxy.shutdown()
            proxy.server_close()

    def test_forbids_public_target(self):
        proxy = ThreadingHTTPServer(("127.0.0.1", 0), _Proxy)
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        try:
            url = (
                f"http://127.0.0.1:{proxy.server_address[1]}/stream-npy"
                "?u=http://8.8.8.8/evt"
            )
            with self.assertRaises(Exception) as ctx:
                urlopen(url, timeout=5)
            self.assertIn("403", str(ctx.exception))
        finally:
            proxy.shutdown()
            proxy.server_close()


if __name__ == "__main__":
    unittest.main()
