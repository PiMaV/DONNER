# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Conway 3D space-time explorer: static Three.js app with instanced cubes, generation history along the time axis, decay, play/pause/step, reset, random seed, torus wrap, touch orbit, cell painting while paused, and a performance HUD.
- Conway B3/S23 rules and seed patterns ported from BLITZ (`blitz/data/conway.py`).
- Explicit Edit mode (hover + tap to toggle cells; only on the Now plane).
- Focus scrub through stored history: plane stays at Y = 0, newer slices render as a transparent ghost, playfield gold frame marks the board edge.
- Worldline color: gold still, cyan oscillator, BLITZ-red transit, gray warmup for generations 0–1 (decay affects brightness only).
- Cube fill encodes stability duration (cap 16 gens); Stability control is None / Time / Focus (not a checkbox).
- Grid-light slider for the cell lattice and focus-plane fill.
- Pattern read-hint under Pattern in the Source block (how to read Blinker vs Glider).
- Related-work link list (`docs/related.md`): Conway is the event generator, not the product; Wolfram 2025 highlighted as the internal Life reference; neighbouring CA links found while looking around — not a novelty or influence claim.
- Bird-eye view: orthographic camera looking down onto the **focus slice** (button **Bird**, key `B`).
- Isolation: dim the volume to one `(x, y)` worldline (button **Iso**, key `I`; tap a cell or cube).
- **Z stack slider** on the right of the HUD: Now at the top, past at the bottom; readout is focus generation plus past/ghost span. The Z stack is the only playhead (no Focus slider in the sheet).
- Numbered product X/Y on the right of the playfield; hover hairlines from the cell to both axes.
- Hovering the focus plane outlines the cell and, when live, the cube on that slice.
- Display HUD sparkline of recent frame times plus FPS / AVG / FR, kept apart from the Conway source block (GEN, LIVE, RATE).
- **Now** button on the Z stack; current time (`tFocus`) sits beside the handle.

### Changed

- Default seed is Blinker (period-2 along time); Stability defaults to Time. Pattern list starts with oscillators, then glider.
- Glider (and other translating activity) is classified as transit: neighborhood centroid must stay put for still/osc, so the trail is a coral tube instead of false gold/cyan.
- Product axes are X/Y playfield and Z time. Time scrub is a right-hand stack slider, not a 3D gizmo on the coordinate frame.
- Control **History** is labeled **Window** (time span in the buffer, not a Life log).
- Display vs source vs encoding is documented: DONNER is the viewer, Conway the addon, color/fill an encoding slot the addon fills.
- Control sheet grouped into **View**, **Source**, and **Encoding**. GEN / LIVE / RATE stay on the Source HUD, not in Encoding.

### Removed

- Focus slider from the control sheet. Playhead is the Z stack (**Now** button there, plus Home / `[` / `]` / Shift+wheel).
