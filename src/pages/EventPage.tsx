import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Flame,
  HeartPulse,
  LockKeyhole,
  Mail,
  MailCheck,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Lang } from '@/types';
import type { EventPageData, EventTicket } from '@/lib/eventApi';
import { eventApi } from '@/lib/eventApi';
import { formatDate, formatDateRange, pickL, seatLabel, seatTone } from '@/lib/eventFormat';
import { formatRupees } from '@/lib/pricing';
import { buildContexts, contextFor, findEvent, ticketTotals } from '@/lib/eventView';
import type { ScheduleContext } from '@/lib/eventView';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Countdown from '@/components/event/Countdown';
import QuickBookCard from '@/components/event/QuickBookCard';
import CityExplorer from '@/components/event/CityExplorer';
import PriceTag from '@/components/event/PriceTag';
import BookingDrawer from '@/components/event/BookingDrawer';
import BookingLookup from '@/components/event/BookingLookup';

const HeroScene = lazy(() => import('@/components/3d/HeroScene'));

interface HeroContent {
  eyebrow?: unknown;
  title?: unknown;
  subtitle?: unknown;
  dateLabel?: unknown;
  note?: unknown;
  primaryCta?: unknown;
  secondaryCta?: unknown;
  stats?: { value: string; label: unknown }[];
}

interface SectionContent {
  eyebrow?: unknown;
  title?: unknown;
  subtitle?: unknown;
  note?: unknown;
}

interface ExpoContent extends SectionContent {
  venue?: unknown;
  benefits?: { title: unknown; desc: unknown }[];
}

interface ProcessContent extends SectionContent {
  steps?: { title: unknown; desc: unknown }[];
}

interface FaqContent {
  title?: unknown;
  items?: { q: unknown; a: unknown }[];
}

interface ContactContent {
  title?: unknown;
  subtitle?: unknown;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: unknown;
}

const STEP_ICONS = [MapPin, MailCheck, LockKeyhole, QrCode];
const BENEFIT_ICONS = [Flame, Sparkles, ShoppingBag, HeartPulse];

function passDaysLabel(days: number | undefined, lang: Lang) {
  const n = Number(days ?? 1);
  if (n > 1) return lang === 'hi' ? `${n} दिन का पास · हर दिन एक प्रवेश` : `${n}-day pass · one entry each day`;
  return lang === 'hi' ? 'एक दिवसीय पास · एक प्रवेश' : 'single-day pass · one entry';
}

function SectionHead({
  eyebrow,
  title,
  subtitle,
  note,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  note?: string;
  light?: boolean;
}) {
  return (
    <motion.div
      className="section-head"
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {eyebrow && <span className={`eyebrow eyebrow--center ${light ? 'eyebrow--light' : ''}`}>{eyebrow}</span>}
      <h2 className={light ? 'text-white' : ''}>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {note && (
        <div className="mt-4">
          <span className={`chip ${light ? 'chip--on-dark' : 'chip--marigold'}`}>{note}</span>
        </div>
      )}
    </motion.div>
  );
}

function TicketTierCard({
  ticket,
  contexts,
  lang,
  primary,
  onChooseCity,
}: {
  ticket: EventTicket;
  contexts: ScheduleContext[];
  lang: Lang;
  primary: boolean;
  onChooseCity: () => void;
}) {
  const totals = ticketTotals(contexts, ticket.id);
  const soldPercent = totals.capacity > 0 ? Math.min(100, Math.round((totals.sold / totals.capacity) * 100)) : 0;
  const tone = seatTone(totals.left, totals.capacity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.55 }}
      className={`relative flex flex-col overflow-hidden rounded-[26px] ${
        primary
          ? 'bg-sindoor-deep text-cream-on-dark shadow-[0_30px_70px_-40px_rgba(15,35,66,.9)]'
          : 'border border-line bg-white text-text shadow-[0_24px_60px_-45px_rgba(15,35,66,.5)]'
      }`}
    >
      {primary && (
        <>
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg,#13BBE8,#EE2C8F,#FFD21F)' }} />
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-35 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(238,44,143,.8), transparent 65%)' }}
          />
        </>
      )}
      <div className="relative p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`chip ${primary ? 'chip--on-dark' : 'chip--lotus'}`}>
            {lang === 'hi' ? ticket.badge_hi || ticket.name_hi : ticket.badge_en || ticket.name_en}
          </span>
          <span className={`inline-flex items-center gap-1 text-[0.68rem] ${primary ? 'text-cream-on-dark/55' : 'text-muted'}`}>
            <Users size={13} /> {seatLabel(totals.left)}
          </span>
        </div>

        <h3 className={`mt-4 font-display text-3xl ${primary ? 'text-white' : 'text-ink'}`}>
          {lang === 'hi' ? ticket.name_hi : ticket.name_en}
        </h3>
        <p className={`mt-2 text-sm font-light leading-relaxed ${primary ? 'text-cream-on-dark/65' : 'text-muted'}`}>
          {lang === 'hi' ? ticket.description_hi : ticket.description_en}
        </p>

        <div className="mt-5">
          <PriceTag
            ticket={ticket}
            lang={lang}
            dark={primary}
            size="lg"
            caption={lang === 'hi' ? 'प्रति व्यक्ति' : 'per head'}
            showRise
          />
        </div>

        <p
          className={`inline-flex items-center gap-1.5 text-[0.72rem] font-medium ${
            primary ? 'text-marigold' : 'text-saffron-ink'
          }`}
        >
          <CalendarDays size={13} />
          {passDaysLabel(ticket.valid_days, lang)}
        </p>

        <div className={`mt-5 grid gap-2 border-t pt-5 sm:grid-cols-2 ${primary ? 'border-white/10' : 'border-line'}`}>
          {(ticket.inclusions ?? []).map((item) => (
            <div key={item.en} className={`flex items-start gap-2 text-sm ${primary ? 'text-cream-on-dark/75' : 'text-text'}`}>
              <span
                className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
                  primary ? 'bg-marigold/15 text-marigold' : 'bg-saffron/10 text-saffron-ink'
                }`}
              >
                <Check size={11} />
              </span>
              {lang === 'hi' ? item.hi : item.en}
            </div>
          ))}
        </div>

        <div className={`mt-5 rounded-xl border px-3.5 py-3 ${primary ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-sandal-2'}`}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className={primary ? 'text-cream-on-dark/55' : 'text-muted'}>
              Across {new Set(contexts.map((context) => context.city.id)).size} cities
            </span>
            <span
              className={
                tone === 'out'
                  ? 'text-red-400'
                  : tone === 'low'
                    ? 'text-amber-500'
                    : primary
                      ? 'text-emerald-300'
                      : 'text-emerald-700'
              }
            >
              {totals.left.toLocaleString('en-IN')} of {totals.capacity.toLocaleString('en-IN')} seats left
            </span>
          </div>
          <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${primary ? 'bg-white/10' : 'bg-line'}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-sky via-saffron to-saffron-dark" style={{ width: `${soldPercent}%` }} />
          </div>
        </div>

        <button onClick={onChooseCity} className={`btn btn-block mt-5 ${primary ? 'btn-primary' : 'btn-ghost'}`}>
          {lang === 'hi' ? 'अपना शहर चुनें' : 'Choose your city'}
          <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  );
}

export default function EventPage() {
  const { lang, reducedMotion } = useApp();
  const [data, setData] = useState<EventPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [webglOk, setWebglOk] = useState(true);
  const [selection, setSelection] = useState<{ scheduleId: number; ticketId: number } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const result = await eventApi.page();
      setData(result);
      setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load the event.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setWebglOk(false);
    } catch {
      setWebglOk(false);
    }
  }, []);

  const contexts = useMemo(() => buildContexts(data), [data]);
  const yatraContexts = useMemo(() => contexts.filter((context) => context.event.kind === 'yatra'), [contexts]);
  const expoContext = useMemo(() => contexts.find((context) => context.event.kind === 'expo') ?? null, [contexts]);
  const yatra = useMemo(() => findEvent(data, 'yatra'), [data]);
  const expo = useMemo(() => findEvent(data, 'expo'), [data]);

  const hero = data?.content.hero as HeroContent | undefined;
  const yatraContent = data?.content.yatra as SectionContent | undefined;
  const expoContent = data?.content.expo as ExpoContent | undefined;
  const processContent = data?.content.process as ProcessContent | undefined;
  const faqContent = data?.content.faq as FaqContent | undefined;
  const contact = data?.content.contact as ContactContent | undefined;

  const yatraCities = new Set(yatraContexts.map((context) => context.city.id)).size;
  const yatraStates = new Set(yatraContexts.map((context) => context.state.id)).size;
  const lowestPrice = Math.min(
    ...(data?.events.flatMap((event) => event.tickets.map((ticket) => Number(ticket.price))) ?? [0]),
  );
  const saleEnd = yatraContexts[0]?.schedule.sale_ends_at ?? yatra?.sale_ends_at ?? null;
  const expoSaleEnd = expoContext?.schedule.sale_ends_at ?? expo?.sale_ends_at ?? null;
  const selectedContext = contextFor(contexts, selection?.scheduleId ?? null);
  const yatraTickets = yatra?.tickets ?? [];
  const salesPaused = Boolean(data?.sales?.paused);
  const resumeLabel = data?.sales?.resume_at
    ? new Date(String(data.sales.resume_at).replace(' ', 'T')).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const openBooking = (scheduleId: number, ticketId: number) => setSelection({ scheduleId, ticketId });
  const chooseCity = () => scrollTo('yatra');

  if (loading && !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-sindoor-deep">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-sky/25 border-t-marigold" />
          <p className="font-ui text-xs uppercase tracking-[0.24em] text-cream-on-dark/60">Opening the yatra</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-sandal px-6">
        <div className="card max-w-md p-8 text-center">
          <AlertCircle size={28} className="mx-auto text-error" />
          <h1 className="mt-3 font-display text-2xl text-ink">The yatra page could not load</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button onClick={() => void load()} className="btn btn-primary mt-6">
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const contactEmail = contact?.email || 'adhyatmikbharatexpo@gmail.com';
  const contactPhone = contact?.phone || '+91 7499658454';
  const contactWhatsapp = contact?.whatsapp || '917499658454';
  const contactAddress = pickL(contact?.address, lang, lang === 'hi' ? 'जयपुर, राजस्थान' : 'Jaipur, Rajasthan');

  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden pb-14 md:pb-0">
      <SiteHeader />

      <main>
        <section
          className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pb-16 pt-[calc(var(--header-h)+2rem)]"
          style={{
            background:
              'linear-gradient(175deg, #0A1830 0%, #0F2342 38%, #351C4A 66%, #7C1E55 86%, #C8166F 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
            style={{
              background:
                'radial-gradient(ellipse 75% 100% at 50% 100%, rgba(255,210,31,.45) 0%, rgba(243,154,30,.25) 28%, rgba(238,44,143,.18) 52%, transparent 78%)',
            }}
          />
          {webglOk && (
            <div className="pointer-events-none absolute inset-0 lg:left-[20%]">
              <Suspense fallback={null}>
                <HeroScene reduced={reducedMotion} />
              </Suspense>
            </div>
          )}
          {!webglOk && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(circle at 72% 62%, rgba(238,44,143,.35), transparent 42%)' }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sindoor-deep/55 via-sindoor-deep/20 to-sindoor-deep/75" />
          <div
            className="pointer-events-none absolute inset-0 hidden lg:block"
            style={{ background: 'linear-gradient(90deg, rgba(10,24,48,.94) 0%, rgba(10,24,48,.62) 44%, transparent 78%)' }}
          />

          {salesPaused && (
            <div className="relative z-20 mx-auto mb-6 w-full max-w-[1180px] px-4 sm:px-6">
              <div className="flex flex-col gap-2 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-sm text-amber-100 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                  <span>{lang === 'hi' ? data?.sales?.message_hi : data?.sales?.message_en}</span>
                </span>
                {resumeLabel && (
                  <span className="shrink-0 font-ui text-[0.7rem] uppercase tracking-[0.12em] text-amber-200/80">
                    {lang === 'hi' ? `बुकिंग ${resumeLabel} से` : `Bookings reopen ${resumeLabel}`}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="wrap relative z-10 grid items-center gap-10 lg:grid-cols-[1.06fr_.94fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="eyebrow eyebrow--light">{pickL(hero?.eyebrow, lang, 'Mahi Sundarkand · 2027')}</span>
                <span className="hidden h-4 w-px bg-white/20 sm:block" />
                <span className="font-hindi text-sm text-marigold/90">आध्यात्मिक भारत</span>
              </div>

              <h1 className="mt-5 max-w-[15ch] font-display text-[clamp(2.65rem,5vw,4.8rem)] leading-[1.02] text-white">
                {pickL(hero?.title, lang, lang === 'hi' ? 'दस शहर। एक पवित्र स्वर।' : 'Ten cities. One sacred voice.')}
              </h1>

              <p className="mt-5 max-w-xl text-base font-light leading-relaxed text-cream-on-dark/75 sm:text-lg">
                {pickL(
                  hero?.subtitle,
                  lang,
                  lang === 'hi'
                    ? 'एक ही दिन, दस राज्यों के दस शहरों में सुंदरकांड। मुख्य पंडाल या दर्शक प्रवेश — अपना स्थान आज सुरक्षित करें।'
                    : 'The Sundarkand rises in ten cities on one day. Reserve your place inside the main pandal or join as a visitor.',
                )}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cream-on-dark/65">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays size={15} className="text-marigold" />
                  {pickL(hero?.dateLabel, lang, formatDate(yatra?.starts_on, lang, true))}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin size={15} className="text-marigold" />
                  {lang === 'hi'
                    ? `${yatraCities} शहर · ${yatraStates} राज्य`
                    : `${yatraCities} cities · ${yatraStates} states`}
                </span>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={chooseCity} className="btn btn-primary">
                  {pickL(hero?.primaryCta, lang, lang === 'hi' ? 'अपना शहर चुनें' : 'Choose your city')}
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => scrollTo('expo')} className="btn btn-outline">
                  {pickL(hero?.secondaryCta, lang, lang === 'hi' ? 'एक्स्पो देखें' : 'See the Expo')}
                </button>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-5">
                <div>
                  <p className="font-ui text-[0.58rem] uppercase tracking-[0.18em] text-cream-on-dark/40">Pass sales close in</p>
                  <div className="mt-1.5">
                    <Countdown target={saleEnd} compact onDark />
                  </div>
                </div>
                <div className="hidden h-9 w-px bg-white/10 sm:block" />
                <button
                  onClick={() => scrollTo('my-booking')}
                  className="inline-flex items-center gap-1.5 font-ui text-xs font-semibold text-marigold/85 transition-colors hover:text-marigold"
                >
                  <Ticket size={14} /> Already booked? Find your pass
                </button>
              </div>

              <div className="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {(hero?.stats ?? []).map((stat) => (
                  <div key={String(stat.value)}>
                    <p className="font-display text-[1.8rem] leading-none text-marigold">{stat.value}</p>
                    <p className="mt-1 font-ui text-[0.58rem] uppercase tracking-[0.14em] text-cream-on-dark/50">
                      {pickL(stat.label, lang)}
                    </p>
                  </div>
                ))}
              </div>

              {pickL(hero?.note, lang) && (
                <p className="mt-6 flex items-center gap-2 text-[0.7rem] text-cream-on-dark/45">
                  <ShieldCheck size={13} className="text-sky" />
                  {pickL(hero?.note, lang)}
                </p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.85, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <QuickBookCard contexts={yatraContexts} lang={lang} onBook={openBooking} paused={salesPaused} />
            </motion.div>
          </div>

          <motion.button
            onClick={chooseCity}
            className="absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 text-white/50 transition-colors hover:text-marigold lg:block"
            animate={reducedMotion ? {} : { y: [0, 8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-label="Scroll to cities"
          >
            <ChevronDown size={26} />
          </motion.button>
        </section>

        <div className="relative overflow-hidden border-y border-sky/15 bg-sindoor-deep py-3.5">
          <div className="marquee flex w-max items-center gap-8">
            {[...yatraContexts, ...yatraContexts].map((context, index) => (
              <span key={`${context.venue.id}-${index}`} className="flex shrink-0 items-center gap-8">
                <span className="inline-flex items-center gap-2 font-ui text-[0.72rem] uppercase tracking-[0.18em] text-cream-on-dark/65">
                  <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
                  {lang === 'hi' ? context.city.name_hi : context.city.name_en}
                  <span className="text-cream-on-dark/30">·</span>
                  <span className="text-sky">{lang === 'hi' ? context.state.name_hi : context.state.name_en}</span>
                </span>
              </span>
            ))}
          </div>
        </div>

        <section id="yatra" className="section section--cream">
          <div className="wrap section-inner">
            <SectionHead
              eyebrow={pickL(yatraContent?.eyebrow, lang, lang === 'hi' ? 'अपना शहर चुनें' : 'Choose your city')}
              title={pickL(yatraContent?.title, lang, lang === 'hi' ? 'आप पाठ में कहाँ जुड़ेंगे?' : 'Where will you join the path?')}
              subtitle={pickL(
                yatraContent?.subtitle,
                lang,
                lang === 'hi'
                  ? 'राज्य चुनें, शहर चुनें और अपने नज़दीकी पते का चयन करें। हर सीट सर्वर पर सुरक्षित है।'
                  : 'Pick a state, pick a city, and choose the venue closest to you. Every seat is checked on the server.',
              )}
              note={pickL(yatraContent?.note, lang)}
            />
            <CityExplorer
              contexts={yatraContexts}
              states={data?.states ?? []}
              lang={lang}
              onBook={openBooking}
              paused={salesPaused}
            />
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap section-inner">
            <SectionHead
              eyebrow={lang === 'hi' ? 'पास' : 'Passes'}
              title={lang === 'hi' ? 'एक समागम, दो तरीके' : 'One gathering, two ways to attend'}
              subtitle={
                lang === 'hi'
                  ? 'मुख्य पंडाल में आरक्षित स्थान, या दर्शक प्रवेश। दोनों में OTP सत्यापन और QR पास शामिल है।'
                  : 'Reserve a seat inside the main pandal, or join as a visitor. Both include OTP verification and a QR pass.'
              }
            />
            <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
              {yatraTickets.map((ticket, index) => (
                <TicketTierCard
                  key={ticket.id}
                  ticket={ticket}
                  contexts={yatraContexts}
                  lang={lang}
                  primary={index === 0}
                  onChooseCity={chooseCity}
                />
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted">
              {lang === 'hi' ? 'समूह बुकिंग में सहायता चाहिए?' : 'Need help with a group booking?'}{' '}
              <a href={`mailto:${contactEmail}`} className="font-semibold text-saffron-ink">
                {lang === 'hi' ? 'हमसे संपर्क करें' : 'Talk to our team'}
              </a>
            </p>
          </div>
        </section>

        <section id="expo" className="section section--deep pattern-lotus">
          <div
            className="pointer-events-none absolute -right-24 top-10 h-[480px] w-[480px] rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(255,210,31,.55), transparent 65%)' }}
          />
          <div className="wrap section-inner grid items-center gap-10 lg:grid-cols-[.92fr_1.08fr] lg:gap-14">
            <div>
              <span className="eyebrow eyebrow--light">{pickL(expoContent?.eyebrow, lang, 'Adhyatmik Bharat Expo · Delhi')}</span>
              <h2 className="mt-4 max-w-xl font-display text-[clamp(2.2rem,3.6vw,3.5rem)] leading-[1.05] text-white">
                {pickL(expoContent?.title, lang, lang === 'hi' ? 'भव्य समागम, दिल्ली में तीन दिन' : 'The grand gathering, three days in Delhi')}
              </h2>
              <p className="mt-4 max-w-xl text-base font-light leading-relaxed text-cream-on-dark/70">
                {pickL(
                  expoContent?.subtitle,
                  lang,
                  lang === 'hi'
                    ? 'दर्शन, प्रवचन, राजसूय यज्ञ, योग और आध्यात्मिक बाज़ार — प्रगति मैदान में तीन दिन।'
                    : 'Darshan, discourse, Rajsuya Yagya, yoga and a spiritual bazaar — three days at Pragati Maidan.',
                )}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cream-on-dark/65">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays size={15} className="text-marigold" />
                  {formatDateRange(expo?.starts_on, expo?.ends_on, lang)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin size={15} className="text-marigold" />
                  {pickL(expoContent?.venue, lang, lang === 'hi' ? 'प्रगति मैदान, नई दिल्ली' : 'Pragati Maidan, New Delhi')}
                </span>
              </div>

              <div className="mt-6 inline-flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="font-ui text-[0.58rem] uppercase tracking-[0.18em] text-cream-on-dark/40">
                  Expo registrations close in
                </span>
                <Countdown target={expoSaleEnd} onDark />
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {(expoContent?.benefits ?? []).map((benefit, index) => {
                  const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length];
                  return (
                    <div key={index} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-3">
                      <span className="mt-0.5 text-marigold">
                        <Icon size={16} />
                      </span>
                      <div>
                        <p className="font-ui text-sm font-semibold text-white">{pickL(benefit.title, lang)}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-cream-on-dark/50">{pickL(benefit.desc, lang)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {(expo?.tickets ?? []).map((ticket, index) => {
                const capacity = expoContext?.availability.find((item) => item.ticket.id === ticket.id);
                const left = capacity?.left ?? 0;
                const soldPercent = capacity && capacity.capacity > 0 ? Math.min(100, Math.round((capacity.sold / capacity.capacity) * 100)) : 0;
                const disabled =
                  salesPaused || !expoContext || expoContext.schedule.sale_ended || expoContext.schedule.date_passed || left <= 0;
                const premium = index === 0;

                if (premium) {
                  return (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-50px' }}
                      transition={{ duration: 0.6 }}
                      className="rounded-[26px] bg-gradient-to-br from-marigold via-saffron to-sky p-[1.5px] shadow-[0_30px_80px_-40px_rgba(0,0,0,.7)]"
                    >
                      <div className="relative overflow-hidden rounded-[25px] bg-sindoor-deep p-6">
                        <div
                          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-30 blur-3xl"
                          style={{ background: 'radial-gradient(circle, rgba(255,210,31,.8), transparent 65%)' }}
                        />
                        <div className="relative flex flex-wrap items-start justify-between gap-2">
                          <span className="chip chip--on-dark">
                            <Flame size={12} /> {lang === 'hi' ? ticket.badge_hi || ticket.name_hi : ticket.badge_en || ticket.name_en}
                          </span>
                          <span className="text-[0.68rem] text-cream-on-dark/50">{seatLabel(left)}</span>
                        </div>
                        <h3 className="relative mt-3 font-display text-2xl text-white">
                          {lang === 'hi' ? ticket.name_hi : ticket.name_en}
                        </h3>
                        <p className="relative mt-1.5 max-w-md text-xs leading-relaxed text-cream-on-dark/55">
                          {lang === 'hi' ? ticket.description_hi : ticket.description_en}
                        </p>
                        <div className="relative mt-4">
                          <PriceTag
                            ticket={ticket}
                            lang={lang}
                            dark
                            size="lg"
                            caption={lang === 'hi' ? 'प्रति पंजीकरण' : 'per registration'}
                            showRise
                          />
                        </div>
                        <p className="relative inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-marigold">
                          <CalendarDays size={13} /> {passDaysLabel(ticket.valid_days, lang)}
                        </p>
                        <div className="relative mt-4 grid gap-1.5 sm:grid-cols-2">
                          {(ticket.inclusions ?? []).slice(0, 4).map((item) => (
                            <span key={item.en} className="flex items-start gap-1.5 text-xs text-cream-on-dark/70">
                              <Check size={12} className="mt-0.5 shrink-0 text-marigold" />
                              {lang === 'hi' ? item.hi : item.en}
                            </span>
                          ))}
                        </div>
                        <div className="relative mt-4">
                          <div className="flex items-center justify-between text-[0.66rem] text-cream-on-dark/50">
                            <span>{capacity?.capacity ?? 0} sankalp seats</span>
                            <span>{left} left</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-r from-marigold to-saffron" style={{ width: `${soldPercent}%` }} />
                          </div>
                        </div>
                        <button
                          onClick={() => expoContext && openBooking(expoContext.schedule.id, ticket.id)}
                          disabled={disabled}
                          className="btn btn-primary btn-block relative mt-4"
                        >
                          {salesPaused
                            ? lang === 'hi'
                              ? 'बुकिंग अस्थायी रूप से बंद'
                              : 'Bookings paused'
                            : disabled
                              ? lang === 'hi'
                                ? 'पंजीकरण बंद'
                                : 'Registration closed'
                              : lang === 'hi'
                                ? 'राजसूय यज्ञ में भाग लें'
                                : 'Register for Rajsuya Yagya'}
                          {!disabled && <ArrowRight size={16} />}
                        </button>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-50px' }}
                    transition={{ duration: 0.5, delay: 0.08 }}
                    className="rounded-[22px] border border-white/15 bg-[#FFFDF1] p-5 text-text shadow-lg"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="chip chip--lotus">{lang === 'hi' ? ticket.badge_hi || ticket.name_hi : ticket.badge_en || ticket.name_en}</span>
                        <h3 className="mt-2 font-display text-xl text-ink">{lang === 'hi' ? ticket.name_hi : ticket.name_en}</h3>
                        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                          {lang === 'hi' ? ticket.description_hi : ticket.description_en}
                        </p>
                      </div>
                      <div className="text-right">
                        <PriceTag
                          ticket={ticket}
                          lang={lang}
                          align="right"
                          caption={lang === 'hi' ? 'प्रति व्यक्ति' : 'per head'}
                          showRise
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                      <span className={`text-[0.68rem] ${seatTone(left, capacity?.capacity ?? 0) === 'out' ? 'text-red-500' : 'text-muted'}`}>
                        {salesPaused ? 'Bookings paused' : disabled ? 'Sales closed' : `${seatLabel(left)} · ${passDaysLabel(ticket.valid_days, lang)}`}
                      </span>
                      <button
                        onClick={() => expoContext && openBooking(expoContext.schedule.id, ticket.id)}
                        disabled={disabled}
                        className="btn btn-ghost btn-sm"
                      >
                        {lang === 'hi' ? 'दर्शक पास बुक करें' : 'Book expo pass'} <ArrowRight size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section--cream">
          <div className="wrap section-inner">
            <SectionHead
              eyebrow={pickL(processContent?.eyebrow, lang, lang === 'hi' ? 'आपका पास कैसे काम करता है' : 'How your pass works')}
              title={pickL(processContent?.title, lang, lang === 'hi' ? 'सीट से QR पास तक चार कदम' : 'From seat to QR pass in four steps')}
            />
            <div className="relative grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="pointer-events-none absolute left-[12%] right-[12%] top-[38px] hidden border-t border-dashed border-line lg:block" />
              {(processContent?.steps ?? []).map((step, index) => {
                const Icon = STEP_ICONS[index % STEP_ICONS.length];
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.45, delay: index * 0.06 }}
                    className="relative rounded-2xl border border-line bg-white p-5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-saffron/25 bg-saffron/[0.06] text-saffron-ink">
                        <Icon size={17} />
                      </span>
                      <span className="font-display text-3xl text-saffron/20">0{index + 1}</span>
                    </div>
                    <h3 className="mt-3 font-display text-lg text-ink">{pickL(step.title, lang)}</h3>
                    <p className="mt-1.5 text-sm font-light leading-relaxed text-muted">{pickL(step.desc, lang)}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="section section--tint">
          <div className="wrap section-inner">
            <SectionHead
              eyebrow="FAQ"
              title={pickL(faqContent?.title, lang, lang === 'hi' ? 'भक्तों के सामान्य प्रश्न' : 'Questions devotees ask')}
            />
            <div className="mx-auto max-w-3xl divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-white">
              {(faqContent?.items ?? []).map((item, index) => {
                const open = openFaq === index;
                return (
                  <div key={index}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : index)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-sandal-2/60 sm:px-6"
                    >
                      <span className="font-display text-lg text-ink">{pickL(item.q, lang)}</span>
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all ${
                          open ? 'rotate-45 border-saffron bg-saffron text-white' : 'border-line text-saffron-ink'
                        }`}
                      >
                        <Plus size={14} />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">{pickL(item.a, lang)}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="my-booking" className="section section--cream">
          <div className="wrap section-inner">
            <SectionHead
              eyebrow={lang === 'hi' ? 'पहले से बुक किया है?' : 'Already booked?'}
              title={lang === 'hi' ? 'अपना QR पास खोजें' : 'Find your QR pass'}
              subtitle={
                lang === 'hi'
                  ? 'बुकिंग संदर्भ और ईमेल या मोबाइल दर्ज करके अपना पास, स्थान और चेक-इन स्थिति देखें।'
                  : 'Enter your booking reference and email or mobile to see your pass, venue and check-in status.'
              }
            />
            <BookingLookup />
          </div>
        </section>

        <section className="section section--tint !py-14">
          <div className="wrap section-inner">
            <div className="relative overflow-hidden rounded-[30px] bg-sindoor-deep px-6 py-10 text-center sm:px-12">
              <div className="pattern-lotus absolute inset-0 opacity-70" />
              <div
                className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(238,44,143,.8), transparent 65%)' }}
              />
              <div className="relative">
                <span className="eyebrow eyebrow--center eyebrow--light">{lang === 'hi' ? 'सहायता डेस्क' : 'Help desk'}</span>
                <h2 className="mt-3 font-display text-3xl text-white">
                  {pickL(contact?.title, lang, lang === 'hi' ? 'अपने पास में सहायता चाहिए?' : 'Need help with your pass?')}
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-sm text-cream-on-dark/60">
                  {pickL(contact?.subtitle, lang, lang === 'hi' ? 'हमारी टीम हर शहर और दिल्ली एक्स्पो के लिए उपलब्ध है।' : 'Our team answers for every city, and for the Expo in Delhi.')}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <a href={`mailto:${contactEmail}`} className="btn btn-primary btn-sm">
                    <Mail size={15} /> {contactEmail}
                  </a>
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`} className="btn btn-outline btn-sm">
                    <Phone size={15} /> {contactPhone}
                  </a>
                  <a
                    href={`https://wa.me/${contactWhatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    <MessageCircle size={15} /> WhatsApp
                  </a>
                </div>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.68rem] text-cream-on-dark/40">
                  <MapPin size={12} className="text-sky" /> {contactAddress}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter contact={data?.content.contact} />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-sindoor-deep/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div>
            <p className="font-ui text-[0.55rem] uppercase tracking-[0.16em] text-cream-on-dark/45">Passes from</p>
            <p className="font-display text-xl leading-tight text-white">
              {formatRupees(Number.isFinite(lowestPrice) ? lowestPrice : 0)}{' '}
              <span className="font-body text-[0.65rem] text-cream-on-dark/45">
                {lang === 'hi' ? 'प्रति व्यक्ति' : 'per head'}
              </span>
            </p>
          </div>
          <button onClick={chooseCity} className="btn btn-primary btn-sm">
            <Ticket size={14} /> Book a pass
          </button>
        </div>
      </div>

      <BookingDrawer
        open={Boolean(selection && selectedContext)}
        onClose={() => setSelection(null)}
        data={data}
        schedule={selectedContext?.schedule ?? null}
        initialTicketId={selection?.ticketId ?? null}
        lang={lang}
        paused={salesPaused}
        salesMessage={lang === 'hi' ? data?.sales?.message_hi : data?.sales?.message_en}
        onBooked={() => void load(true)}
      />
    </div>
  );
}
