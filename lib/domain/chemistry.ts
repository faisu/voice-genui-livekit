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
    "Speak any chemistry concept and watch the lab viewport become an interactive molecular or reaction demo with a live voice teacher.",
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
- For concepts involving structure, bonding, reactions, or energy — MUST call render_canvas with content_type threejs.
- Prefer one strong full-view demo; use mode patch to refine the current scene.`,
    renderTriggers: "molecules, bonds, reactions, energy",
    visualBriefExtras:
      "Specify atom colors (CPK-style), bond types, electron movement, energy diagrams, and reaction progress when relevant.",
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
      "Use spheres for atoms with CPK-like colors, cylinders or lines for bonds. Animate electron transfer or bond breaking/forming when teaching reactions. Label key species and energy states.",
  }),

  renderUserPromptPrefix:
    "Render a FULL-VIEWPORT threejs chemistry teaching scene that fills the student's entire lab view.",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive Three.js chemistry demonstration. " +
    "Pass a rich visual_brief — never raw Three.js code. " +
    "Use mode replace for a new concept; mode patch to refine the current scene.",

  visualBriefDescription:
    "Detailed chemistry lesson spec: concept, molecular/reaction setup, atom colors, bond types, energy changes, labels, camera framing, animation (bond breaking, electron flow), play/pause/reset, and what the student should observe.",

  quizConceptDescription:
    "The chemistry concept being assessed (e.g. 'covalent bonding', 'Le Chatelier's principle').",

  conceptSuggestions: [
    { label: "Water molecule", prompt: "Show the structure and polarity of a water molecule." },
    { label: "Ionic bonding", prompt: "Explain ionic bonding with an interactive demo." },
    { label: "Combustion", prompt: "Visualize a combustion reaction step by step." },
    { label: "pH scale", prompt: "Explain acids and bases with a pH visualization." },
    { label: "Electron shells", prompt: "Show how electron shells fill for different elements." },
    { label: "Catalyst effect", prompt: "Demonstrate how a catalyst lowers activation energy." },
  ],
};
