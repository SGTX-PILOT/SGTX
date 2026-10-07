"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Reflection Pool — React Three Fiber WebGL Canvas
// ═══════════════════════════════════════════════════════════════════════════════
//
// Rule 3 (Localized Shader Acceleration): The WebGL canvas is STRICTLY
// confined to this reflection pool component. GPU cycles are spent solely
// on rendering dynamic liquid water effects — NOT drawing flat UI text.
//
// The pool sits at the bottom of the landing page as a cinematic capstone.

import { Canvas, useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial, Environment } from "@react-three/drei";
import { useRef, useMemo } from "react";
import * as THREE from "three";

// ── Animated floating geometric shapes above the pool ─────────────────────
function FloatingShapes() {
  const groupRef = useRef<THREE.Group>(null);

  const shapes = useMemo(() => {
    const items = [];
    const geometries = [
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.TetrahedronGeometry(0.35, 0),
      new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.DodecahedronGeometry(0.25, 0),
    ];
    for (let i = 0; i < 6; i++) {
      items.push({
        geo: geometries[i % geometries.length],
        pos: [
          (Math.random() - 0.5) * 8,
          Math.random() * 2 + 0.5,
          (Math.random() - 0.5) * 4 - 2,
        ] as [number, number, number],
        speed: 0.3 + Math.random() * 0.5,
        rotSpeed: 0.01 + Math.random() * 0.02,
      });
    }
    return items;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      child.position.y = shapes[i].pos[1] + Math.sin(t * shapes[i].speed + i) * 0.3;
      child.rotation.x += shapes[i].rotSpeed;
      child.rotation.y += shapes[i].rotSpeed * 1.3;
    });
  });

  return (
    <group ref={groupRef}>
      {shapes.map((s, i) => (
        <mesh key={i} geometry={s.geo} position={s.pos}>
          <meshStandardMaterial
            color={i % 2 === 0 ? "#3b82f6" : "#8b5cf6"}
            metalness={0.8}
            roughness={0.2}
            transparent
            opacity={0.7}
            emissive={i % 2 === 0 ? "#1e40af" : "#6d28d9"}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── The reflective water plane ─────────────────────────────────────────────
function ReflectiveSurface() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
      <planeGeometry args={[20, 6, 1, 1]} />
      <MeshReflectorMaterial
        blur={[400, 100]}
        resolution={1024}
        mixBlur={1}
        mixStrength={3}
        roughness={0.7}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.2}
        color="#020617"
        metalness={0.6}
        mirror={0.5}
      />
    </mesh>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function ReflectionPool() {
  return (
    <Canvas
      camera={{ position: [0, 1, 5], fov: 50 }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 8, 5]} intensity={0.6} color="#60a5fa" />
      <pointLight position={[-5, 3, 2]} intensity={0.4} color="#a78bfa" />

      {/* Environment for reflections */}
      <Environment preset="night" />

      {/* Floating shapes above the pool */}
      <FloatingShapes />

      {/* The reflective water surface */}
      <ReflectiveSurface />

      {/* Subtle fog for depth */}
      <fog attach="fog" args={["#020617", 8, 20]} />
    </Canvas>
  );
}
