import { lazy, Suspense, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Flame, Store } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import type { CityItem, TicketType, TierCard } from '@/types';
import TicketCard from '@/components/TicketCard';
import MandalaDivider from '@/components/MandalaDivider';
import CountdownPill from '@/components/CountdownPill';
import { formatRupees, priceInfo } from '@/lib/pricing';

const YajnaScene = lazy(() => import('@/components/3d/YajnaScene'));

function BenefitCard({ card, index }: { card: TierCard; index: number }) {
  const { lang, reducedMotion } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-50, 50], [20, -20]), { stiffness: 150, damping: 15 });
  const rotateY = useSpring(useTransform(x, [-50, 50], [-20, 20]), { stiffness: 150, damping: 15 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set(((e.clientX - rect.left - rect.width / 2) / rect.width) * 100);
    y.set(((e.clientY - rect.top - rect.height / 2) / rect.height) * 100);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className="card relative min-h-[210px] p-6"
      initial={{ opacity: 0, rotateX: 40, y: 60 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ transform: 'translateZ(30px)' }}>
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-sindoor font-display text-lg text-marigold">
          {index + 1}
        </div>
        <h4 className="mb-2 font-display text-lg text-ink">{uiT(card.title, lang)}</h4>
        <p className="text-sm font-light leading-relaxed text-muted">
          {uiT(card.description, lang)}
        </p>
      </div>
    </motion.div>
  );
}

interface ExpoProps {
  onRegister: (ticket: TicketType, city?: CityItem) => void;
  tickets: TicketType[];
  tierCards: TierCard[];
}

export default function Expo({ onRegister, tickets, tierCards }: ExpoProps) {
  const { lang, reducedMotion } = useApp();
  const expoTickets = tickets.filter((t) => t.event_id === 'evt-expo');
  const rajsuyaTicket = expoTickets.find((t) => t.id === 'tk-rajsuya');
  const rajsuyaPrice = rajsuyaTicket ? priceInfo(rajsuyaTicket) : null;
  const visitorTicket = expoTickets.find((t) => t.id === 'tk-expo-visitor');
  const benefits = tierCards.length > 0 ? tierCards : ui.expo.benefits;

  return (
    <section id="expo" className="section section--tint">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[70vw] max-w-[700px] -translate-x-1/2 animate-breathe rounded-full bg-saffron/5 blur-3xl" />

      <div className="wrap section-inner">
        <motion.div
          className="section-head"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow eyebrow--center">
            {lang === 'en' ? 'Three days · New Delhi' : 'तीन दिन · नई दिल्ली'}
          </span>
          <h2 className="font-display text-ink">{uiT(ui.expo.title, lang)}</h2>
          <p>{uiT(ui.expo.tagline, lang)}</p>
        </motion.div>

        {rajsuyaTicket && rajsuyaPrice && (
          <motion.div
            className="relative max-w-5xl mx-auto mb-20"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="card--dark pattern-lotus relative overflow-hidden rounded-[var(--radius-lg)]">
              <div className="section-inner grid gap-0 lg:grid-cols-2">
                <div className="relative h-[300px] min-h-[350px] bg-gradient-to-br from-sindoor to-sindoor-deep lg:h-auto">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <Flame size={48} className="animate-flicker text-saffron" />
                      </div>
                    }
                  >
                    <YajnaScene reduced={reducedMotion} />
                  </Suspense>
                </div>

                <div className="flex flex-col justify-center p-8 lg:p-12">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="chip chip--on-dark">
                      {lang === 'en' ? 'Premium' : 'प्रीमियम'}
                    </span>
                    <Flame size={18} className="text-marigold" />
                  </div>
                  <h3 className="mb-3 font-display text-3xl text-white sm:text-4xl">
                    {uiT(ui.expo.rajsuya, lang)}
                  </h3>
                  <p className="mb-7 font-light leading-relaxed text-cream-on-dark/70">
                    {uiT(ui.expo.rajsuyaDesc, lang)}
                  </p>
                  <div className="mb-7 flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold text-marigold">
                      {formatRupees(rajsuyaPrice.finalPrice)}
                    </span>
                    {rajsuyaPrice.hasDiscount && (
                      <span className="text-lg text-cream-on-dark/45 line-through">
                        {formatRupees(rajsuyaPrice.basePrice)}
                      </span>
                    )}
                    <span className="text-sm text-cream-on-dark/55">
                      / {uiT(ui.sundarkand.perHead, lang)}
                    </span>
                  </div>
                  {(rajsuyaPrice.windowStart || rajsuyaPrice.windowEnd) && (
                    <div className="mb-7 rounded-full bg-white/95 p-1 w-fit">
                      <CountdownPill start={rajsuyaPrice.windowStart} end={rajsuyaPrice.windowEnd} />
                    </div>
                  )}
                  <button
                    onClick={() => onRegister(rajsuyaTicket)}
                    className="btn btn-primary w-fit"
                  >
                    {uiT(ui.expo.rajsuyaRegister, lang)}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 max-w-container mx-auto mb-20" style={{ perspective: 1000 }}>
          {benefits.map((card, i) => (
            <BenefitCard key={card.id} card={card} index={i} />
          ))}
        </div>

        {visitorTicket && (
          <div className="mx-auto max-w-md">
            <div className="section-head mb-10">
              <MandalaDivider tone="tint" />
              <span className="eyebrow eyebrow--center mt-6">
                {lang === 'en' ? 'Entry pass' : 'प्रवेश पास'}
              </span>
            </div>
            <TicketCard
              ticket={visitorTicket}
              onRegister={onRegister}
              features={[
                '27–29 August 2027',
                'Pragati Maidan, Delhi',
                lang === 'en' ? 'All 3 days access' : 'तीनों दिन पहुँच',
                uiT(ui.expo.expoVisitorDesc, lang),
              ]}
            />
            <Link
              to="/stall"
              className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4 transition-colors hover:border-saffron"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sindoor text-marigold">
                  <Store size={18} />
                </span>
                <span>
                  <span className="block font-ui text-[0.64rem] uppercase tracking-[0.18em] text-saffron-ink">
                    {lang === 'en' ? 'For brands & businesses' : 'ब्रांड्स और व्यवसायों के लिए'}
                  </span>
                  <span className="mt-0.5 block font-display text-lg leading-tight text-ink">
                    {lang === 'en' ? 'Exhibiting instead? Book a stall' : 'प्रदर्शक बनना चाहते हैं? स्टॉल बुक करें'}
                  </span>
                </span>
              </span>
              <ArrowRight size={19} className="shrink-0 text-saffron" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
