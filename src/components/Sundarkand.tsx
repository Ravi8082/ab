import { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { useCountUp } from '@/hooks/useCountUp';
import { useInView } from '@/hooks/useInView';
import { ui, uiT } from '@/i18n';
import type { CityItem, TicketType } from '@/types';
import TicketCard from '@/components/TicketCard';
import CityCarousel from '@/components/CityCarousel';
import MandalaDivider from '@/components/MandalaDivider';
import ParticleField from '@/components/ParticleField';

const CityRing = lazy(() => import('@/components/3d/CityRing'));

function StatBlock({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { inView, ref } = useInView<HTMLDivElement>();
  const count = useCountUp(value, inView);
  return (
    <div ref={ref} className="flex flex-col items-center px-4 py-7">
      <span className="font-display text-4xl font-semibold text-saffron-ink sm:text-5xl tabular-nums">
        {count.toLocaleString('en-IN')}
        {suffix}
      </span>
      <span className="mt-2 text-center font-ui text-xs uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
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
  const citySeats = sundarkandCities.reduce(
    (acc, c) => ({
      left: acc.left + Math.max(0, c.capacity - c.booked),
      capacity: acc.capacity + c.capacity,
    }),
    { left: 0, capacity: 0 },
  );
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const handleCitySelect = (city: CityItem) => {
    const pathTicket = sundarkandTickets.find((t) => t.id === 'tk-path');
    if (pathTicket) onRegister(pathTicket, city);
  };

  return (
    <section id="sundarkand" className="section section--cream">
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-[400px] w-[60vw] max-w-[600px] -translate-x-1/2 rounded-full bg-saffron/5 blur-3xl" />
      <ParticleField count={15} />

      <div className="wrap section-inner">
        <motion.div
          className="section-head"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow eyebrow--center">
            {lang === 'en' ? '12 June 2027 · 10 cities' : '12 जून 2027 · 10 शहर'}
          </span>
          <h2 className="font-display text-ink">{uiT(ui.sundarkand.title, lang)}</h2>
          <p>{uiT(ui.sundarkand.tagline, lang)}</p>
        </motion.div>

        <motion.div
          className="card mb-20 grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
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
            <h3 className="mb-9 text-center font-display text-2xl text-ink sm:text-3xl">
              {lang === 'en' ? `${sundarkandCities.length} cities across Bharat` : `भारत भर में ${sundarkandCities.length} शहर`}
            </h3>
            {isMobile ? (
              <div className="max-w-xs mx-auto">
                <CityCarousel cities={sundarkandCities} onSelect={handleCitySelect} />
              </div>
            ) : (
              <div className="card relative overflow-hidden !rounded-[var(--radius-lg)]">
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-6 pb-5 text-xs uppercase tracking-[0.16em] text-muted">
                  <span>{lang === 'en' ? 'Drag to rotate' : 'घुमाने के लिए ड्रैग करें'}</span>
                  <span className="text-saffron-ink">{lang === 'en' ? 'Tap a city to register' : 'शहर चुनें'}</span>
                </div>
                <div className="relative h-[520px] w-full bg-gradient-to-b from-sandal-2 to-white">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <div className="h-20 w-20 animate-spin rounded-full border-2 border-sky/30 border-t-sky" />
                      </div>
                    }
                  >
                    <CityRing cities={sundarkandCities} onSelect={handleCitySelect} reduced={reducedMotion} />
                  </Suspense>
                </div>
              </div>
            )}
          </motion.div>
        )}

        <div className="section-head mb-10">
          <MandalaDivider tone="cream" />
          <span className="eyebrow eyebrow--center mt-6">
            {lang === 'en' ? 'Choose your participation' : 'अपनी भागीदारी चुनें'}
          </span>
        </div>

        {sundarkandTickets.length > 0 && (
          <motion.div
            className="grid gap-8 mx-auto max-w-4xl md:grid-cols-2"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {sundarkandTickets.map((ticket, i) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                delay={i * 0.1}
                onRegister={onRegister}
                seatsLeft={citySeats.left}
                capacity={citySeats.capacity}
                features={[
                  uiT(ui.sundarkand.devotees, lang),
                  lang === 'en' ? '12 June 2027 · 06:00 AM' : '12 जून 2027 · प्रातः ६:००',
                  lang === 'en' ? 'Sundarkand path + aarti' : 'सुंदरकांड पाठ + आरती',
                  lang === 'en' ? 'Prasad & booking pass' : 'प्रसाद और बुकिंग पास',
                ]}
              />
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
