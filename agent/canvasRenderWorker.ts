import Anthropic from "@anthropic-ai/sdk";
import type { Room } from "@livekit/rtc-node";
import { log } from "@livekit/agents";
import type { RenderCanvasInput } from "../lib/types.js";
import {
  buildStreamingPartialJson,
  extractPartialContentField,
  parseEmitCanvasContent,
} from "../lib/partialJson.js";
import { getCanvasState } from "./session.js";
import {
  publishToolCallComplete,
  publishToolCallDelta,
} from "./tools/renderCanvas.js";
import type { RenderCanvasRequest } from "./tools/renderCanvasTool.js";

const DELTA_THROTTLE_MS = 180;
const DELTA_MIN_CHARS = 72;

const RENDER_SYSTEM_PROMPT = `You generate high-quality FULL-VIEWPORT Three.js physics teaching scenes.
Call emit_canvas_content with the finished artifact.

The student's entire lab view IS the canvas. Do not design floating cards, iframes, or HTML pages.
Always emit content_type "threejs".

Harness bindings (already in scope — do NOT import or fetch):
- THREE, OrbitControls, container, notifyHost, clock

Full-viewport Three.js quality bar:
- Fill container completely; resize renderer to container.clientWidth/clientHeight on start and window resize
- Dark lab aesthetic: renderer.setClearColor(0x050508) or similar deep navy/black
- Soft lighting: ambient + directional (+ subtle hemisphere when helpful)
- Use OrbitControls with damping; frame the whole demo clearly from the start
- Animate with clock.getDelta() in a requestAnimationFrame loop; support a paused flag
- Physics must be visually correct (gravity down −Y, consistent units, realistic relative motion)
- Draw velocity/force vectors as colored arrows with clear meaning
- Add subtle motion trails or path lines when they teach the concept
- Include a compact HTML overlay INSIDE container (absolute positioned) with: concept title, 1–2 key readouts, and Play / Pause / Reset buttons
- Buttons should toggle local simulation state AND call notifyHost({ action: "play"|"pause"|"reset" })

Overlay layout — RESERVED APP UI ZONES (critical, or your controls get covered):
- The app renders its own chrome ON TOP of your canvas that you must never overlap:
  - BOTTOM of the viewport (roughly the bottom 220px, full width, centered): live captions and the microphone orb. This is the most important zone to avoid — NEVER put interactive controls (Play/Pause/Reset, sliders, toggles) here or they will be unclickable.
  - Top-left and top-right corners (~220px): small app status chips.
- Put ALL of your HTML overlays in the TOP region of the container. Anchor your interactive control panel to the TOP-CENTER (e.g. top: 12px; left: 50%; transform: translateX(-50%)). Put readouts/legend at top-left or top-right but keep them narrow and below y≈56px so they clear the app chips.
- Every overlay element must set a high z-index (e.g. z-index: 5) and pointer-events: auto so buttons/sliders are clickable; the canvas itself stays behind them.
- Keep the vertical center clear for the simulation; do not stack controls down into the bottom band.
- Prefer MeshStandardMaterial / MeshPhysicalMaterial for main bodies
- Readable contrast colors (cyan/amber accents on dark backgrounds); avoid neon glow spam
- Register cleanup: globalThis.__physicsDispose = () => { cancelAnimationFrame(...); renderer.dispose(); controls.dispose(); overlay.remove(); }
- No fetch, eval, imports, document.write, or network calls
- No separate SVG/HTML documents — only Three.js scene code (overlay DOM inside the Three.js container is fine)

Keep scenes compact, robust, and pedagogically rich — clarity over complexity.`;

function logger() {
  return log();
}

function buildUserPrompt(request: RenderCanvasRequest, roomName: string): string {
  const parts = [
    "Render a FULL-VIEWPORT threejs physics teaching scene that fills the student's entire lab view.",
    `Title: ${request.title ?? "Untitled"}`,
    `Lesson brief: ${request.visual_brief}`,
    `Mode: ${request.mode}`,
  ];

  if (request.mode === "patch") {
    const existing = getCanvasState(roomName);
    if (existing?.content) {
      parts.push(`Existing scene to patch:\n${existing.content}`);
    }
  }

  return parts.join("\n\n");
}

export type CanvasRenderJobResult = {
  title?: string;
  content_type: "threejs";
  content_length: number;
};

export async function runCanvasRenderJob(options: {
  room: Room;
  roomName: string;
  request: RenderCanvasRequest;
  abortSignal?: AbortSignal;
}): Promise<CanvasRenderJobResult> {
  const { room, roomName, request, abortSignal } = options;
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const model =
    process.env.ANTHROPIC_RENDER_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-5-20250929";

  let toolArguments = "";
  let lastPublishedContent = "";
  let lastPublishAt = 0;
  let pendingContent = "";
  let pendingPartialJson = "";

  const flushDelta = async (force = false) => {
    if (!pendingContent && !force) return;
    const grew = pendingContent.length - lastPublishedContent.length;
    const elapsed = Date.now() - lastPublishAt;
    if (!force && pendingContent && grew < DELTA_MIN_CHARS && elapsed < DELTA_THROTTLE_MS) {
      return;
    }

    if (pendingContent) {
      lastPublishedContent = pendingContent;
      lastPublishAt = Date.now();
      await publishToolCallDelta(room, pendingPartialJson);
    }
  };

  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    system: RENDER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(request, roomName),
      },
    ],
    tools: [
      {
        name: "emit_canvas_content",
        description: "Emit the finished full-viewport Three.js physics scene.",
        input_schema: {
          type: "object",
          properties: {
            content_type: { type: "string", enum: ["threejs"] },
            content: { type: "string" },
          },
          required: ["content_type", "content"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_canvas_content" },
  });

  for await (const event of stream) {
    if (abortSignal?.aborted) {
      throw new Error("Canvas render cancelled");
    }

    if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
      toolArguments += event.delta.partial_json;
      const content = extractPartialContentField(toolArguments);
      if (content) {
        pendingContent = content;
        pendingPartialJson = buildStreamingPartialJson(
          {
            mode: request.mode,
            content_type: "threejs",
            title: request.title,
          },
          content,
        );
        await flushDelta(false);
      }
    }
  }

  await flushDelta(true);

  const emitted = parseEmitCanvasContent(toolArguments);
  if (!emitted) {
    throw new Error("Background render did not produce canvas content");
  }

  const input: RenderCanvasInput = {
    mode: request.mode,
    content_type: "threejs",
    content: emitted.content,
    title: request.title,
  };

  await publishToolCallComplete(room, roomName, input);
  logger().info({ title: input.title }, "Background canvas render complete");

  return {
    title: input.title,
    content_type: "threejs",
    content_length: input.content.length,
  };
}
