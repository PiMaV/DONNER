# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-31

### Added

- Source switch: **Conway** or an EVT **count stack** (`.npy` cube). Count is events per pixel per Δt; cubes sit where the count is > 0. Color is a discrete cyan → gold → coral ramp by integer count. **Play** scrubs Z through the recording; **Pause** inspects the brick. Demo file: `data/ignition_stack.npy` (symlink to the local EVT dataset) or **Load .npy**.
- XR-A session: WebXR `immersive-ar` with camera passthrough. The volume sits about 0.8 m in front of the viewer, world-locked at tabletop scale (32 cells ≈ 40 cm). **AR** is shown only when the device supports it; **Exit** returns to orbit. Plane hit-test is not in this slice.
- Phone AR URL `https://lab.ole.icu/` (Caddy LXC, Let’s Encrypt) reverse-proxies `npm run start:lan` on the laptop. `npm run start:https` (mkcert) stays the fallback when the LXC is down.

### Changed

- While an AR session is active, brand, View/Source sheets, and the FPS chip hide. Play and the Z stack stay. Bird-eye is not offered in AR.

### Fixed

- AR session showed the HUD but no camera or volume: the WebXR DOM overlay was `document.body`, so the opaque page background covered passthrough. Overlay is now Play / Z / Exit only (`#xr-overlay`), and `html` goes transparent in session.
- Phone Z-stack handles were too small to grab; hit targets are larger and the timeline does not steal the drag as a page scroll.
## [0.1.0] - 2026-08-31

### Added

- Conway 3D space-time explorer: static Three.js app with instanced cubes, generation history along the time axis, decay, play/pause/step, reset, random seed, torus wrap, touch orbit, cell painting while paused, and a performance HUD.
- Conway B3/S23 rules and seed patterns ported from BLITZ (`blitz/data/conway.py`).
- Explicit Edit mode (hover + tap to toggle cells; only on the Now plane).
- Focus scrub through stored history: plane stays at Y = 0, newer slices render as a transparent ghost, cyan playfield frame marks the current Z.
- Worldline color: gold still, cyan oscillator, BLITZ-red transit, gray warmup for generations 0–1 (decay affects brightness only).
- Cube fill encodes stability duration (cap 16 gens); Stability control is None / Time / Focus (not a checkbox).
- Grid-light slider for the cell lattice and focus-plane fill.
- Pattern read-hint under Pattern in the Source block (how to read Blinker vs Glider).
- Related-work link list (`docs/related.md`): Conway is the event generator, not the product; Wolfram 2025 highlighted as the internal Life reference; neighbouring CA links found while looking around — not a novelty or influence claim.
- Bird-eye view: orthographic camera looking down onto the **focus slice** (button **Bird**, key `B`).
- Isolation: dim the volume to one `(x, y)` worldline (double-click / double-tap a cube; Escape or the same cube again clears).
- **Z stack slider** beside the HUD cards: Now at the top, past at the bottom; thin tick rail; ends are **absolute** generations (oldest kept … Now). The Z stack is the only playhead (no Focus slider in the sheet).
- Numbered product X/Y on the right of the playfield; hover hairlines from the cell to both axes.
- Hovering the focus plane outlines the cell and, when live, the cube on that slice.
- Display HUD sparkline of recent frame times plus FPS / AVG / 1% / 0.1% / FR, kept apart from the Conway source block (GEN, LIVE, RATE). FPS uses raw frame time; the 100 ms clamp is simulation catch-up only.
- **Now** button on the Z stack; current time (`tFocus`) sits beside the handle.
- Cube color and fill come from `src/encoding.js` (Conway LUT today); the cube renderer does not import Conway dynamics.
- Local HTTPS for LAN phone tests: `npm run start:https` (mkcert). `certs/` is gitignored.
- Bench sheet: CPU path timers (sim / soa / inst / hover / render CPU / hud), WebGL/software-renderer probe with a SOFTWARE warning, Dynamics / Neighborhood / Stability / Encoding-minimal toggles, and presets Teaching / Desktop / CPU Stress / Renderer Stress.
- Everyday time control is **Depth** (cube wake). Live Z stack is that wake with absolute gens. Force full rebuild restores the old every-frame SoA path for A/B. Dragging Depth resizes the wake ring without resetting Conway.
- RAM **tape**: the viewer buffers Conway slices (cap 4096 gens or 400 000 cells). **Pause** inspects the tape (Z from 0). **Play** is Live View and jumps to Now.
- Bench `now` is this frame only (0 if that path did not run). Preset/reset clears rolling avg/max. `bound GPU fill` vs `bound CPU soa` when the wall-clock frame disagrees with CPU paths. Applying a preset starts Play.
- Neighborhood **none / 3×3 / 5×5** (default none). 5×5 is the CPU cliff. Dynamics and Stability stay on for teaching.
- **Stop when stable** in Source: Live View pauses into Inspect after five bitwise-unchanged **grids** (still life or empty). Oscillators and wrapping gliders keep running. A ship that leaves a hard edge becomes empty and then pauses — leave Wrap on for a perpetual glider. Default on, so a settled soup does not grow an endless Z tower.
- **Fit** (View, key `F`): frames the camera to the drawn brick (Inspect: between the gold cuts). After Fit, the cyan Z handle moves the plane through a still volume; the brick does not jump. Orbit rotates around the time axis through the brick center (browser).

### Changed

- Display FPS / AVG / sparkline use raw frame time. The 100 ms clamp applies only to simulation catch-up, so FPS no longer sticks at 10 on a slow GPU. Tab-hidden gaps longer than 1 s are skipped.
- Default seed is Blinker (period-2 along time); Stability defaults to Time. Pattern list starts with oscillators, then glider.
- Glider (and other translating activity) is classified as transit when Neighborhood is 3×3 or 5×5: centroid must stay put for still/osc. Default is occupancy only.
- Product axes are X/Y playfield and Z time. Time scrub is a right-hand stack slider, not a 3D gizmo on the coordinate frame.
- Control **History** is labeled **Depth** (live wake only). Decay is on/off (fade toward the oldest drawn slice). Live Z is locked; Pause inspects the RAM tape and draws the whole cache.
- Display vs source vs encoding is documented: DONNER is the viewer, Conway the addon, color/fill an encoding slot the addon fills.
- Control chrome is two left sheets: **View** (Bird, Decay, Depth, cache, Encoding, Bench) and **Source** (Conway). Phone: **View ▸** / **Source ▸**, not one mixed Controls fold.
- Play is a transport control outside the sheet (desktop under the Z rail; phone bottom center).
- On a phone the Z stack is a bottom timeline (Now at the right) and display telemetry collapses to an FPS chip (tap to expand the View card). Source stats stay in the Source sheet.
- Camera-only frames skip EventSoA rebuild and instance uploads. Live `fillSoA` fills the Depth wake. Inspect fills the whole tape so Z scrub does not pop cubes in at the Depth edge. Hover lookup runs only when the cell or focus changes.

### Fixed

- Inspect no longer clips cubes to Depth. Scrubbing Z through the cache keeps the whole brick; cubes do not pop in at the live-wake edge.
- Inspect turns **fog off** and lengthens the camera far clip so a zoomed-out paused stack stays lit. Live keeps fog (performance / wake).
- Z stack **slab**: two gold clip handles plus a larger cyan playhead. Dragging a gold clip past the playhead pushes it (and the other clip if needed). Outside the slab is not drawn. Isolation by double-click is deferred (later: rectangle select).
- Stop when stable compares a copy of the full grid before/after each step (not a live-cell count, not a missing `step()` return). A wrapping glider must not pause.
- Boot no longer dies if the Grid select is empty or HTML is stale (missing Fit checkbox): size falls back to 32, Conway clamps the board, Fit binds only when the button exists. Empty Pattern/Grid dropdowns and a missing playfield were the symptom.

### Removed

- Focus slider from the control sheet. Playhead is the Z stack (**Now** button there, plus Home / `[` / `]` / Shift+wheel).
- Extra past/ghost span readout under the Z stack. The rail is the bar, ticks, and the generation beside the handle.
- Extra buffer / Resident slider. The RAM tape is the keep-from-start path; live view is the Depth wake.
- Load-cache / Live buttons. Pause inspects the viewer tape; Play is Live View.
- Iso button and key `I`. Isolation is double-click on a cube, not an arming mode.
- Double-click / double-tap worldline isolation (deferred; later rectangle select).
