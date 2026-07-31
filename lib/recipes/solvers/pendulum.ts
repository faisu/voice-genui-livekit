export type PendulumState = {
  theta: number;
  omega: number;
};

/** Real pendulum: θ̈ = −(g/L) sin(θ). Semi-implicit Euler. */
export function pendulumStep(
  state: PendulumState,
  dt: number,
  gravity: number,
  length: number,
): PendulumState {
  const L = Math.max(length, 1e-4);
  const alpha = -(gravity / L) * Math.sin(state.theta);
  const omega = state.omega + alpha * dt;
  const theta = state.theta + omega * dt;
  return { theta, omega };
}

export function pendulumPosition(
  pivot: [number, number, number],
  length: number,
  theta: number,
): [number, number, number] {
  return [
    pivot[0] + length * Math.sin(theta),
    pivot[1] - length * Math.cos(theta),
    pivot[2],
  ];
}

/** Small-angle period T ≈ 2π √(L/g) — used for smoke checks. */
export function pendulumPeriodApprox(length: number, gravity: number): number {
  return 2 * Math.PI * Math.sqrt(Math.max(length, 1e-4) / Math.max(gravity, 1e-4));
}
