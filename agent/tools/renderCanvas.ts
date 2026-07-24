import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import {
  CANVAS_DATA_TOPIC,
  type CanvasContentType,
  type CanvasDataMessage,
  type QuizSpec,
  type RenderCanvasInput,
} from "../../lib/types.js";
import { prepareCanvasContent } from "../../lib/sanitize.js";
import { setCanvasState } from "../session.js";

function logger() {
  return log();
}

export async function publishCanvasMessage(
  room: Room,
  message: CanvasDataMessage,
): Promise<void> {
  logger().info({ messageType: message.type }, "Publishing canvas data message");
  const payload = new TextEncoder().encode(JSON.stringify(message));
  await room.localParticipant?.publishData(payload, {
    reliable: true,
    topic: CANVAS_DATA_TOPIC,
  });
}

export async function publishToolCallComplete(
  room: Room,
  roomName: string,
  input: RenderCanvasInput,
): Promise<void> {
  const contentType: CanvasContentType = input.content_type ?? "threejs";
  const prepared: RenderCanvasInput = {
    ...input,
    content_type: contentType,
    content: prepareCanvasContent(input.content, contentType),
  };
  setCanvasState(roomName, { ...prepared, updatedAt: Date.now() });
  await publishCanvasMessage(room, {
    type: "tool_call_complete",
    name: "render_canvas",
    input: prepared,
  });
}

export async function publishToolCallDelta(
  room: Room,
  partialInput: string,
): Promise<void> {
  await publishCanvasMessage(room, {
    type: "tool_call_delta",
    name: "render_canvas",
    partialInput,
  });
}

export async function publishAssistantText(
  room: Room,
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  await publishCanvasMessage(room, { type: "assistant_text", text, isFinal: true });
}

export async function publishAssistantTextDelta(
  room: Room,
  payload: { streamId: string; delta: string; isFinal: boolean },
): Promise<void> {
  if (!payload.delta && !payload.isFinal) return;
  await publishCanvasMessage(room, {
    type: "assistant_text_delta",
    streamId: payload.streamId,
    delta: payload.delta,
    isFinal: payload.isFinal,
  });
}

export async function publishUserTranscript(
  room: Room,
  text: string,
  isFinal: boolean,
): Promise<void> {
  if (!text.trim()) return;
  await publishCanvasMessage(room, { type: "user_transcript", text, isFinal });
}

export async function publishQuizRender(
  room: Room,
  quiz: QuizSpec,
): Promise<void> {
  await publishCanvasMessage(room, { type: "quiz_render", quiz });
}
