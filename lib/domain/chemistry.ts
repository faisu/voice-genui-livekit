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
- For concepts involving structure, bonding, reactions, or energy — MUST call render_canvas with stages (2–4 progressive steps).
- Prefer staged builds; use mode patch (visual_brief only) to refine the current scene.`,
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
    "Replace or patch the FULL lab viewport with an interactive chemistry demonstration. " +
    "Prefer stages[] (2–4): id, brief (visual adds), narrate (spoken AFTER appear). " +
    "Stage 1 = lab + core structure; later stages add bonds/energy/labels. " +
    "For single-shot or tiny patches, pass visual_brief instead. Never pass raw Three.js.",

  visualBriefDescription:
    "Single-shot chemistry lesson spec (when stages omitted): concept, molecular/reaction setup, atom colors, bonds, energy, labels, camera, animation, play/pause/reset, what to observe. Prefer stages[] for new lessons.",

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
