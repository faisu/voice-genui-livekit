import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import { streamText, tool } from "ai";
import { z } from "zod";
import { getLanguageModel } from "../lib/ai/index.js";
import type { RenderCanvasInput } from "../lib/types.js";
import {
  buildStreamingPartialJson,
  extractPartialContentField,
  parseEmitCanvasContent,
} from "../lib/partialJson.js";
import { resolveDomain } from "../lib/domain/index.js";
import { getCanvasState } from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";

const DELTA_THROTTLE_MS = 180;
const DELTA_MIN_CHARS = 72;

const emitCanvasContentSchema = z.object({
  content_type: z.literal("threejs"),
  content: z.string(),
});

function logger() {
  return log();
}

function buildUserPrompt(request: RenderCanvasRequest, roomName: string): string {
  const domain = resolveDomain();
  const parts = [
    domain.renderUserPromptPrefix,
    `Title: ${request.title ?? "Untitled"}`,
    `Lesson brief: ${request.visual_brief}`,
    `Mode: ${request.mode}`,
  ];

  if (request.mode === "patch") {
    const existing = getCanvasState(roomName);
    if (existing?.content) {
      parts.push(`Existing scene to patch:\n${existing.content}`);
    }
  }

  return parts.join("\n\n");
}

export type CanvasRenderJobResult = {
  title?: string;
  content_type: "threejs";
  content_length: number;
};

export async function runCanvasRenderJob(options: {
  room: Room;
  roomName: string;
  request: RenderCanvasRequest;
  abortSignal?: AbortSignal;
}): Promise<CanvasRenderJobResult> {
  const { room, roomName, request, abortSignal } = options;
  const domain = resolveDomain();

  const emitCanvasContent = tool({
    description: `Emit the finished full-viewport Three.js ${domain.subject.toLowerCase()} scene.`,
    inputSchema: emitCanvasContentSchema,
    execute: async (input) => input,
  });

  let toolArguments = "";
  let lastPublishedContent = "";
  let lastPublishAt = 0;
  let pendingContent = "";
  let pendingPartialJson = "";

  const flushDelta = async (force = false) => {
    if (!pendingContent && !force) return;
    const grew = pendingContent.length - lastPublishedContent.length;
    const elapsed = Date.now() - lastPublishAt;
    if (!force && pendingContent && grew < DELTA_MIN_CHARS && elapsed < DELTA_THROTTLE_MS) {
      return;
    }

    if (pendingContent) {
      lastPublishedContent = pendingContent;
      lastPublishAt = Date.now();
      await publishToolCallDelta(room, pendingPartialJson);
    }
  };

  const result = streamText({
    model: getLanguageModel("render"),
    system: domain.renderSystemPrompt,
    prompt: buildUserPrompt(request, roomName),
    tools: { emit_canvas_content: emitCanvasContent },
    toolChoice: { type: "tool", toolName: "emit_canvas_content" },
    abortSignal,
    maxOutputTokens: 8192,
  });

  for await (const part of result.fullStream) {
    if (abortSignal?.aborted) {
      throw new Error("Canvas render cancelled");
    }

    if (part.type === "tool-input-delta") {
      toolArguments += part.inputTextDelta;
      const content = extractPartialContentField(toolArguments);
      if (content) {
        pendingContent = content;
        pendingPartialJson = buildStreamingPartialJson(
          {
            mode: request.mode,
            content_type: "threejs",
            title: request.title,
          },
          content,
        );
        await flushDelta(false);
      }
    }

    if (part.type === "tool-call" && part.toolName === "emit_canvas_content") {
      toolArguments = JSON.stringify(part.input ?? {});
    }
  }

  await flushDelta(true);

  const emitted = parseEmitCanvasContent(toolArguments);
  if (!emitted) {
    throw new Error("Background render did not produce canvas content");
  }

  const input: RenderCanvasInput = {
    mode: request.mode,
    content_type: "threejs",
    content: emitted.content,
    title: request.title,
  };

  await publishToolCallComplete(room, roomName, input);
  logger().info({ title: input.title }, "Background canvas render complete");

  return {
    title: input.title,
    content_type: "threejs",
    content_length: input.content.length,
  };
}
