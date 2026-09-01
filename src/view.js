/**
 * Perspective orbit vs orthographic (no parallax). Look direction stays.
 */

import * as THREE from "three";
import { frustumFromDistance } from "./orbit.js";

export function createOrthoCamera() {
  const camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 400);
  camera.userData.frustumH = 16;
  return camera;
}

export function setOrthoFrustum(camera, halfH, aspect, near, far) {
  const a = Math.max(0.2, Number(aspect) || 1);
  const h = Math.max(0.5, Number(halfH) || 16);
  camera.userData.frustumH = h;
  camera.left = -h * a;
  camera.right = h * a;
  camera.top = h;
  camera.bottom = -h;
  if (near != null) camera.near = near;
  if (far != null) camera.far = far;
  camera.updateProjectionMatrix();
}

export function applyOrthoAspect(camera, aspect) {
  setOrthoFrustum(camera, camera.userData.frustumH || 16, aspect, camera.near, camera.far);
}

export function copyCameraPose(from, to) {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.up.copy(from.up);
}

export function enterOrtho({ persp, ortho, controls, aspect, fov, target }) {
  copyCameraPose(persp, ortho);
  const dist = Math.hypot(
    persp.position.x - target.x,
    persp.position.y - target.y,
    persp.position.z - target.z,
  );
  const halfH = frustumFromDistance(dist, fov ?? persp.fov);
  setOrthoFrustum(ortho, halfH, aspect, persp.near, persp.far);
  ortho.zoom = 1;
  ortho.updateProjectionMatrix();
  ortho.lookAt(target.x, target.y, target.z);
  controls.object = ortho;
  controls.enableRotate = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.update();
}

export function exitOrtho({ persp, ortho, controls, target }) {
  copyCameraPose(ortho, persp);
  persp.lookAt(target.x, target.y, target.z);
  controls.object = persp;
  controls.enableRotate = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.update();
}
