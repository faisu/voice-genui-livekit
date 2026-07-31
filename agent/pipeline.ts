import {
  inference,
  voice,
  type ChatContext,
  type ChatMessage,
  type JobProcess,
} from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { createAgentLLM } from "./llm.js";
import {
  getCanvasState,
  getDemoSummary,
  getLastSkillId,
  getLearnerProfile,
} from "./session.js";
import {
  createRenderCanvasTool,
  createSaveLearnerProfileTool,
} from "./tools/index.js";
import { createAgentSTT } from "./stt.js";
import { createAgentTTS } from "./tts.js";
import { TextStreamPublisher } from "./textStreamPublisher.js";
import { resolveDomain } from "../lib/domain/index.js";
import { formatLearnerProfileForAgent } from "../lib/learnerProfile.js";

export type AgentProcessUserData = Record<string, never>;

export async function prewarmAgent(_proc: JobProcess<AgentProcessUserData>): Promise<void> {
  // VAD / turn detection load via LiveKit Inference; no plugin prewarm required.
}

export function createVoiceSession() {
  return new voice.AgentSession({
    stt: createAgentSTT(),
    llm: createAgentLLM(),
    tts: createAgentTTS(),
    turnHandling: {
      turnDetection: new inference.TurnDetector(),
      preemptiveGeneration: { enabled: true },
    },
    vad: new inference.VAD({ model: "silero" }),
  });
}

class CanvasAgent extends voice.Agent {
  private readonly baseInstructions: string;
  private readonly roomName: string;
  private readonly textPublisher: TextStreamPublisher;

  constructor(room: Room, roomName: string) {
    const domain = resolveDomain();
    // Full teaching system prompt so GenUI tool use stays rich.
    const baseInstructions = domain.systemPrompt;

    let refreshAfterProfileSave: () => Promise<void> = async () => {};

    super({
      instructions: baseInstructions,
      toolHandling: {
        asyncOptions: {
          replyAtTailTemplate: domain.renderCompleteTemplate,
          replyMaybeCoveredTemplate: domain.renderMaybeCoveredTemplate,
        },
      },
      tools: {
        render_canvas: createRenderCanvasTool(room, roomName),
        save_learner_profile: createSaveLearnerProfileTool(
          room,
          roomName,
          () => refreshAfterProfileSave(),
        ),
      },
    });

    this.baseInstructions = baseInstructions;
    this.roomName = roomName;
    this.textPublisher = new TextStreamPublisher(room);
    refreshAfterProfileSave = () => this.syncCanvasInstructions();
  }

  async onUserTurnCompleted(
    _chatCtx: ChatContext,
    _newMessage: ChatMessage,
  ): Promise<void> {
    await this.syncCanvasInstructions();
  }

  /** Re-apply base + profile + canvas context (e.g. after student_profile arrives). */
  async refreshInstructions(): Promise<void> {
    await this.syncCanvasInstructions();
  }

  private async syncCanvasInstructions(): Promise<void> {
    const parts = [this.baseInstructions];

    const profile = getLearnerProfile(this.roomName);
    if (profile) {
      parts.push(formatLearnerProfileForAgent(profile));
    }

    const canvasState = getCanvasState(this.roomName);
    const summary = getDemoSummary(this.roomName);
    if (summary || canvasState) {
      parts.push(
        `current_viewport_demo:\n${JSON.stringify(
          {
            title: summary?.title ?? canvasState?.title,
            mode: canvasState?.mode,
            content_type: canvasState?.content_type ?? "scene_ops",
            skillId: summary?.skillId ?? getLastSkillId(this.roomName),
            summary: summary
              ? {
                  observe: summary.observe,
                  elements: summary.elements,
                  params: summary.params,
                  motions: summary.motions,
                  controls: summary.controls,
                }
              : undefined,
          },
          null,
          2,
        )}`,
      );
    }

    await this.updateInstructions(parts.join("\n\n"));
  }

  async transcriptionNode(
    text: Parameters<voice.Agent["transcriptionNode"]>[0],
    modelSettings: Parameters<voice.Agent["transcriptionNode"]>[1],
  ) {
    const stream = await voice.Agent.default.transcriptionNode(
      this,
      text,
      modelSettings,
    );
    if (!stream) return null;

    const [forAgent, forCaptions] = stream.tee();
    const publisher = this.textPublisher;
    const streamId = `lk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    void (async () => {
      const reader = forCaptions.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await publisher.flush(true);
            break;
          }
          const delta =
            typeof value === "string"
              ? value
              : typeof value === "object" &&
                  value !== null &&
                  "text" in value &&
                  typeof (value as { text: unknown }).text === "string"
                ? (value as { text: string }).text
                : String(value ?? "");
          publisher.append(delta, streamId);
        }
      } catch {
        await publisher.flush(true);
      }
    })();

    return forAgent;
  }
}

export function createCanvasAgent(room: Room, roomName: string) {
  return new CanvasAgent(room, roomName);
}
