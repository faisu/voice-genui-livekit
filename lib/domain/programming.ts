import {
  buildAgentInstructions,
  buildGreetingInstructions,
  buildRenderCompleteTemplates,
  buildRenderSystemPrompt,
  buildSystemPrompt,
} from "./shared";
import type { DomainConfig } from "./types";

const renderTemplates = buildRenderCompleteTemplates("programming");

export const programmingDomain: DomainConfig = {
  id: "programming",
  labName: "Code Lab",
  subject: "Programming",
  teacherTitle: "Programming Mentor",
  tagline: "What concept should we build?",
  description:
    "Speak any programming concept and watch the viewport become an interactive algorithm visualization or system diagram with a live voice mentor.",
  openingLabel: "Opening code lab",
  captionPlaceholder:
    "Ask about algorithms, data structures, or systems — visualizations fill the full view.",
  audioUnlockTitle: "Tap to hear your programming mentor",
  demoBuildingLabel: "is assembling across the full view.",
  demoDefaultTitle: "Code visualization",

  systemPrompt: buildSystemPrompt({
    persona: "You are an enthusiastic programming mentor.",
    subject: "programming",
    teachingStyle: `- Explain concepts clearly for learners (beginner through intermediate).
- Connect code abstractions to visual models (memory, pointers, trees, flows).
- Use precise but accessible language; avoid jargon without explanation.
- For concepts involving algorithms, data structures, or system behavior — MUST call render_canvas with content_type threejs.
- Prefer one strong full-view demo; use mode patch to step through states or change inputs.`,
    renderTriggers: "algorithms, data structures, memory, networks",
    visualBriefExtras:
      "Specify data elements as 3D nodes/blocks, highlight active steps, show pointers/arrows, and include step counters or complexity readouts.",
  }),

  agentInstructions: buildAgentInstructions("programming", "programming mentor"),
  greetingInstructions: buildGreetingInstructions({
    teacherRole: "programming mentor",
    subjectExamples: "programming concept",
  }),
  ...renderTemplates,

  renderSystemPrompt: buildRenderSystemPrompt({
    subject: "programming",
    accuracyNote:
      "Algorithm steps and data structure layouts must match the described logic",
    sceneGuidance:
      "Use colored blocks for array elements, linked nodes for lists/trees, and arrows for pointers. Animate swaps, traversals, and state transitions step-by-step. Include a step counter and current-operation label.",
  }),

  renderUserPromptPrefix:
    "Render a FULL-VIEWPORT threejs programming teaching scene that fills the student's entire view.",

  renderCanvasToolDescription:
    "Replace or patch the FULL viewport with an interactive Three.js programming visualization. " +
    "Pass a rich visual_brief — never raw Three.js code. " +
    "Use mode replace for a new concept; mode patch to refine the current scene.",

  visualBriefDescription:
    "Detailed programming lesson spec: concept, data structure layout, algorithm steps, highlights, labels, colors, camera framing, step-by-step animation, play/pause/reset, and what the learner should observe.",

  quizConceptDescription:
    "The programming concept being assessed (e.g. 'binary search', 'recursion base case').",

  conceptSuggestions: [
    { label: "Binary search", prompt: "Visualize binary search on a sorted array." },
    { label: "Linked lists", prompt: "Show how a linked list stores and traverses nodes." },
    { label: "Recursion", prompt: "Explain recursion with a call-stack visualization." },
    { label: "Sorting", prompt: "Compare bubble sort and quicksort side by side." },
    { label: "Hash tables", prompt: "Show how hash tables map keys to buckets." },
    { label: "REST API flow", prompt: "Visualize a client-server request-response flow." },
  ],
};
