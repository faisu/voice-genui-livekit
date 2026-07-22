import { inference, voice } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import type { JobProcess } from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { createAgentLLM } from "./llm.js";
import { createRenderCanvasTool, createRenderQuizTool } from "./tools/index.js";
import { createAgentTTS } from "./tts.js";
import { resolveDomain } from "../lib/domain/index.js";

export type AgentProcessUserData = {
  vad: silero.VAD;
};

export async function prewarmAgent(proc: JobProcess<AgentProcessUserData>): Promise<void> {
  proc.userData.vad = await silero.VAD.load();
}

export function createVoiceSession() {
  return new voice.AgentSession({
    stt: new deepgram.STT({
      apiKey: process.env.DEEPGRAM_API_KEY,
      model: "nova-3",
      language: "en",
      interimResults: true,
    }),
    tts: createAgentTTS(),
    turnHandling: {
      turnDetection: new inference.TurnDetector(),
      preemptiveGeneration: { enabled: true },
    },
    vad: new inference.VAD({ model: "silero" }),
  });
}

export function createCanvasAgent(room: Room, roomName: string) {
  const domain = resolveDomain();
  const agentLlm = createAgentLLM(roomName, room);

  return new voice.Agent({
    instructions: domain.agentInstructions,
    llm: agentLlm,
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
}
