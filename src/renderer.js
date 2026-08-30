/**
 * Instanced-cube space-time renderer.
 *
 * Does not know whether events came from Conway or a camera.
 * Later modes (points, sprites, shaders) should implement the same
 * `setEvents(soa, view)` surface.
 *
 * Y = 0 is the focus plane (`tFocus`). Slices with t > tFocus sit above
 * it as a transparent ghost so the focused generation stays readable.
 */

import * as THREE from "three";
import { COLOR, GHOST_FALLOFF, GHOST_OPACITY } from "./config.js";
import { KIND_WARMUP, SCALE_UNIFORM, stabilityScale } from "./dynamics.js";

function seedInstanceColors(mesh, maxCount, color) {
  for (let i = 0; i < maxCount; i++) mesh.setColorAt(i, color);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
}

export class CubeRenderer {
  constructor(scene, { maxCount, cellSize = 1 }) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.cellSize = cellSize;
    this.count = 0;

    const geoSolid = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const geoGhost = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    this._geoSolid = geoSolid;
    this._geoGhost = geoGhost;

    const matSolid = new THREE.MeshLambertMaterial({
      emissive: new THREE.Color(0x0c0c0c),
    });
    const matGhost = new THREE.MeshLambertMaterial({
      emissive: new THREE.Color(0x0c0c0c),
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    });

    this.solid = new THREE.InstancedMesh(geoSolid, matSolid, maxCount);
    this.ghost = new THREE.InstancedMesh(geoGhost, matGhost, maxCount);
    for (const mesh of [this.solid, this.ghost]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    this.ghost.renderOrder = 1;

    const seed = new THREE.Color(COLOR.gold);
    seedInstanceColors(this.solid, maxCount, seed);
    seedInstanceColors(this.ghost, maxCount, seed);

    scene.add(this.solid);
    scene.add(this.ghost);

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._kindColor = [
      new THREE.Color(COLOR.gold),
      new THREE.Color(COLOR.cyan),
      new THREE.Color(COLOR.blitz),
      new THREE.Color(COLOR.warmup),
    ];
  }

  /**
   * @param {import("./spacetime.js").EventSoA} soa
   * @param {{
   *   tFocus: number,
   *   decay: number,
   *   timeScale: number,
   *   width: number,
   *   height: number,
   *   stabMode?: "none" | "time" | "focus",
   *   cellSize?: number,
   * }} view
   */
  setEvents(soa, view) {
    const cell = view.cellSize ?? this.cellSize;
    const ox = (view.width - 1) * 0.5;
    const oz = (view.height - 1) * 0.5;
    const decay = view.decay;
    const timeScale = view.timeScale;
    const tFocus = view.tFocus;
    const n = Math.min(soa.count, this.maxCount);
    const dummy = this._dummy;
    const color = this._color;
    const kinds = this._kindColor;

    let iSolid = 0;
    let iGhost = 0;

    for (let i = 0; i < n; i++) {
      const t = soa.t[i];
      const dt = t - tFocus;
      dummy.position.set(
        (soa.x[i] - ox) * cell,
        dt * timeScale,
        (soa.y[i] - oz) * cell,
      );
      const k = soa.k[i] | 0;
      const kind = kinds[k] || kinds[0];
      const fill =
        view.stabMode === "none" || k === KIND_WARMUP
          ? SCALE_UNIFORM
          : stabilityScale(soa.s[i]);

      if (dt > 0) {
        const fade = Math.exp(-GHOST_FALLOFF * dt);
        dummy.scale.setScalar(cell * fill * (0.7 + 0.2 * fade));
        dummy.updateMatrix();
        this.ghost.setMatrixAt(iGhost, dummy.matrix);
        color.copy(kind).multiplyScalar(0.35 + 0.5 * fade);
        this.ghost.setColorAt(iGhost, color);
        iGhost += 1;
      } else {
        const age = -dt;
        const w = Math.exp(-decay * age);
        const onFocus = age < 0.5;
        dummy.scale.setScalar(cell * fill);
        dummy.updateMatrix();
        this.solid.setMatrixAt(iSolid, dummy.matrix);
        color.copy(kind).multiplyScalar(onFocus ? 1 : 0.16 + 0.84 * w);
        this.solid.setColorAt(iSolid, color);
        iSolid += 1;
      }
    }

    this.solid.count = iSolid;
    this.ghost.count = iGhost;
    this.count = iSolid + iGhost;
    this.solid.instanceMatrix.needsUpdate = true;
    this.ghost.instanceMatrix.needsUpdate = true;
    if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    if (this.ghost.instanceColor) this.ghost.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.solid);
    this.scene.remove(this.ghost);
    this._geoSolid.dispose();
    this._geoGhost.dispose();
    this.solid.material.dispose();
    this.ghost.material.dispose();
  }
}

/** Translucent XZ slab at Y = 0 — hit target and draw-plane fill. */
export function createFocusSurface(width, height, cellSize) {
  const geo = new THREE.PlaneGeometry(width * cellSize, height * cellSize);
  const mat = new THREE.MeshBasicMaterial({
    color: COLOR.gold,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  return mesh;
}

export function createNowGrid(width, height, cellSize) {
  const span = Math.max(width, height) * cellSize;
  const divs = Math.max(width, height);
  const grid = new THREE.GridHelper(span, divs, COLOR.grid, COLOR.gridDiv);
  grid.position.y = 0.01;
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const m of mats) {
    m.transparent = true;
    m.opacity = 0.35;
  }
  return grid;
}

/**
 * Playfield frame on the focus plane: outer rectangle plus short corner posts
 * so the board edge reads in 3D, not only in top-down view.
 */
export class FocusFrame {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._mat = new THREE.MeshBasicMaterial({
      color: COLOR.frame,
      transparent: true,
      opacity: 0.92,
    });
    this._parts = [];
    scene.add(this.group);
  }

  setSize(width, height, cellSize) {
    for (const p of this._parts) {
      this.group.remove(p);
      p.geometry.dispose();
    }
    this._parts.length = 0;

    const hw = (width * cellSize) / 2;
    const hd = (height * cellSize) / 2;
    const t = Math.max(0.07, cellSize * 0.08);
    const postH = cellSize * 1.25;

    const add = (x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this._mat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this._parts.push(mesh);
    };

    add(0, t * 0.5, -hd, width * cellSize + t, t, t);
    add(0, t * 0.5, hd, width * cellSize + t, t, t);
    add(-hw, t * 0.5, 0, t, t, height * cellSize);
    add(hw, t * 0.5, 0, t, t, height * cellSize);

    for (const [x, z] of [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
    ]) {
      add(x, postH * 0.5, z, t, postH, t);
    }
  }

  setEditing(on) {
    this._mat.opacity = on ? 1 : 0.78;
    this._mat.color.setHex(on ? COLOR.gold : COLOR.frame);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const p of this._parts) p.geometry.dispose();
    this._mat.dispose();
  }
}

export function createHoverMarker(cellSize) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(cellSize * 0.92, cellSize * 0.12, cellSize * 0.92),
    new THREE.MeshBasicMaterial({
      color: COLOR.gold,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  mesh.visible = false;
  mesh.renderOrder = 2;
  return mesh;
}
