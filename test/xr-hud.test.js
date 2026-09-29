import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HUD_WIDGETS,
  XR_BTN_PRIMARY,
  XR_BTN_SECONDARY,
  XR_BTN_STICK,
  XR_PINCH_MIN_M,
  XR_RING_PICK_M,
  XR_YAW_STICK_DEADZONE,
  arShadeLabel,
  arSourceLabel,
  axisDragBack,
  buttonPressed,
  distance3,
  distPointToSegment3,
  facePadsByHand,
  gripPressed,
  hoverEnterPulse,
  hudActionFromHit,
  hudWidgetById,
  inverseQuat,
  isHeadsetArSession,
  layerStepsFromStick,
  magFromPinch,
  midpoint3,
  yawDeltaFromPinchHands,
  magDeltaFromStick,
  nextArSourceKind,
  nextShadeMode,
  nextSliceAxis,
  axisStepsFromStick,
  XR_EXIT_HOLD_S,
  holdProgress,
  parkHudPose,
  pickHudWidget,
  pointCircleDist,
  pulseHaptic,
  rayAabb,
  rayCircleHit,
  rayFromPose,
  risingEdge,
  stickAxesForHeadset,
  stickClickHeld,
  exitHoldPressed,
  leftExitHoldPressed,
  tickStickLongPress,
  strongestStickX,
  thumbstickXFromAxes,
  thumbstickYFromAxes,
  widgetCenter,
  worldRayToLocal,
  yawDeltaFromStick,
  yawGrabDelta,
} from "../src/xr-hud.js";
import { XR_MAG_MAX, XR_MAG_MIN } from "../src/xr.js";

describe("isHeadsetArSession", () => {
  it("is false without a session", () => {
    assert.equal(isHeadsetArSession(undefined), false);
    assert.equal(isHeadsetArSession(null), false);
  });

  it("is false for a phone screen overlay even with a Quest UA", () => {
    assert.equal(
      isHeadsetArSession(
        { domOverlayState: { type: "screen" }, inputSources: [{ targetRayMode: "tracked-pointer" }] },
        "OculusBrowser/32",
      ),
      false,
    );
  });

  it("is true for a floating overlay", () => {
    assert.equal(isHeadsetArSession({ domOverlayState: { type: "floating" } }), true);
  });

  it("is true for Quest UA when overlay is missing", () => {
    assert.equal(isHeadsetArSession({}, "Mozilla/5.0 OculusBrowser/36.0 Quest"), true);
  });

  it("is true for a tracked-pointer when overlay is not screen", () => {
    assert.equal(
      isHeadsetArSession({
        inputSources: [{ targetRayMode: "tracked-pointer", profiles: [] }],
      }),
      true,
    );
  });

  it("is false for a phone without overlay grant and only a screen ray", () => {
    assert.equal(
      isHeadsetArSession(
        { inputSources: [{ targetRayMode: "screen" }] },
        "Mozilla/5.0 (Linux; Android 14) Chrome/140.0.0.0",
      ),
      false,
    );
  });
});

describe("parkHudPose", () => {
  it("parks at eye height to the viewer's right of the table anchor", () => {
    const pose = parkHudPose({ x: 0, y: 0, z: -0.8 }, { x: 0, y: 1.6, z: 0 }, 0.32);
    assert.ok(Math.abs(pose.x - 0.32) < 1e-9);
    assert.equal(pose.y, 1.6);
    assert.ok(Math.abs(pose.z + 0.8) < 1e-9);
  });
});

describe("rayAabb and pickHudWidget", () => {
  it("hits a box from in front", () => {
    const t = rayAabb(
      { x: 0, y: 0, z: 0.2 },
      { x: 0, y: 0, z: -1 },
      { x: -0.1, y: -0.1, z: -0.02 },
      { x: 0.1, y: 0.1, z: 0.02 },
    );
    assert.ok(t > 0);
    assert.ok(t < 0.25);
  });

  it("picks Play from a ray aimed at the play button", () => {
    const play = hudWidgetById("play");
    const c = widgetCenter(play);
    const hit = pickHudWidget({ x: c.x, y: c.y, z: 0.2 }, { x: 0, y: 0, z: -1 });
    assert.equal(hit.id, "play");
    assert.equal(hit.kind, "button");
  });

  it("picks Exit on the lower button", () => {
    const exit = hudWidgetById("exit");
    const c = widgetCenter(exit);
    const hit = pickHudWidget({ x: c.x, y: c.y, z: 0.2 }, { x: 0, y: 0, z: -1 });
    assert.equal(hit.id, "exit");
  });

  it("picks stand X on the left stand button", () => {
    const stand = hudWidgetById("stand-x");
    const c = widgetCenter(stand);
    const hit = pickHudWidget({ x: c.x, y: c.y, z: 0.2 }, { x: 0, y: 0, z: -1 });
    assert.equal(hit.id, "stand-x");
  });
});

describe("hudActionFromHit", () => {
  it("fires play, stand, and exit", () => {
    assert.deepEqual(hudActionFromHit({ id: "play", kind: "button" }), { type: "play" });
    assert.deepEqual(hudActionFromHit({ id: "exit", kind: "button" }), { type: "exit" });
    assert.deepEqual(hudActionFromHit({ id: "stand-x", kind: "button" }), { type: "stand", axis: "x" });
    assert.deepEqual(hudActionFromHit({ id: "stand-z", kind: "button" }), { type: "stand", axis: "z" });
    assert.equal(hudActionFromHit({ id: "z", kind: "slider" }), null);
  });
});

describe("thumbstick yaw", () => {
  it("ignores the deadzone", () => {
    assert.equal(yawDeltaFromStick(XR_YAW_STICK_DEADZONE * 0.5, 1), 0);
  });

  it("turns from a full stick", () => {
    const d = yawDeltaFromStick(1, 0.5, Math.PI);
    assert.ok(d > 1);
    assert.ok(d < Math.PI);
  });

  it("reads xr-standard stick X from axes[2]", () => {
    assert.equal(thumbstickXFromAxes([0, 0, 0.4, -0.1]), 0.4);
    assert.equal(thumbstickXFromAxes([0.9]), 0.9);
  });

  it("picks the stronger of two sticks", () => {
    assert.equal(strongestStickX([0.2, -0.8]), -0.8);
  });
});

describe("grip pinch size", () => {
  it("scales mag with hand distance", () => {
    assert.equal(magFromPinch(1, 0.2, 0.4), 2);
    assert.equal(magFromPinch(1, 0.2, 0.1), 0.5);
  });

  it("clamps to the AR mag range", () => {
    assert.equal(magFromPinch(1, 0.1, 2), XR_MAG_MAX);
    assert.equal(magFromPinch(1, 1, 0.01), XR_MAG_MIN);
  });

  it("ignores a too-small start span", () => {
    assert.equal(magFromPinch(1, XR_PINCH_MIN_M * 0.5, 0.2), 1);
  });

  it("treats squeeze as button 1", () => {
    assert.equal(gripPressed({ buttons: [{ pressed: false }, { pressed: true }] }), true);
    assert.equal(gripPressed({ buttons: [{ pressed: true }] }), false);
  });

  it("measures a 3D span", () => {
    assert.equal(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  });
});

describe("worldRayToLocal", () => {
  it("is identity at the origin with a unit quat", () => {
    const local = worldRayToLocal(
      { x: 0.1, y: 0, z: 0.2 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
    );
    assert.deepEqual(local.origin, { x: 0.1, y: 0, z: 0.2 });
    assert.deepEqual(local.dir, { x: 0, y: 0, z: -1 });
  });

  it("round-trips inverseQuat on a forward ray", () => {
    const q = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const inv = inverseQuat(q);
    assert.equal(inv.y, -q.y);
    const ray = rayFromPose({ x: 0, y: 0, z: 0 }, q);
    assert.ok(Math.abs(ray.dir.x + 1) < 1e-9);
    assert.ok(Math.abs(ray.dir.z) < 1e-9);
  });
});

describe("HUD_WIDGETS", () => {
  it("is Play, stand X/Y/Z, and Exit", () => {
    assert.deepEqual(
      HUD_WIDGETS.map((w) => w.id),
      ["play", "stand-x", "stand-y", "stand-z", "exit"],
    );
  });
});

describe("hover enter pulse", () => {
  it("pulses only when entering or switching a frame key", () => {
    assert.equal(hoverEnterPulse("", "x:focus"), true);
    assert.equal(hoverEnterPulse("x:focus", "x:focus"), false);
    assert.equal(hoverEnterPulse("x:focus", "y:focus"), true);
    assert.equal(hoverEnterPulse("x:focus", ""), false);
    assert.equal(hoverEnterPulse("", ""), false);
  });
});

describe("stick by handedness", () => {
  it("keeps yaw and zoom on a single tracked source", () => {
    const axes = stickAxesForHeadset([
      { handedness: "right", gamepad: { axes: [0, 0, 0.7, -0.5] } },
    ]);
    assert.equal(axes.yawX, 0.7);
    assert.equal(axes.zoomY, -0.5);
    assert.equal(axes.layerX, 0);
  });

  it("maps right yaw/zoom and left layer/axis", () => {
    const axes = stickAxesForHeadset([
      { handedness: "left", gamepad: { axes: [0, 0, 0.9, 0.4] } },
      { handedness: "right", gamepad: { axes: [0, 0, -0.6, 0.8] } },
    ]);
    assert.equal(axes.yawX, -0.6);
    assert.equal(axes.zoomY, 0.8);
    assert.equal(axes.layerX, 0.9);
    assert.equal(axes.axisY, 0.4);
  });

  it("falls back to index order when handedness is missing", () => {
    const axes = stickAxesForHeadset([
      { gamepad: { axes: [0, 0, 0.1, 0.3] } },
      { gamepad: { axes: [0, 0, 0.5, -0.2] } },
    ]);
    assert.equal(axes.yawX, 0.5);
    assert.equal(axes.zoomY, -0.2);
    assert.equal(axes.layerX, 0.1);
    assert.equal(axes.axisY, 0.3);
  });
});

describe("shade and source cycle", () => {
  it("cycles Hull → Ghost → Cuts", () => {
    assert.equal(nextShadeMode("hull"), "ghost");
    assert.equal(nextShadeMode("ghost"), "triple");
    assert.equal(nextShadeMode("triple"), "hull");
    assert.equal(nextShadeMode("other"), "hull");
  });

  it("cycles showcase sources and respects allowCycle", () => {
    assert.equal(nextArSourceKind("mni152-low"), "mni152");
    assert.equal(nextArSourceKind("conway"), "mni152-low");
    assert.equal(nextArSourceKind("count"), "mni152-low");
    assert.equal(nextArSourceKind("mni152", { allowCycle: false }), null);
  });

  it("labels sources and shades for controllers", () => {
    assert.equal(arSourceLabel("mni152-low"), "MRI Low");
    assert.equal(arSourceLabel("conway"), "Life");
    assert.equal(arShadeLabel("triple"), "Cuts");
    assert.equal(arShadeLabel("ghost"), "Ghost");
  });
});

describe("two-grip pinch helpers", () => {
  it("midpoints two hands", () => {
    assert.deepEqual(midpoint3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }), {
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("yaws when hands twist in the floor plane", () => {
    const prevA = { x: -0.2, y: 1, z: 0 };
    const prevB = { x: 0.2, y: 1, z: 0 };
    // Rotate 90° CCW around Y: (−0.2,0)→(0,−0.2), (0.2,0)→(0,0.2) in XZ? 
    // atan2(z,x): was atan2(0,0.4)-atan2(0,-0.4) = 0 - π = weird.
    // Simpler: prev along +X, next along +Z → +π/2.
    const a0 = { x: 0, y: 1, z: 0 };
    const b0 = { x: 1, y: 1, z: 0 };
    const a1 = { x: 0, y: 1, z: 0 };
    const b1 = { x: 0, y: 1, z: 1 };
    const d = yawDeltaFromPinchHands(a1, b1, a0, b0);
    assert.ok(Math.abs(d - Math.PI / 2) < 1e-6);
    assert.equal(yawDeltaFromPinchHands(a0, b0, a0, b0), 0);
  });
});

describe("zoom and axis stick helpers", () => {
  it("zooms from stick Y and ignores the deadzone", () => {
    assert.equal(magDeltaFromStick(0.05, 1), 0);
    const d = magDeltaFromStick(-1, 0.5);
    assert.ok(d > 0);
  });

  it("accumulates axis steps like layers", () => {
    const a = axisStepsFromStick(1, 0.3, 0);
    assert.ok(a.steps >= 0);
    assert.ok(XR_EXIT_HOLD_S >= 0.5);
    assert.ok(XR_EXIT_HOLD_S < 2);
  });

  it("detects stick-click / menu hold and resets on release", () => {
    let s = { ms: 0, armed: false };
    s = tickStickLongPress(true, 0.4, s, 0.7);
    assert.equal(s.fired, false);
    s = tickStickLongPress(true, 0.4, s, 0.7);
    assert.equal(s.fired, true);
    assert.equal(s.armed, true);
    s = tickStickLongPress(false, 0.1, s, 0.7);
    assert.equal(s.armed, false);
    assert.equal(s.ms, 0);
  });

  it("arms Exit in about 0.7s of real frame time", () => {
    let s = { ms: 0, armed: false };
    // 43 × 16ms = 0.688s; 44th frame crosses 0.7s
    for (let i = 0; i < 43; i += 1) {
      s = tickStickLongPress(true, 0.016, s, XR_EXIT_HOLD_S);
      assert.equal(s.fired, false);
    }
    s = tickStickLongPress(true, 0.016, s, XR_EXIT_HOLD_S);
    assert.equal(s.fired, true);
  });

  it("treats stick click as Exit hold and ignores idle analog noise", () => {
    const clickPad = { buttons: [{}, {}, {}, { pressed: true, value: 1 }] };
    const noisyPad = { buttons: [{}, {}, {}, { pressed: false, value: 0.4 }] };
    assert.equal(stickClickHeld(clickPad), true);
    assert.equal(stickClickHeld(noisyPad), false);
    assert.equal(exitHoldPressed(clickPad), true);
    assert.equal(exitHoldPressed({ buttons: [] }), false);
  });

  it("arms Exit from the left stick only", () => {
    const click = { buttons: [{}, {}, {}, { pressed: true, value: 1 }] };
    const idle = { buttons: [{}, {}, {}, { pressed: false, value: 0 }] };
    assert.equal(
      leftExitHoldPressed([
        { handedness: "right", gamepad: click },
        { handedness: "left", gamepad: idle },
      ]),
      false,
    );
    assert.equal(
      leftExitHoldPressed([
        { handedness: "right", gamepad: idle },
        { handedness: "left", gamepad: click },
      ]),
      true,
    );
    assert.equal(leftExitHoldPressed([{ gamepad: click }]), true);
  });
  it("computes hold progress for fill bars", () => {
    assert.equal(holdProgress(0, 0.7), 0);
    assert.equal(holdProgress(0.35, 0.7), 0.5);
    assert.equal(holdProgress(1, 0.7), 1);
  });
});

describe("face pads by hand", () => {
  function pad(primary, secondary, stick) {
    const buttons = [];
    for (let i = 0; i < 6; i += 1) buttons.push({ pressed: false });
    buttons[XR_BTN_PRIMARY] = { pressed: primary };
    buttons[XR_BTN_SECONDARY] = { pressed: secondary };
    buttons[XR_BTN_STICK] = { pressed: stick };
    return { buttons };
  }

  it("puts a single source in solo", () => {
    const pads = facePadsByHand([
      { handedness: "right", gamepad: pad(true, false, true) },
    ]);
    assert.equal(pads.solo.primary, true);
    assert.equal(pads.solo.stick, true);
    assert.equal(pads.left.primary, false);
  });

  it("splits left X/Y and right A/B", () => {
    const pads = facePadsByHand([
      { handedness: "left", gamepad: pad(true, true, false) },
      { handedness: "right", gamepad: pad(false, true, true) },
    ]);
    assert.equal(pads.solo, null);
    assert.equal(pads.left.primary, true);
    assert.equal(pads.left.secondary, true);
    assert.equal(pads.right.secondary, true);
    assert.equal(pads.right.stick, true);
    assert.equal(pads.right.primary, false);
  });
});

describe("stick layers and face buttons", () => {
  it("reads thumbstick Y from axes[3]", () => {
    assert.equal(thumbstickYFromAxes([0, 0.2, 0.1, -0.6]), -0.6);
    assert.equal(thumbstickYFromAxes([0.1, 0.4]), 0.4);
  });

  it("accumulates steps and drops them inside the deadzone", () => {
    const nudged = layerStepsFromStick(1, 0.05, 0);
    assert.equal(nudged.steps, 0);
    assert.ok(nudged.acc > 0);
    const held = layerStepsFromStick(1, 0.2, nudged.acc);
    assert.ok(held.steps >= 1);
    assert.deepEqual(layerStepsFromStick(0.05, 1, 3), { steps: 0, acc: 0 });
    assert.ok(XR_YAW_STICK_DEADZONE > 0.05);
  });

  it("cycles X, Y, Z", () => {
    assert.equal(nextSliceAxis("x"), "y");
    assert.equal(nextSliceAxis("y"), "z");
    assert.equal(nextSliceAxis("z"), "x");
  });

  it("maps A/X, B/Y, and the stick click", () => {
    const buttons = [
      { pressed: false },
      { pressed: false },
      { pressed: false },
      { pressed: true },
      { pressed: true },
      { pressed: false },
    ];
    assert.equal(buttonPressed({ buttons }, XR_BTN_STICK), true);
    assert.equal(buttonPressed({ buttons }, XR_BTN_PRIMARY), true);
    assert.equal(buttonPressed({ buttons }, XR_BTN_SECONDARY), false);
    assert.equal(risingEdge(true, false), true);
    assert.equal(risingEdge(true, true), false);
  });
});

describe("plane slide, ring, and haptics", () => {
  it("moves the plane with the hand along the axis", () => {
    const back = axisDragBack(
      { x: 0, y: 0.3, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      0.1,
      8,
    );
    assert.equal(back, 5);
  });

  it("measures a point against a segment", () => {
    assert.ok(distPointToSegment3(0, 0.02, 0.5, 0, 0, 0, 0, 0, 1) < 0.03);
  });

  it("yaws when the hand swings around the anchor", () => {
    const d = yawGrabDelta(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    assert.ok(Math.abs(d - Math.PI / 2) < 1e-6 || Math.abs(d + Math.PI / 2) < 1e-6);
  });

  it("hits the floor ring from above and misses the middle", () => {
    const center = { x: 0, y: 0, z: 0 };
    const up = { x: 0, y: 1, z: 0 };
    const hit = rayCircleHit({ x: 0.2, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, center, up, 0.2);
    assert.ok(hit && hit.t > 0);
    assert.equal(
      rayCircleHit({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, center, up, 0.2),
      null,
    );
    assert.ok(pointCircleDist({ x: 0.2, y: 0, z: 0 }, center, up, 0.2) < 1e-6);
    assert.ok(pointCircleDist({ x: 0.2, y: 0.1, z: 0 }, center, up, 0.2) > XR_RING_PICK_M);
  });

  it("pulses a haptic actuator and ignores a bare gamepad", () => {
    let seen = null;
    const pad = {
      hapticActuators: [
        {
          pulse(value, ms) {
            seen = { value, ms };
          },
        },
      ],
    };
    assert.equal(pulseHaptic(pad, 0.4, 20), true);
    assert.deepEqual(seen, { value: 0.4, ms: 20 });
    assert.equal(pulseHaptic({ buttons: [] }), false);
  });
});
