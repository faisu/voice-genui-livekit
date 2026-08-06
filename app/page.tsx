"use client";

import { AgentAudioOutput } from "@/components/AgentAudioOutput";
import { DomainProvider, useDomain } from "@/components/DomainProvider";
import { WorldCanvas } from "@/components/WorldCanvas";
import { useConnectionStatus } from "@/components/VoiceControls";
import {
  applyCanvasMessage,
  createCanvasWorldAccumulator,
  toCanvasWorldState,
  type CanvasWorldState,
} from "@/lib/canvasObjects";
import {
  acceptCanvasChunk,
  createCanvasChunkAccumulator,
  type CanvasChunkMessage,
} from "@/lib/canvasTransport";
import {
  loadLearnerProfile,
  saveLearnerProfile,
} from "@/lib/learnerProfile";
import {
  CANVAS_DATA_TOPIC,
  type CanvasDataMessage,
  type CanvasEventMessage,
  type ChatMessage,
  type LearnerProfile,
} from "@/lib/types";
import {
  LiveKitRoom,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TokenResponse = {
  token: string;
  url: string;
  roomName: string;
};

function VoiceGenUIApp({
  profile,
  onProfileChange,
  onExitLab,
}: {
  profile: LearnerProfile | null;
  onProfileChange: (profile: LearnerProfile) => void;
  onExitLab: () => void;
}) {
  const connectionStatus = useConnectionStatus();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [worldState, setWorldState] = useState<CanvasWorldState>({
    demo: null,
  });
  const [micEnabled, setMicEnabled] = useState(true);
  const [exiting, setExiting] = useState(false);
  const worldAccRef = useRef(createCanvasWorldAccumulator());
  const profileSentRef = useRef(false);

  const upsertAssistantDelta = useCallback(
    (streamId: string, delta: string, isFinal: boolean) => {
      if (!delta && !isFinal) return;

      setChatMessages((prev) => {
        const existingIdx = prev.findIndex((message) => message.id === streamId);
        if (existingIdx >= 0) {
          const existing = prev[existingIdx]!;
          const next = prev.slice();
          next[existingIdx] = {
            ...existing,
            text: delta ? existing.text + delta : existing.text,
            isFinal: isFinal || Boolean(existing.isFinal),
          };
          return next;
        }

        if (!delta) return prev;

        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.isFinal === false) {
          // New stream while one is still open — close the previous bubble first.
          return [
            ...prev.slice(0, -1),
            { ...last, isFinal: true },
            {
              id: streamId,
              role: "assistant",
              text: delta,
              isFinal,
            },
          ];
        }

        return [
          ...prev,
          {
            id: streamId,
            role: "assistant",
            text: delta,
            isFinal,
          },
        ];
      });
    },
    [],
  );

  const finalizeAssistantText = useCallback((text: string) => {
    if (!text.trim()) return;

    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        // ConversationItemAdded often republishes text already streamed via deltas.
        if (last.isFinal && last.text === text) return prev;
        return [...prev.slice(0, -1), { ...last, text, isFinal: true }];
      }

      return [
        ...prev,
        {
          id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "assistant",
          text,
          isFinal: true,
        },
      ];
    });
  }, []);

  const upsertTranscript = useCallback((text: string, isFinal: boolean) => {
    setChatMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "user" && last.isFinal === false) {
        return [...prev.slice(0, -1), { ...last, text, isFinal }];
      }
      return [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "user",
          text,
          isFinal,
        },
      ];
    });
  }, []);

  const applyCanvasPayload = useCallback((payload: CanvasDataMessage) => {
    worldAccRef.current = applyCanvasMessage(worldAccRef.current, payload);
    setWorldState(toCanvasWorldState(worldAccRef.current));
  }, []);

  const chunkAccRef = useRef(createCanvasChunkAccumulator());

  const handleDecodedCanvasJson = useCallback(
    (raw: string) => {
      const payload = JSON.parse(raw) as CanvasDataMessage | CanvasChunkMessage;

      if (payload.type === "canvas_chunk") {
        const reassembled = acceptCanvasChunk(chunkAccRef.current, payload);
        if (!reassembled) return;
        handleDecodedCanvasJson(reassembled);
        return;
      }

      if (
        payload.type === "tool_call_delta" ||
        payload.type === "tool_call_complete" ||
        payload.type === "tool_call_error"
      ) {
        applyCanvasPayload(payload);
        return;
      }

      if (payload.type === "assistant_text_delta") {
        upsertAssistantDelta(payload.streamId, payload.delta, payload.isFinal);
        return;
      }

      if (payload.type === "assistant_text") {
        finalizeAssistantText(payload.text);
        return;
      }

      if (payload.type === "user_transcript") {
        upsertTranscript(payload.text, payload.isFinal);
        return;
      }

      if (payload.type === "learner_profile") {
        saveLearnerProfile(payload.profile);
        onProfileChange(payload.profile);
      }
    },
    [
      applyCanvasPayload,
      finalizeAssistantText,
      onProfileChange,
      upsertAssistantDelta,
      upsertTranscript,
    ],
  );

  const onCanvasDataMessage = useCallback(
    (message: { payload: Uint8Array }) => {
      try {
        const raw = new TextDecoder().decode(message.payload);
        handleDecodedCanvasJson(raw);
      } catch (error) {
        console.error("Failed to parse canvas data message", error);
      }
    },
    [handleDecodedCanvasJson],
  );

  const { send: sendCanvasMessage } = useDataChannel(
    CANVAS_DATA_TOPIC,
    onCanvasDataMessage,
  );

  const publishMessage = useCallback(
    async (payload: CanvasEventMessage) => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      await sendCanvasMessage(data, { reliable: true });
    },
    [sendCanvasMessage],
  );

  // Returning students: publish saved profile once so the agent skips voice onboarding.
  useEffect(() => {
    if (connectionStatus !== "connected" || !profile || profileSentRef.current) {
      return;
    }
    profileSentRef.current = true;
    void publishMessage({ type: "student_profile", profile });
  }, [connectionStatus, profile, publishMessage]);

  const onSendText = useCallback(
    (text: string) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "user",
          text,
          isFinal: true,
        },
      ]);
      void publishMessage({ type: "text_input", text });
    },
    [publishMessage],
  );

  const onCanvasEvent = useCallback(
    (payload: unknown) => {
      void publishMessage({ type: "canvas_event", payload });
    },
    [publishMessage],
  );

  const handleExitLab = useCallback(async () => {
    if (exiting) return;
    setExiting(true);
    onExitLab();
    try {
      await publishMessage({ type: "leave_lab", reason: "exit button" });
    } catch {
      // Best-effort notify; disconnect still tears the room down.
    }
    try {
      await room.disconnect();
    } catch (error) {
      console.error("Failed to disconnect from lab", error);
      setExiting(false);
    }
  }, [exiting, onExitLab, publishMessage, room]);

  useEffect(() => {
    const disconnectOnLeave = () => {
      try {
        void room.disconnect();
      } catch {
        // page is unloading
      }
    };
    window.addEventListener("pagehide", disconnectOnLeave);
    window.addEventListener("beforeunload", disconnectOnLeave);
    return () => {
      window.removeEventListener("pagehide", disconnectOnLeave);
      window.removeEventListener("beforeunload", disconnectOnLeave);
    };
  }, [room]);

  useEffect(() => {
    void localParticipant.setMicrophoneEnabled(micEnabled);
  }, [localParticipant, micEnabled]);

  return (
    <div className="h-full">
      <WorldCanvas
        messages={chatMessages}
        worldState={worldState}
        connectionStatus={connectionStatus}
        micEnabled={micEnabled}
        learnerProfile={profile}
        exiting={exiting}
        onToggleMic={() => setMicEnabled((value) => !value)}
        onSendText={onSendText}
        onCanvasEvent={onCanvasEvent}
        onExitLab={() => {
          void handleExitLab();
        }}
      />
      <AgentAudioOutput />
    </div>
  );
}

export default function HomePage() {
  return (
    <DomainProvider>
      <HomePageContent />
    </DomainProvider>
  );
}

function HomePageContent() {
  const domain = useDomain();
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const reconnectKeyRef = useRef(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const intentionalLeaveRef = useRef(false);
  const [leftLab, setLeftLab] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = (await response.json().catch(() => null)) as
        | (TokenResponse & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? `Failed to fetch LiveKit token (${response.status})`,
        );
      }

      if (!payload?.token || !payload.url) {
        throw new Error("Invalid token response");
      }

      // Returning visitors keep their voice-collected profile; first visit onboards in-lab.
      setProfile(loadLearnerProfile());
      setSession({
        token: payload.token,
        url: payload.url,
        roomName: payload.roomName,
      });
    } catch (err) {
      setSession(null);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (cancelled) return;
      await connect();
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [connect, reconnectKey]);

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    }),
    [],
  );

  if (booting || connecting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#050508]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          {domain.openingLabel}
        </p>
      </div>
    );
  }

  if (leftLab) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050508] px-6">
        <div className="w-full max-w-sm space-y-5 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
            {domain.labName}
          </p>
          <h1 className="text-xl font-semibold text-zinc-100">
            You left the lab
          </h1>
          <p className="text-sm text-zinc-400">
            The teacher session ended. Re-enter whenever you want to continue.
          </p>
          <button
            type="button"
            onClick={() => {
              setLeftLab(false);
              intentionalLeaveRef.current = false;
              reconnectKeyRef.current += 1;
              setBooting(true);
              setError(null);
              setReconnectKey(reconnectKeyRef.current);
            }}
            className="w-full rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
          >
            Re-enter lab
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050508] px-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              {domain.labName}
            </p>
            <h1 className="text-xl font-semibold text-zinc-100">
              Unable to connect
            </h1>
            <p className="text-sm text-zinc-400">
              Check your connection, then try again.
            </p>
          </div>
          {error ? (
            <p className="text-center text-sm text-red-400">{error}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              reconnectKeyRef.current += 1;
              setBooting(true);
              setError(null);
              setReconnectKey(reconnectKeyRef.current);
            }}
            className="w-full rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={session.token}
      serverUrl={session.url}
      connect={true}
      audio={true}
      video={false}
      options={roomOptions}
      onDisconnected={() => {
        const intentional = intentionalLeaveRef.current;
        intentionalLeaveRef.current = false;
        setSession(null);
        setError(null);
        if (intentional) {
          setLeftLab(true);
          return;
        }
        reconnectKeyRef.current += 1;
        setBooting(true);
        setReconnectKey(reconnectKeyRef.current);
      }}
      onError={(err) => setError(err.message)}
      className="h-full"
    >
      <VoiceGenUIApp
        profile={profile}
        onProfileChange={setProfile}
        onExitLab={() => {
          intentionalLeaveRef.current = true;
        }}
      />
    </LiveKitRoom>
  );
}
