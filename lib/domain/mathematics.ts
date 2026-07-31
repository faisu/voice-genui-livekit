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
    "Speak any math concept and watch the viewport become an interactive Three.js graph, geometry demo, or dynamic plot with a live voice teacher.",
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
- For concepts involving graphs, geometry, transformations, or rates of change — MUST call render_canvas with a detailed visual_brief for one interactive Three.js demo.
- Prefer one clear demo; use mode patch (visual_brief only) to refine parameters.`,
    renderTriggers: "graphs, geometry, transformations, calculus",
    visualBriefExtras:
      "Specify axes ranges, function expressions, key points, tangent lines, areas under curves, geometric constructions, and interactive parameter sliders.",
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
      "Use line/box primitives for axes and markers. Prefer oscillate for animated plots. Bind key values to overlay sliders/readouts. Prefer clear 3D constructions via scene_ops.",
  }),

  renderUserPromptPrefix:
    "Emit a Recipe Skill or scene_ops for a FULL-VIEWPORT interactive mathematics Three.js lab (no HTML/SVG).",

  renderCanvasToolDescription:
    "Replace or patch the FULL viewport with an interactive math Three.js visualization. " +
    "Pass visual_brief describing the full interactive demo. A verified summary is returned when live.",

  visualBriefDescription:
    "Math lesson spec for Three.js lab: concept, functions/geometry, axes ranges, parameters, labels, colors, motion, play/pause/reset + sliders, what to observe.",

  conceptSuggestions: [
    { label: "Sine & cosine", prompt: "Show how sine and cosine relate on the unit circle." },
    { label: "Parabola", prompt: "Visualize how changing a, b, c affects a parabola." },
    { label: "Derivative", prompt: "Explain the derivative as a tangent slope with a live graph." },
    { label: "Pythagorean theorem", prompt: "Prove the Pythagorean theorem with a visual demo." },
    { label: "Contour plots", prompt: "Show a contour plot for z = x² + y² and explain level sets." },
    { label: "Vector addition", prompt: "Show vector addition and the parallelogram rule." },
  ],
};
