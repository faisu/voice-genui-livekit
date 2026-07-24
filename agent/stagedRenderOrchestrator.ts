import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import {
  prepareCanvasContent,
} from "../lib/sanitize.js";
import {
  mergeSceneOps,
  serializeSceneOpsDocument,
  tryParseSceneOpsDocument,
  type SceneOpsDocument,
} from "../lib/sceneOps.js";
import type { RenderCanvasInput } from "../lib/types.js";
import { runCanvasRenderJob } from "./canvasRenderWorker.js";
import {
  clearStagedLesson,
  setAccumulatedSceneOps,
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
  content_type: "scene_ops" | "threejs";
  content_length: number;
};

export type StageNarrateHook = (args: {
  stage: RenderStagePlan;
  stageIndex: number;
  totalStages: number;
  timedOut: boolean;
}) => Promise<void>;

/**
 * Sequentially generate and publish scene stages for early first paint,
 * waiting for client stage_ready (with timeout) between stages.
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
  setAccumulatedSceneOps(roomName, lessonId, null);

  let accumulated: SceneOpsDocument | null = null;
  let lastContentLength = 0;
  let usedContentType: "scene_ops" | "threejs" = "scene_ops";
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
          lesson_id: lessonId,
          stage_id: stage.id,
          stage_index: i,
          total_stages: total,
        },
        "",
      ),
    );

    let stageDoc: SceneOpsDocument | null = null;
    let stageContentType: "scene_ops" | "threejs" = "scene_ops";
    let stageContent = "";

    try {
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
            priorOps: accumulated,
          }),
          title,
          lesson_id: lessonId,
          stage_id: stage.id,
          stage_index: i,
          total_stages: total,
        },
        abortSignal,
        publishComplete: false,
        preferSceneOps: true,
        maxOutputTokens: 2200,
      });

      stageContent = result.content;
      stageContentType = result.content_type;
      const parsed = tryParseSceneOpsDocument(result.content);
      if (parsed) {
        stageDoc = parsed;
      } else if (result.content_type === "scene_ops") {
        throw new Error("Invalid scene_ops from render worker");
      }
    } catch (error) {
      logger().warn(
        { error, stageId: stage.id },
        "scene_ops stage failed; retrying as threejs fallback",
      );

      const fallback = await runCanvasRenderJob({
        room,
        roomName,
        request: {
          mode: "replace",
          content_type: "threejs",
          visual_brief: [
            `FALLBACK full Three.js scene for stage "${stage.id}" of "${title}".`,
            stage.brief,
            "Include everything taught so far in one self-contained scene.",
          ].join("\n\n"),
          title,
          lesson_id: lessonId,
          stage_id: stage.id,
          stage_index: i,
          total_stages: total,
        },
        abortSignal,
        publishComplete: false,
        preferSceneOps: false,
        maxOutputTokens: 8192,
      });

      stageContent = fallback.content;
      stageContentType = "threejs";
      usedContentType = "threejs";
      accumulated = null;
    }

    if (stageDoc) {
      accumulated = mergeSceneOps(accumulated, stageDoc);
      setAccumulatedSceneOps(roomName, lessonId, accumulated);
      stageContent = serializeSceneOpsDocument(stageDoc);
      stageContentType = "scene_ops";
      usedContentType = "scene_ops";
    }

    const prepared = prepareCanvasContent(stageContent, stageContentType);
    lastContentLength = prepared.length;

    const input: RenderCanvasInput = {
      mode: isFirst ? "replace" : "patch",
      content_type: stageContentType,
      content: prepared,
      title,
      lesson_id: lessonId,
      stage_id: stage.id,
      stage_index: i,
      total_stages: total,
    };

    await publishToolCallComplete(room, roomName, input);

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

    // threejs fallback replaces the whole viewport — stop further stages.
    if (stageContentType === "threejs") {
      logger().info(
        { stageId: stage.id },
        "Stopping staged loop after threejs fallback",
      );
      break;
    }
  }

  return {
    title,
    lesson_id: lessonId,
    stages_completed: stagesCompleted,
    content_type: usedContentType,
    content_length: lastContentLength,
  };
}

function buildStageBrief(options: {
  title: string;
  stage: RenderStagePlan;
  stageIndex: number;
  totalStages: number;
  isFinal: boolean;
  priorOps: SceneOpsDocument | null;
}): string {
  const parts = [
    `Lesson title: ${options.title}`,
    `Stage ${options.stageIndex + 1} of ${options.totalStages} (id: ${options.stage.id}).`,
    `Pedagogical goal for this stage: ${options.stage.brief}`,
    `Spoken cue the teacher will use after this stage appears: "${options.stage.narrate}"`,
  ];

  if (options.stageIndex === 0) {
    parts.push(
      "This is STAGE 1: emit ensureLab + the core object(s) + focusCamera (duration 0 or ≤1). Keep it minimal — no vectors/motion yet unless essential to the core object.",
    );
  } else {
    parts.push(
      "This is an ADDITIVE stage: emit ONLY new ops. Do not repeat ensureLab or recreate existing objects.",
    );
    if (options.priorOps) {
      parts.push(
        `Existing ops already on screen (do not duplicate):\n${serializeSceneOpsDocument(options.priorOps)}`,
      );
    }
  }

  if (options.isFinal) {
    parts.push(
      "Final stage: add remaining teaching elements (motion, trails, overlay with controls). Optional focusCamera duration ≤4.",
    );
  } else {
    parts.push("Not the final stage — leave room for later additions.");
  }

  return parts.join("\n\n");
}
