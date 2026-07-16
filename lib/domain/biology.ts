import {
  buildAgentInstructions,
  buildGreetingInstructions,
  buildRenderCompleteTemplates,
  buildRenderSystemPrompt,
  buildSystemPrompt,
} from "./shared";
import type { DomainConfig } from "./types";

const renderTemplates = buildRenderCompleteTemplates("biology");

export const biologyDomain: DomainConfig = {
  id: "biology",
  labName: "Biology Lab",
  subject: "Biology",
  teacherTitle: "Biology Teacher",
  tagline: "What living system should we explore?",
  description:
    "Speak any biology concept and watch the lab viewport become an interactive 3D model or process animation with a live voice teacher.",
  openingLabel: "Opening biology lab",
  captionPlaceholder:
    "Ask about cells, genetics, or ecosystems — demos fill the full lab view.",
  audioUnlockTitle: "Tap to hear your biology teacher",
  demoBuildingLabel: "is assembling across the full lab view.",
  demoDefaultTitle: "Biology demo",

  systemPrompt: buildSystemPrompt({
    persona: "You are an enthusiastic biology teacher.",
    subject: "biology",
    teachingStyle: `- Explain concepts clearly for students (middle school through early college).
- Use accurate biological terminology but stay conversational for voice.
- Emphasize structure-function relationships and scale (molecular → organism).
- For concepts involving cells, processes, anatomy, or ecosystems — MUST call render_canvas with content_type threejs.
- Prefer one strong full-view demo; use mode patch to zoom into structures or add labels.`,
    renderTriggers: "cells, organs, processes, ecosystems",
    visualBriefExtras:
      "Specify biological structures, color coding for organelles, process steps (transcription, mitosis), and scale indicators.",
  }),

  agentInstructions: buildAgentInstructions("biology", "biology teacher"),
  greetingInstructions: buildGreetingInstructions({
    teacherRole: "biology teacher",
    subjectExamples: "biology topic",
  }),
  ...renderTemplates,

  renderSystemPrompt: buildRenderSystemPrompt({
    subject: "biology",
    accuracyNote:
      "Anatomical proportions and process sequences should be biologically plausible for the teaching level",
    sceneGuidance:
      "Use distinct colors for organelles and tissues. Animate multi-step processes (mitosis, transcription) with clear phase labels. Include scale bars or zoom cues when switching magnification.",
  }),

  renderUserPromptPrefix:
    "Render a FULL-VIEWPORT threejs biology teaching scene that fills the student's entire lab view.",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive Three.js biology demonstration. " +
    "Pass a rich visual_brief — never raw Three.js code. " +
    "Use mode replace for a new concept; mode patch to refine the current scene.",

  visualBriefDescription:
    "Detailed biology lesson spec: concept, structures/processes, color coding, labels, scale, camera framing, animation phases, play/pause/reset, and what the student should observe.",

  quizConceptDescription:
    "The biology concept being assessed (e.g. 'photosynthesis', 'DNA replication').",

  conceptSuggestions: [
    { label: "Cell structure", prompt: "Show the parts of an animal cell and what each does." },
    { label: "DNA replication", prompt: "Walk through DNA replication with an animation." },
    { label: "Photosynthesis", prompt: "Explain photosynthesis with a chloroplast demo." },
    { label: "Food webs", prompt: "Visualize a simple food web and energy flow." },
    { label: "Heart pumping", prompt: "Show how the heart pumps blood through chambers." },
    { label: "Natural selection", prompt: "Demonstrate natural selection with a population model." },
  ],
};
