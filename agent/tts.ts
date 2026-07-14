import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import { log } from "@livekit/agents";

export type TtsProvider = "deepgram" | "elevenlabs";

export function resolveTtsProvider(): TtsProvider {
  const configured = process.env.TTS_PROVIDER?.toLowerCase();
  if (configured === "elevenlabs" || configured === "deepgram") {
    return configured;
  }
  // Default to Deepgram — shares the STT key and avoids ElevenLabs quota issues.
  return "deepgram";
}

export function createAgentTTS() {
  const provider = resolveTtsProvider();
  const logger = log();

  if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVEN_API_KEY ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "TTS_PROVIDER=elevenlabs but ELEVEN_API_KEY is missing. Set the key or use TTS_PROVIDER=deepgram.",
      );
    }

    logger.info(
      { provider: "elevenlabs", model: "eleven_turbo_v2_5" },
      "Using ElevenLabs TTS (check quota if voice is silent)",
    );

    return new elevenlabs.TTS({
      apiKey,
      model: "eleven_turbo_v2_5",
    });
  }

  const model = process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-asteria-en";
  logger.info({ provider: "deepgram", model }, "Using Deepgram Aura TTS");

  return new deepgram.TTS({
    apiKey: process.env.DEEPGRAM_API_KEY,
    model,
  });
}
