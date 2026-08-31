/**
 * NumPy `.npy` v1/v2 reader (and a small writer for tests).
 *
 * Runtime contract stays EventSoA; this only unpacks WETTER's NumPy
 * interchange (EVT count cubes) in the browser. No NPZ, no Fortran
 * arrays — EVT writes C-order.
 */

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY

const DTYPE = {
  "|u1": { ArrayType: Uint8Array, size: 1, get: (v, o) => v.getUint8(o) },
  "<u1": { ArrayType: Uint8Array, size: 1, get: (v, o) => v.getUint8(o) },
  ">u1": { ArrayType: Uint8Array, size: 1, get: (v, o) => v.getUint8(o) },
  "|i1": { ArrayType: Int8Array, size: 1, get: (v, o) => v.getInt8(o) },
  "<i1": { ArrayType: Int8Array, size: 1, get: (v, o) => v.getInt8(o) },
  ">i1": { ArrayType: Int8Array, size: 1, get: (v, o) => v.getInt8(o) },
  "<u2": { ArrayType: Uint16Array, size: 2, get: (v, o) => v.getUint16(o, true) },
  ">u2": { ArrayType: Uint16Array, size: 2, get: (v, o) => v.getUint16(o, false) },
  "<i2": { ArrayType: Int16Array, size: 2, get: (v, o) => v.getInt16(o, true) },
  ">i2": { ArrayType: Int16Array, size: 2, get: (v, o) => v.getInt16(o, false) },
  "<u4": { ArrayType: Uint32Array, size: 4, get: (v, o) => v.getUint32(o, true) },
  ">u4": { ArrayType: Uint32Array, size: 4, get: (v, o) => v.getUint32(o, false) },
  "<i4": { ArrayType: Int32Array, size: 4, get: (v, o) => v.getInt32(o, true) },
  ">i4": { ArrayType: Int32Array, size: 4, get: (v, o) => v.getInt32(o, false) },
  "<f4": { ArrayType: Float32Array, size: 4, get: (v, o) => v.getFloat32(o, true) },
  ">f4": { ArrayType: Float32Array, size: 4, get: (v, o) => v.getFloat32(o, false) },
  "<f8": { ArrayType: Float64Array, size: 8, get: (v, o) => v.getFloat64(o, true) },
  ">f8": { ArrayType: Float64Array, size: 8, get: (v, o) => v.getFloat64(o, false) },
};

function latin1(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function parseShape(header) {
  const m = header.match(/'shape':\s*\(([^)]*)\)/);
  if (!m) throw new Error("npy header has no shape");
  const inner = m[1].trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number.parseInt(p, 10));
}

function parseDescr(header) {
  const m = header.match(/'descr':\s*'([^']+)'/);
  if (!m) throw new Error("npy header has no descr");
  return m[1];
}

function parseFortran(header) {
  return /'fortran_order':\s*True/.test(header);
}

function dtypeOf(descr) {
  const spec = DTYPE[descr];
  if (!spec) throw new Error(`unsupported npy dtype '${descr}'`);
  return spec;
}

/**
 * @param {ArrayBuffer | Uint8Array} raw
 * @returns {{
 *   shape: number[],
 *   descr: string,
 *   fortranOrder: boolean,
 *   data: ArrayBufferView,
 * }}
 */
export function parseNpy(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length < 10) throw new Error("npy file is truncated");
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error("not a NumPy .npy file");
  }
  const major = bytes[6];
  const minor = bytes[7];
  if (major !== 1 && major !== 2 && major !== 3) {
    throw new Error(`unsupported npy version ${major}.${minor}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hdrLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const hdrOff = major === 1 ? 10 : 12;
  if (hdrOff + hdrLen > bytes.length) throw new Error("npy header is truncated");
  const header = latin1(bytes.subarray(hdrOff, hdrOff + hdrLen));
  const descr = parseDescr(header);
  const shape = parseShape(header);
  const fortranOrder = parseFortran(header);
  if (fortranOrder) {
    throw new Error("npy fortran_order arrays are not supported");
  }
  if (shape.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`bad npy shape ${JSON.stringify(shape)}`);
  }
  const spec = dtypeOf(descr);
  const n = shape.reduce((a, b) => a * b, 1);
  const body = hdrOff + hdrLen;
  const need = n * spec.size;
  if (body + need > bytes.length) throw new Error("npy payload is truncated");
  const slice = bytes.subarray(body, body + need);
  let data;
  if (descr[0] === "<" || descr[0] === "|") {
    if (slice.byteOffset % spec.size === 0) {
      data = new spec.ArrayType(slice.buffer, slice.byteOffset, n);
    } else {
      const copy = new Uint8Array(need);
      copy.set(slice);
      data = new spec.ArrayType(copy.buffer, 0, n);
    }
  } else {
    data = new spec.ArrayType(n);
    for (let i = 0; i < n; i++) data[i] = spec.get(view, body + i * spec.size);
  }
  return { shape, descr, fortranOrder, data };
}

function padHeader(header, prefixLen, align = 16) {
  const pad = (align - ((prefixLen + header.length + 1) % align)) % align;
  return header + " ".repeat(pad) + "\n";
}

/**
 * Little-endian C-order `.npy` v1 (tests and local fixtures).
 * @param {ArrayBufferView} data
 * @param {number[]} shape
 * @param {string} descr
 */
export function serializeNpy(data, shape, descr = "<u2") {
  const spec = dtypeOf(descr);
  const n = shape.reduce((a, b) => a * b, 1);
  if (data.length !== n) throw new Error("npy serialize length does not match shape");
  const shapeStr = shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
  const dict = `{'descr': '${descr}', 'fortran_order': False, 'shape': ${shapeStr}, }`;
  const prefixLen = 10;
  const header = padHeader(dict, prefixLen);
  const hdrLen = header.length;
  const out = new Uint8Array(prefixLen + hdrLen + n * spec.size);
  out.set(MAGIC, 0);
  out[6] = 1;
  out[7] = 0;
  out[8] = hdrLen & 0xff;
  out[9] = (hdrLen >> 8) & 0xff;
  for (let i = 0; i < hdrLen; i++) out[prefixLen + i] = header.charCodeAt(i);
  const body = prefixLen + hdrLen;
  if (data instanceof spec.ArrayType && (descr[0] === "<" || descr[0] === "|")) {
    out.set(new Uint8Array(data.buffer, data.byteOffset, n * spec.size), body);
  } else {
    const view = new DataView(out.buffer);
    const little = descr[0] !== ">";
    for (let i = 0; i < n; i++) {
      const o = body + i * spec.size;
      const v = data[i];
      if (spec.size === 1) view.setUint8(o, v);
      else if (descr.includes("i2")) view.setInt16(o, v, little);
      else if (descr.includes("u2")) view.setUint16(o, v, little);
      else if (descr.includes("i4")) view.setInt32(o, v, little);
      else if (descr.includes("u4")) view.setUint32(o, v, little);
      else if (descr.includes("f4")) view.setFloat32(o, v, little);
      else view.setFloat64(o, v, little);
    }
  }
  return out;
}
