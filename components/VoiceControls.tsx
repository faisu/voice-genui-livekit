"use client";

import { useVoiceAssistant, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/types";

const STATE_LABELS: Record<string, string> = {
  initializing: "Initializing",
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function VoiceControls() {
  const room = useRoomContext();
  const { state: agentState, agent } = useVoiceAssistant();
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");

  useEffect(() => {
    const mapState = (state: ConnectionState): ConnectionStatus => {
      switch (state) {
        case ConnectionState.Connecting:
          return "connecting";
        case ConnectionState.Connected:
          return "connected";
        case ConnectionState.Reconnecting:
          return "reconnecting";
        case ConnectionState.Disconnected:
          return "disconnected";
        default:
          return "idle";
      }
    };

    setConnectionStatus(mapState(room.state));

    const onStateChange = (state: ConnectionState) => {
      setConnectionStatus(mapState(state));
    };

    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onStateChange);
    };
  }, [room]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 text-xs dark:border-zinc-800">
      <Badge label={`Room: ${connectionStatus}`} tone="neutral" />
      <Badge
        label={`Agent: ${STATE_LABELS[agentState] ?? agentState}`}
        tone={agentState === "speaking" ? "active" : "neutral"}
      />
      <Badge
        label={agent ? "Agent connected" : "Waiting for agent — run npm run dev:agent"}
        tone={agent ? "success" : "warn"}
      />
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "active" | "success" | "warn";
}) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    active: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${tones[tone]}`}>
      {label}
    </span>
  );
}

export function useConnectionStatus(): ConnectionStatus {
  const room = useRoomContext();
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  useEffect(() => {
    const mapState = (state: ConnectionState): ConnectionStatus => {
      switch (state) {
        case ConnectionState.Connecting:
          return "connecting";
        case ConnectionState.Connected:
          return "connected";
        case ConnectionState.Reconnecting:
          return "reconnecting";
        case ConnectionState.Disconnected:
          return "disconnected";
        default:
          return "idle";
      }
    };

    setStatus(mapState(room.state));
    const onStateChange = (state: ConnectionState) => setStatus(mapState(state));
    room.on(RoomEvent.ConnectionStateChanged, onStateChange);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onStateChange);
    };
  }, [room]);

  return status;
}
