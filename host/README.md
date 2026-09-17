# DONNER Local Viewer host (Go)

Thin HTTP shell for the same static JS app:

- Serves `index.html` / `css` / `src` / `vendor` / `data` / `icon`
- `GET /local-viewer.json` → `{ localViewer, canQuit }` (enables Stream / Connect + EXIT)
- `POST /quit` → immediate shutdown (loopback; **EXIT** button)
- `POST /ping` / `POST /bye` → presence: auto-quit after browser close (reload-safe)
- `GET /stream-npy?u=…` → allowlisted sidecar cube proxy
- Opens the default browser; if the port is already a Local Viewer, reopens it and exits
- Console hint: Ctrl+C only when a real TTY is attached

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
TAG=v1.3.0   # match the release tag
CGO_ENABLED=0 go build -tags release -o ../dist/DONNER-${TAG}-linux-x86_64 .
```

CI: `.github/workflows/release.yml` on tag `v*` (asset names include the tag).
