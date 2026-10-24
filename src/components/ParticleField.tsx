import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

export default function ParticleField({ count = 20, className = '' }: ParticleFieldProps) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 4,
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 5,
      drift: (Math.random() - 0.5) * 40,
    }));
  }, [count]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-sky/30"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            filter: 'blur(0.5px)',
          }}
          animate={{
            y: [0, -60, 0],
            x: [0, p.drift, 0],
            opacity: [0, 0.6, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
