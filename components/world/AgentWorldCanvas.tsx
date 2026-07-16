"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useDomain } from "@/components/DomainProvider";
import { prepareCanvasContent } from "@/lib/sanitize";
import type { WorldDemo } from "@/lib/types";

type AgentWorldCanvasProps = {
  demo: WorldDemo | null;
  onCanvasEvent: (payload: unknown) => void;
};

declare global {
  var __canvasDispose: (() => void) | undefined;
  var __physicsDispose: (() => void) | undefined;
}

export function AgentWorldCanvas({ demo, onCanvasEvent }: AgentWorldCanvasProps) {
  const domain = useDomain();
  const containerRef = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onCanvasEvent);
  const demoRef = useRef(demo);

  useEffect(() => {
    onEventRef.current = onCanvasEvent;
  }, [onCanvasEvent]);

  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);

  const contentKey = demo
    ? demo.streaming
      ? `stream:${demo.title ?? ""}`
      : `ready:${demo.title ?? ""}:${demo.content}`
    : "idle";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const current = demoRef.current;
    const notifyHost = (payload: unknown) => {
      onEventRef.current(payload);
    };

    const dispose = () => {
      const cleanup =
        globalThis.__canvasDispose ?? globalThis.__physicsDispose;
      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch (error) {
          console.error("Canvas dispose error", error);
        }
      }
      globalThis.__canvasDispose = undefined;
      globalThis.__physicsDispose = undefined;
      container.replaceChildren();
    };

    dispose();

    if (!current || current.streaming || !current.content.trim()) {
      if (!current?.streaming) {
        renderIdleScene(container);
      }
      return dispose;
    }

    try {
      const content = prepareCanvasContent(current.content, "threejs");
      const clock = new THREE.Clock();
      const runScene = new Function(
        "THREE",
        "OrbitControls",
        "container",
        "notifyHost",
        "clock",
        `"use strict";\n${content}`,
      );
      runScene(THREE, OrbitControls, container, notifyHost, clock);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      container.innerHTML = `<div class="flex h-full items-center justify-center p-8 text-center text-sm text-red-400">${escapeHtml(message)}</div>`;
    }

    return dispose;
  }, [contentKey]);

  return (
    <div className="absolute inset-0 bg-[#050508]">
      <div ref={containerRef} className="h-full w-full" />
      {demo?.streaming && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#050508]/55 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-white/10 bg-black/55 px-6 py-5 text-center backdrop-blur-xl">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-sky-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
              Building simulation
            </p>
            <p className="mt-2 max-w-xs text-sm text-zinc-300">
              {demo.title ?? domain.demoDefaultTitle} {domain.demoBuildingLabel}
            </p>
          </div>
        </div>
      )}
      {demo && !demo.streaming && demo.title && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur-sm">
          {demo.title}
        </div>
      )}
    </div>
  );
}

function renderIdleScene(container: HTMLDivElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050508);
  scene.fog = new THREE.Fog(0x050508, 8, 28);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    100,
  );
  camera.position.set(0, 2.2, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const key = new THREE.DirectionalLight(0xc4d4ff, 0.55);
  key.position.set(4, 8, 6);
  const fill = new THREE.DirectionalLight(0x38bdf8, 0.2);
  fill.position.set(-6, 3, -4);
  scene.add(ambient, key, fill);

  const grid = new THREE.GridHelper(40, 40, 0x243049, 0x1a2030);
  scene.add(grid);

  const starCount = 400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 60;
    starPositions[i * 3 + 1] = Math.random() * 20 + 2;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.04,
      transparent: true,
      opacity: 0.7,
    }),
  );
  scene.add(stars);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1, 0);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 2;
  controls.maxDistance = 18;

  let frame = 0;
  const animate = () => {
    frame = requestAnimationFrame(animate);
    stars.rotation.y += 0.0004;
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const onResize = () => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener("resize", onResize);

  globalThis.__canvasDispose = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    renderer.dispose();
    container.replaceChildren();
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
