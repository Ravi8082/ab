import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Mail,
  Minus,
  Plus,
  ShieldCheck,
  Tag,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import type { Lang } from '@/types';
import type {
  AttendeeInput,
  CouponPreview,
  CreateBookingResult,
  EventBookingPass,
  EventPageData,
  EventSchedule,
} from '@/lib/eventApi';
import { ApiError, eventApi } from '@/lib/eventApi';
import { formatRupees } from '@/lib/pricing';
import { bi, formatDateRange, formatTime, formatTimeRange, kindName } from '@/lib/eventFormat';
import EventPass from '@/components/event/EventPass';
import PolicySummary from '@/components/event/PolicySummary';
import PriceTag from '@/components/event/PriceTag';

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

const razorpayWindow = () => (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

type Step = 'details' | 'otp' | 'pay' | 'pass';

const STEP_LIST: { id: Step; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'otp', label: 'Verify' },
  { id: 'pay', label: 'Payment' },
  { id: 'pass', label: 'Pass' },
];

interface BookingDrawerProps {
  open: boolean;
  onClose: () => void;
  data: EventPageData | null;
  schedule: EventSchedule | null;
  initialTicketId: number | null;
  lang: Lang;
  paused?: boolean;
  salesMessage?: string;
  onBooked: () => void;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if (razorpayWindow()) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Payment checkout could not load.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Payment checkout could not load. Check your connection and retry.'));
    document.body.appendChild(script);
  });
}

function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') return {};
  const details = error.details as Record<string, unknown>;
  const next: Record<string, string> = {};
  for (const key of ['name', 'email', 'phone', 'qty']) {
    const value = details[key];
    if (Array.isArray(value) && value.length > 0) next[key] = String(value[0]);
  }
  const terms = details.acceptTerms;
  if (Array.isArray(terms) && terms.length > 0) next.terms = String(terms[0]);
  const staleTerms = details.acceptTermsVersion;
  if (staleTerms) next.terms = 'The policy was updated. Please read it again and re-accept.';
  for (const key of ['attendees', 'couponCode']) {
    const value = details[key];
    if (Array.isArray(value) && value.length > 0) next[key] = String(value[0]);
    else if (typeof value === 'string') next[key] = value;
  }
  return next;
}

const emptyAttendee = (): AttendeeInput => ({ name: '', phone: '', email: '' });

function cleanPhone(raw: string) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function rosterError(person: AttendeeInput): string {
  if (person.name.trim().length < 2) return 'Enter the full name.';
  if (!/^[6-9]\d{9}$/.test(cleanPhone(person.phone))) return 'Enter a valid 10-digit mobile number.';
  const email = person.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email or leave it blank.';
  return '';
}

export default function BookingDrawer({
  open,
  onClose,
  data,
  schedule,
  initialTicketId,
  lang,
  paused = false,
  salesMessage,
  onBooked,
}: BookingDrawerProps) {
  const [step, setStep] = useState<Step>('details');
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [attendees, setAttendees] = useState<AttendeeInput[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [policyVersion, setPolicyVersion] = useState<string | null>(null);
  const [policyReload, setPolicyReload] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [rosterTouched, setRosterTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<CreateBookingResult | null>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [otpBusy, setOtpBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [polling, setPolling] = useState(false);
  const [pass, setPass] = useState<EventBookingPass | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const event = data?.events.find((item) => item.id === schedule?.event_id) ?? null;
  const state = data?.states.find((item) => item.id === schedule?.state_id) ?? null;
  const city = state?.cities.find((item) => item.id === schedule?.city_id) ?? null;
  const venue = city?.venues.find((item) => item.id === schedule?.venue_id) ?? null;

  const ticketOptions = (event?.tickets ?? []).map((ticket) => {
    const capacity = schedule?.capacities.find((item) => item.ticketTypeId === ticket.id) ?? null;
    return { ticket, capacity };
  });

  const selectedOption = ticketOptions.find((option) => option.ticket.id === ticketId) ?? ticketOptions[0] ?? null;
  const selectedTicket = selectedOption?.ticket ?? null;
  const left = selectedOption?.capacity?.left ?? 0;
  const maxQty = Math.min(20, Math.max(1, left));
  const total = (selectedTicket?.price ?? 0) * qty;
  const couponOff = coupon?.ok ? Math.max(0, Number(coupon.amountOff ?? 0)) : 0;
  const net = Math.max(0, total - couponOff);
  const savings = selectedTicket?.actual_price
    ? Math.max(0, (Number(selectedTicket.actual_price) - Number(selectedTicket.price)) * qty)
    : 0;
  const saleEnd = schedule?.sale_ends_at ?? schedule?.event_sale_ends_at ?? null;
  const salesClosed = Boolean(schedule?.sale_ended || schedule?.date_passed);
  const closed = paused || salesClosed;

  useEffect(() => {
    if (!open) return;
    const preferred = ticketOptions.find((option) => option.ticket.id === initialTicketId && (option.capacity?.left ?? 0) > 0);
    const fallback = ticketOptions.find((option) => (option.capacity?.left ?? 0) > 0) ?? ticketOptions[0];
    setStep('details');
    setTicketId(preferred?.ticket.id ?? fallback?.ticket.id ?? null);
    setQty(1);
    setForm({ name: '', email: '', phone: '' });
    setAttendees([]);
    setCouponCode('');
    setCoupon(null);
    setCouponError('');
    setCouponBusy(false);
    setRosterTouched(false);
    setAcceptTerms(false);
    setErrors({});
    setGeneralError('');
    setBusy(false);
    setBooking(null);
    setOtp(['', '', '', '', '', '']);
    setOtpError('');
    setResendIn(0);
    setOtpBusy(false);
    setVerifying(false);
    setPayBusy(false);
    setPayError('');
    setPolling(false);
    setPass(null);
    // Reset only when the drawer is opened for a new schedule/ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule?.id, initialTicketId]);

  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [maxQty, qty]);

  // The buyer is attendee #1, so the roster always holds qty - 1 extra people.
  useEffect(() => {
    setAttendees((current) => {
      const wanted = Math.max(0, qty - 1);
      if (current.length === wanted) return current;
      if (current.length < wanted) {
        return [...current, ...Array.from({ length: wanted - current.length }, emptyAttendee)];
      }
      return current.slice(0, wanted);
    });
  }, [qty]);

  // A coupon quote is only valid for the ticket and quantity it was checked against.
  useEffect(() => {
    setCoupon(null);
    setCouponError('');
  }, [ticketId, qty, schedule?.id]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const sendOtp = async (reference: string) => {
    setOtpBusy(true);
    setOtpError('');
    try {
      await eventApi.requestOtp(reference);
      setResendIn(45);
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : 'Could not send the code.');
    } finally {
      setOtpBusy(false);
    }
  };

  const updateAttendee = (index: number, patch: Partial<AttendeeInput>) => {
    setAttendees((current) => current.map((person, position) => (position === index ? { ...person, ...patch } : person)));
  };

  const applyCoupon = async () => {
    if (!schedule || !selectedTicket) return;
    const code = couponCode.trim().toUpperCase();
    setCouponError('');
    if (code.length < 3) {
      setCoupon(null);
      setCouponError('Enter the coupon code first.');
      return;
    }
    setCouponBusy(true);
    try {
      const result = await eventApi.previewCoupon({
        scheduleId: schedule.id,
        ticketTypeId: selectedTicket.id,
        qty,
        email: form.email.trim() || undefined,
        couponCode: code,
      });
      if (!result.ok) {
        setCoupon(null);
        setCouponError(result.message || 'This coupon cannot be used for this booking.');
      } else {
        setCoupon(result);
        setErrors((current) => {
          if (!current.couponCode) return current;
          const next = { ...current };
          delete next.couponCode;
          return next;
        });
      }
    } catch (error) {
      setCoupon(null);
      setCouponError(error instanceof Error ? error.message : 'Could not check the coupon.');
    } finally {
      setCouponBusy(false);
    }
  };

  const submitDetails = async (event_: React.FormEvent) => {
    event_.preventDefault();
    if (!schedule || !selectedTicket) return;

    const phone = cleanPhone(form.phone);
    const roster = attendees.map((person) => ({
      name: person.name.trim(),
      phone: cleanPhone(person.phone),
      email: person.email?.trim() || undefined,
    }));
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (!/^[6-9]\d{9}$/.test(phone)) nextErrors.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (left <= 0) nextErrors.qty = 'This ticket is sold out.';
    if (qty > left) nextErrors.qty = `Only ${left} seat(s) left.`;
    if (!acceptTerms) nextErrors.terms = 'Please accept the terms, privacy and refund policy.';
    else if (!policyVersion) nextErrors.terms = 'The policy has not loaded yet. Check your connection and retry.';

    const firstBadRoster = roster.findIndex(rosterError);
    setRosterTouched(true);
    if (firstBadRoster >= 0) {
      nextErrors.attendees = `Person ${firstBadRoster + 2}: ${rosterError(roster[firstBadRoster])}`;
    }

    setErrors(nextErrors);
    setGeneralError('');
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const created = await eventApi.createBooking({
        scheduleId: schedule.id,
        ticketTypeId: selectedTicket.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone,
        qty,
        acceptTerms,
        acceptTermsVersion: policyVersion ?? '',
        couponCode: couponCode.trim() || undefined,
        attendees: roster.length > 0 ? roster : undefined,
      });
      setBooking(created);
      setStep('otp');
      setOtp(['', '', '', '', '', '']);
      await sendOtp(created.reference);
      window.setTimeout(() => otpRefs.current[0]?.focus(), 120);
    } catch (error) {
      const policyMoved =
        error instanceof ApiError &&
        Boolean(error.details) &&
        typeof error.details === 'object' &&
        'acceptTermsVersion' in (error.details as Record<string, unknown>);
      if (policyMoved) {
        setAcceptTerms(false);
        setPolicyReload((count) => count + 1);
      }
      setErrors(fieldErrorsFrom(error));
      setGeneralError(
        policyMoved ? '' : error instanceof Error ? error.message : 'Could not start the booking. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  };

  const updateDigit = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const next = [...otp];
    if (!digits) {
      next[index] = '';
      setOtp(next);
      return;
    }
    digits
      .slice(0, 6 - index)
      .split('')
      .forEach((digit, offset) => {
        next[index + offset] = digit;
      });
    setOtp(next);
    setOtpError('');
    const target = Math.min(5, index + digits.length);
    otpRefs.current[target]?.focus();
  };

  const verifyOtp = async () => {
    if (!booking) return;
    const code = otp.join('');
    if (code.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    setOtpError('');
    try {
      await eventApi.verifyOtp(booking.reference, code);
      setStep('pay');
      setPayError('');
    } catch (error) {
      setOtpError(error instanceof Error ? error.message : 'Could not verify the code.');
    } finally {
      setVerifying(false);
    }
  };

  const payDev = async () => {
    if (!booking) return;
    setPayBusy(true);
    setPayError('');
    try {
      const result = await eventApi.payBooking(booking.reference);
      setPass(result.pass);
      setStep('pass');
      onBooked();
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Could not complete the payment.');
    } finally {
      setPayBusy(false);
    }
  };

  const confirmLivePayment = async (reference: string) => {
    setPolling(true);
    setPayError('');
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await delay(1500);
      try {
        const current = await eventApi.lookup(reference, form.email.trim());
        if (current.status === 'paid' && current.qrToken) {
          setPass(current);
          setStep('pass');
          setPolling(false);
          onBooked();
          return;
        }
      } catch {
        // The webhook may still be processing — keep polling.
      }
    }
    setPolling(false);
    setPayError(
      'Payment is taking longer to confirm. Keep your reference safe and check "My booking" in a minute before paying again.',
    );
  };

  const payLive = async () => {
    if (!booking) return;
    setPayBusy(true);
    setPayError('');
    try {
      const order = await eventApi.createOrder(booking.reference);
      if (order.mode === 'dev') {
        await payDev();
        return;
      }
      if (order.mode === 'free') {
        setPass(order.pass);
        setStep('pass');
        onBooked();
        return;
      }
      await loadRazorpayScript();
      const Razorpay = razorpayWindow();
      if (!Razorpay) throw new Error('Payment checkout is unavailable. Please retry.');
      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        notes: order.notes,
        theme: { color: '#EE2C8F' },
        handler: () => {
          void confirmLivePayment(booking.reference);
        },
        modal: {
          ondismiss: () => {
            setPolling(false);
            setPayError('Payment window closed before confirmation. If money was debited, check "My booking" shortly.');
          },
        },
      });
      checkout.open();
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Could not start the payment.');
    } finally {
      setPayBusy(false);
    }
  };

  if (!event || !schedule || !state || !city || !venue) return null;

  const dateLabel = formatDateRange(schedule.event_date, schedule.end_date, lang);
  const timeLabel = formatTimeRange(schedule.start_time, schedule.end_time);
  const stepIndex = STEP_LIST.findIndex((item) => item.id === step);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex justify-end bg-sindoor-deep/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Book your pass"
        >
          <motion.div
            className="flex h-[100dvh] w-full max-w-[540px] flex-col bg-sandal shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event_) => event_.stopPropagation()}
          >
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-sindoor-deep via-sindoor to-[#3B1C4A] px-5 pb-4 pt-5 text-white sm:px-6">
              <div
                className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(238,44,143,.8), transparent 65%)' }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-ui text-[0.58rem] uppercase tracking-[0.22em] text-sky">
                    {kindName(event.kind, lang, event)} · {lang === 'hi' ? 'पास बुकिंग' : 'Pass booking'}
                  </p>
                  <h2 className="mt-1.5 truncate font-display text-[1.6rem] leading-tight text-white">
                    {lang === 'hi' ? event.name_hi : event.name_en}
                  </h2>
                  <p className="mt-1 text-xs text-cream-on-dark/60">
                    {lang === 'hi' ? venue.name_hi : venue.name_en} · {lang === 'hi' ? city.name_hi : city.name_en} · {dateLabel}
                    {timeLabel ? ` · ${timeLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close booking"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 text-white/70 transition-colors hover:border-white/50 hover:text-white"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="relative mt-4 flex items-center">
                {STEP_LIST.map((item, index) => {
                  const done = index < stepIndex;
                  const active = index === stepIndex;
                  return (
                    <div key={item.id} className="flex flex-1 items-center last:flex-none">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[0.62rem] font-semibold transition-colors ${
                            done
                              ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300'
                              : active
                                ? 'border-marigold bg-marigold text-sindoor-deep'
                                : 'border-white/25 text-white/40'
                          }`}
                        >
                          {done ? <Check size={12} /> : index + 1}
                        </span>
                        <span
                          className={`font-ui text-[0.6rem] uppercase tracking-[0.12em] ${
                            active ? 'text-white' : done ? 'text-emerald-300/80' : 'text-white/35'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      {index < STEP_LIST.length - 1 && (
                        <span className={`mx-2 h-px flex-1 ${done ? 'bg-emerald-400/40' : 'bg-white/15'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {paused && step !== 'pass' && (
                <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-900">
                  <strong className="font-semibold">
                    {lang === 'hi' ? 'बुकिंग अस्थायी रूप से बंद है।' : 'Bookings are paused.'}
                  </strong>{' '}
                  {salesMessage ||
                    (lang === 'hi'
                      ? 'कृपया थोड़ी देर बाद प्रयास करें।'
                      : 'Please check back shortly.')}
                </div>
              )}
              {step === 'details' && (
                <form onSubmit={submitDetails} noValidate>
                  <div className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-ui text-[0.62rem] uppercase tracking-[0.16em] text-muted">Venue</p>
                        <p className="mt-1 font-ui text-sm font-semibold text-ink">
                          {lang === 'hi' ? venue.name_hi : venue.name_en}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {lang === 'hi' ? venue.address_hi : venue.address_en}
                        </p>
                      </div>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-saffron/10 text-saffron-ink">
                        <Ticket size={17} />
                      </span>
                    </div>
                    {saleEnd && (
                      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[0.68rem] text-muted">
                        <Clock3 size={12} className="text-saffron" /> Ticket sales close{' '}
                        {formatDateRange(saleEnd, saleEnd, lang)}
                        {formatTime(saleEnd) ? ` · ${formatTime(saleEnd)}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-end justify-between gap-3">
                      <h3 className="font-display text-xl text-ink">Choose your ticket</h3>
                      {closed && (
                        <span className="chip chip--lotus">{paused ? 'Bookings paused' : 'Sales closed'}</span>
                      )}
                    </div>
                    <div className="mt-2.5 space-y-2">
                      {ticketOptions.map(({ ticket, capacity }) => {
                        const optionLeft = capacity?.left ?? 0;
                        const disabled = closed || optionLeft <= 0;
                        const selected = selectedTicket?.id === ticket.id;
                        return (
                          <button
                            key={ticket.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              setTicketId(ticket.id);
                              setQty((value) => Math.min(value, Math.max(1, optionLeft)));
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                              selected
                                ? 'border-saffron bg-saffron/[0.06] shadow-[0_8px_24px_-20px_rgba(238,44,143,.8)]'
                                : 'border-line bg-white hover:border-saffron/50'
                            }`}
                          >
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                                selected ? 'border-saffron bg-saffron text-white' : 'border-line text-transparent'
                              }`}
                            >
                              <Check size={12} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-ui text-sm font-semibold text-ink">
                                  {lang === 'hi' ? ticket.name_hi : ticket.name_en}
                                </span>
                                {(ticket.badge_en || ticket.badge_hi) && (
                                  <span className="rounded-full bg-sky/10 px-1.5 py-0.5 text-[0.56rem] uppercase tracking-[0.12em] text-sky-ink">
                                    {lang === 'hi' ? ticket.badge_hi : ticket.badge_en}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-[0.68rem] text-muted">
                                {optionLeft <= 0 ? 'Sold out' : `${optionLeft.toLocaleString('en-IN')} seats left`}
                                {' · '}
                                {Number(ticket.valid_days) > 1
                                  ? lang === 'hi'
                                    ? `${ticket.valid_days} दिन · हर दिन एक प्रवेश`
                                    : `${ticket.valid_days} days · one entry each day`
                                  : lang === 'hi'
                                    ? 'एक दिन · एक प्रवेश'
                                    : 'one day · one entry'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <PriceTag
                                ticket={ticket}
                                lang={lang}
                                size="sm"
                                align="right"
                                caption={lang === 'hi' ? 'प्रति व्यक्ति' : 'per head'}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3.5">
                    <div>
                      <p className="font-ui text-sm font-semibold text-ink">Number of attendees</p>
                      <p className="text-[0.68rem] text-muted">Max 20 per booking</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Reduce quantity"
                        onClick={() => setQty((value) => Math.max(1, value - 1))}
                        disabled={qty <= 1}
                        className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink transition-colors hover:border-saffron disabled:opacity-40"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-7 text-center font-display text-xl text-ink">{qty}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setQty((value) => Math.min(maxQty, value + 1))}
                        disabled={qty >= maxQty}
                        className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink transition-colors hover:border-saffron disabled:opacity-40"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {attendees.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-line bg-white p-4">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky/10 text-sky-ink">
                          <Users size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="font-ui text-sm font-semibold text-ink">
                            {bi('Who else is coming?', 'और कौन आ रहे हैं?', lang)}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
                            {bi(
                              'One name and mobile per extra seat. A single group QR lets everyone in together.',
                              'हर अतिरिक्त सीट के लिए एक नाम और मोबाइल नंबर। एक ही ग्रुप QR से सभी प्रवेश करेंगे।',
                              lang,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 space-y-3">
                        {attendees.map((person, index) => {
                          const rowError = rosterTouched ? rosterError(person) : '';
                          return (
                            <div
                              key={`attendee-${index}`}
                              className={`rounded-xl border p-3 transition-colors ${
                                rowError ? 'border-red-400/60 bg-red-50/50' : 'border-line bg-sandal-2/50'
                              }`}
                            >
                              <p className="font-ui text-[0.62rem] uppercase tracking-[0.14em] text-muted">
                                {bi(`Person ${index + 2}`, `व्यक्ति ${index + 2}`, lang)}
                              </p>
                              <div className="mt-2 space-y-2">
                                <input
                                  className="field"
                                  value={person.name}
                                  onChange={(event_) => updateAttendee(index, { name: event_.target.value })}
                                  placeholder={bi('Full name', 'पूरा नाम', lang)}
                                  autoComplete="off"
                                  aria-label={bi(`Person ${index + 2} name`, `व्यक्ति ${index + 2} का नाम`, lang)}
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="tel"
                                    inputMode="tel"
                                    className="field flex-1"
                                    value={person.phone}
                                    onChange={(event_) => updateAttendee(index, { phone: event_.target.value })}
                                    placeholder={bi('Mobile number', 'मोबाइल नंबर', lang)}
                                    autoComplete="off"
                                    aria-label={bi(
                                      `Person ${index + 2} mobile number`,
                                      `व्यक्ति ${index + 2} का मोबाइल नंबर`,
                                      lang,
                                    )}
                                  />
                                  <input
                                    type="email"
                                    inputMode="email"
                                    className="field flex-1"
                                    value={person.email ?? ''}
                                    onChange={(event_) => updateAttendee(index, { email: event_.target.value })}
                                    placeholder={bi('Email (optional)', 'ईमेल (वैकल्पिक)', lang)}
                                    autoComplete="off"
                                    aria-label={bi(
                                      `Person ${index + 2} email`,
                                      `व्यक्ति ${index + 2} का ईमेल`,
                                      lang,
                                    )}
                                  />
                                </div>
                                {rowError && <p className="field-error">{rowError}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {errors.attendees && <p className="field-error mt-2">{errors.attendees}</p>}
                    </div>
                  )}

                  <div className="mt-5 space-y-3.5">
                    <div>
                      <label className="field-label" htmlFor="booking-name">Full name</label>
                      <input
                        id="booking-name"
                        className="field"
                        value={form.name}
                        onChange={(event_) => setForm({ ...form, name: event_.target.value })}
                        placeholder="As you would like it on the pass"
                        autoComplete="name"
                      />
                      {errors.name && <p className="field-error">{errors.name}</p>}
                    </div>
                    <div>
                      <label className="field-label" htmlFor="booking-email">Email for OTP & pass</label>
                      <input
                        id="booking-email"
                        type="email"
                        className="field"
                        value={form.email}
                        onChange={(event_) => setForm({ ...form, email: event_.target.value })}
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputMode="email"
                      />
                      {errors.email && <p className="field-error">{errors.email}</p>}
                    </div>
                    <div>
                      <label className="field-label" htmlFor="booking-phone">Mobile number</label>
                      <input
                        id="booking-phone"
                        type="tel"
                        className="field"
                        value={form.phone}
                        onChange={(event_) => setForm({ ...form, phone: event_.target.value })}
                        placeholder="10-digit mobile number"
                        autoComplete="tel"
                        inputMode="tel"
                      />
                      {errors.phone && <p className="field-error">{errors.phone}</p>}
                    </div>
                    {errors.qty && <p className="field-error">{errors.qty}</p>}

                    <PolicySummary lang={lang} reloadKey={policyReload} onVersion={setPolicyVersion} />

                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-3 transition-colors ${
                        errors.terms ? 'border-red-400/60 bg-red-50/60' : 'border-line bg-sandal-2/50 hover:border-saffron/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#EE2C8F]"
                        checked={acceptTerms}
                        onChange={(event_) => {
                          setAcceptTerms(event_.target.checked);
                          setErrors((current) => {
                            if (!current.terms) return current;
                            const next = { ...current };
                            delete next.terms;
                            return next;
                          });
                        }}
                      />
                      <span className="text-[0.72rem] leading-relaxed text-text">
                        {lang === 'hi' ? 'मैं इन नियमों से सहमत हूँ: ' : 'I accept the '}
                        <Link to="/terms" target="_blank" className="font-semibold text-saffron-ink underline">
                          {lang === 'hi' ? 'नियम एवं शर्तें' : 'Terms & conditions'}
                        </Link>
                        {', '}
                        <Link to="/privacy" target="_blank" className="font-semibold text-saffron-ink underline">
                          {lang === 'hi' ? 'गोपनीयता नीति' : 'Privacy policy'}
                        </Link>
                        {' & '}
                        <Link to="/refund" target="_blank" className="font-semibold text-saffron-ink underline">
                          {lang === 'hi' ? 'धनवापसी नीति' : 'Refund policy'}
                        </Link>
                        {lang === 'hi'
                          ? '। पास का नाम और QR केवल इसी व्यक्ति के लिए मान्य है।'
                          : '. The pass and QR are valid only for the name on this booking.'}
                      </span>
                    </label>
                    {errors.terms && <p className="field-error">{errors.terms}</p>}
                  </div>

                  {generalError && (
                    <div className="mt-4 rounded-xl border border-red-400/30 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                      {generalError}
                    </div>
                  )}

                  <div className="mt-5 rounded-2xl border border-line bg-white p-4">
                    <label className="field-label" htmlFor="booking-coupon">
                      <span className="inline-flex items-center gap-1.5">
                        <Tag size={12} className="text-saffron" />
                        {bi('Coupon code', 'कूपन कोड', lang)}
                      </span>
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id="booking-coupon"
                        className="field flex-1 font-mono uppercase tracking-[0.12em]"
                        value={couponCode}
                        maxLength={32}
                        autoComplete="off"
                        placeholder={bi('Enter code', 'कोड दर्ज करें', lang)}
                        onChange={(event_) => {
                          setCouponCode(event_.target.value.toUpperCase());
                          setCoupon(null);
                          setCouponError('');
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void applyCoupon()}
                        disabled={couponBusy || closed}
                        className="btn btn-ghost btn-sm shrink-0"
                      >
                        {couponBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                        {couponBusy ? bi('Checking…', 'जाँच रहे हैं…', lang) : bi('Apply', 'लागू करें', lang)}
                      </button>
                    </div>
                    {coupon?.ok && (
                      <p className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <span className="min-w-0 truncate">
                          {(lang === 'hi' ? coupon.label_hi : coupon.label_en) || coupon.code}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {bi('You save', 'आपकी बचत', lang)} − {formatRupees(couponOff)}
                        </span>
                      </p>
                    )}
                    {(couponError || errors.couponCode) && (
                      <p className="field-error mt-2">{couponError || errors.couponCode}</p>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between text-sm text-text">
                      <span>
                        {selectedTicket ? (lang === 'hi' ? selectedTicket.name_hi : selectedTicket.name_en) : 'Ticket'} × {qty}
                      </span>
                      <span>{formatRupees(total)}</span>
                    </div>
                    {savings > 0 && (
                      <div className="mt-1.5 flex items-center justify-between text-[0.72rem] text-emerald-700">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="line-through text-muted">
                            {formatRupees((Number(selectedTicket?.actual_price) || 0) * qty)}
                          </span>
                          {Number(selectedTicket?.discount_percent) > 0 && `${selectedTicket?.discount_percent}% off`}
                        </span>
                        <span>{lang === 'hi' ? `बचत ${formatRupees(savings)}` : `You save ${formatRupees(savings)}`}</span>
                      </div>
                    )}
                    {couponOff > 0 && (
                      <div className="mt-1.5 flex items-center justify-between text-[0.72rem] text-emerald-700">
                        <span className="truncate">
                          {bi('Coupon', 'कूपन', lang)} · {coupon?.code}
                        </span>
                        <span>− {formatRupees(couponOff)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between border-t border-dashed border-line pt-2.5">
                      <span className="font-ui text-sm font-semibold text-ink">
                        {net === 0 ? bi('Free pass', 'नि:शुल्क पास', lang) : bi('Total payable', 'कुल देय', lang)}
                      </span>
                      <span className="font-display text-2xl text-ink">{formatRupees(net)}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy || closed || !selectedTicket || left <= 0}
                    className="btn btn-primary btn-block mt-4"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {busy
                      ? 'Holding your seats…'
                      : paused
                        ? lang === 'hi'
                          ? 'बुकिंग अस्थायी रूप से बंद'
                          : 'Bookings paused'
                        : salesClosed
                          ? 'Sales closed'
                          : 'Continue to verification'}
                  </button>
                  <p className="mt-2.5 text-center text-[0.66rem] leading-relaxed text-muted">
                    Seats are held for 30 minutes once you continue. No payment is taken yet.
                  </p>
                </form>
              )}

              {step === 'otp' && booking && (
                <div>
                  <div className="rounded-2xl border border-line bg-white p-4 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sky/10 text-sky-ink">
                      <Mail size={20} />
                    </span>
                    <h3 className="mt-3 font-display text-xl text-ink">Verify your email</h3>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
                      We sent a 6-digit code to <strong className="font-semibold text-ink">{form.email}</strong>. Enter it
                      to confirm this booking.
                    </p>
                    <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sandal-2 px-3 py-1.5 font-mono text-xs tracking-[0.14em] text-ink">
                      {booking.reference}
                    </p>
                  </div>

                  <div className="mt-5 flex justify-center gap-2">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          otpRefs.current[index] = element;
                        }}
                        value={digit}
                        onChange={(event_) => updateDigit(index, event_.target.value)}
                        onKeyDown={(event_) => {
                          if (event_.key === 'Backspace' && !digit && index > 0) otpRefs.current[index - 1]?.focus();
                          if (event_.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
                          if (event_.key === 'ArrowRight' && index < 5) otpRefs.current[index + 1]?.focus();
                        }}
                        onPaste={(event_) => {
                          const text = event_.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                          if (!text) return;
                          event_.preventDefault();
                          const next = Array.from({ length: 6 }, (_, position) => text[position] ?? '');
                          setOtp(next);
                          otpRefs.current[Math.min(5, text.length - 1)]?.focus();
                        }}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={1}
                        aria-label={`OTP digit ${index + 1}`}
                        className="h-12 w-11 rounded-xl border border-line bg-white text-center font-display text-xl text-ink outline-none transition-colors focus:border-saffron focus:ring-2 focus:ring-saffron/15"
                      />
                    ))}
                  </div>

                  {otpError && (
                    <div className="mx-auto mt-4 max-w-sm rounded-xl border border-red-400/30 bg-red-50 px-3.5 py-2.5 text-center text-sm text-red-700">
                      {otpError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={verifying || otp.join('').length !== 6}
                    className="btn btn-primary btn-block mt-5"
                  >
                    {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    {verifying ? 'Verifying…' : 'Verify & continue'}
                  </button>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>Code expires in 10 minutes · max 5 attempts</span>
                    <button
                      type="button"
                      onClick={() => void sendOtp(booking.reference)}
                      disabled={otpBusy || resendIn > 0}
                      className="font-ui font-semibold text-saffron-ink disabled:cursor-not-allowed disabled:text-muted"
                    >
                      {otpBusy ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                    </button>
                  </div>
                </div>
              )}

              {step === 'pay' && booking && (
                <div>
                  <div className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-ui text-[0.62rem] uppercase tracking-[0.16em] text-muted">Booking reference</p>
                        <p className="mt-1 font-mono text-base tracking-[0.14em] text-ink">{booking.reference}</p>
                      </div>
                      <span className="chip chip--lotus">Seats held</span>
                    </div>
                    <dl className="mt-4 space-y-2 border-t border-dashed border-line pt-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Ticket</dt>
                        <dd className="text-right text-ink">
                          {selectedTicket ? (lang === 'hi' ? selectedTicket.name_hi : selectedTicket.name_en) : ''}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{bi('Attendees', 'कितने लोग', lang)}</dt>
                        <dd className="text-ink">{qty}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Venue</dt>
                        <dd className="max-w-[240px] text-right text-ink">
                          {lang === 'hi' ? venue.name_hi : venue.name_en}, {lang === 'hi' ? city.name_hi : city.name_en}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-dashed border-line pt-2.5">
                        <dt className="font-ui font-semibold text-ink">
                          {booking.amount === 0 ? bi('Free pass', 'नि:शुल्क पास', lang) : bi('Amount payable', 'देय राशि', lang)}
                        </dt>
                        <dd className="font-display text-2xl text-ink">{formatRupees(booking.amount)}</dd>
                      </div>
                    </dl>
                  </div>

                  {data?.paymentMode === 'dev' ? (
                    <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
                      <strong className="font-semibold">Test payment mode.</strong> No money will be charged. The QR pass
                      is issued immediately so you can test gate check-in.
                    </div>
                  ) : (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky/30 bg-sky/5 px-3.5 py-3 text-xs leading-relaxed text-sky-ink">
                      <Lock size={14} className="mt-0.5 shrink-0" />
                      You will complete payment on Razorpay's secure checkout. Your pass is issued only after the
                      payment is verified by our server.
                    </div>
                  )}

                  {payError && (
                    <div className="mt-4 rounded-xl border border-red-400/30 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                      {payError}
                    </div>
                  )}

                  {polling ? (
                    <div className="mt-5 flex flex-col items-center rounded-2xl border border-line bg-white px-4 py-8 text-center">
                      <Loader2 size={24} className="animate-spin text-saffron" />
                      <p className="mt-3 font-ui text-sm font-semibold text-ink">Confirming your payment…</p>
                      <p className="mt-1 text-xs text-muted">This usually takes a few seconds.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (data?.paymentMode === 'dev') void payDev();
                        else void payLive();
                      }}
                      disabled={payBusy || paused}
                      className="btn btn-primary btn-block mt-5"
                    >
                      {payBusy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                      {payBusy
                        ? bi('Starting payment…', 'भुगतान शुरू कर रहे हैं…', lang)
                        : paused
                          ? lang === 'hi'
                            ? 'भुगतान अस्थायी रूप से बंद'
                            : 'Payments paused'
                          : booking.amount === 0
                            ? bi('Get your free pass', 'अपना निःशुल्क पास पाएँ', lang)
                            : data?.paymentMode === 'dev'
                              ? `Complete test payment · ${formatRupees(booking.amount)}`
                              : `Pay ${formatRupees(booking.amount)} securely`}
                    </button>
                  )}

                  <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.66rem] text-muted">
                    <ShieldCheck size={12} className="text-success" /> Payment is verified server-side · pass is single-use
                  </p>
                </div>
              )}

              {step === 'pass' && pass && (
                <div>
                  <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-300/60 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 size={20} className="shrink-0 text-emerald-700" />
                    <div>
                      <p className="font-ui text-sm font-semibold text-emerald-900">
                        {pass.amount === 0 ? bi('Pass confirmed', 'पास की पुष्टि हो गई', lang) : bi('Payment confirmed', 'भुगतान की पुष्टि हो गई', lang)}
                      </p>
                      <p className="text-xs text-emerald-800/75">
                        {bi(
                          `Your QR pass is ready. ${pass.qty} ${pass.qty === 1 ? 'seat' : 'seats'} reserved — one group QR for all of them.`,
                          `आपका QR पास तैयार है। ${pass.qty} ${pass.qty === 1 ? 'सीट' : 'सीटें'} आरक्षित — सभी के लिए एक ही ग्रुप QR।`,
                          lang,
                        )}
                      </p>
                    </div>
                  </div>
                  <EventPass pass={pass} lang={lang} compact />
                  <button type="button" onClick={onClose} className="btn btn-primary btn-block mt-4">
                    Done
                  </button>
                  <p className="mt-2.5 text-center text-[0.66rem] leading-relaxed text-muted">
                    Find this pass anytime under "My booking" with your reference and email or phone.
                  </p>
                </div>
              )}
            </div>

            {step !== 'pass' && (
              <div className="shrink-0 border-t border-line bg-white/70 px-5 py-2.5 backdrop-blur sm:px-6">
                <p className="flex items-center justify-center gap-1.5 text-center text-[0.64rem] text-muted">
                  <ShieldCheck size={12} className="text-success" />
                  Email OTP verification · server-checked capacity · {bi('Instant QR pass', 'तुरंत QR पास', lang)}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
