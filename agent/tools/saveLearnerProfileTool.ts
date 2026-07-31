import { llm } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import type { AgeBand, LearnerProfile } from "../../lib/types.js";
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

export const saveLearnerProfileRequestSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .describe("Student's preferred first name or nickname for address."),
  age_band: ageBandSchema.describe(
    "Student age band mapped from their free-form reply: under_13 | 13_15 | 16_18 | 18_22 | 23_plus",
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
    name: request.name.trim(),
    ageBand: request.age_band as AgeBand,
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
      "Save the student's learner profile after collecting their name and age " +
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
        name: profile.name,
        age_band: profile.ageBand,
        topics: profile.topics,
        message:
          `Profile saved. Briefly greet ${profile.name} by name, confirm you're ready, ` +
          "then invite them to speak any concept for a full-viewport demo. " +
          "Match explanation depth to their age band from now on. Do not re-ask name or age.",
      });
    },
  });
}
