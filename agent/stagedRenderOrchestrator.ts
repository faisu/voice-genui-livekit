import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import type { RenderCanvasInput } from "../lib/types.js";
import { runCanvasRenderJob } from "./canvasRenderWorker.js";
import {
  clearStagedLesson,
  getCanvasState,
  waitForStageReady,
} from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import { buildStreamingPartialJson } from "../lib/partialJson.js";

export type RenderStagePlan = {
  id: string;
  narrate: string;
  brief: string;
};

export type StagedRenderRequest = {
  mode: "replace" | "patch";
  title?: string;
  stages: RenderStagePlan[];
};

const STAGE_READY_TIMEOUT_MS = 2500;

function logger() {
  return log();
}

export type StagedRenderResult = {
  title?: string;
  lesson_id: string;
  stages_completed: number;
  content_type: "scene_ops";
  content_length: number;
};

export type StageNarrateHook = (args: {
  stage: RenderStagePlan;
  stageIndex: number;
  totalStages: number;
  timedOut: boolean;
}) => Promise<void>;

/**
 * Sequentially generate and publish complete scene_ops artifacts per stage
 * for early first paint, waiting for client stage_ready (with timeout).
 * Unused by the active voice path; kept for future progressive lessons.
 */
export async function runStagedCanvasRender(options: {
  room: Room;
  roomName: string;
  request: StagedRenderRequest;
  lessonId: string;
  abortSignal?: AbortSignal;
  onStageReady?: StageNarrateHook;
}): Promise<StagedRenderResult> {
  const { room, roomName, request, lessonId, abortSignal, onStageReady } =
    options;
  const stages = request.stages;
  const total = stages.length;
  const title = request.title ?? "Interactive demo";

  clearStagedLesson(roomName);

  let lastContentLength = 0;
  let stagesCompleted = 0;

  for (let i = 0; i < stages.length; i++) {
    if (abortSignal?.aborted) {
      throw new Error("Canvas render cancelled");
    }

    const stage = stages[i]!;
    const isFirst = i === 0;
    const isFinal = i === stages.length - 1;

    await publishToolCallDelta(
      room,
      buildStreamingPartialJson(
        {
          mode: isFirst ? "replace" : "patch",
          content_type: "scene_ops",
          title,
        },
        "",
      ),
    );

    const result = await runCanvasRenderJob({
      room,
      roomName,
      request: {
        mode: isFirst ? "replace" : "patch",
        content_type: "scene_ops",
        visual_brief: buildStageBrief({
          title,
          stage,
          stageIndex: i,
          totalStages: total,
          isFinal,
        }),
        title,
      },
      abortSignal,
      publishComplete: false,
      maxOutputTokens: 3200,
    });

    const input: RenderCanvasInput = {
      mode: isFirst ? "replace" : "patch",
      content_type: "scene_ops",
      content: result.content,
      title,
    };

    await publishToolCallComplete(room, roomName, input);

    const published = getCanvasState(roomName)?.content ?? result.content;
    lastContentLength = published.length;

    const ready = await waitForStageReady(
      roomName,
      lessonId,
      stage.id,
      STAGE_READY_TIMEOUT_MS,
    );

    if (onStageReady) {
      await onStageReady({
        stage,
        stageIndex: i,
        totalStages: total,
        timedOut: ready.timedOut,
      });
    }

    stagesCompleted += 1;
  }

  logger().info(
    { lessonId, stagesCompleted, contentLength: lastContentLength },
    "Staged Recipe Skill or scene_ops artifact render complete",
  );

  return {
    title,
    lesson_id: lessonId,
    stages_completed: stagesCompleted,
    content_type: "scene_ops",
    content_length: lastContentLength,
  };
}

function buildStageBrief(options: {
  title: string;
  stage: RenderStagePlan;
  stageIndex: number;
  totalStages: number;
  isFinal: boolean;
}): string {
  const parts = [
    `Lesson title: ${options.title}`,
    `Stage ${options.stageIndex + 1} of ${options.totalStages} (id: ${options.stage.id}).`,
    `Pedagogical goal for this stage: ${options.stage.brief}`,
    `Spoken cue the teacher will use after this stage appears: "${options.stage.narrate}"`,
    "Emit a COMPLETE Recipe Skill or scene_ops for this stage (no HTML/SVG).",
  ];

  if (options.stageIndex === 0) {
    parts.push(
      "This is STAGE 1: show the core diagram only (title + main object(s) + essential labels). Keep it minimal.",
    );
  } else {
    parts.push(
      "This is a PROGRESSIVE stage: start from the prior Recipe Skill or scene_ops (provided in context when available) and ADD the new teaching elements. Emit the FULL updated Recipe Skill or scene_ops.",
    );
  }

  if (options.isFinal) {
    parts.push(
      "Final stage: add remaining teaching elements (motion, readouts, play/pause/reset + sliders).",
    );
  } else {
    parts.push("Not the final stage — leave room for later visual additions.");
  }

  return parts.join("\n\n");
}
