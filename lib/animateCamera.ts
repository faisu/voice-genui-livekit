import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type CameraKeyframe = {
  /** Camera world position */
  position: [number, number, number];
  /** OrbitControls / look-at target */
  target: [number, number, number];
  /** Normalized time along the path, 0..1 */
  t: number;
};

declare global {
  var __cameraAnimCancel: (() => void) | undefined;
}

/**
 * Host-provided cinematic camera tween for generated Three.js scenes.
 * Disables OrbitControls during the intro, then re-enables them.
 */
export function createAnimateCamera(THREE: typeof import("three")) {
  return function animateCamera(
    camera: THREE.PerspectiveCamera | THREE.Camera,
    controls: OrbitControls,
    keyframes: CameraKeyframe[],
    durationSeconds = 6,
  ): void {
    if (!camera || !controls || !Array.isArray(keyframes) || keyframes.length < 2) {
      return;
    }

    // Cancel any prior intro still running in this container.
    if (typeof globalThis.__cameraAnimCancel === "function") {
      globalThis.__cameraAnimCancel();
      globalThis.__cameraAnimCancel = undefined;
    }

    const sorted = [...keyframes].sort((a, b) => a.t - b.t);
    const durationMs = Math.max(durationSeconds, 0.5) * 1000;
    const start = performance.now();

    const wasEnabled = controls.enabled;
    controls.enabled = false;

    const pos = new THREE.Vector3();
    const target = new THREE.Vector3();
    const fromPos = new THREE.Vector3();
    const toPos = new THREE.Vector3();
    const fromTarget = new THREE.Vector3();
    const toTarget = new THREE.Vector3();

    const first = sorted[0];
    camera.position.set(...first.position);
    controls.target.set(...first.target);
    controls.update();

    let raf = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      controls.enabled = wasEnabled;
      if (globalThis.__cameraAnimCancel === cancel) {
        globalThis.__cameraAnimCancel = undefined;
      }
    };

    const cancel = () => {
      finish();
    };

    globalThis.__cameraAnimCancel = cancel;

    const tick = (now: number) => {
      if (finished) return;
      const u = Math.min(1, (now - start) / durationMs);
      const eased = easeInOutCubic(u);

      let i = 0;
      while (i < sorted.length - 2 && sorted[i + 1].t < eased) {
        i += 1;
      }
      const a = sorted[i];
      const b = sorted[Math.min(i + 1, sorted.length - 1)];
      const span = Math.max(b.t - a.t, 1e-6);
      const local = Math.min(1, Math.max(0, (eased - a.t) / span));
      const localEased = easeInOutCubic(local);

      fromPos.set(...a.position);
      toPos.set(...b.position);
      fromTarget.set(...a.target);
      toTarget.set(...b.target);

      pos.lerpVectors(fromPos, toPos, localEased);
      target.lerpVectors(fromTarget, toTarget, localEased);

      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();

      if (u < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    raf = requestAnimationFrame(tick);
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
