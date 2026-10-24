import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { WHATSAPP_NUMBER } from '@/data/seed';

const MandalaScene = lazy(() => import('./3d/MandalaScene'));

export default function FinalCTA() {
  const { lang, reducedMotion } = useApp();

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="section section--deep pattern-lotus">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]"
        style={{
          background:
            'radial-gradient(ellipse 65% 100% at 50% 105%, rgba(255,210,31,.34) 0%, rgba(238,44,143,.26) 40%, transparent 74%)',
        }}
      />

      {/* 3D Mandala */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Suspense fallback={null}>
          <MandalaScene reduced={reducedMotion} />
        </Suspense>
      </div>

      <div className="wrap section-inner relative z-10 mx-auto max-w-3xl text-center">
        <motion.span
          className="eyebrow eyebrow--center eyebrow--light"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          {lang === 'en' ? 'Limited seats' : 'सीमित सीटें'}
        </motion.span>

        <motion.h2
          className="mt-5 font-display text-4xl text-white sm:text-5xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {uiT(ui.cta.title, lang)}
        </motion.h2>

        <motion.p
          className="mx-auto mt-5 max-w-xl text-lg font-light text-cream-on-dark/75"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {uiT(ui.cta.subtitle, lang)}
        </motion.p>

        <motion.div
          className="mt-11 flex flex-col items-center justify-center gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <button onClick={() => scrollTo('sundarkand')} className="btn btn-primary">
            {uiT(ui.cta.sundarkand, lang)}
          </button>
          <button onClick={() => scrollTo('expo')} className="btn btn-outline">
            {uiT(ui.cta.expo, lang)}
          </button>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline !border-green-400/50 !text-green-300 hover:!bg-green-400/10"
          >
            {uiT(ui.cta.whatsapp, lang)}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
