/**
 * Procedural / in-repo lab assets only.
 * Never fetch remote GLTF, HDRI, or CDN meshes.
 */

/** Soft noise DataTexture factory for SceneBuilder (called client-side with THREE). */
export function createSoftNoiseData(
  size = 64,
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = 180 + Math.floor(Math.random() * 40);
    const o = i * 4;
    data[o] = n;
    data[o + 1] = n;
    data[o + 2] = n + 8;
    data[o + 3] = 255;
  }
  return { width: size, height: size, data };
}

/** Allowed relative texture paths under public/ (if present). */
export const LOCAL_LAB_TEXTURE_PATHS = ["/lab/noise.png"] as const;

export function isAllowedLabAssetUrl(url: string): boolean {
  if (!url.startsWith("/lab/")) return false;
  if (url.includes("://") || url.includes("..")) return false;
  return true;
}
