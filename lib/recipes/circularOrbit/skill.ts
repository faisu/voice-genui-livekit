import type { SceneOpsDocument } from "../../sceneOps";
import { mergeParams, paramsForSummary } from "../params";
import type { DemoSummary, RecipeParamDef, RecipeSkill } from "../types";

const PARAMS: RecipeParamDef[] = [
  {
    id: "radius",
    label: "Orbit radius",
    value: 3,
    min: 1.5,
    max: 6,
    step: 0.1,
    unit: "m",
  },
  {
    id: "speed",
    label: "Angular speed",
    value: 0.9,
    min: 0.2,
    max: 2.5,
    step: 0.05,
    unit: "rad/s",
  },
];

function buildOps(overrides?: {
  params?: Record<string, number>;
  observe?: string;
  title?: string;
}): SceneOpsDocument {
  const p = mergeParams(PARAMS, overrides?.params);
  const center: [number, number, number] = [0, 1.2, 0];
  const r = p.radius!;
  const planet: [number, number, number] = [center[0] + r, center[1], center[2]];

  return {
    version: 1,
    ops: [
      { op: "ensureLab", grid: true, clearColor: 0x050508 },
      {
        op: "addObject",
        id: "sun",
        kind: "sphere",
        position: center,
        size: 0.7,
        color: 0xfbbf24,
        materialPreset: "sun",
      },
      {
        op: "addObject",
        id: "planet",
        kind: "sphere",
        position: planet,
        size: 0.35,
        color: 0x22d3ee,
        materialPreset: "planet",
      },
      {
        op: "addTrail",
        id: "orbitTrail",
        targetId: "planet",
        maxPoints: 200,
        color: 0x67e8f9,
      },
      {
        op: "setMotion",
        id: "planet",
        type: "orbit",
        center,
        radius: r,
        speed: p.speed!,
        origin: planet,
      },
      {
        op: "setOverlay",
        title: overrides?.title ?? "Circular orbit",
        readouts: [
          `r ${p.radius!.toFixed(1)} m`,
          `ω ${p.speed!.toFixed(2)} rad/s`,
        ],
        showControls: true,
        slider: {
          id: "speed",
          label: "Angular speed",
          min: 0.2,
          max: 2.5,
          value: p.speed!,
          step: 0.05,
        },
      },
      {
        op: "focusCamera",
        position: [7, 5, 9],
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
    title: overrides?.title ?? "Circular orbit",
    observe:
      overrides?.observe ??
      "Watch the planet leave a trail; speed up the orbit with the slider.",
    skillId: "circularOrbit",
    renderer: "three",
    elements: [
      { id: "sun", type: "sphere", label: "central body" },
      { id: "planet", type: "sphere", label: "planet" },
      { id: "orbitTrail", type: "trail", label: "orbit path" },
    ],
    params: paramsForSummary(PARAMS, p),
    motions: [{ type: "orbit", targetId: "planet" }],
    controls: ["playPause", "reset", "slider:speed"],
  };
}

export const circularOrbitSkill: RecipeSkill = {
  id: "circularOrbit",
  domain: "physics",
  label: "Circular orbit",
  promptSnippet:
    "circularOrbit — sun + planet circular motion with trail; params radius, speed",
  params: PARAMS,
  derivedReadouts: ["speed", "radius"],
  defaultObserve:
    "Watch the planet leave a trail; speed up the orbit with the slider.",
  buildOps,
  buildSummary,
};
