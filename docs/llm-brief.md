# DONNER — LLM brief

Static Three.js space-time explorer in the WETTER suite. Parallel to BLITZ,
not a pipeline stage. Brand spelling: **DONNER** (never “thunder”).

## Do

- Keep `Data source → EventSoA → renderer` . Conway lives in `src/conway.js`.
  The cube renderer must stay source-agnostic.
- Port Conway behaviour from BLITZ `blitz/data/conway.py` (B3/S23, wrap,
  pattern geometry). Do not invent a second rule set.
- Repo files in English. Chat with the human in German.
- Commit only inside `DONNER/`. Never `git init` at `WETTER-Suite/`.

## Don't (until a later stage)

- Event-camera `.raw` / EVT3 decode in the browser
- Backend, WebSocket, BLITZ sync
- WebXR
- Fibonacci
- A second Conway implementation that drifts from BLITZ

## Pointers

- Architecture: [`architecture.md`](../architecture.md)
- UI: [`docs/gui.md`](gui.md)
- BLITZ reference: `../BLITZ/blitz/data/conway.py`
- Event sidecar (later consumer): `../EVT/`
