import {
  inference,
  voice,
  type ChatContext,
  type ChatMessage,
  type JobProcess,
} from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { createAgentLLM } from "./llm.js";
import { getCanvasState } from "./session.js";
import { createRenderCanvasTool, createRenderQuizTool } from "./tools/index.js";
import { createAgentTTS } from "./tts.js";
import { TextStreamPublisher } from "./textStreamPublisher.js";
import { resolveDomain } from "../lib/domain/index.js";

export type AgentProcessUserData = Record<string, never>;

/** LiveKit Inference defaults from https://livekit.com/products/inference */
const DEFAULT_STT_MODEL = "deepgram/flux-general";

export async function prewarmAgent(_proc: JobProcess<AgentProcessUserData>): Promise<void> {
  // VAD / turn detection load via LiveKit Inference; no plugin prewarm required.
}

export function createVoiceSession() {
  const sttModel = process.env.LIVEKIT_STT_MODEL?.trim() || DEFAULT_STT_MODEL;

  return new voice.AgentSession({
    stt: new inference.STT({
      model: sttModel,
      language: "en",
    }),
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
    // Prefer the full teaching system prompt so GenUI tool use stays rich
    // after moving the voice LLM to LiveKit Inference.
    const baseInstructions = domain.systemPrompt;

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
        render_quiz: createRenderQuizTool(room, roomName),
      },
    });

    this.baseInstructions = baseInstructions;
    this.roomName = roomName;
    this.textPublisher = new TextStreamPublisher(room);
  }

  async onUserTurnCompleted(
    _chatCtx: ChatContext,
    _newMessage: ChatMessage,
  ): Promise<void> {
    await this.syncCanvasInstructions();
  }

  private async syncCanvasInstructions(): Promise<void> {
    const canvasState = getCanvasState(this.roomName);
    if (!canvasState) {
      await this.updateInstructions(this.baseInstructions);
      return;
    }

    await this.updateInstructions(
      [
        this.baseInstructions,
        `current_viewport_demo:\n${JSON.stringify(
          {
            title: canvasState.title,
            mode: canvasState.mode,
            content_type: canvasState.content_type,
            content: canvasState.content,
          },
          null,
          2,
        )}`,
      ].join("\n\n"),
    );
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
    const streamId = `lk-${Date.now()}`;

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
