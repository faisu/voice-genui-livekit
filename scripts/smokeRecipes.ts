/**
 * Smoke-test freeform scene_ops coerce + shared solvers.
 */
import assert from "node:assert/strict";
import {
  parseEmitScene,
  resolveSceneEmit,
  summaryFromSceneOps,
} from "../lib/recipes/index.js";
import { prepareCanvasContent } from "../lib/sanitize.js";
import { pendulumPeriodApprox } from "../lib/recipes/solvers/pendulum.js";
import {
  projectileApexHeight,
  projectilePosition,
} from "../lib/recipes/solvers/projectile.js";

const sampleOps = {
  version: 1 as const,
  ops: [
    { op: "ensureLab" as const, grid: true },
    {
      op: "addObject" as const,
      id: "ball",
      kind: "sphere" as const,
      position: [0, 1, 0] as [number, number, number],
      materialPreset: "metalBall",
    },
    {
      op: "setMotion" as const,
      id: "ball",
      type: "projectile" as const,
      origin: [0, 1, 0] as [number, number, number],
      velocity: [5, 8, 0] as [number, number, number],
      gravity: 9.81,
    },
    {
      op: "setOverlay" as const,
      title: "Projectile smoke",
      showControls: true,
      slider: {
        id: "speed",
        label: "Speed",
        min: 1,
        max: 20,
        value: 10,
      },
    },
  ],
};

const payload = parseEmitScene({
  title: "Projectile smoke",
  observe: "Watch the ball arc under gravity.",
  ops: sampleOps,
});
assert(payload, "parseEmitScene accepts freeform ops");

const resolved = resolveSceneEmit(payload!);
assert(!("error" in resolved), `resolveSceneEmit: ${JSON.stringify(resolved)}`);
assert(resolved.doc.ops.length >= 3, "resolved ops present");

const raw = JSON.stringify(resolved.doc);
assert(!/\.gltf|\.glb|\.hdr/i.test(raw), "no model/HDRI refs");
const prepared = prepareCanvasContent(raw, "scene_ops");
assert(prepared, "prepareCanvasContent accepts scene_ops");

const summary = summaryFromSceneOps(resolved.doc, "Projectile smoke");
assert(summary.elements.some((e) => e.id === "ball"), "summary has ball");
assert(summary.controls.includes("playPause"), "summary has playPause");

const pos = projectilePosition([0, 0, 0], [10, 10, 0], 9.81, 0.5);
assert(
  Number.isFinite(pos.position[0]) && Number.isFinite(pos.position[1]),
  "projectilePosition",
);
assert(projectileApexHeight(10, 9.81) > 0, "projectileApexHeight");
assert(pendulumPeriodApprox(1, 9.81) > 0, "pendulumPeriodApprox");

// Reject remote assets
const bad = parseEmitScene({
  ops: {
    version: 1,
    ops: [
      { op: "ensureLab" },
      {
        op: "setOverlay",
        title: "see https://cdn.example/model.glb",
      },
    ],
  },
});
if (bad) {
  const badResolved = resolveSceneEmit(bad);
  assert("error" in badResolved, "remote asset refs should fail");
}

console.log("All scene_ops smoke checks passed.");
