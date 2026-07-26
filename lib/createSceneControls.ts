import type * as THREE_NS from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SceneControlSlider = {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
};

export type SceneControlsOptions = {
  scene: THREE_NS.Scene;
  camera: THREE_NS.Camera;
  renderer: THREE_NS.WebGLRenderer;
  controls: OrbitControls;
  /** World-space anchor for the control panel. */
  position?: [number, number, number];
  title?: string;
  readouts?: string[];
  showButtons?: boolean;
  slider?: SceneControlSlider;
  notifyHost: (payload: unknown) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  onSlider?: (id: string, value: number) => void;
};

export type SceneControlsHandle = {
  group: THREE_NS.Group;
  setTitle: (title: string) => void;
  setReadouts: (readouts: string[]) => void;
  setSliderValue: (value: number) => void;
  getSliderValue: () => number | null;
  dispose: () => void;
};

type HitRole = "play" | "pause" | "reset" | "slider";

/**
 * Host-provided in-scene interactive lab controls (no HTML overlay).
 * Students click/drag meshes in the 3D view; OrbitControls pause while dragging.
 */
export function createSceneControls(
  THREE: typeof import("three"),
  options: SceneControlsOptions,
): SceneControlsHandle {
  const {
    scene,
    camera,
    renderer,
    controls,
    notifyHost,
    onPlay,
    onPause,
    onReset,
    onSlider,
  } = options;

  const group = new THREE.Group();
  group.name = "__sceneControls";
  const position = options.position ?? [-3.2, 3.4, 0.5];
  group.position.set(...position);
  scene.add(group);

  const panelW = 2.6;
  const panelH = options.slider ? 1.55 : 1.15;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(panelW, panelH),
    new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    }),
  );
  panel.position.z = -0.02;
  group.add(panel);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(panelW, panelH)),
    new THREE.LineBasicMaterial({ color: 0x334155 }),
  );
  border.position.z = -0.01;
  group.add(border);

  let titleMesh = makeLabelPlane(THREE, options.title ?? "Lab demo", 512, 64, 22, true);
  titleMesh.position.set(0, panelH * 0.5 - 0.22, 0.01);
  titleMesh.scale.set(2.3, 0.28, 1);
  group.add(titleMesh);

  let readoutMesh = makeLabelPlane(
    THREE,
    (options.readouts ?? []).join("  ·  ") || " ",
    512,
    48,
    16,
    false,
  );
  readoutMesh.position.set(0, panelH * 0.5 - 0.48, 0.01);
  readoutMesh.scale.set(2.3, 0.22, 1);
  group.add(readoutMesh);

  const interactive: THREE_NS.Object3D[] = [];

  if (options.showButtons !== false) {
    const specs: { role: HitRole; label: string; color: number; x: number }[] = [
      { role: "play", label: "Play", color: 0x166534, x: -0.85 },
      { role: "pause", label: "Pause", color: 0x1e3a5f, x: 0 },
      { role: "reset", label: "Reset", color: 0x4c1d95, x: 0.85 },
    ];
    for (const spec of specs) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.28, 0.08),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: 0.5,
          metalness: 0.2,
        }),
      );
      mesh.position.set(spec.x, options.slider ? -0.15 : -0.28, 0.06);
      mesh.userData.role = spec.role;
      const caption = makeLabelPlane(THREE, spec.label, 128, 48, 22, true);
      caption.position.set(0, 0, 0.05);
      caption.scale.set(0.65, 0.22, 1);
      mesh.add(caption);
      group.add(mesh);
      interactive.push(mesh);
    }
  }

  let sliderValue = options.slider?.value ?? 0;
  let sliderMin = options.slider?.min ?? 0;
  let sliderMax = options.slider?.max ?? 1;
  let sliderId = options.slider?.id ?? "param";
  let sliderStep = options.slider?.step;
  let track: THREE_NS.Mesh | null = null;
  let handle: THREE_NS.Mesh | null = null;
  let sliderLabelMesh: THREE_NS.Mesh | null = null;

  if (options.slider) {
    sliderLabelMesh = makeLabelPlane(
      THREE,
      formatSliderLabel(options.slider.label, sliderValue),
      512,
      40,
      16,
      false,
    );
    sliderLabelMesh.position.set(0, -0.55, 0.02);
    sliderLabelMesh.scale.set(2.2, 0.18, 1);
    group.add(sliderLabelMesh);

    track = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.06, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }),
    );
    track.position.set(0, -0.78, 0.04);
    track.userData.role = "slider";
    group.add(track);
    interactive.push(track);

    handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.22, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.4,
        metalness: 0.3,
      }),
    );
    handle.userData.role = "slider";
    group.add(handle);
    interactive.push(handle);
    placeHandle();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  let dragging = false;
  let controlsWasEnabled = controls.enabled;

  const dom = renderer.domElement;

  const setPointer = (event: PointerEvent) => {
    const rect = dom.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pick = (): THREE_NS.Intersection | null => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactive, true);
    return hits[0] ?? null;
  };

  const resolveRole = (obj: THREE_NS.Object3D): HitRole | null => {
    let cur: THREE_NS.Object3D | null = obj;
    while (cur) {
      if (cur.userData?.role) return cur.userData.role as HitRole;
      cur = cur.parent;
    }
    return null;
  };

  const onPointerDown = (event: PointerEvent) => {
    setPointer(event);
    const hit = pick();
    if (!hit) return;
    const role = resolveRole(hit.object);
    if (!role) return;
    event.preventDefault();
    event.stopPropagation();

    if (role === "play") {
      onPlay?.();
      notifyHost({ action: "play" });
      return;
    }
    if (role === "pause") {
      onPause?.();
      notifyHost({ action: "pause" });
      return;
    }
    if (role === "reset") {
      onReset?.();
      notifyHost({ action: "reset" });
      return;
    }

    if (role === "slider" && track && handle) {
      dragging = true;
      controlsWasEnabled = controls.enabled;
      controls.enabled = false;
      dom.setPointerCapture(event.pointerId);
      updateSliderFromEvent(event);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) {
      setPointer(event);
      const hit = pick();
      dom.style.cursor = hit ? "pointer" : "";
      return;
    }
    updateSliderFromEvent(event);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = controlsWasEnabled;
    try {
      dom.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  function updateSliderFromEvent(event: PointerEvent) {
    if (!track || !handle) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const worldPos = new THREE.Vector3();
    track.getWorldPosition(worldPos);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(group.getWorldQuaternion(worldQuat))
      .normalize();
    dragPlane.setFromNormalAndCoplanarPoint(normal, worldPos);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;

    const local = group.worldToLocal(hitPoint.clone());
    const t = Math.max(0, Math.min(1, (local.x + 1) / 2));
    let next = sliderMin + t * (sliderMax - sliderMin);
    if (typeof sliderStep === "number" && sliderStep > 0) {
      next = Math.round(next / sliderStep) * sliderStep;
    }
    next = Math.max(sliderMin, Math.min(sliderMax, next));
    if (Math.abs(next - sliderValue) < 1e-6) return;
    sliderValue = next;
    placeHandle();
    refreshSliderLabel();
    onSlider?.(sliderId, sliderValue);
    notifyHost({ action: "slider", id: sliderId, value: sliderValue });
  }

  function placeHandle() {
    if (!handle) return;
    const t =
      sliderMax === sliderMin
        ? 0
        : (sliderValue - sliderMin) / (sliderMax - sliderMin);
    handle.position.set(-1 + t * 2, -0.78, 0.1);
  }

  function refreshSliderLabel() {
    if (!sliderLabelMesh || !options.slider) return;
    replaceLabelTexture(
      THREE,
      sliderLabelMesh,
      formatSliderLabel(options.slider.label, sliderValue),
      512,
      40,
      16,
      false,
    );
  }

  panel.onBeforeRender = () => {
    group.lookAt(camera.position);
  };

  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerup", onPointerUp);
  dom.addEventListener("pointercancel", onPointerUp);

  return {
    group,
    setTitle(title: string) {
      replaceLabelTexture(THREE, titleMesh, title, 512, 64, 22, true);
    },
    setReadouts(readouts: string[]) {
      replaceLabelTexture(
        THREE,
        readoutMesh,
        readouts.join("  ·  ") || " ",
        512,
        48,
        16,
        false,
      );
    },
    setSliderValue(value: number) {
      sliderValue = Math.max(sliderMin, Math.min(sliderMax, value));
      placeHandle();
      refreshSliderLabel();
    },
    getSliderValue() {
      return options.slider ? sliderValue : null;
    },
    dispose() {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      if (dragging) controls.enabled = controlsWasEnabled;
      dom.style.cursor = "";
      scene.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
        else if (mat) disposeMaterial(mat);
      });
    },
  };
}

function formatSliderLabel(label: string, value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${label}: ${rounded}`;
}

function makeLabelPlane(
  THREE: typeof import("three"),
  text: string,
  width: number,
  height: number,
  fontSize: number,
  bold: boolean,
): THREE_NS.Mesh {
  const texture = drawTextTexture(THREE, text, width, height, fontSize, bold);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
}

function replaceLabelTexture(
  THREE: typeof import("three"),
  mesh: THREE_NS.Mesh,
  text: string,
  width: number,
  height: number,
  fontSize: number,
  bold: boolean,
) {
  const prev = mesh.material as THREE_NS.MeshBasicMaterial;
  if (prev.map) prev.map.dispose();
  prev.map = drawTextTexture(THREE, text, width, height, fontSize, bold);
  prev.needsUpdate = true;
}

function drawTextTexture(
  THREE: typeof import("three"),
  text: string,
  width: number,
  height: number,
  fontSize: number,
  bold: boolean,
): THREE_NS.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `${bold ? "600" : "400"} ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 64), width / 2, height / 2, width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeMaterial(mat: THREE_NS.Material) {
  const withMap = mat as THREE_NS.MeshBasicMaterial;
  if (withMap.map) withMap.map.dispose();
  mat.dispose();
}
