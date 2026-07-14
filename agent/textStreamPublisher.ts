import type { Room } from "@livekit/rtc-node";
import { publishAssistantTextDelta } from "./tools/renderCanvas.js";

const FLUSH_INTERVAL_MS = 80;

export class TextStreamPublisher {
  private buffer = "";
  private streamId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private room: Room,
    private intervalMs = FLUSH_INTERVAL_MS,
  ) {}

  append(delta: string, streamId: string) {
    if (!delta) return;

    if (this.streamId !== streamId) {
      void this.flush(false);
      this.streamId = streamId;
    }

    this.buffer += delta;
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush(false);
      }, this.intervalMs);
    }
  }

  async flush(isFinal: boolean) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.buffer && !isFinal) return;

    const delta = this.buffer;
    this.buffer = "";
    const streamId = this.streamId ?? "assistant";

    if (!delta && !isFinal) return;

    await publishAssistantTextDelta(this.room, {
      streamId,
      delta,
      isFinal,
    });

    if (isFinal) {
      this.streamId = null;
    }
  }
}
