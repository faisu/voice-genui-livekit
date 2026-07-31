/**
 * Smoke-test Recipe Skills → scene_ops + shared solvers.
 * Run: npx tsx scripts/smokeRecipes.ts
 */
import { prepareCanvasContent } from "../lib/sanitize.js";
import {
  listSkills,
  resolveRecipeEmit,
} from "../lib/recipes/index.js";
import { tryParseSceneOpsDocument } from "../lib/sceneOps.js";
import { pendulumPeriodApprox } from "../lib/recipes/solvers/pendulum.js";
import {
  projectileApexHeight,
  projectilePosition,
} from "../lib/recipes/solvers/projectile.js";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

{
  const apex = projectileApexHeight(10, 9.8);
  assert(Math.abs(apex - 100 / 19.6) < 1e-6, "apex height formula");
  const mid = projectilePosition([0, 0, 0], [6, 8, 0], 9.8, 0.5);
  assert(!mid.settled && mid.position[1]! > 0, "projectile mid-air");
  const landed = projectilePosition([0, 1, 0], [1, 0, 0], 9.8, 5);
  assert(landed.settled && landed.position[1] === 0, "projectile ground stop");

  const t1 = pendulumPeriodApprox(1, 9.8);
  const t4 = pendulumPeriodApprox(4, 9.8);
  assert(Math.abs(t4 / t1 - 2) < 1e-6, "period scales with sqrt(L)");
}

for (const skill of listSkills()) {
  const resolved = resolveRecipeEmit({ skillId: skill.id });
  assert(!("error" in resolved), `skill ${skill.id} resolve failed`);
  if ("error" in resolved) continue;

  const raw = JSON.stringify(resolved.doc);
  assert(!/https?:\/\//i.test(raw), `${skill.id} has remote URL`);
  assert(!/\.gltf|\.glb|\.hdr/i.test(raw), `${skill.id} has model/HDRI ref`);

  const prepared = prepareCanvasContent(raw, "scene_ops");
  const parsed = tryParseSceneOpsDocument(prepared);
  assert(parsed, `${skill.id} re-parse`);

  const summary = resolved.summary;
  assert(summary.renderer === "three", `${skill.id} renderer`);
  assert(summary.skillId === skill.id, `${skill.id} summary skillId`);
  assert(summary.elements.length > 0, `${skill.id} has elements`);
  assert(summary.controls.includes("playPause"), `${skill.id} playPause`);
  console.log(`ok skill:${skill.id} ops=${resolved.doc.ops.length}`);
}

{
  const resolved = resolveRecipeEmit({}, "please show projectile motion");
  assert(
    !("error" in resolved) && resolved.skillId === "projectile",
    "keyword fallback",
  );
}

{
  let threw = false;
  try {
    prepareCanvasContent(
      JSON.stringify({
        version: 1,
        ops: [{ op: "setOverlay", title: "see https://cdn.example/model.glb" }],
      }),
      "scene_ops",
    );
  } catch {
    threw = true;
  }
  assert(threw, "remote asset rejection via sanitize");
}

console.log("All Recipe Skill smoke checks passed.");
