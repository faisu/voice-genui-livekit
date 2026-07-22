import { inference, log } from "@livekit/agents";

/** LiveKit Inference default from the Agents homepage (Gemma 4). */
const DEFAULT_LLM_MODEL = "google/gemma-4-31b-it";

/**
 * Voice-agent LLM via LiveKit Inference (no separate provider API key).
 * Canvas Three.js generation still uses the AI SDK in `canvasRenderWorker.ts`.
 */
export function createAgentLLM() {
  const model = process.env.LIVEKIT_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
  log().info({ provider: "livekit-inference", model }, "Using LiveKit Inference LLM");

  return new inference.LLM({
    model,
    modelOptions: {
      max_completion_tokens: 4096,
    },
  });
}

/** @deprecated Use createAgentLLM */
export const createAnthropicLLM = createAgentLLM;
