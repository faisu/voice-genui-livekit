import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type LlmProvider = "qwen" | "kimi" | "anthropic" | "openai" | "google";

export type LlmModelKind = "chat" | "render";

/** Official Moonshot / Kimi OpenAI-compatible endpoint. */
export const KIMI_BASE_URL = "https://api.moonshot.ai/v1";

/** DashScope international OpenAI-compatible endpoint (Qwen). */
export const QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  qwen: "qwen3.8-max",
  kimi: "kimi-k3",
  anthropic: "claude-sonnet-5",
  openai: "gpt-4.1",
  google: "gemini-2.5-flash",
};

export function resolveLlmProvider(): LlmProvider {
  const configured = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (
    configured === "qwen" ||
    configured === "dashscope" ||
    configured === "kimi" ||
    configured === "moonshot" ||
    configured === "anthropic" ||
    configured === "openai" ||
    configured === "google"
  ) {
    if (configured === "moonshot") return "kimi";
    if (configured === "dashscope") return "qwen";
    return configured;
  }

  if (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY) {
    return "qwen";
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

  return "qwen";
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

function resolveQwenApiKey(): string | undefined {
  return (
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.QWEN_API_KEY?.trim() ||
    undefined
  );
}

function resolveQwenBaseUrl(): string {
  return (
    process.env.QWEN_BASE_URL?.trim() ||
    process.env.DASHSCOPE_BASE_URL?.trim() ||
    QWEN_BASE_URL
  );
}

/**
 * DashScope Qwen enables thinking by default. In thinking mode, tool_choice
 * cannot be "required" or a specific function — canvas/voice tool calls 400.
 * Inject enable_thinking:false on chat/completions requests.
 */
function createQwenFetch(): typeof fetch {
  return async (input, init) => {
    let nextInit = init;
    const body = init?.body;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (parsed.enable_thinking === undefined) {
          parsed.enable_thinking = false;
        }
        nextInit = { ...init, body: JSON.stringify(parsed) };
      } catch {
        // leave body unchanged
      }
    }
    return fetch(input, nextInit);
  };
}

export function getLanguageModel(
  kind: LlmModelKind = "chat",
  modelId?: string,
): LanguageModel {
  const provider = resolveLlmProvider();
  const resolvedModelId = modelId ?? resolveLlmModel(kind);

  switch (provider) {
    case "qwen": {
      // DashScope is OpenAI-compatible for Chat Completions.
      const qwen = createOpenAI({
        apiKey: resolveQwenApiKey(),
        baseURL: resolveQwenBaseUrl(),
        name: "qwen",
        fetch: createQwenFetch(),
      });
      return qwen.chat(resolvedModelId);
    }
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
    default:
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(resolvedModelId);
  }
}

/** Provider-specific options that keep canvas jobs fast. */
export function getRenderProviderOptions():
  | { anthropic: { effort: "low" } }
  | { kimi: { reasoningEffort: "low" } }
  | undefined {
  const provider = resolveLlmProvider();
  if (provider === "anthropic") {
    // Sonnet 5 adaptive thinking is on by default; low effort keeps staged builds snappy.
    return { anthropic: { effort: "low" } };
  }
  if (provider === "kimi") {
    return { kimi: { reasoningEffort: "low" } };
  }
  // Qwen: thinking is disabled via createQwenFetch (enable_thinking:false).
  return undefined;
}

export function listSupportedProviders(): LlmProvider[] {
  return ["qwen", "anthropic", "kimi", "openai", "google"];
}
