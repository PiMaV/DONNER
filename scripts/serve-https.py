#!/usr/bin/env python3
"""HTTPS file server for LAN phone tests (WebXR needs a secure context).

GET /stream-npy?u=... proxies a WOLKE-contract cube (same as serve-http.py).
"""

from __future__ import annotations

import os
import ssl
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT = os.path.join(ROOT, "certs", "dev.pem")
KEY = os.path.join(ROOT, "certs", "dev-key.pem")
HOST = "0.0.0.0"
PORT = 8765
_SCRIPTS = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from stream_proxy import StreamNpyMixin


class Handler(StreamNpyMixin, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Permissions-Policy", "xr-spatial-tracking=(self)")
        path = (self.path or "").split("?", 1)[0].lower()
        if path.endswith(("/", ".html", ".js", ".mjs", ".css", ".json", ".map")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def lan_ipv4s() -> list[str]:
    out: list[str] = []
    try:
        for ip in os.popen("hostname -I").read().split():
            if "." in ip and not ip.startswith("127."):
                out.append(ip)
    except OSError:
        pass
    return out


def main() -> None:
    if not os.path.isfile(CERT) or not os.path.isfile(KEY):
        sys.exit("Missing certs/dev.pem — install mkcert, then: npm run cert")

    httpd = Server((HOST, PORT), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print(f"https://127.0.0.1:{PORT}/")
    for ip in lan_ipv4s():
        print(f"https://{ip}:{PORT}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
