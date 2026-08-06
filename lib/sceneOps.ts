import { z } from "zod";

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const ensureLabSchema = z.object({
  op: z.literal("ensureLab"),
  grid: z.boolean().optional(),
  clearColor: z.number().optional(),
});

const addObjectSchema = z.object({
  op: z.literal("addObject"),
  id: z.string().min(1),
  kind: z.enum([
    "sphere",
    "box",
    "plane",
    "cylinder",
    "cone",
    "torus",
    "line",
  ]),
  position: vec3Schema.optional(),
  rotation: vec3Schema.optional(),
  scale: vec3Schema.optional(),
  size: z.number().positive().optional(),
  color: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  /** In-app material preset id (see lib/recipes/materials). */
  materialPreset: z.string().max(64).optional(),
  /** For kind "line": start and end points. */
  from: vec3Schema.optional(),
  to: vec3Schema.optional(),
});

const addArrowSchema = z.object({
  op: z.literal("addArrow"),
  id: z.string().min(1),
  origin: vec3Schema,
  direction: vec3Schema,
  length: z.number().positive().optional(),
  color: z.number().optional(),
  label: z.string().optional(),
});

const addTrailSchema = z.object({
  op: z.literal("addTrail"),
  id: z.string().min(1),
  targetId: z.string().min(1),
  maxPoints: z.number().int().positive().max(500).optional(),
  color: z.number().optional(),
});

const setMotionSchema = z.object({
  op: z.literal("setMotion"),
  id: z.string().min(1),
  type: z.enum(["static", "projectile", "pendulum", "orbit", "oscillate"]),
  /** Starting world position (defaults to object's current position). */
  origin: vec3Schema.optional(),
  /** Initial velocity for projectile [vx, vy, vz]. */
  velocity: vec3Schema.optional(),
  /** Gravity magnitude (default 9.8); applied as −Y. */
  gravity: z.number().optional(),
  /** Pendulum: pivot point. */
  pivot: vec3Schema.optional(),
  /** Pendulum / oscillate: length or amplitude. */
  length: z.number().positive().optional(),
  /** Pendulum: initial angle from vertical (radians). */
  angle: z.number().optional(),
  /** Orbit: center point. */
  center: vec3Schema.optional(),
  /** Orbit: radius. */
  radius: z.number().positive().optional(),
  /** Orbit / oscillate: angular speed (rad/s). */
  speed: z.number().optional(),
  /** Oscillate: axis unit vector. */
  axis: vec3Schema.optional(),
});

const setOverlaySchema = z.object({
  op: z.literal("setOverlay"),
  title: z.string(),
  readouts: z.array(z.string()).max(4).optional(),
  showControls: z.boolean().optional(),
  /** World-space position for the in-scene control panel. */
  position: vec3Schema.optional(),
  /** Optional in-scene draggable parameter slider. */
  slider: z
    .object({
      id: z.string().min(1),
      label: z.string(),
      min: z.number(),
      max: z.number(),
      value: z.number(),
      step: z.number().positive().optional(),
    })
    .optional(),
});

const focusCameraSchema = z.object({
  op: z.literal("focusCamera"),
  position: vec3Schema,
  target: vec3Schema,
  /** Seconds; 0 = snap. Prefer short (≤2) mid-lesson; longer only on final stage. */
  duration: z.number().min(0).max(8).optional(),
});

const removeSchema = z.object({
  op: z.literal("remove"),
  id: z.string().min(1),
});

export const sceneOpSchema = z.discriminatedUnion("op", [
  ensureLabSchema,
  addObjectSchema,
  addArrowSchema,
  addTrailSchema,
  setMotionSchema,
  setOverlaySchema,
  focusCameraSchema,
  removeSchema,
]);

export const sceneOpsDocumentSchema = z.object({
  version: z.literal(1),
  ops: z.array(sceneOpSchema).min(1).max(40),
});

export type SceneOp = z.infer<typeof sceneOpSchema>;
export type SceneOpsDocument = z.infer<typeof sceneOpsDocumentSchema>;

export function parseSceneOpsDocument(raw: string): SceneOpsDocument {
  const coerced = coerceSceneOpsDocument(raw);
  if (!coerced) {
    throw new Error("scene_ops content is not valid JSON / ops");
  }
  return coerced;
}

export function tryParseSceneOpsDocument(raw: string): SceneOpsDocument | null {
  return coerceSceneOpsDocument(raw);
}

/** Turn JS-ish model output into JSON.parse-able text (0x colors, trailing commas). */
function normalizeJsonishLiterals(text: string): string {
  return text
    .replace(/\b0x([0-9a-fA-F]+)\b/g, (_, hex: string) =>
      String(Number.parseInt(hex, 16)),
    )
    .replace(/,\s*([\]}])/g, "$1");
}

/**
 * Best-effort normalize of model-produced scene_ops (LLMs often slip on types).
 * Accepts: document object, ops array, double-encoded JSON, markdown fences,
 * hex colors, {x,y,z} vectors, version as string, size as [w,h,d].
 */
export function coerceSceneOpsDocument(raw: unknown): SceneOpsDocument | null {
  let value: unknown = raw;

  if (typeof value === "string") {
    let text = value.trim();
    if (!text) return null;
    // Strip ```json ... ``` fences
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fence?.[1]) text = fence[1].trim();

    text = normalizeJsonishLiterals(text);

    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
    // Double-encoded JSON string
    if (typeof value === "string") {
      try {
        value = JSON.parse(normalizeJsonishLiterals(value));
      } catch {
        return null;
      }
    }
  }

  if (!value || typeof value !== "object") return null;

  let opsRaw: unknown;
  if (Array.isArray(value)) {
    opsRaw = value;
  } else {
    const obj = value as Record<string, unknown>;
    opsRaw = obj.ops;
  }

  if (!Array.isArray(opsRaw) || opsRaw.length === 0) return null;

  const ops: SceneOp[] = [];
  for (const item of opsRaw) {
    const op = coerceSceneOp(item);
    if (op) ops.push(op);
  }

  if (ops.length === 0) return null;
  return { version: 1, ops: ops.slice(0, 40) };
}

function coerceSceneOp(item: unknown): SceneOp | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const op = typeof raw.op === "string" ? raw.op : null;
  if (!op) return null;

  try {
    switch (op) {
      case "ensureLab":
        return sceneOpSchema.parse({
          op: "ensureLab",
          grid: raw.grid === undefined ? undefined : Boolean(raw.grid),
          clearColor: coerceColor(raw.clearColor),
        });
      case "addObject": {
        const kind = String(raw.kind ?? raw.shape ?? raw.type ?? "sphere");
        if (
          ![
            "sphere",
            "box",
            "plane",
            "cylinder",
            "cone",
            "torus",
            "line",
          ].includes(kind)
        ) {
          return null;
        }
        const { size, scale } = coerceObjectSizeAndScale(raw.size, raw.scale);
        const materialPreset =
          typeof raw.materialPreset === "string"
            ? raw.materialPreset
            : typeof raw.material === "string"
              ? raw.material
              : undefined;
        return sceneOpSchema.parse({
          op: "addObject",
          id: String(raw.id ?? `obj_${Math.random().toString(36).slice(2, 8)}`),
          kind,
          position: coerceVec3(raw.position),
          rotation: coerceVec3(raw.rotation),
          scale,
          size,
          color: coerceColor(raw.color),
          opacity: coerceOpacity(raw.opacity),
          materialPreset,
          from: coerceVec3(raw.from),
          to: coerceVec3(raw.to),
        });
      }
      case "addArrow":
        return sceneOpSchema.parse({
          op: "addArrow",
          id: String(raw.id ?? `arrow_${Math.random().toString(36).slice(2, 8)}`),
          origin: coerceVec3(raw.origin) ?? [0, 0, 0],
          direction: coerceVec3(raw.direction) ?? [1, 0, 0],
          length: coercePositiveNumber(raw.length),
          color: coerceColor(raw.color),
          label: typeof raw.label === "string" ? raw.label : undefined,
        });
      case "addTrail":
        return sceneOpSchema.parse({
          op: "addTrail",
          id: String(raw.id ?? `trail_${Math.random().toString(36).slice(2, 8)}`),
          targetId: String(raw.targetId ?? raw.target_id ?? ""),
          maxPoints: coercePositiveInt(raw.maxPoints ?? raw.max_points),
          color: coerceColor(raw.color),
        });
      case "setMotion": {
        const type = String(raw.type ?? "static");
        if (
          !["static", "projectile", "pendulum", "orbit", "oscillate"].includes(type)
        ) {
          return null;
        }
        return sceneOpSchema.parse({
          op: "setMotion",
          id: String(raw.id ?? ""),
          type,
          origin: coerceVec3(raw.origin),
          velocity: coerceVec3(raw.velocity),
          gravity: coerceNumber(raw.gravity),
          pivot: coerceVec3(raw.pivot),
          length: coercePositiveNumber(raw.length),
          angle: coerceNumber(raw.angle),
          center: coerceVec3(raw.center),
          radius: coercePositiveNumber(raw.radius),
          speed: coerceNumber(raw.speed),
          axis: coerceVec3(raw.axis),
        });
      }
      case "setOverlay":
        return sceneOpSchema.parse({
          op: "setOverlay",
          title: String(
            raw.title ??
              (typeof raw.text === "string" ? raw.text : undefined) ??
              (typeof raw.label === "string" ? raw.label : undefined) ??
              "Demo",
          ),
          readouts: Array.isArray(raw.readouts)
            ? raw.readouts.map(String).slice(0, 4)
            : undefined,
          showControls:
            raw.showControls === undefined ? undefined : Boolean(raw.showControls),
          position: coerceVec3(raw.position),
          slider: coerceSlider(raw.slider),
        });
      case "focusCamera":
        return sceneOpSchema.parse({
          op: "focusCamera",
          position: coerceVec3(raw.position) ?? [5, 3, 8],
          target: coerceVec3(raw.target) ?? [0, 1, 0],
          duration: coerceNumber(raw.duration),
        });
      case "remove":
        return sceneOpSchema.parse({
          op: "remove",
          id: String(raw.id ?? ""),
        });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function coerceVec3(value: unknown): [number, number, number] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if ([x, y, z].every((n) => Number.isFinite(n))) return [x, y, z];
    return undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const x = Number(obj.x ?? obj[0]);
    const y = Number(obj.y ?? obj[1]);
    const z = Number(obj.z ?? obj[2]);
    if ([x, y, z].every((n) => Number.isFinite(n))) return [x, y, z];
  }
  return undefined;
}

/**
 * Models often emit size as [w,h,d] (Three.js-ish dimensions). Our schema uses
 * a scalar `size` plus optional `scale` — map arrays accordingly.
 */
function coerceObjectSizeAndScale(
  sizeRaw: unknown,
  scaleRaw: unknown,
): {
  size: number | undefined;
  scale: [number, number, number] | undefined;
} {
  const explicitScale = coerceVec3(scaleRaw);
  const sizeAsVec = coerceVec3(sizeRaw);

  if (sizeAsVec) {
    const [sx, sy, sz] = sizeAsVec;
    const uniform =
      Math.abs(sx - sy) < 1e-6 && Math.abs(sy - sz) < 1e-6 && sx > 0;
    if (uniform) {
      // e.g. size: [0.35, 0.35, 0.35] → scalar radius/extent
      return { size: sx, scale: explicitScale };
    }
    // Non-uniform dimensions → unit geometry + scale
    return {
      size: 1,
      scale: explicitScale ?? sizeAsVec,
    };
  }

  return {
    size: coercePositiveNumber(sizeRaw),
    scale: explicitScale,
  };
}

function coerceColor(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
      return Number.parseInt(trimmed.replace("#", ""), 16);
    }
    if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
      return Number.parseInt(trimmed, 16);
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function coercePositiveNumber(value: unknown): number | undefined {
  const n = coerceNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
}

function coercePositiveInt(value: unknown): number | undefined {
  const n = coercePositiveNumber(value);
  return n !== undefined ? Math.round(n) : undefined;
}

function coerceOpacity(value: unknown): number | undefined {
  const n = coerceNumber(value);
  if (n === undefined) return undefined;
  return Math.max(0, Math.min(1, n));
}

function coerceSlider(value: unknown):
  | {
      id: string;
      label: string;
      min: number;
      max: number;
      value: number;
      step?: number;
    }
  | undefined {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  const min = coerceNumber(s.min);
  const max = coerceNumber(s.max);
  const current = coerceNumber(s.value);
  if (min === undefined || max === undefined || current === undefined) return undefined;
  return {
    id: String(s.id ?? "param"),
    label: String(s.label ?? "Value"),
    min,
    max,
    value: current,
    step: coercePositiveNumber(s.step),
  };
}

export function serializeSceneOpsDocument(doc: SceneOpsDocument): string {
  return JSON.stringify(doc);
}

/** Merge additive stage ops onto an accumulated document. */
export function mergeSceneOps(
  existing: SceneOpsDocument | null,
  next: SceneOpsDocument,
): SceneOpsDocument {
  if (!existing) return next;
  return {
    version: 1,
    ops: [...existing.ops, ...next.ops],
  };
}

/** Prompt fragment listing allowed ops for the render model. */
export const SCENE_OPS_PROMPT = `Call emit_scene with a COMPLETE freeform scene_ops lab:
{
  "title": "optional",
  "observe": "short cue for the student",
  "elements": [{ "id", "type", "label"? }],
  "params": [{ "id", "label", "value", "min", "max", "unit"? }],
  "controls": ["playPause", "reset", "slider:…"],
  "ops": { "version": 1, "ops": [ ... ] }
}

Allowed ops (discriminated by "op"):
- ensureLab: { grid?, clearColor? }
- addObject: { id, kind: sphere|box|plane|cylinder|cone|torus|line, position?, rotation?, scale?, size?, color?, opacity?, materialPreset?, from?, to? }
  Primitives only. materialPreset is an in-app preset id (metalBall, rubber, wood, sun, planet, cpkCarbon, …). Never GLTF/HDRI/URLs.
- addArrow: { id, origin, direction, length?, color?, label? }
- addTrail: { id, targetId, maxPoints?, color? }
- setMotion: { id, type: static|projectile|pendulum|orbit|oscillate, origin?, velocity?, gravity?, pivot?, length?, angle?, center?, radius?, speed?, axis? }
- setOverlay: { title, readouts?, showControls?, position?, slider?: { id, label, min, max, value, step? } }
- focusCamera: { position, target, duration? }
- remove: { id }

Rules:
- Always start with ensureLab. Include setOverlay with play/pause/reset and a slider when a parameter matters.
- Use unique string ids. Prefer cyan/amber accents on dark lab.
- Keep ops lists short (≤20).
- color must be a NUMBER (e.g. 0x38bdf8), never "#38bdf8"
- positions/vectors must be [x,y,z] number arrays
- version must be number 1
- Emit the FULL scene every time (including improve/patch) — never a partial delta
- NEVER reference http(s) URLs, .gltf, .glb, or .hdr assets`;
