/**
 * Instanced-cube space-time renderer.
 *
 * Does not know whether events came from Conway or a camera.
 * Later modes (points, sprites, shaders) should implement the same
 * `setEvents(soa, view)` surface.
 *
 * Product Z = 0 is the focus plane (`tFocus`). Engine Y-up stores that as
 * world Y = 0. Slices with t > tFocus sit above as a transparent ghost.
 */

import * as THREE from "three";
import { COLOR, GHOST_FALLOFF, GHOST_OPACITY } from "./config.js";
import { CONWAY_KIND_HEX, CONWAY_WARMUP_K, encodingFill } from "./encoding.js";
import { isolationWeight } from "./observe.js";

function seedInstanceColors(mesh, maxCount, color) {
  for (let i = 0; i < maxCount; i++) mesh.setColorAt(i, color);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
}

export class CubeRenderer {
  constructor(scene, { maxCount, cellSize = 1, kindHex = CONWAY_KIND_HEX, warmupK = CONWAY_WARMUP_K }) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.cellSize = cellSize;
    this.count = 0;
    this._warmupK = warmupK;

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
    this._kindColor = kindHex.map((hex) => new THREE.Color(hex));
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
      const fill = encodingFill(k, soa.s[i], view.stabMode, this._warmupK);
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
 * Playfield frame on the focus plane: outer rectangle only. X/Y numbers
 * live on the right-hand coordinate frame; Z time is the HUD stack slider.
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

function hoverBarMat(hex) {
  return new THREE.MeshBasicMaterial({
    color: hex,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
}

function addHoverEdge(group, mat, geos, ax, ay, az, bx, by, bz, t) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1;
  const geo = new THREE.BoxGeometry(t, len, t);
  geos.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  group.add(mesh);
}

/**
 * Plane hover: gold square on the cell, pale cage around the cube
 * on the focus slice when that cell is live.
 */
export class HoverOutlines {
  constructor(scene, cellSize) {
    this.scene = scene;
    this._geos = [];
    this._cellMat = hoverBarMat(COLOR.gold);
    this._cubeMat = hoverBarMat(0xf4f7fb);
    this.cell = new THREE.Group();
    this.cube = new THREE.Group();
    this.cell.frustumCulled = false;
    this.cube.frustumCulled = false;
    this.cell.visible = false;
    this.cube.visible = false;

    const t = Math.max(0.04, cellSize * 0.055);
    const ch = cellSize * 0.5;
    addHoverEdge(this.cell, this._cellMat, this._geos, -ch, 0, -ch, ch, 0, -ch, t);
    addHoverEdge(this.cell, this._cellMat, this._geos, ch, 0, -ch, ch, 0, ch, t);
    addHoverEdge(this.cell, this._cellMat, this._geos, ch, 0, ch, -ch, 0, ch, t);
    addHoverEdge(this.cell, this._cellMat, this._geos, -ch, 0, ch, -ch, 0, -ch, t);

    const h = cellSize * 0.5;
    const c = [-h, h];
    for (const y of c) {
      addHoverEdge(this.cube, this._cubeMat, this._geos, -h, y, -h, h, y, -h, t);
      addHoverEdge(this.cube, this._cubeMat, this._geos, h, y, -h, h, y, h, t);
      addHoverEdge(this.cube, this._cubeMat, this._geos, h, y, h, -h, y, h, t);
      addHoverEdge(this.cube, this._cubeMat, this._geos, -h, y, h, -h, y, -h, t);
    }
    for (const x of c) {
      for (const z of c) {
        addHoverEdge(this.cube, this._cubeMat, this._geos, x, -h, z, x, h, z, t);
      }
    }

    scene.add(this.cell);
    scene.add(this.cube);
  }

  set(cell, width, height, cellSize, cubeScale) {
    if (!cell) {
      this.hide();
      return;
    }
    const ox = (width - 1) * 0.5;
    const oz = (height - 1) * 0.5;
    const wx = (cell.x - ox) * cellSize;
    const wz = (cell.y - oz) * cellSize;
    this.cell.position.set(wx, 0.05, wz);
    this.cell.visible = true;
    if (cubeScale > 0) {
      this.cube.position.set(wx, 0, wz);
      this.cube.scale.setScalar(cubeScale);
      this.cube.visible = true;
    } else {
      this.cube.visible = false;
    }
  }

  hide() {
    this.cell.visible = false;
    this.cube.visible = false;
  }

  dispose() {
    this.scene.remove(this.cell);
    this.scene.remove(this.cube);
    for (const g of this._geos) g.dispose();
    this._geos.length = 0;
    this._cellMat.dispose();
    this._cubeMat.dispose();
  }
}
