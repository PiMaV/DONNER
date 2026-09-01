import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HUD_WIDGETS,
  XR_PINCH_MIN_M,
  XR_YAW_STICK_DEADZONE,
  distance3,
  gripPressed,
  hudActionFromHit,
  hudWidgetById,
  inverseQuat,
  isHeadsetArSession,
  magFromPinch,
  parkHudPose,
  pickHudWidget,
  rayAabb,
  rayFromPose,
  strongestStickX,
  thumbstickXFromAxes,
  widgetCenter,
  worldRayToLocal,
  yawDeltaFromStick,
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
