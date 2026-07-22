import {
  ChatMessage as LKChatMessage,
  type ChatItem,
  type FunctionCall,
} from "@livekit/agents";
import type { ModelMessage } from "ai";

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function convertChatContextToModelMessages(items: ChatItem[]): ModelMessage[] {
  const messages: ModelMessage[] = [];

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
            type: "tool-call",
            toolCallId: call.callId,
            toolName: call.name,
            input: safeParseJson(call.args),
          },
        ],
      });
      continue;
    }

    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: item.callId,
            toolName: item.name,
            output: { type: "text", value: item.output },
          },
        ],
      });
    }
  }

  return messages;
}
