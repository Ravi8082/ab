import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Sparkles, Environment } from '@react-three/drei';
import * as THREE from 'three';

function Diya() {
  const flameRef = useRef<THREE.Mesh>(null);
  const flameCoreRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flicker = Math.sin(t * 8) * 0.06 + Math.sin(t * 13) * 0.03 + Math.sin(t * 21) * 0.02;
    if (flameRef.current) {
      const scale = 1 + flicker;
      flameRef.current.scale.set(scale, 1 + Math.sin(t * 6) * 0.12 + Math.sin(t * 15) * 0.05, scale);
      flameRef.current.rotation.y = Math.sin(t * 2) * 0.06;
      flameRef.current.rotation.z = Math.sin(t * 3) * 0.04;
    }
    if (flameCoreRef.current) {
      const cs = 1 + Math.sin(t * 18) * 0.08;
      flameCoreRef.current.scale.set(cs, 1 + Math.sin(t * 14) * 0.1, cs);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 3 + Math.sin(t * 10) * 0.8 + Math.sin(t * 17) * 0.4;
    }
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(t * 5) * 0.05;
    }
    if (haloRef.current) {
      haloRef.current.rotation.z = t * 0.3;
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * 4) * 0.03;
    }
  });

  return (
    <group>
      {/* Lotus base petals */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 1.15, -0.55, Math.sin(angle) * 1.15]}
            rotation={[0, -angle, 0.3]}
          >
            <coneGeometry args={[0.28, 0.5, 4]} />
            <meshStandardMaterial color="#13BBE8" metalness={0.35} roughness={0.4} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* Diya bowl - lower half */}
      <mesh rotation={[0, 0, 0]} position={[0, -0.5, 0]}>
        <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#F39A1E" metalness={0.45} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      {/* Bowl rim */}
      <mesh position={[0, -0.5, 0]}>
        <torusGeometry args={[1, 0.04, 8, 32]} />
        <meshStandardMaterial color="#FFD21F" metalness={0.5} roughness={0.25} />
      </mesh>
      {/* Oil surface glow */}
      <mesh ref={glowRef} position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.25} />
      </mesh>
      {/* Rotating halo ring */}
      <mesh ref={haloRef} position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.015, 8, 64]} />
        <meshBasicMaterial color="#5BD4F0" transparent opacity={0.1} />
      </mesh>
      {/* Flame outer */}
      <mesh ref={flameRef} position={[0, 0.15, 0]}>
        <coneGeometry args={[0.17, 0.7, 16]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.85} />
      </mesh>
      {/* Flame inner core */}
      <mesh ref={flameCoreRef} position={[0, 0.08, 0]}>
        <coneGeometry args={[0.09, 0.4, 12]} />
        <meshBasicMaterial color="#FFD21F" transparent opacity={0.95} />
      </mesh>
      {/* Flickering point lights */}
      <pointLight ref={lightRef} position={[0, 0.4, 0]} color="#EE2C8F" intensity={3} distance={10} decay={2} />
      <pointLight position={[0, 0.3, 0]} color="#13BBE8" intensity={1.2} distance={5} decay={2} />
      <pointLight position={[0, -0.3, 0]} color="#EE2C8F" intensity={0.8} distance={3} decay={2} />
    </group>
  );
}

function Embers({ count = 500 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const actualCount = isMobile ? Math.floor(count / 3) : count;

  const { geometry, speeds } = useMemo(() => {
    const arr = new Float32Array(actualCount * 3);
    const velocities = new Float32Array(actualCount);
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 7;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = -3 + Math.random() * 7;
      arr[i * 3 + 2] = Math.sin(angle) * radius - 1;
      velocities[i] = 0.005 + Math.random() * 0.012;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return { geometry: geo, speeds: velocities };
  }, [actualCount]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const posAttr = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < actualCount; i++) {
      arr[i * 3 + 1] += speeds[i] + Math.sin(t + i) * 0.003;
      if (arr[i * 3 + 1] > 4.5) arr[i * 3 + 1] = -3;
      arr[i * 3] += Math.sin(t * 0.5 + i) * 0.0015;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        color="#5BD4F0"
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function Petals({ count = 30 }: { count?: number }) {
  const ref = useRef<THREE.Group>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const actualCount = isMobile ? Math.floor(count / 2) : count;

  const petals = useMemo(() => {
    return Array.from({ length: actualCount }, (_, i) => ({
      id: i,
      angle: Math.random() * Math.PI * 2,
      radius: 3 + Math.random() * 5,
      yStart: 5 + Math.random() * 3,
      speed: 0.003 + Math.random() * 0.005,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      size: 0.1 + Math.random() * 0.08,
    }));
  }, [actualCount]);

  useFrame(() => {
    if (!ref.current || ref.current.children.length === 0) return;
    ref.current.children.forEach((child, i) => {
      const p = petals[i];
      if (!p) return;
      child.position.y -= p.speed;
      child.rotation.z += p.rotSpeed;
      child.rotation.x += p.rotSpeed * 0.5;
      if (child.position.y < -3) child.position.y = p.yStart;
    });
  });

  return (
    <group ref={ref}>
      {petals.map((p) => (
        <mesh
          key={p.id}
          position={[Math.cos(p.angle) * p.radius, p.yStart, Math.sin(p.angle) * p.radius - 1]}
        >
          <coneGeometry args={[p.size, p.size * 2, 4]} />
          <meshStandardMaterial color="#EE2C8F" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function CameraParallax({ reduced }: { reduced: boolean }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 7));

  useFrame((state) => {
    if (reduced) return;
    const x = state.pointer.x * 0.6;
    const y = state.pointer.y * 0.4;
    target.current.set(x, y, 7);
    camera.position.lerp(target.current, 0.04);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

interface HeroSceneProps {
  reduced: boolean;
}

export default function HeroScene({ reduced }: HeroSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <fog attach="fog" args={['#0A1830', 8, 18]} />
      <CameraParallax reduced={reduced} />
      <ambientLight intensity={0.35} color="#0A7FA6" />
      <directionalLight position={[3, 4, 5]} intensity={1.6} color="#FFD21F" />
      <directionalLight position={[-4, -1, 3]} intensity={0.9} color="#EE2C8F" />
      <directionalLight position={[0, 3, -4]} intensity={0.6} color="#13BBE8" />
      <Suspense fallback={null}>
        <Float
          speed={reduced ? 0 : 1.5}
          rotationIntensity={reduced ? 0 : 0.35}
          floatIntensity={reduced ? 0 : 0.5}
          position={[0, -2.5, 0]}
          scale={0.62}
        >
          <Diya />
        </Float>
        {!reduced && <Embers count={500} />}
        {!reduced && <Petals count={30} />}
        {!reduced && (
          <Sparkles
            count={80}
            scale={[12, 7, 5]}
            size={4}
            speed={0.3}
            opacity={0.5}
            color="#FFD21F"
          />
        )}
        {!reduced && <Environment preset="night" />}
      </Suspense>
    </Canvas>
  );
}
