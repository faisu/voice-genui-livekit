"use client";

import { AgentAudioOutput } from "@/components/AgentAudioOutput";
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
  CANVAS_DATA_TOPIC,
  type CanvasDataMessage,
  type CanvasEventMessage,
  type ChatMessage,
  type QuizAnswer,
  type QuizSpec,
} from "@/lib/types";
import {
  LiveKitRoom,
  useDataChannel,
  useLocalParticipant,
} from "@livekit/components-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

type TokenResponse = {
  token: string;
  url: string;
  roomName: string;
};

function VoiceGenUIApp() {
  const connectionStatus = useConnectionStatus();
  const { localParticipant } = useLocalParticipant();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [worldState, setWorldState] = useState<CanvasWorldState>({
    demo: null,
  });
  const [quiz, setQuiz] = useState<QuizSpec | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const worldAccRef = useRef(createCanvasWorldAccumulator());

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

  const onQuizSubmit = useCallback(
    (quizId: string, answers: QuizAnswer[]) => {
      void publishMessage({ type: "quiz_answer", quizId, answers });
    },
    [publishMessage],
  );

  const onQuizDismiss = useCallback(() => {
    setQuiz(null);
  }, []);

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
        onToggleMic={() => setMicEnabled((value) => !value)}
        onSendText={onSendText}
        onCanvasEvent={onCanvasEvent}
        onQuizSubmit={onQuizSubmit}
        onQuizDismiss={onQuizDismiss}
      />
      <AgentAudioOutput />
    </div>
  );
}

const ACCESS_CODE_STORAGE_KEY = "voice-genui-access-code";

export default function HomePage() {
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [gateRequired, setGateRequired] = useState(false);
  const [booting, setBooting] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const reconnectKeyRef = useRef(0);
  const [reconnectKey, setReconnectKey] = useState(0);

  const connect = useCallback(async (code: string) => {
    setConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code || undefined }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (TokenResponse & { error?: string })
        | null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 503) {
          try {
            sessionStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
          } catch {
            // ignore
          }
          setGateRequired(true);
        }
        throw new Error(
          payload?.error ?? `Failed to fetch LiveKit token (${response.status})`,
        );
      }

      if (!payload?.token || !payload.url) {
        throw new Error("Invalid token response");
      }

      try {
        if (code) sessionStorage.setItem(ACCESS_CODE_STORAGE_KEY, code);
      } catch {
        // ignore
      }

      setGateRequired(false);
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
      let saved = "";
      try {
        saved = sessionStorage.getItem(ACCESS_CODE_STORAGE_KEY) ?? "";
      } catch {
        // sessionStorage may be unavailable
      }
      if (cancelled) return;
      if (saved) setAccessCode(saved);
      await connect(saved);
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

  const onAccessSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = accessCode.trim();
    setAccessCode(trimmed);
    void connect(trimmed);
  };

  if (booting || connecting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#050508]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Opening physics lab
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-[#050508] px-6">
        <form
          onSubmit={onAccessSubmit}
          className="w-full max-w-sm space-y-5"
        >
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
              Physics Lab
            </p>
            <h1 className="text-xl font-semibold text-zinc-100">
              {gateRequired ? "Enter access code" : "Unable to connect"}
            </h1>
            <p className="text-sm text-zinc-400">
              {gateRequired
                ? "This preview is gated so sessions and API usage stay limited to invited feedback."
                : "Check your connection, then try again."}
            </p>
          </div>
          {gateRequired ? (
            <input
              type="password"
              autoComplete="current-password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Access code"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500"
              disabled={connecting}
            />
          ) : null}
          {error ? (
            <p className="text-center text-sm text-red-400">{error}</p>
          ) : null}
          {gateRequired ? (
            <button
              type="submit"
              disabled={connecting || !accessCode.trim()}
              className="w-full rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enter lab
            </button>
          ) : (
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
          )}
        </form>
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
        setSession(null);
        setError(null);
        reconnectKeyRef.current += 1;
        setBooting(true);
        setReconnectKey(reconnectKeyRef.current);
      }}
      onError={(err) => setError(err.message)}
      className="h-full"
    >
      <VoiceGenUIApp />
    </LiveKitRoom>
  );
}
