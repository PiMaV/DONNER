# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-09-05

### Fixed

- Phone Face keeps the three plane sliders before head-lock (World AR still hides them until place).

## [1.0.0] - 2026-09-04

### Changed

- Paused orbit does less DOM and layout work: the viewcube CSS box is cached, the FPS chip follows the 0.4 s display tick, spark/stats paint only while the FPS card is open, and the headlamp skips a still camera. Quality Low hides unused lights.

## [0.16.0] - 2026-09-04

### Added

- **Spin** on the Look strip (next to Fit) turns the look around product Z. Independent of Loop; both can run. World AR after place drives Yaw. Hidden in Face.
- Public doors: bare URL is **Brain MRI Low** (Ghost). `?src=life` is Game of Life (Hull). `?src=ignition` is Lighter Ignition (Ghost). Bottom **Face** shows when a camera exists and Source is Brain MRI; `?face=1` enters. Face starts on the **Selfie camera** on phone and desktop. Laptop webcam is the doctor path.
- World AR **Tap to place** banner when the gold floor reticle is visible. While a floor is still being found, that banner reads **Searching for a surface…**. Face camera start reads **Initializing cameras…**, then the camera menu.
- Loaded example cubes (Brain MRI Low / High, Lighter Ignition) stay in a session RAM cache so switching Source does not re-download.

### Changed

- Layout tests lock IDs, order, and show/hide — not pixel CSS. Visual QA is `npm test` first; Chrome screenshots only when layout is the bug ([`architecture.md`](architecture.md) Tests and visual QA).
- Chrome splits **Look** (Hull / Ghost / Cuts / Fit / Spin top-right) from **View** setup (Quality, Gap, Parallax, Reset Planes, Color). Phone and AR share that Look strip; desktop keeps the viewcube under it. After place, AR **Loop** and Speed sit under the rails; **More** holds Hide, Reset Planes, and Quality.
- Compact brand: tagline is **Xplore Data in 3D & XR**. Guide sits beside it; both stay within the left-rail width.
- View numeric fields (Gap, Cube cap, Colormap, Min, Max, Trim, Hide below) put the label to the left of a wide control. Count **Scale** is now **Colormap**. **Hide below** is a spinner, not a slider. Quality **Low / Medium / High** sit in one row.
- FPS is a small overlay on the viewcube (bottom-right). Tap it for the spark / DEV Bench card, independent of the View sheet so you can change settings while reading telemetry. Stays on Face and phone AR (Quest has no DOM overlay).
- Footer **M.E.S.S.** and **WETTER** links are cyan; About and the version stay muted.
- Cube cap default is **200 000** again. Game of Life **Play** stays on that live envelope. **Pause** raises the cap to the tape’s occupied cells (288k cubes → 288k instances, no `trunc`). A dense count cube (Brain MRI) raises only to the **hull** instance count, not every occupied voxel. Sparse Ignition still uses occupied cells. Switching back to Game of Life Play drops to 200 000.
- Gap **0** packs cube faces (no inset). Brain MRI and loaded cubes start at **0.01**; Game of Life and Ignition start at **0.05**. Switching Source resets Gap. Gap is a wide spinner with the label to the left; hover-wheel on the field steps **0.01**. The range slider is gone.
- Bottom **AR** shows only when WebXR `immersive-ar` is available (larger on desktop). **Face** sits in the dock when a camera exists and Source is Brain MRI Low or High. In a Face session the dock is one **camera** dropdown (**Selfie camera** / **Rear camera**, labeled from the device) and **Exit** (no Face toggle). Camera start shows **Initializing cameras…**, then the picker. Orbit on a phone is **AR** (WebXR) + **Face** (Brain). Face starts on the selfie camera on phone and desktop. World AR still uses the back camera. Overlay: black pupil dots on circular blue retinas, no gaze cones. Face hides center and outer frames. Face does **not** show Size or Yaw. After world-AR place, Size and Yaw stack with Floor **X / Y / Z** beside them. AR **Loop** uses the same opaque chip fill as the dock. Phone Loop **X / Y / Z** sit beside Loop. Desktop keeps loop **X / Y / Z** under the rails, with **Loop** and Speed underneath. Exit AR or Face runs **Fit** so the brain is framed in orbit.
- Quality default is **High**. Cubes with more than 500k occupied cells drop to **Medium**. **Low** is only a manual pick. Phone Face no longer forces Low.
- Quality **High** is Lambert + ACES + fill at pixel ratio ≤ 1.25 (the previous Medium look). **Medium** is Lambert without ACES or fill at pixel ratio 1. The old High cap of 2 is gone.
- Game of Life **Play** uses the bottom-right Speed slider for generation rate; **Pause** returns that slider to Loop speed. Both rates are stored. Loop stays disabled while Play is live.
- Door plane chrome starts with **center and outer** frames on every source, including Game of Life. Phone and Face always show the three plane sliders at full brightness. Bottom dock buttons use an opaque background.
- **Lighter Ignition** loads with Y/Z **swapped** and **Z mirrored** (the file export is inverted; the `.npy` is not rewritten). Loop starts on **Y** and walks toward later time. Interactive Flip checkboxes are out — they reversed rail handles and did not change Loop order.

### Fixed

- Switching Source while projecting on a face leaves Face and restores orbit.
- Face lights the Z plane from below so the underside is not a black slab.
- Game of Life hitch from the 2 000 000 default GPU envelope (solid + ghost InstancedMesh plus SoA), leftover from the MRI cube-cap bump.
- Brain MRI High no longer sets Cube cap to ~5 M occupied cells. Hull is ~140k; the 5 M InstancedMesh envelope made inspect unusable. Manual 200 000 was already enough.
- Extra One-Euro on the Face brain stage is gone (it lagged the Ghost and cost frames). Overlay pose smoothing stays.
- Brain MRI Low / High Source copy drops “not a patient scan” and the ICBM “derived from” cite (license stays in About / `data/NOTICE.md`).
- Desktop Face is on the bottom dock, not buried in Source. Without WebXR there is no **AR** chip — only **Face** on Brain. World AR stays WebXR-only.

## [0.15.0] - 2026-09-04

### Changed

- Face AR after lock keeps a gold face oval, sky-blue iris rings, small black pupils, and red lips. The full mesh is lines-only while scanning. Overlay canvas caps at 640 px so the phone is not compositing 1280×720.

### Fixed

- Face AR keeps the last Face pose after lock until Recapture. A second Pose/hull tracker was too slow and wrong on a close-up phone face.

## [0.14.1] - 2026-09-04

### Fixed

- A viewcube cut keeps Hull / Ghost / Cuts: Hull is a glass potato plus the solid slice (thickness shimmers; Loop grows the potato), Ghost keeps the full silhouette, Cuts is that one plane. The camera still tracks the playhead.

## [0.14.0] - 2026-09-04

### Added

- **Face AR** (`?face=1`): phone back camera or desktop webcam tracks a head with MediaPipe and hangs a transparent Brain MRI Low overlay on that pose. Not WebXR; Quest is unchanged. Size plus Shift / Lift / Inset after lock; Recapture scans again.
- **Face lab** (`face-lab.html`): camera + landmark mesh only (no Three.js, no MRI). Use this to prove tracking before the DONNER overlay.
- Face AR **Front / Back** camera toggle (same as the lab page).
- Face AR **Flip L/R** mirrors the live planes on cameras that look at you (video + mesh + pose). Front camera turns it on; back camera leaves it off.
- Source **Brain MRI Low**: a 2× mean-binned ICBM 152 cube (`data/mni152_low_stack.npy`, ~3 MB) for demos and light tests. Visitor aliases `?src=brain` / `?src=mri` open Low.

### Changed

- Ingest preview: a taller-than-wide first plane rotates 90° so the gate can scale it to the full dialog width.
- The previous native Brain MRI cube is now **Brain MRI High** (id `mni152`, ~23 MB). High stays opt-in; Quality Low/Medium/High is still the renderer, not the MRI grid.
- Source **About Data** is a small muted caption next to the fold heading (it no longer inherits body size).
- Cube cap default is **2 000 000** (was 200 000). Ceiling is 20 000 000. Confirming **Load** on a `.npy` raises the cap to loaded cells + 1 000 000 when that is higher (10M cells → 11M), so a comfort-warned load is not silently truncated.
- Face AR default fit from the lab session: **Lift 141 mm**, **Inset 50 mm**, **Size 1.2**. Shift stays 0. Non-defaults still go into the URL.
- Face AR writes **Shift / Lift / Inset / Size** into the page URL when they differ from the defaults. Copy the address onto the phone (same host). The landmark mesh hides after lock.

### Fixed

- Face AR pinned MediaPipe Tasks Vision **0.10.21** (`vision_bundle.mjs`). **0.10.22** 404s on jsDelivr, so the session died right after the camera-permission preview.
- Face AR starts the camera first and keeps it live if the tracker or MRI load fails (the loading overlay no longer covers and then tears down the preview).
- Face AR keeps the camera at the origin when Brain MRI Low loads, so the ghost brick can sit on the tracked head instead of jumping into orbit.
- A viewcube cut under Hull shows the current slice (not an empty frame). Peek-on-handle is no longer required; Loop in the cut pages that plane.
- Loop / Shift+wheel / same-face page in a viewcube cut keep the plane on screen: the camera tracks the playhead along the cut axis. Zoom and in-plane pan stay. `B` still leaves the cut (it is not the same as Parallax off in 3D).

## [0.13.0] - 2026-09-03

### Added

- Count / MNI **Min / Max**, **Trim** (0% / 1% / 2%, default 1% of positive values), and **Hide**. Hide drops cubes below a value; dense volumes rebuild the hull so the surface shrinks, sparse clouds skip those cubes.
- Load a `.npy` count cube from Source → **Load NumPy** (file picker + ingest dialog) or by dropping onto the volume. Header-first gate shows shape, dtype, payload, and cell count. Comfort cap is about **500k** voxels (warn + recommend reduce, or analyze in BLITZ). Hard cap still refuses a huge native grid. Optional 2/4/8 binning skips axes shorter than the factor (a single Z plane still bins X/Y), uses **mean** or **max**, and shows a **Plasma** preview of the first output plane scaled to the dialog width.
- Opt-in **Guide** button to the right of the brand chip (Orbit, Source, Play vs Loop, Rails, Viewcube, Inspect, Look). Arrows point at the controls; Source and View unfold. Does not open on its own.
- Game of Life default boot runs **12** generations then stays paused, so the brick has depth on first look (no special URL).
- Phone AR inspect overlay after place: three stack rails, Loop, Hull / Ghost / Cuts, and Hide center / Hide outer (top-right, no viewcube).
- Phone Game of Life **Play / Pause** next to **AR** (orbit and AR overlay). Loop stays under the rails.

### Changed

- Count color uses the dataset max, not a 32-rung cap. The Scale maps the Min/Max window onto 256 LUT rungs. Legend ticks and HUD **MAX** show the real range.
- Backlog and living docs: the public host is already live. Own-data file drop is the first ingest path; Streamer stays hidden (no sidecar on GitHub Pages).
- Source no longer shows the always-on welcome paragraph. The one-line example blurb stays. **About Data** sits on the Source fold (next to the heading); footer **About** stays. **Guide** is Look.
- Own-cube load is a Source dropdown action (**Load NumPy**), not a Drop .npy control on Game of Life. Drag-and-drop onto the volume still works from any source.
- Game of Life Source chrome matches the other examples: kind, blurb, **Play**. Pattern, generator Speed, seed, and grid sit in a **Setup** fold.
- Phone AR searches for a floor as soon as the session starts (no Search Anchor). The brick sits on the plane; there is no Z-height slider.
- AR scale fits the table footprint (the two axes on the plane) to 40 cm. Play grows the standing axis up; it does not shrink the cells or drop gen 0 through the floor. Size is 0.4×–5× on that fit (table stays comfortable near 2.5×; floor can be larger).
- Phone AR uses the desktop inspect crop and named shade. Conway Play sits next to AR; Loop walks the marked axis.
- Phone stack rails stop short of the right edge so a thumb at max does not fire the system back-swipe.
- AR **Floor** X / Y / Z picks which product axis grows out of the plane. **Yaw** spins around that standing axis (floor normal).

### Fixed

- AR Play sat the live slice on the floor and refit scale to the growing Z edge, so the pillar shrank and sank. Gen 0 stays on the plane; new generations grow up.
- Phone overlay Play sat on top of Source / View. The fold bar keeps a center gap; AR + Play sit there.
- Phone orbit could fail to boot when Chrome cached `main.js` and `orbit.js` / `xr.js` out of sync after a hot edit. `phoneOrbitViewOffset` stays exported as a no-op, the module URL is cache-busted, and the LAN servers send `Cache-Control: no-store` for HTML/JS/CSS.

### Removed

- Phone AR **Search Anchor** button and **Z** height slider.

## [0.12.2] - 2026-09-02

### Added

- First live host: [https://donner.mess.engineering/](https://donner.mess.engineering/).

### Changed

- README points at the live URL and marks Game of Life as the live generator versus the static examples.

## [0.12.1] - 2026-09-02

### Changed

- README is a visitor landing page (hero screenshot, browser-only, AR/XR on Pixel 11 Pro and Quest 3). Local serve lives in `architecture.md`.

## [0.12.0] - 2026-09-02

### Added

- Visitor **About** (Source + footer) and per-example blurbs. Source labels: **Game of Life**, **Lighter Ignition**, **Brain MRI**.
- Example cubes in `data/` (Lighter Ignition ~4 MB, Brain MRI ~23 MB) with [`data/NOTICE.md`](data/NOTICE.md) (ICBM + NiiVue BSD-2-Clause). GitHub Pages workflow.
- Public door query: `?src=` (conway / ignition / mni152, plus aliases) and `?quality=`. Allow-list only; the address bar follows Source and Quality.

### Changed

- Desktop orbit hint is drag / scroll. Game of Life stays the default (no download). Live ingest stays hidden.
- View Quality default is **Medium** (public start). High is `?quality=high`.

## [0.11.0] - 2026-09-02

### Added

- Count / MNI **Scale**: DONNER (cyan → gold → coral), Gray, Inferno, Plasma, Turbo. Conway occupancy classes stay under Color coding.
- View **Quality** Low / Medium / High. Low is unlit cubes at pixel ratio 1. Medium is Lambert at 1.25. High is Lambert + ACES up to pixel ratio 2 (1.5 on phone / headset). Manual; no auto GPU class. Antialias stays whatever the WebGL context was created with.

### Changed

- Inspect Ghost / peek / Cuts no longer rewrite the glass hull on every playhead step. The hull InstancedMesh stays; only the solid cut is filled (plane-index LRU + neighbor prefetch). Ghost distance fade is a shader uniform. Full-volume prerender is not used (camera orbits).
- Gap slider max is **5**. Orbit zoom-out, camera far, and ortho min-zoom are sized for that limit so a wide gap still fits on screen.

## [0.10.0] - 2026-09-02

### Added

- Conway **Size by age** checkbox with **Start** (cube fill at age 0, down to a speck) and **Tail** (generations along Z until full). Start and Tail are two sliders because fill and length are different units.
- Opt-in **DEV Bench** on the right View HUD: CPU path timers and GPU probe stay off the hot path until checked. Not a tab, not on the left View sheet.
- Short **Loading…** spinner on the Source fold and a canvas overlay when switching source, Conway pattern/grid, or a count / MNI cube.

### Changed

- Inspect hint is one short line (`Grab a frame · clips crop · hold playhead to peek`). Fit / Reset Planes / Cuts stay on button titles.
- FPS stays on the collapsed View fold (left rail) and on the collapsed HUD View fold. Phone FPS chip is unchanged.
- DEV Bench readout sits in the HUD card with no inner scroll; the card grows.
- Loop **X / Y / Z** (and grabbing a plane) select the highlighted playhead. Ghost loops that plane. Hull+Loop grows a potato from the axis origin through the playhead and hides the +side plus clip edges.
- Inspect **Hull / Ghost** is the same for every source: idle hull (or ghost hull + solid plane), playhead drag peeks the cut through glass, release returns to hull. Dense MRI no longer collapses Ghost to a lone slice.
- **Source Play** (Conway only, with generation Speed) grows the tape. **View Loop** + axis X/Y/Z + loop Speed sit under the rails and walk that tape (or any volume). Two speeds, two jobs.
- Conway **GEN / LIVE / RATE** appear only in a live overlay while Conway Play is on — not in the Source sheet, not for Ignition / MNI.
- Axis playheads **catch at mid-volume** (same index as Reset Planes) with a short notch, then release.

### Removed

- **Full** (open clips, playhead stays). **Reset Planes** covers crop reset and centers the playheads.
- Conway Stability **Focus** and the None/Time/Focus dropdown. Size is the **Size by age** checkbox.
- **Now** button on the Z stack. Home still jumps Z to the live end for Conway edit.
- **Streamer** and **Load .npy** from the Source chrome (live ingest later; loaders stay in the tree). Count file / stream is not a Source option.

## [0.9.0] - 2026-09-02

### Added

- View **Gap** slider spaces voxels on the lattice (0 packs faces into a solid cube; higher values open air between cubes). Desktop frames, picking, and AR share that local pitch.
- AR **Reset Anchor** (phone overlay, next to Play / Exit): despawns the brick and returns to floor search. The gold reticle tracks the floor again; the first detected plane is not taken automatically.
- **Reset Planes** (View, next to Fit / Full): opens all clips to the full volume and moves the three playheads to the center. Does not move the camera. Does not run when switching shade.
- **Hide center** and **Hide outer** under the viewcube (desktop) independently hide the playhead / slice grid versus the outer clip frames. A viewcube cut still shows the current plane.
- Phone AR **Search Anchor**: enter AR is passthrough only (no brick). Press Search Anchor, then look at the **floor** until the gold square appears, then tap to spawn.
- Phone AR **Z** slider: height off the floor (world-up). **Size** still scales the brick; **Yaw** still turns it.
- Conway **Random** **Fill** slider (sparse ↔ dense occupancy) on the Source sheet. One Random pattern, not separate dense/sparse presets.

### Changed

- Chrome is one **Source / View** rail (desktop stacked accordion; phone the same two folds). No Bench tab, no Config tab. Color coding, Conway Stability, Cube cap, and a realtime FPS line live in **View**. Play/Pause and source stats (GEN / LIVE / RATE) live in **Source** for Conway and time-evolving stacks (AR overlay still has Play after spawn).
- **Dynamics** is labeled **Color coding** (View). Occupancy class colors still / oscillator / unsettled / base. MRI / MNI does not show Conway Play/Speed.
- Conway **stability** (`s`) is stamped per generation on the tape. None / Time / Focus is display (`setEvents`). Inspect playhead and those toggles no longer rerun `stabilityAge`. Count / MNI color the integer ramp only (no size-by-count).
- Occupancy cube fill is 1 (was 0.86) so **Gap** 0 is a packed volume. Conway Stability still scales by age.
- Phone orbit: one finger rotates and pinch zooms; playhead and clips move only on the stack sliders. Mouse still grabs a frame edge.
- Phone AR placement: no viewer-front preview on enter. **Search Anchor** arms floor hit-test; tap locks. **Reset Anchor** despawns and returns to search (no auto-respawn, no timeout lock). Horizontal floor only (walls ignored).
- Phone AR overlay hides **Stand** (kept in the renderer for Quest later). After spawn the overlay is Play, Z, Size, Yaw, Reset Anchor, Exit.
- Phone AR forces **Hide outer** / bound clip frames off for the session and restores the desktop setting on Exit. Center / playhead frames still draw after spawn. Quest bound frames stay (grab-to-slide).
- Quest AR no longer shows the in-world Play / stand / Exit plate (unreadable and out of reach). Thumbstick still yaws; both grips still pinch size. Grab a bounding frame to slide the volume in the room.
- Inspect shade **Triple** is labeled **Cuts** (three orthogonal slices, no hull). The shade id is still `triple`.
- The single **Planes** HUD toggle is **Hide center** and **Hide outer** (independent, viewcube only).

### Fixed

- Default Inspect pose matches **Reset Planes**: full clips and playheads at mid-volume, so the center plane is not parked on the outer max face. Conway Live still locks Z to Now. A 1-slice axis can still coincide with a clip.
- Phone orbit and AR: `#xr-overlay` no longer covers the WebGL canvas while orbiting (it was a full-viewport layer, so the canvas could be 0×0 or untouchable). Overlay tap-guard applies to chrome only, so a passthrough tap can still place the volume. Canvas size falls back to the visual viewport if layout reports 0×0.
- Phone Source / Conway: the pattern picker is at the top of the Conway block; an open sheet restores `pointer-events` on the ancestor so iOS can open native `<select>`s; fold sheets also apply in landscape on a coarse short viewport; the stack hides while a sheet is open so the list is not covered. The WebGL canvas is no longer CSS-transformed (blank composited layer on some phones).
- Quest Browser: do not request a fullscreen DOM overlay (it covers passthrough), fall back to `local` tracking if `local-floor` is missing, and use `XRWebGLLayer` instead of projection layers. The 2D panel skips the viewcube scissor and ignores a 0×0 first layout.
- Quest XR layer is full resolution again. The first recovery pass had halved the framebuffer and pinned pixel ratio to 1, which made the panel and passthrough look blocky.

### Removed

- **Decay** checkbox from View. Z/time fade stays off (later opt-in).
- **Hide center** / **Hide outer** checkboxes from the View sheet. The viewcube shortcuts remain.
- **Stability scaling** checkbox. Conway **Stability** None / Time / Focus is enough; count / MNI do not show that dropdown.
- **Size by count**. Event-camera counts use Color coding only; size stays Gap / Cube cap.
- Separate Source HUD card on the right rail. GEN / LIVE / RATE (and count T / SUM / MAX) sit in the Source fold.
- **Neighborhood** (none / 3×3 / 5×5 motion gate) from UI and runtime. Conway color is occupancy only.
- **Bench** sheet, CPU/GPU stress starters, Encoding-minimal / Force-full-rebuild toggles, and the bottom-right Play FAB. Path timers stay internal; GPU software still warns on the FPS chip. Do not put Bench on the rAF HUD.

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
