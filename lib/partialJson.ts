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
    content_type: "threejs";
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
  content_type: "threejs";
  content: string;
} | null {
  const parsed = safeParseJson(raw);
  const content = parsed.content;
  if (typeof content !== "string" || !content) return null;

  // Accept legacy content_type values but always treat as threejs.
  return { content_type: "threejs", content };
}
