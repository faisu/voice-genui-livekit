import {
  buildAgentInstructions,
  buildGreetingInstructions,
  buildRenderCompleteTemplates,
  buildRenderSystemPrompt,
  buildSystemPrompt,
} from "./shared";
import type { DomainConfig } from "./types";

const renderTemplates = buildRenderCompleteTemplates("mathematics");

export const mathematicsDomain: DomainConfig = {
  id: "mathematics",
  labName: "Math Studio",
  subject: "Mathematics",
  teacherTitle: "Math Teacher",
  tagline: "What should we visualize?",
  description:
    "Speak any math concept and watch the viewport become an interactive 3D graph, geometry demo, or dynamic plot with a live voice teacher.",
  openingLabel: "Opening math studio",
  captionPlaceholder:
    "Ask about functions, geometry, or calculus — visualizations fill the full view.",
  audioUnlockTitle: "Tap to hear your math teacher",
  demoBuildingLabel: "is assembling across the full view.",
  demoDefaultTitle: "Math visualization",

  systemPrompt: buildSystemPrompt({
    persona: "You are an enthusiastic mathematics teacher.",
    subject: "mathematics",
    teachingStyle: `- Explain concepts clearly for students (middle school through early college).
- Connect symbols to visual intuition before heavy algebra.
- Use precise mathematical language but stay conversational for voice.
- For concepts involving graphs, geometry, transformations, or rates of change — MUST call render_canvas with stages (2–4 progressive steps).
- Prefer staged builds; use mode patch (visual_brief only) to refine parameters.`,
    renderTriggers: "graphs, geometry, transformations, calculus",
    visualBriefExtras:
      "Specify axes ranges, function expressions, key points, tangent lines, areas under curves, and geometric constructions.",
  }),

  agentInstructions: buildAgentInstructions("mathematics", "math teacher"),
  greetingInstructions: buildGreetingInstructions({
    teacherRole: "math teacher",
    subjectExamples: "math concept",
  }),
  ...renderTemplates,

  renderSystemPrompt: buildRenderSystemPrompt({
    subject: "mathematics",
    accuracyNote:
      "Plots and geometric constructions must be mathematically correct for the stated parameters",
    sceneGuidance:
      "Draw clear axes with labels. Use distinct colors for curves, tangents, and regions. Animate parameter changes smoothly. Include readouts for key values (slope, area, angle).",
  }),

  renderUserPromptPrefix:
    "Render a FULL-VIEWPORT threejs mathematics teaching scene that fills the student's entire view.",

  renderCanvasToolDescription:
    "Replace or patch the FULL viewport with an interactive math visualization. " +
    "Prefer stages[] (2–4): id, brief (visual adds), narrate (spoken AFTER appear). " +
    "Stage 1 = axes/core figure; later stages add overlays, sweeps, labels. " +
    "For single-shot or tiny patches, pass visual_brief instead. Never pass raw Three.js.",

  visualBriefDescription:
    "Single-shot math lesson spec (when stages omitted): concept, functions/geometry, axes ranges, parameters, labels, colors, camera, animation, play/pause/reset, what to observe. Prefer stages[] for new lessons.",

  quizConceptDescription:
    "The math concept being assessed (e.g. 'derivative as slope', 'Pythagorean theorem').",

  conceptSuggestions: [
    { label: "Sine & cosine", prompt: "Show how sine and cosine relate on the unit circle." },
    { label: "Parabola", prompt: "Visualize how changing a, b, c affects a parabola." },
    { label: "Derivative", prompt: "Explain the derivative as a tangent slope with a live graph." },
    { label: "Pythagorean theorem", prompt: "Prove the Pythagorean theorem with a visual demo." },
    { label: "3D surfaces", prompt: "Plot a 3D surface like z = x² + y² and explain its shape." },
    { label: "Vector addition", prompt: "Show vector addition and the parallelogram rule in 3D." },
  ],
};
