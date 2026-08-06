import type { SceneOpsDocument } from "../sceneOps";
import {
  coerceSceneOpsDocument,
  sceneOpsDocumentSchema,
} from "../sceneOps";
import type { DemoSummary, EmitScenePayload } from "./types";

export type ResolveSceneResult = {
  doc: SceneOpsDocument;
  summary: DemoSummary;
};

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

export function resolveSceneEmit(
  payload: EmitScenePayload,
): ResolveSceneResult | { error: string } {
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

  try {
    assertNoExternalAssets(parsed.data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const inferred = summaryFromSceneOps(
    parsed.data,
    payload.title,
    payload.observe,
  );

  return {
    doc: parsed.data,
    summary: {
      ...inferred,
      title: payload.title?.trim() || inferred.title,
      observe: payload.observe?.trim() || inferred.observe,
      elements:
        payload.elements && payload.elements.length > 0
          ? payload.elements
          : inferred.elements,
      params:
        payload.params && payload.params.length > 0
          ? payload.params
          : inferred.params,
      controls:
        payload.controls && payload.controls.length > 0
          ? payload.controls
          : inferred.controls,
    },
  };
}

/** Best-effort convert { ensureLab: {}, sphere: {...} } maps into scene_ops. */
function coerceKeyedOpsMap(raw: unknown): SceneOpsDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const map = raw as Record<string, unknown>;
  const ops: unknown[] = [];

  if ("ensureLab" in map) {
    const lab =
      map.ensureLab && typeof map.ensureLab === "object"
        ? (map.ensureLab as Record<string, unknown>)
        : {};
    ops.push({ op: "ensureLab", ...lab });
  }

  for (const [key, value] of Object.entries(map)) {
    if (key === "ensureLab" || key === "version" || key === "ops") continue;
    const entry =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};

    if (
      key === "setOverlay" ||
      entry.op === "setOverlay" ||
      entry.type === "overlay"
    ) {
      ops.push({
        op: "setOverlay",
        title:
          (typeof entry.title === "string" && entry.title) ||
          (typeof entry.type === "string" && entry.type) ||
          (typeof entry.overlay === "string" && entry.overlay) ||
          "Lab demo",
        showControls: entry.showControls !== false,
        ...(entry.slider && typeof entry.slider === "object"
          ? { slider: entry.slider }
          : {}),
      });
      continue;
    }

    if (
      key === "setMotion" ||
      entry.op === "setMotion" ||
      typeof entry.mode === "string" ||
      typeof entry.motion === "string"
    ) {
      ops.push({
        op: "setMotion",
        id:
          (typeof entry.id === "string" && entry.id) ||
          (typeof entry.target === "string" && entry.target) ||
          (typeof entry.name === "string" && entry.name) ||
          "body",
        type:
          (typeof entry.type === "string" && entry.type) ||
          (typeof entry.mode === "string" && entry.mode) ||
          (typeof entry.motion === "string" && entry.motion) ||
          "static",
        ...entry,
      });
      continue;
    }

    const kind =
      (typeof entry.kind === "string" && entry.kind) ||
      (typeof entry.type === "string" && entry.type) ||
      (/^(sphere|box|plane|cylinder|cone|torus|line)$/i.test(key)
        ? key.toLowerCase()
        : null);
    if (kind) {
      ops.push({
        ...entry,
        op: "addObject",
        id:
          (typeof entry.id === "string" && entry.id) ||
          (typeof entry.name === "string" && entry.name) ||
          key,
        kind,
        materialPreset: entry.materialPreset ?? entry.material,
      });
    }
  }

  if (ops.length === 0) return null;
  return coerceSceneOpsDocument({ version: 1, ops });
}

export function parseEmitScene(raw: unknown): EmitScenePayload | null {
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

  if (obj.scene && typeof obj.scene === "object") {
    return parseEmitScene(obj.scene);
  }

  const title = typeof obj.title === "string" ? obj.title : undefined;
  const observe = typeof obj.observe === "string" ? obj.observe : undefined;

  let opsValue: unknown = obj.ops;
  if (typeof opsValue === "string") {
    try {
      opsValue = JSON.parse(opsValue);
    } catch {
      opsValue = undefined;
    }
  }

  let opsDoc: SceneOpsDocument | null = null;
  if (opsValue != null || obj.version === 1) {
    if (Array.isArray(opsValue)) {
      opsDoc = coerceSceneOpsDocument({ version: 1, ops: opsValue });
    } else if (opsValue && typeof opsValue === "object") {
      const nested = opsValue as Record<string, unknown>;
      if (Array.isArray(nested.ops) || nested.version === 1) {
        opsDoc = coerceSceneOpsDocument(opsValue);
      } else {
        // Model sometimes emits a keyed map instead of { version, ops: [] }.
        opsDoc = coerceSceneOpsDocument(opsValue);
        if (!opsDoc) {
          opsDoc = coerceKeyedOpsMap(opsValue);
        }
      }
    } else if (obj.version === 1) {
      opsDoc = coerceSceneOpsDocument(obj);
    }
  }

  if (!opsDoc) return null;

  const payload: EmitScenePayload = { ops: opsDoc, title, observe };

  if (Array.isArray(obj.elements)) {
    payload.elements = obj.elements as DemoSummary["elements"];
  }
  if (Array.isArray(obj.params)) {
    payload.params = obj.params as DemoSummary["params"];
  }
  if (Array.isArray(obj.controls)) {
    payload.controls = obj.controls.filter(
      (c): c is string => typeof c === "string",
    );
  }

  return payload;
}
