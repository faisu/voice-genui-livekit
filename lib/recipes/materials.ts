/** In-app material presets — hex colors + PBR hints. No remote textures. */
export type MaterialPreset = {
  color: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity?: number;
};

export const MATERIAL_PRESETS = {
  metalBall: {
    color: 0x38bdf8,
    roughness: 0.25,
    metalness: 0.75,
  },
  rubber: {
    color: 0xf43f5e,
    roughness: 0.85,
    metalness: 0.05,
  },
  wood: {
    color: 0xb45309,
    roughness: 0.9,
    metalness: 0.02,
  },
  emissiveAccent: {
    color: 0xfbbf24,
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.35,
  },
  ground: {
    color: 0x0b1020,
    roughness: 0.95,
    metalness: 0.05,
  },
  planet: {
    color: 0x22d3ee,
    roughness: 0.55,
    metalness: 0.2,
  },
  sun: {
    color: 0xfbbf24,
    roughness: 0.35,
    metalness: 0.1,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.6,
  },
  /** CPK-ish atom colors */
  cpkCarbon: { color: 0x334155, roughness: 0.55, metalness: 0.1 },
  cpkOxygen: { color: 0xef4444, roughness: 0.45, metalness: 0.15 },
  cpkHydrogen: { color: 0xe2e8f0, roughness: 0.5, metalness: 0.05 },
  cpkNitrogen: { color: 0x3b82f6, roughness: 0.45, metalness: 0.15 },
} as const satisfies Record<string, MaterialPreset>;

export type MaterialPresetId = keyof typeof MATERIAL_PRESETS;

export function resolveMaterialPreset(
  id: string | undefined,
  fallbackColor = 0x38bdf8,
): MaterialPreset {
  if (id && id in MATERIAL_PRESETS) {
    return MATERIAL_PRESETS[id as MaterialPresetId];
  }
  return { color: fallbackColor, roughness: 0.45, metalness: 0.15 };
}
