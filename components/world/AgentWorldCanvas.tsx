"use client";

import { useEffect, useMemo, useRef } from "react";
import { useDomain } from "@/components/DomainProvider";
import { SceneBuilder } from "@/components/world/SceneBuilder";
import { tryParseSceneOpsDocument, type SceneOpsDocument } from "@/lib/sceneOps";
import { prepareCanvasContent } from "@/lib/sanitize";
import type { WorldDemo } from "@/lib/types";

type AgentWorldCanvasProps = {
  demo: WorldDemo | null;
  onCanvasEvent: (payload: unknown) => void;
};

export function AgentWorldCanvas({
  demo,
  onCanvasEvent,
}: AgentWorldCanvasProps) {
  const domain = useDomain();
  const containerRef = useRef<HTMLDivElement>(null);
  const builderRef = useRef<SceneBuilder | null>(null);
  const onEventRef = useRef(onCanvasEvent);
  const pendingDocRef = useRef<SceneOpsDocument | null>(null);

  useEffect(() => {
    onEventRef.current = onCanvasEvent;
  }, [onCanvasEvent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const builder = new SceneBuilder({
      container: el,
      notifyHost: (payload) => onEventRef.current(payload),
    });
    builderRef.current = builder;
    // Always show a live lab shell (grid + ground) while waiting for demos.
    builder.bootstrapIdle();
    // Re-apply after Strict Mode remount — apply effect may not re-fire.
    if (pendingDocRef.current) {
      builder.apply(pendingDocRef.current, "replace");
    }

    return () => {
      builder.dispose();
      builderRef.current = null;
    };
  }, []);

  const readyContent =
    demo && !demo.streaming && demo.content.trim() ? demo.content : null;

  const parsed = useMemo(() => {
    if (!readyContent) return { doc: null, error: null as string | null };
    try {
      const prepared = prepareCanvasContent(readyContent, "scene_ops");
      const doc = tryParseSceneOpsDocument(prepared);
      if (!doc) return { doc: null, error: "Invalid scene_ops document" };
      return { doc, error: null };
    } catch (err) {
      return {
        doc: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [readyContent]);

  useEffect(() => {
    pendingDocRef.current = parsed.doc;
    const builder = builderRef.current;
    if (!builder || !parsed.doc) return;
    builder.apply(parsed.doc, "replace");
  }, [parsed.doc]);

  const showBuildingChip = Boolean(demo?.streaming);

  return (
    <div className="absolute inset-0 bg-[#050508]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!demo && !showBuildingChip ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-[13px] tracking-wide text-slate-500">
            Ready when you are
          </p>
        </div>
      ) : null}
      {parsed.error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-sm text-red-400">
            {parsed.error}
          </p>
        </div>
      ) : null}
      {showBuildingChip ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/50 px-3.5 py-2 backdrop-blur-md">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border border-zinc-600 border-t-sky-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              Building
            </p>
            <p className="max-w-56 truncate text-xs text-zinc-400">
              {demo?.title ?? domain.demoDefaultTitle}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
