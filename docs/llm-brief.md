# DONNER — LLM brief

Static Three.js space-time explorer in the WETTER suite. Parallel to BLITZ,
not a pipeline stage. Brand spelling: **DONNER** (never “thunder”).

## Do

- DONNER is an **event viewer**. Conway is a synthetic generator of
  `(x, y, t, v)` so the renderer can be built before event-camera files
  exist — seeding, teaching, and a performance benchmark. The live demo
  target is event data, not Life. Do not grow a Game-of-Life product
  identity. `src/dynamics.js` (still/osc/transit) is Conway-only; do not
  assume that legend for polarity streams.
- Keep `Data source → EventSoA → renderer` . Conway lives in `src/conway.js`.
  The cube renderer must stay source-agnostic. Product axes: **X, Y =
  playfield**, **Z = time**. `tFocus` is Z = 0 (engine Y = 0 internally;
  Three.js is Y-up). `t > tFocus` is a transparent ghost, not extra geometry.
  Color is
  worldline class (`k`): still / osc / transit, plus warmup for `t < 2`.
  Still/osc only if the 5×5 neighborhood did not translate (glider = all
  transit). Cube scale follows Stability mode (`none` / `time` / `focus`)
  via `s`, not decay. Oscillators encode as occupancy along Z, not extra
  hues. Default seed: Blinker; default Stability: Time.
- Paint only when Edit is on **and** focus is at the simulation head.
- Bird-eye (`B`) is orthographic top-down onto Z = 0 and draws **only the
  focus slice** (a 2D grid). Isolation (`I`) dims the field to one `(x, y)`
  worldline. Scrub Z with the right-hand **stack slider** (Now at top) or
  Shift+wheel; do not attach a 3D time grabber to the X/Y frame. Hovering
  the plane draws hairlines to the numbered X/Y axes and outlines the
  cell plus the focus-slice cube if live.
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
- Related (not influences; Conway is demonstrator only): [`docs/related.md`](related.md)
  — Wolfram 2025 essay is the internal Life reference, not a DONNER spec
- BLITZ reference: `../BLITZ/blitz/data/conway.py`
- Event sidecar (later consumer): `../EVT/`
