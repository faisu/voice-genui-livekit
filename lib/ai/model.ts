import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type LlmProvider = "kimi" | "anthropic" | "openai" | "google";

export type LlmModelKind = "chat" | "render";

/** Official Moonshot / Kimi OpenAI-compatible endpoint. */
export const KIMI_BASE_URL = "https://api.moonshot.ai/v1";

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  kimi: "kimi-k3",
  anthropic: "claude-sonnet-5",
  openai: "gpt-4.1",
  google: "gemini-2.5-flash",
};

export function resolveLlmProvider(): LlmProvider {
  const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (
    configured === "kimi" ||
    configured === "moonshot" ||
    configured === "anthropic" ||
    configured === "openai" ||
    configured === "google"
  ) {
    return configured === "moonshot" ? "kimi" : configured;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return "anthropic";
  }
  if (process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY) {
    return "kimi";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return "google";
  }

  return "anthropic";
}

export function resolveLlmModel(kind: LlmModelKind = "chat"): string {
  if (kind === "render") {
    return (
      process.env.LLM_RENDER_MODEL?.trim() ||
      process.env.LLM_MODEL?.trim() ||
      DEFAULT_MODELS[resolveLlmProvider()]
    );
  }

  return process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[resolveLlmProvider()];
}

function resolveKimiApiKey(): string | undefined {
  return (
    process.env.MOONSHOT_API_KEY?.trim() ||
    process.env.KIMI_API_KEY?.trim() ||
    undefined
  );
}

export function getLanguageModel(
  kind: LlmModelKind = "chat",
  modelId?: string,
): LanguageModel {
  const provider = resolveLlmProvider();
  const resolvedModelId = modelId ?? resolveLlmModel(kind);

  switch (provider) {
    case "kimi": {
      // Moonshot is OpenAI-compatible for Chat Completions only — not /v1/responses.
      const kimi = createOpenAI({
        apiKey: resolveKimiApiKey(),
        baseURL: process.env.KIMI_BASE_URL?.trim() || KIMI_BASE_URL,
        name: "kimi",
      });
      return kimi.chat(resolvedModelId);
    }
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(resolvedModelId);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })(resolvedModelId);
    case "anthropic":
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(resolvedModelId);
    default: {
      const kimi = createOpenAI({
        apiKey: resolveKimiApiKey(),
        baseURL: process.env.KIMI_BASE_URL?.trim() || KIMI_BASE_URL,
        name: "kimi",
      });
      return kimi.chat(resolvedModelId);
    }
  }
}

export function listSupportedProviders(): LlmProvider[] {
  return ["kimi", "anthropic", "openai", "google"];
}
