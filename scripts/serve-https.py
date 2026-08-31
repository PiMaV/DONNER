#!/usr/bin/env python3
"""HTTPS file server for LAN phone tests (WebXR needs a secure context)."""

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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


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

    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
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
