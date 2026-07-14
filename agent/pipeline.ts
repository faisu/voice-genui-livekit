import { dedent, inference, voice } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import type { JobProcess } from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { createAnthropicLLM } from "./llm.js";
import { createRenderCanvasTool, createRenderQuizTool } from "./tools/index.js";
import { createAgentTTS } from "./tts.js";

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
  const anthropic = createAnthropicLLM(roomName, room);

  return new voice.Agent({
    instructions: dedent`
      You are a physics teacher. The student's entire viewport is your Three.js canvas.
      Use render_canvas to replace or patch the full-view demo. Keep teaching while
      visuals build asynchronously. When a render completes, give one concrete
      observation cue and invite the student to orbit and use the controls.
      After teaching a concept, use render_quiz to check the student's understanding
      with a short multiple-choice quiz, then respond to their results with feedback.
    `,
    llm: anthropic,
    toolHandling: {
      asyncOptions: {
        replyAtTailTemplate:
          "A full-viewport physics visualization just finished rendering (call_ids: {callIds}). " +
          "In 1–2 short spoken sentences: name what now fills the view, give ONE concrete thing to watch, " +
          "and invite the student to drag to orbit and try the controls. Do not repeat the whole lesson.",
        replyMaybeCoveredTemplate:
          "A full-viewport physics visualization just finished rendering (call_ids: {callIds}). " +
          "Filler phrases while waiting do NOT count. Always acknowledge the finished demo now: " +
          "one observation cue plus an invite to explore. Keep it brief.",
      },
    },
    tools: {
      render_canvas: createRenderCanvasTool(room, roomName),
      render_quiz: createRenderQuizTool(room, roomName),
    },
  });
}
