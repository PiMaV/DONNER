/**
 * WETTER Viewer Contract client (Socket.IO notify + HTTP GET .npy).
 *
 * Same events as BLITZ and the EVT sidecar. DONNER stays a static
 * browser viewer — the cube bytes never ride the socket. Playhead
 * sync uses optional `index` on `send_file_message` and emit
 * `viewer_index` (hub-and-spoke; no Viewer↔Viewer peer link).
 */

export function normalizeBaseUrl(url) {
  let s = String(url || "").trim();
  if (s.startsWith("ws://")) s = `http://${s.slice(5)}`;
  else if (s.startsWith("wss://")) s = `https://${s.slice(6)}`;
  return s.replace(/\/+$/, "");
}

export function downloadUrl(baseUrl, token, fileName) {
  const base = normalizeBaseUrl(baseUrl);
  const tok = encodeURIComponent(String(token || ""));
  const name = encodeURIComponent(String(fileName || ""));
  return `${base}/${tok}?filename=${name}`;
}

export function cubeFetchUrl(directUrl, pageOrigin) {
  const origin = String(pageOrigin || "");
  if (!origin || origin === "null" || origin.startsWith("file:")) return directUrl;
  try {
    const u = new URL("/stream-npy", origin);
    u.searchParams.set("u", directUrl);
    return u.href;
  } catch {
    return directUrl;
  }
}

export function fileNameFromPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  const name = payload.file_name;
  return typeof name === "string" ? name : "";
}

export function fileNamesFromPayload(payload) {
  if (payload == null || typeof payload !== "object") return [];
  const list = payload.file_names;
  if (!Array.isArray(list)) return [];
  return list.map((s) => (typeof s === "string" ? s : ""));
}

/** Last path segment; empty if missing. */
export function baseFileName(path) {
  const s = String(path || "")
    .trim()
    .replace(/\\/g, "/");
  if (!s) return "";
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function isPackedSelectionName(fileName) {
  const base = baseFileName(fileName);
  return base === "__selection__.npy" || base === "__selection__";
}

/**
 * Label for Source meta: hub `file_names[index]`, else a real file_name,
 * never the packed `__selection__.npy` token when names exist.
 */
export function displayFileLabel(fileName, fileNames, index) {
  const names = Array.isArray(fileNames) ? fileNames : [];
  if (index != null && Number.isInteger(index) && names[index]) {
    return baseFileName(names[index]);
  }
  if (names.length === 1 && names[0]) return baseFileName(names[0]);
  if (isPackedSelectionName(fileName)) {
    const i = index != null && Number.isInteger(index) ? index : 0;
    if (names[i]) return baseFileName(names[i]);
    const first = names.find(Boolean);
    if (first) return baseFileName(first);
  }
  const raw = baseFileName(fileName);
  if (raw && !isPackedSelectionName(raw)) return raw;
  const first = names.find(Boolean);
  return first ? baseFileName(first) : raw;
}

export function indexFromPayload(payload) {
  if (payload == null || typeof payload !== "object") return null;
  const idx = payload.index;
  return typeof idx === "number" && Number.isInteger(idx) ? idx : null;
}

export class WolkeViewer {
  /**
   * @param {{
   *   io: (url: string, opts?: object) => { on: Function, emit?: Function, disconnect: Function },
   *   fetch?: typeof fetch,
   *   pageOrigin?: string,
   * }} deps
   */
  constructor(deps) {
    this._io = deps.io;
    this._fetch = deps.fetch || ((...args) => globalThis.fetch(...args));
    this._pageOrigin = deps.pageOrigin;
    this._socket = null;
    this._gen = 0;
    this._lastFileName = "";
    this._lastFileNames = [];
    this.connected = false;
    this.baseUrl = "";
    this.token = "";
    this.onNpy = null;
    this.onIndex = null;
    this.onStatus = null;
    this.onError = null;
  }

  get listening() {
    return this._socket != null;
  }

  get lastFileName() {
    return this._lastFileName;
  }

  connect({ baseUrl, token, onNpy, onIndex, onStatus, onError } = {}) {
    this.disconnect();
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = String(token || "");
    this.onNpy = onNpy || null;
    this.onIndex = onIndex || null;
    this.onStatus = onStatus || null;
    this.onError = onError || null;
    if (!this.baseUrl || !this.token) {
      this._fail(new Error("Stream URL and token are required"));
      return;
    }
    this.onStatus?.("connecting");
    const socket = this._io(this.baseUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      forceNew: true,
      reconnectionAttempts: 8,
      withCredentials: false,
    });
    this._socket = socket;
    socket.on("connect", () => {
      this.connected = true;
      this.onStatus?.("connected");
    });
    socket.on("disconnect", () => {
      this.connected = false;
      this.onStatus?.("disconnected");
    });
    socket.on("connect_error", (err) => {
      this._fail(err instanceof Error ? err : new Error(String(err)));
    });
    socket.on("send_file_message", (payload) => {
      void this._onFile(payload);
    });
  }

  disconnect() {
    this._gen += 1;
    this._lastFileName = "";
    this._lastFileNames = [];
    const socket = this._socket;
    this._socket = null;
    this.connected = false;
    if (socket && typeof socket.disconnect === "function") socket.disconnect();
  }

  /**
   * Tell the hub which T-axis frame is shown (Viewer Contract: viewer_index).
   * @param {number} index
   */
  emitIndex(index) {
    const socket = this._socket;
    if (!socket || typeof socket.emit !== "function") return;
    const idx = index | 0;
    if (idx < 0) return;
    socket.emit("viewer_index", { index: idx });
  }

  async _onFile(payload) {
    const fileName = fileNameFromPayload(payload);
    if (!fileName) return;
    const index = indexFromPayload(payload);
    const names = fileNamesFromPayload(payload);
    if (index != null && fileName === this._lastFileName) {
      if (names.length) this._lastFileNames = names;
      this.onIndex?.(index, fileName, this._lastFileNames);
      this.onStatus?.("ready");
      return;
    }
    const gen = ++this._gen;
    this.onStatus?.(`loading ${fileName}`);
    try {
      const buf = await this._download(fileName);
      if (gen !== this._gen) return;
      this._lastFileName = fileName;
      this._lastFileNames = names;
      this.onNpy?.(buf, fileName, index, names);
      this.onStatus?.("ready");
    } catch (err) {
      if (gen !== this._gen) return;
      this._fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async _download(fileName) {
    const direct = downloadUrl(this.baseUrl, this.token, fileName);
    const origin =
      this._pageOrigin !== undefined
        ? this._pageOrigin
        : globalThis.location && globalThis.location.origin;
    const url = cubeFetchUrl(direct, origin);
    let res;
    try {
      res = await this._fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      });
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${why} at ${url}. Restart DONNER (npm start) so /stream-npy can fetch the sidecar.`,
      );
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.arrayBuffer();
  }

  _fail(err) {
    this.onError?.(err);
  }
}
