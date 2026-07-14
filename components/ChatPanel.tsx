"use client";

import type { ChatMessage, ConnectionStatus } from "@/lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  micEnabled: boolean;
  onToggleMic: () => void;
  onSendText: (text: string) => void;
};

export function ChatPanel({
  messages,
  connectionStatus,
  micEnabled,
  onToggleMic,
  onSendText,
}: ChatPanelProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    onSendText(text);
    input.value = "";
  };

  return (
    <div className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Voice + Chat
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Status:{" "}
          <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
            {connectionStatus}
          </span>
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            Connect and speak or type to start. Ask for a chart, dashboard, or
            diagram.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl px-3 py-2 text-sm ${
              message.role === "user"
                ? "ml-6 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100"
                : "mr-6 bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
            } ${message.isFinal === false ? "opacity-70" : ""}`}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
              {message.role}
            </p>
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={connectionStatus !== "connected"}
          className={`mb-3 w-full rounded-xl px-4 py-2 text-sm font-medium transition ${
            micEnabled
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100"
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
            className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={connectionStatus !== "connected"}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
