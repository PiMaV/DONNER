/**
 * Corner CAD viewcube (desktop rail slot, left of the View HUD). Product axes:
 * X cornflower, Y maize, Z mint. Six face frames: click a face to enter a
 * 2D cut. Hover / press light the face.
 */

import * as THREE from "three";
import { AXIS_COLOR, hexCss } from "./config.js";
import { productViewDir } from "./axes.js";
import {
  GIZMO_CSS,
  GIZMO_CSS_COARSE,
  MARGIN_CSS,
  gizmoCssBox,
  gizmoOnScreen,
  gizmoScissor,
  viewFromLocalNormal,
} from "./gizmo-layout.js";
import { gizmoFollowYaw } from "./turntable.js";

export {
  productViewDir,
  gizmoCssBox,
  gizmoOnScreen,
  gizmoScissor,
  GIZMO_CSS,
  MARGIN_CSS,
  viewFromLocalNormal,
};

const AXIS_HEX = { x: AXIS_COLOR.x, y: AXIS_COLOR.y, z: AXIS_COLOR.z };
const AXIS_CSS = { x: hexCss(AXIS_COLOR.x), y: hexCss(AXIS_COLOR.y), z: hexCss(AXIS_COLOR.z) };
const RIM_HEX = 0xd8e4ee;
const OVERLAY_SELECTORS = [".hud-cards", ".hud-engine", ".hud-source", ".stack", ".fps-chip"];

const CUBE = 1.4;
const FACE = 1.22;
const FACE_OPACITY = 0.28;
const FACE_HOVER = 0.7;

function overlayRects() {
  if (typeof document === "undefined") return [];
  const out = [];
  for (const sel of OVERLAY_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") continue;
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push(r);
  }
  return out;
}

function slotRect() {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("gizmo-slot");
  if (!el || el.hidden) return null;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden") return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return r;
}

function makeLabel(text, cssColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Group();
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = "700 72px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cssColor;
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.48, 0.48, 1);
  spr.renderOrder = 4;
  spr.userData.tex = tex;
  return spr;
}

function axisLine(hex, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: hex, depthTest: true });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 2;
  line.frustumCulled = false;
  return line;
}

export class ViewGizmo {
  constructor({ coarse = false } = {}) {
    this.coarse = Boolean(coarse);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0.1, 8);
    this.camera.position.set(0, 0, 4);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this._targets = [];
    this._hover = null;
    this._hitProxy = null;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._size = new THREE.Vector2();
    this._look = new THREE.Vector3();
    this._build();
  }

  cssSize() {
    return this.coarse ? GIZMO_CSS_COARSE : GIZMO_CSS;
  }

  cssBox(canvas) {
    return gizmoCssBox(
      canvas.getBoundingClientRect(),
      this.cssSize(),
      MARGIN_CSS,
      overlayRects(),
      slotRect(),
    );
  }

  _build() {
    const half = CUBE * 0.5;
    const box = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({
        color: RIM_HEX,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
      }),
    );
    rim.renderOrder = 3;
    rim.frustumCulled = false;
    this.group.add(rim);
    box.dispose();

    const proxyMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._hitProxy = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.1, 3.1), proxyMat);
    this._hitProxy.frustumCulled = false;
    this.group.add(this._hitProxy);

    this.group.add(axisLine(AXIS_HEX.x, productViewDir("x", 1)));
    this.group.add(axisLine(AXIS_HEX.y, productViewDir("y", 1)));
    this.group.add(axisLine(AXIS_HEX.z, productViewDir("z", 1)));

    const specs = [
      { axis: "x", sign: 1, hex: AXIS_HEX.x, css: AXIS_CSS.x, letter: "X" },
      { axis: "x", sign: -1, hex: AXIS_HEX.x, css: AXIS_CSS.x, letter: "" },
      { axis: "y", sign: 1, hex: AXIS_HEX.y, css: AXIS_CSS.y, letter: "Y" },
      { axis: "y", sign: -1, hex: AXIS_HEX.y, css: AXIS_CSS.y, letter: "" },
      { axis: "z", sign: 1, hex: AXIS_HEX.z, css: AXIS_CSS.z, letter: "Z" },
      { axis: "z", sign: -1, hex: AXIS_HEX.z, css: AXIS_CSS.z, letter: "" },
    ];

    for (const spec of specs) {
      const dir = productViewDir(spec.axis, spec.sign);
      const geo = new THREE.PlaneGeometry(FACE, FACE);
      const mat = new THREE.MeshBasicMaterial({
        color: spec.hex,
        transparent: true,
        opacity: spec.sign > 0 ? FACE_OPACITY : FACE_OPACITY * 0.55,
        depthTest: true,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(dir.x * half, dir.y * half, dir.z * half);
      this._look.set(
        mesh.position.x + dir.x,
        mesh.position.y + dir.y,
        mesh.position.z + dir.z,
      );
      mesh.lookAt(this._look);
      mesh.userData.view = { axis: spec.axis, sign: spec.sign };
      mesh.userData.baseOpacity = mat.opacity;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this._targets.push(mesh);
      if (spec.letter) {
        const spr = makeLabel(spec.letter, spec.css);
        spr.position.set(dir.x * 1.12, dir.y * 1.12, dir.z * 1.12);
        this.group.add(spr);
      }
    }
  }

  _setHover(mesh) {
    if (this._hover === mesh) return;
    if (this._hover) {
      this._hover.material.opacity = this._hover.userData.baseOpacity;
      this._hover.scale.setScalar(1);
    }
    this._hover = mesh;
    if (mesh) {
      mesh.material.opacity = FACE_HOVER;
      mesh.scale.setScalar(1.04);
    }
  }

  sync(mainCamera, yaw = 0) {
    const q = mainCamera.quaternion;
    const g = gizmoFollowYaw({ x: q.x, y: q.y, z: q.z, w: q.w }, yaw);
    this.group.quaternion.set(g.x, g.y, g.z, g.w);
  }

  layoutHit(el, canvas) {
    if (!el) return;
    if (slotRect()) {
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      return;
    }
    const box = this.cssBox(canvas);
    el.style.left = `${Math.round(box.left)}px`;
    el.style.top = `${Math.round(box.top)}px`;
    el.style.width = `${Math.round(box.size)}px`;
    el.style.height = `${Math.round(box.size)}px`;
  }

  render(renderer, hitEl) {
    const canvas = renderer.domElement;
    this.layoutHit(hitEl, canvas);
    const full = renderer.getSize(this._size);
    const box = this.cssBox(canvas);
    const rect = canvas.getBoundingClientRect();
    const { x, y, size } = gizmoScissor(box, rect, full.x, full.y);
    const tone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, size, size);
    renderer.setViewport(x, y, size, size);
    try {
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, full.x, full.y);
      renderer.toneMapping = tone;
    }
  }

  _viewAt(clientX, clientY, canvas) {
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
    this.group.updateWorldMatrix(true, true);
    this._ray.setFromCamera(this._ndc, this.camera);
    const hits = this._hitProxy
      ? this._ray.intersectObject(this._hitProxy, false)
      : this._ray.intersectObjects(this._targets, false);
    if (!hits.length) return null;
    const face = hits[0].face;
    if (face?.normal) {
      return viewFromLocalNormal(face.normal.x, face.normal.y, face.normal.z);
    }
    return hits[0].object.userData.view || null;
  }

  _faceMesh(view) {
    if (!view) return null;
    return (
      this._targets.find(
        (m) => m.userData.view?.axis === view.axis && m.userData.view?.sign === view.sign,
      ) || null
    );
  }

  hover(clientX, clientY, canvas) {
    const view = this._viewAt(clientX, clientY, canvas);
    this._setHover(this._faceMesh(view));
    return view;
  }

  clearHover() {
    this._setHover(null);
  }

  hit(clientX, clientY, canvas) {
    const view = this._viewAt(clientX, clientY, canvas);
    this._setHover(this._faceMesh(view));
    return view;
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
