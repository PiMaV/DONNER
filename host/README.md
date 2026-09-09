# DONNER Local Viewer host (Go)

Thin HTTP shell for the same static JS app:

- Serves `index.html` / `css` / `src` / `vendor` / `data`
- `GET /local-viewer.json` → enables Stream / Connect in the UI
- `GET /stream-npy?u=…` → allowlisted sidecar cube proxy
- Opens the default browser

## Dev (repo tree, no embed)

From the repo root (Go 1.22+ on `PATH`, or `.tools/go` after a local SDK install):

```bash
npm run start:viewer
# or: bash scripts/run-local-viewer.sh -bind 127.0.0.1
```

## Release build

```bash
bash scripts/sync-local-viewer-web.sh
cd host
CGO_ENABLED=0 go build -tags release -o ../dist/DONNER-linux-x86_64 .
```

CI: `.github/workflows/release.yml` on tag `v*`.
