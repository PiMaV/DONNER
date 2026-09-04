import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../face-lab.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/face-lab.js", import.meta.url), "utf8");

describe("Face lab page", () => {
  it("is a camera + overlay viewer without Three.js or MRI", () => {
    assert.match(html, /id="cam"/);
    assert.match(html, /id="overlay"/);
    assert.match(html, /id="btn-start"/);
    assert.match(html, /src="\.\/src\/face-lab\.js"/);
    assert.doesNotMatch(html, /three/);
    assert.doesNotMatch(html, /mni152/);
    assert.match(js, /startFaceCamera/);
    assert.match(js, /loadFaceLandmarker/);
    assert.match(js, /drawFaceLandmarks/);
    assert.doesNotMatch(js, /drawHeadHull/);
    assert.doesNotMatch(js, /createHeadLock/);
    assert.doesNotMatch(js, /tryLoadPoseLandmarker/);
    assert.match(js, /Camera stays on/);
  });
});
