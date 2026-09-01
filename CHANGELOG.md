# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2026-09-01

### Added

- **XR-C-0** Quest: after the volume locks, a **Play / stand X·Y·Z / Exit** plate parks at eye height (it does not follow the growing pillar). Thumbstick yaws; squeeze both grips and move the hands apart or together to scale. Phone AR still uses the DOM overlay (including **Stand**); the 3D plate stays off when `dom-overlay` is `screen`.
- AR **stand axis**: the chosen product plane is the table. Default is Z (time up). X or Y tips the volume so that face sits on the table; the AABB still rests on the anchor.
- AR **bounding frames**: after lock, the three playhead rings stay visible so you can walk the volume. Controller (or phone tap) grab moves that plane; clips appear once you are inspecting.
- AR **voxel poke**: pointing at a cube isolates the **standing** plane (Ghost). Play returns to the live pillar. This is not worldline isolation.
- Source dropdown: **Ignition** and **MNI 152** (native-grid T1 hull) sit next to Conway. The MNI cube is a local symlink, not a git blob.
- **Full** (next to Fit) resets the three clip planes to the full volume. The playhead stays.

### Changed

- Brand expansion is **Dimensional Observation & Navigation: N-dimensional Exploration & Rendering**. Positioning: browser-native scientific 3D/XR explorer for structured data, not primarily an event viewer. Conway stays the demo-shell generator.
- Viewcube: clicking the **same face** you are already looking at pages the cut like Shift+wheel. It does not refit to the default ortho or jump back to 3D.
- Conway encoding: gray is **Base** (gens 0–1 and the first cube of each worldline), not Warmup.
- Inspect **Triple** is three cut planes only (no ghost hull). **Ghost** on a dense count cube (MNI) is the active cut only; sparse Conway / Ignition still draw a ghost hull.
- Playhead and clip rings scale with the brick span, not the cell size, so MNI and Ignition frames stay readable.

### Fixed

- AR (phone and Quest): the volume appears in front of the viewer immediately. A table hit still re-places; if no plane shows up, the pose locks after a short wait. A thrown HUD or pose update no longer kills the WebXR animation loop. The viewcube scissor is cleared before an XR render.
- Inspect **Hull** playhead no longer rebuilds EventSoA. Dense count volumes cache hull indices at load; a clip crop uses that cache plus the AABB faces instead of scanning ~5.4M occupied voxels.

## [0.7.0] - 2026-09-01

### Added

- **Planes** toggle under the viewcube (default on). Off hides the 3D playhead and clip frames and the slice grid in orbit. A viewcube cut still shows the current plane.

### Changed

- Grabbing a **clip** ring keeps the crop as Hull so you can stake the box. Grabbing a **playhead** still peeks Ghost while Hull is selected. Frame hover uses the **move** cursor, not a crosshair.
- Inspect **Z** matches X/Y: Now stays at world Y = 0, the playhead walks the stack, and Align to Z no longer recenters the camera when you scrub Z or drag the Z clips. **Fit** is the only reframe. **Align to Z** still allows right-drag (and two-finger pan) along Z; XY stays pinned.
- Product axes share one color language in the gizmo, the volume, and the rails: X cornflower `#5b8cff`, Y maize `#e8c547`, Z mint `#3ecf8e`. Playhead rings match the true plane; clip rings sit well inside so they do not share a side. Playhead bars are thicker and brighter. Grab uses a ~28 px screen rim around each edge. A clip that sits on the playhead is hidden.
- Viewcube **face** is a fitted 2D ortho cut of that plane: that plane's frame and cell grid only. Wheel zooms, right-drag pans in the plane, **Shift+wheel** pages the stack. Left-drag orbits out to 3D; pan/zoom stay in the cut. **B** also leaves.

### Fixed

- Dragging an X or Y plane no longer jumps far after a millimetre of mouse, especially with a tall Z stack. The grab follows the axis in screen space and ignores grazing views.

### Removed

- Numbered X/Y overlay, hover hairlines, cell/cube outlines, and isolate-beacon picking (edit-era chrome). Numbered axes with units return later.

## [0.6.0] - 2026-09-01

### Added

- Conway **Unsettled** (violet): chaos and one-shot births, separate from coral **Moving** glider tubes.
- Inspect **AABB crop**: three HUD rails (X / Y / Z) and three cyan planes. Gold clips are the intersection. **Hull** (default) draws the outer hull; hold a handle or plane to peek as ghost. **Ghost** and **Triple** persist in View. Dense MRI gold starts at full extent; Play steps the active playhead.

### Changed

- **Stop when stable** pauses after five generations in a short board cycle (period 1–15): stills **and** oscillators. Wrapping gliders keep running. Transit is gone; the legend is Still / Oscillator / Moving / Unsettled / Warmup. Oscillators along Z may have period 2–15, not only blinkers.
- **Decay** defaults off. The checkbox stays for the old Z fade.
- Viewcube **face** enters an ortho **cut** on that product axis (one playhead plane, no ghosts). **Orbit** past ~15° (or **B**) restores perspective and the slab. The stack sliders do not leave the cut.
- The Grid light slider is gone. The cell lattice sits on the active cyan plane.
- Lighting is a **headlamp**: key and fill follow the view (desktop orbit and AR walk). The View Light slider and Shift-drag azimuth are gone. AR **Yaw** after place (slider / swipe, then walk) is unchanged. A visible sun gizmo is later.

## [0.5.0] - 2026-09-01

### Added

- **Yaw** (AR): after the pose locks, overlay Yaw or a horizontal swipe turns the pillar on the table around product Z; gen 0 stays put. Then walk with the phone.
- **Light** (desktop orbit): View slider or Shift-drag walks the key/fill around product Z. The volume stays put, so Lambert shading changes without looking like a second orbit. Hemisphere stays sky-up. Not used in AR.

## [0.4.0] - 2026-09-01

### Added

- Count **Stream**: WOLKE-contract viewer (Socket.IO notify + HTTP GET `.npy`) so the EVT sidecar can push a 3D count cube into the existing adapter. Defaults `http://127.0.0.1:5055` / token `evt`. The cube GET goes through same-origin `/stream-npy` on the DONNER static server so Chrome Local Network Access / CORS cannot hide a sidecar download that already logged.
- CAD viewcube (**desktop orbit only**, not phone or AR): product X/Y/Z, rotates with the camera, click a face to snap that view.
- Slice-axis control on the stack (X / Y / Z). Default stays Z (time). Gold slab grips work on the chosen axis; Play still owns time.
- Bench **Cube cap** (default 200 000, up to 4 000 000) so the instance envelope is a setting, not a hard constant.

### Changed

- **Bird** is now **Parallax** (default on = perspective). Off is orthographic at the current look, not a forced top-down 2D viewer. `B` / Escape toggle it. HUD shows `ORTHO` when off.
- **Align to Z** (default on) keeps orbit on the time axis at the brick center. Off allows free pan (XY translation). Ortho always pans.
- CAD viewcube sits **left of the View card** in a rail slot (144 px, sharp at HiDPI), not under Now / the Z stack. Desktop View HUD collapses via the **View** heading. Hidden on phone.
- LAN / HTTPS servers send `Permissions-Policy: xr-spatial-tracking=(self)` so Android Chrome can still offer WebXR AR after a browser update.
- X/Y slice: cubes are solid on the cyan plane, ghost toward the gold grips, and vanish at the cuts (Z still hard-clips the time window in the SoA).
- **Decay** stays a Z/time fade (oldest drawn → dark). It does not drive the X/Y proximity fade.
- Dense count cubes (occupancy above 15 %, e.g. the local MNI T1) open on a mid-volume **slab** (~8 slices) on Z, X, or Y, skip voxels enclosed inside that window, and turn Decay off. **Play** walks the window. Ghost-to-gold X/Y fade stays for sparse stacks only.

### Fixed

- LAN HTTP/HTTPS servers no longer dump a traceback when a client drops the connection mid-request.

## [0.3.0] - 2026-08-31

### Added

- XR-A table tap: plane hit-test with a gold playfield reticle. Tap places the volume on the table (tabletop scale) and **locks** the pose for the session. If the device has no hit-test, the volume still sits in front of the viewer.

### Changed

- In AR the volume is a **pillar** whose oldest slice (gen 0 / tape start) stays on the table. **Play** grows that tape **up** from the table (it does not drop the live wake through the surface). **Pause** and the Z slab clip a segment in place. Decay is off. A **Size** slider (0.4×–2.5×) scales the whole pillar.
- Default Conway seed is **R-pentomino**, started **paused** (no autoplay).

### Fixed

- After the first AR table tap, Z-handle and overlay taps re-fired WebXR `select` and jumped the volume to the gold square. The table pose now stays locked for the session. The Z slab no longer re-sits the visible chunk on the table.

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
