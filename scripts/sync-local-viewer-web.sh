#!/usr/bin/env bash
# Copy the Online Demo static tree into host/web for a release embed build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/host/web"
rm -rf "$WEB"
mkdir -p "$WEB"
for path in index.html face-lab.html css src vendor icon data; do
  cp -a "$ROOT/$path" "$WEB/"
done
# Dev/test trees and agent toolchains stay out of the binary.
rm -rf "$WEB/vendor/three/examples" 2>/dev/null || true
echo "Synced Local Viewer web root → $WEB"
