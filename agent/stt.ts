import { inference, log } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";

/** LiveKit Inference default when Deepgram is not configured. */
const DEFAULT_LIVEKIT_STT_MODEL = "deepgram/flux-general";
const DEFAULT_DEEPGRAM_STT_MODEL = "nova-3-general";

/**
 * Prefer Deepgram plugin when DEEPGRAM_API_KEY is set (or STT_PROVIDER=deepgram).
 * Direct Deepgram avoids LiveKit Inference STT WebSocket connect failures.
 */
export function createAgentSTT() {
  const provider = (process.env.STT_PROVIDER ?? "").trim().toLowerCase();
  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  const preferDeepgram =
    provider === "deepgram" ||
    (provider !== "livekit" && provider !== "inference" && Boolean(deepgramKey));

  if (preferDeepgram) {
    if (!deepgramKey) {
      throw new Error("STT_PROVIDER=deepgram requires DEEPGRAM_API_KEY");
    }
    const model =
      process.env.DEEPGRAM_STT_MODEL?.trim() || DEFAULT_DEEPGRAM_STT_MODEL;
    log().info({ provider: "deepgram", model }, "Using Deepgram STT");
    return new deepgram.STT({
      apiKey: deepgramKey,
      model,
      language: "en",
      interimResults: true,
      punctuate: true,
      smartFormat: true,
    });
  }

  const model =
    process.env.LIVEKIT_STT_MODEL?.trim() || DEFAULT_LIVEKIT_STT_MODEL;
  log().info(
    { provider: "livekit-inference", model },
    "Using LiveKit Inference STT",
  );
  return new inference.STT({
    model,
    language: "en",
  });
}
