# DONNER — LLM brief

Browser-native scientific 3D/XR explorer for structured data in the
WETTER suite. Parallel to BLITZ, not a pipeline stage.
**Explore in DONNER. Analyze in BLITZ.**
**WOLKE finds it. DONNER explores it. BLITZ analyzes it.**
Brand spelling: **DONNER** (never “thunder”).
Expansion: Dimensional Observation & Navigation: N-dimensional Exploration
& Rendering.

Do not define DONNER primarily as an event viewer. Event-camera count
stacks are one source. Conway is the demo-shell generator, not the
product identity. The browser (desktop, mobile, AR, XR) is a product
advantage, not a deployment convenience.

## Do

- DONNER is a **scientific 3D/XR explorer**. Conway is a synthetic
  generator of `(x, y, t, v)` so the renderer can be built before
  event-camera files exist — seeding, teaching, and a performance
  benchmark. Do not grow a Game-of-Life product identity. Three layers:
  **display** (DONNER: camera, Depth, Z-stack playhead, FPS),
  **source addon** (Conway **or** EVT count stack `.npy` from file,
  ignition demo, WOLKE-contract stream, or MNI 152 as a dense count cube),
  **encoding slot**
  (color `k` + fill `s`; Conway fills still/osc/moving/unsettled + Stability;
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
  are in; NPZ is still later. Keep `CountVolume` for counts; do not use
  it as the generic scientific volume (CT HU can be negative).
  Product axes **default** for Conway/EVT: **X, Y = playfield**,
  **Z = time**. **Now** is Z = 0
  (engine Y = 0 internally; Three.js is Y-up). That mapping is not a
  core invariant for MRI/CT. Dataset Contract / `ScalarVolume` is later
  (public preview first). `tFocus` is the playhead
  that walks that stack (same as X/Y). `t > tFocus` is a
  transparent ghost, not extra geometry. Color is an encoding index
  (`k`): Conway uses still / osc / moving / unsettled, plus base for `t < 2`
  and the first cube of each worldline.
  Count uses integer rungs (cyan → gold → coral).
  Default Neighborhood is **none** (occupancy). 3×3 or 5×5 is the motion
  gate so gliders become moving tubes (5×5 is the CPU cliff). Cube scale
  follows Stability mode (`none` / `time` / `focus`)
  via `s`, not decay. Oscillators encode as occupancy along Z, not extra
  hues. Default seed: R-pentomino, started paused; default Stability: Time.
- Paint only when Edit is on **and** focus is at the simulation head
  (not while viewing the tape).
- **Parallax** (`B`) is perspective (default on). Off is orthographic at the **current** look, not a forced top-down. Do not wire cube double-click isolation
  (deferred; later rectangle select). A CAD viewcube (desktop rail slot left of the View card, six face frames, product X/Y/Z: cornflower / maize / mint) **face click** is a 2D cut: that axis, ortho fitted to the slice rectangle, that plane's frame and grid only. Wheel zooms, right-drag pans, Shift+wheel pages. Same-face click pages the stack (no refit). Left-drag orbits out to 3D; zoom/pan stay in the cut. `B` also leaves. Hover lights a face; omit the cube on phone and in AR. Lighting is a **headlamp** (key/fill follow the view). **Yaw** is AR-only (after place). The desktop View HUD heading collapses the telemetry. Scrub the **stack slider**
  (desktop: right, Now/max at top; phone: bottom, Now/max at right) or
  Shift+wheel. The stack axis is **Z time by default**; X or Y remaps the same
  playhead and slab grips onto that product axis (axis-colored in the volume).
  Sparse Conway/EVT X/Y keeps the full time brick and ghosts toward the
  clip grips. Dense count cubes (occupancy > 15 %) use the same mid-volume
  slab + enclosed cull + one-sided stack ghost as Z; Play walks that
  window on X, Y, or Z. Inspect
  has two extra **slab** handles per axis; outside the band is not drawn.
  **Decay** defaults off (Z/time fade when on; sparse stacks only). Clip
  handles push the playhead when dragged past it. Planes and cuts share
  the axis color. Hover a frame **edge** to light that ring and grab it
  (playhead inset, clips smaller; coincident clip hidden);
  HUD rails recede. Invisible fills are not grab targets. **Depth**
  is cube volume height (live wake). The RAM tape keeps the run from gen
  0 until cap; **Pause** inspects it (fog off, zoom-out stays lit). **Play** returns to
  live Now. Play is a display transport outside
  the sheets; live Conway also steps the generator.
  Source **Stop when stable** (default on) pauses after five generations
  in a short cycle (period 1–15: stills and oscillators). Wrapping gliders
  keep running;
  a glider that walks off a hard edge becomes empty and then pauses (Wrap on
  for a perpetual ship).   **Fit** (`F`) frames the camera to the drawn slab (explicit);
  Inspect Z scrub then moves only the playhead plane (brick stays put). **Align to Z**
  (default on) orbits around the time axis without chasing Z clips;
  right-drag still slides along Z; off allows XY pan.
  Ortho always pans. Edit stays on the Z playfield (disabled on X/Y slices).
  Cube cap is a Bench number (default 200 000).
  Numbered X/Y overlay, hairlines, and cube hover outlines are off
  (units later). Grab the axis-colored frame edges in the volume
  (playhead full size, clips well inside; coincident clip hidden; ~28 px
  screen rim to grab; drag in screen space along the axis). Clip grab
  keeps Hull; playhead grab peeks Ghost (dense count: the cut only). **Triple**
  is three planes, no hull. **Full** (next to Fit) opens the clip box again.
  Playhead and clip bars scale with the brick span, not the cell.
  **Planes** under the viewcube
  (default on) hides 3D frames. Display HUD (FPS, AVG, 1%/0.1% lows,
  sparkline, INST, FOC) stays separate from the Conway source HUD (GEN,
  LIVE, RATE). HUD shows **ORTHO** when parallax is off.
  On a phone the HUD is an FPS chip (tap for the View card); source stats
  stay in the Source sheet. There is no viewcube. FPS/sparkline use raw frame time; the 100 ms
  clamp is simulation catch-up only. The Z stack is a thin tick rail (bar
  + generation beside the handle), not a HUD card. Chrome is two left
  sheets: **View** (Parallax, Align to Z, Light, Depth, Decay, Encoding, Bench) and **Source**
  (Conway or count stack). Do not put the generator in the View panel. **Neighborhood 5×5** is the CPU cliff
  (Renderer Stress is the cube/GPU check). Path timers and GPU/software strings belong in
  Bench. Camera-only frames must not call `fillSoA`. Inspect Hull playhead
  must not either (clip, Ghost, and Triple still refill; clip uses the hull
  cache plus AABB faces, not a full occupancy scan).
  XR-A: feature-detect `immersive-ar` and hide **AR** if false.
  Servers send `Permissions-Policy: xr-spatial-tracking=(self)`.
  Visible volume lives on a `stage` group, then `stand` (which product
  axis sits on the table), then `turntable` (yaw).
  Plane hit-test shows a gold
  square on the table; tap re-places and locks. The volume already sits
  ~0.8 m in front from the first AR frame (it used to stay hidden until a
  plane hit). If hit-test is missing or never finds a plane, that pose
  locks after a short wait.
  **Yaw** (overlay slider or swipe) turns the pillar on the table around
  product Z; gen 0 stays put. Then walk with the phone. Desktop orbit
  does not yaw the volume. Lighting is a **headlamp** (key/fill follow the
  view in orbit and in AR walk).
  Default stand is Z (time up). HUD **X / Y / Z** tips the volume so that
  product plane is the table. Bounding frames stay on after lock; poke a
  cube to Ghost-isolate the standing plane. Play grows the tape; clips
  crop in place. Same `setEvents`.
  Decay is off in AR. Size (0.4×–2.5×) and Yaw (0°–360°) are on the overlay.
  AR chrome on a phone is Play, Stand X/Y/Z, Size, Yaw, Exit on `#xr-overlay` (not
  `document.body` — that paints the page over passthrough). On a headset,
  after lock, a **Play / stand X·Y·Z / Exit** plate parks at eye height (`src/xr-hud.js`);
  hide it when `dom-overlay` type is `screen`. Thumbstick yaws; both
  grips pinch Size. Grab a bounding frame to move that plane; poke a cube
  to isolate the standing plane. XR-B marker, hand tracking, and wrist
  attach are later. Phone HTTPS is
  `https://lab.ole.icu/` after `start:lan`.
  Three.js is the engine, not the product name. Do not propose a
  PyQtGraph/BLITZ port or an empty desktop EXE without a sidecar.
- Port Conway behaviour from BLITZ `blitz/data/conway.py` (B3/S23, wrap,
  pattern geometry). Do not invent a second rule set.
- Repo files in English. Chat with the human in German.
- Commit only inside `DONNER/`. Never `git init` at `WETTER-Suite/`.

## Don't (until a later stage)

- Event-camera `.raw` / EVT3 decode in the browser
- NIfTI / `.nii.gz` parser in the browser; embedding NiiVue. The public T1
  is Source → **MNI 152** (`data/mni152_stack.npy`, native grid, enclosed
  voxels culled). Do not convert to a static surface. Do not build a
  DICOM / PACS / diagnostic workstation.
- Treating `CountVolume` as a generic scalar volume
- Dataset Contract / `ScalarVolume` / PointRenderer **before** a public
  preview (XR-C baseline and thin View first; see [`backlog.md`](../backlog.md))
- NPZ loaders; polarity / occupancy / states encodings
- Packed WOLKE `__selection__.npy` / `viewer_index` table sync / BLITZ widget sync
- DONNER backend; EVT3 decode in the browser
- WebXR marker origin / hand-attach / wrist HUD / QR spawn (XR-A
  hit-test and XR-C-0 parked Play/stand/Exit + stick yaw + grip-pinch size,
  bounding frames, and standing-plane poke are
  in; XR-B marker, XR-C-1 hands, and a lab QR with `?src=` are later in
  [`backlog.md`](../backlog.md) and [`architecture.md`](../architecture.md);
  do not start a points renderer in the same slice)
- Source-off-rail / thin View (chrome later in [`backlog.md`](../backlog.md);
  Phase 2 public preview, not a gate for XR-A)
- Cube double-click isolation (later: rectangle select)
- Folding DONNER into BLITZ, PyQtGraph, or a native 3D stack without a
  measured WebGL/WebGPU limit
- Defining DONNER as an event viewer or a Game-of-Life product
- Points / million-event renderer (after public preview + cross-platform numbers)
- Fibonacci
- A second Conway implementation that drifts from BLITZ

## Pointers

- Architecture: [`architecture.md`](../architecture.md)
- Later / XR ladder: [`backlog.md`](../backlog.md)
  — Dataset Contract after public preview; MRI stays a dense count `.npy`
  until `ScalarVolume` (no NIfTI parser / NiiVue)
- Phone HTTPS: `https://lab.ole.icu/` after `npm run start:lan`; mkcert
  fallback `npm run start:https`
- UI: [`docs/gui.md`](gui.md)
- Related (not influences; Conway is demonstrator only): [`docs/related.md`](related.md)
  — Wolfram 2025 essay is the internal Life reference, not a DONNER spec
- BLITZ reference: `../BLITZ/blitz/data/conway.py`
- Event sidecar (WOLKE-contract stream): `../EVT/`
