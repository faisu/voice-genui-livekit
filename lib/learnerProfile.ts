import type { AgeBand, LearnerProfile } from "./types";

export const LEARNER_PROFILE_STORAGE_KEY = "voice-genui-learner-profile";

export const AGE_BAND_OPTIONS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_15", label: "13–15" },
  { value: "16_18", label: "16–18" },
  { value: "18_22", label: "18–22" },
  { value: "23_plus", label: "23+" },
];

export function loadLearnerProfile(): LearnerProfile | null {
  try {
    const raw = sessionStorage.getItem(LEARNER_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LearnerProfile>;
    if (!isValidLearnerProfile(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLearnerProfile(profile: LearnerProfile): void {
  try {
    sessionStorage.setItem(LEARNER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // sessionStorage may be unavailable
  }
}

export function isValidLearnerProfile(
  value: Partial<LearnerProfile> | null | undefined,
): value is LearnerProfile {
  if (!value) return false;
  const nameOk =
    typeof value.name === "string" && value.name.trim().length >= 1;
  const ageOk = AGE_BAND_OPTIONS.some((option) => option.value === value.ageBand);
  const topicsOk = Array.isArray(value.topics);
  return nameOk && ageOk && topicsOk;
}

/** Human-readable block injected into agent instructions. */
export function formatLearnerProfileForAgent(profile: LearnerProfile): string {
  const ageLabel =
    AGE_BAND_OPTIONS.find((option) => option.value === profile.ageBand)?.label ??
    profile.ageBand;

  const topics = [...profile.topics];
  if (profile.otherTopic?.trim()) {
    topics.push(profile.otherTopic.trim());
  }

  const name = profile.name.trim();
  const depthGuidance = ageDepthGuidance(profile.ageBand);
  const recommendGuidance = ageRecommendationGuidance(profile.ageBand);

  return [
    "student_profile:",
    `- Name: ${name}`,
    `- Age band: ${ageLabel}`,
    `- Topics of interest: ${topics.length > 0 ? topics.join(", ") : "(none specified)"}`,
    "",
    "Personalization rules (required):",
    `- Address the student by name ("${name}") naturally in speech — not every sentence, but regularly.`,
    `- ${depthGuidance}`,
    `- ${recommendGuidance}`,
    topics.length > 0
      ? `- When suggesting what to explore next, prefer their topics of interest (${topics.join(", ")}), framed for their age.`
      : "- When they are unsure what to explore, offer 2–3 age-appropriate starter concepts.",
  ].join("\n");
}

function ageDepthGuidance(ageBand: AgeBand): string {
  switch (ageBand) {
    case "under_13":
      return "Explain at a middle-school level: short sentences, concrete everyday examples, almost no equations; celebrate curiosity.";
    case "13_15":
      return "Explain at an early high-school level: build intuition first, introduce light equations carefully with units.";
    case "16_18":
      return "Explain at a late high-school level: intuition plus clear equations and units; connect to exam-style reasoning when helpful.";
    case "18_22":
      return "Explain at an early-college level: accurate vocabulary, equations when useful, still conversational for voice.";
    case "23_plus":
      return "Explain for an adult learner: concise and precise, skip fluff, equations welcome when they clarify.";
    default: {
      const _exhaustive: never = ageBand;
      return _exhaustive;
    }
  }
}

function ageRecommendationGuidance(ageBand: AgeBand): string {
  switch (ageBand) {
    case "under_13":
      return "Recommend playful, visual, everyday-phenomena topics (bouncy balls, rainbows, magnets) over abstract formalism.";
    case "13_15":
      return "Recommend approachable core topics with one clear demo (projectile motion, cells, simple graphs) before advanced side quests.";
    case "16_18":
      return "Recommend solid high-school + early AP/IB style topics; ok to suggest slightly deeper follow-ups after a successful demo.";
    case "18_22":
      return "Recommend college-intro topics and connections across subjects; invite them to pick depth.";
    case "23_plus":
      return "Recommend practical, real-world, or career-adjacent angles; respect that they may want a fast precise answer.";
    default: {
      const _exhaustive: never = ageBand;
      return _exhaustive;
    }
  }
}
