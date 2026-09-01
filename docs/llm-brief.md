# DONNER — LLM brief

Static Three.js space-time explorer in the WETTER suite. Parallel to BLITZ,
not a pipeline stage. Brand spelling: **DONNER** (never “thunder”).

## Do

- DONNER is an **event viewer**. Conway is a synthetic generator of
  `(x, y, t, v)` so the renderer can be built before event-camera files
  exist — seeding, teaching, and a performance benchmark. The live demo
  target is event data, not Life. Do not grow a Game-of-Life product
  identity. Three layers: **display** (DONNER: camera, Depth, Z-stack
  playhead, FPS), **source addon** (Conway **or** EVT count stack `.npy`
  from file, ignition demo, or a WOLKE-contract stream;
  MRI later via the same count `.npy`, not a third kind yet),
  **encoding slot**
  (color `k` + fill `s`; Conway fills still/osc/transit + Stability;
  count fills integer rungs + optional size-by-count).
  `src/dynamics.js` is Conway classification; `src/encoding.js` is the
  LUT the renderer actually indexes. Do not assume the Life legend for
  count or polarity streams.
- Keep `Data source → encoding adapter → EventSoA → renderer`. Conway
  lives in `src/conway.js`. Count cubes unpack in `src/npy.js` +
  `src/count.js`. A WOLKE-contract viewer (`src/wolke.js`) only fetches
  that cube (Socket.IO notify + same-origin `/stream-npy` GET); it does
  not add a DONNER backend. Restart `npm start` / `start:lan` so the
  proxy exists. The cube renderer must stay source-agnostic.
  File format is not the runtime contract (SoA is). `.npy` count cubes
  are in; NPZ is still later.
  Product axes: **X, Y = playfield**, **Z = time**. `tFocus` is Z = 0
  (engine Y = 0 internally; Three.js is Y-up). `t > tFocus` is a
  transparent ghost, not extra geometry. Color is an encoding index
  (`k`): Conway uses still / osc / transit, plus warmup for `t < 2`.
  Count uses integer rungs (cyan → gold → coral).
  Default Neighborhood is **none** (occupancy). 3×3 or 5×5 is the motion
  gate so gliders become transit tubes (5×5 is the CPU cliff). Cube scale
  follows Stability mode (`none` / `time` / `focus`)
  via `s`, not decay. Oscillators encode as occupancy along Z, not extra
  hues. Default seed: R-pentomino, started paused; default Stability: Time.
- Paint only when Edit is on **and** focus is at the simulation head
  (not while viewing the tape).
- **Parallax** (`B`) is perspective (default on). Off is orthographic at the **current** look, not a forced top-down. Do not wire cube double-click isolation
  (deferred; later rectangle select). A CAD viewcube (desktop rail slot left of the View card, six face frames, product X/Y/Z) snaps the camera; hover lights a face; omit it on phone and in AR. Desktop **Light** (View slider / Shift-drag) walks the key/fill around Z; the volume stays put. **Yaw** is AR-only (after place). The desktop View HUD heading collapses the telemetry. Scrub the **stack slider**
  (desktop: right, Now/max at top; phone: bottom, Now/max at right) or
  Shift+wheel. The stack axis is **Z time by default**; X or Y remaps the same
  cyan playhead and gold slab grips onto that product axis.
  Sparse Conway/EVT X/Y keeps the full time brick and ghosts toward the
  gold grips. Dense count cubes (occupancy > 15 %) use the same mid-volume
  slab + enclosed cull + one-sided stack ghost as Z; Play walks that
  window on X, Y, or Z. Inspect
  has two extra **slab** handles; outside the band is not drawn.
  **Decay** is Z/time only on sparse stacks. Gold
  handles push the cyan playhead when dragged past it. The focus plane
  ring is cyan; slab cuts are gold rings in the volume. **Depth**
  is cube volume height (live wake). The RAM tape keeps the run from gen
  0 until cap; **Pause** inspects it (fog off, zoom-out stays lit). **Play** returns to
  live Now. Play is a display transport outside
  the sheets; live Conway also steps the generator.
  Source **Stop when stable** (default on) pauses after five bitwise-identical
  grids (still life or empty). Oscillators and wrapping gliders keep running;
  a glider that walks off a hard edge becomes empty and then pauses (Wrap on
  for a perpetual ship). **Fit** (`F`) frames the camera to the drawn slab;
  Inspect Z scrub then moves only the cyan plane (brick stays put). **Align to Z**
  (default on) orbits around the time axis at the brick center; off allows XY pan.
  Ortho always pans. Hover and Edit stay on the Z playfield (disabled on X/Y slices).
  Cube cap is a Bench number (default 200 000).
  Hovering the plane draws hairlines to the numbered X/Y axes and
  outlines the cell plus the focus-slice cube if live. Do not attach a
  3D time grabber to the X/Y frame. Display HUD (FPS, AVG, 1%/0.1% lows,
  sparkline, INST, FOC) stays separate from the Conway source HUD (GEN,
  LIVE, RATE). HUD shows **ORTHO** when parallax is off.
  On a phone the HUD is an FPS chip (tap for the View card); source stats
  stay in the Source sheet. There is no viewcube. FPS/sparkline use raw frame time; the 100 ms
  clamp is simulation catch-up only. The Z stack is a thin tick rail (bar
  + generation beside the handle), not a HUD card. Chrome is two left
  sheets: **View** (Parallax, Align to Z, Light, Depth, Decay, Encoding, Bench) and **Source**
  (Conway or count stack). Do not put the generator in the View panel. **Neighborhood 5×5** is the CPU cliff
  (Renderer Stress is the cube/GPU check). Path timers and GPU/software strings belong in
  Bench. Camera-only frames must not call `fillSoA`.
  XR-A: feature-detect `immersive-ar` and hide **AR** if false.
  Servers send `Permissions-Policy: xr-spatial-tracking=(self)`.
  Visible volume lives on a `stage` group with a nested `turntable`.
  Plane hit-test shows a gold
  square on the table; tap places and locks the pose for the session.
  **Yaw** (overlay slider or swipe) turns the pillar on the table around
  product Z; gen 0 stays put. Then walk with the phone. Desktop orbit
  does not yaw the volume; **Light** walks key/fill around Z instead.
  The pillar base (gen 0) stays on the table; **Play** grows the tape
  upward; Z clips a segment in place. Same `setEvents`.
  If hit-test is missing, the volume sits ~0.8 m in front of the viewer.
  Decay is off in AR. Size (0.4×–2.5×) and Yaw (0°–360°) are on the overlay.
  AR chrome is Play, Z, Size, Yaw, Exit on `#xr-overlay` (not `document.body`
  — that paints the page over passthrough). Next is XR-B marker. Phone
  HTTPS is `https://lab.ole.icu/` after `start:lan`.
  Three.js is the engine, not the product name. Do not propose a
  PyQtGraph/BLITZ port or an empty desktop EXE without a sidecar.
- Port Conway behaviour from BLITZ `blitz/data/conway.py` (B3/S23, wrap,
  pattern geometry). Do not invent a second rule set.
- Repo files in English. Chat with the human in German.
- Commit only inside `DONNER/`. Never `git init` at `WETTER-Suite/`.

## Don't (until a later stage)

- Event-camera `.raw` / EVT3 decode in the browser
- NIfTI / `.nii.gz` parser in the browser; an MRI source kind; embedding
  NiiVue. Today the public T1 is a **dense** count cube
  (`datasets/MRT/mni152_stack.npy`): auto mid-volume slab on Z, X, or Y,
  enclosed voxels culled. Do not convert to a static surface.
- NPZ loaders; polarity / occupancy / states encodings
- Packed WOLKE `__selection__.npy` / `viewer_index` table sync / BLITZ widget sync
- DONNER backend; EVT3 decode in the browser
- WebXR marker origin / Quest (XR-A hit-test is in; next is XR-B marker
  → XR-C Quest 3 in [`backlog.md`](../backlog.md) and
  [`architecture.md`](../architecture.md); do not start it in the
  same slice as a points renderer)
- Source-off-rail / thin View (chrome later in [`backlog.md`](../backlog.md);
  not a gate for XR-A)
- Cube double-click isolation (later: rectangle select)
- Folding DONNER into BLITZ, PyQtGraph, or a native 3D stack without a
  measured WebGL/WebGPU limit
- Points / million-event renderer (after XR-A + cross-platform numbers)
- Fibonacci
- A second Conway implementation that drifts from BLITZ

## Pointers

- Architecture: [`architecture.md`](../architecture.md)
- Later / XR ladder: [`backlog.md`](../backlog.md)
  — MRI volume later (dense count `.npy` + slab cull; no NIfTI parser / NiiVue)
- Phone HTTPS: `https://lab.ole.icu/` after `npm run start:lan`; mkcert
  fallback `npm run start:https`
- UI: [`docs/gui.md`](gui.md)
- Related (not influences; Conway is demonstrator only): [`docs/related.md`](related.md)
  — Wolfram 2025 essay is the internal Life reference, not a DONNER spec
- BLITZ reference: `../BLITZ/blitz/data/conway.py`
- Event sidecar (WOLKE-contract stream): `../EVT/`
