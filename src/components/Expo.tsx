import { lazy, Suspense, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Flame, Ticket, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import type { CityItem, TicketType, TierCard } from '@/types';

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
      className="relative rounded-14 p-6 border border-sky/20 bg-gradient-to-br from-sandal to-sandal-2 min-h-[200px] shadow-sm"
      initial={{ opacity: 0, rotateX: 40, y: 60 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <div style={{ transform: 'translateZ(30px)' }}>
        <div className="w-10 h-10 rounded-xl bg-saffron/15 flex items-center justify-center mb-4">
          <span className="font-display text-lg text-saffron-ink">{index + 1}</span>
        </div>
        <h4 className="font-display text-lg text-ink mb-2">{uiT(card.title, lang)}</h4>
        <p className="text-muted text-sm font-body font-light leading-relaxed">
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
  const visitorTicket = expoTickets.find((t) => t.id === 'tk-expo-visitor');
  const benefits = tierCards.length > 0 ? tierCards : ui.expo.benefits;

  return (
    <section id="expo" className="relative py-24 px-4 sm:px-6 overflow-hidden bg-sandal-2">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[70vw] max-w-[700px] h-[300px] rounded-full bg-saffron/5 blur-3xl pointer-events-none animate-breathe" />

      <div className="relative mx-auto max-w-container" style={{ paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter)' }}>
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-ink mb-4">
            <span className="text-gradient-saffron">{uiT(ui.expo.title, lang)}</span>
          </h2>
          <p className="text-muted text-lg font-body font-light">{uiT(ui.expo.tagline, lang)}</p>
        </motion.div>

        {rajsuyaTicket && (
          <motion.div
            className="relative max-w-5xl mx-auto mb-20"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative rounded-24 overflow-hidden gold-border shimmer-overlay">
              <div className="grid lg:grid-cols-2 gap-0">
                <div className="relative h-[300px] lg:h-auto min-h-[350px] bg-gradient-to-br from-sindoor to-sindoor-deep">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <Flame size={48} className="text-saffron animate-flicker" />
                      </div>
                    }
                  >
                    <YajnaScene reduced={reducedMotion} />
                  </Suspense>
                </div>

                <div className="p-8 lg:p-10 flex flex-col justify-center bg-gradient-to-br from-sandal to-sandal-2">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="px-3 py-1 rounded-full bg-saffron/15 text-saffron-ink text-xs font-ui font-semibold uppercase tracking-wider">
                      {lang === 'en' ? 'Premium' : 'प्रीमियम'}
                    </div>
                    <Flame size={18} className="text-saffron" />
                  </div>
                  <h3 className="font-display text-3xl sm:text-4xl text-gradient-saffron mb-3">
                    {uiT(ui.expo.rajsuya, lang)}
                  </h3>
                  <p className="text-muted font-body font-light mb-6 leading-relaxed">
                    {uiT(ui.expo.rajsuyaDesc, lang)}
                  </p>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="font-display text-4xl text-saffron-ink">
                      ₹{rajsuyaTicket.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-muted text-sm font-body">/ {uiT(ui.sundarkand.perHead, lang)}</span>
                  </div>
                  <button
                    onClick={() => onRegister(rajsuyaTicket)}
                    className="px-7 py-3.5 rounded-full bg-grad-hand text-white font-ui font-semibold shadow-lg shadow-saffron/30 hover:shadow-saffron/50 hover:scale-105 transition-all duration-300 ease-smooth w-fit"
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
          <motion.div
            className="max-w-md mx-auto"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative rounded-24 p-8 border border-sky/25 bg-gradient-to-br from-sandal to-sandal-2 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-saffron/20 to-sky/15 flex items-center justify-center">
                  <Ticket size={24} className="text-saffron-ink" />
                </div>
                <div>
                  <h3 className="font-display text-xl text-ink">{uiT(ui.expo.expoVisitor, lang)}</h3>
                  <p className="text-xs text-muted font-body">{uiT(ui.sundarkand.perHead, lang)}</p>
                </div>
              </div>
              <p className="text-muted text-sm font-body font-light mb-4 leading-relaxed">
                {uiT(ui.expo.expoVisitorDesc, lang)}
              </p>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="font-display text-3xl text-saffron-ink">
                  ₹{visitorTicket.price.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="space-y-2 mb-6">
                {['27–29 August 2027', 'Pragati Maidan, Delhi', lang === 'en' ? 'All 3 days access' : 'तीनों दिन पहुँच'].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-muted text-sm font-body">
                    <Check size={15} className="text-saffron" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={() => onRegister(visitorTicket)}
                className="w-full py-3 rounded-full bg-grad-hand text-white font-ui font-semibold hover:shadow-lg hover:shadow-saffron/30 transition-all duration-300 ease-smooth"
              >
                {uiT(ui.sundarkand.register, lang)}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
