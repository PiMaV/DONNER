#!/usr/bin/env python3
"""HTTP file server for LAN. Sends WebXR Permissions-Policy so Chrome
Android does not reject immersive-ar after a browser update.

HTML/JS/CSS are Cache-Control: no-store so a phone does not keep a
stale ES module graph (main.js vs xr.js / orbit.js out of sync).

GET /stream-npy?u=http://127.0.0.1:5055/evt?filename=stack.npy proxies a
WOLKE-contract cube so the browser stays same-origin.
"""

from __future__ import annotations

import argparse
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
_SCRIPTS = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from stream_proxy import StreamNpyMixin


class Handler(StreamNpyMixin, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header(
            "Permissions-Policy",
            "xr-spatial-tracking=(self), camera=(self)",
        )
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()
    httpd = Server((args.bind, PORT), Handler)
    print(f"http://{args.bind}:{PORT}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
