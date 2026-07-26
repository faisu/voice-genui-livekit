"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useVoiceAssistant } from "@livekit/components-react";
import { AudioUnlock, useEnsureAudioOnGesture } from "@/components/AudioUnlock";
import type { CanvasWorldState } from "@/lib/canvasObjects";
import type {
  ChatMessage,
  ConnectionStatus,
  LearnerProfile,
  QuizAnswer,
  QuizSpec,
} from "@/lib/types";
import { ChatOverlay } from "./world/ChatOverlay";
import { ConceptSuggestions } from "./world/ConceptSuggestions";
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
  learnerProfile: LearnerProfile;
  exiting?: boolean;
  onToggleMic: () => void;
  onSendText: (text: string) => void;
  onCanvasEvent: (payload: unknown) => void;
  onStageReady?: (payload: {
    lesson_id: string;
    stage_id: string;
    stage_index: number;
  }) => void;
  onQuizSubmit: (quizId: string, answers: QuizAnswer[]) => void;
  onQuizDismiss: () => void;
  onExitLab?: () => void;
};

export function WorldCanvas({
  messages,
  worldState,
  quiz,
  connectionStatus,
  micEnabled,
  learnerProfile,
  exiting = false,
  onToggleMic,
  onSendText,
  onCanvasEvent,
  onStageReady,
  onQuizSubmit,
  onQuizDismiss,
  onExitLab,
}: WorldCanvasProps) {
  const { state: agentState, agent } = useVoiceAssistant();
  const agentPresent = Boolean(agent);
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
      <AgentWorldCanvas
        demo={demo}
        onCanvasEvent={onCanvasEvent}
        onStageReady={onStageReady}
      />

      <AudioUnlock />

      {onExitLab ? (
        <button
          type="button"
          onClick={onExitLab}
          disabled={exiting || connectionStatus === "disconnected"}
          className="pointer-events-auto absolute left-4 top-4 z-30 rounded-lg border border-white/10 bg-black/55 px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-xl transition hover:border-white/20 hover:bg-black/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exiting ? "Leaving…" : "Exit lab"}
        </button>
      ) : null}

      <ConceptSuggestions
        visible={showSuggestions && chatMinimized}
        disabled={connectionStatus !== "connected"}
        preferredTopics={learnerProfile.topics}
        onSelect={handleSuggestion}
      />

      <ScreenAgentOrb
        agentState={agentState}
        chatMinimized={chatMinimized}
        onClick={handleMaximizeChat}
      />

      <ChatOverlay
        messages={messages}
        connectionStatus={connectionStatus}
        micEnabled={micEnabled}
        agentState={agentState}
        agentPresent={agentPresent}
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

      {/* Minimal status — no captions / transcript text over the scene */}
      {connectionStatus !== "connected" || !agentPresent ? (
        <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1 text-xs text-zinc-400">
          {connectionStatus !== "connected" ? (
            <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur-sm">
              {connectionStatus}
            </span>
          ) : null}
          {connectionStatus === "connected" && !agentPresent ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-amber-200">
              Waiting for teacher…
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
