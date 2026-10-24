import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Check, Sparkles, Ticket } from 'lucide-react';
import type { TicketType } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { formatRupees, priceInfo } from '@/lib/pricing';
import CountdownPill from '@/components/CountdownPill';

interface TicketCardProps {
  ticket: TicketType;
  onRegister: (ticket: TicketType) => void;
  features?: string[];
  badge?: string;
  featured?: boolean;
  seatsLeft?: number;
  capacity?: number;
  delay?: number;
}

export default function TicketCard({
  ticket,
  onRegister,
  features = [],
  badge,
  featured = false,
  seatsLeft,
  capacity,
  delay = 0,
}: TicketCardProps) {
  const { lang, reducedMotion } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [shine, setShine] = useState({ x: 50, y: 50 });

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-50, 50], [8, -8]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-50, 50], [-8, 8]), { stiffness: 200, damping: 20 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    x.set(((cx - rect.width / 2) / rect.width) * 100);
    y.set(((cy - rect.height / 2) / rect.height) * 100);
    setShine({ x: (cx / rect.width) * 100, y: (cy / rect.height) * 100 });
  };

  const release = () => {
    x.set(0);
    y.set(0);
    setShine({ x: 50, y: 50 });
  };

  const price = priceInfo(ticket);
  const filled = capacity && seatsLeft !== undefined ? 1 - seatsLeft / capacity : null;

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={release}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className="card relative flex h-full flex-col overflow-hidden p-7"
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
        style={{ background: featured ? 'linear-gradient(90deg,#FFD21F,#F39A1E)' : 'var(--grad-hand)' }}
      />
      {!reducedMotion && (
        <div
          className="pointer-events-none absolute inset-0 opacity-40 transition-opacity"
          style={{
            background: `radial-gradient(circle at ${shine.x}% ${shine.y}%, rgba(19,187,232,.22), transparent 52%)`,
          }}
        />
      )}

      <div className="relative flex flex-1 flex-col" style={{ transform: 'translateZ(35px)' }}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                featured ? 'bg-marigold/20' : 'bg-saffron/10'
              }`}
            >
              {featured ? (
                <Sparkles size={21} className="text-amber" />
              ) : (
                <Ticket size={21} className="text-saffron-ink" />
              )}
            </div>
            <div>
              <h3 className="font-display text-xl leading-tight text-ink">{uiT(ticket.label, lang)}</h3>
              <p className="mt-0.5 font-ui text-[0.68rem] uppercase tracking-[0.16em] text-muted">
                {uiT(ui.sundarkand.perHead, lang)}
              </p>
            </div>
          </div>
          {badge && (
            <span className={`chip shrink-0 ${featured ? 'chip--marigold' : 'chip--lotus'}`}>{badge}</span>
          )}
        </div>

        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`font-display font-semibold leading-none ${
              featured ? 'text-4xl text-amber' : 'text-4xl text-saffron-ink'
            }`}
          >
            {formatRupees(price.finalPrice)}
          </span>
          {price.hasDiscount && (
            <>
              <span className="text-lg text-muted line-through">{formatRupees(price.basePrice)}</span>
              <span className="chip chip--lotus">
                −{price.discountPercent}%
              </span>
            </>
          )}
        </div>

        {price.hasDiscount && (
          <p className="mb-5 font-ui text-xs uppercase tracking-[0.12em] text-success">
            {lang === 'en'
              ? `You save ${formatRupees(price.savings)}`
              : `${formatRupees(price.savings)} की बचत`}
          </p>
        )}
        {!price.hasDiscount && <div className="mb-5" />}

        {features.length > 0 && (
          <ul className="mb-6 space-y-2.5">
            {features.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-text">
                <Check size={16} className="mt-0.5 shrink-0 text-saffron" />
                {item}
              </li>
            ))}
          </ul>
        )}

        {filled !== null && capacity && (
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between font-ui text-[0.7rem] uppercase tracking-[0.14em] text-muted">
              <span>
                {lang === 'en' ? 'Batch filling' : 'बैच भर रहा है'}
              </span>
              <span className="text-saffron-ink">
                {seatsLeft! > 0
                  ? `${seatsLeft!.toLocaleString('en-IN')} ${uiT(ui.sundarkand.seatsLeft, lang)}`
                  : uiT(ui.sundarkand.soldOut, lang)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, filled * 100)}%`, background: 'var(--grad-hand)' }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {lang === 'en'
                ? `Max ${ticket.max_quantity} per booking`
                : `एक बुकिंग में अधिकतम ${ticket.max_quantity}`}
            </p>
          </div>
        )}

        <div className="mt-auto space-y-4 pt-2">
          {(price.windowStart || price.windowEnd) && (
            <CountdownPill start={price.windowStart} end={price.windowEnd} />
          )}
          <button
            onClick={() => onRegister(ticket)}
            className={`btn btn-block ${featured ? 'btn-navy' : 'btn-primary'}`}
          >
            {uiT(ui.sundarkand.register, lang)}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
