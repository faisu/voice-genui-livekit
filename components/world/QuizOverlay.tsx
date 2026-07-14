"use client";

import { useMemo, useState } from "react";
import type { QuizAnswer, QuizSpec } from "@/lib/types";

type QuizOverlayProps = {
  quiz: QuizSpec;
  onSubmit: (answers: QuizAnswer[]) => void;
  onDismiss: () => void;
};

export function QuizOverlay({ quiz, onSubmit, onDismiss }: QuizOverlayProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = quiz.questions.every((question) => selections[question.id]);

  const correctCount = useMemo(() => {
    if (!submitted) return 0;
    return quiz.questions.reduce(
      (count, question) =>
        selections[question.id] === question.correctOptionId ? count + 1 : count,
      0,
    );
  }, [submitted, quiz.questions, selections]);

  const handleSelect = (questionId: string, optionId: string) => {
    if (submitted) return;
    setSelections((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    const answers: QuizAnswer[] = quiz.questions.map((question) => ({
      questionId: question.id,
      selectedOptionId: selections[question.id]!,
    }));
    onSubmit(answers);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#050508]/70 backdrop-blur-sm" />
      <div className="relative flex max-h-[calc(100vh-3rem)] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
              Quick check
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-100">
              {quiz.title ?? quiz.concept}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss quiz"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {quiz.questions.map((question, index) => {
            const selectedId = selections[question.id];
            return (
              <div key={question.id}>
                <p className="mb-2 text-sm text-zinc-100">
                  <span className="mr-1.5 text-zinc-500">{index + 1}.</span>
                  {question.prompt}
                </p>
                <div className="space-y-1.5">
                  {question.options.map((option) => {
                    const isSelected = selectedId === option.id;
                    const isCorrect = option.id === question.correctOptionId;
                    const showAsCorrect = submitted && isCorrect;
                    const showAsWrong = submitted && isSelected && !isCorrect;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelect(question.id, option.id)}
                        disabled={submitted}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                          showAsCorrect
                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                            : showAsWrong
                              ? "border-red-400/50 bg-red-500/15 text-red-100"
                              : isSelected
                                ? "border-sky-400/60 bg-sky-500/15 text-sky-100"
                                : "border-white/10 bg-white/5 text-zinc-200 hover:border-white/20 hover:bg-white/10"
                        } ${submitted ? "cursor-default" : ""}`}
                      >
                        <span
                          className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border text-[9px] ${
                            isSelected || showAsCorrect
                              ? "border-current"
                              : "border-zinc-500 text-transparent"
                          }`}
                        >
                          {option.id.toUpperCase()}
                        </span>
                        <span className="flex-1">{option.text}</span>
                      </button>
                    );
                  })}
                </div>
                {submitted && question.explanation && (
                  <p className="mt-1.5 text-xs text-zinc-400">{question.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/10 px-5 py-4">
          {submitted ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-200">
                You scored{" "}
                <span className="font-semibold text-sky-300">
                  {correctCount}/{quiz.questions.length}
                </span>
                . Your teacher will walk through the results.
              </p>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/15"
              >
                Done
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="w-full rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allAnswered ? "Submit answers" : "Answer all questions to submit"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
