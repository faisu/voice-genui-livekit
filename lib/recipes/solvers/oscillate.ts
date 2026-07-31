export function oscillatePosition(
  origin: [number, number, number],
  axis: [number, number, number],
  amplitude: number,
  speed: number,
  t: number,
  phase = 0,
): [number, number, number] {
  const s = Math.sin(speed * t + phase) * amplitude;
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = axis[0] / len;
  const ay = axis[1] / len;
  const az = axis[2] / len;
  return [origin[0] + ax * s, origin[1] + ay * s, origin[2] + az * s];
}
