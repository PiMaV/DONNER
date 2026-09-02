import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aabbFromSlabs,
  aabbKeepUpToFocus,
  axisIndexFromBack,
  clampSlab,
  defaultInspectSlabs,
  denseGhostToSlice,
  effectiveShade,
  playheadCrossesMid,
  playheadMidBack,
  fociFromSlabs,
  formatZTick,
  inAabb,
  inspectRebuildKey,
  onAxisPlane,
  productToWorld,
  relativeTimeTicks,
  resetPlanes,
  resetSlabClips,
  shouldEmitVoxel,
  slabGenerations,
  spatialTicks,
  stackThumbFrac,
  stackTickMarks,
  stepFocusBack,
  stepFocusBackClipped,
  visibleTimeRange,
  voxelShadeClass,
  worldToProduct,
  zBackWorldY,
  zWorldY,
  backFromWorldCoord,
  focusBackFromVoxel,
  voxelPitch,
  voxelLocalCenter,
} from "../src/axes.js";
import { clampVoxelGap, VOXEL_GAP_MAX } from "../src/config.js";

describe("product vs engine axes", () => {
  it("maps X Y playfield and Z time onto Three.js Y-up", () => {
    assert.deepEqual(productToWorld(3, 5, 8), { x: 3, y: 8, z: 5 });
    assert.deepEqual(worldToProduct(3, 8, 5), { x: 3, y: 5, z: 8 });
  });

  it("anchors world Y at Now so the playhead can move through a still stack", () => {
    assert.equal(zWorldY(80, 80, 1), 0);
    assert.equal(zWorldY(60, 80, 1), -20);
    assert.equal(zBackWorldY(0, 1), 0);
    assert.equal(zBackWorldY(20, 1), -20);
  });
});

describe("axis ticks", () => {
  it("includes both ends of a 32-wide grid", () => {
    const t = spatialTicks(32);
    assert.equal(t[0], 0);
    assert.equal(t[t.length - 1], 31);
    assert.ok(t.includes(16) || t.includes(8));
  });

  it("labels relative Z with absolute generation at the plane", () => {
    assert.equal(formatZTick(0, 42), "0 · 42");
    assert.equal(formatZTick(-8, 42), "−8");
    assert.equal(formatZTick(3, 42), "+3");
  });

  it("spans past below the plane and ghost above", () => {
    const { relMin, relMax } = visibleTimeRange(50, 40, 48);
    assert.ok(relMin < 0);
    assert.equal(relMax, 10);
    const ticks = relativeTimeTicks(relMin, relMax);
    assert.ok(ticks.includes(0));
    assert.equal(ticks[0], relMin);
    assert.equal(ticks[ticks.length - 1], relMax);
  });

  it("maps Now to the top of the Z stack", () => {
    assert.equal(stackThumbFrac(0, 12), 0);
    assert.equal(stackThumbFrac(12, 12), 1);
    assert.equal(stackThumbFrac(6, 12), 0.5);
    assert.equal(stackThumbFrac(3, 0), 0);
  });

  it("places a tick on every stored step", () => {
    const marks = stackTickMarks(12);
    assert.equal(marks.length, 13);
    assert.equal(marks[0].frac, 0);
    assert.equal(marks[12].frac, 1);
    assert.ok(marks.filter((m) => m.major).length > 2);
    assert.ok(marks.some((m) => m.mid));
    assert.equal(stackTickMarks(0).length, 1);
  });

  it("does not emit a DOM tick per generation on a 1000-deep resident buffer", () => {
    const marks = stackTickMarks(1000);
    assert.ok(marks.length < 80);
    assert.equal(marks[0].frac, 0);
    assert.equal(marks[marks.length - 1].frac, 1);
  });
});

describe("Z slab", () => {
  it("playhead pushes the clips when the focus handle moves", () => {
    assert.deepEqual(clampSlab(0, 20, 40, 40, "focus"), {
      topBack: 0,
      focusBack: 20,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(25, 20, 40, 40, "focus"), {
      topBack: 20,
      focusBack: 20,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(0, 20, 10, 40, "focus"), {
      topBack: 0,
      focusBack: 20,
      botBack: 20,
    });
  });

  it("a clip handle pushes the playhead when dragged past it", () => {
    assert.deepEqual(clampSlab(25, 20, 40, 40, "near"), {
      topBack: 25,
      focusBack: 25,
      botBack: 40,
    });
    assert.deepEqual(clampSlab(0, 20, 10, 40, "far"), {
      topBack: 0,
      focusBack: 10,
      botBack: 10,
    });
    assert.deepEqual(clampSlab(35, 20, 30, 40, "near"), {
      topBack: 35,
      focusBack: 35,
      botBack: 35,
    });
  });

  it("maps back-offsets to absolute generations", () => {
    assert.deepEqual(slabGenerations(100, 0, 40), { tLo: 60, tHi: 100 });
    assert.deepEqual(slabGenerations(100, 10, 10), { tLo: 90, tHi: 90 });
  });

  it("opens clip windows to the brick and keeps the playhead", () => {
    const next = resetSlabClips(
      {
        x: { near: 4, focus: 8, far: 12 },
        y: { near: 1, focus: 2, far: 3 },
        z: { near: 10, focus: 20, far: 30 },
      },
      20,
      15,
      40,
    );
    assert.deepEqual(next.x, { near: 0, focus: 8, far: 20 });
    assert.deepEqual(next.y, { near: 0, focus: 2, far: 15 });
    assert.deepEqual(next.z, { near: 0, focus: 20, far: 40 });
  });

  it("opens clips and centers each playhead", () => {
    assert.deepEqual(resetPlanes(20, 15, 40), {
      x: { near: 0, focus: 10, far: 20 },
      y: { near: 0, focus: 7, far: 15 },
      z: { near: 0, focus: 20, far: 40 },
    });
    assert.deepEqual(resetPlanes(0, 1, 0), {
      x: { near: 0, focus: 0, far: 0 },
      y: { near: 0, focus: 0, far: 1 },
      z: { near: 0, focus: 0, far: 0 },
    });
  });

  it("default Inspect pose matches Reset Planes (mid playheads, full clips)", () => {
    const conway = defaultInspectSlabs(32, 32, 0, 0);
    assert.deepEqual(conway, resetPlanes(31, 31, 0));
    assert.deepEqual(conway.x, { near: 0, focus: 15, far: 31 });
    assert.deepEqual(conway.y, { near: 0, focus: 15, far: 31 });
    assert.deepEqual(conway.z, { near: 0, focus: 0, far: 0 });
    const conwayFoci = fociFromSlabs(conway, 32, 32, 0);
    assert.equal(conwayFoci.x, axisIndexFromBack(15, 31));
    assert.equal(conwayFoci.y, axisIndexFromBack(15, 31));
    assert.equal(conwayFoci.z, 0);
    assert.notEqual(conwayFoci.x, 0);
    assert.notEqual(conwayFoci.x, 31);
    assert.deepEqual(defaultInspectSlabs(32, 32, 0, 0), conway);

    const mni = defaultInspectSlabs(48, 64, 24, 0);
    assert.deepEqual(mni, resetPlanes(47, 63, 24));
    assert.equal(mni.x.near, 0);
    assert.equal(mni.x.far, 47);
    assert.equal(mni.y.near, 0);
    assert.equal(mni.y.far, 63);
    assert.equal(mni.z.near, 0);
    assert.equal(mni.z.far, 24);
    const mniFoci = fociFromSlabs(mni, 48, 64, 24);
    assert.equal(mniFoci.x, axisIndexFromBack(47 >> 1, 47));
    assert.equal(mniFoci.y, axisIndexFromBack(63 >> 1, 63));
    assert.equal(mniFoci.z, 24 - (24 >> 1));
    assert.notEqual(mniFoci.x, 0);
    assert.notEqual(mniFoci.x, 47);
    assert.notEqual(mniFoci.z, 0);
    assert.notEqual(mniFoci.z, 24);
  });

  it("Reset Planes from a cropped brick returns the default Inspect pose", () => {
    const fresh = defaultInspectSlabs(21, 16, 40, 0);
    const cropped = {
      x: { near: 2, focus: 4, far: 8 },
      y: { near: 1, focus: 3, far: 6 },
      z: { near: 5, focus: 12, far: 30 },
    };
    const restored = resetPlanes(20, 15, 40);
    assert.deepEqual(restored, fresh);
    assert.notDeepEqual(cropped, fresh);
  });
});

describe("AABB crop and shade", () => {
  it("tests inclusive bounds", () => {
    const box = { xLo: 1, xHi: 3, yLo: 0, yHi: 2, tLo: 4, tHi: 8 };
    assert.equal(inAabb(1, 0, 4, box), true);
    assert.equal(inAabb(3, 2, 8, box), true);
    assert.equal(inAabb(0, 0, 4, box), false);
    assert.equal(inAabb(1, 3, 4, box), false);
    assert.equal(inAabb(1, 0, 9, box), false);
    assert.equal(inAabb(2, 1, 5, null), true);
  });

  it("maps three slabs onto product indices", () => {
    const box = aabbFromSlabs(
      {
        x: { near: 0, far: 3 },
        y: { near: 1, far: 5 },
        z: { near: 0, far: 10 },
      },
      8,
      8,
      20,
    );
    assert.deepEqual(box, { xLo: 4, xHi: 7, yLo: 2, yHi: 6, tLo: 10, tHi: 20 });
    assert.deepEqual(
      fociFromSlabs(
        {
          x: { focus: 0 },
          y: { focus: 1 },
          z: { focus: 4 },
        },
        8,
        8,
        20,
      ),
      { x: 7, y: 6, z: 16 },
    );
  });

  it("turns Hull + hold into a ghost peek", () => {
    assert.equal(effectiveShade("hull", false), "hull");
    assert.equal(effectiveShade("hull", true), "ghost");
    assert.equal(effectiveShade("ghost", true), "ghost");
    assert.equal(effectiveShade("triple", true), "triple");
    assert.equal(denseGhostToSlice("ghost", false), "ghost");
    assert.equal(denseGhostToSlice("ghost", true), "ghost");
    assert.equal(denseGhostToSlice("triple", true), "triple");
  });

  it("snaps the playhead onto mid-volume when the drag crosses it", () => {
    assert.equal(playheadMidBack(10), 5);
    assert.equal(playheadCrossesMid(4, 6, 10), true);
    assert.equal(playheadCrossesMid(5, 6, 10), false);
    assert.equal(playheadCrossesMid(4, 5, 10), true);
    assert.equal(playheadCrossesMid(0, 1, 1), false);
  });

  it("Hull SoA key ignores the playhead; Ghost includes the active plane", () => {
    const aabb = { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 8 };
    const a = inspectRebuildKey({
      shade: "hull",
      aabb,
      foci: { x: 1, y: 1, z: 2 },
      activeAxis: "z",
    });
    const b = inspectRebuildKey({
      shade: "hull",
      aabb,
      foci: { x: 0, y: 0, z: 7 },
      activeAxis: "x",
    });
    assert.equal(a, b);
    const g0 = inspectRebuildKey({
      shade: "ghost",
      aabb,
      foci: { x: 1, y: 1, z: 2 },
      activeAxis: "z",
    });
    const g1 = inspectRebuildKey({
      shade: "ghost",
      aabb,
      foci: { x: 1, y: 1, z: 3 },
      activeAxis: "z",
    });
    assert.notEqual(g0, g1);
  });

  it("keeps the AABB from the axis origin through the playhead", () => {
    const box = { xLo: 0, xHi: 8, yLo: 1, yHi: 7, tLo: 2, tHi: 20 };
    assert.deepEqual(aabbKeepUpToFocus(box, "x", 3), {
      xLo: 0,
      xHi: 3,
      yLo: 1,
      yHi: 7,
      tLo: 2,
      tHi: 20,
    });
    assert.deepEqual(aabbKeepUpToFocus(box, "z", 5), {
      xLo: 0,
      xHi: 8,
      yLo: 1,
      yHi: 7,
      tLo: 2,
      tHi: 5,
    });
    assert.equal(aabbKeepUpToFocus(box, "y", 0).yHi, 1);
    assert.equal(aabbKeepUpToFocus(null, "z", 4), null);
  });

  it("classifies hull, ghost, and triple voxels", () => {
    const aabb = { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 };
    const foci = { x: 1, y: 1, z: 1 };
    const opts = { aabb, foci, activeAxis: "z" };
    assert.equal(voxelShadeClass(0, 0, 0, { ...opts, shade: "hull", isHull: true }), "solid");
    assert.equal(voxelShadeClass(1, 1, 1, { ...opts, shade: "hull", isHull: false }), "skip");
    assert.equal(voxelShadeClass(1, 1, 1, { ...opts, shade: "ghost", isHull: false }), "solid");
    assert.equal(voxelShadeClass(0, 0, 0, { ...opts, shade: "ghost", isHull: true }), "ghost");
    assert.equal(voxelShadeClass(1, 0, 0, { ...opts, shade: "triple", isHull: false }), "solid");
    assert.equal(voxelShadeClass(0, 0, 0, { ...opts, shade: "triple", isHull: true }), "skip");
    assert.equal(voxelShadeClass(1, 1, 1, { ...opts, shade: "slice", isHull: true }), "solid");
    assert.equal(voxelShadeClass(0, 0, 0, { ...opts, shade: "slice", isHull: true }), "skip");
    assert.equal(onAxisPlane(1, 0, 0, "x", 1), true);
  });

  it("emits dense interiors only for ghost/triple on a plane", () => {
    const aabb = { xLo: 0, xHi: 2, yLo: 0, yHi: 2, tLo: 0, tHi: 2 };
    const foci = { x: 1, y: 1, z: 1 };
    assert.equal(shouldEmitVoxel(1, 1, 1, { aabb, foci, shade: "hull", isHull: false }), false);
    assert.equal(
      shouldEmitVoxel(1, 1, 1, { aabb, foci, shade: "ghost", activeAxis: "z", isHull: false }),
      true,
    );
    assert.equal(
      shouldEmitVoxel(0, 0, 0, { aabb, foci, shade: "ghost", activeAxis: "z", isHull: false }),
      false,
    );
    assert.equal(shouldEmitVoxel(1, 0, 0, { aabb, foci, shade: "triple", isHull: false }), true);
    assert.equal(shouldEmitVoxel(0, 0, 0, { aabb, foci, shade: "triple", isHull: false }), false);
    assert.equal(shouldEmitVoxel(0, 0, 0, { aabb, foci, shade: "triple", isHull: true }), false);
    assert.equal(
      shouldEmitVoxel(1, 1, 1, { aabb, foci, shade: "slice", activeAxis: "z", isHull: true }),
      true,
    );
    assert.equal(
      shouldEmitVoxel(0, 0, 0, { aabb, foci, shade: "slice", activeAxis: "z", isHull: true }),
      false,
    );
  });

  it("wraps the playhead at both ends", () => {
    assert.equal(stepFocusBack(0, 10, -1), 10);
    assert.equal(stepFocusBack(10, 10, 1), 0);
    assert.equal(stepFocusBack(4, 10, -1), 3);
    assert.equal(stepFocusBack(0, 0, -1), 0);
  });

  it("wraps the playhead inside the inspect clip window", () => {
    assert.equal(stepFocusBackClipped(2, 2, 8, -1), 8);
    assert.equal(stepFocusBackClipped(8, 2, 8, 1), 2);
    assert.equal(stepFocusBackClipped(5, 2, 8, -1), 4);
    assert.equal(stepFocusBackClipped(3, 3, 3, -1), 3);
  });
});

describe("voxel and world rail back", () => {
  it("maps a voxel onto the standing-axis playhead", () => {
    assert.equal(focusBackFromVoxel("z", 2, 3, 7, 5, 5, 10), 3);
    assert.equal(focusBackFromVoxel("x", 2, 3, 7, 5, 5, 10), 2);
    assert.equal(focusBackFromVoxel("y", 2, 1, 7, 5, 5, 10), 3);
  });

  it("inverts the engine mapping for a rail coord", () => {
    assert.equal(backFromWorldCoord("z", -20, 32, 32, 1, 1), 20);
    assert.equal(backFromWorldCoord("x", 0, 5, 5, 1, 1), 2);
    assert.equal(backFromWorldCoord("y", 2, 5, 5, 1, 1), 0);
  });
});

describe("voxel gap lattice", () => {
  it("packs at gap 0 and opens centers when gap rises", () => {
    assert.equal(voxelPitch(1, 0), 1);
    assert.equal(voxelPitch(1, 1), 2);
    assert.equal(voxelPitch(2, 0.5), 3);
    assert.equal(voxelPitch(1, -4), 1);
  });

  it("clamps the View slider to 0…2", () => {
    assert.equal(clampVoxelGap(-1), 0);
    assert.equal(clampVoxelGap(9), VOXEL_GAP_MAX);
    assert.equal(clampVoxelGap("0.5"), 0.5);
    assert.equal(clampVoxelGap("no"), 0);
  });

  it("places neighbors one cube apart at gap 0 and two at gap 1", () => {
    const packedA = voxelLocalCenter(0, 0, 10, 5, 5, 1, 10, 1, 0);
    const packedB = voxelLocalCenter(1, 0, 10, 5, 5, 1, 10, 1, 0);
    assert.equal(packedB.x - packedA.x, 1);
    const openA = voxelLocalCenter(0, 0, 10, 5, 5, 1, 10, 1, 1);
    const openB = voxelLocalCenter(1, 0, 10, 5, 5, 1, 10, 1, 1);
    assert.equal(openB.x - openA.x, 2);
    const below = voxelLocalCenter(0, 0, 9, 5, 5, 1, 10, 1, 1);
    assert.equal(openA.y - below.y, 2);
  });
});
