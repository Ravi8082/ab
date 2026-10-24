import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';

const HeroScene = lazy(() => import('./HeroScene'));

function FallbackGradient() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 rounded-full bg-saffron/20 blur-3xl animate-glow-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-16 bg-gradient-to-t from-saffron via-marigold to-ivory rounded-full opacity-80 animate-flicker" />
        </div>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-sky/40 blur-md" />
      </div>
    </div>
  );
}

export default function Hero() {
  const { lang, reducedMotion } = useApp();
  const [sunriseVisible, setSunriseVisible] = useState(true);
  const [webglOk, setWebglOk] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setWebglOk(false);
    } catch {
      setWebglOk(false);
    }
    const timer = setTimeout(() => setSunriseVisible(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  const scrollToSundarkand = () => {
    document.getElementById('sundarkand')?.scrollIntoView({ behavior: 'smooth' });
  };
  const scrollToExpo = () => {
    document.getElementById('expo')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative h-screen min-h-[640px] w-full overflow-hidden bg-sindoor-deep text-white">
      {/* Night sky gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-sindoor-deep via-sindoor to-navy-800" />
      {/* Aurora glow layers */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] rounded-full bg-gradient-to-r from-saffron/8 via-sky/6 to-saffron/8 blur-3xl animate-aurora" />
        <div className="absolute top-1/3 left-1/4 w-[50vw] h-[40vh] rounded-full bg-gradient-to-r from-navy-600/10 to-sky/5 blur-3xl animate-aurora" style={{ animationDelay: '2s' }} />
      </div>
      {/* Sunrise glow */}
      <motion.div
        className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at bottom, rgba(238,44,143,0.4), rgba(255,210,31,0.15) 40%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={sunriseVisible ? { opacity: 1, scale: 1.2 } : { opacity: 0.15, scale: 1 }}
        transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* 3D Scene */}
      {webglOk ? (
        <div className="absolute inset-0">
          <Suspense fallback={<FallbackGradient />}>
            <HeroScene reduced={reducedMotion} />
          </Suspense>
        </div>
      ) : (
        <FallbackGradient />
      )}

      {/* Vignette for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-sindoor-deep/80 via-transparent to-sindoor-deep/40 pointer-events-none" />

      {/* Hero text */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center">
        <motion.p
          className="font-hindi text-lg sm:text-xl md:text-2xl text-marigold mb-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          {ui.hero.titleHi}
        </motion.p>
        <motion.h1
          className="font-display text-4xl sm:text-6xl md:text-7xl lg:text-[var(--fs-hero)] text-white"
          style={{ lineHeight: 1.08 }}
          initial={{ filter: 'blur(20px)', opacity: 0, scale: 1.05 }}
          animate={{ filter: 'blur(0px)', opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        >
          {ui.hero.titleEn}
        </motion.h1>

        <motion.p
          className="mt-6 max-w-2xl text-base sm:text-lg md:text-[var(--fs-lead)] text-cream-on-dark font-body font-light"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {uiT(ui.hero.subtitle, lang)}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <button
            onClick={scrollToSundarkand}
            className="px-8 py-3.5 rounded-full bg-grad-hand text-white font-ui font-semibold text-base shadow-lg shadow-saffron/30 hover:shadow-saffron/50 hover:scale-105 transition-all duration-300 ease-smooth"
          >
            {uiT(ui.nav.sundarkand, lang)}
          </button>
          <button
            onClick={scrollToExpo}
            className="px-8 py-3.5 rounded-full border border-sky/40 text-sky-light font-ui font-semibold text-base hover:bg-sky/10 hover:border-sky/70 transition-all duration-300 ease-smooth"
          >
            {uiT(ui.nav.expo, lang)}
          </button>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.button
        onClick={scrollToSundarkand}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-sky/60 hover:text-sky transition-colors"
        animate={reducedMotion ? {} : { y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Scroll down"
      >
        <ChevronDown size={28} />
      </motion.button>
    </section>
  );
}
