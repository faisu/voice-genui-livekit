export function orbitPosition(
  center: [number, number, number],
  radius: number,
  speed: number,
  t: number,
  phase = 0,
): [number, number, number] {
  const a = speed * t + phase;
  return [
    center[0] + radius * Math.cos(a),
    center[1],
    center[2] + radius * Math.sin(a),
  ];
}
