"use client";

import { useMemo } from "react";
import { useDomain } from "@/components/DomainProvider";

type ConceptSuggestionsProps = {
  visible: boolean;
  disabled?: boolean;
  /** Topic labels from the learner profile — floated to the front. */
  preferredTopics?: string[];
  onSelect: (prompt: string) => void;
};

export function ConceptSuggestions({
  visible,
  disabled,
  preferredTopics = [],
  onSelect,
}: ConceptSuggestionsProps) {
  const domain = useDomain();

  const orderedSuggestions = useMemo(() => {
    const preferred = new Set(
      preferredTopics.map((topic) => topic.trim().toLowerCase()).filter(Boolean),
    );
    if (preferred.size === 0) return domain.conceptSuggestions;

    const matched = domain.conceptSuggestions.filter((item) =>
      preferred.has(item.label.toLowerCase()),
    );
    const rest = domain.conceptSuggestions.filter(
      (item) => !preferred.has(item.label.toLowerCase()),
    );
    return [...matched, ...rest];
  }, [domain.conceptSuggestions, preferredTopics]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-[18%]">
      <div className="rounded-3xl border border-white/10 bg-black/45 px-5 py-5 text-center backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
          {domain.labName}
        </p>
        <h1 className="mt-2 text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">
          {domain.tagline}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Speak naturally, or tap a concept — the whole lab view becomes the demo.
        </p>
        <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
          {orderedSuggestions.map((item) => {
            const isPreferred = preferredTopics.some(
              (topic) => topic.toLowerCase() === item.label.toLowerCase(),
            );
            return (
              <button
                key={item.label}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(item.prompt)}
                className={`rounded-xl border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPreferred
                    ? "border-sky-400/40 bg-sky-500/15 text-sky-100 hover:border-sky-400/60 hover:bg-sky-500/20"
                    : "border-white/10 bg-white/5 text-zinc-200 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
