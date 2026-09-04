import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FACE_IRIS_CENTER_INDEXES,
  FACE_LEFT_IRIS_CONNECTIONS,
  FACE_OVAL_CONNECTIONS,
  FACE_RIGHT_IRIS_CONNECTIONS,
  FACE_LANDMARKER_VERSION,
  FACE_MODEL_URL,
  FACE_VISION_MODULE_URL,
  FACE_WASM_ROOT,
  closeFaceLandmarker,
  detectFaceForVideo,
  faceCameraConstraints,
  faceIrisConnections,
  faceMeshConnections,
  faceOvalConnections,
  isFaceArSupported,
  loadFaceLandmarker,
  parseFaceQuery,
  preferEnvironmentCamera,
  startFaceCamera,
  stopFaceCamera,
  pickSelfieDeviceId,
  isSelfieCameraLabel,
  friendlyCameraLabel,
  friendlyCameraLabels,
  mirrorFromCamera,
  videoInputDevices,
  faceUsesPhoneChrome,
} from "../src/face-ar.js";

describe("face AR gate and camera", () => {
  it("parses ?face=1 and ignores other values", () => {
    assert.equal(parseFaceQuery("?face=1"), true);
    assert.equal(parseFaceQuery("?src=mni152-low&face=true"), true);
    assert.equal(parseFaceQuery("?face=0"), false);
    assert.equal(parseFaceQuery(""), false);
  });

  it("hides Face AR on a Quest UA even when getUserMedia exists", () => {
    const mediaDevices = { getUserMedia() {} };
    assert.equal(
      isFaceArSupported({ mediaDevices, userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 3) OculusBrowser/1" }),
      false,
    );
    assert.equal(isFaceArSupported({ mediaDevices, userAgent: "Mozilla/5.0" }), true);
    assert.equal(isFaceArSupported({ mediaDevices: {}, userAgent: "Mozilla/5.0" }), false);
  });

  it("uses phone Face chrome only on a narrow or short coarse viewport", () => {
    assert.equal(faceUsesPhoneChrome({}), false);
    assert.equal(faceUsesPhoneChrome({ coarse: true }), false);
    assert.equal(faceUsesPhoneChrome({ narrow: true }), true);
    assert.equal(faceUsesPhoneChrome({ coarse: true, short: true }), true);
    assert.equal(faceUsesPhoneChrome({ coarse: true, narrow: false, short: false }), false);
  });

  it("always prefers the selfie camera on phone and desktop", () => {
    assert.equal(preferEnvironmentCamera({ phone: true }), false);
    assert.equal(preferEnvironmentCamera({ phone: false }), false);
    assert.equal(preferEnvironmentCamera({}), false);
    assert.equal(faceCameraConstraints({ environment: true }).video.facingMode.ideal, "environment");
    assert.equal(faceCameraConstraints({ environment: false }).video.facingMode.ideal, "user");
    assert.equal(faceCameraConstraints({ deviceId: "cam-2" }).video.deviceId.exact, "cam-2");
  });

  it("picks a labeled selfie device when several cameras exist", () => {
    const cams = [
      { kind: "videoinput", deviceId: "back", label: "Back Camera" },
      { kind: "videoinput", deviceId: "front", label: "Front Camera" },
    ];
    assert.deepEqual(
      videoInputDevices([...cams, { kind: "audioinput", deviceId: "mic" }]),
      cams,
    );
    assert.equal(isSelfieCameraLabel("FaceTime HD"), true);
    assert.equal(isSelfieCameraLabel("Back Camera"), false);
    assert.equal(pickSelfieDeviceId(cams), "front");
    assert.equal(mirrorFromCamera({ facingMode: "user" }), true);
    assert.equal(mirrorFromCamera({ facingMode: "environment" }), false);
    assert.equal(mirrorFromCamera({ label: "Back Camera" }), false);
  });

  it("names known cameras Selfie / Rear instead of device indexes", () => {
    assert.equal(friendlyCameraLabel({ label: "Front Camera" }), "Selfie camera");
    assert.equal(friendlyCameraLabel({ label: "Back Camera" }), "Rear camera");
    assert.deepEqual(
      friendlyCameraLabels([
        { deviceId: "a", label: "camera2 0, facing back" },
        { deviceId: "b", label: "camera2 1, facing front" },
        { deviceId: "c", label: "camera2 2, facing back" },
      ]),
      ["Rear camera 1", "Selfie camera", "Rear camera 2"],
    );
  });

  it("pins MediaPipe 0.10.21 WASM (0.10.22 404s on jsDelivr) and the Face Landmarker model", () => {
    assert.equal(FACE_LANDMARKER_VERSION, "0.10.21");
    assert.match(FACE_VISION_MODULE_URL, /vision_bundle\.mjs/);
    assert.match(FACE_WASM_ROOT, /@mediapipe\/tasks-vision@0\.10\.21\/wasm/);
    assert.match(FACE_MODEL_URL, /face_landmarker\.task/);
  });

  it("reads tessellation from the landmarker constructor", () => {
    function Fake() {}
    Fake.FACE_LANDMARKS_TESSELATION = [{ start: 0, end: 1 }];
    Fake.FACE_LANDMARKS_FACE_OVAL = [{ start: 10, end: 338 }];
    Fake.FACE_LANDMARKS_LEFT_IRIS = [{ start: 474, end: 475 }];
    Fake.FACE_LANDMARKS_RIGHT_IRIS = [{ start: 469, end: 470 }];
    const inst = new Fake();
    assert.deepEqual(faceMeshConnections(inst), [{ start: 0, end: 1 }]);
    assert.deepEqual(faceMeshConnections(null), []);
    assert.deepEqual(faceOvalConnections(inst), [{ start: 10, end: 338 }]);
    assert.equal(faceOvalConnections(null).length, FACE_OVAL_CONNECTIONS.length);
    assert.equal(faceOvalConnections(null)[0].start, 10);
    assert.deepEqual(faceIrisConnections(inst), [
      { start: 474, end: 475 },
      { start: 469, end: 470 },
    ]);
    assert.equal(
      faceIrisConnections(null).length,
      FACE_LEFT_IRIS_CONNECTIONS.length + FACE_RIGHT_IRIS_CONNECTIONS.length,
    );
    assert.deepEqual(FACE_IRIS_CENTER_INDEXES, [468, 473]);
  });

  it("starts and stops a fake camera stream", async () => {
    const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
    const stream = { getTracks() { return tracks; } };
    const video = { srcObject: null, play: async () => {} };
    const got = await startFaceCamera(video, {
      environment: true,
      getUserMedia: async (c) => {
        assert.equal(c.video.facingMode.ideal, "environment");
        return stream;
      },
    });
    assert.equal(got, stream);
    assert.equal(video.srcObject, stream);
    stopFaceCamera(stream, video);
    assert.equal(tracks[0].stopped, true);
    assert.equal(video.srcObject, null);
  });

  it("loads a landmarker through the injectable importer and skips empty video", async () => {
    const created = [];
    const landmarker = {
      detectForVideo() { return { facialTransformationMatrixes: [] }; },
      close() { created.push("close"); },
    };
    const loaded = await loadFaceLandmarker({
      importVision: async () => ({
        FaceLandmarker: {
          async createFromOptions(_fileset, opts) {
            created.push(opts.baseOptions.delegate);
            return landmarker;
          },
        },
        FilesetResolver: {
          async forVisionTasks() { return {}; },
        },
      }),
    });
    assert.equal(loaded, landmarker);
    assert.equal(created[0], "GPU");
    assert.equal(detectFaceForVideo(landmarker, { readyState: 0 }, 1), null);
    assert.deepEqual(detectFaceForVideo(landmarker, { readyState: 2 }, 8), {
      facialTransformationMatrixes: [],
    });
    closeFaceLandmarker(landmarker);
    assert.deepEqual(created, ["GPU", "close"]);
  });

  it("keeps oval and iris marks after lock instead of hiding the overlay", () => {
    const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
    assert.match(main, /faceOvalLinks = faceOvalConnections/);
    assert.match(main, /if \(faceLocked\) \{[\s\S]*?drawFaceLandmarks\(faceOverlayCtx, face, faceOvalLinks/);
    assert.match(main, /drawIrisDiscs/);
    assert.match(main, /drawPupilDiscs/);
    assert.match(main, /FACE_IRIS_FILL/);
    assert.doesNotMatch(main, /faceIrisLinks/);
    assert.doesNotMatch(main, /dots: FACE_IRIS_CENTER_INDEXES/);
    assert.doesNotMatch(main, /drawGazeCones/);
    assert.match(main, /createFaceTracker/);
    assert.match(main, /Initializing cameras/);
    assert.match(main, /Searching for a surface/);
    assert.match(main, /faceCamerasReady/);
    const ui = readFileSync(new URL("../src/ui.js", import.meta.url), "utf8");
    assert.match(ui, /arBtn\.hidden = !arSupported \|\| inAr \|\| presenting/);
    assert.doesNotMatch(ui, /arSupported \|\| faceSupported/);
    assert.doesNotMatch(main, /isImmersiveArSupported\(xr\)\) \{\s*await toggleFaceProject/);
    assert.match(main, /applyFacePlaneChrome/);
    assert.match(main, /startPreferredFaceCamera/);
    assert.match(main, /FACE_MAG_DEFAULT/);
    assert.doesNotMatch(main, /faceMagForCamera/);
    assert.doesNotMatch(main, /FACE_MAG_SELFIE/);
    assert.doesNotMatch(main, /createHeadLock/);
    assert.doesNotMatch(main, /tryLoadPoseLandmarker/);
    assert.doesNotMatch(main, /faceNeedsHeadFollow/);
  });
});
