import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import { streamText, tool } from "ai";
import { z } from "zod";
import { getLanguageModel, resolveLlmModel, resolveLlmProvider, getRenderProviderOptions } from "../lib/ai/index.js";
import type { RenderCanvasInput } from "../lib/types.js";
import {
  buildStreamingPartialJson,
  extractPartialContentField,
  parseEmitCanvasContent,
} from "../lib/partialJson.js";
import { resolveDomain } from "../lib/domain/index.js";
import { SCENE_OPS_PROMPT } from "../lib/sceneOps.js";
import { getCanvasState } from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";

const DELTA_THROTTLE_MS = 180;
const DELTA_MIN_CHARS = 72;

const emitCanvasContentSchema = z.object({
  content_type: z.enum(["threejs", "scene_ops"]),
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
    `Preferred content_type: ${request.content_type ?? "threejs"}`,
  ];

  if (request.mode === "patch") {
    const existing = getCanvasState(roomName);
    if (existing?.content) {
      parts.push(
        `Existing scene to patch (${existing.content_type}):\n${existing.content}`,
      );
    }
  }

  return parts.join("\n\n");
}

export type CanvasRenderJobResult = {
  title?: string;
  content_type: "threejs" | "scene_ops";
  content: string;
  content_length: number;
};

export async function runCanvasRenderJob(options: {
  room: Room;
  roomName: string;
  request: RenderCanvasRequest;
  abortSignal?: AbortSignal;
  /** When false, caller publishes the complete message (staged path). Default true. */
  publishComplete?: boolean;
  preferSceneOps?: boolean;
  maxOutputTokens?: number;
}): Promise<CanvasRenderJobResult> {
  const {
    room,
    roomName,
    request,
    abortSignal,
    publishComplete = true,
    preferSceneOps = false,
    maxOutputTokens = preferSceneOps ? 2200 : 8192,
  } = options;
  const domain = resolveDomain();

  const emitCanvasContent = tool({
    description: preferSceneOps
      ? `Emit a scene_ops JSON document for a staged ${domain.subject.toLowerCase()} teaching scene.`
      : `Emit the finished full-viewport Three.js ${domain.subject.toLowerCase()} scene.`,
    inputSchema: emitCanvasContentSchema,
    execute: async (input) => input,
  });

  let toolArguments = "";
  let lastPublishedContent = "";
  let lastPublishAt = 0;
  let pendingContent = "";
  let pendingPartialJson = "";

  const contentTypeHint = preferSceneOps ? "scene_ops" : "threejs";

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

  const systemPrompt = preferSceneOps
    ? `${domain.renderSystemPrompt}\n\nSTAGED SCENE_OPS MODE (override threejs default):\n${SCENE_OPS_PROMPT}\nAlways set content_type to "scene_ops". The content field must be a JSON string (escaped) of {"version":1,"ops":[...]}.\nYou MUST call the emit_canvas_content tool — do not answer with plain text.`
    : `${domain.renderSystemPrompt}\nYou MUST call the emit_canvas_content tool — do not answer with plain text.`;

  // Kimi K3 always thinks and rejects tool_choice that names a specific function.
  // Use "required" (must call a tool) instead of forcing emit_canvas_content by name.
  const provider = resolveLlmProvider();
  const modelId = resolveLlmModel("render");
  const renderProviderOptions = getRenderProviderOptions();
  logger().info(
    { provider, modelId, preferSceneOps, title: request.title },
    "Starting canvas render job",
  );

  const toolChoice =
    provider === "kimi"
      ? ("required" as const)
      : ({ type: "tool", toolName: "emit_canvas_content" } as const);

  const result = streamText({
    model: getLanguageModel("render"),
    system: systemPrompt,
    prompt: buildUserPrompt(
      { ...request, content_type: preferSceneOps ? "scene_ops" : request.content_type },
      roomName,
    ),
    tools: { emit_canvas_content: emitCanvasContent },
    toolChoice,
    abortSignal,
    maxOutputTokens,
    ...(renderProviderOptions
      ? { providerOptions: renderProviderOptions }
      : {}),
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
            content_type: contentTypeHint,
            title: request.title,
            lesson_id: request.lesson_id,
            stage_id: request.stage_id,
            stage_index: request.stage_index,
            total_stages: request.total_stages,
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

  // Prefer explicit model choice; if preferSceneOps, coerce when possible.
  let content_type = emitted.content_type;
  if (preferSceneOps && content_type !== "scene_ops") {
    // Model ignored instruction — keep threejs so caller can fallback/retry.
    content_type = emitted.content_type;
  }

  const input: RenderCanvasInput = {
    mode: request.mode,
    content_type,
    content: emitted.content,
    title: request.title,
    lesson_id: request.lesson_id,
    stage_id: request.stage_id,
    stage_index: request.stage_index,
    total_stages: request.total_stages,
  };

  if (publishComplete) {
    await publishToolCallComplete(room, roomName, input);
  }

  logger().info(
    { title: input.title, content_type: input.content_type },
    "Background canvas render complete",
  );

  return {
    title: input.title,
    content_type: input.content_type,
    content: input.content,
    content_length: input.content.length,
  };
}
