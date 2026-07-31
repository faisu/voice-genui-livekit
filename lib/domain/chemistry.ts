import {
  buildAgentInstructions,
  buildGreetingInstructions,
  buildRenderCompleteTemplates,
  buildRenderSystemPrompt,
  buildSystemPrompt,
} from "./shared";
import type { DomainConfig } from "./types";

const renderTemplates = buildRenderCompleteTemplates("chemistry");

export const chemistryDomain: DomainConfig = {
  id: "chemistry",
  labName: "Chemistry Lab",
  subject: "Chemistry",
  teacherTitle: "Chemistry Teacher",
  tagline: "What reaction should we explore?",
  description:
    "Speak any chemistry concept and watch the lab viewport become an interactive Three.js molecular or reaction diagram with a live voice teacher.",
  openingLabel: "Opening chemistry lab",
  captionPlaceholder:
    "Ask about bonds, reactions, or molecules — demos fill the full lab view.",
  audioUnlockTitle: "Tap to hear your chemistry teacher",
  demoBuildingLabel: "is assembling across the full lab view.",
  demoDefaultTitle: "Chemistry demo",

  systemPrompt: buildSystemPrompt({
    persona: "You are an enthusiastic chemistry teacher.",
    subject: "chemistry",
    teachingStyle: `- Explain concepts clearly for students (high school through early college).
- Use accurate chemical language but stay conversational for voice.
- Build intuition with particle-level visuals before formal notation.
- For concepts involving structure, bonding, reactions, or energy — MUST call render_canvas with a detailed visual_brief for one interactive Three.js demo.
- Prefer one clear demo; use mode patch (visual_brief only) to refine the current scene.`,
    renderTriggers: "molecules, bonds, reactions, energy",
    visualBriefExtras:
      "Specify atom colors (CPK-style), bond types, electron movement, energy diagrams, reaction progress, and interactive controls when relevant.",
  }),

  agentInstructions: buildAgentInstructions("chemistry", "chemistry teacher"),
  greetingInstructions: buildGreetingInstructions({
    teacherRole: "chemistry teacher",
    subjectExamples: "chemistry topic",
  }),
  ...renderTemplates,

  renderSystemPrompt: buildRenderSystemPrompt({
    subject: "chemistry",
    accuracyNote:
      "Represent molecular geometry and reaction energetics plausibly; use consistent atom colors and bond conventions",
    sceneGuidance:
      "Use spheres for atoms (CPK materialPreset: cpkCarbon/cpkOxygen/…) and cylinders/lines for bonds. Prefer orbit/oscillate motions. Prefer clear ball-and-stick Three.js demos.",
  }),

  renderUserPromptPrefix:
    "Emit a Recipe Skill or scene_ops for a FULL-VIEWPORT interactive chemistry Three.js lab (no HTML/SVG).",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive chemistry Three.js demo. " +
    "Pass visual_brief describing the full interactive demo. A verified summary is returned when live.",

  visualBriefDescription:
    "Chemistry lesson spec for Three.js lab: concept, molecular/reaction setup, atom colors, bonds, energy, labels, motion, play/pause/reset, what to observe.",

  conceptSuggestions: [
    { label: "Water molecule", prompt: "Show the structure and polarity of a water molecule." },
    { label: "Ionic bonding", prompt: "Explain ionic bonding with an interactive demo." },
    { label: "Combustion", prompt: "Visualize a combustion reaction step by step." },
    { label: "pH scale", prompt: "Explain acids and bases with a pH visualization." },
    { label: "Electron shells", prompt: "Show how electron shells fill for different elements." },
    { label: "Catalyst effect", prompt: "Demonstrate how a catalyst lowers activation energy." },
  ],
};
