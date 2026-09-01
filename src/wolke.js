/**
 * WOLKE viewer contract client (Socket.IO notify + HTTP GET .npy).
 *
 * Same events as BLITZ and the EVT sidecar. DONNER stays a static
 * browser viewer — the cube bytes never ride the socket.
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

export class WolkeViewer {
  /**
   * @param {{
   *   io: (url: string, opts?: object) => { on: Function, disconnect: Function },
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
    this.connected = false;
    this.baseUrl = "";
    this.token = "";
    this.onNpy = null;
    this.onStatus = null;
    this.onError = null;
  }

  get listening() {
    return this._socket != null;
  }

  connect({ baseUrl, token, onNpy, onStatus, onError } = {}) {
    this.disconnect();
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = String(token || "");
    this.onNpy = onNpy || null;
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
    const socket = this._socket;
    this._socket = null;
    this.connected = false;
    if (socket && typeof socket.disconnect === "function") socket.disconnect();
  }

  async _onFile(payload) {
    const fileName = fileNameFromPayload(payload);
    if (!fileName) return;
    const gen = ++this._gen;
    this.onStatus?.(`loading ${fileName}`);
    try {
      const buf = await this._download(fileName);
      if (gen !== this._gen) return;
      this.onNpy?.(buf, fileName);
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
