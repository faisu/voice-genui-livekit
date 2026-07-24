"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useDomain } from "@/components/DomainProvider";
import {
  AGE_BAND_OPTIONS,
  PRONOUN_OPTIONS,
} from "@/lib/learnerProfile";
import type { AgeBand, LearnerProfile, PronounChoice } from "@/lib/types";

type LearnerProfileFormProps = {
  initial?: LearnerProfile | null;
  onSubmit: (profile: LearnerProfile) => void;
};

export function LearnerProfileForm({
  initial,
  onSubmit,
}: LearnerProfileFormProps) {
  const domain = useDomain();
  const topicLabels = useMemo(
    () => domain.conceptSuggestions.map((item) => item.label),
    [domain.conceptSuggestions],
  );

  const [ageBand, setAgeBand] = useState<AgeBand | "">(initial?.ageBand ?? "");
  const [pronouns, setPronouns] = useState<PronounChoice | "">(
    initial?.pronouns ?? "",
  );
  const [topics, setTopics] = useState<string[]>(initial?.topics ?? []);
  const [otherTopic, setOtherTopic] = useState(initial?.otherTopic ?? "");

  const canSubmit = Boolean(ageBand && pronouns);

  const toggleTopic = (label: string) => {
    setTopics((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label],
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!ageBand || !pronouns) return;
    onSubmit({
      ageBand,
      pronouns,
      topics,
      otherTopic: otherTopic.trim() || undefined,
    });
  };

  return (
    <div className="flex h-full items-center justify-center bg-[#050508] px-6 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-6"
      >
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
            {domain.labName}
          </p>
          <h1 className="text-xl font-semibold text-zinc-100">
            Tell us about you
          </h1>
          <p className="text-sm text-zinc-400">
            We use this to match explanation depth and how we address you —
            not to change the science.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Age
          </legend>
          <div className="flex flex-wrap gap-2">
            {AGE_BAND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAgeBand(option.value)}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  ageBand === option.value
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-sky-400/30 hover:bg-sky-500/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Pronouns
          </legend>
          <div className="flex flex-wrap gap-2">
            {PRONOUN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPronouns(option.value)}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  pronouns === option.value
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-sky-400/30 hover:bg-sky-500/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Topics of interest{" "}
            <span className="normal-case tracking-normal text-zinc-600">
              (optional)
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {topicLabels.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleTopic(label)}
                className={`rounded-xl border px-3 py-2 text-xs transition ${
                  topics.includes(label)
                    ? "border-sky-400/50 bg-sky-500/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:border-sky-400/30 hover:bg-sky-500/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={otherTopic}
            onChange={(event) => setOtherTopic(event.target.value)}
            placeholder="Other topic…"
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500"
          />
        </fieldset>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-sky-500 px-3 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to lab
        </button>
      </form>
    </div>
  );
}
