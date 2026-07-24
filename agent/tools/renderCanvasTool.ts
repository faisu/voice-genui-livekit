import { llm, ToolFlag } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import { resolveDomain } from "../../lib/domain/index.js";
import { buildStreamingPartialJson } from "../../lib/partialJson.js";
import { runCanvasRenderJob } from "../canvasRenderWorker.js";
import { runStagedCanvasRender } from "../stagedRenderOrchestrator.js";
import { publishToolCallDelta } from "./renderCanvas.js";

const stageSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Stable stage id, e.g. setup, forces, motion"),
  narrate: z
    .string()
    .min(1)
    .describe(
      "One short spoken sentence to say AFTER this stage appears on screen. Only mention what is visible.",
    ),
  brief: z
    .string()
    .min(1)
    .describe(
      "What to add visually in this stage only (objects, vectors, motion). Keep minimal.",
    ),
});

export const renderCanvasRequestSchema = z.object({
  mode: z.enum(["replace", "patch"]),
  content_type: z
    .enum(["threejs", "scene_ops"])
    .optional()
    .describe(
      "Usually omit. Staged lessons use scene_ops automatically; single-shot demos use threejs.",
    ),
  visual_brief: z.string().optional(),
  title: z.string().optional(),
  stages: z
    .array(stageSchema)
    .min(2)
    .max(4)
    .optional()
    .describe(
      "Preferred for new lessons: 2–4 progressive stages. Stage 1 = lab + core object; later stages add vectors/motion/labels. The tool builds them one-by-one with synced narration.",
    ),
});

export type RenderCanvasRequest = z.infer<typeof renderCanvasRequestSchema> & {
  /** Internal: threaded by staged orchestrator / worker. */
  lesson_id?: string;
  stage_id?: string;
  stage_index?: number;
  total_stages?: number;
  content_type?: "threejs" | "scene_ops";
  visual_brief?: string;
};

export function createRenderCanvasTool(room: Room, roomName: string) {
  const domain = resolveDomain();

  const parameters = renderCanvasRequestSchema.extend({
    visual_brief: z
      .string()
      .optional()
      .describe(
        `${domain.visualBriefDescription} Required when stages is omitted (single-shot demo).`,
      ),
  });

  return llm.tool({
    description: domain.renderCanvasToolDescription,
    parameters,
    flags: ToolFlag.CANCELLABLE,
    onDuplicate: "reject",
    execute: async (input, { ctx, abortSignal }) => {
      const stages = input.stages;
      const isStaged = Array.isArray(stages) && stages.length >= 2;

      if (!isStaged && !input.visual_brief?.trim()) {
        return JSON.stringify({
          status: "error",
          message:
            "Provide stages (2–4) for a progressive demo, or visual_brief for a single-shot demo.",
        });
      }

      await ctx.update(
        JSON.stringify({
          status: "rendering",
          job_id: ctx.functionCall.callId,
          title: input.title ?? null,
          staged: isStaged,
          stages: isStaged ? stages.length : 1,
          message: isStaged
            ? `Staged ${domain.subject.toLowerCase()} demo queued (${stages.length} stages). Narrate each stage only after it appears.`
            : `Full-viewport ${domain.subject.toLowerCase()} demo queued. Keep teaching while it builds — you will receive the finished scene shortly.`,
        }),
      );

      await publishToolCallDelta(
        room,
        buildStreamingPartialJson(
          {
            mode: input.mode,
            content_type: isStaged ? "scene_ops" : "threejs",
            title:
              input.title ??
              (isStaged
                ? `Building ${domain.subject.toLowerCase()} demo…`
                : `Building ${domain.subject.toLowerCase()} demo…`),
            lesson_id: isStaged ? ctx.functionCall.callId : undefined,
            stage_index: isStaged ? 0 : undefined,
            total_stages: isStaged ? stages.length : undefined,
          },
          "",
        ),
      );

      if (isStaged) {
        const lessonId = ctx.functionCall.callId;
        return ctx.filler(
          [
            "I'm assembling the lab step by step — watch each piece appear as I explain it.",
            "Next piece of the simulation is still coming together — stay with me.",
          ],
          { delay: 5000, maxSteps: 3, interval: 10000 },
          async () => {
            const result = await runStagedCanvasRender({
              room,
              roomName,
              lessonId,
              abortSignal,
              request: {
                mode: input.mode,
                title: input.title,
                stages: stages.map((s) => ({
                  id: s.id,
                  narrate: s.narrate,
                  brief: s.brief,
                })),
              },
              onStageReady: async ({ stage, stageIndex, totalStages }) => {
                await ctx.update(
                  JSON.stringify({
                    status: "stage_ready",
                    job_id: ctx.functionCall.callId,
                    lesson_id: lessonId,
                    stage_id: stage.id,
                    stage_index: stageIndex,
                    total_stages: totalStages,
                    message: `Stage ${stageIndex + 1}/${totalStages} is now visible. Speak this cue in ONE short sentence (do not invent extra objects): "${stage.narrate}"`,
                  }),
                );
              },
            });

            return JSON.stringify({
              status: "complete",
              job_id: ctx.functionCall.callId,
              title: result.title ?? domain.demoDefaultTitle,
              content_type: result.content_type,
              stages_completed: result.stages_completed,
              content_length: result.content_length,
              message: `The staged full-viewport demo "${result.title ?? "visualization"}" is now live through all ${result.stages_completed} stages.`,
            });
          },
        );
      }

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
            request: {
              ...input,
              content_type: "threejs",
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
            message: `The full-viewport demo "${result.title ?? "visualization"}" is now live.`,
          });
        },
      );
    },
  });
}
