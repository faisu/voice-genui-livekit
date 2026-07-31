export type Vec3 = [number, number, number];

export function projectilePosition(
  origin: Vec3,
  velocity: Vec3,
  gravity: number,
  t: number,
  groundY = 0,
): { position: Vec3; velocity: Vec3; settled: boolean; speed: number } {
  const x = origin[0] + velocity[0] * t;
  const y = origin[1] + velocity[1] * t - 0.5 * gravity * t * t;
  const z = origin[2] + velocity[2] * t;
  const vy = velocity[1] - gravity * t;
  const vx = velocity[0];
  const vz = velocity[2];
  if (y <= groundY) {
    return {
      position: [x, groundY, z],
      velocity: [0, 0, 0],
      settled: true,
      speed: 0,
    };
  }
  const speed = Math.hypot(vx, vy, vz);
  return {
    position: [x, y, z],
    velocity: [vx, vy, vz],
    settled: false,
    speed,
  };
}

/** Apex height above origin for vertical component of launch. */
export function projectileApexHeight(vy0: number, gravity: number): number {
  if (vy0 <= 0 || gravity <= 0) return 0;
  return (vy0 * vy0) / (2 * gravity);
}
