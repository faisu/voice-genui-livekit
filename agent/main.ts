import {
  AgentSession,
  AgentSessionEventTypes,
  CloseReason,
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
import { resolveLlmModel, resolveLlmProvider } from "../lib/ai/index.js";
import { resolveDomain } from "../lib/domain/index.js";
import { buildOnboardingGreetingInstructions } from "../lib/domain/shared.js";
import {
  createCanvasAgent,
  createVoiceSession,
  prewarmAgent,
  type AgentProcessUserData,
} from "./pipeline.js";
import {
  clearRoomSession,
  getLearnerProfile,
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

/** Wait briefly for a returning student's saved profile before greeting. */
const PROFILE_GREETING_WAIT_MS = 2500;

export default defineAgent<AgentProcessUserData>({
  prewarm: prewarmAgent,
  entry: async (ctx) => {
    const logger = log();
    const room = ctx.room;
    const roomName = ctx.job.room?.name ?? room.name ?? "default-room";

    logger.info(
      {
        roomName,
        voiceProvider: resolveLlmProvider(),
        voiceModel: resolveLlmModel("chat"),
        canvasProvider: resolveLlmProvider(),
        canvasModel: resolveLlmModel("render"),
      },
      "Agent joining room",
    );

    let session = createVoiceSession();
    const agent = createCanvasAgent(room, roomName);
    let shuttingDown = false;
    let sessionAlive = false;
    let restarting = false;

    const wireSessionEvents = (active: AgentSession) => {
      active.on(AgentSessionEventTypes.UserInputTranscribed, (event) => {
        void publishUserTranscript(room, event.transcript, event.isFinal);
      });

      active.on(AgentSessionEventTypes.ConversationItemAdded, (event) => {
        if (event.item.type !== "message") return;
        if (event.item.role !== "assistant") return;
        const text = event.item.textContent;
        if (text) void publishAssistantText(room, text);
      });

      active.on(AgentSessionEventTypes.Close, (event) => {
        sessionAlive = false;
        if (shuttingDown || restarting) return;
        if (
          event.reason === CloseReason.ERROR &&
          room.remoteParticipants.size > 0
        ) {
          logger.warn(
            { reason: event.reason, error: event.error },
            "Voice session closed unexpectedly; restarting so text/canvas still work",
          );
          void restartSession();
        }
      });
    };

    const restartSession = async () => {
      if (shuttingDown || restarting) return;
      restarting = true;
      sessionAlive = false;
      try {
        try {
          await session.close();
        } catch {
          // already closed
        }
        // RoomSessionTransport should unregister this, but a raced close can leave it set.
        try {
          room.unregisterByteStreamHandler("lk.agent.session");
        } catch {
          // already cleared
        }
        await new Promise((resolve) => setTimeout(resolve, 150));

        session = createVoiceSession();
        wireSessionEvents(session);
        await session.start({ agent, room });
        sessionAlive = true;
        logger.info("Voice session restarted");
      } catch (error) {
        logger.error({ error }, "Failed to restart voice session");
        sessionAlive = false;
      } finally {
        restarting = false;
      }
    };

    const runUserReply = async (opts: {
      userInput: string;
      inputModality?: "text";
      instructions?: string;
    }) => {
      if (shuttingDown) return;
      if (!sessionAlive) {
        await restartSession();
      }
      if (!sessionAlive) {
        logger.error("Cannot generate reply — session is not running");
        return;
      }
      try {
        session.interrupt();
      } catch {
        // session may already be idle
      }
      try {
        session.generateReply(opts);
      } catch (error) {
        logger.error(
          { error },
          "generateReply failed; attempting session restart",
        );
        await restartSession();
        if (!sessionAlive) return;
        try {
          session.generateReply(opts);
        } catch (retryError) {
          logger.error(
            { error: retryError },
            "generateReply failed after restart",
          );
        }
      }
    };

    const shutdownGracefully = async (reason: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ roomName, reason }, "Shutting down agent job");
      try {
        session.interrupt();
      } catch {
        // ignore
      }
      try {
        await session.close();
      } catch (error) {
        logger.warn({ error }, "session.close failed during shutdown");
      }
      clearRoomSession(roomName);
      try {
        ctx.shutdown(reason);
      } catch (error) {
        logger.warn({ error }, "ctx.shutdown failed");
      }
    };

    ctx.addShutdownCallback(async () => {
      clearRoomSession(roomName);
      try {
        await session.close();
      } catch {
        // already closed
      }
    });

    wireSessionEvents(session);

    const issueGreeting = () => {
      if (hasGreeted(roomName) || shuttingDown) return;
      markGreeted(roomName);
      const domain = resolveDomain();
      const profile = getLearnerProfile(roomName);
      const instructions = profile
        ? domain.greetingInstructions
        : buildOnboardingGreetingInstructions({
            teacherRole: domain.teacherTitle.toLowerCase(),
            subjectExamples: "concept",
            topicExamples: domain.conceptSuggestions
              .slice(0, 3)
              .map((item) => item.label)
              .join(", "),
          });
      logger.info(
        { hasProfile: Boolean(profile), mode: profile ? "returning" : "onboarding" },
        "Issuing greeting",
      );
      void runUserReply({
        userInput: "Hello",
        instructions,
      });
    };

    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      if (topic !== CANVAS_DATA_TOPIC) return;
      if (shuttingDown) return;

      try {
        const message = JSON.parse(
          new TextDecoder().decode(payload),
        ) as CanvasEventMessage;

        if (message.type === "leave_lab") {
          logger.info({ reason: message.reason }, "Received leave_lab");
          void shutdownGracefully(message.reason ?? "student left lab");
          return;
        }

        if (message.type === "student_profile") {
          logger.info({ profile: message.profile }, "Received student profile");
          setLearnerProfile(roomName, message.profile);
          void agent.refreshInstructions().then(() => {
            // Returning student with a saved profile — greet once with personalization.
            if (!hasGreeted(roomName)) {
              issueGreeting();
            }
          });
          return;
        }

        if (message.type === "text_input") {
          logger.info({ text: message.text }, "Received text input");
          void runUserReply({
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
          const summary = buildQuizResultSummary(
            quiz,
            message.quizId,
            message.answers,
          );

          void runUserReply({
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

          void runUserReply({
            userInput: `[User interacted with canvas: ${JSON.stringify(message.payload)}]`,
            inputModality: "text",
          });
        }
      } catch (error) {
        logger.error({ error }, "Failed to handle data channel message");
      }
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (shuttingDown) return;
      // Local participant is the agent; when no remotes remain, the student left.
      if (room.remoteParticipants.size === 0) {
        void shutdownGracefully("student disconnected");
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      clearRoomSession(roomName);
    });

    await session.start({
      agent,
      room,
    });
    sessionAlive = true;

    await ctx.connect();

    // Prefer greeting after profile arrives; fall back if it never does.
    setTimeout(() => {
      if (!hasGreeted(roomName) && !shuttingDown) {
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
  "slider",
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
