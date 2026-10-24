import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles, Float } from '@react-three/drei';
import * as THREE from 'three';

function MandalaRing({
  radius,
  segments,
  color,
  speed,
  offset,
  y,
}: {
  radius: number;
  segments: number;
  color: string;
  speed: number;
  offset: number;
  y: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.z = t * speed + offset;
    ref.current.position.y = y + Math.sin(t * 0.8 + offset) * 0.1;
  });

  const dots = useMemo(() => {
    return Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        key: i,
      };
    });
  }, [radius, segments]);

  return (
    <group ref={ref}>
      {/* Circle line */}
      <mesh rotation={[0, 0, 0]}>
        <ringGeometry args={[radius - 0.01, radius + 0.01, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      {/* Dots around the ring */}
      {dots.map((d) => (
        <mesh key={d.key} position={[d.x, d.y, 0]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function MandalaPetals({
  radius,
  count,
  color,
  speed,
  y,
}: {
  radius: number;
  count: number;
  color: string;
  speed: number;
  y: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * speed;
  });

  return (
    <group ref={ref} position={[0, y, 0]}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
            rotation={[0, 0, angle + Math.PI / 2]}
          >
            <coneGeometry args={[0.12, 0.3, 4]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function CentralOm({ reduced }: { reduced: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (lightRef.current) {
      lightRef.current.intensity = 2 + Math.sin(t * 4) * 0.5;
    }
    if (coreRef.current) {
      const s = 1 + Math.sin(t * 3) * 0.08;
      coreRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.25, 24, 24]} />
        <meshBasicMaterial color="#FFD21F" transparent opacity={0.9} />
      </mesh>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color="#FFD21F" transparent opacity={0.15} />
      </mesh>
      <pointLight ref={lightRef} color="#13BBE8" intensity={2} distance={6} decay={2} />
    </group>
  );
}

interface MandalaSceneProps {
  reduced: boolean;
}

export default function MandalaScene({ reduced }: MandalaSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.3} color="#0A7FA6" />
      <Suspense fallback={null}>
        <Float speed={reduced ? 0 : 1} rotationIntensity={0} floatIntensity={reduced ? 0 : 0.2}>
          {/* Concentric rotating rings */}
          <MandalaRing radius={1.5} segments={12} color="#13BBE8" speed={0.3} offset={0} y={0} />
          <MandalaRing radius={2.0} segments={16} color="#EE2C8F" speed={-0.2} offset={Math.PI / 6} y={0} />
          <MandalaRing radius={2.5} segments={24} color="#FFD21F" speed={0.15} offset={Math.PI / 4} y={0} />
          {/* Petal layers */}
          <MandalaPetals radius={1.8} count={8} color="#EE2C8F" speed={0.25} y={0} />
          <MandalaPetals radius={2.3} count={12} color="#13BBE8" speed={-0.18} y={0} />
          {/* Central glowing core */}
          <CentralOm reduced={reduced} />
        </Float>
        {!reduced && (
          <Sparkles count={50} scale={[6, 6, 3]} size={3} speed={0.3} opacity={0.5} color="#FFD21F" />
        )}
      </Suspense>
    </Canvas>
  );
}
