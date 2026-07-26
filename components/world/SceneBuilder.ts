"use client";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createAnimateCamera } from "@/lib/animateCamera";
import {
  createSceneControls,
  type SceneControlsHandle,
} from "@/lib/createSceneControls";
import type { SceneOp, SceneOpsDocument } from "@/lib/sceneOps";

type NotifyHost = (payload: unknown) => void;

type MotionKind = "static" | "projectile" | "pendulum" | "orbit" | "oscillate";

type MotionState = {
  type: MotionKind;
  /** Original motion kind — restored on reset after projectiles settle. */
  baseType: MotionKind;
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  pivot: THREE.Vector3;
  length: number;
  angle: number;
  angularVelocity: number;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  axis: THREE.Vector3;
  elapsed: number;
  /** Projectile hit the ground; stays put until reset/play. */
  settled: boolean;
};

type TrailState = {
  id: string;
  targetId: string;
  maxPoints: number;
  positions: number[];
  line: THREE.Line;
};

type ManagedObject = {
  id: string;
  object3d: THREE.Object3D;
  motion?: MotionState;
};

export type SceneBuilderOptions = {
  container: HTMLDivElement;
  notifyHost: NotifyHost;
};

/**
 * Host-owned Three.js lab that applies structured scene ops incrementally
 * without regenerating a full program per stage.
 */
export class SceneBuilder {
  readonly container: HTMLDivElement;
  private readonly notifyHost: NotifyHost;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private clock = new THREE.Clock();
  private frame = 0;
  private paused = false;
  private objects = new Map<string, ManagedObject>();
  private trails = new Map<string, TrailState>();
  private sceneControls: SceneControlsHandle | null = null;
  private disposed = false;
  private labReady = false;
  private animateCamera = createAnimateCamera(THREE);
  private paramBindings = new Map<string, (value: number) => void>();

  constructor(options: SceneBuilderOptions) {
    this.container = options.container;
    this.notifyHost = options.notifyHost;
  }

  get isDisposed() {
    return this.disposed;
  }

  apply(doc: SceneOpsDocument): void {
    if (this.disposed) return;
    for (const op of doc.ops) {
      this.applyOp(op);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    if (typeof globalThis.__cameraAnimCancel === "function") {
      try {
        globalThis.__cameraAnimCancel();
      } catch {
        // ignore
      }
      globalThis.__cameraAnimCancel = undefined;
    }
    this.controls?.dispose();
    this.renderer?.dispose();
    this.sceneControls?.dispose();
    this.sceneControls = null;
    this.objects.clear();
    this.trails.clear();
    this.container.replaceChildren();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
  }

  private applyOp(op: SceneOp): void {
    switch (op.op) {
      case "ensureLab":
        this.ensureLab(op.grid !== false, op.clearColor ?? 0x050508);
        break;
      case "addObject":
        this.addObject(op);
        break;
      case "addArrow":
        this.addArrow(op);
        break;
      case "addTrail":
        this.addTrail(op);
        break;
      case "setMotion":
        this.setMotion(op);
        break;
      case "setOverlay":
        this.setOverlay(op);
        break;
      case "focusCamera":
        this.focusCamera(op);
        break;
      case "remove":
        this.remove(op.id);
        break;
    }
  }

  private ensureLab(grid: boolean, clearColor: number): void {
    if (this.labReady && this.renderer && this.scene) return;

    this.container.replaceChildren();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(clearColor);
    scene.fog = new THREE.Fog(clearColor, 12, 40);

    const camera = new THREE.PerspectiveCamera(
      55,
      this.container.clientWidth / Math.max(this.container.clientHeight, 1),
      0.1,
      200,
    );
    camera.position.set(6, 4, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.setClearColor(clearColor);
    this.container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const key = new THREE.DirectionalLight(0xc4d4ff, 0.7);
    key.position.set(5, 10, 6);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.25);
    fill.position.set(-6, 3, -4);
    scene.add(ambient, key, fill);

    if (grid) {
      const gridHelper = new THREE.GridHelper(30, 30, 0x243049, 0x1a2030);
      scene.add(gridHelper);
    }

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: 0x0b1020,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1.5;
    controls.maxDistance = 40;

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.labReady = true;
    this.clock.start();

    window.addEventListener("resize", this.onResize);
    this.tick();

    globalThis.__canvasDispose = () => this.dispose();
  }

  private onResize = () => {
    if (!this.camera || !this.renderer || !this.container.clientWidth) return;
    this.camera.aspect =
      this.container.clientWidth / Math.max(this.container.clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight,
    );
  };

  private tick = () => {
    if (this.disposed || !this.renderer || !this.scene || !this.camera) return;
    this.frame = requestAnimationFrame(this.tick);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) {
      this.updateMotions(dt);
      this.updateTrails();
    }

    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };

  private addObject(op: Extract<SceneOp, { op: "addObject" }>): void {
    this.ensureLab(true, 0x050508);
    if (!this.scene) return;

    this.remove(op.id);

    let object3d: THREE.Object3D;
    const color = op.color ?? 0x38bdf8;
    const opacity = op.opacity ?? 1;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      metalness: 0.15,
      transparent: opacity < 1,
      opacity,
    });

    switch (op.kind) {
      case "sphere": {
        const size = op.size ?? 0.35;
        object3d = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), material);
        break;
      }
      case "box": {
        const size = op.size ?? 0.6;
        object3d = new THREE.Mesh(
          new THREE.BoxGeometry(size, size, size),
          material,
        );
        break;
      }
      case "plane": {
        const size = op.size ?? 4;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(size, size),
          material,
        );
        mesh.rotation.x = -Math.PI / 2;
        object3d = mesh;
        break;
      }
      case "cylinder": {
        const size = op.size ?? 0.25;
        object3d = new THREE.Mesh(
          new THREE.CylinderGeometry(size, size, (op.scale?.[1] ?? 1) * 1.2, 24),
          material,
        );
        break;
      }
      case "line": {
        const from = op.from ?? [0, 0, 0];
        const to = op.to ?? [1, 1, 0];
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...from),
          new THREE.Vector3(...to),
        ]);
        object3d = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color }),
        );
        break;
      }
    }

    if (op.position) object3d.position.set(...op.position);
    if (op.rotation && op.kind !== "plane") {
      object3d.rotation.set(...op.rotation);
    }
    if (op.scale) object3d.scale.set(...op.scale);

    this.scene.add(object3d);
    this.objects.set(op.id, { id: op.id, object3d });
  }

  private addArrow(op: Extract<SceneOp, { op: "addArrow" }>): void {
    this.ensureLab(true, 0x050508);
    if (!this.scene) return;

    this.remove(op.id);

    const dir = new THREE.Vector3(...op.direction);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const length = op.length ?? 1.5;
    const color = op.color ?? 0xfbbf24;
    const arrow = new THREE.ArrowHelper(
      dir,
      new THREE.Vector3(...op.origin),
      length,
      color,
      length * 0.2,
      length * 0.12,
    );
    arrow.name = op.id;
    this.scene.add(arrow);
    this.objects.set(op.id, { id: op.id, object3d: arrow });

    if (op.label) {
      // Labels are shown via overlay readouts rather than 3D sprites for clarity.
    }
  }

  private addTrail(op: Extract<SceneOp, { op: "addTrail" }>): void {
    this.ensureLab(true, 0x050508);
    if (!this.scene) return;

    this.remove(op.id);

    const maxPoints = op.maxPoints ?? 120;
    const positions: number[] = [];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(maxPoints * 3), 3),
    );
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: op.color ?? 0x67e8f9,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.scene.add(line);
    this.trails.set(op.id, {
      id: op.id,
      targetId: op.targetId,
      maxPoints,
      positions,
      line,
    });
    this.objects.set(op.id, { id: op.id, object3d: line });
  }

  private setMotion(op: Extract<SceneOp, { op: "setMotion" }>): void {
    const managed = this.objects.get(op.id);
    if (!managed) return;

    const origin = op.origin
      ? new THREE.Vector3(...op.origin)
      : managed.object3d.position.clone();

    managed.motion = {
      type: op.type,
      baseType: op.type,
      origin,
      velocity: new THREE.Vector3(...(op.velocity ?? [0, 0, 0])),
      gravity: op.gravity ?? 9.8,
      pivot: new THREE.Vector3(...(op.pivot ?? [0, 3, 0])),
      length: op.length ?? 2,
      angle: op.angle ?? Math.PI / 4,
      angularVelocity: 0,
      center: new THREE.Vector3(...(op.center ?? [0, 0, 0])),
      radius: op.radius ?? 2,
      speed: op.speed ?? 1,
      axis: new THREE.Vector3(...(op.axis ?? [1, 0, 0])).normalize(),
      elapsed: 0,
      settled: false,
    };

    if (op.type === "static") {
      managed.object3d.position.copy(origin);
    }
  }

  private setOverlay(op: Extract<SceneOp, { op: "setOverlay" }>): void {
    this.ensureLab(true, 0x050508);
    if (!this.scene || !this.camera || !this.renderer || !this.controls) return;

    this.sceneControls?.dispose();
    this.sceneControls = createSceneControls(THREE, {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controls: this.controls,
      position: op.position,
      title: op.title,
      readouts: op.readouts,
      showButtons: op.showControls !== false,
      slider: op.slider,
      notifyHost: this.notifyHost,
      onPlay: () => {
        this.playMotions();
      },
      onPause: () => {
        this.paused = true;
      },
      onReset: () => {
        this.resetMotions();
      },
      onSlider: (id, value) => {
        const bind = this.paramBindings.get(id);
        bind?.(value);
      },
    });
  }

  private focusCamera(op: Extract<SceneOp, { op: "focusCamera" }>): void {
    this.ensureLab(true, 0x050508);
    if (!this.camera || !this.controls) return;

    const duration = op.duration ?? 0;
    if (duration <= 0.05) {
      this.camera.position.set(...op.position);
      this.controls.target.set(...op.target);
      this.controls.update();
      return;
    }

    this.animateCamera(
      this.camera,
      this.controls,
      [
        {
          position: [
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
          ],
          target: [
            this.controls.target.x,
            this.controls.target.y,
            this.controls.target.z,
          ],
          t: 0,
        },
        { position: op.position, target: op.target, t: 1 },
      ],
      duration,
    );
  }

  private remove(id: string): void {
    const managed = this.objects.get(id);
    if (managed && this.scene) {
      this.scene.remove(managed.object3d);
      disposeObject3d(managed.object3d);
      this.objects.delete(id);
    }
    const trail = this.trails.get(id);
    if (trail && this.scene) {
      this.scene.remove(trail.line);
      trail.line.geometry.dispose();
      (trail.line.material as THREE.Material).dispose();
      this.trails.delete(id);
    }
  }

  private updateMotions(dt: number): void {
    for (const managed of this.objects.values()) {
      const motion = managed.motion;
      if (!motion || motion.type === "static" || motion.settled) continue;
      motion.elapsed += dt;
      const obj = managed.object3d;

      switch (motion.type) {
        case "projectile": {
          const t = motion.elapsed;
          const x = motion.origin.x + motion.velocity.x * t;
          const y =
            motion.origin.y +
            motion.velocity.y * t -
            0.5 * motion.gravity * t * t;
          const z = motion.origin.z + motion.velocity.z * t;
          if (y < 0) {
            obj.position.set(x, 0, z);
            motion.settled = true;
          } else {
            obj.position.set(x, y, z);
          }
          break;
        }
        case "pendulum": {
          const g = motion.gravity;
          const L = motion.length;
          const omega = Math.sqrt(g / L);
          const theta = motion.angle * Math.cos(omega * motion.elapsed);
          obj.position.set(
            motion.pivot.x + L * Math.sin(theta),
            motion.pivot.y - L * Math.cos(theta),
            motion.pivot.z,
          );
          break;
        }
        case "orbit": {
          const a = motion.speed * motion.elapsed;
          obj.position.set(
            motion.center.x + motion.radius * Math.cos(a),
            motion.center.y,
            motion.center.z + motion.radius * Math.sin(a),
          );
          break;
        }
        case "oscillate": {
          const amp = motion.length;
          const s = Math.sin(motion.speed * motion.elapsed) * amp;
          obj.position.set(
            motion.origin.x + motion.axis.x * s,
            motion.origin.y + motion.axis.y * s,
            motion.origin.z + motion.axis.z * s,
          );
          break;
        }
      }
    }
  }

  private updateTrails(): void {
    for (const trail of this.trails.values()) {
      const target = this.objects.get(trail.targetId);
      if (!target) continue;
      const p = target.object3d.position;
      trail.positions.push(p.x, p.y, p.z);
      const maxFloats = trail.maxPoints * 3;
      if (trail.positions.length > maxFloats) {
        trail.positions.splice(0, trail.positions.length - maxFloats);
      }
      const attr = trail.line.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < trail.positions.length; i++) {
        arr[i] = trail.positions[i]!;
      }
      attr.needsUpdate = true;
      trail.line.geometry.setDrawRange(0, trail.positions.length / 3);
    }
  }

  /** Resume playback; restart any settled projectiles so Play works after landing. */
  private playMotions(): void {
    let needsRestart = false;
    for (const managed of this.objects.values()) {
      const motion = managed.motion;
      if (!motion) continue;
      if (motion.settled || (motion.baseType !== "static" && motion.type === "static")) {
        needsRestart = true;
        break;
      }
    }
    if (needsRestart) {
      this.resetMotions();
      return;
    }
    this.paused = false;
  }

  private resetMotions(): void {
    for (const managed of this.objects.values()) {
      const motion = managed.motion;
      if (!motion) continue;
      motion.type = motion.baseType;
      motion.elapsed = 0;
      motion.settled = false;
      managed.object3d.position.copy(motion.origin);
    }
    for (const trail of this.trails.values()) {
      trail.positions.length = 0;
      trail.line.geometry.setDrawRange(0, 0);
    }
    this.paused = false;
  }
}

function disposeObject3d(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}
