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
    "Speak any programming concept and watch the viewport become an interactive Three.js algorithm visualization or system diagram with a live voice mentor.",
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
- For concepts involving algorithms, data structures, or system behavior — MUST call render_canvas with a detailed visual_brief for one interactive Three.js demo.
- Prefer one clear demo; use mode patch (visual_brief only) to step through states or change inputs.`,
    renderTriggers: "algorithms, data structures, memory, networks",
    visualBriefExtras:
      "Specify data elements as 3D nodes/blocks, highlight active steps, show pointers/arrows, include step counters and play/step controls.",
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
      "Use colored box/sphere blocks for array elements and nodes; arrows for pointers. Prefer oscillate for swaps and traversals. Prefer clear Three.js algorithm demos.",
  }),

  renderUserPromptPrefix:
    "Emit a Recipe Skill or scene_ops for a FULL-VIEWPORT interactive programming Three.js lab (no HTML/SVG).",

  renderCanvasToolDescription:
    "Replace or patch the FULL viewport with an interactive programming Three.js visualization. " +
    "Pass visual_brief describing the full interactive demo. A verified summary is returned when live.",

  visualBriefDescription:
    "Programming lesson spec for Three.js lab: concept, data structure layout, algorithm steps, highlights, labels, colors, step motion, play/pause/reset, what to observe.",

  conceptSuggestions: [
    { label: "Binary search", prompt: "Visualize binary search on a sorted array." },
    { label: "Linked lists", prompt: "Show how a linked list stores and traverses nodes." },
    { label: "Recursion", prompt: "Explain recursion with a call-stack visualization." },
    { label: "Sorting", prompt: "Compare bubble sort and quicksort side by side." },
    { label: "Hash tables", prompt: "Show how hash tables map keys to buckets." },
    { label: "REST API flow", prompt: "Visualize a client-server request-response flow." },
  ],
};
