"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { useDomain } from "@/components/DomainProvider";
import type { ChatMessage, ConnectionStatus } from "@/lib/types";

type ChatOverlayProps = {
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  micEnabled: boolean;
  agentState: string;
  agentPresent: boolean;
  artifactFocused: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onToggleMic: () => void;
  onSendText: (text: string) => void;
  onReturnToAgent: () => void;
};

const AGENT_LABELS: Record<string, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  initializing: "Starting teacher…",
  connecting: "Waiting for teacher…",
  disconnected: "Disconnected",
  failed: "Teacher unavailable",
};

function statusLabel(
  agentState: string,
  agentPresent: boolean,
  connectionStatus: ConnectionStatus,
): string {
  if (connectionStatus !== "connected") {
    return connectionStatus === "connecting" ? "Joining lab…" : connectionStatus;
  }
  if (!agentPresent) {
    return "Waiting for teacher…";
  }
  return AGENT_LABELS[agentState] ?? agentState;
}

export function ChatOverlay({
  messages,
  connectionStatus,
  micEnabled,
  agentState,
  agentPresent,
  artifactFocused,
  minimized,
  onMinimize,
  onToggleMic,
  onSendText,
  onReturnToAgent,
}: ChatOverlayProps) {
  const domain = useDomain();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, agentState]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    onSendText(text);
    input.value = "";
  };

  const recentMessages = messages.slice(-6);
  const label = statusLabel(agentState, agentPresent, connectionStatus);
  const waitingForAgent =
    connectionStatus === "connected" && !agentPresent;

  if (minimized) return null;

  return (
    <div className="pointer-events-none absolute bottom-28 left-4 z-20 w-[min(380px,calc(100vw-2rem))] transition-all duration-500 ease-out">
      <div className="pointer-events-auto flex max-h-[min(420px,calc(100vh-12rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="relative border-b border-white/10 px-4 py-3 text-center">
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize chat"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 10h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            className={`mx-auto mb-2 h-2 w-2 rounded-full transition-all ${
              agentState === "speaking"
                ? "scale-125 bg-sky-400 shadow-[0_0_12px_#38bdf8]"
                : agentState === "listening"
                  ? "bg-emerald-400"
                  : waitingForAgent
                    ? "animate-pulse bg-amber-400"
                    : "bg-zinc-500"
            }`}
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {domain.teacherTitle}
          </p>
          <p className="text-sm text-zinc-100">{label}</p>
          {waitingForAgent ? (
            <p className="mt-1 text-xs text-amber-200/90">
              Agent offline — run{" "}
              <span className="font-mono">npm run dev:agent</span>
            </p>
          ) : null}
          {artifactFocused && (
            <button
              type="button"
              onClick={onReturnToAgent}
              className="mt-2 text-xs text-sky-300 underline-offset-2 hover:underline"
            >
              Minimize chat
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {recentMessages.length === 0 && (
            <p className="text-center text-sm text-zinc-400">
              Ask about projectile motion, pendulums, fields, waves — the whole
              lab view becomes an interactive Three.js demo.
            </p>
          )}
          {recentMessages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-4 bg-sky-500/15 text-sky-100"
                  : "mr-4 bg-white/5 text-zinc-100"
              } ${message.isFinal === false ? "opacity-70" : ""}`}
            >
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {message.role}
              </p>
              <p className="whitespace-pre-wrap">
                {message.text}
                {message.role === "assistant" && message.isFinal === false && (
                  <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-sky-300 align-middle" />
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onToggleMic}
            disabled={connectionStatus !== "connected"}
            className={`mb-2 w-full rounded-xl px-4 py-2 text-sm font-medium transition ${
              micEnabled
                ? "bg-emerald-600/90 text-white hover:bg-emerald-500"
                : "bg-white/10 text-zinc-200 hover:bg-white/15"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {micEnabled ? "Microphone on" : "Microphone off"}
          </button>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              name="message"
              type="text"
              placeholder="Type a message…"
              disabled={connectionStatus !== "connected"}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none ring-sky-400/50 placeholder:text-zinc-500 focus:ring-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={connectionStatus !== "connected"}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
