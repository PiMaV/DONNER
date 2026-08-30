/**
 * Right-side product XY frame on the playfield.
 * Time (Z) is the HUD stack slider, not a 3D grabber.
 */

import * as THREE from "three";
import { COLOR } from "./config.js";
import { spatialTicks } from "./axes.js";

const Y_AXIS = 0x8a9aa8;

function makeLabel(text, cssColor, worldScale) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 192, 64);
  ctx.font = "600 28px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = cssColor;
  ctx.fillText(text, 96, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(worldScale, worldScale * 0.4, 1);
  spr.renderOrder = 6;
  spr.userData.tex = tex;
  return spr;
}

function disposeSprite(spr) {
  if (!spr) return;
  if (spr.userData.tex) spr.userData.tex.dispose();
  spr.material.dispose();
}

function makeLine(hex, opacity = 0.5) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const mat = new THREE.LineBasicMaterial({
    color: hex,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = 4;
  return line;
}

function setLine(line, ax, ay, az, bx, by, bz) {
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, ax, ay, az);
  pos.setXYZ(1, bx, by, bz);
  pos.needsUpdate = true;
}

export class CoordinateFrame {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this._parts = [];
    this._sprites = [];
    this._mats = [];
    this.width = 32;
    this.height = 32;
    this.cellSize = 1;
    this._hw = 16;
    this._hd = 16;
    this._pad = 1.2;
    scene.add(this.group);
  }

  setSize(width, height, cellSize) {
    this._clear();
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this._hw = (width * cellSize) / 2;
    this._hd = (height * cellSize) / 2;
    this._pad = cellSize * 1.15;

    const r = Math.max(0.04, cellSize * 0.05);
    const gold = COLOR.gold;

    this.group.position.set(0, 0, 0);

    // Product X along the south edge, Y along the right edge (away from the menu).
    this._edge(gold, -this._hw, 0.02, -this._hd, this._hw, 0.02, -this._hd, r * 0.7);
    this._edge(Y_AXIS, this._hw, 0.02, -this._hd, this._hw, 0.02, this._hd, r * 0.7);

    this._letter("X", "#ffc53d", this._hw + this._pad * 0.15, 0.35, -this._hd - this._pad * 0.35);
    this._letter("Y", "#8a9aa8", this._hw + this._pad * 0.85, 0.35, this._hd * 0.08);

    for (const i of spatialTicks(width)) {
      const wx = this._worldX(i);
      if (wx < -cellSize * 0.25) continue;
      this._tickMark(wx, 0.02, -this._hd - cellSize * 0.18, 0, 0, cellSize * 0.22, gold);
      this._label(String(i), "#ffc53d", wx, 0.45, -this._hd - this._pad * 0.72, 1.6);
    }
    for (const j of spatialTicks(height)) {
      const wz = this._worldZ(j);
      this._tickMark(this._hw + cellSize * 0.18, 0.02, wz, cellSize * 0.22, 0, 0, Y_AXIS);
      this._label(String(j), "#98a4b3", this._hw + this._pad * 0.78, 0.45, wz, 1.6);
    }

    this._hoverX = this._label("—", "#ffc53d", 0, 0.7, 0, 1.9);
    this._hoverY = this._label("—", "#98a4b3", 0, 0.7, 0, 1.9);
    this._hoverX.visible = false;
    this._hoverY.visible = false;
  }

  setHover(cell) {
    if (!cell) {
      if (this._hoverX) this._hoverX.visible = false;
      if (this._hoverY) this._hoverY.visible = false;
      return;
    }
    this._setSpriteText(this._hoverX, String(cell.x), "#ffc53d");
    this._setSpriteText(this._hoverY, String(cell.y), "#c5d0dc");
    this._hoverX.position.set(this._worldX(cell.x), 0.85, -this._hd - this._pad * 0.72);
    this._hoverY.position.set(this._hw + this._pad * 0.78, 0.85, this._worldZ(cell.y));
    this._hoverX.visible = true;
    this._hoverY.visible = true;
  }

  _worldX(i) {
    return (i - (this.width - 1) * 0.5) * this.cellSize;
  }

  _worldZ(j) {
    return (j - (this.height - 1) * 0.5) * this.cellSize;
  }

  _edge(hex, ax, ay, az, bx, by, bz, radius) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.85,
    });
    this._mats.push(mat);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
    mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize(),
    );
    this.group.add(mesh);
    this._parts.push(mesh);
  }

  _tickMark(x, y, z, sx, sy, sz, hex) {
    const mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8 });
    this._mats.push(mat);
    const t = Math.max(0.05, this.cellSize * 0.06);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx || t, t, sz || t),
      mat,
    );
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this._parts.push(mesh);
  }

  _letter(ch, css, x, y, z) {
    const spr = makeLabel(ch, css, 2.1);
    spr.position.set(x, y, z);
    this.group.add(spr);
    this._sprites.push(spr);
  }

  _label(text, css, x, y, z, scale) {
    const spr = makeLabel(text, css, scale);
    spr.position.set(x, y, z);
    this.group.add(spr);
    this._sprites.push(spr);
    return spr;
  }

  _setSpriteText(spr, text, css) {
    if (!spr) return;
    const ctx = spr.userData.tex.image.getContext("2d");
    const { width, height } = spr.userData.tex.image;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "700 32px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = css;
    ctx.fillText(text, width / 2, height / 2);
    spr.userData.tex.needsUpdate = true;
  }

  _clear() {
    for (const p of this._parts) {
      this.group.remove(p);
      p.geometry.dispose();
    }
    this._parts.length = 0;
    for (const s of this._sprites) {
      this.group.remove(s);
      disposeSprite(s);
    }
    this._sprites.length = 0;
    for (const m of this._mats) m.dispose();
    this._mats.length = 0;
    this._hoverX = null;
    this._hoverY = null;
  }

  dispose() {
    this._clear();
    this.scene.remove(this.group);
  }
}

export class PlaneHairlines {
  constructor(scene) {
    this.toX = makeLine(COLOR.gold, 0.85);
    this.toY = makeLine(0xc5d0dc, 0.85);
    scene.add(this.toX);
    scene.add(this.toY);
    this.hide();
  }

  setCell(cell, width, height, cellSize) {
    if (!cell) {
      this.hide();
      return;
    }
    const ox = (width - 1) * 0.5;
    const oz = (height - 1) * 0.5;
    const wx = (cell.x - ox) * cellSize;
    const wz = (cell.y - oz) * cellSize;
    const hw = (width * cellSize) / 2;
    const hd = (height * cellSize) / 2;
    const y = 0.04;
    setLine(this.toX, wx, y, wz, wx, y, -hd);
    setLine(this.toY, wx, y, wz, hw, y, wz);
    this.toX.visible = true;
    this.toY.visible = true;
  }

  hide() {
    this.toX.visible = false;
    this.toY.visible = false;
  }

  dispose(scene) {
    scene.remove(this.toX);
    scene.remove(this.toY);
    this.toX.geometry.dispose();
    this.toY.geometry.dispose();
    this.toX.material.dispose();
    this.toY.material.dispose();
  }
}
