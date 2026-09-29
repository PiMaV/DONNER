import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HUD_WIDGETS,
  PALETTE_WIDGETS,
  XR_BTN_PRIMARY,
  XR_BTN_SECONDARY,
  XR_BTN_STICK,
  XR_PALETTE_DISTANCE_M,
  XR_PALETTE_LEFT_M,
  XR_PINCH_MIN_M,
  XR_RING_PICK_M,
  XR_YAW_STICK_DEADZONE,
  axisDragBack,
  buttonPressed,
  distance3,
  distPointToSegment3,
  gripPressed,
  hudActionFromHit,
  hudWidgetById,
  inverseQuat,
  isHeadsetArSession,
  layerStepsFromStick,
  magFromPinch,
  nextSliceAxis,
  paletteActionFromHit,
  paletteHeadPose,
  parkHudPose,
  pickHudWidget,
  pickPalettePoint,
  pickPaletteWidget,
  pointCircleDist,
  pulseHaptic,
  rayAabb,
  rayCircleHit,
  rayFromPose,
  risingEdge,
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

describe("headset palette", () => {
  it("lists play, spin, axes, sources, shade, and hide", () => {
    assert.deepEqual(
      PALETTE_WIDGETS.map((w) => w.id),
      [
        "play",
        "spin",
        "axis-x",
        "axis-y",
        "axis-z",
        "src-mni152-low",
        "src-mni152",
        "src-ignition",
        "src-conway",
        "shade-hull",
        "shade-ghost",
        "shade-triple",
        "hide-center",
        "hide-outer",
      ],
    );
  });

  it("parks left of a forward-looking head", () => {
    const pose = paletteHeadPose(
      { x: 0, y: 1.6, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
    );
    assert.ok(pose.x < -XR_PALETTE_LEFT_M * 0.5);
    assert.ok(pose.z < -XR_PALETTE_DISTANCE_M * 0.5);
    assert.equal(pose.lookY, 1.6);
  });

  it("picks Play from a ray into the sheet", () => {
    const play = PALETTE_WIDGETS[0];
    const origin = { x: 0, y: (play.min.y + play.max.y) * 0.5, z: 0.2 };
    const hit = pickPaletteWidget(origin, { x: 0, y: 0, z: -1 });
    assert.equal(hit.id, "play");
    assert.deepEqual(paletteActionFromHit(hit), { type: "play" });
  });

  it("picks a source and a hide flag from a grip point", () => {
    const src = PALETTE_WIDGETS.find((w) => w.id === "src-conway");
    const hit = pickPalettePoint({
      x: (src.min.x + src.max.x) * 0.5,
      y: (src.min.y + src.max.y) * 0.5,
      z: 0,
    });
    assert.deepEqual(paletteActionFromHit(hit), { type: "source", kind: "conway" });
    const hide = PALETTE_WIDGETS.find((w) => w.id === "hide-center");
    const hideHit = pickPalettePoint({
      x: (hide.min.x + hide.max.x) * 0.5,
      y: (hide.min.y + hide.max.y) * 0.5,
      z: 0.04,
    });
    assert.deepEqual(paletteActionFromHit(hideHit), { type: "hide-center" });
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
