# DONNER UI

The 3D volume is the product. Chrome is a thin M.E.S.S. HUD: Orbitron for
brand and control labels, Inter for running text, dark `#0b0f14` field,
gold `#ffc53d` accent, cyan `#00fff2` for live telemetry. No dashboard
layout.

```mermaid
flowchart LR
  orbit[Orbit / pinch / pan] --> scene[Volume]
  light[Light / Shift-drag] --> scene
  play[Play Pause] --> scene
  step[Step] --> sim[Conway]
  sim --> scene
  scrub[Three rails / Shift+wheel] --> plane[Active plane]
  plane --> scene
  edit[Edit mode] --> paint[Tap cell inside frame]
  paint --> sim
  gizmo[CAD viewcube] --> cut[Ortho cut]
  cut --> scene
  para[Parallax] --> scene
```

Play is a **display** transport outside the sheets. Conway loads **paused**
(R-pentomino). **Play** = Live View (generator runs, Z locked at Now);
for a count stack it scrubs the **active playhead**. **Pause** = Inspect
the RAM tape (Z from 0). **Pause** lights the brick (fog off, camera far
fits the tape). Three rails clip an **AABB** crop (outside not drawn).
Conway Play from Inspect jumps to live Now.

In an **AR session** the same Play and Z stack stay; brand, View/Source
sheets, and the FPS chip hide. The viewcube and Parallax are not offered. Point at a table
until a gold square appears, then **tap** to place. The pose **locks**
for the session (Z and Size do not move the origin). **Yaw** then turns
the pillar on the table (product Z; swipe on passthrough or the overlay
slider). Walk with the phone after that. The volume is a
**pillar**: gen 0 stays on the table; **Play** grows the tape upward;
Z clips a segment in place; **Size** scales the whole stack. **Exit**
(or Escape) returns to orbit. The WebXR DOM
overlay is `#xr-overlay` (HUD only), not `document.body`, so the camera
passthrough and the volume stay visible.

```mermaid
flowchart TB
  subgraph place [AR place]
    tap[Tap gold reticle]
    lock[Position and scale lock]
    tap --> lock
  end
  subgraph turntable [Turntable]
    spin[Yaw around product Z]
    lock --> spin
  end
  subgraph walk [Inspect]
    phone[Walk with phone]
    desk[Desktop: Light slider not object yaw]
    spin --> phone
    spin --> desk
  end
```

```mermaid
flowchart LR
  look[Look at table]
  tap2[Tap gold square]
  lock2[Pose locked at 0]
  yaw2[Yaw on the table]
  play[Play grows the tape up]
  clip[Z clips a segment in place]
  look --> tap2 --> lock2 --> yaw2 --> play
  lock2 --> clip
```

The left chrome is two sheets — **View** (Parallax, Align to Z, Light, Decay, Depth live-only,
cache, Encoding, Bench) and **Source** (kind: Conway or count stack;
GEN/LIVE/RATE or T/LIVE/SUM stay on the right HUD). Generator controls do
not share a panel with View.

```mermaid
flowchart TB
  subgraph view [View display]
    bird[Parallax]
    align[Align to Z]
    light[Light azimuth]
    fit[Fit slab]
    win[Depth live Decay GridLight Cache]
    enc[Encoding]
    bench[Bench]
  end
  subgraph source [Source slot]
    kind[Conway or Count]
    gen[GEN LIVE RATE or T LIVE SUM]
    conway[Pattern Seed Speed Stop-stable]
    npy[npy file ignition demo]
    stream[WOLKE stream]
  end
  play[Play transport]
  view --> volume[Volume]
  play --> volume
  source --> volume
  kind --> conway
  kind --> npy
  npy --> stream
```

```mermaid
flowchart TB
  subgraph desktop [Desktop]
    viewD[View sheet]
    srcD[Source sheet]
    volD[Volume]
    hudD[View plus Source HUD]
    zD[Z vertical Now at top]
    playD[Play under Z rail]
    viewD --> volD
    srcD --> volD
    hudD --> zD
    zD --> playD
  end
  subgraph phone [Phone]
    volP[Volume]
    zP[Z horizontal Now at right]
    barP[View and Source folds plus Play center]
    chipP[FPS chip]
    volP --> zP
    zP --> barP
  end
  subgraph ar [AR session]
    pass[Passthrough]
    ret[Gold square on table]
    volA[Tap to place volume]
    chrome[Play Z Exit]
    pass --> ret
    ret --> volA
    volA --> chrome
  end
```

Isolation is not a sheet mode. Worldline isolation is deferred (later:
rectangle select on the playfield).

## Camera

| Input | Action |
|-------|--------|
| Drag / one-finger | Orbit |
| Shift+left-drag | Walk the **key light** around product Z. The volume stays put. Polar still orbits. |
| Wheel / pinch | Zoom |
| Right-drag / two-finger | Pan when **Parallax** is off, or when **Align to Z** is off. Align to Z (default) rotates around the time axis at the brick center. |
| Shift+wheel | Scrub the **active** axis |
| **Slice stack** | Three rails (X / Y / Z). Cyan playhead plus two gold clips per rail in Inspect. Crop is the AABB intersection. A viewcube face uses that axis for the 2D cut. Dense count: full-extent gold, hull cull against the AABB. After **Fit**, the brick stays put and the cyan plane moves. Desktop: three vertical rails, Now on Z at top. Phone: three horizontal tracks. Wheel over a rail steps that playhead. Live: Z only. AR: Z only. |
| Space | Play / pause |
| `E` | Edit mode (pauses, snaps focus to Now; Z slice only) |
| `B` | Toggle **Parallax** (perspective ↔ orthographic, same look) |
| `F` | **Fit** — frame the camera to the drawn slab |
| Escape | Restore parallax; in AR, end the session |
| Viewcube | Desktop: click a product-axis **face** (144 px slot left of the View card; hover lights the frame). Collapse View via the heading. Hidden on phone and in AR. |
| **AR** | Start `immersive-ar` when the device supports it (Android Chrome). Look at a table; tap the gold square to place. Pose locks. **Yaw** orients the pillar; then walk. **Play** grows from gen 0; Z clips a segment; **Size** scales it. Not shown on desktop orbit. |
| **Exit** | End the AR session; orbit returns. Visible in AR only. |
| `.` or `N` | Simulation step |
| `[` / `↓` | Focus one generation into the past |
| `]` / `↑` | Focus toward Now |
| Home | Focus Now |
| `R` | Reset |

## Display (DONNER)

| Control | Meaning |
|---------|---------|
| Play / Pause | **Play** = Live View (generator + Now). **Pause** = Inspect: whole cache as cubes; after **Fit**, the plane moves through a still brick. Play jumps to live Now. |
| Parallax | Default on = perspective. Off = orthographic at the current look (keeps the slab). Key `B`. Viewcube face is a separate 2D cut. |
| Align to Z | Default on = orbit around the time axis. Off = free pan. Off while a viewcube cut is locked. |
| Light | Desktop: azimuth of the key/fill around product Z. Volume stays put (Lambert changes). View slider or Shift-drag. Off in AR. |
| Yaw | AR overlay only: turn the pillar on the table after place, then walk. |
| Fit | Frame the camera to the drawn brick (Inspect: between the gold cuts). Key `F`. |
| Decay | Default **off**. On: fade to 0 at the oldest **drawn** Z slice (live: back of Depth; inspect: back of the time window). Off: even along time. Ghost hull uses proximity along the active plane, not Decay. |
| Shade | Inspect: **Hull** (default, outer AABB solid; hold a handle/plane to peek as ghost), **Ghost** (volume ghost, active plane solid), **Triple** (three cuts solid, hull ghost). |
| Depth | Live wake only (8–128). Hidden while Inspect. |
| Cache | Viewer RAM tape status (View sheet). Pause inspects it. Caps 4096 gens / 400 000 cells. |
| Cube cap | Bench instance envelope (default 200 000). Newest slices kept on overflow (`trunc`). |
| **Slice stack** | Live Z: locked, label **LIVE**. Inspect: three rails, cyan playheads, gold AABB clips. Dragging a gold handle past the playhead pushes it. **Now** snaps Z to the high end of the rail. |

## Source

| Control | Meaning |
|---------|---------|
| Source | **Conway** or **Count stack** |
| Speed | Conway: generations/s. Count: playhead steps/s while Play scrubs the **active** axis |

### Conway addon

| Control | Meaning |
|---------|---------|
| Step | One generation (also pauses) |
| Edit | Paint cells on the focus plane (only at Now) |
| Reset | Same pattern and seed |
| Seed | New RNG seed, then reset |
| Pattern | BLITZ seeds; Gosper gun needs grid ≥ 48 |
| Grid | 16…64; rebuilds the world |
| Wrap | Torus vs hard edges |
| Stop when stable | Pause into Inspect after 5 generations in a short cycle (period 1–15): stills and oscillators. Wrapping gliders keep running. A glider on a hard edge dies, then the empty board pauses — leave Wrap on. Default on. |

```mermaid
flowchart LR
  step[Conway step]
  step --> cyc{Grid equals a stored grid p 1 to 15}
  cyc -->|no| reset[Reset streak]
  cyc -->|yes| hold[Streak plus 1]
  hold --> five{Streak is 5}
  five -->|yes| inspect[Pause into Inspect]
```

### Count stack (EVT)

| Control | Meaning |
|---------|---------|
| Ignition demo | Load `data/ignition_stack.npy` (local symlink into `datasets/EVT/`) |
| Load .npy | Any EVT count cube `(T, H, W)` or `(T, H, W, 1)`; ON/OFF `(T, H, W, 2)` is summed to activity. Local MRI preview: `../datasets/MRT/mni152_stack.npy` (dense; full-extent AABB hull + hidden enclosed cubes; see architecture *MRI volume*) |
| Stream | WOLKE contract. Default `http://127.0.0.1:5055` / token `evt` (EVT sidecar). Connect listens for `send_file_message`; the cube GET is same-origin `/stream-npy` (DONNER’s static server pulls the sidecar). Send as **counts**. Restart `npm start` / `start:lan` so the proxy exists. `https://lab.ole.icu` works when Caddy reverse-proxies that laptop server. |
| Token | Sidecar / WOLKE token (sidecar default `evt`) |
| Connect | Toggle the Socket.IO viewer. A new send replaces the cube. 2D/RGB is rejected with a hint; the previous volume stays. |
| Size by count | Encoding: cube scale follows the integer count. Off: occupancy (color only) |

Count stacks open in Inspect (the recording is already complete). **Play**
scrubs the cyan plane from oldest to Now and loops. Color is 1 = cyan …
max = coral. Empty pixels (count 0) are not cubes.

## Encoding (slot)

Color and cube fill are display slots. Conway supplies still / osc /
moving / unsettled / warmup and Stability **None / Time / Focus**. A count stack
supplies integer rungs (cyan → gold → coral) and optional size-by-count.
Polarity is later. The sheet **Encoding** block is that slot; source
stats stay in **Source**.

| Control | Meaning |
|---------|---------|
| Stability | **None** — equal cube size (occupancy). **Time** (default) — fill = stability already reached at that generation. **Focus** — fill = stability on the focus plane, whole column. Hover the control for details. |

The **cyan frames** are the three slice planes. The **active** plane is
full (fill + cell grid); the other two are hinted. Inspect also draws
**gold rings** on the active axis at the AABB cuts. Three HUD rails
(Now/max at the top of Z). Crop is the intersection of the three gold
windows. **Hull** (default) draws the outer hull solid; grab a handle or
plane to peek as ghost. **Ghost** / **Triple** persist in the View sheet.
**Decay** stays a Z/time fade on sparse stacks. The CAD viewcube
(desktop, left of the View card) is navigation, not a grabber.

```mermaid
flowchart TB
  subgraph idle [Inspect idle]
    aabb[AABB from three gold windows]
    hull[Outer hull solid]
    planes[Three cyan planes]
    aabb --> hull
    aabb --> planes
  end
  subgraph drag [Hold handle or plane]
    ghost[AABB as ghost]
    cut[Active plane solid]
    ghost --> cut
  end
  idle -->|grab Hull| drag
  drag -->|release| idle
```

Hovering the Z plane draws two thin lines to X and Y,
a gold square on the cell, and a pale cage around the cube on that
slice when the cell is live. Live: slices newer than the focus sit **above**
the plane, translucent.

**Parallax** off is orthographic at the current look (no vanishing point)
and still shows the slab. Click a **face** of the viewcube (desktop; hover
lights the frame) to enter a 2D **cut** on that axis: ortho, one plane,
stack slider walks it. Orbit off the axis (or `B`) restores the volume.

```mermaid
flowchart TB
  face[Viewcube face]
  lock[planeLock]
  ortho[Parallax off]
  one[one playhead plane]
  orbit[Orbit off axis]
  volume[3D slab]
  face --> lock --> ortho --> one
  orbit --> volume
```

Worldline **isolation** is
deferred (later: rectangle select). Edit stays on the Z playfield at Now.

Inspect **Z slab** (3D-slicer):

```mermaid
flowchart TB
  now[Now top]
  hi[Gold clip toward Now]
  foc[Cyan playhead]
  lo[Gold clip toward past]
  past[Oldest bottom]
  now --> hi
  hi --> foc
  foc --> lo
  lo --> past
  foc --> plane[Cyan focus ring]
  hi --> hideHi[Above slab masked]
  lo --> hideLo[Below slab masked]
  hi --> ringHi[Gold cut ring]
  lo --> ringLo[Gold cut ring]
```

Inspect **X/Y slab** (same gold grips):

```mermaid
flowchart TB
  cyan[Cyan playhead]
  sparse[Sparse: ghost toward gold]
  dense[Dense count: same as Z]
  gone[Gold grips: not drawn]
  cyan --> sparse --> gone
  cyan --> dense --> gone
```

On narrow viewports **View ▸** and **Source ▸** are separate folds (Play
stays bottom-center). The Z stack is a bottom timeline, and telemetry
collapses to an **FPS chip** (tap to open the View card). Source GEN /
LIVE / RATE stay in the Source sheet.

## HUD (right rail)

Desktop: two cards, then a thin Z stack to their right, Play under the
stack. Click **View ▾** on the display card to collapse the stats.
Display is cyan; source is muted. Phone: FPS chip top-right; tap
to expand the View card. Source stats live in the Source sheet. No viewcube.

| Line | Block |
|------|-------|
| sparkline | Display — recent frame times (60 fps reference line) |
| FPS / AVG / 1% / 0.1% / FR | Display — instant, rolling average, slowest-percent FPS, frame time |
| INST | Display — instanced cubes (`trunc` if SoA capped) |
| FOC | Display — playhead generation (also beside the Z-stack handle) |
| PLAY / PAUSE | Display |
| ORTHO | Display — parallax off |
| GEN | Source Conway — simulation head |
| T | Source count — bin index |
| LIVE | Source — live cells / voxels on the focus slice |
| SUM | Source count — event sum on the focus slice |
| MAX | Source count — count ceiling (color ramp top) |
| RATE | Source — measured generation or playhead rate while playing |
| COUNT | Source — count stack is active |
| EDIT | Source Conway — present in edit mode |

**Slice stack:** three rails — **Now** on Z, a tick per stored step, label
beside the handle. Desktop: Now/max at the top. Phone: three tracks,
Now/max at the right. Wheel over a rail (or Shift+wheel on the canvas)
scrubs the **active** axis.

If INST hits the cap (`trunc`), live: lower Depth or Grid; inspect: the
tape is denser than the 200 000-cube envelope (newest slices kept). RATE is
not frame rate. FPS, 1%/0.1% lows, and the sparkline are wall-clock
frame times; they are not clamped to 10. **1%** / **0.1%** are the mean
FPS of the slowest 1% / 0.1% of the last ~1000 frames — hitch, not AVG.

## Visual mapping

**Geometry** is time (**Z**). **Color** is dynamics along each `(x, y)` worldline,
not a second clock. An oscillator does **not** cycle hue along Z; it
cycles **occupancy** (cubes present / absent). Mixing extra hues would
fight the class colors.

| Kind | Color | Typical Conway |
|------|-------|----------------|
| Still | gold | block, beehive, blinker core (always on) — activity stays put |
| Oscillator | cyan | blinker tips, toad, beacon, longer-period occupancy — **only when live**, in place |
| Moving | BLITZ coral | glider tube — Neighborhood 3×3/5×5; translating activity |
| Unsettled | violet | soup, births/deaths that are not yet still or periodic |
| Warmup | gray | generations 0 and 1 — too little history to class |

```mermaid
flowchart TD
  live[Live cell at t]
  live --> wu{t less than 2}
  wu -->|yes| warmup[Warmup gray]
  wu -->|no| mot{Neighborhood centroid translated}
  mot -->|yes| moving[Moving coral]
  mot -->|no| prev{Live at t-1}
  prev -->|yes| still[Still gold]
  prev -->|no| per{Occupancy period 2 to 15}
  per -->|yes| osc[Oscillator cyan]
  per -->|no| unset[Unsettled violet]
```

Default pattern is **R-pentomino**, started **paused** (Play to run).
Teaching order if you switch seeds: Blinker → Toad/Beacon → Glider.
A glider must read as a coral trail, not mixed cyan/gold: those
classes mean the pattern sat still. Cyan on a glider was a false friend
(the ship crawling over the same cell).

Decay only darkens older **Z** slices; it does not change hue or cube size.
**Size / fill** depends on **Stability**:

- **None** — every live cell the same size (truth view for occupancy)
- **Time** (default) — duration already reached at that generation (taper)
- **Focus** — duration on the focus plane, whole `(x, y)` column

Cap is 16 generations. Moving and Unsettled stay smaller in Time/Focus. Warmup cubes
stay full size so the first slices are not a false “shrink”.

These classes fill the **encoding slot** for the Conway demonstrator. A
count stack uses a different LUT: integer rungs cyan → gold → coral.
Polarity (and occupancy / states) will not reuse still/osc/moving/unsettled.

The gold **frame** is the playfield edge. The cell lattice sits on the
**active** cyan plane.

## Bench

Open the **View** sheet and scroll to **Bench**. Each preset has a one-line purpose.
**Teaching** / **Desktop** are the demo loads. **CPU Stress** is dense soup
(expect INST to fill Depth). **Renderer Stress** is cubes/GPU (should stay
smooth). **Neighborhood 5×5** is the CPU cliff; default is **None**.
Dynamics and Stability stay on for teaching. **Depth** (View) is cube
height. Live Z is locked; **Pause** inspects the cache (fog off, Z slab).
Depth is hidden until Play.
Preset select rebuilds the world and **starts Play**. **Force full
rebuild** is the old every-frame SoA path for A/B. Path table `now` is
this frame (0 if skipped); avg/max reset on preset. `bound GPU fill`
means the canvas/cubes are the limit. `rend` is CPU time inside
`renderer.render`, not GPU. GPU block shows WebGL2 and **SOFTWARE
RENDERING** for llvmpipe / SwiftShader / Basic Render Driver. Phone:
Bench stays in the sheet, not on the FPS chip.

## Later

- **Source off the rail:** Conway HUD (GEN / LIVE / RATE) and the left
  Source sheet leave the viewer chrome; generator is its own surface.
- **Thin View:** teaching View keeps Parallax / Align to Z / Light / Decay / Depth (and maybe
  cache). Bench, GPU strings, Neighborhood, presets, and dense Encoding
  leave the everyday sheet.
- **Isolation later:** rectangle select on the playfield (not cube double-click).
- Polarity / occupancy / states encodings (count rungs are in)
- NPZ, packed WOLKE selection / `viewer_index`, BLITZ widget sync, in-browser EVT3
- **MRI source kind** (not in the Source sheet). Dense count `.npy`
  (occupancy > 15 %) already opens a mid-volume slab with enclosed
  voxels hidden. Do not embed NiiVue. Volume texture / raymarch later
  if that slab is not enough. See [`architecture.md`](../architecture.md#mri-volume-later).
- **XR-A is in:** WebXR `immersive-ar` passthrough and plane hit-test
  (gold reticle, tap a table to place; pose locks; Z clips a segment in
  the pillar). **AR** only if `navigator.xr` supports it. Chrome is
  Play, Z, Size, Yaw, Exit. Phone HTTPS is
  `https://lab.ole.icu/` (`start:lan` upstream); mkcert is fallback.
  After a Chrome update, check site **Augmented reality** (not blocked)
  and that the response has `Permissions-Policy: xr-spatial-tracking=(self)`.
  **Next:** XR-B marker, then XR-C Quest 3. Do not start a points
  renderer in the same slice as further XR work.
