import { llm, ToolFlag } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import { resolveDomain } from "../../lib/domain/index.js";
import { buildStreamingPartialJson } from "../../lib/partialJson.js";
import { runCanvasRenderJob } from "../canvasRenderWorker.js";
import {
  publishToolCallDelta,
  publishToolCallError,
} from "./renderCanvas.js";

export const renderCanvasRequestSchema = z.object({
  mode: z
    .enum(["replace", "patch"])
    .describe(
      "replace = new or rebuilt illustration; patch = improve/tweak the current lab (still regenerates a full scene).",
    ),
  content_type: z
    .literal("scene_ops")
    .optional()
    .describe("Usually omit. Artifacts are always Three.js scene_ops."),
  visual_brief: z.string().min(1),
  title: z.string().optional(),
});

export type RenderCanvasRequest = z.infer<typeof renderCanvasRequestSchema> & {
  content_type?: "scene_ops";
  visual_brief?: string;
};

export function createRenderCanvasTool(room: Room, roomName: string) {
  const domain = resolveDomain();

  const parameters = renderCanvasRequestSchema.extend({
    visual_brief: z
      .string()
      .min(1)
      .describe(domain.visualBriefDescription),
  });

  return llm.tool({
    description: domain.renderCanvasToolDescription,
    parameters,
    flags: ToolFlag.CANCELLABLE,
    onDuplicate: "reject",
    execute: async (input, { ctx, abortSignal }) => {
      if (!input.visual_brief?.trim()) {
        return JSON.stringify({
          status: "error",
          message:
            "Provide visual_brief describing the interactive Three.js lab demo to build.",
        });
      }

      await publishToolCallDelta(
        room,
        buildStreamingPartialJson(
          {
            mode: input.mode,
            content_type: "scene_ops",
            title:
              input.title ??
              `Building ${domain.subject.toLowerCase()} demo…`,
          },
          "",
        ),
      );

      try {
        const result = await runCanvasRenderJob({
          room,
          roomName,
          request: {
            ...input,
            content_type: "scene_ops",
            visual_brief: input.visual_brief!,
          },
          abortSignal,
        });

        return JSON.stringify({
          status: "complete",
          job_id: ctx.functionCall.callId,
          title: result.title ?? domain.demoDefaultTitle,
          content_type: result.content_type,
          content_length: result.content_length,
          summary: result.summary,
          message:
            `The demo "${result.summary.title}" is now live. ` +
            `Speak 1–2 short sentences using ONLY summary (elements, params, observe). ` +
            `Cue: ${result.summary.observe} ` +
            `Optionally invite one control from summary.controls. Do not lecture.`,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        try {
          await publishToolCallError(room, {
            title: input.title,
            message,
          });
        } catch {
          // Client may stay in Building if this fails; still return the tool error.
        }
        return JSON.stringify({
          status: "error",
          job_id: ctx.functionCall.callId,
          message:
            `Could not build a valid demo: ${message}. ` +
            "Apologize briefly and optionally retry render_canvas with a simpler visual_brief.",
        });
      }
    },
  });
}
