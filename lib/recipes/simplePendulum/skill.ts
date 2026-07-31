import type { SceneOpsDocument } from "../../sceneOps";
import { mergeParams, paramsForSummary } from "../params";
import type { DemoSummary, RecipeParamDef, RecipeSkill } from "../types";

const PARAMS: RecipeParamDef[] = [
  {
    id: "length",
    label: "Length",
    value: 2.5,
    min: 1,
    max: 4,
    step: 0.1,
    unit: "m",
  },
  {
    id: "angleDeg",
    label: "Start angle",
    value: 35,
    min: 5,
    max: 70,
    step: 1,
    unit: "deg",
  },
  {
    id: "gravity",
    label: "Gravity",
    value: 9.8,
    min: 2,
    max: 20,
    step: 0.2,
    unit: "m/s²",
  },
];

function buildOps(overrides?: {
  params?: Record<string, number>;
  observe?: string;
  title?: string;
}): SceneOpsDocument {
  const p = mergeParams(PARAMS, overrides?.params);
  const pivot: [number, number, number] = [0, 3.2, 0];
  const L = p.length!;
  const theta = (p.angleDeg! * Math.PI) / 180;
  const bob: [number, number, number] = [
    pivot[0] + L * Math.sin(theta),
    pivot[1] - L * Math.cos(theta),
    pivot[2],
  ];

  return {
    version: 1,
    ops: [
      { op: "ensureLab", grid: true, clearColor: 0x050508 },
      {
        op: "addObject",
        id: "pivot",
        kind: "sphere",
        position: pivot,
        size: 0.12,
        color: 0x94a3b8,
      },
      {
        op: "addObject",
        id: "rod",
        kind: "line",
        from: pivot,
        to: bob,
        color: 0xcbd5e1,
      },
      {
        op: "addObject",
        id: "bob",
        kind: "sphere",
        position: bob,
        size: 0.32,
        color: 0xf43f5e,
        materialPreset: "rubber",
      },
      {
        op: "setMotion",
        id: "bob",
        type: "pendulum",
        pivot,
        length: L,
        angle: theta,
        gravity: p.gravity!,
        origin: bob,
      },
      {
        op: "setOverlay",
        title: overrides?.title ?? "Simple pendulum",
        readouts: [
          `L ${p.length!.toFixed(1)} m`,
          `θ₀ ${p.angleDeg!.toFixed(0)}°`,
          `g ${p.gravity!.toFixed(1)}`,
        ],
        showControls: true,
        slider: {
          id: "length",
          label: "Length",
          min: 1,
          max: 4,
          value: p.length!,
          step: 0.1,
        },
      },
      {
        op: "focusCamera",
        position: [5, 2.5, 8],
        target: [0, 1.5, 0],
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
    title: overrides?.title ?? "Simple pendulum",
    observe:
      overrides?.observe ??
      "Notice the period change when you lengthen the string with the slider.",
    skillId: "simplePendulum",
    renderer: "three",
    elements: [
      { id: "pivot", type: "sphere", label: "pivot" },
      { id: "rod", type: "line", label: "rod" },
      { id: "bob", type: "sphere", label: "bob" },
    ],
    params: paramsForSummary(PARAMS, p),
    motions: [{ type: "pendulum", targetId: "bob" }],
    controls: ["playPause", "reset", "slider:length"],
  };
}

export const simplePendulumSkill: RecipeSkill = {
  id: "simplePendulum",
  domain: "physics",
  label: "Simple pendulum",
  promptSnippet:
    "simplePendulum — pivot, rod, bob with real sin pendulum; params length, angleDeg, gravity",
  params: PARAMS,
  derivedReadouts: ["angle", "omega", "pe", "ke"],
  defaultObserve:
    "Notice the period change when you lengthen the string with the slider.",
  buildOps,
  buildSummary,
};
