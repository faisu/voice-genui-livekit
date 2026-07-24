import type { AgeBand, LearnerProfile, PronounChoice } from "./types";

export const LEARNER_PROFILE_STORAGE_KEY = "voice-genui-learner-profile";

export const AGE_BAND_OPTIONS: { value: AgeBand; label: string }[] = [
  { value: "under_13", label: "Under 13" },
  { value: "13_15", label: "13–15" },
  { value: "16_18", label: "16–18" },
  { value: "18_22", label: "18–22" },
  { value: "23_plus", label: "23+" },
];

export const PRONOUN_OPTIONS: { value: PronounChoice; label: string }[] = [
  { value: "he_him", label: "He/Him" },
  { value: "she_her", label: "She/Her" },
  { value: "they_them", label: "They/Them" },
  { value: "prefer_not", label: "Prefer not to say" },
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
  const ageOk = AGE_BAND_OPTIONS.some((option) => option.value === value.ageBand);
  const pronounsOk = PRONOUN_OPTIONS.some(
    (option) => option.value === value.pronouns,
  );
  const topicsOk = Array.isArray(value.topics);
  return ageOk && pronounsOk && topicsOk;
}

/** Human-readable block injected into agent instructions. */
export function formatLearnerProfileForAgent(profile: LearnerProfile): string {
  const ageLabel =
    AGE_BAND_OPTIONS.find((option) => option.value === profile.ageBand)?.label ??
    profile.ageBand;
  const pronounLabel =
    PRONOUN_OPTIONS.find((option) => option.value === profile.pronouns)?.label ??
    profile.pronouns;

  const topics = [...profile.topics];
  if (profile.otherTopic?.trim()) {
    topics.push(profile.otherTopic.trim());
  }

  const depthGuidance = ageDepthGuidance(profile.ageBand);
  const addressGuidance =
    profile.pronouns === "prefer_not"
      ? "Use gender-neutral language. Do not use gendered pronouns for the student."
      : `Address the student using ${pronounLabel} pronouns only for address — do not change lesson metaphors or content based on gender.`;

  return [
    "student_profile:",
    `- Age band: ${ageLabel}`,
    `- Pronouns: ${pronounLabel}`,
    `- Topics of interest: ${topics.length > 0 ? topics.join(", ") : "(none specified)"}`,
    "",
    "Personalization rules:",
    `- ${addressGuidance}`,
    `- ${depthGuidance}`,
    topics.length > 0
      ? `- When suggesting what to explore next, prefer their topics of interest (${topics.join(", ")}).`
      : "- Offer a few engaging starter concepts when they are unsure what to explore.",
  ].join("\n");
}

function ageDepthGuidance(ageBand: AgeBand): string {
  switch (ageBand) {
    case "under_13":
      return "Explain at a middle-school level: short sentences, concrete examples, minimal equations.";
    case "13_15":
      return "Explain at an early high-school level: build intuition first, introduce light equations carefully.";
    case "16_18":
      return "Explain at a late high-school level: intuition plus clear equations and units.";
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
