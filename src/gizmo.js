/**
 * Corner CAD viewcube. Product axes: X gold, Y muted, Z cyan (time).
 * Renders into a scissor inset of the main WebGL canvas.
 */

import * as THREE from "three";
import { COLOR } from "./config.js";
import { productViewDir } from "./axes.js";

export { productViewDir };

const Y_MUTED = 0x8a9aa8;
const AXIS_HEX = { x: COLOR.gold, y: Y_MUTED, z: COLOR.cyan };
const GIZMO_CSS = 96;
const GIZMO_CSS_COARSE = 104;
const MARGIN_CSS = 12;

function makeLabel(text, cssColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = "700 36px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cssColor;
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.55, 0.55, 1);
  spr.renderOrder = 2;
  spr.userData.tex = tex;
  return spr;
}

function axisLine(hex, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: hex, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 1;
  line.frustumCulled = false;
  return line;
}

export class ViewGizmo {
  constructor({ coarse = false } = {}) {
    this.coarse = Boolean(coarse);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 8);
    this.camera.position.set(0, 0, 4);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this._targets = [];
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._size = new THREE.Vector2();
    this._build();
  }

  cssSize() {
    return this.coarse ? GIZMO_CSS_COARSE : GIZMO_CSS;
  }

  cssBox(canvas) {
    const rect = canvas.getBoundingClientRect();
    const css = this.cssSize();
    return {
      left: rect.left + MARGIN_CSS,
      top: rect.bottom - MARGIN_CSS - css,
      size: css,
    };
  }

  _build() {
    const specs = [
      { axis: "x", sign: 1, hex: AXIS_HEX.x, css: "#ffc53d", letter: "X" },
      { axis: "x", sign: -1, hex: AXIS_HEX.x, css: "#ffc53d", letter: "" },
      { axis: "y", sign: 1, hex: AXIS_HEX.y, css: "#8a9aa8", letter: "Y" },
      { axis: "y", sign: -1, hex: AXIS_HEX.y, css: "#8a9aa8", letter: "" },
      { axis: "z", sign: 1, hex: AXIS_HEX.z, css: "#00fff2", letter: "Z" },
      { axis: "z", sign: -1, hex: AXIS_HEX.z, css: "#00fff2", letter: "" },
    ];
    this.group.add(axisLine(AXIS_HEX.x, productViewDir("x", 1)));
    this.group.add(axisLine(AXIS_HEX.y, productViewDir("y", 1)));
    this.group.add(axisLine(AXIS_HEX.z, productViewDir("z", 1)));

    for (const spec of specs) {
      const dir = productViewDir(spec.axis, spec.sign);
      const size = spec.letter ? 0.32 : 0.22;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: spec.hex,
        transparent: true,
        opacity: spec.sign > 0 ? 0.95 : 0.45,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(dir.x * 1.05, dir.y * 1.05, dir.z * 1.05);
      mesh.userData.view = { axis: spec.axis, sign: spec.sign };
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this._targets.push(mesh);
      if (spec.letter) {
        const spr = makeLabel(spec.letter, spec.css);
        spr.position.copy(mesh.position).multiplyScalar(1.35);
        this.group.add(spr);
      }
    }
  }

  sync(mainCamera) {
    this.group.quaternion.copy(mainCamera.quaternion).invert();
  }

  render(renderer) {
    const full = renderer.getSize(this._size);
    const pr = renderer.getPixelRatio();
    const css = this.cssSize();
    const w = Math.max(1, Math.round(css * pr));
    const h = Math.max(1, Math.round(css * pr));
    const margin = Math.round(MARGIN_CSS * pr);
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(margin, margin, w, h);
    renderer.setViewport(margin, margin, w, h);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, full.x, full.y);
  }

  hit(clientX, clientY, canvas) {
    const box = this.cssBox(canvas);
    if (
      clientX < box.left ||
      clientY < box.top ||
      clientX > box.left + box.size ||
      clientY > box.top + box.size
    ) {
      return null;
    }
    const nx = ((clientX - box.left) / box.size) * 2 - 1;
    const ny = -((clientY - box.top) / box.size) * 2 + 1;
    this._ndc.set(nx, ny);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hits = this._ray.intersectObjects(this._targets, false);
    if (!hits.length) return null;
    return hits[0].object.userData.view || null;
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.userData.tex) obj.userData.tex.dispose();
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}
