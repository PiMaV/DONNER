# DONNER UI

The 3D volume is the product. Chrome is a thin M.E.S.S. HUD: Orbitron for
brand and control labels, Inter for running text, dark `#0b0f14` field,
gold `#ffc53d` accent, cyan `#00fff2` for live telemetry. No dashboard
layout.

```mermaid
flowchart LR
  orbit[Orbit / pinch / pan] --> scene[Volume]
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

Play is **Source** transport for Conway and time-evolving stacks (Ignition /
count). Conway loads **paused** (R-pentomino). Inspect first paint, Conway
pattern change, and source change use the **Reset Planes** pose: clips
open to the full volume, playheads at mid-volume (floor of half-span).
**Reset Planes** is then a no-op until a handle moves. Conway **Play**
still locks Z to Now (live generator). A 1-voxel-thick axis (Conway Z at
generation 0) can still sit on the outer clip. **Play** = Live View
(generator runs, Z locked at Now); for a count stack or **MNI 152** it
scrubs the **loop-axis playhead** (X / Y / Z under the rails, default Z —
not the viewcube / camera axis). **Pause** = Inspect the RAM tape
(Z from 0). **Pause** lights the brick (fog off, camera far fits the
tape). Three rails clip an **AABB** crop (outside not drawn). Conway Play
from Inspect jumps to live Now. MRI / MNI uses the same Play as a
slice-scan.

In an **AR session** Play stays on the overlay after the volume is
placed; brand, View/Source sheets, and the FPS chip hide. The viewcube
and Parallax are not offered. **Enter AR** is passthrough plus overlay
only — no brick, no viewer-front preview. Press **Search Anchor**, look
at the **floor** until a gold square sits on that plane, then **tap** to
spawn. Walls are ignored. The first detected plane is not taken
automatically, and a timeout does not lock. **Reset Anchor** (phone
overlay, next to Play / Exit) despawns the brick and returns to search
(reticle on; press Search again is not required). Scene tap is not used
for reset. Once locked, **Z** lifts the brick off the floor (world-up);
**Size** scales it; **Yaw** turns it on the floor. **Stand** is hidden on
the phone overlay (Quest may use stand later). Walk with the phone after
that. Outer **bound / clip frames** are forced off for the phone session
and restored on Exit; center / playhead frames still draw after spawn.
On a **phone** in orbit, fingers rotate and pinch-zoom; the stack
**sliders** move planes. On a **headset**, grab a frame edge to slide the
whole volume in the room. Point at a **cube** to isolate the standing
plane (Ghost); **Play** returns to the live volume. **Exit** (or Escape)
returns to orbit. On a **phone** the WebXR DOM overlay is `#xr-overlay`
(HUD chrome only, not a painted full-screen sheet), not `document.body`,
so the camera passthrough and the volume stay visible. Outside AR the
overlay is 0×0 so it does not cover the orbit canvas; it expands for the
session. Overlay tap-guard applies to buttons and sliders, not
passthrough taps. On a **headset** (Quest) do **not** request that
overlay — a fullscreen root covers passthrough. There is **no** in-world
Play/stand/Exit plate, so Quest has no Search / Reset Anchor button:
Exit AR and enter again to place on another plane. Thumbstick yaws;
squeeze both grips and move the hands apart or together to **Size**. Exit
with the headset / browser system gesture. Headset 2D Browser skips the
viewcube scissor; XR uses the native layer scale.

```mermaid
flowchart TB
  subgraph place [AR place]
    enter[Enter AR passthrough]
    search[Search Anchor]
    look[Look at the floor]
    tap[Tap gold reticle]
    lock[Spawn on floor pose]
    enter --> search --> look --> tap --> lock
  end
  subgraph turntable [Turntable]
    spin[Yaw around product Z]
    height[Z height off the floor]
    lock --> spin
    lock --> height
  end
  subgraph again [Place again]
    reset[Reset Anchor overlay]
    lock --> reset
    reset --> search
  end
  subgraph walk [Inspect]
    phone[Walk with phone]
    desk[Desktop: orbit plus headlamp not object yaw]
    spin --> phone
    spin --> desk
  end
```

```mermaid
flowchart LR
  search2[Search Anchor]
  look[Look at the floor]
  tap2[Tap gold square]
  lock2[Pose locked]
  reset2[Reset Anchor]
  height2[Z height off floor]
  yaw2[Yaw on the floor]
  play[Play grows time]
  poke[Poke a cube: standing plane]
  search2 --> look --> tap2 --> lock2 --> yaw2 --> play
  lock2 --> height2
  lock2 --> poke
  lock2 --> reset2 --> search2
```

The left chrome is one rail — **Source** on top (kind, Conway pattern
including Random + Fill) and **View** below (Parallax, Align to Z, Quality,
Gap, Depth live-only, cache, shade, Color coding, Size by age, Cube
cap, realtime FPS). **DEV Bench** lives on the right View HUD (costs
performance; off until checked). **Play / Loop**, **Speed**, and loop axis **X / Y / Z**
sit under the slice rails, not in Source. Conway **GEN / LIVE / RATE**
only while Conway Play is on. Generator controls do not share a panel
with View. Desktop stacks both folds; collapse Source after setup and
live in View. Phone uses the same two folds (bottom bar, one sheet at a
time). A short **Loading…** spinner (Source fold + canvas overlay) runs
while a source, pattern, grid, or cube is switching.

```mermaid
flowchart TB
  subgraph view [View display]
    bird[Parallax]
    align[Align to Z]
    fit[Fit slab]
    win[Depth live Gap Quality shade Hull Ghost Cuts Cache]
    color[Color coding]
    stab[Size by age]
    cap[Cube cap]
    fps[Realtime FPS]
  end
  subgraph hud [Right View HUD]
    telemetry[FPS AVG spark]
    bench[DEV Bench opt-in]
  end
  subgraph source [Source]
    kind[Game of Life Lighter Brain MRI]
    conway[Pattern Fill Seed Stop-stable]
    load[Loading spinner]
  end
  subgraph rails [Slice rails]
    play[Play Loop Speed]
    axes[Loop X Y Z]
    gen[Conway live GEN overlay]
  end
  view --> volume[Volume]
  hud --> volume
  play --> volume
  source --> volume
  kind --> conway
  kind --> load
  axes --> play
```

```mermaid
flowchart TB
  subgraph rail [Left rail]
    srcFold[Source fold config]
    viewFold[View fold inspect plus color]
    srcFold --> viewFold
  end
  subgraph desktop [Desktop]
    srcD[Source fold]
    viewD[View fold]
    volD[Volume]
    hudD[View HUD]
    zD[Z vertical max at top]
    srcD --> volD
    viewD --> volD
    hudD --> zD
  end
  subgraph phone [Phone]
    volP[Volume]
    zP[Z horizontal max at right]
    barP[Source and View folds]
    chipP[FPS chip]
    volP --> zP
    zP --> barP
  end
  subgraph ar [AR session]
    pass[Passthrough]
    searchA[Search Anchor]
    ret[Gold square on the floor]
    volA[Tap to spawn volume]
    resetA[Reset Anchor overlay]
    phoneChrome[Phone DOM overlay]
    questGrab[Quest grab frame slides volume]
    pass --> searchA
    searchA --> ret
    ret --> volA
    volA --> resetA
    resetA --> searchA
    volA --> phoneChrome
    volA --> questGrab
  end
```

Isolation is not a sheet mode. Worldline isolation is deferred (later:
rectangle select on the playfield).

## Camera

| Input | Action |
|-------|--------|
| Drag / one-finger | Orbit. On a phone this does **not** grab playhead/clip frames — those move on the stack sliders. |
| Shift+left-drag | Walk the **key light** around product Z. The volume stays put. Polar still orbits. |
| Wheel / pinch | Zoom. **Shift+wheel** pages the **active** axis (3D and viewcube cut). |
| Right-drag / two-finger | Pan. **Align to Z** keeps XY on the time axis and still slides along Z. Off = free XY pan. In a viewcube cut, pan stays in that plane. |
| **Slice stack** | Three rails (X / Y / Z). Playhead plus two clips per rail in Inspect. Crop is the AABB intersection. A viewcube face uses that axis for the 2D cut. Dense count: full-extent clips, hull cull against the AABB. After **Fit**, the brick stays put; X/Y **and Z** playheads move through it. Desktop: three vertical rails, max at the top of Z. Phone: three horizontal tracks. Wheel over a rail steps that playhead. Live: Z only. AR: Z only. **Loop** walks the highlighted plane (rail **X / Y / Z** or grab a frame). Ghost solids that plane. Hull+Loop grows from the axis origin through the playhead (potato) and hides the +side and clip edges. Cuts already shows three slices. |
| Space | Play / pause |
| `E` | Edit mode (pauses, snaps focus to Now; Z slice only) |
| `B` | Toggle **Parallax** (perspective ↔ orthographic, same look) |
| `F` | **Fit** — frame the camera to the drawn slab |
| Escape | Restore parallax; in AR, end the session |
| Viewcube | Desktop: click a product-axis **face**. Enters a fitted 2D ortho cut; wheel zooms, right-drag pans, Shift+wheel pages. Clicking the **same face** pages the stack (no refit, no jump to 3D). **Left-drag** orbits out to 3D. **B** also leaves. **Hide center** / **Hide outer** under the cube hide playhead+grid vs clip frames; a cut still shows the current plane. Collapse View via the heading. Hidden on phone and in AR. |
| **AR** | Start `immersive-ar` when the device supports it (Android Chrome / Quest). Phone: passthrough first (no brick). **Search Anchor**, look at the **floor**, tap the gold square to spawn. The first plane is not auto-locked. **Reset Anchor** despawns and returns to search. **Z** lifts off the floor; **Size** scales; **Yaw** turns. **Stand** is hidden on the phone overlay. Outer bound frames are off for the session. Quest: grab a frame to slide the volume; stick yaws; both grips pinch size; no in-world menu (Exit AR to place again). Not shown on desktop orbit. |
| **Exit** | End the AR session; orbit returns. Visible in AR only. |
| **Search Anchor** | AR overlay only (phone): arm floor hit-test. The gold reticle appears on horizontal floor planes. Does not spawn until you tap. |
| **Reset Anchor** | AR overlay only (phone): despawn the brick and return to search. Does not steal a scene tap. Hidden until a pose is locked. |
| `.` or `N` | Simulation step |
| `[` / `↓` | Focus one generation into the past |
| `]` / `↑` | Focus toward Now |
| Home | Jump Z playhead to the live end (Conway edit). Reset Planes / sliders / gizmo still set the slice. |
| `R` | Reset |

## Display (DONNER)

| Control | Meaning |
|---------|---------|
| Play / Pause | Conway **Source** only: run the generator. Pause inspects the tape. Key Space on Conway. AR overlay Play still maps here. |
| Loop | Under the slice rails. Walks the marked axis through the volume (or Conway tape after Pause). Independent of Source Play. Key Space on MNI / Ignition. |
| Loop axis | **X / Y / Z** directly under the three rails (default **Z**). Independent of the viewcube / camera. |
| Loop Speed | Same cluster as Loop, under the rails (slices/s). |
| Color coding | Conway occupancy class colors (still / oscillator / unsettled / base). Off: one occupancy color. Count / MNI: **Scale** (DONNER / Gray / Inferno / Plasma / Turbo); no second size mapping. |
| Stability | Conway only. **Size by age** (default on): cubes grow with still/osc run length. **Start** is cube fill at age 0 (down to a speck). **Tail** is generations along Z until full. Two sliders — fill vs length. Hidden for MNI and other sources with no stability metric. |
| Parallax | Default on = perspective. Off = orthographic at the current look (keeps the slab). Key `B`. Viewcube face is a separate 2D cut. |
| Align to Z | Default on = orbit around the time axis (XY pinned). Right-drag still slides along Z. Off = free pan. Off while a viewcube cut is locked. Z scrub does not move the orbit height. |
| Headlamp | Automatic: key/fill follow the view (orbit and AR walk). No slider. A visible sun is later. |
| Yaw | AR overlay only (after spawn): turn the pillar on the floor, then walk. |
| Z | AR overlay only (after spawn): height off the floor (world-up). Does not pan X/Y. |
| Size | AR overlay only (after spawn): uniform scale of the brick. |
| Reset Anchor | AR overlay only (phone, next to Play / Exit): despawn and search again on the floor. |
| Search Anchor | AR overlay only (phone): start floor hit-test. Enter AR does not search until this press. |
| Fit | Frame the camera to the drawn brick (Inspect: between the clip cuts). Key `F`. The only automatic reframe. |
| Reset Planes | Open all clips to the full volume and move the X/Y/Z playheads to mid-volume. Same pose as first paint / source change. Does not move the camera. Does not run when switching shade. |
| Hide center | Viewcube (desktop): hide the playhead (now) frames and the slice grid on the current plane. Independent of Hide outer. A viewcube cut still shows that plane. |
| Hide outer | Viewcube (desktop): hide the outer clip / bound frames of the crop box (Inspect). Independent of Hide center. Phone AR forces these off for the session and restores this setting on Exit. |
| Gap | Visual lattice spacing (0–5 cube-widths, default **0**). 0 packs voxel faces (solid MRI cube). Higher values move instances apart; Conway can live-tune. Frames and picking follow that pitch. Orbit zoom-out is sized for Gap **5**, so you can still frame the brick. AR uses the same local layout (Size still maps cube edge, so a large Gap grows the brick on the table). Size by age still scales cubes inside each cell. |
| Quality | Manual **Low / Medium / High** (default **Medium**). Low: unlit cubes, pixel ratio 1. Medium: Lambert headlamp, pixel ratio ≤ 1.25. High: Lambert + ACES, pixel ratio ≤ 2 (≤ 1.5 on phone / headset). `?quality=` on the door. Does not recreate the WebGL context (antialias stays). Auto-pick from Bench metrics is later. |
| Shade | Inspect: **Hull** (default, outer AABB solid; grab a playhead to peek; **Loop** grows a potato from the axis origin through the playhead and hides the +side plus clip edges), **Ghost** (glass hull + the highlighted plane — Loop X/Y/Z or grab a frame selects it), **Cuts** (three orthogonal slices only, no hull; shade id `triple`). |
| Depth | Live wake only (8–128). Hidden while Inspect. |
| Cache | Viewer RAM tape status (View sheet). Pause inspects it. Caps 4096 gens / 400 000 cells. |
| Cube cap | View instance envelope (default 200 000). Newest slices kept on overflow (`trunc`). |
| FPS | Realtime frame rate. Stays on the View fold when that sheet is collapsed (desktop analog of the phone FPS chip). The HUD View fold shows a compact FPS when collapsed; the expanded HUD already lists FPS/AVG/1%. Phone chip unchanged. |
| DEV Bench | Opt-in checkbox on the **right** View HUD (not the left View sheet). CPU path timers (sim / soa / inst / rend / hud) and GPU probe. Labelled DEV; costs performance. Off the hot path until checked. Phone: tap the FPS chip to open the same card. |
| **Slice stack** | Live Z: locked, label **LIVE**. Inspect: three rails, playheads, AABB clips. Dragging a clip handle past the playhead pushes it. Z matches X/Y: the volume stays put. |

```mermaid
flowchart LR
  xyz[Loop X Y or Z]
  grab[Grab a plane]
  axis[Highlighted playhead]
  xyz --> axis
  grab --> axis
  axis --> ghost[Ghost: that plane solid]
  axis --> hull[Hull loop: potato origin to plane]
  axis --> cuts[Cuts: three slices, loop walks one]
```

```mermaid
flowchart LR
  lost[Lost in the volume]
  fit[Fit: camera only]
  planes[Reset Planes: clips open, playheads centered]
  lost --> fit
  lost --> planes
```

## Source

| Control | Meaning |
|---------|---------|
| Source | **Game of Life**, **Lighter Ignition**, **Brain MRI** (ids `conway` / `ignition` / `mni152`). Count file / stream is later live ingest, hidden. Each example has a one-line blurb. **About** is the visitor note (Source + footer). Door: `?src=ignition` / `?src=mni152` / `?src=conway` (allow-list; aliases `lighter`, `brain`). |
| Play / Speed | Conway only: generator and generations/s. Not the View loop. |
| Loading | Short spinner on the Source fold and a canvas overlay while a source, pattern, grid, or cube is switching. |

```mermaid
flowchart LR
  pick[Loop X Y or Z]
  play[Play]
  pause[Pause]
  pick --> play
  play --> scan[Advance playhead wrap in clips]
  pause --> stop[Playhead stays]
```

### Conway addon

| Control | Meaning |
|---------|---------|
| Pattern | BLITZ seeds; first control in the Conway block. Gosper gun needs grid ≥ 48. **Random** shows a **Fill** slider (sparse ↔ dense). |
| Step | One generation (also pauses) |
| Edit | Paint cells on the focus plane (only at Now) |
| Reset | Same pattern and seed |
| Seed | New RNG seed, then reset |
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

Curated demos **Lighter Ignition** and **Brain MRI** are Source options.
**Load .npy** and the WOLKE **Stream** / Connect chrome are later live
ingest (hidden; loaders stay in the tree). See [`backlog.md`](../backlog.md)
Live later. Visitor copy: [`docs/welcome.md`](welcome.md).

```mermaid
flowchart LR
  life[Game of Life]
  light[Lighter Ignition]
  brain[Brain MRI]
  life --> brick[3D brick]
  light --> brick
  brain --> brick
```

Count stacks open in Inspect (the recording is already complete). **Play**
walks the marked loop axis (default Z) from oldest to Now and wraps
inside the inspect clips. Color is the **Scale** ramp (default DONNER:
1 = cyan … max = coral). Empty pixels (count 0) are not cubes.

## Color coding (View)

Color and cube fill are display. Conway supplies still / osc / unsettled /
base (Moving remains a LUT slot when Color coding is off). A count stack
supplies integer rungs; **Scale** picks DONNER / Gray / Inferno / Plasma /
Turbo. Size stays Gap / Cube cap. Polarity is later. Source stats stay in
**Source**.

| Control | Meaning |
|---------|---------|
| Color coding | On: occupancy class colors. Off: one occupancy color. Conway only. |
| Scale | Count / MNI integer ramp. DONNER is cyan → gold → coral. Gray / Inferno / Plasma / Turbo are the usual scientific palettes. |
| Stability | Conway **Size by age**. Off: equal cubes. On: **Start** fill at age 0, **Tail** gens along Z to full size. Hidden for MNI / count. |

The **axis-colored frames** are the three slice planes (X `#5b8cff`, Y
`#e8c547`, Z `#3ecf8e`). Inspect also draws **clip rings** on all three
axes at the AABB cuts. Playhead rings sit slightly inside the box; clips
sit further in so they do not share a side with a playhead. Playhead bars are thicker
and brighter than clips. A clip on the playhead index is hidden. Hover a
**frame edge** (about 28 px rim, **move** cursor) to light that whole ring
and drag it along the axis in screen space; the fill is not a hit target. Three
HUD rails stay as a dimmer second path (max at the top of Z). **Hide
center** hides playhead frames and the slice grid; **Hide outer** hides
clip / bound frames. Both live under the viewcube on desktop. Default is
both visible. A viewcube cut still shows the
current plane. Crop is
the intersection of the three clip windows. **Hull** (default) draws the
outer hull solid; grab a **playhead** edge (or the rail) to peek the cut
through a glass hull — same for Ignition and MRI. Grab a **clip**
edge and the volume stays hull so you can stake the crop. **Loop** in Hull
grows a potato: hull from the axis origin through the playhead, current
plane as the cut, +side and clip edges hidden. **Ghost** is
the glass hull plus the **highlighted** plane (Loop X/Y/Z or grab a frame
picks that plane). Scrubbing that plane keeps the glass mesh; only the
solid cut is rebuilt. **Cuts** is three orthogonal
slices only, no hull. Both persist in the View sheet. **Decay** is off
(later / opt-in Z/time fade on sparse stacks). The CAD viewcube (desktop,
left of the View card) enters a
fitted 2D cut with **that plane's frame and grid**; wheel zooms, right-drag
pans, Shift+wheel pages; the **same face** pages the stack; a click on
the cut does nothing; **B** restores the volume. Zoom and pan stay in the cut.

```mermaid
flowchart TB
  subgraph idle [Inspect idle]
    aabb[AABB from three clip windows]
    hull[Outer hull solid]
    planes[Three axis planes]
    aabb --> hull
    aabb --> planes
  end
  subgraph play [Grab playhead]
    ghost[AABB as ghost]
    cut[Active plane solid]
    ghost --> cut
  end
  subgraph clip [Grab clip]
    full[Full hull]
    stake[Stake the crop]
    full --> stake
  end
  idle -->|playhead| play
  idle -->|clip| clip
  play -->|release| idle
  clip -->|release| idle
```

Live: slices newer than the focus sit **above**
the plane, translucent.

**Parallax** off is orthographic at the current look (no vanishing point)
and still shows the slab. Click a **face** of the viewcube (desktop; hover
lights the frame) to enter a 2D **cut** on that axis: ortho, one plane,
that plane's frame and cell grid, wheel zooms, Shift+wheel pages the stack. A click on the cut does
nothing. **B** restores the volume; zoom and pan stay in the cut.

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
  now[Max live end at top]
  hi[Gold clip toward max]
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

On narrow viewports **Source ▸** and **View ▸** are separate folds (same
IA as desktop). Play / Loop sits under the slice rails, not a FAB and not
in Source. The same fold sheets apply in landscape on a phone
(coarse pointer, short viewport) so Source does not jump into a third
layout. The Z stack is a bottom timeline, and telemetry
collapses to an **FPS chip** (tap to open the View card). Conway GEN /
LIVE / RATE appear only while Conway Play is on. Conway **Pattern** is the first
control in that block; **Random** shows **Fill**. While a sheet is open the stack hides so the
picker is not covered.

```mermaid
flowchart LR
  subgraph toggles [Viewcube]
    hc[Hide center]
    ho[Hide outer]
  end
  hc -->|hides| playhead[Playhead frames and slice grid]
  ho -->|hides| clips[Clip / bound frames]
  playhead -.->|viewcube cut still shows| cut[Current plane]
```

## HUD (right rail)

Desktop: one View telemetry card, then a thin Z stack to its right. Play /
Loop, Speed, and loop axis sit under the rails, above the footer. Conway
live stats (GEN / LIVE / RATE) pop in only while Conway Play is on.
Click **View ▾** on the display card to collapse the stats; a compact FPS
stays on that fold. The View sheet fold on the left rail also keeps FPS
when collapsed. Display is cyan.
Phone: FPS chip top-right; tap to expand the View card. No viewcube.

| Line | Block |
|------|-------|
| sparkline | Display — recent frame times (60 fps reference line) |
| FPS / AVG / 1% / 0.1% / FR | Display — instant, rolling average, slowest-percent FPS, frame time |
| INST | Display — instanced cubes (`trunc` if SoA capped) |
| FOC | Display — playhead generation (also beside the Z-stack handle) |
| PLAY / PAUSE | Display |
| ORTHO | Display — parallax off |
| GEN | Conway live overlay — simulation head (only while Play) |
| LIVE | Conway live overlay — live cells on the focus slice |
| RATE | Conway live overlay — generations/s while playing |
| EDIT | Conway live overlay — present in edit mode |

**Slice stack:** three rails — max at the top of Z, a tick per stored
step, label beside the handle. Desktop: max at the top. Phone: three
tracks, max at the right. Wheel over a rail (or Shift+wheel on the canvas)
scrubs the **active** inspect axis. **Play** on a volume walks the
**loop** axis (Source X/Y/Z), which can differ from the viewcube.

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
| Moving | BLITZ coral | LUT slot when Color coding is off; occupancy no longer tags translating ships |
| Unsettled | violet | soup, births/deaths that are not yet still or periodic |
| Base | gray | gens 0–1, and the first cube of each `(x, y)` worldline |

```mermaid
flowchart TD
  live[Live cell at t]
  live --> wu{t less than 2 or first live on this xy}
  wu -->|yes| base[Base gray]
  wu -->|no| prev{Live at t-1}
  prev -->|yes| still[Still gold]
  prev -->|no| per{Occupancy period 2 to 15}
  per -->|yes| osc[Oscillator cyan]
  per -->|no| unset[Unsettled violet]
```

Default pattern is **R-pentomino**, started **paused** (Play to run).
Teaching order if you switch seeds: Blinker → Toad/Beacon → Glider.
A glider reads as gold/cyan occupancy on the cells it crosses.

Decay is off (later / opt-in). When on it only darkens older **Z** slices;
it does not change hue or cube size.
**Size / fill** (Conway) reads stamped stability along Z. **Size by age**
on: **Start** is cube fill at age 0; **Tail** is gens along Z to full size.
Off: equal cubes. Count / MNI keep occupancy size; color carries
the integer ramp. Size sliders do not rebuild the tape.

Moving and Unsettled stay at Start. Base cubes
stay full size so the first slices are not a false “shrink”.

These classes fill the Conway demonstrator. A
count stack uses a different LUT: **Scale** (DONNER / Gray / Inferno /
Plasma / Turbo). Polarity (and occupancy / states) will not reuse
still/osc/unsettled.

The gold **frame** is the playfield edge. The cell lattice sits on the
**active** cyan plane.

## Later

- **Public preview (Phase 2):** Live at
  [`https://donner.mess.engineering/`](https://donner.mess.engineering/).
  Do not start Dataset Contract or a PointRenderer on that host.
- **Source off the rail:** later, the Source fold leaves the viewer chrome;
  generator is its own surface.
- **Thin View:** teaching View keeps Parallax / Align to Z / Quality / Gap / Depth (and maybe
  cache). Dense Encoding can still slim further.
- **Isolation later:** rectangle select on the playfield (not cube double-click). AR poke already isolates the standing plane. Numbered axes with units come back later; the overlay is off.
- Polarity / occupancy / states encodings (count rungs are in)
- NPZ, packed WOLKE selection / `viewer_index`, BLITZ widget sync, in-browser EVT3
- **Live ingest later:** Streamer + Load NumPy (hidden from Source chrome now)
- **MRI / scalar volume later.** Dense count `.npy` (occupancy > 15 %)
  already opens a mid-volume slab with enclosed voxels hidden. Dedicated
  kind + `ScalarVolume` wait on the Dataset Contract. Do not embed
  NiiVue. Volume texture / raymarch later if that slab is not enough.
  See [`architecture.md`](../architecture.md#mri-volume-later).
- **XR-A is in** (phone ceiling): WebXR `immersive-ar` passthrough.
  Enter AR shows no brick. **Search Anchor** starts floor hit-test (gold
  reticle on a horizontal floor plane; tap to spawn). **Reset Anchor**
  despawns and returns to search. No auto-lock, no timeout, no
  viewer-front preview. **Z** lifts off the floor; **Size** scales;
  **Yaw** turns. **Stand** is hidden on the phone overlay. Outer bound
  frames are off for the session; center / playhead frames still draw
  after spawn. **AR** only if `navigator.xr` supports it. Phone chrome
  after spawn is Play, Z, Size, Yaw, Reset Anchor, Exit on `#xr-overlay`.
  Phone HTTPS is `https://lab.ole.icu/` (`start:lan` upstream); mkcert is
  fallback. After a Chrome update, check site **Augmented reality** (not
  blocked) and that the response has
  `Permissions-Policy: xr-spatial-tracking=(self)`.
- **XR-C-0 is in:** Quest uses the same session but **without** `dom-overlay`
  and **without** the in-world Play/stand/Exit plate. Stick yaws; both grips
  pinch size. Grab a bounding frame to slide the volume in the room.
  Bounding frames stay on; poke a cube to isolate the
  standing plane. **URL door query is in** (`?src=` / `?quality=`). QR
  print, path `/ignition`, and AR-from-QR stay later. Do not start a points renderer
  in the same slice as further XR work.
