import { inference, log } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";

/** LiveKit Inference defaults from https://livekit.com/products/inference */
const DEFAULT_LIVEKIT_TTS_MODEL = "cartesia/sonic-3";
const DEFAULT_LIVEKIT_TTS_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
const DEFAULT_DEEPGRAM_TTS_MODEL = "aura-2-asteria-en";

/**
 * Prefer Deepgram when TTS_PROVIDER=deepgram or DEEPGRAM_API_KEY is set
 * without an explicit LiveKit TTS preference.
 */
export function createAgentTTS() {
  const provider = (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  const preferDeepgram =
    provider === "deepgram" ||
    (provider !== "livekit" &&
      provider !== "inference" &&
      provider !== "cartesia" &&
      Boolean(deepgramKey) &&
      !process.env.LIVEKIT_TTS_MODEL?.trim());

  if (preferDeepgram) {
    if (!deepgramKey) {
      throw new Error("TTS_PROVIDER=deepgram requires DEEPGRAM_API_KEY");
    }
    const model =
      process.env.DEEPGRAM_TTS_MODEL?.trim() || DEFAULT_DEEPGRAM_TTS_MODEL;
    log().info({ provider: "deepgram", model }, "Using Deepgram TTS");
    return new deepgram.TTS({
      apiKey: deepgramKey,
      model,
    });
  }

  const model =
    process.env.LIVEKIT_TTS_MODEL?.trim() || DEFAULT_LIVEKIT_TTS_MODEL;
  const voice =
    process.env.LIVEKIT_TTS_VOICE?.trim() || DEFAULT_LIVEKIT_TTS_VOICE;
  log().info(
    { provider: "livekit-inference", model, voice },
    "Using LiveKit Inference TTS",
  );

  return new inference.TTS({
    model,
    voice,
  });
}
