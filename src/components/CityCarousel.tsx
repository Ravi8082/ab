import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { CityItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';

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
          className="glass rounded-3xl p-6 border border-gold/20 text-center"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <MapPin size={16} className="text-saffron" />
            <h3 className="font-devanagari text-2xl text-ivory">{city.city}</h3>
          </div>
          <p className="text-ivory/50 text-sm font-mukta mb-3">{city.state}</p>
          <p className="text-ivory/60 text-sm font-mukta mb-1">{city.date} · {city.time}</p>
          <p className={`text-sm font-mukta font-semibold ${soldOut ? 'text-red-400' : 'text-gold-light'}`}>
            {soldOut ? uiT(ui.sundarkand.soldOut, lang) : `${seatsLeft} ${uiT(ui.sundarkand.seatsLeft, lang)}`}
          </p>
          {!soldOut && (
            <button
              onClick={() => onSelect(city)}
              className="mt-4 px-6 py-2 rounded-full bg-saffron/20 text-saffron-light font-mukta text-sm font-semibold hover:bg-saffron/30 transition-colors"
            >
              {uiT(ui.sundarkand.register, lang)}
            </button>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-4">
        <button onClick={prev} className="p-2 rounded-full glass text-ivory/70 hover:text-gold" aria-label="Previous city">
          <ChevronLeft size={20} />
        </button>
        <div className="flex gap-1.5">
          {cities.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-gold' : 'w-1.5 bg-ivory/20'}`}
              aria-label={`Go to city ${i + 1}`}
            />
          ))}
        </div>
        <button onClick={next} className="p-2 rounded-full glass text-ivory/70 hover:text-gold" aria-label="Next city">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
