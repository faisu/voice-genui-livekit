/** Concept chip → preferred skill id mappings and domain catalogs. */

export const PHYSICS_SKILL_MAP: Record<string, string> = {
  "Projectile motion": "projectile",
  "Simple pendulum": "simplePendulum",
  "SHM spring": "shmSpring",
  "Inclined plane": "inclinedPlane",
  "Orbital mechanics": "circularOrbit",
};

export const DEFAULT_G = 9.8;

export const CPK_COLORS = {
  C: 0x334155,
  O: 0xef4444,
  H: 0xe2e8f0,
  N: 0x3b82f6,
} as const;
