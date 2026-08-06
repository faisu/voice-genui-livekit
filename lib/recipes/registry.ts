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

  let opsDoc: SceneOpsDocument | null = null;
  if (obj.ops || obj.version === 1) {
    opsDoc = coerceSceneOpsDocument(
      obj.ops && !Array.isArray(obj.ops) && typeof obj.ops === "object"
        ? obj.ops
        : obj.ops
          ? { version: 1, ops: obj.ops }
          : obj,
    );
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
