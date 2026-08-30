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
| **Z** | time | vertical stack; **right-hand slider** (Now at the top) |

Three.js is Y-up internally. Product `(X, Y, Z)` is stored as world
`(X, Z, Y)`. UI, HUD, and docs always mean **product** X/Y/Z. Do not call
time “Y” in user-facing copy.

The numbered coordinate frame sits on the **right** of the volume (away from
the control sheet). Hovering the plane draws two thin lines from the cell
to the X and Y axes. Time is **not** a 3D gizmo on that frame: scrub with
the **Z stack slider** on the right of the HUD, like a 3D slicer through
the generation stack (Now at the top, past at the bottom).

## Run

Static files, no build step, no backend. ES modules need a local HTTP server
(opening `index.html` as `file://` will not load the import map).

```bash
cd DONNER
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

```bash
npm test    # Conway + ring-buffer unit tests (Node 18+)
```

## Stage 1 (this tree)

- B3/S23 Conway from BLITZ (rules, wrap, seeds)
- Default teaching seed: Blinker (glider is the XY-motion case)
- Instanced cubes, Window along the time axis (product **Z**)
- Decay, speed, Window length, play / pause / step / reset
- Playhead via the **Z stack** on the right (**Now** button; time beside the handle)
- Gold playfield frame; numbered X/Y on the right; hover hairlines, cell and cube outlines
- Bird-eye: orthographic top view of the focus plane
- Isolation: one worldline lit, the rest of the volume dimmed
- Edit mode: tap cells inside the frame (Now only)
- Orbit / zoom / pan, including touch
- Display HUD (FPS, AVG, sparkline, instances) separate from Conway source HUD (generation, live, rate)
- Layers: display engine vs Conway source vs encoding slot (see architecture.md)

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
