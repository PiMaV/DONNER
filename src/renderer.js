/**
 * Instanced-cube space-time renderer.
 *
 * Does not know whether events came from Conway or a camera.
 * Later modes (points, sprites, shaders) should implement the same
 * `setEvents(soa, view)` surface.
 */

import * as THREE from "three";
import { COLOR } from "./config.js";

export class CubeRenderer {
  constructor(scene, { maxCount, cellSize = 1 }) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.cellSize = cellSize;
    this.count = 0;

    const geo = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const mat = new THREE.MeshLambertMaterial({
      emissive: new THREE.Color(0x0c0c0c),
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    const seed = new THREE.Color(COLOR.gold);
    for (let i = 0; i < maxCount; i++) this.mesh.setColorAt(i, seed);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    scene.add(this.mesh);

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._gold = new THREE.Color(COLOR.gold);
    this._cyan = new THREE.Color(COLOR.cyan);
  }

  /**
   * @param {import("./spacetime.js").EventSoA} soa
   * @param {{
   *   tRef: number,
   *   decay: number,
   *   timeScale: number,
   *   width: number,
   *   height: number,
   *   history?: number,
   *   cellSize?: number,
   * }} view
   */
  setEvents(soa, view) {
    const cell = view.cellSize ?? this.cellSize;
    const ox = (view.width - 1) * 0.5;
    const oz = (view.height - 1) * 0.5;
    const decay = view.decay;
    const timeScale = view.timeScale;
    const tRef = view.tRef;
    const hist = Math.max(1, view.history ?? 24);
    const n = Math.min(soa.count, this.maxCount);
    const dummy = this._dummy;
    const color = this._color;
    const gold = this._gold;
    const cyan = this._cyan;

    for (let i = 0; i < n; i++) {
      const age = Math.max(0, tRef - soa.t[i]);
      const w = Math.exp(-decay * age);
      const s = cell * (0.52 + 0.34 * w);
      const hueMix = Math.min(1, age / hist);

      dummy.position.set(
        (soa.x[i] - ox) * cell,
        (soa.t[i] - tRef) * timeScale,
        (soa.y[i] - oz) * cell,
      );
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);

      color.copy(gold).lerp(cyan, hueMix);
      color.multiplyScalar(0.16 + 0.84 * w);
      this.mesh.setColorAt(i, color);
    }

    this.mesh.count = n;
    this.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Invisible XZ plane at y=0 for painting the current generation. */
export function createNowPlane(width, height, cellSize) {
  const geo = new THREE.PlaneGeometry(width * cellSize, height * cellSize);
  const mat = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
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
  grid.position.y = 0;
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const m of mats) {
    m.transparent = true;
    m.opacity = 0.35;
  }
  return grid;
}
