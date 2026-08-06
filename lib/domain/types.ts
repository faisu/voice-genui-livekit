export type ConceptSuggestion = {
  label: string;
  prompt: string;
};

export type DomainConfig = {
  /** Stable slug used in env vars, e.g. `physics` */
  id: string;
  /** Display name for the lab, e.g. "Physics Lab" */
  labName: string;
  /** Short subject label, e.g. "Physics" */
  subject: string;
  /** Agent persona title shown in UI, e.g. "Physics Teacher" */
  teacherTitle: string;
  /** One-line tagline on the welcome screen */
  tagline: string;
  /** HTML meta description */
  description: string;
  /** Boot / loading screen text */
  openingLabel: string;
  /** Placeholder when no caption is visible */
  captionPlaceholder: string;
  /** Audio unlock overlay headline */
  audioUnlockTitle: string;
  /** Demo building status label */
  demoBuildingLabel: string;
  /** Default demo title while rendering */
  demoDefaultTitle: string;

  /** Full LLM system prompt for the teaching agent */
  systemPrompt: string;
  /** Shorter instructions passed to voice.Agent */
  agentInstructions: string;
  /** First-turn greeting instructions */
  greetingInstructions: string;

  /** System prompt for the scene_ops render worker */
  renderSystemPrompt: string;
  /** Prefix for the render worker user prompt */
  renderUserPromptPrefix: string;
  /** Tool description for render_canvas */
  renderCanvasToolDescription: string;
  /** Zod describe text for visual_brief */
  visualBriefDescription: string;

  /** Starter prompts shown before the first demo */
  conceptSuggestions: ConceptSuggestion[];
};
