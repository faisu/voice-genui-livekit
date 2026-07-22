import { inference, log } from "@livekit/agents";

/** LiveKit Inference defaults from https://livekit.com/products/inference */
const DEFAULT_TTS_MODEL = "cartesia/sonic-3";
const DEFAULT_TTS_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";

export function createAgentTTS() {
  const model = process.env.LIVEKIT_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
  const voice = process.env.LIVEKIT_TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;
  log().info({ provider: "livekit-inference", model, voice }, "Using LiveKit Inference TTS");

  return new inference.TTS({
    model,
    voice,
  });
}
