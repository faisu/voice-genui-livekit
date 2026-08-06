import {
  APIConnectionError,
  APIStatusError,
  FunctionCall,
  LLM,
  LLMStream,
  DEFAULT_API_CONNECT_OPTIONS,
  log,
  type APIConnectOptions,
  type ChatContext,
  type ToolContext,
  type llm,
} from "@livekit/agents";
import { APICallError, streamText, type ToolChoice } from "ai";
import {
  buildAiToolSet,
  convertChatContextToModelMessages,
  getLanguageModel,
  resolveLlmModel,
  resolveLlmProvider,
} from "../lib/ai/index.js";

/**
 * Voice-agent LLM via the Vercel AI SDK (Qwen / Anthropic / OpenAI / Google / Kimi).
 * Bypasses LiveKit Inference gateway credits. Canvas rendering stays on the
 * same provider keys via `canvasRenderWorker.ts`.
 */
export class AgentLLM extends LLM {
  private _model: string;
  private _provider: string;

  constructor(model?: string) {
    super();
    this._provider = resolveLlmProvider();
    this._model = model ?? resolveLlmModel("chat");
  }

  label(): string {
    return `ai-sdk:${this._provider}`;
  }

  get model(): string {
    return this._model;
  }

  get provider(): string {
    return this._provider;
  }

  chat(options: {
    chatCtx: ChatContext;
    toolCtx?: ToolContext;
    connOptions?: APIConnectOptions;
    parallelToolCalls?: boolean;
    toolChoice?: llm.ToolChoice;
    extraKwargs?: Record<string, unknown>;
  }): LLMStream {
    return new AgentLLMStream(this, {
      chatCtx: options.chatCtx,
      toolCtx: options.toolCtx,
      connOptions: options.connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
      toolChoice: options.toolChoice,
    });
  }
}

function toAiToolChoice(
  toolChoice: llm.ToolChoice | undefined,
): ToolChoice | undefined {
  if (!toolChoice) return undefined;
  if (
    toolChoice === "auto" ||
    toolChoice === "none" ||
    toolChoice === "required"
  ) {
    return toolChoice;
  }
  if (
    typeof toolChoice === "object" &&
    toolChoice.type === "function" &&
    toolChoice.function?.name
  ) {
    return { type: "tool", toolName: toolChoice.function.name };
  }
  return undefined;
}

class AgentLLMStream extends LLMStream {
  private agentLlm: AgentLLM;
  private messageId = "ai-sdk";
  private toolChoice?: llm.ToolChoice;

  constructor(
    agentLlm: AgentLLM,
    {
      chatCtx,
      toolCtx,
      connOptions,
      toolChoice,
    }: {
      chatCtx: ChatContext;
      toolCtx?: ToolContext;
      connOptions: APIConnectOptions;
      toolChoice?: llm.ToolChoice;
    },
  ) {
    super(agentLlm, { chatCtx, toolCtx, connOptions });
    this.agentLlm = agentLlm;
    this.toolChoice = toolChoice;
  }

  protected async run(): Promise<void> {
    const allMessages = convertChatContextToModelMessages(this.chatCtx.items);

    // AI SDK strips system roles from `messages` unless allowSystemInMessages.
    // LiveKit puts agent + turn instructions in system messages — pull them out.
    const systemParts: string[] = [];
    const messages = allMessages.filter((message) => {
      if (message.role !== "system") return true;
      if (typeof message.content === "string" && message.content.trim()) {
        systemParts.push(message.content);
      }
      return false;
    });

    if (messages.length === 0) {
      messages.push({ role: "user", content: "Hello" });
    } else {
      // Anthropic rejects assistant prefill: history must end with a user (or tool) turn.
      // Filler speech during long tools can leave a trailing assistant message.
      // convertChatContextToModelMessages already synthesizes missing tool results.
      const last = messages[messages.length - 1]!;
      if (last.role === "assistant") {
        messages.push({ role: "user", content: "Please continue." });
      }
    }

    const tools = this.toolCtx ? buildAiToolSet(this.toolCtx) : undefined;

    try {
      const result = streamText({
        model: getLanguageModel("chat", this.agentLlm.model),
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages,
        tools,
        toolChoice: toAiToolChoice(this.toolChoice),
        abortSignal: this.abortController.signal,
        maxOutputTokens: 4096,
      });

      for await (const part of result.fullStream) {
        if (this.abortController.signal.aborted) break;

        if (part.type === "text-delta") {
          this.queue.put({
            id: this.messageId,
            delta: {
              role: "assistant",
              content: part.text,
            },
          });
        }

        if (part.type === "tool-call") {
          this.queue.put({
            id: this.messageId,
            delta: {
              role: "assistant",
              toolCalls: [
                FunctionCall.create({
                  callId: part.toolCallId,
                  name: part.toolName,
                  args: JSON.stringify(part.input ?? {}),
                }),
              ],
            },
          });
        }

        if (part.type === "error") {
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        }

        if (part.type === "finish") {
          const usage = part.totalUsage;
          const cached =
            usage.inputTokenDetails?.cacheReadTokens ??
            ("cachedInputTokens" in usage
              ? Number(
                  (usage as { cachedInputTokens?: number }).cachedInputTokens ??
                    0,
                )
              : 0);
          this.queue.put({
            id: "ai-sdk",
            usage: {
              completionTokens: usage.outputTokens ?? 0,
              promptTokens: usage.inputTokens ?? 0,
              promptCachedTokens: cached,
              totalTokens:
                (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            },
          });
        }
      }
    } catch (error) {
      if (this.abortController.signal.aborted) return;

      if (error instanceof APICallError) {
        throw new APIStatusError({
          message: error.message,
          options: {
            statusCode: error.statusCode,
            retryable: error.isRetryable,
          },
        });
      }

      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      throw new APIConnectionError({
        message: error instanceof Error ? error.message : String(error),
        options: { retryable: false },
      });
    }
  }
}

export function createAgentLLM(): AgentLLM {
  const provider = resolveLlmProvider();
  const model = resolveLlmModel("chat");
  log().info({ provider, model }, "Using AI SDK voice LLM");
  return new AgentLLM(model);
}

/** @deprecated Use createAgentLLM */
export const createAnthropicLLM = createAgentLLM;
