import { llm } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import { resolveDomain } from "../../lib/domain/index.js";
import type { QuizQuestion, QuizSpec } from "../../lib/types.js";
import { setQuizState } from "../session.js";
import { publishQuizRender } from "./renderCanvas.js";

export const renderQuizRequestSchema = z.object({
  concept: z
    .string()
    .describe(
      "The physics concept being assessed (e.g. 'projectile motion', 'conservation of momentum').",
    ),
  title: z
    .string()
    .optional()
    .describe("Short student-facing quiz title, e.g. 'Quick check: projectile motion'."),
  questions: z
    .array(
      z.object({
        prompt: z.string().describe("The question text shown to the student."),
        options: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe("Answer choices in display order (2-5)."),
        correct_index: z
          .number()
          .int()
          .min(0)
          .describe("0-based index into options for the correct answer."),
        explanation: z
          .string()
          .optional()
          .describe("Brief reason the correct answer is right (shown after answering)."),
      }),
    )
    .min(1)
    .max(5)
    .describe("Between 1 and 5 multiple-choice questions checking understanding."),
});

export type RenderQuizRequest = z.infer<typeof renderQuizRequestSchema>;

const OPTION_IDS = ["a", "b", "c", "d", "e"];

function normalizeQuiz(request: RenderQuizRequest): QuizSpec {
  const quizId = `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const questions: QuizQuestion[] = request.questions.map((question, qIndex) => {
    const options = question.options.map((text, oIndex) => ({
      id: OPTION_IDS[oIndex] ?? `o${oIndex}`,
      text,
    }));
    const clampedCorrect = Math.min(
      Math.max(question.correct_index, 0),
      options.length - 1,
    );

    return {
      id: `q${qIndex + 1}`,
      prompt: question.prompt,
      options,
      correctOptionId: options[clampedCorrect]!.id,
      explanation: question.explanation,
    };
  });

  return {
    quizId,
    concept: request.concept,
    title: request.title,
    questions,
  };
}

export function createRenderQuizTool(room: Room, roomName: string) {
  const domain = resolveDomain();

  const parameters = renderQuizRequestSchema.extend({
    concept: z.string().describe(domain.quizConceptDescription),
  });

  return llm.tool({
    description:
      "Display an interactive multiple-choice quiz on the student's screen to check their " +
      "understanding of the concept you just taught. Provide 1-5 questions, each with 2-5 answer " +
      "options and the index of the correct one. The quiz appears immediately; the student answers " +
      "on screen and their results are sent back to you so you can give feedback and reteach any " +
      "misconceptions. Do not read the questions or reveal answers aloud — just invite them to answer.",
    parameters,
    onDuplicate: "reject",
    execute: async (input) => {
      const quiz = normalizeQuiz(input);
      setQuizState(roomName, { ...quiz, updatedAt: Date.now() });
      await publishQuizRender(room, quiz);

      return JSON.stringify({
        status: "quiz_displayed",
        quiz_id: quiz.quizId,
        question_count: quiz.questions.length,
        message:
          "The quiz is now on the student's screen. Briefly invite them to answer on screen. " +
          "Do NOT reveal the answers. Wait for their submitted results before giving feedback.",
      });
    },
  });
}
