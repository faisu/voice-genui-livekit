import type { SceneOpsDocument } from "../sceneOps";

export type RecipeDomain =
  | "physics"
  | "chemistry"
  | "mathematics"
  | "biology"
  | "programming"
  | "shared";

export type RecipeParamDef = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
};

export type RecipeState = {
  t: number;
  positions: Record<string, [number, number, number]>;
  velocities: Record<string, [number, number, number]>;
  scalars: Record<string, number>;
};

export type RecipeSystem = {
  reset: () => void;
  setParams: (partial: Record<string, number>) => void;
  update: (dt: number) => RecipeState;
  getState: () => RecipeState;
};

/** Grounded summary returned to the teaching agent after a successful build. */
export type DemoSummary = {
  title: string;
  observe: string;
  skillId?: string;
  renderer: "three";
  elements: Array<{ id: string; type: string; label?: string }>;
  params: Array<{
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    unit?: string;
  }>;
  motions: Array<{ type: string; targetId: string }>;
  controls: string[];
};

export type RecipeSkill = {
  id: string;
  domain: RecipeDomain;
  label: string;
  /** Prefer skillId emit; freeform scene_ops is fallback only. */
  promptSnippet: string;
  params: RecipeParamDef[];
  derivedReadouts: string[];
  defaultObserve: string;
  buildOps: (overrides?: {
    params?: Record<string, number>;
    observe?: string;
    title?: string;
  }) => SceneOpsDocument;
  buildSummary: (overrides?: {
    params?: Record<string, number>;
    observe?: string;
    title?: string;
  }) => DemoSummary;
};

export type EmitRecipePayload = {
  skillId?: string;
  paramOverrides?: Record<string, number>;
  observe?: string;
  title?: string;
  /** Freeform fallback when no skill matches. */
  ops?: SceneOpsDocument;
};
