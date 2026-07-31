import type { SceneOpsDocument } from "../../sceneOps";
import { mergeParams, paramsForSummary } from "../params";
import type { DemoSummary, RecipeParamDef, RecipeSkill } from "../types";

const PARAMS: RecipeParamDef[] = [
  {
    id: "angleDeg",
    label: "Launch angle",
    value: 45,
    min: 15,
    max: 75,
    step: 1,
    unit: "deg",
  },
  {
    id: "speed",
    label: "Speed",
    value: 8,
    min: 3,
    max: 14,
    step: 0.5,
    unit: "m/s",
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
  const angle = (p.angleDeg! * Math.PI) / 180;
  const speed = p.speed!;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const origin: [number, number, number] = [-4, 0.35, 0];

  return {
    version: 1,
    ops: [
      { op: "ensureLab", grid: true, clearColor: 0x050508 },
      {
        op: "addObject",
        id: "ball",
        kind: "sphere",
        position: origin,
        size: 0.35,
        color: 0x38bdf8,
        materialPreset: "metalBall",
      },
      {
        op: "addArrow",
        id: "v0",
        origin,
        direction: [vx, vy, 0],
        length: 2.2,
        color: 0xfbbf24,
        label: "v₀",
      },
      {
        op: "addTrail",
        id: "trail",
        targetId: "ball",
        maxPoints: 160,
        color: 0x67e8f9,
      },
      {
        op: "setMotion",
        id: "ball",
        type: "projectile",
        origin,
        velocity: [vx, vy, 0],
        gravity: p.gravity!,
      },
      {
        op: "setOverlay",
        title: overrides?.title ?? "Projectile motion",
        readouts: [
          `angle ${p.angleDeg!.toFixed(0)}°`,
          `speed ${p.speed!.toFixed(1)} m/s`,
          `g ${p.gravity!.toFixed(1)}`,
        ],
        showControls: true,
        slider: {
          id: "angleDeg",
          label: "Launch angle",
          min: 15,
          max: 75,
          value: p.angleDeg!,
          step: 1,
        },
        position: [-3.2, 3.4, 0.5],
      },
      {
        op: "focusCamera",
        position: [6, 4, 12],
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
    title: overrides?.title ?? "Projectile motion",
    observe:
      overrides?.observe ??
      "Watch the ball arc, then raise the launch angle with the slider and reset.",
    skillId: "projectile",
    renderer: "three",
    elements: [
      { id: "ball", type: "sphere", label: "ball" },
      { id: "v0", type: "arrow", label: "v₀" },
      { id: "trail", type: "trail", label: "path" },
    ],
    params: paramsForSummary(PARAMS, p),
    motions: [{ type: "projectile", targetId: "ball" }],
    controls: ["playPause", "reset", "slider:angleDeg"],
  };
}

export const projectileSkill: RecipeSkill = {
  id: "projectile",
  domain: "physics",
  label: "Projectile motion",
  promptSnippet:
    "projectile — ball launch with gravity, trail, v0 arrow; params angleDeg, speed, gravity",
  params: PARAMS,
  derivedReadouts: ["speed", "vx", "vy", "height"],
  defaultObserve:
    "Watch the ball arc, then raise the launch angle with the slider and reset.",
  buildOps,
  buildSummary,
};
