"use client";

import { RoomAudioRenderer } from "@livekit/components-react";

/** Plays all remote participant audio (agent TTS track). */
export function AgentAudioOutput() {
  return <RoomAudioRenderer volume={1} />;
}
