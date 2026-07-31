import type { CanvasContentType } from "./types";

/** Extract partial `content` string from streaming tool-call JSON. */
export function extractPartialContentField(partialJson: string): string {
  const marker = '"content"';
  const idx = partialJson.indexOf(marker);
  if (idx === -1) return "";

  let i = idx + marker.length;
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i++;
  if (partialJson[i] !== ":") return "";
  i++;
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i++;
  if (partialJson[i] !== '"') return "";
  i++;

  let result = "";
  while (i < partialJson.length) {
    const ch = partialJson[i]!;
    if (ch === '"') break;
    if (ch === "\\" && i + 1 < partialJson.length) {
      const next = partialJson[i + 1]!;
      const escapes: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        '"': '"',
        "\\": "\\",
      };
      result += escapes[next] ?? next;
      i += 2;
      continue;
    }
    result += ch;
    i++;
  }

  return result;
}

export function buildStreamingPartialJson(
  request: {
    mode: "replace" | "patch";
    content_type: CanvasContentType;
    title?: string;
  },
  contentFragment: string,
): string {
  const payload: Record<string, unknown> = {
    mode: request.mode,
    content_type: request.content_type,
    content: contentFragment,
  };
  if (request.title) payload.title = request.title;
  return JSON.stringify(payload);
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function parseEmitCanvasContent(raw: string): {
  content_type: CanvasContentType;
  content: string;
} | null {
  const parsed = safeParseJson(raw);
  const content = parsed.content;
  if (content == null || content === "") return null;

  if (typeof content !== "string") return null;

  return { content_type: "scene_ops", content };
}

/** Extract recipe emit payload from emit_recipe tool arguments. */
export function parseEmitRecipeArgs(raw: string): unknown | null {
  const parsed = safeParseJson(raw);
  if (parsed.skillId || parsed.ops || parsed.recipe || parsed.version === 1) {
    return parsed;
  }
  if (parsed.spec && typeof parsed.spec === "object") {
    return parsed.spec;
  }
  return Object.keys(parsed).length ? parsed : null;
}

/** @deprecated VisualSpec path removed. */
export function parseEmitVisualSpec(raw: string): unknown | null {
  return parseEmitRecipeArgs(raw);
}

/** Best-effort extract of metadata from streaming partial JSON. */
export function extractPartialStageMeta(partialJson: string): {
  title?: string;
  content_type?: CanvasContentType;
} {
  const parsed = safeParseJson(partialJson);
  const meta: {
    title?: string;
    content_type?: CanvasContentType;
  } = {};

  if (typeof parsed.title === "string") meta.title = parsed.title;
  if (parsed.content_type === "scene_ops") {
    meta.content_type = "scene_ops";
  }
  return meta;
}
