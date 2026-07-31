import type { RecipeParamDef } from "./types";

export function mergeParams(
  defs: RecipeParamDef[],
  overrides?: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of defs) {
    const raw = overrides?.[def.id];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : def.value;
    out[def.id] = Math.min(def.max, Math.max(def.min, value));
  }
  return out;
}

export function paramsForSummary(
  defs: RecipeParamDef[],
  values: Record<string, number>,
) {
  return defs.map((def) => ({
    id: def.id,
    label: def.label,
    value: values[def.id] ?? def.value,
    min: def.min,
    max: def.max,
    unit: def.unit,
  }));
}
