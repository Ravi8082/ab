import { motion } from 'framer-motion';
import type { CityItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { formatEventDate, formatTime } from '@/lib/format';

interface CityMarqueeProps {
  cities: CityItem[];
}

function LotusGlyph() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true" className="shrink-0">
      <g stroke="#13BBE8" strokeWidth="1" strokeLinecap="round" opacity=".8">
        <path d="M9 2c1.6 2.2 1.6 4.6 0 6.8C7.4 6.6 7.4 4.2 9 2Z" />
        <path d="M9 8.8c2-1.3 4.2-.9 5.6.8-2 1.3-4.2.9-5.6-.8Z" />
        <path d="M9 8.8C7 7.5 4.8 7.9 3.4 9.6c2 1.3 4.2.9 5.6-.8Z" />
      </g>
    </svg>
  );
}

function Item({ city, lang }: { city: CityItem; lang: 'en' | 'hi' }) {
  const seatsLeft = Math.max(0, city.capacity - city.booked);
  return (
    <div className="flex shrink-0 items-center gap-5 px-6">
      <span className="font-display text-2xl text-white md:text-3xl">{city.city}</span>
      <span className="font-ui text-[0.7rem] uppercase tracking-[0.2em] text-sky">
        {formatEventDate(city.date, lang)} · {formatTime(city.time)}
      </span>
      <span
        className={`font-ui text-[0.7rem] uppercase tracking-[0.18em] ${
          seatsLeft > 0 ? 'text-marigold' : 'text-saffron'
        }`}
      >
        {seatsLeft > 0
          ? `${seatsLeft.toLocaleString('en-IN')} ${uiT(ui.sundarkand.seatsLeft, lang)}`
          : uiT(ui.sundarkand.soldOut, lang)}
      </span>
      <LotusGlyph />
    </div>
  );
}

export default function CityMarquee({ cities }: CityMarqueeProps) {
  const { lang } = useApp();
  const route = cities.filter((c) => c.event_id === 'evt-sundarkand');
  if (route.length === 0) return null;

  // One copy of the route list plus a single duplicate: translating the track
  // by -50% lands exactly on the start of the duplicate, so the loop is seamless.
  const track = [...route, ...route];

  return (
    <section className="relative overflow-hidden bg-sindoor-deep py-14">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background:url('/pattern-lotus.svg')_repeat] [background-size:190px_190px]" />
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="relative"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-sindoor-deep to-transparent md:w-44" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-sindoor-deep to-transparent md:w-44" />
        <div className="marquee flex w-max">
          {track.map((city, i) => (
            <Item key={`${city.id}-${i}`} city={city} lang={lang} />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
