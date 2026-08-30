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
import { isolationWeight } from "./observe.js";

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
   *   isolate?: { x: number, y: number } | null,
   *   sliceOnly?: boolean,
   * }} view
   */
  setEvents(soa, view) {
    const cell = view.cellSize ?? this.cellSize;
    const ox = (view.width - 1) * 0.5;
    const oz = (view.height - 1) * 0.5;
    const decay = view.decay;
    const timeScale = view.timeScale;
    const tFocus = view.tFocus;
    const isolate = view.isolate || null;
    const sliceOnly = Boolean(view.sliceOnly);
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
      const field = isolationWeight(isolate, soa.x[i], soa.y[i]);
      if (sliceOnly && Math.abs(dt) >= 0.5) continue;

      if (field < 1) {
        const ageFade =
          dt > 0
            ? Math.exp(-GHOST_FALLOFF * dt)
            : Math.exp(-decay * Math.max(0, -dt));
        dummy.scale.setScalar(cell * fill * 0.88);
        dummy.updateMatrix();
        this.ghost.setMatrixAt(iGhost, dummy.matrix);
        color.copy(kind).multiplyScalar(field * (0.45 + 0.55 * ageFade));
        this.ghost.setColorAt(iGhost, color);
        iGhost += 1;
        continue;
      }

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
 * Playfield frame on the focus plane: outer rectangle plus tall corner posts
 * (time-axis grips). Invisible hit cylinders make the posts easy to grab.
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
    this._postMat = new THREE.MeshBasicMaterial({
      color: COLOR.cyan,
      transparent: true,
      opacity: 0.55,
    });
    this._hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this._parts = [];
    this._timeHits = [];
    scene.add(this.group);
  }

  setSize(width, height, cellSize) {
    for (const p of this._parts) {
      this.group.remove(p);
      p.geometry.dispose();
    }
    this._parts.length = 0;
    this._timeHits.length = 0;

    const hw = (width * cellSize) / 2;
    const hd = (height * cellSize) / 2;
    const t = Math.max(0.07, cellSize * 0.08);
    const postH = cellSize * 5.4;

    const add = (x, y, z, sx, sy, sz, mat = this._mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this._parts.push(mesh);
      return mesh;
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
      add(x, 0, z, t, postH, t, this._postMat);
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(cellSize * 0.32, cellSize * 0.32, postH * 1.08, 8),
        this._hitMat,
      );
      hit.position.set(x, 0, z);
      hit.userData.timeScrub = true;
      this.group.add(hit);
      this._parts.push(hit);
      this._timeHits.push(hit);
    }
  }

  timeHandles() {
    return this._timeHits;
  }

  setEditing(on) {
    this._mat.opacity = on ? 1 : 0.78;
    this._mat.color.setHex(on ? COLOR.gold : COLOR.frame);
  }

  setScrubReady(on) {
    this._postMat.opacity = on ? 0.85 : 0.4;
    this._postMat.color.setHex(on ? COLOR.cyan : COLOR.frame);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const p of this._parts) p.geometry.dispose();
    this._mat.dispose();
    this._postMat.dispose();
    this._hitMat.dispose();
  }
}

/**
 * Corner XYZ gizmo: X/Z spatial, Y = time (drag while paused to scrub focus).
 */
export class AxesGizmo {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._parts = [];
    this._timeHits = [];
    this._mats = [];
    scene.add(this.group);
  }

  setSize(width, height, cellSize) {
    for (const p of this._parts) {
      this.group.remove(p);
      p.geometry.dispose();
    }
    this._parts.length = 0;
    this._timeHits.length = 0;
    for (const m of this._mats) m.dispose();
    this._mats.length = 0;

    const hw = (width * cellSize) / 2;
    const hd = (height * cellSize) / 2;
    const inset = cellSize * 1.7;
    this.group.position.set(-hw - inset, 0, -hd - inset);

    const xLen = cellSize * 3.2;
    const zLen = cellSize * 3.2;
    const yLen = cellSize * 6.2;
    const r = Math.max(0.045, cellSize * 0.055);

    this._addShaft(COLOR.gold, xLen, r, 0, -Math.PI / 2);
    this._addShaft(COLOR.grid, zLen, r, Math.PI / 2, 0);
    this._addShaft(COLOR.cyan, yLen, r * 1.25, 0, 0);

    const cone = cellSize * 0.22;
    this._addCone(COLOR.gold, cone, xLen * 0.5, 0, 0, 0, -Math.PI / 2);
    this._addCone(COLOR.grid, cone, 0, 0, zLen * 0.5, Math.PI / 2, 0);
    this._addCone(COLOR.cyan, cone * 1.15, 0, yLen * 0.5, 0, 0, 0);
    this._addCone(COLOR.cyan, cone * 1.15, 0, -yLen * 0.5, 0, Math.PI, 0);

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(cellSize * 0.34, cellSize * 0.34, yLen * 1.12, 8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    hit.userData.timeScrub = true;
    this.group.add(hit);
    this._parts.push(hit);
    this._timeHits.push(hit);
    this._mats.push(hit.material);
  }

  _addShaft(hex, length, radius, rotX, rotZ) {
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.9,
    });
    this._mats.push(mat);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 8),
      mat,
    );
    mesh.rotation.x = rotX;
    mesh.rotation.z = rotZ;
    if (rotZ === -Math.PI / 2) mesh.position.x = length * 0.5;
    else if (rotX === Math.PI / 2) mesh.position.z = length * 0.5;
    this.group.add(mesh);
    this._parts.push(mesh);
  }

  _addCone(hex, size, x, y, z, rotX, rotZ) {
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.92,
    });
    this._mats.push(mat);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(size, size * 1.8, 8), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rotX;
    mesh.rotation.z = rotZ;
    this.group.add(mesh);
    this._parts.push(mesh);
  }

  timeHandles() {
    return this._timeHits;
  }

  setScrubReady(on) {
    for (const m of this._mats) {
      if (m.color && m.color.getHex() === COLOR.cyan) {
        m.opacity = on ? 1 : 0.55;
      }
    }
  }

  originWorld(target) {
    return this.group.getWorldPosition(target);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const p of this._parts) p.geometry.dispose();
    for (const m of this._mats) m.dispose();
  }
}

/** Thin column through time at the isolated cell. */
export class IsolateBeacon {
  constructor(scene, cellSize) {
    this.scene = scene;
    this._mat = new THREE.MeshBasicMaterial({
      color: COLOR.gold,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(cellSize * 0.18, 1, cellSize * 0.18),
      this._mat,
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  setCell(cell, width, height, cellSize, history, timeScale) {
    if (!cell) {
      this.mesh.visible = false;
      return;
    }
    const ox = (width - 1) * 0.5;
    const oz = (height - 1) * 0.5;
    const h = Math.max(12, history) * timeScale;
    this.mesh.scale.set(1, h, 1);
    this.mesh.position.set(
      (cell.x - ox) * cellSize,
      0,
      (cell.y - oz) * cellSize,
    );
    this.mesh.visible = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
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
