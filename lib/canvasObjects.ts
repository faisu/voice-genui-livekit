import {
  extractPartialContentField,
  extractPartialStageMeta,
} from "@/lib/partialJson";
import type { CanvasDataMessage, WorldDemo } from "@/lib/types";

export type CanvasWorldState = {
  demo: WorldDemo | null;
};

export type CanvasWorldAccumulator = {
  demo: WorldDemo | null;
};

export function createCanvasWorldAccumulator(): CanvasWorldAccumulator {
  return { demo: null };
}

export function toCanvasWorldState(acc: CanvasWorldAccumulator): CanvasWorldState {
  return { demo: acc.demo };
}

export function applyCanvasMessage(
  acc: CanvasWorldAccumulator,
  message: CanvasDataMessage,
): CanvasWorldAccumulator {
  if (message.type === "tool_call_delta" && message.name === "render_canvas") {
    return applyCanvasDelta(acc, message.partialInput);
  }

  if (message.type === "tool_call_complete" && message.name === "render_canvas") {
    return applyCanvasComplete(acc, message.input);
  }

  return acc;
}

function applyCanvasDelta(
  acc: CanvasWorldAccumulator,
  partialInput: string,
): CanvasWorldAccumulator {
  const content = extractPartialContentField(partialInput);
  const meta = extractPartialStageMeta(partialInput);
  const title = meta.title ?? extractPartialTitleField(partialInput);

  if (acc.demo) {
    acc.demo = {
      ...acc.demo,
      title: title ?? acc.demo.title,
      content: content || acc.demo.content,
      content_type: meta.content_type ?? acc.demo.content_type,
      streaming: true,
      updatedAt: Date.now(),
    };
    return acc;
  }

  acc.demo = {
    title,
    content: content || "",
    content_type: meta.content_type ?? "scene_ops",
    streaming: true,
    updatedAt: Date.now(),
  };
  return acc;
}

function applyCanvasComplete(
  acc: CanvasWorldAccumulator,
  input: Extract<CanvasDataMessage, { type: "tool_call_complete" }>["input"],
): CanvasWorldAccumulator {
  acc.demo = {
    title: input.title,
    content: input.content,
    content_type: input.content_type,
    streaming: false,
    updatedAt: Date.now(),
  };
  return acc;
}

function extractPartialTitleField(partialJson: string): string | undefined {
  const marker = '"title"';
  const idx = partialJson.indexOf(marker);
  if (idx === -1) return undefined;

  let i = idx + marker.length;
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i++;
  if (partialJson[i] !== ":") return undefined;
  i++;
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i++;
  if (partialJson[i] !== '"') return undefined;
  i++;

  let result = "";
  while (i < partialJson.length) {
    const ch = partialJson[i]!;
    if (ch === '"') break;
    if (ch === "\\" && i + 1 < partialJson.length) {
      result += partialJson[i + 1]!;
      i += 2;
      continue;
    }
    result += ch;
    i++;
  }

  return result || undefined;
}

export function buildCanvasWorldState(
  messages: CanvasDataMessage[],
): CanvasWorldState {
  let acc = createCanvasWorldAccumulator();
  for (const message of messages) {
    acc = applyCanvasMessage(acc, message);
  }
  return toCanvasWorldState(acc);
}
