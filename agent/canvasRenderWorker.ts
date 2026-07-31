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
import { buildStreamingPartialJson, parseEmitRecipeArgs } from "../lib/partialJson.js";
import { resolveDomain } from "../lib/domain/index.js";
import {
  getAccumulatedSceneOps,
  getLearnerProfile,
  setAccumulatedSceneOps,
  setDemoSummary,
  setLastSkillId,
} from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";
import { AGE_BAND_OPTIONS } from "../lib/learnerProfile.js";
import {
  parseEmitRecipe,
  resolveRecipeEmit,
  skillCatalogPrompt,
  type DemoSummary,
} from "../lib/recipes/index.js";

const DELTA_THROTTLE_MS = 2500;
const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

const emitRecipeSchema = z.object({
  skillId: z
    .string()
    .optional()
    .describe("Preferred: registered recipe skill id (e.g. projectile)."),
  paramOverrides: z
    .record(z.string(), z.number())
    .optional()
    .describe("Optional numeric param overrides for the skill."),
  observe: z.string().max(280).optional(),
  title: z.string().max(120).optional(),
  ops: z
    .unknown()
    .optional()
    .describe("Freeform SceneOpsDocument fallback when no skill fits."),
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
  const parts = [
    domain.renderUserPromptPrefix,
    `Title hint: ${request.title ?? "Untitled"}`,
    `Lesson brief: ${request.visual_brief}`,
    `Mode: ${request.mode}`,
    "Call emit_recipe with skillId + paramOverrides when a skill matches. Otherwise emit ops as scene_ops.",
    `Registered skills:\n${skillCatalogPrompt()}`,
  ];

  if (profile) {
    const ageLabel =
      AGE_BAND_OPTIONS.find((option) => option.value === profile.ageBand)
        ?.label ?? profile.ageBand;
    parts.push(
      `Learner: ${profile.name} (age band ${ageLabel}). Match complexity to this level.`,
    );
  }

  if (request.mode === "patch") {
    const existing = getAccumulatedSceneOps(roomName);
    if (existing) {
      parts.push(
        `Existing scene_ops (for context). Prefer re-emitting the same skillId with updated paramOverrides:\n${JSON.stringify(existing).slice(0, 2000)}`,
      );
    }
  }

  if (repairHint) {
    parts.push(
      `Previous emit was invalid. Fix these issues and call emit_recipe again:\n${repairHint}`,
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
  skillId?: string;
};

async function requestRecipeFromModel(options: {
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

  const emitRecipe = tool({
    description: `Emit a recipe skill or constrained scene_ops for ${domain.subject.toLowerCase()}. Never emit HTML, SVG, or Three.js code.`,
    inputSchema: emitRecipeSchema,
    execute: async (input) => input,
  });

  const systemPrompt = `${domain.renderSystemPrompt}\nYou MUST call the emit_recipe tool — do not answer with plain text.`;

  const provider = resolveLlmProvider();
  const modelId = resolveLlmModel("render");
  const renderProviderOptions = getRenderProviderOptions();
  logger().info(
    { provider, modelId, title: request.title, repair: Boolean(repairHint) },
    "Starting recipe render job",
  );

  const toolChoice =
    provider === "kimi"
      ? ("required" as const)
      : ({ type: "tool", toolName: "emit_recipe" } as const);

  let toolArguments = "";

  const result = streamText({
    model: getLanguageModel("render"),
    system: systemPrompt,
    prompt: buildUserPrompt(request, roomName, repairHint),
    tools: { emit_recipe: emitRecipe },
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

    if (part.type === "tool-call" && part.toolName === "emit_recipe") {
      toolArguments = JSON.stringify(part.input ?? {});
    }
  }

  const raw = parseEmitRecipeArgs(toolArguments);
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
  let lastError = "Model did not emit a valid recipe";

  async function resolveOnce(raw: unknown) {
    const payload = parseEmitRecipe(raw);
    if (!payload) {
      return { error: "Model did not emit a recipe payload" } as const;
    }
    return resolveRecipeEmit(payload, request.visual_brief);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw, toolArguments } = await requestRecipeFromModel({
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
        "Recipe emit validation failed",
      );
      continue;
    }
    resolved = result;
    break;
  }

  // Hard fallback to nearest skill from brief
  if (!resolved) {
    const fallback = resolveRecipeEmit({}, request.visual_brief);
    if (!("error" in fallback)) {
      resolved = fallback;
      logger().warn(
        { skillId: fallback.skillId },
        "Using keyword skill fallback after emit failures",
      );
    }
  }

  if (!resolved) {
    logger().error(
      { preview: lastPreview, error: lastError },
      "Background render did not produce a valid recipe",
    );
    throw new Error(
      `Background render did not produce a valid recipe: ${lastError}`,
    );
  }

  const content = serializeSceneOpsDocument(resolved.doc);
  const title = request.title ?? resolved.summary.title;
  const summary: DemoSummary = {
    ...resolved.summary,
    title,
  };

  setAccumulatedSceneOps(roomName, "live", resolved.doc);
  setLastSkillId(roomName, resolved.skillId ?? null);
  setDemoSummary(roomName, summary);

  logger().info(
    {
      title,
      contentLength: content.length,
      skillId: resolved.skillId,
      ops: resolved.doc.ops.length,
    },
    "Recipe resolved; publishing scene_ops to client",
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
    skillId: resolved.skillId,
  };
}
