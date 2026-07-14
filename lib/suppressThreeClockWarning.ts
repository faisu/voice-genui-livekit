import * as THREE from "three";

const CLOCK_DEPRECATION =
  "Clock: This module has been deprecated. Please use THREE.Timer instead.";

let installed = false;

/**
 * Suppress the THREE.Clock deprecation noise from @react-three/fiber v9.
 * Remove once @react-three/fiber v10 stable is adopted (it uses Timer instead).
 */
export function suppressThreeClockWarning(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  if (typeof THREE.setConsoleFunction === "function") {
    THREE.setConsoleFunction((method, message, ...params) => {
      if (
        method === "warn" &&
        typeof message === "string" &&
        message.includes(CLOCK_DEPRECATION)
      ) {
        return;
      }
      console[method](message, ...params);
    });
    return;
  }

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.includes(CLOCK_DEPRECATION)) {
      return;
    }
    originalWarn(...args);
  };
}
