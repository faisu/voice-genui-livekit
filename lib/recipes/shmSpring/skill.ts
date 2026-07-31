import type { SceneOpsDocument } from "../../sceneOps";
import { mergeParams, paramsForSummary } from "../params";
import type { DemoSummary, RecipeParamDef, RecipeSkill } from "../types";

const PARAMS: RecipeParamDef[] = [
  {
    id: "amplitude",
    label: "Amplitude",
    value: 1.5,
    min: 0.4,
    max: 3,
    step: 0.1,
    unit: "m",
  },
  {
    id: "speed",
    label: "ω",
    value: 1.8,
    min: 0.4,
    max: 4,
    step: 0.1,
    unit: "rad/s",
  },
];

function buildOps(overrides?: {
  params?: Record<string, number>;
  observe?: string;
  title?: string;
}): SceneOpsDocument {
  const p = mergeParams(PARAMS, overrides?.params);
  const origin: [number, number, number] = [0, 1.2, 0];
  const amp = p.amplitude!;

  return {
    version: 1,
    ops: [
      { op: "ensureLab", grid: true, clearColor: 0x050508 },
      {
        op: "addObject",
        id: "wall",
        kind: "box",
        position: [-amp - 0.4, 1.2, 0],
        size: 0.3,
        scale: [0.4, 1.6, 1],
        color: 0x475569,
        materialPreset: "wood",
      },
      {
        op: "addObject",
        id: "mass",
        kind: "sphere",
        position: [origin[0] + amp, origin[1], origin[2]],
        size: 0.35,
        color: 0x38bdf8,
        materialPreset: "metalBall",
      },
      {
        op: "addObject",
        id: "spring",
        kind: "cylinder",
        position: [origin[0], origin[1], origin[2]],
        size: 0.08,
        scale: [1, amp * 2, 1],
        rotation: [0, 0, Math.PI / 2],
        color: 0x94a3b8,
      },
      {
        op: "setMotion",
        id: "mass",
        type: "oscillate",
        origin,
        axis: [1, 0, 0],
        length: amp,
        speed: p.speed!,
      },
      {
        op: "addTrail",
        id: "shmTrail",
        targetId: "mass",
        maxPoints: 100,
        color: 0xfbbf24,
      },
      {
        op: "setOverlay",
        title: overrides?.title ?? "SHM spring",
        readouts: [
          `A ${p.amplitude!.toFixed(1)} m`,
          `ω ${p.speed!.toFixed(1)} rad/s`,
        ],
        showControls: true,
        slider: {
          id: "amplitude",
          label: "Amplitude",
          min: 0.4,
          max: 3,
          value: p.amplitude!,
          step: 0.1,
        },
      },
      {
        op: "focusCamera",
        position: [5, 3, 8],
        target: [0, 1.2, 0],
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
    title: overrides?.title ?? "SHM spring",
    observe:
      overrides?.observe ??
      "The mass oscillates; change amplitude and reset to see a wider swing.",
    skillId: "shmSpring",
    renderer: "three",
    elements: [
      { id: "wall", type: "box", label: "anchor" },
      { id: "spring", type: "cylinder", label: "spring" },
      { id: "mass", type: "sphere", label: "mass" },
    ],
    params: paramsForSummary(PARAMS, p),
    motions: [{ type: "oscillate", targetId: "mass" }],
    controls: ["playPause", "reset", "slider:amplitude"],
  };
}

export const shmSpringSkill: RecipeSkill = {
  id: "shmSpring",
  domain: "physics",
  label: "SHM spring",
  promptSnippet:
    "shmSpring — wall + spring + oscillating mass; params amplitude, speed",
  params: PARAMS,
  derivedReadouts: ["displacement", "speed"],
  defaultObserve:
    "The mass oscillates; change amplitude and reset to see a wider swing.",
  buildOps,
  buildSummary,
};
