#!/usr/bin/env bash
# Run the Go Local Viewer against the repo tree (dev; no embed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO="go"
if [[ -x "$ROOT/.tools/go/bin/go" ]]; then
  GO="$ROOT/.tools/go/bin/go"
fi
cd "$ROOT/host"
exec "$GO" run . -root "$ROOT" "$@"
