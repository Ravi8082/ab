import { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function YajnaKund() {
  const flame1Ref = useRef<THREE.Mesh>(null);
  const flame2Ref = useRef<THREE.Mesh>(null);
  const flame3Ref = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (flame1Ref.current) {
      const s = 1 + Math.sin(t * 10) * 0.15 + Math.sin(t * 17) * 0.08 + Math.sin(t * 23) * 0.04;
      flame1Ref.current.scale.set(0.8 + s * 0.2, s, 0.8 + s * 0.2);
      flame1Ref.current.rotation.y = Math.sin(t * 2) * 0.05;
    }
    if (flame2Ref.current) {
      const s = 1 + Math.sin(t * 12 + 1) * 0.12;
      flame2Ref.current.scale.set(0.6 + s * 0.15, s * 0.8, 0.6 + s * 0.15);
    }
    if (flame3Ref.current) {
      const s = 1 + Math.sin(t * 14 + 2) * 0.1;
      flame3Ref.current.scale.set(0.5 + s * 0.1, s * 0.7, 0.5 + s * 0.1);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 3.5 + Math.sin(t * 11) * 1 + Math.sin(t * 19) * 0.4;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(t * 3) * 0.05;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.3;
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 4 + 1) * 0.03;
    }
  });

  return (
    <group position={[0, -1, 0]}>
      {/* Glowing ground rings */}
      <mesh ref={ringRef} position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.2, 64]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.5, 2.8, 64]} />
        <meshBasicMaterial color="#13BBE8" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>

      {/* Yajna kund (fire pit) - square with bevel feel */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2.2, 0.4, 2.2]} />
        <meshStandardMaterial color="#0F2342" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Kund rim gold */}
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[2.3, 0.06, 2.3]} />
        <meshStandardMaterial color="#0A7FA6" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Inner pit */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[1.6, 0.3, 1.6]} />
        <meshStandardMaterial color="#0A1830" emissive="#EE2C8F" emissiveIntensity={0.4} />
      </mesh>
      {/* Logs */}
      <mesh position={[0, 0.2, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.4, 8]} />
        <meshStandardMaterial color="#0F2342" roughness={1} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 1.4, 8]} />
        <meshStandardMaterial color="#0F2342" roughness={1} />
      </mesh>
      {/* Main flame */}
      <mesh ref={flame1Ref} position={[0, 0.9, 0]}>
        <coneGeometry args={[0.38, 1.4, 12]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.85} />
      </mesh>
      {/* Inner flame */}
      <mesh position={[0, 0.75, 0]}>
        <coneGeometry args={[0.22, 0.9, 10]} />
        <meshBasicMaterial color="#FFD21F" transparent opacity={0.9} />
      </mesh>
      {/* Secondary flame */}
      <mesh ref={flame2Ref} position={[0.3, 0.65, 0.2]}>
        <coneGeometry args={[0.22, 0.8, 10]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.7} />
      </mesh>
      {/* Tertiary flame */}
      <mesh ref={flame3Ref} position={[-0.25, 0.55, -0.15]}>
        <coneGeometry args={[0.16, 0.6, 8]} />
        <meshBasicMaterial color="#F39A1E" transparent opacity={0.6} />
      </mesh>
      {/* Flickering light */}
      <pointLight ref={lightRef} position={[0, 1.5, 0]} color="#EE2C8F" intensity={3.5} distance={10} decay={2} />
      <pointLight position={[0, 1, 0]} color="#13BBE8" intensity={1.5} distance={6} />
      <pointLight position={[0, 0.5, 0]} color="#EE2C8F" intensity={1} distance={3} decay={2} />
    </group>
  );
}

function Sparks({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const count = reduced ? 0 : 120;

  const { positions, speeds } = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] = Math.random() * 2.5;
      arr[i * 3 + 2] = Math.sin(angle) * r;
      sp[i] = 0.015 + Math.random() * 0.025;
    }
    return { positions: arr, speeds: sp };
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] + Math.sin(t + i) * 0.006;
      arr[i * 3] += Math.sin(t * 0.8 + i) * 0.003;
      if (arr[i * 3 + 1] > 3.5) arr[i * 3 + 1] = 0;
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  if (reduced || count === 0) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color="#FFD21F" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

function Smoke({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const count = reduced ? 0 : 40;

  const { positions, phases } = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5;
      arr[i * 3] = Math.cos(angle) * r;
      arr[i * 3 + 1] = Math.random() * 4;
      arr[i * 3 + 2] = Math.sin(angle) * r;
      ph[i] = Math.random() * Math.PI * 2;
    }
    return { positions: arr, phases: ph };
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const arr = (ref.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += 0.008;
      arr[i * 3] += Math.sin(t * 0.5 + phases[i]) * 0.004;
      if (arr[i * 3 + 1] > 5) {
        arr[i * 3 + 1] = 0;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.5;
        arr[i * 3] = Math.cos(angle) * r;
        arr[i * 3 + 2] = Math.sin(angle) * r;
      }
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  if (reduced || count === 0) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.3} color="#0F2342" transparent opacity={0.08} blending={THREE.NormalBlending} depthWrite={false} />
    </points>
  );
}

interface YajnaSceneProps {
  reduced: boolean;
}

export default function YajnaScene({ reduced }: YajnaSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.8, 4.5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: 'none' }}
    >
      <fog attach="fog" args={['#0A1830', 6, 14]} />
      <ambientLight intensity={0.18} color="#0A7FA6" />
      <Suspense fallback={null}>
        <YajnaKund />
        <Sparks reduced={reduced} />
        <Smoke reduced={reduced} />
        {!reduced && (
          <Sparkles count={40} scale={[3.5, 3.5, 2.5]} size={3} speed={0.6} opacity={0.5} color="#EE2C8F" />
        )}
      </Suspense>
    </Canvas>
  );
}
