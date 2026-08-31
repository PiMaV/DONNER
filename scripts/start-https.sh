#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f certs/dev.pem || ! -f certs/dev-key.pem ]]; then
  bash scripts/mkcert-lan.sh
fi
exec python3 scripts/serve-https.py
