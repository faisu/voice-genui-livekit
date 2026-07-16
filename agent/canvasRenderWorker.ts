import Anthropic from "@anthropic-ai/sdk";
import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import type { RenderCanvasInput } from "../lib/types.js";
import {
  buildStreamingPartialJson,
  extractPartialContentField,
  parseEmitCanvasContent,
} from "../lib/partialJson.js";
import { getCanvasState } from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";
import { resolveDomain } from "../lib/domain/index.js";

const DELTA_THROTTLE_MS = 180;
const DELTA_MIN_CHARS = 72;

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
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const model =
    process.env.ANTHROPIC_RENDER_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-5-20250929";

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

  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    system: resolveDomain().renderSystemPrompt,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(request, roomName),
      },
    ],
    tools: [
      {
        name: "emit_canvas_content",
        description: `Emit the finished full-viewport Three.js ${resolveDomain().subject.toLowerCase()} scene.`,
        input_schema: {
          type: "object",
          properties: {
            content_type: { type: "string", enum: ["threejs"] },
            content: { type: "string" },
          },
          required: ["content_type", "content"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_canvas_content" },
  });

  for await (const event of stream) {
    if (abortSignal?.aborted) {
      throw new Error("Canvas render cancelled");
    }

    if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
      toolArguments += event.delta.partial_json;
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
