"use client";

import { useAudioPlayback } from "@livekit/components-react";
import { useState } from "react";
import { useDomain } from "@/components/DomainProvider";

type AudioUnlockProps = {
  className?: string;
};

/**
 * Browsers block remote TTS until a user gesture unlocks audio.
 */
export function AudioUnlock({ className }: AudioUnlockProps) {
  const domain = useDomain();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const [unlocking, setUnlocking] = useState(false);
  const [failed, setFailed] = useState(false);

  if (canPlayAudio) return null;

  const handleUnlock = async () => {
    setUnlocking(true);
    setFailed(false);
    try {
      await startAudio();
    } catch {
      setFailed(true);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      className={
        className ??
        "absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      }
    >
      <div className="max-w-sm rounded-3xl border border-white/10 bg-[#0a0e17]/95 px-6 py-6 text-center shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">
          Enable sound
        </p>
        <h2 className="mt-2 text-lg font-medium text-zinc-50">
          {domain.audioUnlockTitle}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Your browser blocks voice until you interact. This only needs to happen once.
        </p>
        <button
          type="button"
          onClick={() => void handleUnlock()}
          disabled={unlocking}
          className="mt-5 w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
        >
          {unlocking ? "Enabling…" : "Enable teacher voice"}
        </button>
        {failed && (
          <p className="mt-3 text-xs text-amber-300">
            Could not unlock audio. Check system volume and try again.
          </p>
        )}
      </div>
    </div>
  );
}

export function useEnsureAudioOnGesture() {
  const { canPlayAudio, startAudio } = useAudioPlayback();

  return {
    canPlayAudio,
    unlockAudio: () => {
      if (!canPlayAudio) {
        void startAudio();
      }
    },
  };
}
