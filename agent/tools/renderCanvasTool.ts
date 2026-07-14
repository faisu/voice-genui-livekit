import { llm, ToolFlag } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import { buildStreamingPartialJson } from "../../lib/partialJson.js";
import { runCanvasRenderJob } from "../canvasRenderWorker.js";
import { publishToolCallDelta } from "./renderCanvas.js";

export const renderCanvasRequestSchema = z.object({
  mode: z.enum(["replace", "patch"]),
  content_type: z
    .literal("threejs")
    .describe(
      "Always threejs. The demo fills the student's entire lab viewport as an interactive Three.js scene.",
    ),
  visual_brief: z
    .string()
    .describe(
      "Detailed physics lesson spec for a FULL-VIEWPORT Three.js scene: concept, objects, forces/vectors, parameters (mass, g, angle, velocity), labels, colors, camera framing, animation behavior, play/pause/reset, and what the student should observe.",
    ),
  title: z.string().optional(),
});

export type RenderCanvasRequest = z.infer<typeof renderCanvasRequestSchema>;

export function createRenderCanvasTool(room: Room, roomName: string) {
  return llm.tool({
    description:
      "Replace or patch the FULL lab viewport with an interactive Three.js physics demonstration. " +
      "Pass a rich visual_brief — never raw Three.js code. " +
      "The entire student view becomes the demo (not a floating card). " +
      "Use mode replace for a new concept; mode patch to refine the current scene. " +
      "Returns immediately while the simulation builds asynchronously.",
    parameters: renderCanvasRequestSchema,
    flags: ToolFlag.CANCELLABLE,
    onDuplicate: "reject",
    execute: async (input, { ctx, abortSignal }) => {
      await ctx.update(
        JSON.stringify({
          status: "rendering",
          job_id: ctx.functionCall.callId,
          title: input.title ?? null,
          message:
            "Full-viewport physics demo queued. Keep teaching while it builds — you will receive the finished scene shortly.",
        }),
      );

      await publishToolCallDelta(
        room,
        buildStreamingPartialJson(
          {
            mode: input.mode,
            content_type: "threejs",
            title: input.title ?? "Building physics demo…",
          },
          "",
        ),
      );

      return ctx.filler(
        [
          "I'm rebuilding the whole lab view around this concept — watch the canvas transform while I keep explaining.",
          "The full-screen simulation is still assembling — hang tight, it should fill your view any moment.",
        ],
        { delay: 7000, maxSteps: 2, interval: 12000 },
        async () => {
          const result = await runCanvasRenderJob({
            room,
            roomName,
            request: { ...input, content_type: "threejs" },
            abortSignal,
          });

          return JSON.stringify({
            status: "complete",
            job_id: ctx.functionCall.callId,
            title: result.title ?? "Physics demo",
            content_type: "threejs",
            content_length: result.content_length,
            message: `The full-viewport demo "${result.title ?? "visualization"}" is now live.`,
          });
        },
      );
    },
  });
}
