/**
 * Public door query. Allow-list only — no arbitrary .npy paths.
 * `?src=` picks an example; `?quality=` is Low / Medium / High.
 * Bare URL is Brain MRI Low. `?src=life` / `conway` is Game of Life.
 * `?src=ignition` is Lighter Ignition. `?face=1` enters Face AR
 * (webcam / phone camera overlay, not WebXR). Lab millimetre fit is
 * still parsed; it is not written back. Path `/ignition` and QR stay later.
 */

import { COUNT_DEMOS } from "./config.js";
import { parseFaceQuery } from "./face-ar.js";
import { readFacePlacementParams } from "./face-calib.js";
import { DEFAULT_VIEW_QUALITY, normalizeViewQuality } from "./quality.js";

const SOURCE_ALIASES = {
  conway: "conway",
  life: "conway",
  gol: "conway",
  "game-of-life": "conway",
  ignition: "ignition",
  lighter: "ignition",
  "lighter-ignition": "ignition",
  mni152: "mni152",
  mni: "mni152",
  "mni152-high": "mni152",
  "brain-high": "mni152",
  "mri-high": "mni152",
  "mni152-low": "mni152-low",
  brain: "mni152-low",
  mri: "mni152-low",
  "brain-mri": "mni152-low",
  "brain-low": "mni152-low",
  "mri-low": "mni152-low",
};

export const DEFAULT_START_SOURCE = "mni152-low";

function canonKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** `count` (hidden ingest) is not a public door. New COUNT_DEMOS ids work as `?src=<id>`. */
export function normalizeStartSource(raw, demos = COUNT_DEMOS) {
  const k = canonKey(raw);
  if (!k || k === "count") return null;
  if (SOURCE_ALIASES[k]) return SOURCE_ALIASES[k];
  if (k === "conway") return "conway";
  if (demos && demos[k]) return k;
  return null;
}

export function parseStartSearch(
  search,
  {
    demos = COUNT_DEMOS,
    defaultSource = DEFAULT_START_SOURCE,
    defaultQuality = DEFAULT_VIEW_QUALITY,
  } = {},
) {
  const raw = String(search || "");
  const q = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const source =
    normalizeStartSource(q.get("src") || q.get("source"), demos) || defaultSource;
  const qualityRaw = q.get("quality") || q.get("q");
  const quality = qualityRaw
    ? normalizeViewQuality(qualityRaw)
    : defaultQuality;
  const face = parseFaceQuery(raw);
  const facePlacement = readFacePlacementParams(q);
  return { source, quality, face, facePlacement };
}

export function startSearchFromState(
  { source, quality, face = false },
  {
    demos = COUNT_DEMOS,
    defaultSource = DEFAULT_START_SOURCE,
    defaultQuality = DEFAULT_VIEW_QUALITY,
  } = {},
) {
  const params = new URLSearchParams();
  const src = normalizeStartSource(source, demos);
  if (src && src !== defaultSource) params.set("src", src);
  const q = normalizeViewQuality(quality);
  if (q !== defaultQuality) params.set("quality", q);
  if (face) params.set("face", "1");
  const s = params.toString();
  return s ? `?${s}` : "";
}
