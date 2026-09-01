# Related work

**DONNER is a scientific 3D/XR explorer.** Event-camera streams are one
source, not the product identity. Conway’s Game of Life is **not** what
DONNER is about. It is the v1 demonstrator: a deterministic in-browser
generator of sparse `(x, y, t, v)` so the renderer can be built before
files, decode, or a sidecar exist.

Keep that split in mind. Life links below are things found while looking
around — not a literature review, not a claim of novelty, and **not a
list of influences**. DONNER was not derived from them. Do not let the
generator become the product identity.

Add more links as they turn up.

## Internal — Wolfram 2025 (the Life bible)

While Conway is in the tree, this is the Life essay to keep at hand.
It is **not** a spec for DONNER. The destination remains event streams.

- **2025** — Stephen Wolfram: *What Can We Learn about Engineering and
  Innovation from Half a Century of the Game of Life Cellular
  Automaton?*
  [writings.stephenwolfram.com](https://writings.stephenwolfram.com/2025/03/what-can-we-learn-about-engineering-and-innovation-from-half-a-century-of-the-game-of-life-cellular-automaton/).

## Time as the third axis

Stacking 2D Life generations into a 3D sculpture (time on Z or Y) is a
recurring visualization, independently rediscovered many times. Same
picture as the Conway demonstrator; not the later event-camera job.

- **2024** — Alec Singh ([@alecs.form](https://www.instagram.com/alecs.form/)):
  *Conway's Game of Life Animation.* Extension into the third dimension
  by using time as the z-axis. Blender 4.0.0 geometry-nodes simulation
  zone; rendered in Cycles.
  [Instagram reel](https://www.instagram.com/reel/C2hoRnFsmQW/)
  (2024-01-25). Write-ups:
  [FlowingData](https://flowingdata.com/2024/03/25/conways-game-of-life-with-a-third-dimension/),
  [SysCoI](https://stream.syscoi.com/2024/04/01/conways-game-of-life-animation-with-the-dimension-of-time-rendered-alecs-form-on-instagram/).


## Browser CA explorers

- **2020 — CA Explorer (Justin Leung):** browser-based cellular-automata
  explorer with a **3D Stack** view in which each horizontal slice is one
  generation. Built with Three.js; also provides time navigation and OBJ
  export. This is close to DONNER's current Conway demonstrator, but remains
  a CA-specific application rather than a source-agnostic event viewer.
  [CA Explorer](https://justinleung.me/cellular-automata-webapp/).

## Space-time cubes

The broader visualization pattern is established: two spatial dimensions
plus **time as the third axis**. Space-time-cube tools use this model for
spatiotemporal exploration and often add slicing or time navigation.

- **ArcGIS Space Time Cube:** a mature geospatial implementation of the
  X/Y/time idea. Relevant as a conceptual precedent; DONNER applies the same
  general geometry to matrix and sensor coordinates rather than geographic
  space.
  [ArcGIS documentation](https://pro.arcgis.com/en/pro-app/latest/tool-reference/space-time-pattern-mining/learnmorecreatecube.htm).

## Event-camera XYT visualizations

Event-camera data is commonly represented as events such as
`(x, y, t, p)` and visualized in a 3D **XYT** space. Point clouds, event
frames, and voxel grids are established representations.

- **TU Berlin — events_viz:** teaching/reference implementation for
  visualizing event-camera data as point clouds, event frames, voxel grids,
  and related encodings. Python/Jupyter rather than a browser product
  explorer.
  [GitHub](https://github.com/tub-rip/events_viz).

## Browser point-cloud and scientific viewers

Several mature web viewers solve adjacent rendering and interaction
problems, but they do not define DONNER's matrix/event semantics.

- **deck.gl PointCloudLayer:** interactive browser rendering of large 3D
  point sets with orbit controls and picking; useful as a rendering and
  performance benchmark.
  [Documentation](https://deck.gl/docs/api-reference/layers/point-cloud-layer).
- **Potree:** WebGL viewer for very large point clouds with out-of-core and
  level-of-detail techniques; relevant mainly for scale and streaming.
  [GitHub](https://github.com/potree/potree).
- **Kitware Glance:** lightweight browser application for volumetric images,
  geometry, and point clouds; relevant as a general scientific-viewer
  reference.
  [GitHub](https://github.com/Kitware/glance).


## Architecture and other tessellations

Life and cellular automata also show up as form-finding tools, not as
space-time volumes.

- **2014** — AADRL workshop (Architectural Association, Design Research
  Laboratory, London): self-organizing systems, cellular automata, Game
  of Life. Tessellation into truncated octahedrons instead of cubic
  voxels; statistical control of growth rules and initial generation.
  Tutor: Mostafa El Sayed. Team: Dmytro Aranchii, Paul Bart, Yuqiu
  Jiang, Flavia Santos. Precursor mentioned by the authors: Fashion
  Design Museum, Kyiv, 2009.
  [eVolo](https://www.evolo.us/cellular-automata-in-architecture-aa-workshop/).
  Video: [AADRL. Cellular Automata. Computational Architecture](https://vimeo.com/aranchii)
  (March 2014, Aranchii Vimeo channel). Same team’s later DRL work:
  [NoMad](http://pr2014.aaschool.ac.uk/DRL/NoMad) (2013–14).

## Graphs and other encodings

The same binary grid can be drawn as occupancy, as a graph, or as an
adjacency matrix. Same rule, different pictures.

- **2007** — Bichara Sahely, Luca Zammataro: *Visualizing Conway's Game
  of Life.* Life cells and graph adjacency matrices are both binary
  matrices; a 9-cell outer-totalistic step can be shown as Life, as a
  network, or as several graph layouts.
  [Wolfram Demonstrations](https://demonstrations.wolfram.com/VisualizingConwaysGameOfLife/).

## MRI demo volume (data source, not a viewer)

DONNER is not a NIfTI viewer. The public T1 used for a later MRI cube is
only a **dataset pointer**.

- **NiiVue demo images** — [niivue/niivue-demo-images](https://github.com/niivue/niivue-demo-images)
  (BSD-2-Clause). Low-res `mni152.nii.gz` for browser/phone tests. Local
  copy: `datasets/MRT/mni152.nii.gz`. Converted count cube:
  `datasets/MRT/mni152_stack.npy` (native grid `(215, 256, 207)` uint16;
  DONNER culls enclosed voxels). NiiVue itself is unrelated to DONNER’s event
  viewer — do not embed it.
- **ICBM 152 Nonlinear atlases version 2009** — McGill BIC
  ([atlas page](https://www.bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009)).
  The NiiVue `mni152` file is derived from this atlas. Cite ICBM; check
  terms before redistributing a derived `.npy`.
