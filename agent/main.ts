import {
  AgentSessionEventTypes,
  cli,
  defineAgent,
  log,
  ServerOptions,
} from "@livekit/agents";
import { RoomEvent } from "@livekit/rtc-node";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import {
  CANVAS_DATA_TOPIC,
  type CanvasEventMessage,
  type QuizAnswer,
  type QuizState,
} from "../lib/types.js";
import { resolveDomain } from "../lib/domain/index.js";
import {
  createCanvasAgent,
  createVoiceSession,
  prewarmAgent,
  type AgentProcessUserData,
} from "./pipeline.js";
import {
  clearRoomSession,
  getQuizState,
  hasGreeted,
  markGreeted,
  resolveStageReady,
  setLearnerProfile,
} from "./session.js";
import {
  publishAssistantText,
  publishUserTranscript,
} from "./tools/renderCanvas.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

/** Wait briefly for student_profile before greeting so personalization applies. */
const PROFILE_GREETING_WAIT_MS = 4000;

export default defineAgent<AgentProcessUserData>({
  prewarm: prewarmAgent,
  entry: async (ctx) => {
    const logger = log();
    const room = ctx.room;
    const roomName = ctx.job.room?.name ?? room.name ?? "default-room";

    logger.info({ roomName }, "Agent joining room");

    const session = createVoiceSession();
    const agent = createCanvasAgent(room, roomName);

    session.on(AgentSessionEventTypes.UserInputTranscribed, (event) => {
      void publishUserTranscript(room, event.transcript, event.isFinal);
    });

    session.on(AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (event.item.type !== "message") return;
      if (event.item.role !== "assistant") return;
      const text = event.item.textContent;
      if (text) void publishAssistantText(room, text);
    });

    const issueGreeting = () => {
      if (hasGreeted(roomName)) return;
      markGreeted(roomName);
      session.generateReply({
        userInput: "Hello",
        instructions: resolveDomain().greetingInstructions,
      });
    };

    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== CANVAS_DATA_TOPIC) return;

      try {
        const message = JSON.parse(
          new TextDecoder().decode(payload),
        ) as CanvasEventMessage;

        if (message.type === "student_profile") {
          logger.info({ profile: message.profile }, "Received student profile");
          setLearnerProfile(roomName, message.profile);
          void agent.refreshInstructions().then(() => {
            if (!hasGreeted(roomName)) {
              issueGreeting();
            }
          });
          return;
        }

        if (message.type === "text_input") {
          logger.info({ text: message.text }, "Received text input");
          session.interrupt();
          session.generateReply({
            userInput: message.text,
            inputModality: "text",
          });
          return;
        }

        if (message.type === "quiz_answer") {
          logger.info(
            { quizId: message.quizId, answers: message.answers },
            "Received quiz answer",
          );

          const quiz = getQuizState(roomName);
          const summary = buildQuizResultSummary(quiz, message.quizId, message.answers);

          session.interrupt();
          session.generateReply({
            userInput: summary,
            inputModality: "text",
          });
          return;
        }

        if (message.type === "stage_ready") {
          logger.info(
            {
              lessonId: message.lesson_id,
              stageId: message.stage_id,
              stageIndex: message.stage_index,
            },
            "Received stage_ready",
          );
          resolveStageReady(roomName, message.lesson_id, message.stage_id);
          return;
        }

        if (message.type === "canvas_event") {
          logger.info({ payload: message.payload }, "Received canvas event");

          if (isSilentCanvasControl(message.payload)) {
            return;
          }

          session.interrupt();
          session.generateReply({
            userInput: `[User interacted with canvas: ${JSON.stringify(message.payload)}]`,
            inputModality: "text",
          });
        }
      } catch (error) {
        logger.error({ error }, "Failed to handle data channel message");
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      clearRoomSession(roomName);
    });

    await session.start({
      agent,
      room,
    });

    await ctx.connect();

    // Prefer greeting after profile arrives; fall back if it never does.
    setTimeout(() => {
      if (!hasGreeted(roomName)) {
        logger.info("Greeting without student profile (timeout)");
        issueGreeting();
      }
    }, PROFILE_GREETING_WAIT_MS);
  },
});

const SILENT_CANVAS_ACTIONS = new Set([
  "play",
  "pause",
  "reset",
  "resume",
  "stop",
  "toggle",
]);

function isSilentCanvasControl(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const action = (payload as { action?: unknown }).action;
  if (typeof action !== "string") return false;
  return SILENT_CANVAS_ACTIONS.has(action.toLowerCase());
}

function buildQuizResultSummary(
  quiz: QuizState | null,
  quizId: string,
  answers: QuizAnswer[],
): string {
  if (!quiz || quiz.quizId !== quizId) {
    return "[The student submitted quiz answers, but the quiz is no longer available. Briefly acknowledge and offer to continue.]";
  }

  const answerByQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer.selectedOptionId]),
  );

  let correct = 0;
  const lines = quiz.questions.map((question, index) => {
    const selectedId = answerByQuestion.get(question.id);
    const selected = question.options.find((option) => option.id === selectedId);
    const correctOption = question.options.find(
      (option) => option.id === question.correctOptionId,
    );
    const isCorrect = selectedId === question.correctOptionId;
    if (isCorrect) correct += 1;

    return [
      `Q${index + 1}: ${question.prompt}`,
      `  Student answered: ${selected ? selected.text : "(no answer)"}`,
      `  Correct answer: ${correctOption?.text ?? "(unknown)"}`,
      `  Result: ${isCorrect ? "CORRECT" : "INCORRECT"}`,
    ].join("\n");
  });

  const total = quiz.questions.length;

  return [
    `[The student submitted the quiz on "${quiz.concept}" and scored ${correct}/${total}.`,
    "Give brief spoken feedback: praise what they got right, and for anything wrong, gently correct the misconception and re-explain that specific idea in one or two sentences.",
    "If they missed something, offer to render_canvas a demo or a follow-up render_quiz. Keep it encouraging and concise.]",
    "",
    "Detailed results:",
    ...lines,
  ].join("\n");
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "voice-genui-agent",
  }),
);
