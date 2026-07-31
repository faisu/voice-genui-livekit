import {
  ChatMessage as LKChatMessage,
  type ChatItem,
  type FunctionCall,
} from "@livekit/agents";
import type { ModelMessage, ToolResultPart } from "ai";

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

type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
};

/**
 * Convert LiveKit chat items to AI SDK model messages.
 * Ensures every tool-call has a matching tool-result so Anthropic/AI SDK
 * do not throw MissingToolResultsError (common with filler speech, interrupted
 * tools, and onDuplicate: "reject").
 */
export function convertChatContextToModelMessages(items: ChatItem[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  /** Pending tool calls that still need a result, in order. */
  const pendingCalls = new Map<string, { toolName: string }>();

  const flushSyntheticResults = (reason: string) => {
    if (pendingCalls.size === 0) return;
    const content: ToolResultPart[] = [];
    for (const [toolCallId, meta] of pendingCalls) {
      content.push({
        type: "tool-result",
        toolCallId,
        toolName: meta.toolName,
        output: {
          type: "text",
          value: JSON.stringify({
            status: "incomplete",
            message: reason,
          }),
        },
      });
    }
    pendingCalls.clear();
    messages.push({ role: "tool", content });
  };

  /** Merge consecutive assistant tool-call messages into one (provider-friendly). */
  const pushToolCall = (part: ToolCallPart) => {
    const last = messages[messages.length - 1];
    if (
      last &&
      last.role === "assistant" &&
      Array.isArray(last.content) &&
      last.content.every((c) => c.type === "tool-call")
    ) {
      (last.content as ToolCallPart[]).push(part);
    } else {
      messages.push({ role: "assistant", content: [part] });
    }
    pendingCalls.set(part.toolCallId, { toolName: part.toolName });
  };

  for (const item of items) {
    if (item.type === "agent_handoff" || item.type === "agent_config_update") {
      continue;
    }

    if (item.type === "message") {
      const message = item as LKChatMessage;
      const text = message.textContent;
      if (!text) continue;

      if (message.role === "assistant") {
        // Filler speech must not sit between tool-calls and their results.
        flushSyntheticResults(
          "Tool did not finish before the next assistant turn (interrupted, rejected, or still running).",
        );
        messages.push({ role: "assistant", content: text });
      } else if (message.role === "user") {
        flushSyntheticResults(
          "Tool did not finish before the next user turn (interrupted, rejected, or still running).",
        );
        messages.push({ role: "user", content: text });
      } else if (message.role === "system" || message.role === "developer") {
        flushSyntheticResults(
          "Tool did not finish before the next system turn.",
        );
        messages.push({ role: "system", content: text });
      }
      continue;
    }

    if (item.type === "function_call") {
      const call = item as FunctionCall;
      pushToolCall({
        type: "tool-call",
        toolCallId: call.callId,
        toolName: call.name,
        input: safeParseJson(call.args),
      });
      continue;
    }

    if (item.type === "function_call_output") {
      const callId = item.callId;
      const toolName = item.name || pendingCalls.get(callId)?.toolName || "unknown";
      pendingCalls.delete(callId);

      const last = messages[messages.length - 1];
      const resultPart: ToolResultPart = {
        type: "tool-result",
        toolCallId: callId,
        toolName,
        output: { type: "text", value: item.output },
      };

      if (
        last &&
        last.role === "tool" &&
        Array.isArray(last.content)
      ) {
        last.content.push(resultPart);
      } else {
        messages.push({ role: "tool", content: [resultPart] });
      }
    }
  }

  // Trailing tool calls with no results (e.g. still in filler when a new reply starts).
  flushSyntheticResults(
    "Tool result was missing from chat history (cancelled, rejected duplicate, or incomplete).",
  );

  return messages;
}
