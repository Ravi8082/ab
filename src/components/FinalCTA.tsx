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
    <section className="relative py-32 px-4 sm:px-6 overflow-hidden bg-sindoor text-cream-on-dark">
      {/* Oval glow background */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[800px] h-[400px] rounded-[50%] bg-gradient-to-br from-saffron/20 via-sky/10 to-transparent blur-3xl pointer-events-none" />

      {/* 3D Mandala */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Suspense fallback={null}>
          <MandalaScene reduced={reducedMotion} />
        </Suspense>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.h2
          className="font-display text-3xl sm:text-5xl text-white mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-gradient-marigold">{uiT(ui.cta.title, lang)}</span>
        </motion.h2>

        <motion.p
          className="text-cream-on-dark/70 text-lg font-body font-light mb-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {uiT(ui.cta.subtitle, lang)}
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <button
            onClick={() => scrollTo('sundarkand')}
            className="px-7 py-3 rounded-full bg-grad-hand text-white font-ui font-semibold shadow-lg shadow-saffron/30 hover:shadow-saffron/50 hover:scale-105 transition-all duration-300 ease-smooth"
          >
            {uiT(ui.cta.sundarkand, lang)}
          </button>
          <button
            onClick={() => scrollTo('expo')}
            className="px-7 py-3 rounded-full border border-sky/40 text-sky-light font-ui font-semibold hover:bg-sky/10 hover:border-sky/70 transition-all duration-300 ease-smooth"
          >
            {uiT(ui.cta.expo, lang)}
          </button>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-7 py-3 rounded-full border border-green-500/40 text-green-400 font-ui font-semibold hover:bg-green-500/10 transition-all duration-300 ease-smooth"
          >
            {uiT(ui.cta.whatsapp, lang)}
          </a>
        </motion.div>
      </div>
    </section>
  );
}
