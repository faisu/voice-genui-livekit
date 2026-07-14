"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, MeshDistortMaterial } from "@react-three/drei";
import { useSpring, a } from "@react-spring/three";
import { Suspense, useRef, useState } from "react";
import type { Mesh } from "three";

const AnimatedMaterial = a(MeshDistortMaterial);

type OrbMeshProps = {
  agentState: string;
  onClick?: () => void;
  interactive: boolean;
};

function OrbMesh({ agentState, onClick, interactive }: OrbMeshProps) {
  const sphereRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const speaking = agentState === "speaking";
  const listening = agentState === "listening";
  const thinking = agentState === "thinking";

  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.position.y = Math.sin(state.clock.elapsedTime / 1.5) * 0.06;
    }
  });

  const [{ wobble, coat, color, env }] = useSpring(
    {
      wobble: pressed ? 1.15 : hovered ? 1.08 : speaking ? 1.1 : 1,
      coat: hovered ? 1 : 0.85,
      env: speaking ? 1.2 : listening ? 1 : thinking ? 0.9 : 0.75,
      color: hovered ? "#a5f3fc" : speaking ? "#7dd3fc" : listening ? "#67e8f9" : "#7dd3fc",
      config: (key) =>
        key === "wobble" && hovered ? { mass: 2, tension: 1000, friction: 10 } : {},
    },
    [hovered, pressed, speaking, listening, thinking],
  );

  const distortSpeed = speaking ? 4 : listening ? 2.5 : thinking ? 2 : 1.5;
  const distortAmount = speaking ? 0.5 : hovered ? 0.45 : 0.35;

  return (
    <>
      <Suspense fallback={null}>
        <Environment preset="warehouse" />
      </Suspense>
      <ambientLight intensity={0.4} />
      <pointLight
        position={[0, 0, 2]}
        intensity={speaking ? 3 : listening ? 2 : 1.5}
        color="#38bdf8"
        distance={6}
      />

      <a.mesh
        ref={sphereRef}
        scale={wobble}
        onPointerOver={() => interactive && setHovered(true)}
        onPointerOut={() => {
          setHovered(false);
          setPressed(false);
        }}
        onPointerDown={() => interactive && setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onClick={
          interactive && onClick
            ? (event) => {
                event.stopPropagation();
                onClick();
              }
            : undefined
        }
      >
        <sphereGeometry args={[0.55, 64, 64]} />
        <AnimatedMaterial
          color={color}
          speed={distortSpeed}
          distort={distortAmount}
          radius={1}
          envMapIntensity={env}
          clearcoat={coat}
          clearcoatRoughness={0}
          metalness={0.1}
        />
      </a.mesh>
    </>
  );
}

type ScreenAgentOrbProps = {
  agentState: string;
  chatMinimized?: boolean;
  onClick?: () => void;
};

export function ScreenAgentOrb({ agentState, chatMinimized, onClick }: ScreenAgentOrbProps) {
  const interactive = Boolean(chatMinimized && onClick);
  const label =
    agentState === "speaking"
      ? "Speaking"
      : agentState === "listening"
        ? "Listening"
        : agentState === "thinking"
          ? "Thinking"
          : "Teacher";

  return (
    <div
      className={`pointer-events-none fixed bottom-6 right-6 z-30 ${
        interactive ? "pointer-events-auto cursor-pointer" : ""
      }`}
      aria-hidden={!interactive}
    >
      <div className="relative h-[88px] w-[88px]">
        <div
          className={`absolute inset-0 rounded-full transition-opacity ${
            speakingOrListening(agentState) ? "opacity-100" : "opacity-60"
          }`}
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
          }}
        />
        <Canvas
          camera={{ position: [0, 0, 2.2], fov: 45 }}
          className="h-full w-full"
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <OrbMesh agentState={agentState} onClick={onClick} interactive={interactive} />
        </Canvas>
      </div>
      {chatMinimized && (
        <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          {label}
        </p>
      )}
    </div>
  );
}

function speakingOrListening(agentState: string) {
  return agentState === "speaking" || agentState === "listening";
}
