# DONNER

**WETTER** is a modular framework for structured processing, exploration, and
analysis of large experimental imaging datasets.

**Live overview:** [wetter.mess.engineering](https://wetter.mess.engineering)

**This repository** is **DONNER** — the space-time explorer beside **BLITZ**.
BLITZ inspects scientific matrices in 2D. DONNER explores the same class of
structured data as a 3D volume, with time as the third axis.

The core WETTER pipeline is unchanged:

```text
Raw Data → DAMPF → KEIM → WOLKE → BLITZ
```

DONNER is a parallel app, not a pipeline stage: **BLITZ & DONNER**.

---

## What it is

**DONNER** (Dynamic Observation and Navigation of Nonuniform Event
Representations) renders sparse space-time events in the browser.

| Source | Event |
|--------|--------|
| Conway (v1) | `x, y, generation, state` |
| Event camera (later) | `x, y, timestamp, polarity` |

Conway is the first demonstrator — deterministic, in-browser, no files.
The renderer does not know whether a point came from a cellular automaton
or a sensor.

> Images aren't just pixels — they are structured data.

DONNER extends that idea: **matrix → time series → space-time volume →
explorative 3D (later XR)**.

## Axes (X, Y, Z)

DONNER labels axes the scientific way. **X and Y are the playfield** (cell
or sensor). **Z is time** — the vertical stack. The focus plane is **Z = 0**:
past below, newer slices (ghost) above.

| Axis | Meaning | On screen |
|------|---------|-----------|
| **X** | playfield column | on the focus plane |
| **Y** | playfield row | on the focus plane |
| **Z** | time | vertical stack; **Z slider** (desktop: right, Now at top; phone: bottom, Now at the right) |

Three.js is Y-up internally. Product `(X, Y, Z)` is stored as world
`(X, Z, Y)`. UI, HUD, and docs always mean **product** X/Y/Z. Do not call
time “Y” in user-facing copy.

The numbered coordinate frame sits on the **right** of the volume (away from
the control sheet). Hovering the plane draws two thin lines from the cell
to the X and Y axes. Time is **not** a 3D gizmo on that frame: scrub with
the **Z stack slider**, like a 3D slicer through the generation stack
(desktop: Now at the top, past at the bottom; phone: Now at the right).
One tick per stored step.

## Run

Static files, no build step, no backend. ES modules need a local HTTP server
(opening `index.html` as `file://` will not load the import map).

```bash
cd DONNER
npm start
# same as: python3 -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

```bash
npm test    # unit tests (Node 18+)
```

### Phone on the LAN

`npm start` binds loopback only. For a phone on the same Wi-Fi, bind all
interfaces:

```bash
cd DONNER
npm run start:lan
# same as: python3 -m http.server 8765 --bind 0.0.0.0
```

```mermaid
flowchart LR
  desktop["Desktop python3 -m http.server"]
  bind["bind 0.0.0.0 port 8765"]
  phone["Phone browser on Wi-Fi"]
  desktop --> bind
  bind --> phone
```

Find the desktop LAN address, then open **http** (not https) on the phone.
Do not use `localhost` on the phone — that is the phone itself.

```bash
hostname -I
# or: ip -4 addr show
```

Example: `http://192.168.178.30:8765/`

Phone and desktop must be on the same WLAN. If the page does not load,
check the firewall for port 8765, or that the address still matches
`hostname -I` (it can change). Fonts load from `mess.engineering`; without
internet the app still runs, with system fonts.

## Stage 1 (this tree)

- B3/S23 Conway from BLITZ (rules, wrap, seeds)
- Default teaching seed: Blinker (glider is the XY-motion case)
- Instanced cubes, Window along the time axis (product **Z**)
- Decay, speed, Window length, play / pause / step / reset
- Playhead via the **Z stack** (desktop: beside the HUD, Now at top; phone: bottom timeline, Now at the right)
- Gold playfield frame; numbered X/Y on the right; hover hairlines, cell and cube outlines
- Bird-eye: orthographic top view of the focus plane
- Isolation: double-click a cube to keep one worldline
- Play / Pause outside the sheet (desktop under the Z rail; phone bottom center)
- Edit mode: tap cells inside the frame (Now only)
- Orbit / zoom / pan, including touch
- Display HUD (FPS, AVG, 1%/0.1% lows, sparkline, instances) separate from Conway source HUD (generation, live, rate); FPS uses raw frame time
- Layers: display engine vs Conway source vs encoding slot (see architecture.md)
- Control sheet grouped as View / Source / Encoding

**Not in v1:** Fibonacci, event-camera import, backend, streaming,
BLITZ sync, WebXR.

## Architecture

See [`architecture.md`](architecture.md), [`docs/gui.md`](docs/gui.md),
and [`docs/related.md`](docs/related.md) (Conway is the demonstrator;
DONNER is the event viewer. Links found while looking around, not
influences).

Three.js r180 is vendored under `vendor/three/` (MIT). DONNER is GPL-3.0,
same family as BLITZ.

## Author

Philipp Mattern
[M.E.S.S. – Mattern Engineering & Software Solutions](https://mess.engineering)
