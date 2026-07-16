"use client";

import { useDomain } from "@/components/DomainProvider";
import type { ChatMessage } from "@/lib/types";

type LiveCaptionsProps = {
  messages: ChatMessage[];
  agentState: string;
  visible: boolean;
};

const STATE_HINT: Record<string, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  initializing: "Connecting…",
};

export function LiveCaptions({ messages, agentState, visible }: LiveCaptionsProps) {
  const domain = useDomain();

  if (!visible) return null;

  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.text.trim());

  const caption = latestAssistant?.text.trim() ?? "";
  const hint = STATE_HINT[agentState];
  const showHint = !caption && Boolean(hint);

  if (!caption && !showHint) return null;

  return (
    <div className="pointer-events-none absolute bottom-[9.75rem] left-1/2 z-20 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-center backdrop-blur-xl">
        {hint && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/90">
            {hint}
          </p>
        )}
        {caption ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-zinc-100">
            {caption}
            {latestAssistant?.isFinal === false && (
              <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-sky-300 align-middle" />
            )}
          </p>
        ) : (
          <p className="text-sm text-zinc-400">
            {domain.captionPlaceholder}
          </p>
        )}
      </div>
    </div>
  );
}
