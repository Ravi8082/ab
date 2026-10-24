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
    <section className="relative flex min-h-[680px] flex-col justify-center overflow-hidden pb-24 pt-[calc(var(--header-h)+2rem)]"
      style={{
        minHeight: '100svh',
        background:
          'linear-gradient(180deg, #0A1830 0%, #0F2342 38%, #3B1C4A 66%, #8E1F5C 84%, #C8166F 93%, #F39A1E 100%)',
      }}
    >
      {/* Horizon sun glow */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
        style={{
          background:
            'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(255,210,31,.55) 0%, rgba(243,154,30,.32) 26%, rgba(238,44,143,.22) 52%, transparent 76%)',
        }}
      />
      {/* Star field / aurora */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 left-1/2 h-[60vh] w-[130vw] -translate-x-1/2 rounded-full bg-gradient-to-r from-sky/10 via-saffron/10 to-sky/10 blur-3xl animate-aurora" />
      </div>
      {/* Sun disc + marigold rays emblem */}
      <div className="pointer-events-none absolute left-1/2 top-[44%] grid h-[min(86vw,620px)] w-[min(86vw,620px)] -translate-x-1/2 -translate-y-1/2 place-items-center">
        <div
          className="absolute inset-0 animate-[spin_120s_linear_infinite] opacity-35"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, rgba(255,210,31,.7) 0deg 1.6deg, transparent 1.6deg 11deg)',
            WebkitMaskImage: 'radial-gradient(closest-side, transparent 40%, #000 46%, transparent 86%)',
            maskImage: 'radial-gradient(closest-side, transparent 40%, #000 46%, transparent 86%)',
          }}
        />
        <div
          className="absolute h-[52%] w-[52%] animate-glow-pulse rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,210,31,.9) 0%, rgba(243,154,30,.55) 38%, rgba(238,44,143,.35) 62%, transparent 76%)',
            filter: 'blur(10px)',
          }}
        />
      </div>

      {/* Sunrise bloom */}
      <motion.div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[420px] w-[680px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(ellipse at bottom, rgba(255,210,31,.42), rgba(238,44,143,.2) 42%, transparent 72%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={sunriseVisible ? { opacity: 1, scale: 1.15 } : { opacity: 0.55, scale: 1 }}
        transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* 3D scene */}
      {webglOk ? (
        <div className="pointer-events-none absolute inset-0">
          <Suspense fallback={<FallbackGradient />}>
            <HeroScene reduced={reducedMotion} />
          </Suspense>
        </div>
      ) : (
        <FallbackGradient />
      )}

      {/* Legibility scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sindoor-deep/70 via-transparent to-sindoor-deep/25" />

      <div className="wrap section-inner relative z-10 flex flex-col items-center text-center">
        <motion.p
          className="font-hindi text-xl text-marigold sm:text-2xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15 }}
        >
          {ui.hero.titleHi}
        </motion.p>

        <motion.div
          className="mt-5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25 }}
        >
          <span className="eyebrow eyebrow--center eyebrow--light">
            {lang === 'en' ? 'Mahi Sundarkand · Expo 2027' : 'माहि सुंदरकांड · एक्स्पो २०२७'}
          </span>
        </motion.div>

        <motion.h1
          className="mt-5 max-w-4xl font-display text-[2.6rem] leading-[1.05] text-white sm:text-6xl md:text-7xl lg:text-[var(--fs-hero)]"
          initial={{ filter: 'blur(18px)', opacity: 0, scale: 1.04 }}
          animate={{ filter: 'blur(0px)', opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
        >
          {ui.hero.titleEn}
        </motion.h1>

        <motion.p
          className="mt-6 max-w-2xl font-body text-base font-light text-cream-on-dark sm:text-lg md:text-[var(--fs-lead)]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {uiT(ui.hero.subtitle, lang)}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <button onClick={scrollToSundarkand} className="btn btn-primary">
            {uiT(ui.nav.sundarkand, lang)}
          </button>
          <button onClick={scrollToExpo} className="btn btn-outline">
            {uiT(ui.nav.expo, lang)}
          </button>
        </motion.div>
      </div>

      <motion.button
        onClick={scrollToSundarkand}
        className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-white/70 transition-colors hover:text-marigold"
        animate={reducedMotion ? {} : { y: [0, 9, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Scroll down"
      >
        <ChevronDown size={30} />
      </motion.button>
    </section>
  );
}
