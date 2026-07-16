import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  ChatMessage as LKChatMessage,
  DEFAULT_API_CONNECT_OPTIONS,
  FunctionCall,
  LLM,
  LLMStream,
  type APIConnectOptions,
  type ChatContext,
  type ChatItem,
  type ToolContext,
  llm,
  log,
  sortedToolEntries,
  toJsonSchema,
} from "@livekit/agents";
import { resolveDomain } from "../lib/domain/index.js";
import { getCanvasState } from "./session.js";
import { TextStreamPublisher } from "./textStreamPublisher.js";
import type { Room } from "@livekit/rtc-node";

export function getCanvasSystemPrompt(): string {
  return resolveDomain().systemPrompt;
}

export type AnthropicLLMOptions = {
  model?: string;
  apiKey?: string;
  roomName: string;
  room?: Room;
};

export class AnthropicLLM extends LLM {
  protected client: Anthropic;
  private _model: string;
  private roomName: string;
  private room?: Room;
  private logger = () => log();

  constructor(options: AnthropicLLMOptions) {
    super();
    this.client = new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this._model =
      options.model ??
      process.env.ANTHROPIC_MODEL ??
      "claude-sonnet-4-5-20250929";
    this.roomName = options.roomName;
    this.room = options.room;
  }

  label(): string {
    return "anthropic";
  }

  get model(): string {
    return this._model;
  }

  get provider(): string {
    return "anthropic";
  }

  chat(options: {
    chatCtx: ChatContext;
    toolCtx?: ToolContext;
    connOptions?: APIConnectOptions;
    parallelToolCalls?: boolean;
    toolChoice?: llm.ToolChoice;
    extraKwargs?: Record<string, unknown>;
  }): LLMStream {
    return new AnthropicLLMStream(this, {
      chatCtx: options.chatCtx,
      toolCtx: options.toolCtx,
      connOptions: options.connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
      roomName: this.roomName,
      room: this.room,
    });
  }
}

class AnthropicLLMStream extends LLMStream {
  private anthropic: AnthropicLLM;
  private roomName: string;
  private room?: Room;
  private toolCallId?: string;
  private toolName?: string;
  private toolArguments = "";
  private messageId = "anthropic";
  private activeToolBlock = false;

  constructor(
    anthropic: AnthropicLLM,
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
    super(anthropic, { chatCtx, toolCtx, connOptions });
    this.anthropic = anthropic;
    this.roomName = roomName;
    this.room = room;
  }

  protected async run(): Promise<void> {
    this.toolCallId = undefined;
    this.toolName = undefined;
    this.toolArguments = "";
    this.activeToolBlock = false;

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

    const tools: Tool[] | undefined = this.toolCtx
      ? sortedToolEntries(this.toolCtx).map(([name, tool]) => ({
          name,
          description: tool.description,
          input_schema: toJsonSchema(tool.parameters, true, false) as Tool["input_schema"],
        }))
      : undefined;

    const messages = convertChatContext(this.chatCtx.items);
    if (messages.length === 0) {
      messages.push({ role: "user", content: "Hello" });
    }

    const textPublisher = this.room ? new TextStreamPublisher(this.room) : null;

    try {
      const stream = this.anthropic.client.messages.stream({
        model: this.anthropic.model,
        max_tokens: 4096,
        system: systemParts.join("\n\n"),
        messages,
        tools,
      });

      for await (const event of stream) {
        if (this.abortController.signal.aborted) break;

        if (event.type === "message_start") {
          this.messageId = event.message.id;
        }

        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            this.activeToolBlock = true;
            this.toolCallId = event.content_block.id;
            this.toolName = event.content_block.name;
            this.toolArguments = "";
          }
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            textPublisher?.append(event.delta.text, this.messageId);
            this.queue.put({
              id: this.messageId,
              delta: {
                role: "assistant",
                content: event.delta.text,
              },
            });
          }

          if (event.delta.type === "input_json_delta" && this.activeToolBlock) {
            this.toolArguments += event.delta.partial_json;
          }
        }

        if (event.type === "content_block_stop" && this.activeToolBlock) {
          if (this.toolCallId && this.toolName && this.toolArguments) {
            this.queue.put({
              id: this.messageId,
              delta: {
                role: "assistant",
                toolCalls: [
                  FunctionCall.create({
                    callId: this.toolCallId,
                    name: this.toolName,
                    args: this.toolArguments,
                  }),
                ],
              },
            });
          }
          this.activeToolBlock = false;
          this.toolCallId = undefined;
          this.toolName = undefined;
          this.toolArguments = "";
        }

        if (event.type === "message_delta" && event.usage) {
          this.queue.put({
            id: "anthropic",
            usage: {
              completionTokens: event.usage.output_tokens,
              promptTokens: 0,
              promptCachedTokens: 0,
              totalTokens: event.usage.output_tokens,
            },
          });
        }
      }

      await textPublisher?.flush(true);
    } catch (error) {
      await textPublisher?.flush(true);
      if (this.abortController.signal.aborted) return;

      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new APITimeoutError({ options: { retryable: true } });
      }
      if (error instanceof Anthropic.APIError) {
        throw new APIStatusError({
          message: error.message,
          options: {
            statusCode: error.status,
            retryable: error.status ? error.status >= 500 : false,
          },
        });
      }
      throw new APIConnectionError({
        message: error instanceof Error ? error.message : String(error),
        options: { retryable: false },
      });
    }
  }
}

function convertChatContext(items: ChatItem[]): MessageParam[] {
  const messages: MessageParam[] = [];

  for (const item of items) {
    if (item.type === "agent_handoff" || item.type === "agent_config_update") {
      continue;
    }

    if (item.type === "message") {
      const message = item as LKChatMessage;
      const text = message.textContent;
      if (!text) continue;

      if (message.role === "assistant") {
        messages.push({ role: "assistant", content: text });
      } else if (message.role === "user") {
        messages.push({ role: "user", content: text });
      }
      continue;
    }

    if (item.type === "function_call") {
      const call = item as FunctionCall;
      messages.push({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: call.callId,
            name: call.name,
            input: safeParseJson(call.args),
          },
        ],
      });
      continue;
    }

    if (item.type === "function_call_output") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: item.callId,
            content: item.output,
          },
        ],
      });
    }
  }

  return messages;
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function createAnthropicLLM(roomName: string, room?: Room): AnthropicLLM {
  return new AnthropicLLM({ roomName, room });
}
