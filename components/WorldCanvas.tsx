"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import { AudioUnlock, useEnsureAudioOnGesture } from "@/components/AudioUnlock";
import type { CanvasWorldState } from "@/lib/canvasObjects";
import type {
  ChatMessage,
  ConnectionStatus,
  QuizAnswer,
  QuizSpec,
} from "@/lib/types";
import { ChatOverlay } from "./world/ChatOverlay";
import { ConceptSuggestions } from "./world/ConceptSuggestions";
import { LiveCaptions } from "./world/LiveCaptions";
import { QuizOverlay } from "./world/QuizOverlay";
import { ScreenAgentOrb } from "./world/ScreenAgentOrb";

const AgentWorldCanvas = dynamic(
  () => import("./world/AgentWorldCanvas").then((mod) => mod.AgentWorldCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#050508]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />
      </div>
    ),
  },
);

type WorldCanvasProps = {
  messages: ChatMessage[];
  worldState: CanvasWorldState;
  quiz: QuizSpec | null;
  connectionStatus: ConnectionStatus;
  micEnabled: boolean;
  onToggleMic: () => void;
  onSendText: (text: string) => void;
  onCanvasEvent: (payload: unknown) => void;
  onQuizSubmit: (quizId: string, answers: QuizAnswer[]) => void;
  onQuizDismiss: () => void;
};

export function WorldCanvas({
  messages,
  worldState,
  quiz,
  connectionStatus,
  micEnabled,
  onToggleMic,
  onSendText,
  onCanvasEvent,
  onQuizSubmit,
  onQuizDismiss,
}: WorldCanvasProps) {
  const { state: agentState } = useVoiceAssistant();
  const { unlockAudio } = useEnsureAudioOnGesture();
  const [chatMinimized, setChatMinimized] = useState(true);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);

  const demo = worldState.demo;

  useEffect(() => {
    if (demo || messages.some((message) => message.role === "user")) {
      setSuggestionsDismissed(true);
    }
  }, [demo, messages]);

  const handleSuggestion = useCallback(
    (prompt: string) => {
      unlockAudio();
      setSuggestionsDismissed(true);
      onSendText(prompt);
    },
    [onSendText, unlockAudio],
  );

  const handleMaximizeChat = () => {
    unlockAudio();
    setChatMinimized(false);
  };

  const handleToggleMic = () => {
    unlockAudio();
    onToggleMic();
  };

  const handleSendText = (text: string) => {
    unlockAudio();
    onSendText(text);
  };

  const showSuggestions =
    !suggestionsDismissed &&
    !demo &&
    connectionStatus === "connected";

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#050508]"
      onPointerDown={unlockAudio}
    >
      <AgentWorldCanvas demo={demo} onCanvasEvent={onCanvasEvent} />

      <AudioUnlock />

      <ConceptSuggestions
        visible={showSuggestions && chatMinimized}
        disabled={connectionStatus !== "connected"}
        onSelect={handleSuggestion}
      />

      <ScreenAgentOrb
        agentState={agentState}
        chatMinimized={chatMinimized}
        onClick={handleMaximizeChat}
      />

      <LiveCaptions
        messages={messages}
        agentState={agentState}
        visible={chatMinimized && !showSuggestions}
      />

      <ChatOverlay
        messages={messages}
        connectionStatus={connectionStatus}
        micEnabled={micEnabled}
        agentState={agentState}
        artifactFocused={Boolean(demo && !demo.streaming)}
        minimized={chatMinimized}
        onMinimize={() => setChatMinimized(true)}
        onToggleMic={handleToggleMic}
        onSendText={handleSendText}
        onReturnToAgent={() => setChatMinimized(true)}
      />

      {quiz && (
        <QuizOverlay
          key={quiz.quizId}
          quiz={quiz}
          onSubmit={(answers) => onQuizSubmit(quiz.quizId, answers)}
          onDismiss={onQuizDismiss}
        />
      )}

      {chatMinimized && !showSuggestions && messages.length === 0 && (
        <div className="pointer-events-none absolute bottom-[10.5rem] left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-400 backdrop-blur-sm">
          Click the orb for chat · Speak anytime · Drag to look around
        </div>
      )}

      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1 text-xs text-zinc-400">
        <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur-sm">
          {connectionStatus === "connected" ? "Lab connected" : connectionStatus}
        </span>
        {demo?.streaming && (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-200">
            Building demo…
          </span>
        )}
        {demo && !demo.streaming && (
          <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur-sm">
            Full-view demo live
          </span>
        )}
      </div>
    </div>
  );
}
