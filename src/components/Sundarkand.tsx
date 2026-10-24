import { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { useCountUp } from '@/hooks/useCountUp';
import { useInView } from '@/hooks/useInView';
import { ui, uiT } from '@/i18n';
import { seedCities, seedTickets } from '@/data/seed';
import type { CityItem, TicketType } from '@/types';
import TiltCard from '@/components/TiltCard';
import CityCarousel from '@/components/CityCarousel';
import ParticleField from '@/components/ParticleField';

const CityRing = lazy(() => import('@/components/3d/CityRing'));

function StatBlock({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { inView, ref } = useInView<HTMLDivElement>();
  const count = useCountUp(value, inView);
  return (
    <div ref={ref} className="flex flex-col items-center">
      <span className="font-display text-3xl sm:text-4xl text-gradient-saffron">
        {count.toLocaleString('en-IN')}
        {suffix}
      </span>
      <span className="text-xs sm:text-sm text-muted font-body mt-1">{label}</span>
    </div>
  );
}

interface SundarkandProps {
  onRegister: (ticket: TicketType, city?: CityItem) => void;
  tickets: TicketType[];
  cities: CityItem[];
}

export default function Sundarkand({ onRegister, tickets, cities }: SundarkandProps) {
  const { lang, reducedMotion } = useApp();
  const sundarkandTickets = tickets.filter((t) => t.event_id === 'evt-sundarkand');
  const sundarkandCities = cities.filter((c) => c.event_id === 'evt-sundarkand');
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const handleCitySelect = (city: CityItem) => {
    const pathTicket = sundarkandTickets.find((t) => t.id === 'tk-path');
    if (pathTicket) onRegister(pathTicket, city);
  };

  return (
    <section id="sundarkand" className="relative py-24 px-4 sm:px-6 overflow-hidden bg-sandal">
      <div className="absolute left-1/2 top-1/4 -translate-x-1/2 w-[60vw] max-w-[600px] h-[400px] rounded-full bg-saffron/5 blur-3xl pointer-events-none" />
      <ParticleField count={15} />

      <div className="relative mx-auto max-w-container" style={{ paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter)' }}>
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-ink mb-4">
            <span className="text-gradient-saffron">{uiT(ui.sundarkand.title, lang)}</span>
          </h2>
          <p className="text-muted text-lg font-body font-light max-w-2xl mx-auto">
            {uiT(ui.sundarkand.tagline, lang)}
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <StatBlock value={1} suffix="" label={uiT(ui.sundarkand.oneDay, lang)} />
          <StatBlock value={sundarkandCities.length || 10} suffix="" label={uiT(ui.sundarkand.cities, lang)} />
          <StatBlock value={1000} suffix="" label={uiT(ui.sundarkand.devotees, lang)} />
          <StatBlock value={30000} suffix="" label={uiT(ui.sundarkand.attendees, lang)} />
        </motion.div>

        {sundarkandCities.length > 0 && (
          <motion.div
            className="mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          >
            <h3 className="text-center font-hindi text-2xl text-saffron-ink mb-8">
              {lang === 'en' ? `${sundarkandCities.length} cities across Bharat` : `भारत भर में ${sundarkandCities.length} शहर`}
            </h3>
            {isMobile ? (
              <div className="max-w-xs mx-auto">
                <CityCarousel cities={sundarkandCities} onSelect={handleCitySelect} />
              </div>
            ) : (
              <div className="relative h-[500px] w-full rounded-24 bg-sandal-2 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full">
                      <div className="w-20 h-20 rounded-full border-2 border-sky/30 border-t-sky animate-spin" />
                    </div>
                  }
                >
                  <CityRing cities={sundarkandCities} onSelect={handleCitySelect} reduced={reducedMotion} />
                </Suspense>
              </div>
            )}
          </motion.div>
        )}

        {sundarkandTickets.length > 0 && (
          <motion.div
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {sundarkandTickets.map((ticket) => (
              <TiltCard key={ticket.id} ticket={ticket} onRegister={(t) => onRegister(t)} />
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
