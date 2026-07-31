import { llm } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import type { AgeBand, LearnerProfile, PronounChoice } from "../../lib/types.js";
import { isValidLearnerProfile } from "../../lib/learnerProfile.js";
import { setLearnerProfile } from "../session.js";
import { publishLearnerProfile } from "./renderCanvas.js";

const ageBandSchema = z.enum([
  "under_13",
  "13_15",
  "16_18",
  "18_22",
  "23_plus",
]);

const pronounSchema = z.enum([
  "he_him",
  "she_her",
  "they_them",
  "prefer_not",
]);

export const saveLearnerProfileRequestSchema = z.object({
  age_band: ageBandSchema.describe(
    "Student age band: under_13 | 13_15 | 16_18 | 18_22 | 23_plus",
  ),
  pronouns: pronounSchema.describe(
    "How to address the student: he_him | she_her | they_them | prefer_not",
  ),
  topics: z
    .array(z.string())
    .max(6)
    .optional()
    .describe("Optional list of topics they mentioned wanting to explore."),
  other_topic: z
    .string()
    .optional()
    .describe(
      "Optional free-text topic if they named something outside a short list.",
    ),
});

export type SaveLearnerProfileRequest = z.infer<
  typeof saveLearnerProfileRequestSchema
>;

function toLearnerProfile(request: SaveLearnerProfileRequest): LearnerProfile {
  const profile: LearnerProfile = {
    ageBand: request.age_band as AgeBand,
    pronouns: request.pronouns as PronounChoice,
    topics: (request.topics ?? []).map((topic) => topic.trim()).filter(Boolean),
    otherTopic: request.other_topic?.trim() || undefined,
  };
  if (!isValidLearnerProfile(profile)) {
    throw new Error("Invalid learner profile from tool args");
  }
  return profile;
}

export function createSaveLearnerProfileTool(
  room: Room,
  roomName: string,
  onSaved?: () => void | Promise<void>,
) {
  return llm.tool({
    description:
      "Save the student's learner profile after collecting age band and pronouns " +
      "(and optional topics) by voice. Call once when onboarding answers are clear. " +
      "Do not ask them to use on-screen forms or buttons.",
    parameters: saveLearnerProfileRequestSchema,
    onDuplicate: "reject",
    execute: async (input) => {
      const profile = toLearnerProfile(input);
      setLearnerProfile(roomName, profile);
      await publishLearnerProfile(room, profile);
      await onSaved?.();

      return JSON.stringify({
        status: "profile_saved",
        age_band: profile.ageBand,
        pronouns: profile.pronouns,
        topics: profile.topics,
        message:
          "Profile saved. Briefly confirm you're ready, then invite them to speak any " +
          "concept for a full-viewport demo. Do not re-ask age or pronouns.",
      });
    },
  });
}
