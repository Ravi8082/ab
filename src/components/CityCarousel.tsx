import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { CityItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { formatEventDate, formatTime } from '@/lib/format';

interface CityCarouselProps {
  cities: CityItem[];
  onSelect: (city: CityItem) => void;
}

export default function CityCarousel({ cities, onSelect }: CityCarouselProps) {
  const { lang } = useApp();
  const [index, setIndex] = useState(0);

  const next = () => setIndex((i) => (i + 1) % cities.length);
  const prev = () => setIndex((i) => (i - 1 + cities.length) % cities.length);

  const city = cities[index];
  const seatsLeft = city.capacity - city.booked;
  const soldOut = seatsLeft <= 0;

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={city.id}
          className="card arch px-6 pb-7 pt-14 text-center"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-1 flex items-center justify-center gap-2">
            <MapPin size={16} className="text-saffron" />
            <h3 className="font-hindi text-2xl text-ink">{city.city}</h3>
          </div>
          <p className="mb-4 font-ui text-xs uppercase tracking-[0.18em] text-muted">{city.state}</p>

          <div className="mx-auto mb-4 h-px w-16 bg-line" />

          <p className="mb-2 text-sm text-muted">
            {formatEventDate(city.date, lang)} · {formatTime(city.time)}
          </p>
          <p
            className={`font-ui text-sm font-semibold ${
              soldOut ? 'text-red-500' : 'text-saffron-ink'
            }`}
          >
            {soldOut
              ? uiT(ui.sundarkand.soldOut, lang)
              : `${seatsLeft.toLocaleString('en-IN')} ${uiT(ui.sundarkand.seatsLeft, lang)}`}
          </p>
          <div className="mx-auto mt-3 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-grad-hand"
              style={{ width: `${Math.min(100, (city.booked / city.capacity) * 100)}%` }}
            />
          </div>
          {!soldOut && (
            <button onClick={() => onSelect(city)} className="btn btn-primary btn-sm mt-5">
              {uiT(ui.sundarkand.register, lang)}
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={prev}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-sindoor shadow-sm transition-colors hover:border-saffron hover:text-saffron-ink"
          aria-label="Previous city"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-1.5">
          {cities.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-saffron' : 'w-1.5 bg-line'
              }`}
              aria-label={`Go to city ${i + 1}`}
            />
          ))}
        </div>
        <button
          onClick={next}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-sindoor shadow-sm transition-colors hover:border-saffron hover:text-saffron-ink"
          aria-label="Next city"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
