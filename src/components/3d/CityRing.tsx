import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import type { CityItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { formatEventDate } from '@/lib/format';

interface OrbProps {
  city: CityItem;
  index: number;
  total: number;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onSelect: (city: CityItem) => void;
  lang: 'en' | 'hi';
}

function CityOrb({ city, index, total, hovered, setHovered, onSelect, lang }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const angle = (index / total) * Math.PI * 2;
  const radius = 4.5;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const seatsLeft = city.capacity - city.booked;
  const soldOut = seatsLeft <= 0;
  const isHovered = hovered === city.id;

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const baseY = 0.5 + Math.sin(t * 0.8 + index) * 0.1;
    meshRef.current.position.y = isHovered ? baseY + 0.3 : baseY;
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isHovered ? 0.5 : soldOut ? 0.05 : 0.2;
    }
    const targetScale = isHovered ? 1.4 : soldOut ? 0.7 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
  });

  return (
    <group position={[x, 0.5, z]}>
      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial
          color={soldOut ? '#0A7FA6' : isHovered ? '#EE2C8F' : '#13BBE8'}
          transparent
          opacity={0.2}
        />
      </mesh>
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(city.id);
        }}
        onPointerOut={() => setHovered(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (!soldOut) onSelect(city);
        }}
      >
        <sphereGeometry args={[0.4, 24, 24]} />
        <meshPhysicalMaterial
          color={soldOut ? '#0A7FA6' : '#13BBE8'}
          metalness={0.3}
          roughness={0.1}
          transmission={soldOut ? 0 : 0.7}
          thickness={0.5}
          clearcoat={1}
          clearcoatRoughness={0.1}
          emissive={soldOut ? '#000000' : isHovered ? '#EE2C8F' : '#0A7FA6'}
          emissiveIntensity={isHovered ? 0.5 : 0.2}
          opacity={soldOut ? 0.4 : 1}
          transparent
        />
      </mesh>
      <Html position={[0, -0.8, 0]} center distanceFactor={8} occlude>
        <div className={`pointer-events-none whitespace-nowrap text-center transition-all ${isHovered ? 'scale-110' : ''}`}>
          <p className={`text-xs font-mukta font-semibold ${soldOut ? 'text-ivory/30' : 'text-ivory/80'}`}>
            {city.city}
          </p>
          <p className={`text-[10px] font-mukta ${soldOut ? 'text-ivory/20' : 'text-ivory/40'}`}>
            {city.state}
          </p>
          {isHovered && !soldOut && (
            <div className="mt-1 px-2 py-1 rounded-md bg-navy-900/90 border border-gold/30">
              <p className="text-[10px] text-gold-light">{formatEventDate(city.date, lang)}</p>
              <p className="text-[10px] text-ivory/60">{seatsLeft} {uiT(ui.sundarkand.seatsLeft, lang)}</p>
            </div>
          )}
          {soldOut && (
            <p className="text-[10px] text-red-400/70 font-mukta">{uiT(ui.sundarkand.soldOut, lang)}</p>
          )}
        </div>
      </Html>
    </group>
  );
}

function RingGroup({
  cities,
  hovered,
  setHovered,
  onSelect,
  autoRotate,
}: {
  cities: CityItem[];
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onSelect: (city: CityItem) => void;
  autoRotate: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { lang } = useApp();

  useFrame((_, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {cities.map((city, i) => (
        <CityOrb
          key={city.id}
          city={city}
          index={i}
          total={cities.length}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={onSelect}
          lang={lang}
        />
      ))}
      {/* Ring base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <ringGeometry args={[4.3, 4.7, 64]} />
        <meshBasicMaterial color="#13BBE8" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Outer energy ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}>
        <ringGeometry args={[4.8, 5.0, 64]} />
        <meshBasicMaterial color="#EE2C8F" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      {/* Center glowing disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#13BBE8" transparent opacity={0.05} />
      </mesh>
    </group>
  );
}

interface CityRingProps {
  cities: CityItem[];
  onSelect: (city: CityItem) => void;
  reduced: boolean;
}

export default function CityRing({ cities, onSelect, reduced }: CityRingProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const lights = useMemo(
    () => (
      <>
        <ambientLight intensity={0.3} color="#0A7FA6" />
        <pointLight position={[0, 5, 0]} color="#13BBE8" intensity={2} distance={15} />
        <pointLight position={[5, 2, 5]} color="#EE2C8F" intensity={1} distance={10} />
      </>
    ),
    []
  );

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 4, 9], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={['#0A1830', 10, 20]} />
      {lights}
      <Suspense fallback={null}>
        <RingGroup
          cities={cities}
          hovered={hovered}
          setHovered={setHovered}
          onSelect={onSelect}
          autoRotate={!reduced}
        />
        {!reduced && (
          <Sparkles count={40} scale={[10, 6, 6]} size={2} speed={0.3} opacity={0.4} color="#FFD21F" />
        )}
      </Suspense>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.5}
        minPolarAngle={Math.PI / 3.5}
        maxPolarAngle={Math.PI / 2.2}
      />
    </Canvas>
  );
}
