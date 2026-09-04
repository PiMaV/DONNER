import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FACE_LANDMARKER_VERSION,
  FACE_MODEL_URL,
  FACE_VISION_MODULE_URL,
  FACE_WASM_ROOT,
  closeFaceLandmarker,
  detectFaceForVideo,
  faceCameraConstraints,
  faceMeshConnections,
  isFaceArSupported,
  loadFaceLandmarker,
  parseFaceQuery,
  preferEnvironmentCamera,
  startFaceCamera,
  stopFaceCamera,
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

  it("uses the back camera on a phone and the user camera on desktop", () => {
    assert.equal(preferEnvironmentCamera({ coarse: true, userAgent: "" }), true);
    assert.equal(preferEnvironmentCamera({ coarse: false, userAgent: "Linux x86_64" }), false);
    assert.equal(preferEnvironmentCamera({ coarse: false, userAgent: "Pixel 8 Android" }), true);
    assert.equal(faceCameraConstraints({ environment: true }).video.facingMode.ideal, "environment");
    assert.equal(faceCameraConstraints({ environment: false }).video.facingMode.ideal, "user");
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
    assert.deepEqual(faceMeshConnections(new Fake()), [{ start: 0, end: 1 }]);
    assert.deepEqual(faceMeshConnections(null), []);
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
});
