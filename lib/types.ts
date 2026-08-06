/** Age bands used for teaching depth / vocabulary personalization. */
export type AgeBand = "under_13" | "13_15" | "16_18" | "18_22" | "23_plus";

/** Collected once by voice after joining the lab (name, age, optional topics). */
export type LearnerProfile = {
  /** Preferred first name or nickname for address. */
  name: string;
  ageBand: AgeBand;
  /** Topic labels the student mentioned wanting to explore. */
  topics: string[];
  otherTopic?: string;
};

/** Constrained Three.js scene ops JSON for host SceneBuilder. */
export type CanvasContentType = "scene_ops";

export type RenderCanvasInput = {
  mode: "replace" | "patch";
  content_type: CanvasContentType;
  /** Stringified SceneOpsDocument. */
  content: string;
  title?: string;
};

/** Active full-viewport demo driven by the agent. */
export type WorldDemo = {
  title?: string;
  content: string;
  content_type?: CanvasContentType;
  streaming: boolean;
  updatedAt: number;
};

export type CanvasState = RenderCanvasInput & {
  updatedAt: number;
};

export const CANVAS_DATA_TOPIC = "canvas";

/** Agent → browser (data channel, topic "canvas") */
export type CanvasDataMessage =
  | {
      type: "tool_call_delta";
      name: "render_canvas";
      partialInput: string;
    }
  | {
      type: "tool_call_complete";
      name: "render_canvas";
      input: RenderCanvasInput;
    }
  | {
      type: "tool_call_error";
      name: "render_canvas";
      title?: string;
      message: string;
    }
  | { type: "assistant_text"; text: string; isFinal?: boolean }
  | {
      type: "assistant_text_delta";
      streamId: string;
      delta: string;
      isFinal: boolean;
    }
  | { type: "user_transcript"; text: string; isFinal: boolean }
  | { type: "learner_profile"; profile: LearnerProfile };

/** Browser → agent (data channel, topic "canvas") */
export type CanvasEventMessage =
  | { type: "canvas_event"; payload: unknown }
  | { type: "text_input"; text: string }
  | { type: "student_profile"; profile: LearnerProfile }
  | {
      type: "stage_ready";
      lesson_id: string;
      stage_id: string;
      stage_index: number;
    }
  /** Student is leaving the lab; agent should shut down the job. */
  | { type: "leave_lab"; reason?: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  isFinal?: boolean;
};

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
