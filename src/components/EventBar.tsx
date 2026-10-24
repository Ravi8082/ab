import { useEffect, useState } from 'react';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const EXPO_START = new Date('2027-08-27T09:00:00+05:30').getTime();

function useCountdown(target: number) {
  const [remaining, setRemaining] = useState(() => target - Date.now());
  useEffect(() => {
    const id = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const secs = Math.max(0, Math.floor(remaining / 1000));
  return [
    { label: 'days', en: 'days', hi: 'दिन', value: Math.floor(secs / 86400) },
    { label: 'hrs', en: 'hrs', hi: 'घंटे', value: Math.floor(secs / 3600) % 24 },
    { label: 'min', en: 'min', hi: 'मिनट', value: Math.floor(secs / 60) % 60 },
    { label: 'sec', en: 'sec', hi: 'सेकंड', value: secs % 60 },
  ];
}

export default function EventBar() {
  const { lang } = useApp();
  const parts = useCountdown(EXPO_START);

  return (
    <div className="section--dark pattern-lotus relative border-y border-sky/15">
      <div className="wrap section-inner flex flex-col items-center gap-6 py-5 lg:flex-row lg:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-cream-on-dark/85">
            <CalendarDays size={15} className="text-marigold" />
            {lang === 'en' ? '27–29 August 2027' : '27–29 अगस्त 2027'}
          </span>
          <span className="flex items-center gap-2 text-cream-on-dark/85">
            <MapPin size={15} className="text-marigold" />
            {lang === 'en' ? 'Pragati Maidan, New Delhi' : 'प्रगति मैदान, नई दिल्ली'}
          </span>
          <span className="flex items-center gap-2 text-cream-on-dark/85">
            <Users size={15} className="text-marigold" />
            {lang === 'en' ? '30,000+ devotees' : '30,000+ भक्त'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Clock size={15} className="mr-1 text-sky" />
          {parts.map((p) => (
            <div
              key={p.label}
              className="min-w-[58px] rounded-xl border border-sky/20 bg-sindoor-deep/70 px-2.5 py-1.5 text-center"
            >
              <div className="font-ui text-lg font-bold leading-none text-marigold tabular-nums">
                {String(p.value).padStart(2, '0')}
              </div>
              <div className="mt-1 text-[0.6rem] uppercase tracking-[0.16em] text-cream-on-dark/55">
                {lang === 'en' ? p.en : p.hi}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
