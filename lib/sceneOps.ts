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
  kind: z.enum(["sphere", "box", "plane", "cylinder", "line"]),
  position: vec3Schema.optional(),
  rotation: vec3Schema.optional(),
  scale: vec3Schema.optional(),
  size: z.number().positive().optional(),
  color: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("scene_ops content is not valid JSON");
  }
  return sceneOpsDocumentSchema.parse(parsed);
}

export function tryParseSceneOpsDocument(raw: string): SceneOpsDocument | null {
  try {
    return parseSceneOpsDocument(raw);
  } catch {
    return null;
  }
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
export const SCENE_OPS_PROMPT = `Emit content_type "scene_ops" with content as a JSON string of:
{"version":1,"ops":[...]}

Allowed ops (discriminated by "op"):
- ensureLab: { grid?, clearColor? } — call once in stage 1 to create the lab shell
- addObject: { id, kind: sphere|box|plane|cylinder|line, position?, rotation?, scale?, size?, color?, opacity?, from?, to? }
- addArrow: { id, origin, direction, length?, color?, label? }
- addTrail: { id, targetId, maxPoints?, color? }
- setMotion: { id, type: static|projectile|pendulum|orbit|oscillate, origin?, velocity?, gravity?, pivot?, length?, angle?, center?, radius?, speed?, axis? }
- setOverlay: { title, readouts?, showControls? }
- focusCamera: { position, target, duration? } — duration 0–2 mid-lesson; up to ~4 on final stage only
- remove: { id }

Rules:
- Stage 1: ensureLab + core object(s) + focusCamera (snap or ≤1s). No motion yet unless essential.
- Later stages: ONLY additive ops (new objects, arrows, trails, motion, overlay updates). Never recreate the lab.
- Use unique string ids. Prefer cyan/amber accents on dark lab.
- Keep ops lists short (≤12 per stage).`;
