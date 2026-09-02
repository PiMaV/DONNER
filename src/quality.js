/**
 * Manual View quality. Auto-pick from GPU metrics is later (backlog).
 * Low / Medium / High stay cubes; they change fill cost, not the SoA.
 */

export const VIEW_QUALITY_IDS = ["low", "medium", "high"];
export const DEFAULT_VIEW_QUALITY = "high";

export function normalizeViewQuality(id) {
  const k = String(id || "").toLowerCase();
  return VIEW_QUALITY_IDS.includes(k) ? k : DEFAULT_VIEW_QUALITY;
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
    return { id: "medium", dprCap: 1.25, unlit: false, toneMapping: true, fillLight: true };
  }
  return { id: "high", dprCap: 2, unlit: false, toneMapping: true, fillLight: true };
}

/** Drawing-buffer scale. Headset / coarse already cap High at 1.5. */
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
