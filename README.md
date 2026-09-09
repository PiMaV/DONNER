# DONNER

**Explore structured data in 3D and XR.**

A browser tab is the app. Same page on laptop, phone, and headset.

| Surface | What you get |
|---|---|
| **Online Demo** | Try it in the browser — curated cubes, AR / Face, Load or drop `.npy` |
| **Local Viewer** | Full product download — stream from sidecars, own data, no Python |

**Online Demo:** [https://donner.mess.engineering/](https://donner.mess.engineering/)

**Local Viewer:** [GitHub Releases](https://github.com/PiMaV/DONNER/releases) — `DONNER.exe` (Windows) or `DONNER-linux-x86_64` (Linux: `chmod +x`, then run). Opens your browser. Full features: stream, own data, no Python.

AR and XR tested on **Pixel 11 Pro** and **Quest 3**.

![DONNER — Game of Life as a 3D volume](docs/Screen_Conway.png)

> Explore in DONNER. Analyze in BLITZ.

DONNER is the 3D/XR explorer in **[WETTER](https://wetter.mess.engineering)**.
BLITZ is the 2D analysis sibling. They share datasets, not a GUI.

## Open the Online Demo

Examples in Source, on the left.

- **Brain MRI Low** — static example T1 atlas, 2× binned (visitor default, Ghost, center and outer frames). Bottom **AR** uses the laptop webcam or a phone camera.
- **Brain MRI High** — the same atlas at native grid (Ghost).
- **Lighter Ignition** — static event-camera counts of a lighter strike (Ghost).
- **Game of Life** — *live generator.* Each cube is a living cell. Z is
  generations (Hull, outer box on).

Drag to orbit. Scroll to zoom. Drop a `.npy` count cube onto the volume.
On a phone, pinch. On Quest, grab the volume in the room.

Sidecar **Stream / Connect** is not on the Online Demo. Use the Local Viewer
(or `npm start` while developing) to push cubes from EVT / WOLKE.

## Develop

```bash
npm start             # Local Viewer chrome on loopback (+ /stream-npy)
npm run start:demo    # Online Demo chrome on LAN (lab.ole.icu / phone)
npm run start:lan     # Local Viewer chrome on LAN
npm run start:viewer  # Go host from repo root
npm test
```

Architecture and surfaces: [`architecture.md`](architecture.md).

## Author

Philipp Mattern  
[M.E.S.S. – Mattern Engineering & Software Solutions](https://mess.engineering)

GPL-3.0. Example-cube notices: [`data/NOTICE.md`](data/NOTICE.md).
