import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { parseLocalDate } from '@/lib/eventFormat';

interface CountdownProps {
  target: string | null | undefined;
  compact?: boolean;
  onDark?: boolean;
  closedLabel?: string;
  className?: string;
}

const pad = (value: number) => String(Math.max(0, value)).padStart(2, '0');

export default function Countdown({
  target,
  compact = false,
  onDark = false,
  closedLabel = 'Sales closed',
  className = '',
}: CountdownProps) {
  const targetMs = useMemo(() => parseLocalDate(target)?.getTime() ?? null, [target]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return null;

  const diff = targetMs - now;
  if (diff <= 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-ui text-xs uppercase tracking-[0.14em] ${onDark ? 'text-marigold/80' : 'text-saffron-ink'} ${className}`}>
        <Clock size={13} /> {closedLabel}
      </span>
    );
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-ui text-xs tabular-nums tracking-[0.06em] ${
          onDark ? 'text-cream-on-dark/70' : 'text-muted'
        } ${className}`}
      >
        <Clock size={13} className={onDark ? 'text-marigold' : 'text-saffron-ink'} />
        <span>Sale closes in</span>
        <strong className={onDark ? 'font-semibold text-marigold' : 'font-semibold text-saffron-ink'}>
          {days > 0 && `${days}d `}
          {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
        </strong>
      </span>
    );
  }

  const cells = [
    { value: pad(days), label: 'Days' },
    { value: pad(hours), label: 'Hrs' },
    { value: pad(minutes), label: 'Min' },
    { value: pad(seconds), label: 'Sec' },
  ];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {cells.map((cell, index) => (
        <div key={cell.label} className="flex items-center gap-2">
          <div
            className={`min-w-[52px] rounded-xl border px-2 py-1.5 text-center tabular-nums ${
              onDark ? 'border-sky/25 bg-white/[0.05]' : 'border-line bg-white'
            }`}
          >
            <span className={`block font-display text-xl leading-none ${onDark ? 'text-white' : 'text-ink'}`}>
              {cell.value}
            </span>
            <span className={`mt-0.5 block font-ui text-[0.55rem] uppercase tracking-[0.16em] ${onDark ? 'text-cream-on-dark/50' : 'text-muted'}`}>
              {cell.label}
            </span>
          </div>
          {index < cells.length - 1 && (
            <span className={`font-display text-lg ${onDark ? 'text-marigold/50' : 'text-saffron/40'}`}>:</span>
          )}
        </div>
      ))}
    </div>
  );
}
