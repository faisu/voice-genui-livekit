import type { SceneOpsDocument } from "../../sceneOps";
import { mergeParams, paramsForSummary } from "../params";
import type { DemoSummary, RecipeParamDef, RecipeSkill } from "../types";

const PARAMS: RecipeParamDef[] = [
  {
    id: "angleDeg",
    label: "Incline angle",
    value: 25,
    min: 10,
    max: 50,
    step: 1,
    unit: "deg",
  },
  {
    id: "speed",
    label: "Slide speed",
    value: 1.2,
    min: 0.3,
    max: 3,
    step: 0.1,
    unit: "m/s",
  },
];

function buildOps(overrides?: {
  params?: Record<string, number>;
  observe?: string;
  title?: string;
}): SceneOpsDocument {
  const p = mergeParams(PARAMS, overrides?.params);
  const angle = (p.angleDeg! * Math.PI) / 180;
  const rampLen = 5;
  const origin: [number, number, number] = [
    -2.2,
    0.4 + Math.sin(angle) * 2.2,
    0,
  ];

  return {
    version: 1,
    ops: [
      { op: "ensureLab", grid: true, clearColor: 0x050508 },
      {
        op: "addObject",
        id: "ramp",
        kind: "box",
        position: [0, Math.sin(angle) * 1.2, 0],
        size: 1,
        scale: [rampLen, 0.15, 2],
        rotation: [0, 0, -angle],
        color: 0x475569,
        materialPreset: "wood",
      },
      {
        op: "addObject",
        id: "block",
        kind: "box",
        position: origin,
        size: 0.45,
        color: 0x38bdf8,
        materialPreset: "metalBall",
      },
      {
        op: "addArrow",
        id: "fg",
        origin,
        direction: [0, -1, 0],
        length: 1.4,
        color: 0xf43f5e,
        label: "weight",
      },
      {
        op: "setMotion",
        id: "block",
        type: "oscillate",
        origin,
        axis: [Math.cos(angle), -Math.sin(angle), 0],
        length: 1.8,
        speed: p.speed!,
      },
      {
        op: "setOverlay",
        title: overrides?.title ?? "Inclined plane",
        readouts: [
          `θ ${p.angleDeg!.toFixed(0)}°`,
          `speed ${p.speed!.toFixed(1)}`,
        ],
        showControls: true,
        slider: {
          id: "angleDeg",
          label: "Incline angle",
          min: 10,
          max: 50,
          value: p.angleDeg!,
          step: 1,
        },
      },
      {
        op: "focusCamera",
        position: [5, 3.5, 8],
        target: [0, 1, 0],
        duration: 0,
      },
    ],
  };
}

function buildSummary(overrides?: {
  params?: Record<string, number>;
  observe?: string;
  title?: string;
}): DemoSummary {
  const p = mergeParams(PARAMS, overrides?.params);
  return {
    title: overrides?.title ?? "Inclined plane",
    observe:
      overrides?.observe ??
      "See the block slide along the ramp; steeper angles change the motion path.",
    skillId: "inclinedPlane",
    renderer: "three",
    elements: [
      { id: "ramp", type: "box", label: "ramp" },
      { id: "block", type: "box", label: "block" },
      { id: "fg", type: "arrow", label: "weight" },
    ],
    params: paramsForSummary(PARAMS, p),
    motions: [{ type: "oscillate", targetId: "block" }],
    controls: ["playPause", "reset", "slider:angleDeg"],
  };
}

export const inclinedPlaneSkill: RecipeSkill = {
  id: "inclinedPlane",
  domain: "physics",
  label: "Inclined plane",
  promptSnippet:
    "inclinedPlane — ramp + sliding block + weight arrow; params angleDeg, speed",
  params: PARAMS,
  derivedReadouts: ["angle"],
  defaultObserve:
    "See the block slide along the ramp; steeper angles change the motion path.",
  buildOps,
  buildSummary,
};
