import {
  APIConnectionError,
  APIStatusError,
  FunctionCall,
  LLM,
  LLMStream,
  DEFAULT_API_CONNECT_OPTIONS,
  type APIConnectOptions,
  type ChatContext,
  type ToolContext,
  llm,
} from "@livekit/agents";
import { APICallError, streamText } from "ai";
import type { Room } from "@livekit/rtc-node";
import {
  buildAiToolSet,
  convertChatContextToModelMessages,
  getLanguageModel,
  resolveLlmModel,
  resolveLlmProvider,
} from "../lib/ai/index.js";
import { resolveDomain } from "../lib/domain/index.js";
import { getCanvasState } from "./session.js";
import { TextStreamPublisher } from "./textStreamPublisher.js";

export function getCanvasSystemPrompt(): string {
  return resolveDomain().systemPrompt;
}

export type AgentLLMOptions = {
  model?: string;
  roomName: string;
  room?: Room;
};

export class AgentLLM extends LLM {
  private _model: string;
  private _provider: string;
  private roomName: string;
  private room?: Room;

  constructor(options: AgentLLMOptions) {
    super();
    this._provider = resolveLlmProvider();
    this._model = options.model ?? resolveLlmModel("chat");
    this.roomName = options.roomName;
    this.room = options.room;
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
      roomName: this.roomName,
      room: this.room,
    });
  }
}

class AgentLLMStream extends LLMStream {
  private agentLlm: AgentLLM;
  private roomName: string;
  private room?: Room;
  private messageId = "ai-sdk";

  constructor(
    agentLlm: AgentLLM,
    {
      chatCtx,
      toolCtx,
      connOptions,
      roomName,
      room,
    }: {
      chatCtx: ChatContext;
      toolCtx?: ToolContext;
      connOptions: APIConnectOptions;
      roomName: string;
      room?: Room;
    },
  ) {
    super(agentLlm, { chatCtx, toolCtx, connOptions });
    this.agentLlm = agentLlm;
    this.roomName = roomName;
    this.room = room;
  }

  protected async run(): Promise<void> {
    const canvasState = getCanvasState(this.roomName);
    const systemParts = [getCanvasSystemPrompt()];
    if (canvasState) {
      systemParts.push(
        `current_viewport_demo:\n${JSON.stringify(
          {
            title: canvasState.title,
            mode: canvasState.mode,
            content_type: canvasState.content_type,
            content: canvasState.content,
          },
          null,
          2,
        )}`,
      );
    }

    const messages = convertChatContextToModelMessages(this.chatCtx.items);
    if (messages.length === 0) {
      messages.push({ role: "user", content: "Hello" });
    }

    const tools = this.toolCtx ? buildAiToolSet(this.toolCtx) : undefined;
    const textPublisher = this.room ? new TextStreamPublisher(this.room) : null;

    try {
      const result = streamText({
        model: getLanguageModel("chat", this.agentLlm.model),
        system: systemParts.join("\n\n"),
        messages,
        tools,
        abortSignal: this.abortController.signal,
        maxOutputTokens: 4096,
      });

      for await (const part of result.fullStream) {
        if (this.abortController.signal.aborted) break;

        if (part.type === "text-delta") {
          textPublisher?.append(part.text, this.messageId);
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

        if (part.type === "finish") {
          this.queue.put({
            id: "ai-sdk",
            usage: {
              completionTokens: part.totalUsage.outputTokens ?? 0,
              promptTokens: part.totalUsage.inputTokens ?? 0,
              promptCachedTokens: part.totalUsage.cachedInputTokens ?? 0,
              totalTokens: part.totalUsage.totalTokens ?? 0,
            },
          });
        }
      }

      await textPublisher?.flush(true);
    } catch (error) {
      await textPublisher?.flush(true);
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

export function createAgentLLM(roomName: string, room?: Room): AgentLLM {
  return new AgentLLM({ roomName, room });
}

/** @deprecated Use createAgentLLM */
export const createAnthropicLLM = createAgentLLM;
