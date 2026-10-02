# TODO

## Own head MRI as an extra example

Convert a personal head MRI into a DONNER count cube and offer it beside the ICBM 152 Brain MRI examples.

- The scan is the author's own head, not the public ICBM atlas.
- Same ingest as the existing cubes: scanner export → `.npy` count volume. A binned Low next to High, if the grid is large enough to be worth it.
- Add it as an extra Source. Note what the scan is in `data/NOTICE.md` and `docs/about.md`.
- Publish the volume only once that notice says it may be shared.
