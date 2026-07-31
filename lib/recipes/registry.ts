import type { SceneOpsDocument } from "../sceneOps";
import {
  coerceSceneOpsDocument,
  sceneOpsDocumentSchema,
} from "../sceneOps";
import { circularOrbitSkill } from "./circularOrbit/skill";
import { inclinedPlaneSkill } from "./inclinedPlane/skill";
import { projectileSkill } from "./projectile/skill";
import { shmSpringSkill } from "./shmSpring/skill";
import { simplePendulumSkill } from "./simplePendulum/skill";
import type { DemoSummary, EmitRecipePayload, RecipeSkill } from "./types";

const SKILLS: RecipeSkill[] = [
  projectileSkill,
  simplePendulumSkill,
  circularOrbitSkill,
  shmSpringSkill,
  inclinedPlaneSkill,
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

const KEYWORD_MAP: Array<{ skillId: string; keywords: string[] }> = [
  {
    skillId: "projectile",
    keywords: ["projectile", "trajectory", "launch", "cannon", "ballistic"],
  },
  {
    skillId: "simplePendulum",
    keywords: ["pendulum", "bob", "swing", "period"],
  },
  {
    skillId: "circularOrbit",
    keywords: ["orbit", "planet", "satellite", "kepler", "circular motion"],
  },
  {
    skillId: "shmSpring",
    keywords: ["spring", "shm", "harmonic", "oscillat"],
  },
  {
    skillId: "inclinedPlane",
    keywords: ["incline", "ramp", "slope", "inclined plane"],
  },
];

export function listSkills(): RecipeSkill[] {
  return SKILLS.slice();
}

export function getSkill(id: string): RecipeSkill | undefined {
  return BY_ID.get(id);
}

export function skillCatalogPrompt(): string {
  return SKILLS.map((s) => `- ${s.id}: ${s.promptSnippet}`).join("\n");
}

export function matchSkillFromBrief(brief: string): string | null {
  const lower = brief.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.some((k) => lower.includes(k))) {
      return entry.skillId;
    }
  }
  return null;
}

export type ResolveRecipeResult = {
  doc: SceneOpsDocument;
  summary: DemoSummary;
  skillId?: string;
};

export function resolveRecipeEmit(
  payload: EmitRecipePayload,
  briefFallback?: string,
): ResolveRecipeResult | { error: string } {
  let skillId = payload.skillId?.trim();
  if (!skillId && briefFallback) {
    skillId = matchSkillFromBrief(briefFallback) ?? undefined;
  }

  if (skillId) {
    const skill = getSkill(skillId);
    if (!skill) {
      return { error: `Unknown skillId "${skillId}"` };
    }
    const overrides = {
      params: payload.paramOverrides,
      observe: payload.observe,
      title: payload.title,
    };
    return {
      doc: skill.buildOps(overrides),
      summary: skill.buildSummary(overrides),
      skillId: skill.id,
    };
  }

  if (payload.ops) {
    const coerced = coerceSceneOpsDocument(payload.ops);
    if (!coerced) {
      return { error: "Invalid scene_ops document" };
    }
    const parsed = sceneOpsDocumentSchema.safeParse(coerced);
    if (!parsed.success) {
      return {
        error: parsed.error.issues
          .slice(0, 8)
          .map((i) => i.message)
          .join("; "),
      };
    }
    assertNoExternalAssets(parsed.data);
    return {
      doc: parsed.data,
      summary: summaryFromSceneOps(parsed.data, payload.title, payload.observe),
    };
  }

  if (briefFallback) {
    const fallbackId = matchSkillFromBrief(briefFallback);
    if (fallbackId) {
      const skill = getSkill(fallbackId)!;
      return {
        doc: skill.buildOps({
          observe: payload.observe,
          title: payload.title,
        }),
        summary: skill.buildSummary({
          observe: payload.observe,
          title: payload.title,
        }),
        skillId: skill.id,
      };
    }
  }

  return {
    error:
      "Emit skillId + paramOverrides (preferred) or a valid scene_ops document",
  };
}

function assertNoExternalAssets(doc: SceneOpsDocument): void {
  const raw = JSON.stringify(doc);
  if (
    /\bhttps?:\/\//i.test(raw) ||
    /\.gltf\b/i.test(raw) ||
    /\.glb\b/i.test(raw) ||
    /\.hdr\b/i.test(raw)
  ) {
    throw new Error("scene_ops must not reference remote models or HDRIs");
  }
}

export function summaryFromSceneOps(
  doc: SceneOpsDocument,
  title?: string,
  observe?: string,
): DemoSummary {
  const elements: DemoSummary["elements"] = [];
  const motions: DemoSummary["motions"] = [];
  let overlayTitle = title ?? "Lab demo";
  const controls = ["playPause", "reset"];
  let sliderId: string | undefined;

  for (const op of doc.ops) {
    if (op.op === "addObject") {
      elements.push({ id: op.id, type: op.kind, label: op.id });
    } else if (op.op === "addArrow") {
      elements.push({ id: op.id, type: "arrow", label: op.label ?? op.id });
    } else if (op.op === "addTrail") {
      elements.push({ id: op.id, type: "trail", label: op.id });
    } else if (op.op === "setMotion") {
      motions.push({ type: op.type, targetId: op.id });
    } else if (op.op === "setOverlay") {
      overlayTitle = op.title || overlayTitle;
      if (op.slider) {
        sliderId = op.slider.id;
        controls.push(`slider:${op.slider.id}`);
      }
    }
  }

  return {
    title: overlayTitle,
    observe:
      observe ??
      "Explore the demo with play, pause, and reset; try the slider if shown.",
    renderer: "three",
    elements,
    params: sliderId
      ? doc.ops
          .filter(
            (o): o is Extract<(typeof doc.ops)[number], { op: "setOverlay" }> =>
              o.op === "setOverlay" && Boolean(o.slider),
          )
          .slice(0, 1)
          .map((o) => ({
            id: o.slider!.id,
            label: o.slider!.label,
            value: o.slider!.value,
            min: o.slider!.min,
            max: o.slider!.max,
          }))
      : [],
    motions,
    controls,
  };
}

export function parseEmitRecipe(raw: unknown): EmitRecipePayload | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  // Wrapped forms
  if (obj.recipe && typeof obj.recipe === "object") {
    return parseEmitRecipe(obj.recipe);
  }

  const payload: EmitRecipePayload = {};
  if (typeof obj.skillId === "string") payload.skillId = obj.skillId;
  if (typeof obj.observe === "string") payload.observe = obj.observe;
  if (typeof obj.title === "string") payload.title = obj.title;
  if (obj.paramOverrides && typeof obj.paramOverrides === "object") {
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(
      obj.paramOverrides as Record<string, unknown>,
    )) {
      if (typeof v === "number" && Number.isFinite(v)) overrides[k] = v;
    }
    payload.paramOverrides = overrides;
  }

  if (obj.ops || obj.version === 1) {
    const coerced = coerceSceneOpsDocument(
      obj.ops ? { version: 1, ops: obj.ops } : obj,
    );
    if (coerced) payload.ops = coerced;
  }

  if (payload.skillId || payload.ops) return payload;
  return null;
}
