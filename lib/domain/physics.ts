import {
  buildAgentInstructions,
  buildGreetingInstructions,
  buildRenderCompleteTemplates,
  buildRenderSystemPrompt,
  buildSystemPrompt,
} from "./shared";
import type { DomainConfig } from "./types";

const renderTemplates = buildRenderCompleteTemplates("physics");

export const physicsDomain: DomainConfig = {
  id: "physics",
  labName: "Physics Lab",
  subject: "Physics",
  teacherTitle: "Physics Teacher",
  tagline: "What should we explore?",
  description:
    "Speak any physics concept and watch the full lab viewport become an interactive Three.js demo with a live voice teacher.",
  openingLabel: "Opening physics lab",
  captionPlaceholder:
    "Ask any physics question — demos appear across the full lab view.",
  audioUnlockTitle: "Tap to hear your physics teacher",
  demoBuildingLabel: "is assembling across the full lab view.",
  demoDefaultTitle: "Physics demo",

  systemPrompt: buildSystemPrompt({
    persona: "You are an enthusiastic physics teacher.",
    subject: "physics",
    teachingStyle: `- Explain concepts clearly for students (high school through early college).
- Use vivid, accurate physics language but stay conversational for voice.
- Build intuition first, then light equations, then invite interaction with the demo.
- For almost every concept that involves motion, forces, fields, or geometry — MUST call render_canvas with content_type threejs.
- Prefer one strong full-view demo; use mode patch to refine the current scene instead of spawning many demos.`,
    renderTriggers: "motion, forces, fields, geometry",
    visualBriefExtras:
      "Specify parameters with units (mass, g, angle, velocity, k, wavelength…). Draw velocity/force vectors as colored arrows.",
  }),

  agentInstructions: buildAgentInstructions("physics", "physics teacher"),
  greetingInstructions: buildGreetingInstructions({
    teacherRole: "physics teacher",
    subjectExamples: "concept",
  }),
  ...renderTemplates,

  renderSystemPrompt: buildRenderSystemPrompt({
    subject: "physics",
    accuracyNote:
      "Physics must be visually correct (gravity down −Y, consistent units, realistic relative motion)",
    sceneGuidance:
      "Draw velocity/force vectors as colored arrows with clear meaning. Prefer MeshStandardMaterial for main bodies. Readable contrast colors (cyan/amber accents on dark backgrounds). Always include an animateCamera cinematic intro that frames the apparatus before free orbit.",
  }),

  renderUserPromptPrefix:
    "Render a FULL-VIEWPORT threejs physics teaching scene that fills the student's entire lab view.",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive Three.js physics demonstration. " +
    "Pass a rich visual_brief — never raw Three.js code. " +
    "The entire student view becomes the demo (not a floating card). " +
    "Use mode replace for a new concept; mode patch to refine the current scene. " +
    "Returns immediately while the simulation builds asynchronously.",

  visualBriefDescription:
    "Detailed physics lesson spec for a FULL-VIEWPORT Three.js scene: concept, objects, forces/vectors, parameters (mass, g, angle, velocity), labels, colors, cinematic intro camera keyframes (2–4 over 4–8s via animateCamera), animation behavior, play/pause/reset, and what the student should observe.",

  quizConceptDescription:
    "The physics concept being assessed (e.g. 'projectile motion', 'conservation of momentum').",

  conceptSuggestions: [
    { label: "Projectile motion", prompt: "Explain projectile motion with an interactive demo." },
    { label: "Simple pendulum", prompt: "Show me how a simple pendulum works." },
    { label: "Newton's laws", prompt: "Teach Newton's three laws with a clear visualization." },
    { label: "Wave interference", prompt: "Explain wave interference with an animation." },
    { label: "Orbital mechanics", prompt: "Show how planets orbit under gravity." },
    { label: "Electric fields", prompt: "Visualize electric fields around charges." },
  ],
};
