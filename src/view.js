/**
 * Perspective orbit vs orthographic bird-eye (top-down onto the focus plane).
 */

import * as THREE from "three";

const BIRD_ALT = 80;
const BIRD_NUDGE = 0.05;
const PAD = 1.2;

let saved = null;

export function createBirdCamera() {
  const camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 400);
  camera.userData.frustumH = 16;
  return camera;
}

export function fitBirdFrustum(camera, width, height, cellSize, aspect) {
  const a = Math.max(0.2, aspect);
  const halfX = width * cellSize * 0.5 * PAD;
  const halfZ = height * cellSize * 0.5 * PAD;
  const frustumH = Math.max(halfZ, halfX / a);
  camera.userData.frustumH = frustumH;
  applyBirdAspect(camera, a);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}

export function applyBirdAspect(camera, aspect) {
  const h = camera.userData.frustumH || 16;
  const w = h * Math.max(0.2, aspect);
  camera.left = -w;
  camera.right = w;
  camera.top = h;
  camera.bottom = -h;
  camera.updateProjectionMatrix();
}

export function enterBirdEye({ persp, bird, controls, width, height, cellSize, aspect }) {
  if (!saved) {
    saved = {
      pos: persp.position.clone(),
      target: controls.target.clone(),
    };
  }
  const tx = controls.target.x;
  const tz = controls.target.z;
  bird.position.set(tx, BIRD_ALT, tz + BIRD_NUDGE);
  fitBirdFrustum(bird, width, height, cellSize, aspect);
  controls.object = bird;
  controls.target.set(tx, 0, tz);
  controls.enableRotate = false;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = 0.15;
  controls.touches.ONE = THREE.TOUCH.PAN;
  controls.update();
}

export function exitBirdEye({ persp, controls }) {
  controls.object = persp;
  if (saved) {
    persp.position.copy(saved.pos);
    controls.target.copy(saved.target);
    saved = null;
  }
  controls.enableRotate = true;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI - 0.08;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.update();
}
