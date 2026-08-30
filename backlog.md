# Later / declined

Shipped work is in [`CHANGELOG.md`](CHANGELOG.md). Remaining product
stages live under **Later** in [`architecture.md`](architecture.md) and
[`docs/gui.md`](docs/gui.md).

**Later:** event-camera source on the same `EventSoA`, a polarity (or
other) encoding LUT, then the XR ladder below. Do not implement XR in
this tree until that stage is opened.

**XR ladder** (tech demo, same Three.js scene — not a Unity fork, not a
projector, not a native iOS wrapper):

1. **XR-A — phone tabletop.** WebXR `immersive-ar`, plane **hit-test**:
   tap a table, place the volume, walk around with the phone as a window.
   Demo path is **Android Chrome**. iPhone only if `navigator.xr` actually
   supports AR; otherwise treat it as blocked. No 8th Wall, no ARKit
   shell. Feature-detect; fallback is today's orbit viewer. **HTTPS** is
   required (LAN `http://` from `start:lan` is not enough — mkcert,
   deploy, or `localhost` on the machine itself). Keep Window/Grid smaller
   than the desktop 200 000-cube envelope. AR UI is a thin overlay (Play,
   Z scrub, Exit); Bird-eye is usually redundant (you look down yourself).
   Pause `OrbitControls` while a session is active. Renderer contract
   `setEvents(...)` stays.

2. **XR-B — marker origin.** AprilTag or a printed gold playfield frame
   for a repeatable origin and metric scale. Optional gag: the print *is*
   the Conway seed (Blinker on paper → the stack grows along product Z).
   Same phone AR session; the marker also serves Quest later.

3. **XR-C — Quest 3 passthrough.** Same scene as mixed reality on the
   table (`immersive-ar` / alpha-blend). Walk the stack; hand input and
   in-world Z scrub come after placement works. This is the exploratory
   capture feel; XR-A is only the window demo.

Out of this ladder: projection mapping, Unreal, Vision Pro as a first
target, event-camera import (stage 2).

**Declined for now:** filmstrip and hover recheck-ROI.
