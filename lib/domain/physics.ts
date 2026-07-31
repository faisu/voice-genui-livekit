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
- For almost every concept that involves motion, forces, fields, or geometry — MUST call render_canvas with a detailed visual_brief for one interactive Three.js demo.
- Prefer Recipe Skills: projectile, simplePendulum, circularOrbit, shmSpring, inclinedPlane.
- Prefer one clear demo; use mode patch (visual_brief only) for small refinements instead of spawning many demos.`,
    renderTriggers: "motion, forces, fields, geometry",
    visualBriefExtras:
      "Specify parameters with units (mass, g, angle, velocity…). Prefer skillIds. Include play/pause/reset and at least one adjustable parameter.",
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
      "Prefer skills projectile, simplePendulum, circularOrbit, shmSpring, inclinedPlane. Use sphere/box/cylinder/arrows/trails. Cyan/amber accents on dark lab.",
  }),

  renderUserPromptPrefix:
    "Emit a Recipe Skill or scene_ops for a FULL-VIEWPORT interactive physics Three.js lab (no HTML/SVG).",

  renderCanvasToolDescription:
    "Replace or patch the FULL lab viewport with an interactive physics Three.js demo. " +
    "Pass visual_brief describing the demo (prefer Recipe Skills). " +
    "A verified summary is returned when the demo is live.",

  visualBriefDescription:
    "Physics lesson brief: concept, preferred skillId if known, objects, forces/vectors, parameters (mass, g, angle, velocity), motion, play/pause/reset + slider, what to observe.",

  conceptSuggestions: [
    { label: "Projectile motion", prompt: "Explain projectile motion with an interactive demo." },
    { label: "Simple pendulum", prompt: "Show me how a simple pendulum works." },
    { label: "SHM spring", prompt: "Teach simple harmonic motion with a spring and mass." },
    { label: "Inclined plane", prompt: "Show a block on an inclined plane." },
    { label: "Orbital mechanics", prompt: "Show how planets orbit under gravity." },
    { label: "Newton's laws", prompt: "Teach Newton's three laws with a clear visualization." },
  ],
};
