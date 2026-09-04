# Demo data notices

DONNER ships two example cubes next to the static app so GitHub Pages
can `fetch` them same-origin. They are examples, not a data portal.
Subject / SHIP MRI stays off this tree.

Further public example cubes should stay sparse (many zeros). A dense
brick like Brain MRI High is the expensive case; Brain MRI Low is the
visitor default.

## Lighter Ignition — `ignition_stack.npy`

Author event-camera recording (lighter strike), packed as an EVT count
cube `(T × H × W)` uint counts. Cubes are integer events per pixel per
Δt. Shipped here as a public example. File name stays `ignition_stack`
(source id `ignition`).

## Brain MRI Low — `mni152_low_stack.npy`

Derived **example** T1 volume, 2× mean-binned from High (same reduce as
Source → Load NumPy factor 2 / mean). Grid `(107, 128, 103)` uint16.
Source id `mni152-low`. Visitor aliases `brain` / `mri`. Rebuild with
`node scripts/bin_mni152_low.mjs`.

## Brain MRI High — `mni152_stack.npy`

Derived **example** T1 volume. Not a patient scan. Native grid
`(215, 256, 207)` uint16 (intensity 1…32). Source id `mni152`.

Upstream NIfTI: [niivue/niivue-demo-images](https://github.com/niivue/niivue-demo-images)
`mni152.nii.gz` (BSD-2-Clause, Copyright (c) 2022 Chris Rorden). That
file is derived from the ICBM 152 Nonlinear atlas version 2009
([McGill BIC](https://www.bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009)).

ICBM copyright notice (required on copies):

> Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre,
> Montreal Neurological Institute, McGill University. Permission to use,
> copy, modify, and distribute this software and its documentation for
> any purpose and without fee is hereby granted, provided that the above
> copyright notice appear in all copies. The authors and McGill
> University make no representations about the suitability of this
> software for any purpose. It is provided “as is” without express or
> implied warranty. The authors are not responsible for any data loss,
> equipment damage, property loss, or injury to subjects or patients
> resulting from the use or misuse of this software package.

NiiVue demo-images BSD-2-Clause: redistributions in binary form must
reproduce the copyright notice and disclaimer. See that repository’s
`LICENSE`.

The convert recipe (no NIfTI parser in the browser) is in
[`architecture.md`](../architecture.md#mri-volume-later).
