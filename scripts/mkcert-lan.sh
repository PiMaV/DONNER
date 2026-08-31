#!/usr/bin/env bash
# Issue a LAN-dev certificate with mkcert (localhost + current IPv4s).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "Install mkcert first: https://github.com/FiloSottile/mkcert" >&2
  exit 1
fi

mkdir -p certs
names=(localhost 127.0.0.1 ::1)
if command -v hostname >/dev/null 2>&1; then
  # shellcheck disable=SC2207
  for ip in $(hostname -I 2>/dev/null || true); do
    names+=("$ip")
  done
fi

mkcert -cert-file certs/dev.pem -key-file certs/dev-key.pem "${names[@]}"
echo "Wrote certs/dev.pem (gitignored). SANs: ${names[*]}"
echo "mkcert CA: $(mkcert -CAROOT)/rootCA.pem"
echo "Install that CA on the phone once. Re-run npm run cert if the LAN IP changed."
