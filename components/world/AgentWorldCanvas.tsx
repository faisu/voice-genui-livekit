"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useDomain } from "@/components/DomainProvider";
import { SceneBuilder } from "@/components/world/SceneBuilder";
import { createAnimateCamera } from "@/lib/animateCamera";
import { createSceneControls } from "@/lib/createSceneControls";
import { parseSceneOpsDocument } from "@/lib/sceneOps";
import { prepareCanvasContent } from "@/lib/sanitize";
import type { WorldDemo } from "@/lib/types";

type StageReadyPayload = {
  lesson_id: string;
  stage_id: string;
  stage_index: number;
};

type AgentWorldCanvasProps = {
  demo: WorldDemo | null;
  onCanvasEvent: (payload: unknown) => void;
  onStageReady?: (payload: StageReadyPayload) => void;
};

declare global {
  var __canvasDispose: (() => void) | undefined;
  var __physicsDispose: (() => void) | undefined;
}

export function AgentWorldCanvas({
  demo,
  onCanvasEvent,
  onStageReady,
}: AgentWorldCanvasProps) {
  const domain = useDomain();
  const containerRef = useRef<HTMLDivElement>(null);
  const onEventRef = useRef(onCanvasEvent);
  const onStageReadyRef = useRef(onStageReady);
  const demoRef = useRef(demo);
  const builderRef = useRef<SceneBuilder | null>(null);
  const activeLessonRef = useRef<string | null>(null);

  useEffect(() => {
    onEventRef.current = onCanvasEvent;
  }, [onCanvasEvent]);

  useEffect(() => {
    onStageReadyRef.current = onStageReady;
  }, [onStageReady]);

  useEffect(() => {
    demoRef.current = demo;
  }, [demo]);

  const contentKey = demo
    ? demo.streaming
      ? `stream:${demo.lesson_id ?? ""}:${demo.stage_id ?? demo.title ?? ""}`
      : `ready:${demo.lesson_id ?? ""}:${demo.stage_id ?? ""}:${demo.content_type ?? "threejs"}:${demo.content}`
    : "idle";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const current = demoRef.current;
    const notifyHost = (payload: unknown) => {
      onEventRef.current(payload);
    };

    const disposeThreejsScene = () => {
      if (typeof globalThis.__cameraAnimCancel === "function") {
        try {
          globalThis.__cameraAnimCancel();
        } catch {
          // ignore
        }
        globalThis.__cameraAnimCancel = undefined;
      }
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
    };

    const disposeBuilder = () => {
      if (builderRef.current) {
        builderRef.current.dispose();
        builderRef.current = null;
      }
      activeLessonRef.current = null;
    };

    if (!current || current.streaming || !current.content.trim()) {
      if (!current?.streaming) {
        disposeBuilder();
        disposeThreejsScene();
        container.replaceChildren();
        renderIdleScene(container);
      }
      return;
    }

    const emitStageReady = () => {
      if (
        current.lesson_id &&
        current.stage_id &&
        typeof current.stage_index === "number"
      ) {
        onStageReadyRef.current?.({
          lesson_id: current.lesson_id,
          stage_id: current.stage_id,
          stage_index: current.stage_index,
        });
      }
    };

    try {
      if (current.content_type === "scene_ops") {
        const doc = parseSceneOpsDocument(
          prepareCanvasContent(current.content, "scene_ops"),
        );
        const lessonId = current.lesson_id ?? "anonymous";
        const sameLesson = activeLessonRef.current === lessonId;

        if (!sameLesson || !builderRef.current || builderRef.current.isDisposed) {
          disposeThreejsScene();
          disposeBuilder();
          container.replaceChildren();
          builderRef.current = new SceneBuilder({ container, notifyHost });
          activeLessonRef.current = lessonId;
        }

        builderRef.current.apply(doc);
        emitStageReady();
        return () => {
          // Keep builder alive across stages of the same lesson.
        };
      }

      // Full Three.js path — tear down any staged builder.
      disposeBuilder();
      disposeThreejsScene();
      container.replaceChildren();

      const content = prepareCanvasContent(current.content, "threejs");
      const clock = new THREE.Clock();
      const animateCamera = createAnimateCamera(THREE);
      const runScene = new Function(
        "THREE",
        "OrbitControls",
        "container",
        "notifyHost",
        "clock",
        "animateCamera",
        "createSceneControls",
        `"use strict";\n${content}`,
      );
      runScene(
        THREE,
        OrbitControls,
        container,
        notifyHost,
        clock,
        animateCamera,
        (opts: Parameters<typeof createSceneControls>[1]) =>
          createSceneControls(THREE, opts),
      );
      emitStageReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      disposeBuilder();
      container.innerHTML = `<div class="flex h-full items-center justify-center p-8 text-center text-sm text-red-400">${escapeHtml(message)}</div>`;
    }

    return () => {
      // On contentKey change for threejs, next effect run disposes first.
      if (demoRef.current?.content_type !== "scene_ops") {
        disposeThreejsScene();
      }
    };
  }, [contentKey]);

  // Full unmount cleanup.
  useEffect(() => {
    return () => {
      if (builderRef.current) {
        builderRef.current.dispose();
        builderRef.current = null;
      }
      if (typeof globalThis.__cameraAnimCancel === "function") {
        try {
          globalThis.__cameraAnimCancel();
        } catch {
          // ignore
        }
      }
      const cleanup =
        globalThis.__canvasDispose ?? globalThis.__physicsDispose;
      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const stageLabel =
    typeof demo?.stage_index === "number" &&
    typeof demo?.total_stages === "number"
      ? `Stage ${demo.stage_index + 1}/${demo.total_stages}`
      : null;

  // Keep the lab fully visible and interactive while later stages stream in.
  const showStageChip = Boolean(demo?.streaming);

  return (
    <div className="absolute inset-0 bg-[#050508]">
      <div ref={containerRef} className="h-full w-full" />
      {showStageChip ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/50 px-3.5 py-2 backdrop-blur-md">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border border-zinc-600 border-t-sky-400" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              {stageLabel ?? "Building"}
            </p>
            <p className="max-w-56 truncate text-xs text-zinc-400">
              {demo?.title ?? domain.demoDefaultTitle}
            </p>
          </div>
        </div>
      ) : null}
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
