import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WolkeViewer,
  cubeFetchUrl,
  downloadUrl,
  fileNameFromPayload,
  normalizeBaseUrl,
} from "../src/wolke.js";

function fakeIo() {
  const handlers = new Map();
  const socket = {
    on(event, fn) {
      handlers.set(event, fn);
      return socket;
    },
    disconnect() {
      socket.disconnected = true;
    },
    emit(event, data) {
      handlers.get(event)?.(data);
    },
  };
  function io(url, opts) {
    io.url = url;
    io.opts = opts;
    io.socket = socket;
    return socket;
  }
  io.socket = socket;
  return io;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("WOLKE viewer URLs", () => {
  it("normalizes ws and trailing slashes", () => {
    assert.equal(normalizeBaseUrl("ws://127.0.0.1:5055/"), "http://127.0.0.1:5055");
    assert.equal(normalizeBaseUrl("wss://lab.example/"), "https://lab.example");
  });

  it("builds the contract GET URL", () => {
    assert.equal(
      downloadUrl("http://127.0.0.1:5055/", "evt", "stack.npy"),
      "http://127.0.0.1:5055/evt?filename=stack.npy",
    );
  });

  it("reads file_name from the socket payload", () => {
    assert.equal(fileNameFromPayload({ file_name: "stack.npy", index: 2 }), "stack.npy");
    assert.equal(fileNameFromPayload("stack.npy"), "stack.npy");
    assert.equal(fileNameFromPayload({}), "");
  });

  it("rewrites the cube GET through the same-origin proxy", () => {
    const direct = "http://127.0.0.1:5055/evt?filename=stack.npy";
    assert.equal(cubeFetchUrl(direct, ""), direct);
    assert.equal(cubeFetchUrl(direct, "file://"), direct);
    assert.equal(
      cubeFetchUrl(direct, "http://127.0.0.1:8765"),
      "http://127.0.0.1:8765/stream-npy?u=" + encodeURIComponent(direct),
    );
    assert.equal(
      cubeFetchUrl(direct, "https://lab.ole.icu"),
      "https://lab.ole.icu/stream-npy?u=" + encodeURIComponent(direct),
    );
  });
});

describe("WolkeViewer", () => {
  it("downloads the announced .npy and ignores a stale in-flight GET", async () => {
    const pending = [];
    const fetch = (url) =>
      new Promise((resolve) => {
        pending.push({
          url,
          resolve: (buf) =>
            resolve({
              ok: true,
              arrayBuffer: async () => buf,
            }),
        });
      });
    const io = fakeIo();
    const viewer = new WolkeViewer({ io, fetch, pageOrigin: "" });
    const got = [];
    viewer.connect({
      baseUrl: "http://127.0.0.1:5055",
      token: "evt",
      onNpy: (buf, name) => got.push([name, buf.byteLength]),
    });
    assert.equal(io.url, "http://127.0.0.1:5055");
    assert.equal(viewer.listening, true);

    const first = viewer._onFile({ file_name: "old.npy" });
    const second = viewer._onFile({ file_name: "stack.npy" });
    assert.equal(pending.length, 2);
    pending[1].resolve(new ArrayBuffer(4));
    await second;
    pending[0].resolve(new ArrayBuffer(8));
    await first;
    assert.deepEqual(got, [["stack.npy", 4]]);
    assert.equal(pending[1].url, "http://127.0.0.1:5055/evt?filename=stack.npy");
  });

  it("GETs the cube via /stream-npy when the page has an origin", async () => {
    let url;
    const fetch = async (href) => {
      url = href;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) };
    };
    const io = fakeIo();
    const viewer = new WolkeViewer({
      io,
      fetch,
      pageOrigin: "http://127.0.0.1:8765",
    });
    const got = [];
    viewer.connect({
      baseUrl: "http://127.0.0.1:5055",
      token: "evt",
      onNpy: (_buf, name) => got.push(name),
    });
    await viewer._onFile({ file_name: "stack.npy" });
    assert.deepEqual(got, ["stack.npy"]);
    assert.match(url, /^http:\/\/127\.0\.0\.1:8765\/stream-npy\?u=/);
    assert.match(url, /filename%3Dstack\.npy/);
  });

  it("surfaces a failed GET without calling onNpy", async () => {
    const fetch = async () => ({ ok: false, status: 404 });
    const io = fakeIo();
    const viewer = new WolkeViewer({ io, fetch, pageOrigin: "" });
    const errors = [];
    const got = [];
    viewer.connect({
      baseUrl: "http://127.0.0.1:5055",
      token: "evt",
      onNpy: (_buf, name) => got.push(name),
      onError: (err) => errors.push(err.message),
    });
    await viewer._onFile({ file_name: "stack.npy" });
    assert.equal(got.length, 0);
    assert.match(errors[0], /404/);
  });

  it("omits credentials on the cube GET", async () => {
    let init;
    const fetch = async (_url, opts) => {
      init = opts;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    };
    const io = fakeIo();
    const viewer = new WolkeViewer({ io, fetch, pageOrigin: "" });
    viewer.connect({ baseUrl: "http://127.0.0.1:5055", token: "evt" });
    await viewer._onFile({ file_name: "stack.npy" });
    assert.equal(init.credentials, "omit");
    assert.equal(init.mode, "cors");
    assert.equal(io.opts.withCredentials, false);
  });

  it("disconnect drops the socket", async () => {
    const io = fakeIo();
    const viewer = new WolkeViewer({
      io,
      fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
      pageOrigin: "",
    });
    viewer.connect({ baseUrl: "http://127.0.0.1:5055", token: "evt" });
    io.socket.emit("connect");
    await flush();
    assert.equal(viewer.connected, true);
    viewer.disconnect();
    assert.equal(viewer.listening, false);
    assert.equal(io.socket.disconnected, true);
  });
});
