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
    "Speak any biology concept and watch the lab viewport become an interactive Three.js diagram or process animation with a live voice teacher.",
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
- For concepts involving cells, processes, anatomy, or ecosystems — MUST call render_canvas with a detailed visual_brief for one interactive Three.js demo.
- Prefer one clear demo; use mode patch (visual_brief only) to zoom into structures or add labels.`,
    renderTriggers: "cells, organs, processes, ecosystems",
    visualBriefExtras:
      "Specify biological structures, color coding for organelles, process steps (transcription, mitosis), scale indicators, and interactive step controls.",
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
      "Use distinct materialPreset colors for organelles and tissues. Prefer orbit/oscillate for multi-step processes. Prefer clear schematic Three.js demos.",
  }),

  renderUserPromptPrefix:
    "Emit a Recipe Skill or scene_ops for a FULL-VIEWPORT interactive biology Three.js lab (no HTML/SVG).",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive biology Three.js demo. " +
    "Pass visual_brief describing the full interactive demo. A verified summary is returned when live.",

  visualBriefDescription:
    "Biology lesson spec for Three.js lab: concept, structures/processes, color coding, labels, scale, motion phases, play/pause/reset, what to observe.",

  conceptSuggestions: [
    { label: "Cell structure", prompt: "Show the parts of an animal cell and what each does." },
    { label: "DNA replication", prompt: "Walk through DNA replication with an animation." },
    { label: "Photosynthesis", prompt: "Explain photosynthesis with a chloroplast demo." },
    { label: "Food webs", prompt: "Visualize a simple food web and energy flow." },
    { label: "Heart pumping", prompt: "Show how the heart pumps blood through chambers." },
    { label: "Natural selection", prompt: "Demonstrate natural selection with a population model." },
  ],
};
