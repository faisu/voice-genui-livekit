import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import { streamText, tool } from "ai";
import { z } from "zod";
import {
  getLanguageModel,
  resolveLlmModel,
  resolveLlmProvider,
  getRenderProviderOptions,
} from "../lib/ai/index.js";
import type { RenderCanvasInput } from "../lib/types.js";
import { serializeSceneOpsDocument } from "../lib/sceneOps.js";
import { buildStreamingPartialJson, parseEmitSceneArgs } from "../lib/partialJson.js";
import { resolveDomain } from "../lib/domain/index.js";
import {
  getAccumulatedSceneOps,
  getLearnerProfile,
  setAccumulatedSceneOps,
  setDemoSummary,
} from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";
import { AGE_BAND_OPTIONS } from "../lib/learnerProfile.js";
import {
  parseEmitScene,
  resolveSceneEmit,
  type DemoSummary,
} from "../lib/recipes/index.js";

const DELTA_THROTTLE_MS = 2500;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const emitSceneSchema = z.object({
  title: z.string().max(120).optional(),
  observe: z
    .string()
    .max(280)
    .optional()
    .describe("One short observation cue for the student."),
  elements: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  params: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        value: z.number(),
        min: z.number(),
        max: z.number(),
        unit: z.string().optional(),
      }),
    )
    .optional(),
  controls: z.array(z.string()).optional(),
  ops: z
    .unknown()
    .describe(
      "Complete SceneOpsDocument: { version: 1, ops: [...] } for the full lab.",
    ),
});

function logger() {
  return log();
}

function buildUserPrompt(
  request: RenderCanvasRequest,
  roomName: string,
  repairHint?: string,
): string {
  const domain = resolveDomain();
  const profile = getLearnerProfile(roomName);
  const existing = getAccumulatedSceneOps(roomName);

  const parts = [
    domain.renderUserPromptPrefix,
    `Title hint: ${request.title ?? "Untitled"}`,
    `Lesson brief: ${request.visual_brief}`,
    `Mode: ${request.mode}`,
    "Call emit_scene with a COMPLETE scene_ops document (version 1 + full ops list) plus title/observe. Never emit HTML, SVG, or Three.js code.",
  ];

  if (profile) {
    const ageLabel =
      AGE_BAND_OPTIONS.find((option) => option.value === profile.ageBand)
        ?.label ?? profile.ageBand;
    parts.push(
      `Learner: ${profile.name} (age band ${ageLabel}). Match complexity to this level.`,
    );
  }

  if (existing) {
    const refineHint =
      request.mode === "patch"
        ? "Improve/tweak the existing lab for a better illustration of the brief. Emit a COMPLETE updated scene_ops document (full scene), not a partial delta."
        : "Prior lab scene_ops are provided for continuity. Emit a COMPLETE scene_ops document for this brief (full scene).";
    parts.push(
      `${refineHint}\nPrior scene_ops:\n${JSON.stringify(existing).slice(0, 3500)}`,
    );
  }

  if (repairHint) {
    parts.push(
      `Previous emit was invalid. Fix these issues and call emit_scene again:\n${repairHint}`,
    );
  }

  return parts.join("\n\n");
}

export type CanvasRenderJobResult = {
  title?: string;
  content_type: "scene_ops";
  content: string;
  content_length: number;
  summary: DemoSummary;
};

async function requestSceneFromModel(options: {
  request: RenderCanvasRequest;
  roomName: string;
  abortSignal?: AbortSignal;
  maxOutputTokens: number;
  repairHint?: string;
  onToolDelta?: () => Promise<void>;
}): Promise<{ raw: unknown; toolArguments: string }> {
  const domain = resolveDomain();
  const { request, roomName, abortSignal, maxOutputTokens, repairHint, onToolDelta } =
    options;

  const emitScene = tool({
    description: `Emit a complete constrained scene_ops lab for ${domain.subject.toLowerCase()}. Never emit HTML, SVG, or Three.js code.`,
    inputSchema: emitSceneSchema,
    execute: async (input) => input,
  });

  const systemPrompt = `${domain.renderSystemPrompt}\nYou MUST call the emit_scene tool — do not answer with plain text.`;

  const provider = resolveLlmProvider();
  const modelId = resolveLlmModel("render");
  const renderProviderOptions = getRenderProviderOptions();
  logger().info(
    { provider, modelId, title: request.title, repair: Boolean(repairHint) },
    "Starting scene_ops render job",
  );

  // OpenAI-compatible gateways (qwen/kimi) often reject forced toolName choice.
  const toolChoice =
    provider === "kimi" || provider === "qwen"
      ? ("required" as const)
      : ({ type: "tool", toolName: "emit_scene" } as const);

  let toolArguments = "";

  const result = streamText({
    model: getLanguageModel("render"),
    system: systemPrompt,
    prompt: buildUserPrompt(request, roomName, repairHint),
    tools: { emit_scene: emitScene },
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
      await onToolDelta?.();
    }

    if (part.type === "tool-call" && part.toolName === "emit_scene") {
      toolArguments = JSON.stringify(part.input ?? {});
    }
  }

  const raw = parseEmitSceneArgs(toolArguments);
  return { raw, toolArguments };
}

export async function runCanvasRenderJob(options: {
  room: Room;
  roomName: string;
  request: RenderCanvasRequest;
  abortSignal?: AbortSignal;
  publishComplete?: boolean;
  maxOutputTokens?: number;
}): Promise<CanvasRenderJobResult> {
  const {
    room,
    roomName,
    request,
    abortSignal,
    publishComplete = true,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  } = options;

  let lastPublishAt = 0;
  let publishedBuildingDelta = false;

  const publishBuildingDelta = async (force = false) => {
    const elapsed = Date.now() - lastPublishAt;
    if (!force && publishedBuildingDelta && elapsed < DELTA_THROTTLE_MS) {
      return;
    }
    lastPublishAt = Date.now();
    publishedBuildingDelta = true;
    await publishToolCallDelta(
      room,
      buildStreamingPartialJson(
        {
          mode: request.mode,
          content_type: "scene_ops",
          title: request.title,
        },
        "",
      ),
    );
  };

  await publishBuildingDelta(true);

  let repairHint: string | undefined;
  let resolved: Awaited<ReturnType<typeof resolveOnce>> | null = null;
  let lastPreview = "";
  let lastError = "Model did not emit a valid scene";

  async function resolveOnce(raw: unknown) {
    const payload = parseEmitScene(raw);
    if (!payload) {
      return { error: "Model did not emit a scene payload with ops" } as const;
    }
    return resolveSceneEmit(payload);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw, toolArguments } = await requestSceneFromModel({
      request,
      roomName,
      abortSignal,
      maxOutputTokens,
      repairHint,
      onToolDelta: () => publishBuildingDelta(false),
    });
    lastPreview = toolArguments.slice(0, 500);

    const result = await resolveOnce(raw);
    if ("error" in result) {
      lastError = result.error;
      repairHint = result.error;
      logger().warn(
        { attempt, error: result.error, preview: lastPreview },
        "Scene emit validation failed",
      );
      continue;
    }
    resolved = result;
    break;
  }

  if (!resolved) {
    logger().error(
      { preview: lastPreview, error: lastError },
      "Background render did not produce a valid scene_ops document",
    );
    throw new Error(
      `Background render did not produce a valid scene: ${lastError}`,
    );
  }

  const content = serializeSceneOpsDocument(resolved.doc);
  const title = request.title ?? resolved.summary.title;
  const summary: DemoSummary = {
    ...resolved.summary,
    title,
  };

  setAccumulatedSceneOps(roomName, "live", resolved.doc);
  setDemoSummary(roomName, summary);

  logger().info(
    {
      title,
      contentLength: content.length,
      ops: resolved.doc.ops.length,
    },
    "Scene resolved; publishing scene_ops to client",
  );

  const input: RenderCanvasInput = {
    mode: request.mode,
    content_type: "scene_ops",
    content,
    title,
  };

  if (publishComplete) {
    try {
      await publishToolCallComplete(room, roomName, input);
    } catch (error) {
      logger().error(
        {
          error,
          title: input.title,
          contentLength: input.content.length,
        },
        "Failed to publish canvas content to client",
      );
      throw error;
    }
  }

  return {
    title: input.title,
    content_type: "scene_ops",
    content: input.content,
    content_length: input.content.length,
    summary,
  };
}
