"use client";

import { AgentAudioOutput } from "@/components/AgentAudioOutput";
import { DomainProvider, useDomain } from "@/components/DomainProvider";
import { LearnerProfileForm } from "@/components/LearnerProfileForm";
import { WorldCanvas } from "@/components/WorldCanvas";
import {
  useConnectionStatus,
} from "@/components/VoiceControls";
import {
  applyCanvasMessage,
  createCanvasWorldAccumulator,
  toCanvasWorldState,
  type CanvasWorldState,
} from "@/lib/canvasObjects";
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
  type QuizAnswer,
  type QuizSpec,
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
  onExitLab,
}: {
  profile: LearnerProfile;
  onExitLab: () => void;
}) {
  const connectionStatus = useConnectionStatus();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [worldState, setWorldState] = useState<CanvasWorldState>({
    demo: null,
  });
  const [quiz, setQuiz] = useState<QuizSpec | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [exiting, setExiting] = useState(false);
  const worldAccRef = useRef(createCanvasWorldAccumulator());
  const profileSentRef = useRef(false);

  const upsertAssistantDelta = useCallback(
    (streamId: string, delta: string, isFinal: boolean) => {
      if (!delta && !isFinal) return;

      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.isFinal === false) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              text: delta ? last.text + delta : last.text,
              isFinal,
            },
          ];
        }

        if (!delta) return prev;

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
        if (last.text === text && last.isFinal) return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, text, isFinal: true },
        ];
      }

      return [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text,
          isFinal: true,
        },
      ];
    });
  }, []);

  const upsertTranscript = useCallback(
    (text: string, isFinal: boolean) => {
      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "user" && last.isFinal === false) {
          return [
            ...prev.slice(0, -1),
            { ...last, text, isFinal },
          ];
        }
        return [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: "user",
            text,
            isFinal,
          },
        ];
      });
    },
    [],
  );

  const applyCanvasPayload = useCallback((payload: CanvasDataMessage) => {
    worldAccRef.current = applyCanvasMessage(worldAccRef.current, payload);
    setWorldState(toCanvasWorldState(worldAccRef.current));
  }, []);

  const onCanvasDataMessage = useCallback(
    (message: { payload: Uint8Array }) => {
      try {
        const payload = JSON.parse(
          new TextDecoder().decode(message.payload),
        ) as CanvasDataMessage;

        if (
          payload.type === "tool_call_delta" ||
          payload.type === "tool_call_complete"
        ) {
          applyCanvasPayload(payload);
          return;
        }

        if (payload.type === "assistant_text_delta") {
          upsertAssistantDelta(
            payload.streamId,
            payload.delta,
            payload.isFinal,
          );
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

        if (payload.type === "quiz_render") {
          setQuiz(payload.quiz);
        }
      } catch (error) {
        console.error("Failed to parse canvas data message", error);
      }
    },
    [applyCanvasPayload, finalizeAssistantText, upsertAssistantDelta, upsertTranscript],
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

  // Publish learner profile once the room is connected so the agent can
  // personalize instructions before (or right as) it greets.
  useEffect(() => {
    if (connectionStatus !== "connected" || profileSentRef.current) return;
    profileSentRef.current = true;
    void publishMessage({ type: "student_profile", profile });
  }, [connectionStatus, profile, publishMessage]);

  const onSendText = useCallback(
    (text: string) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
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

  const onStageReady = useCallback(
    (payload: {
      lesson_id: string;
      stage_id: string;
      stage_index: number;
    }) => {
      void publishMessage({ type: "stage_ready", ...payload });
    },
    [publishMessage],
  );

  const onQuizSubmit = useCallback(
    (quizId: string, answers: QuizAnswer[]) => {
      void publishMessage({ type: "quiz_answer", quizId, answers });
    },
    [publishMessage],
  );

  const onQuizDismiss = useCallback(() => {
    setQuiz(null);
  }, []);

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

  // Tab close / navigation away — disconnect so the agent job can shut down.
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
        quiz={quiz}
        connectionStatus={connectionStatus}
        micEnabled={micEnabled}
        learnerProfile={profile}
        exiting={exiting}
        onToggleMic={() => setMicEnabled((value) => !value)}
        onSendText={onSendText}
        onCanvasEvent={onCanvasEvent}
        onStageReady={onStageReady}
        onQuizSubmit={onQuizSubmit}
        onQuizDismiss={onQuizDismiss}
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
  const [pendingToken, setPendingToken] = useState<TokenResponse | null>(null);
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

      const token: TokenResponse = {
        token: payload.token,
        url: payload.url,
        roomName: payload.roomName,
      };

      const savedProfile = loadLearnerProfile();
      if (savedProfile) {
        setProfile(savedProfile);
        setPendingToken(null);
        setSession(token);
      } else {
        setSession(null);
        setPendingToken(token);
      }
    } catch (err) {
      setSession(null);
      setPendingToken(null);
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

  const onProfileSubmit = (next: LearnerProfile) => {
    saveLearnerProfile(next);
    setProfile(next);
    if (pendingToken) {
      setSession(pendingToken);
      setPendingToken(null);
    }
  };

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

  // Access succeeded — collect learner profile before joining the room.
  if (pendingToken && !session) {
    return <LearnerProfileForm onSubmit={onProfileSubmit} />;
  }

  if (leftLab && profile) {
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

  if (!session || !profile) {
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
        setPendingToken(null);
        setError(null);
        if (intentional) {
          setLeftLab(true);
          return;
        }
        // Unexpected drop — reconnect with a fresh token.
        reconnectKeyRef.current += 1;
        setBooting(true);
        setReconnectKey(reconnectKeyRef.current);
      }}
      onError={(err) => setError(err.message)}
      className="h-full"
    >
      <VoiceGenUIApp
        profile={profile}
        onExitLab={() => {
          intentionalLeaveRef.current = true;
        }}
      />
    </LiveKitRoom>
  );
}
