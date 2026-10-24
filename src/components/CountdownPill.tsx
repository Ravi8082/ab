import { useEffect, useState } from 'react';
import { Hourglass, Play } from 'lucide-react';
import { useApp } from '@/context/AppContext';

function remaining(target: number, now: number) {
  const secs = Math.max(0, Math.floor((target - now) / 1000));
  return [
    { unit: 'd', value: Math.floor(secs / 86400) },
    { unit: 'h', value: Math.floor(secs / 3600) % 24 },
    { unit: 'm', value: Math.floor(secs / 60) % 60 },
    { unit: 's', value: secs % 60 },
  ];
}

interface CountdownPillProps {
  start: Date | null;
  end: Date | null;
}

export default function CountdownPill({ start, end }: CountdownPillProps) {
  const { lang } = useApp();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!start && !end) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start, end]);

  const upcoming = start && start.getTime() > now;
  const target = upcoming ? start!.getTime() : end?.getTime() ?? null;
  if (!target || target <= now) return null;

  const parts = remaining(target, now);

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
        upcoming ? 'bg-sindoor text-cream-on-dark' : 'bg-saffron/10 text-saffron-ink'
      }`}
    >
      {upcoming ? <Play size={13} /> : <Hourglass size={13} />}
      <span className="font-ui text-[0.68rem] font-semibold uppercase tracking-[0.14em] opacity-80">
        {upcoming
          ? lang === 'en'
            ? 'Offer starts in'
            : 'छूट शुरू होने में'
          : lang === 'en'
            ? 'Offer ends in'
            : 'छूट खत्म होने में'}
      </span>
      <span className="flex items-center gap-1 tabular-nums">
        {parts.map((p) => (
          <span key={p.unit} className="font-ui text-sm font-bold">
            {String(p.value).padStart(2, '0')}
            <span className="text-[0.6rem] font-medium opacity-60">{p.unit}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
