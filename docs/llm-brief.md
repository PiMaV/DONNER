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
  **display** (DONNER: camera, Depth, Gap, Z-stack playhead, FPS),
  **source addon** (Game of Life, Lighter Ignition, or Brain MRI; ids
  `conway` / `ignition` / `mni152`; WOLKE-contract stream
  and Load `.npy` are later live ingest, hidden from Source chrome),
  **encoding slot**
  (color `k` + fill `s`; Conway fills still/osc/unsettled + Stability;
  count fills integer rungs, color only).
  `src/dynamics.js` is Conway occupancy classification; `src/encoding.js` is the
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
  (`k`): Conway uses still / osc / unsettled, plus base for `t < 2`
  and the first cube of each worldline.
  Count uses integer rungs via **Scale** (DONNER / Gray / Inferno / Plasma / Turbo).
  Occupancy only (no neighborhood motion gate). Cube scale follows **Size by age**
  via stamped `s` on each generation (along Z). Start = fill at age 0; Tail = gens
  to full size. Off = equal cubes. Display (`setEvents`); do not rerun
  `stabilityAge` on playhead or toggle. Count / MNI color the integer ramp
  only (no size-by-count). Oscillators encode as occupancy along Z, not extra
  hues. Default seed: R-pentomino, started paused; Size by age on.
- Paint only when Edit is on **and** focus is at the simulation head
  (not while viewing the tape).
- **Parallax** (`B`) is perspective (default on). Off is orthographic at the **current** look, not a forced top-down. Do not wire cube double-click isolation
  (deferred; later rectangle select). A CAD viewcube (desktop rail slot left of the View card, six face frames, product X/Y/Z: cornflower / maize / mint) **face click** is a 2D cut: that axis, ortho fitted to the slice rectangle, that plane's frame and grid only. Wheel zooms, right-drag pans, Shift+wheel pages. Same-face click pages the stack (no refit). Left-drag orbits out to 3D; zoom/pan stay in the cut. `B` also leaves. Hover lights a face; omit the cube on phone and in AR. Lighting is a **headlamp** (key/fill follow the view) on Quality Medium/High; Low is unlit. **Quality** Low / Medium / High is a View toggle (default Medium). `?src=` / `?quality=` is the public door (allow-list). Do not auto-switch from GPU strings. **Yaw** is AR-only (after place). The desktop View HUD heading collapses the telemetry. Scrub the **stack slider**
  (desktop: right, Now/max at top; phone: bottom, Now/max at right) or
  Shift+wheel. The stack axis is **Z time by default**; X or Y remaps the same
  playhead and slab grips onto that product axis (axis-colored in the volume).
  Sparse Conway/EVT X/Y keeps the full time brick and ghosts toward the
  clip grips. Dense count cubes (occupancy > 15 %) use the same mid-volume
  slab + enclosed cull + one-sided stack ghost as Z; Play walks that
  window on X, Y, or Z. Inspect
  has two extra **slab** handles per axis; outside the band is not drawn.
  **Decay** is off (later / opt-in Z/time fade; sparse stacks only). Clip
  handles push the playhead when dragged past it. Planes and cuts share
  the axis color. Hover a frame **edge** to light that ring and grab it
  (playhead inset, clips smaller; coincident clip hidden);
  HUD rails recede. Invisible fills are not grab targets. **Depth**
  is cube volume height (live wake). The RAM tape keeps the run from gen
  0 until cap; **Pause** inspects it (fog off, zoom-out stays lit). **Play** returns to
  live Now. Play is Source transport (Conway and time stacks; hidden for MNI);
  live Conway also steps the generator.
  Source **Stop when stable** (default on) pauses after five generations
  in a short cycle (period 1–15: stills and oscillators). Wrapping gliders
  keep running;
  a glider that walks off a hard edge becomes empty and then pauses (Wrap on
  for a perpetual ship).   **Fit** (`F`) frames the camera to the drawn slab (explicit);
  Inspect Z scrub then moves only the playhead plane (brick stays put). **Align to Z**
  (default on) orbits around the time axis without chasing Z clips;
  right-drag still slides along Z; off allows XY pan.
  Ortho always pans. Edit stays on the Z playfield (disabled on X/Y slices).
  Cube cap is a View number (default 200 000).
  Numbered X/Y overlay, hairlines, and cube hover outlines are off
  (units later). Grab the axis-colored frame edges in the volume
  (playhead full size, clips well inside; coincident clip hidden; ~28 px
  screen rim to grab; drag in screen space along the axis). Clip grab
  keeps Hull; playhead grab peeks Ghost (glass hull + solid plane; same
  for MRI and Ignition). **Cuts**
  is three orthogonal planes, no hull (shade id `triple`).
  **Reset Planes** (same row as Fit) opens clips and centers the three playheads; it does not run when toggling Cuts.
  Load / source change start on that pose.
  Playhead and clip bars scale with the brick span, not the cell.
  **Hide center** / **Hide outer** (under the viewcube on desktop)
  hide playhead+grid vs clip frames independently. A cut still shows the current plane.   Display HUD (FPS, AVG, 1%/0.1% lows,
  sparkline, INST, FOC) stays separate from Conway live overlay (GEN,
  LIVE, RATE) which appears only while Conway Play is on. HUD shows **ORTHO** when parallax is off.
  Opt-in **DEV Bench** (costs performance) sits on that same right HUD card.
  On a phone the HUD is an FPS chip (tap for the View card). There is no viewcube. FPS/sparkline use raw frame time; the 100 ms
  clamp is simulation catch-up only. The Z stack is a thin tick rail (bar
  + generation beside the handle), not a HUD card. Chrome is one left
  rail: **Source** (kind, Conway Pattern first, Random Fill) then **View**.
  Play / Loop, Speed, and loop axis X/Y/Z sit under the slice rails.
  Loop X/Y/Z (or grab a plane) highlights that playhead: Ghost solids it;
  Hull+Loop grows a potato from the axis origin through the plane.
  (Parallax, Align to Z, Quality, Depth, Gap, Color coding, Size by age, Cube cap, FPS on the fold).
  Do not put the generator in the View panel. Desktop is a stacked accordion, not two columns.
  Camera-only frames must not call `fillSoA`. Inspect Hull playhead
  must not either. Ghost / peek / Cuts rebuild only the solid plane
  (`fillPlaneSoA`, LRU + neighbor prefetch); the glass hull mesh stays.
  Clip uses the hull cache plus AABB faces, not a full occupancy scan.
  Size by age / Start / Tail must not call `fillSoA`.
  XR-A: feature-detect `immersive-ar` and hide **AR** if false.
  Servers send `Permissions-Policy: xr-spatial-tracking=(self)`.
  Visible volume lives on a `stage` group, then `stand` (which product
  axis sits on the table; phone overlay hides Stand, default Z), then
  `turntable` (yaw).
  Phone AR: enter is passthrough with no brick. **Search Anchor** arms
  floor hit-test (gold square on a horizontal floor plane); tap locks.
  Timeouts never lock; there is no viewer-front preview. **Reset Anchor**
  despawns and returns to search. Overlay taps on chrome are guarded so
  Reset does not immediately re-place; a tap on empty overlay /
  passthrough still places. If hit-test is missing, a tap after Search
  may lock a viewer-front pose.
  **Z** (overlay slider) lifts the brick off the floor (world-up).
  **Yaw** turns the pillar around product Z. **Size** (0.4×–2.5×) scales
  the brick. Desktop orbit does not yaw the volume. Lighting is a
  **headlamp** (key/fill follow the view in orbit and in AR walk) on
  Quality Medium/High. **Quality** is a View Low / Medium / High toggle.
  Stand-axis math stays in the renderer for Quest; the phone HUD does not
  offer X/Y/Z stand. Outer bound frames are forced off while phone AR
  runs and restored on Exit. Center / playhead frames still draw after
  spawn. Play grows the tape; clips crop in place. Same `setEvents`.
  Decay is off in AR. AR chrome on a phone is Search Anchor, then after
  spawn Play, Z, Size, Yaw, Reset Anchor, Exit on `#xr-overlay` (not
  `document.body` — that paints the page over passthrough). The overlay is
  0×0 in orbit so it does not cover the canvas; it goes fullscreen only in
  the AR session. On a headset,
  do not request `dom-overlay` (fullscreen overlay covers passthrough).
  There is no in-world Play/stand/Exit plate. Thumbstick yaws; both
  grips pinch Size. Grab a bounding frame to slide the volume in the room;
  poke a cube to isolate the standing plane. Quest: Exit AR and enter
  again to place on another plane. Phone orbit: fingers rotate
  and pinch-zoom; stack sliders move planes. XR-B marker, hand tracking, and wrist
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
  is Source → **Brain MRI** (`data/mni152_stack.npy`, native grid, enclosed
  voxels culled). Do not convert to a static surface. Do not build a
  DICOM / PACS / diagnostic workstation.
- Treating `CountVolume` as a generic scalar volume
- Dataset Contract / `ScalarVolume` / PointRenderer **before** a public
  preview (XR-C baseline and thin View first; see [`backlog.md`](../backlog.md))
- NPZ loaders; polarity / occupancy / states encodings
- Packed WOLKE `__selection__.npy` / `viewer_index` table sync / BLITZ widget sync
- DONNER backend; EVT3 decode in the browser
- WebXR marker origin / hand-attach / wrist HUD / QR spawn (XR-A
  hit-test, stick yaw, grip-pinch size, grab-frame room slide, and
  standing-plane poke are
  in; the XR-C-0 world plate is retired; XR-B marker, XR-C-1 hands, and a lab QR with `?src=` are later in
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

- Visitor README: [`README.md`](../README.md) — landing page, not a
  developer wiki. Local serve is in architecture.
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
