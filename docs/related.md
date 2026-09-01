# Related work

**DONNER is an event viewer.** The product is a space-time explorer for
sparse `(x, y, t, v)` events — later from an event camera. Conway’s Game
of Life is **not** what DONNER is about. It is the v1 demonstrator: a
deterministic in-browser generator of the same event shape, so the
renderer can be built before files, decode, or a sidecar exist.

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
  `datasets/MRT/mni152_stack.npy` (dense; DONNER culls enclosed voxels
  at the current slab). NiiVue itself is unrelated to DONNER’s event
  viewer — do not embed it.
- **ICBM 152 Nonlinear atlases version 2009** — McGill BIC
  ([atlas page](https://www.bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009)).
  The NiiVue `mni152` file is derived from this atlas. Cite ICBM; check
  terms before redistributing a derived `.npy`.
