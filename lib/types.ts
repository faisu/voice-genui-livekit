export const CANVAS_DATA_TOPIC = "canvas";

/** Agent-generated demos are always Three.js filling the full viewport. */
export type CanvasContentType = "threejs";

export type RenderCanvasInput = {
  mode: "replace" | "patch";
  content_type: CanvasContentType;
  content: string;
  title?: string;
};

/** Active full-viewport physics demo driven by the agent. */
export type WorldDemo = {
  title?: string;
  content: string;
  streaming: boolean;
  updatedAt: number;
};

export type CanvasState = RenderCanvasInput & {
  updatedAt: number;
};

/** A single selectable choice within a quiz question. */
export type QuizOption = {
  id: string;
  text: string;
};

/** One multiple-choice comprehension question. */
export type QuizQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation?: string;
};

/** A full comprehension quiz the agent asks after teaching a concept. */
export type QuizSpec = {
  quizId: string;
  concept: string;
  title?: string;
  questions: QuizQuestion[];
};

export type QuizState = QuizSpec & {
  updatedAt: number;
};

/** A student's answers to a rendered quiz. */
export type QuizAnswer = {
  questionId: string;
  selectedOptionId: string;
};

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
  | { type: "assistant_text"; text: string; isFinal?: boolean }
  | {
      type: "assistant_text_delta";
      streamId: string;
      delta: string;
      isFinal: boolean;
    }
  | { type: "user_transcript"; text: string; isFinal: boolean }
  | { type: "quiz_render"; quiz: QuizSpec };

/** Browser → agent (data channel, topic "canvas") */
export type CanvasEventMessage =
  | { type: "canvas_event"; payload: unknown }
  | { type: "text_input"; text: string }
  | { type: "quiz_answer"; quizId: string; answers: QuizAnswer[] };

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
