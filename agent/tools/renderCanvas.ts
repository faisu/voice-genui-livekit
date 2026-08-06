import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import {
  CANVAS_DATA_TOPIC,
  type CanvasContentType,
  type CanvasDataMessage,
  type LearnerProfile,
  type RenderCanvasInput,
} from "../../lib/types.js";
import { prepareCanvasContent } from "../../lib/sanitize.js";
import { encodeCanvasWirePayload } from "../../lib/canvasTransport.js";
import { setCanvasState } from "../session.js";

function logger() {
  return log();
}

export async function publishCanvasMessage(
  room: Room,
  message: CanvasDataMessage,
): Promise<void> {
  const json = JSON.stringify(message);
  const wire = encodeCanvasWirePayload(json);
  const participant = room.localParticipant;
  if (!participant) {
    throw new Error("Cannot publish canvas message: no local participant");
  }

  if (wire.kind === "single") {
    logger().info(
      { messageType: message.type, bytes: wire.bytes.byteLength },
      "Publishing canvas data message",
    );
    await participant.publishData(wire.bytes, {
      reliable: true,
      topic: CANVAS_DATA_TOPIC,
    });
    return;
  }

  logger().info(
    {
      messageType: message.type,
      chunks: wire.packets.length,
      bytes: wire.packets.reduce((sum, packet) => sum + packet.byteLength, 0),
    },
    "Publishing chunked canvas data message",
  );

  for (const packet of wire.packets) {
    await participant.publishData(packet, {
      reliable: true,
      topic: CANVAS_DATA_TOPIC,
    });
  }
}

export async function publishToolCallComplete(
  room: Room,
  roomName: string,
  input: RenderCanvasInput,
): Promise<void> {
  const contentType: CanvasContentType = input.content_type ?? "scene_ops";
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

export async function publishToolCallError(
  room: Room,
  options: { title?: string; message: string },
): Promise<void> {
  await publishCanvasMessage(room, {
    type: "tool_call_error",
    name: "render_canvas",
    title: options.title,
    message: options.message,
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

export async function publishLearnerProfile(
  room: Room,
  profile: LearnerProfile,
): Promise<void> {
  await publishCanvasMessage(room, { type: "learner_profile", profile });
}
