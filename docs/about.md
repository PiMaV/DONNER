# DONNER

Browser-native 3D/XR explorer for structured data (WETTER).

## Sources / Examples

- **Brain MRI Low** — example T1 atlas (ICBM 152), 2× mean-binned. All three axes are space. Loop walks a cut. Visitor default (bare URL or `?src=brain`). Starts in Ghost. Bottom **AR** hangs it on a camera when one exists.
- **Brain MRI High** — the same atlas at native grid. Larger download. `?src=mni152`.
- **Lighter Ignition** — event-camera counts of a lighter strike. X is sensor width; Y is time; Z is sensor height. Loop Y scrubs the recording. `?src=ignition`. Starts in Ghost.
- **Game of Life** — generator. Each cube is a cell; Z is generations. Play grows the stack. Loop walks a cut of that tape. `?src=life`. Starts in Hull.

*Streaming*
 
**Source → Stream** is a special case: [WETTER](https://wetter.mess.engineering) offers special "sidecars" that are able to stream Data in npy Volumes that can be read by the Viewers like DONNER and [BLITZ](https://github.com/PiMaV/BLITZ). Once running they tell you the address and token you need to connect.

## Share

The address bar follows the example. Bare URL is Brain MRI Low. `?src=life` (or `conway`) is Game of Life. `?src=ignition` is Lighter Ignition. `?src=mni152` is Brain MRI High. `?face=1` opens Face. Add `&quality=medium` or `low`. Unknown `src` values are ignored. No arbitrary file URLs.

## Offline use
https://github.com/PiMaV/DONNER/releases is the same app, for use without internet. On that copy, **EXIT** stops it; closing the browser also stops it after a few seconds.

## Credit

App: GPL-3.0. Brain MRI derived from ICBM 152 Nonlinear 2009 (McGill) via NiiVue demo images (BSD-2-Clause). Lighter Ignition is an author recording. Details in [data/NOTICE.md](data/NOTICE.md).
