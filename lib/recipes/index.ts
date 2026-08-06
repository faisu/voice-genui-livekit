export type { DemoSummary, EmitScenePayload } from "./types";
export {
  resolveSceneEmit,
  parseEmitScene,
  summaryFromSceneOps,
} from "./registry";
export { MATERIAL_PRESETS, resolveMaterialPreset } from "./materials";
export { createSoftNoiseData, isAllowedLabAssetUrl } from "./assets";
export {
  projectilePosition,
  projectileApexHeight,
} from "./solvers/projectile";
export {
  pendulumStep,
  pendulumPosition,
  pendulumPeriodApprox,
} from "./solvers/pendulum";
export { orbitPosition } from "./solvers/orbit";
export { oscillatePosition } from "./solvers/oscillate";
