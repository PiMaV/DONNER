/**
 * Session RAM cache of decoded COUNT_DEMOS volumes (Brain MRI High / Low,
 * Ignition). First fetch still hits the network; switching Source later
 * reuses the live CountVolume. Persistent Cache Storage is later.
 */

const volumes = new Map();

export function cachedDemoVolume(kind) {
  const id = String(kind || "");
  return id ? volumes.get(id) || null : null;
}

export function rememberDemoVolume(kind, vol) {
  const id = String(kind || "");
  if (!id || !vol) return;
  volumes.set(id, vol);
}

export function clearDemoVolumeCache() {
  volumes.clear();
}
