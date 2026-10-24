import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Ticket } from 'lucide-react';
import type { TicketType } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';

interface TiltCardProps {
  ticket: TicketType;
  onRegister: (ticket: TicketType) => void;
}

export default function TiltCard({ ticket, onRegister }: TiltCardProps) {
  const { lang, reducedMotion } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [shineX, setShineX] = useState(50);
  const [shineY, setShineY] = useState(50);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-50, 50], [12, -12]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-50, 50], [-12, 12]), { stiffness: 200, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    x.set(((cx - rect.width / 2) / rect.width) * 100);
    y.set(((cy - rect.height / 2) / rect.height) * 100);
    setShineX((cx / rect.width) * 100);
    setShineY((cy / rect.height) * 100);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setShineX(50);
    setShineY(50);
  };

  const now = new Date();
  const hasDiscount =
    ticket.discount_percent > 0 &&
    (!ticket.discount_from || new Date(ticket.discount_from) <= now) &&
    (!ticket.discount_to || new Date(ticket.discount_to) >= now);
  const finalPrice = hasDiscount
    ? Math.round(ticket.price * (1 - ticket.discount_percent / 100))
    : ticket.price;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className="card relative mx-auto w-full max-w-sm cursor-pointer overflow-hidden p-8"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5"
        style={{ background: 'var(--grad-hand)' }}
      />
      {/* Moving shine */}
      {!reducedMotion && (
        <div
          className="absolute inset-0 opacity-30 pointer-events-none transition-opacity"
          style={{
            background: `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(19,187,232,0.25), transparent 50%)`,
          }}
        />
      )}

      <div style={{ transform: 'translateZ(40px)' }} className="relative">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-saffron/10">
            <Ticket size={24} className="text-saffron-ink" />
          </div>
          <div>
            <h3 className="font-display text-xl text-ink">{uiT(ticket.label, lang)}</h3>
            <p className="font-ui text-xs uppercase tracking-[0.16em] text-muted">
              {uiT(ui.sundarkand.perHead, lang)}
            </p>
          </div>
        </div>

        <div className="mb-6 flex items-baseline gap-3">
          {hasDiscount && (
            <span className="text-lg text-muted line-through">
              ₹{ticket.price.toLocaleString('en-IN')}
            </span>
          )}
          <span className="font-display text-4xl font-semibold text-saffron-ink">
            ₹{finalPrice.toLocaleString('en-IN')}
          </span>
          {hasDiscount && (
            <span className="chip chip--lotus">
              {ticket.discount_percent}% {lang === 'en' ? 'off' : 'छूट'}
            </span>
          )}
        </div>

        <button onClick={() => onRegister(ticket)} className="btn btn-primary btn-block">
          {uiT(ui.sundarkand.register, lang)}
        </button>
      </div>
    </motion.div>
  );
}
