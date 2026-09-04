/**
 * Manual View quality. Auto-pick from GPU metrics is later (backlog).
 * Low / Medium / High stay cubes; they change fill cost, not the SoA.
 */

export const VIEW_QUALITY_IDS = ["low", "medium", "high"];
export const DEFAULT_VIEW_QUALITY = "high";
/** Occupied cells above this drop auto quality to Medium. Low is never auto. */
export const QUALITY_MEDIUM_CELLS = 500_000;

export function normalizeViewQuality(id) {
  const k = String(id || "").toLowerCase();
  return VIEW_QUALITY_IDS.includes(k) ? k : DEFAULT_VIEW_QUALITY;
}

/** High unless the cube is huge. Never returns low. */
export function autoViewQuality({ cells = 0 } = {}) {
  const n = Number(cells);
  if (Number.isFinite(n) && n > QUALITY_MEDIUM_CELLS) return "medium";
  return "high";
}

/**
 * @returns {{
 *   id: "low" | "medium" | "high",
 *   dprCap: number,
 *   unlit: boolean,
 *   toneMapping: boolean,
 *   fillLight: boolean,
 * }}
 */
export function viewQualitySpec(id) {
  const q = normalizeViewQuality(id);
  if (q === "low") {
    return { id: "low", dprCap: 1, unlit: true, toneMapping: false, fillLight: false };
  }
  if (q === "medium") {
    return { id: "medium", dprCap: 1, unlit: false, toneMapping: false, fillLight: false };
  }
  return { id: "high", dprCap: 1.25, unlit: false, toneMapping: true, fillLight: true };
}

/** Low hides unused lights (`visible = false`), not only intensity 0. */
export function qualityLightsOn(spec) {
  if (!spec || spec.unlit) {
    return { hemi: false, key: false, fill: false };
  }
  return { hemi: true, key: true, fill: Boolean(spec.fillLight) };
}

/** Drawing-buffer scale. Headset / coarse still clamp a cap above 1.5. */
export function pixelRatioForQuality(
  quality,
  { devicePixelRatio = 1, coarse = false, headset = false } = {},
) {
  const spec = viewQualitySpec(quality);
  const cap = headset || coarse ? Math.min(spec.dprCap, 1.5) : spec.dprCap;
  const dpr = Number(devicePixelRatio);
  const device = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(device, cap);
}
