/** Grounded summary returned to the teaching agent after a successful build. */
export type DemoSummary = {
  title: string;
  observe: string;
  renderer: "three";
  elements: Array<{ id: string; type: string; label?: string }>;
  params: Array<{
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    unit?: string;
  }>;
  motions: Array<{ type: string; targetId: string }>;
  controls: string[];
};

/** Payload from the render model's emit_scene tool. */
export type EmitScenePayload = {
  title?: string;
  observe?: string;
  elements?: DemoSummary["elements"];
  params?: DemoSummary["params"];
  controls?: string[];
  ops: import("../sceneOps").SceneOpsDocument;
};
