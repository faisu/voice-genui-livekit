import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type LlmProvider = "anthropic" | "openai" | "google";

export type LlmModelKind = "chat" | "render";

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openai: "gpt-4.1",
  google: "gemini-2.5-flash",
};

export function resolveLlmProvider(): LlmProvider {
  const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (configured === "anthropic" || configured === "openai" || configured === "google") {
    return configured;
  }

  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return "openai";
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
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

export function getLanguageModel(
  kind: LlmModelKind = "chat",
  modelId?: string,
): LanguageModel {
  const provider = resolveLlmProvider();
  const resolvedModelId = modelId ?? resolveLlmModel(kind);

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(resolvedModelId);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      })(resolvedModelId);
    case "anthropic":
    default:
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(resolvedModelId);
  }
}

export function listSupportedProviders(): LlmProvider[] {
  return ["anthropic", "openai", "google"];
}
