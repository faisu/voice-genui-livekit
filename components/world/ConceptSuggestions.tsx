"use client";

const SUGGESTIONS = [
  { label: "Projectile motion", prompt: "Explain projectile motion with an interactive demo." },
  { label: "Simple pendulum", prompt: "Show me how a simple pendulum works." },
  { label: "Newton's laws", prompt: "Teach Newton's three laws with a clear visualization." },
  { label: "Wave interference", prompt: "Explain wave interference with an animation." },
  { label: "Orbital mechanics", prompt: "Show how planets orbit under gravity." },
  { label: "Electric fields", prompt: "Visualize electric fields around charges." },
] as const;

type ConceptSuggestionsProps = {
  visible: boolean;
  disabled?: boolean;
  onSelect: (prompt: string) => void;
};

export function ConceptSuggestions({
  visible,
  disabled,
  onSelect,
}: ConceptSuggestionsProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-[18%]">
      <div className="rounded-3xl border border-white/10 bg-black/45 px-5 py-5 text-center backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300/90">
          Physics Lab
        </p>
        <h1 className="mt-2 text-xl font-medium tracking-tight text-zinc-50 sm:text-2xl">
          What should we explore?
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Speak naturally, or tap a concept — the whole lab view becomes the demo.
        </p>
        <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.prompt)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
