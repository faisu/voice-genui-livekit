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
    lesson_id?: string;
    stage_id?: string;
    stage_index?: number;
    total_stages?: number;
  },
  contentFragment: string,
): string {
  const payload: Record<string, unknown> = {
    mode: request.mode,
    content_type: request.content_type,
    content: contentFragment,
  };
  if (request.title) payload.title = request.title;
  if (request.lesson_id) payload.lesson_id = request.lesson_id;
  if (request.stage_id) payload.stage_id = request.stage_id;
  if (typeof request.stage_index === "number") {
    payload.stage_index = request.stage_index;
  }
  if (typeof request.total_stages === "number") {
    payload.total_stages = request.total_stages;
  }
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

  // Models sometimes emit scene_ops as an object instead of a JSON string.
  if (typeof content === "object") {
    return {
      content_type: "scene_ops",
      content: JSON.stringify(content),
    };
  }

  if (typeof content !== "string") return null;

  const contentType = parsed.content_type;
  if (contentType === "scene_ops") {
    return { content_type: "scene_ops", content };
  }

  // Heuristic: if the string looks like scene_ops JSON, treat it as such.
  const trimmed = content.trim();
  if (
    trimmed.startsWith("{") &&
    (trimmed.includes('"ops"') || trimmed.includes('"ensureLab"'))
  ) {
    return { content_type: "scene_ops", content };
  }
  if (trimmed.startsWith("[") && trimmed.includes('"op"')) {
    return { content_type: "scene_ops", content };
  }

  // Accept legacy / threejs content_type values.
  return { content_type: "threejs", content };
}

/** Best-effort extract of stage metadata from streaming partial JSON. */
export function extractPartialStageMeta(partialJson: string): {
  title?: string;
  lesson_id?: string;
  stage_id?: string;
  stage_index?: number;
  total_stages?: number;
  content_type?: CanvasContentType;
} {
  const parsed = safeParseJson(partialJson);
  const meta: {
    title?: string;
    lesson_id?: string;
    stage_id?: string;
    stage_index?: number;
    total_stages?: number;
    content_type?: CanvasContentType;
  } = {};

  if (typeof parsed.title === "string") meta.title = parsed.title;
  if (typeof parsed.lesson_id === "string") meta.lesson_id = parsed.lesson_id;
  if (typeof parsed.stage_id === "string") meta.stage_id = parsed.stage_id;
  if (typeof parsed.stage_index === "number") meta.stage_index = parsed.stage_index;
  if (typeof parsed.total_stages === "number") meta.total_stages = parsed.total_stages;
  if (parsed.content_type === "scene_ops" || parsed.content_type === "threejs") {
    meta.content_type = parsed.content_type;
  }
  return meta;
}
