/**
 * Public door query. Allow-list only — no arbitrary .npy paths.
 * `?src=` picks an example; `?quality=` is Low / Medium / High.
 * Path `/ignition` and QR spawn stay later.
 */

import { COUNT_DEMOS } from "./config.js";
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
  brain: "mni152",
  mri: "mni152",
  "brain-mri": "mni152",
};

export const DEFAULT_START_SOURCE = "conway";

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
  return { source, quality };
}

export function startSearchFromState(
  { source, quality },
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
  const s = params.toString();
  return s ? `?${s}` : "";
}
