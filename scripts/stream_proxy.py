"""Same-origin GET /stream-npy?u=... so the browser never CORS-fetches the sidecar.

The laptop process may reach 127.0.0.1:5055 even when the page origin is
https://lab.ole.icu (Chrome Local Network Access / CORS would hide the body).
Only loopback and RFC1918 HTTP(S) targets are allowed. Redirects are not.
"""

from __future__ import annotations

import ipaddress
from http.server import SimpleHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

CHUNK = 256 * 1024
MAX_BYTES = 512 * 1024 * 1024
READ_TIMEOUT_S = 120


class _BlockRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise URLError("redirects are not allowed")


_OPENER = build_opener(_BlockRedirects)


def allowed_stream_url(raw: str) -> str | None:
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.username or parsed.password:
        return None
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return parsed.geturl()
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    if ip.is_loopback or ip.is_private:
        return parsed.geturl()
    return None


def fetch_stream_body(url: str) -> tuple[int, bytes, str]:
    req = Request(url, headers={"Accept-Encoding": "identity"})
    with _OPENER.open(req, timeout=READ_TIMEOUT_S) as upstream:
        ctype = upstream.headers.get("Content-Type") or "application/octet-stream"
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = upstream.read(CHUNK)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                raise OSError("cube exceeds proxy size cap")
            chunks.append(chunk)
        return 200, b"".join(chunks), ctype


class StreamNpyMixin:
    """Install on a SimpleHTTPRequestHandler: intercept GET /stream-npy."""

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") == "/stream-npy":
            self._serve_stream_npy(parsed.query)
            return
        super().do_GET()  # type: ignore[misc]

    def _serve_stream_npy(self, query: str) -> None:
        assert isinstance(self, SimpleHTTPRequestHandler)
        raw = (parse_qs(query).get("u") or [""])[0]
        target = allowed_stream_url(raw)
        if not target:
            self.send_error(403, "stream target is not a local sidecar")
            return
        try:
            status, body, ctype = fetch_stream_body(target)
        except HTTPError as exc:
            self.send_error(exc.code, f"sidecar HTTP {exc.code}")
            return
        except (URLError, TimeoutError, OSError) as exc:
            self.send_error(502, f"sidecar unreachable: {exc}")
            return
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
