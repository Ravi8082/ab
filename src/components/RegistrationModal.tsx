import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, Mail, Users, Tag, Check, Loader2 } from 'lucide-react';
import type { CityItem, TicketType } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { useToast } from '@/context/ToastContext';
import { createBooking, openRazorpayCheckout, verifyPayment, type BookingResult } from '@/lib/booking';
import { formatRupees, priceInfo } from '@/lib/pricing';

interface RegistrationModalProps {
  open: boolean;
  onClose: () => void;
  ticket: TicketType | null;
  preselectedCity: CityItem | null;
  cities: CityItem[];
  onConfirmed: (booking: BookingResult, details: { name: string; persons: number; ticketLabel: string; eventName: string; eventDate: string; eventVenue: string; city?: { city: string; state: string } }) => void;
}

export default function RegistrationModal({ open, onClose, ticket, preselectedCity, cities, onConfirmed }: RegistrationModalProps) {
  const { lang } = useApp();
  const toast = useToast();
  const [persons, setPersons] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [coupon, setCoupon] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>(preselectedCity?.id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'form' | 'creating' | 'paying' | 'verifying'>('form');

  useEffect(() => {
    if (open) {
      setPhase('form');
      setSelectedCity(preselectedCity?.id ?? '');
    }
  }, [open, preselectedCity]);

  const isSundarkand = ticket?.event_id === 'evt-sundarkand';
  const availableCities = cities.filter((c) => c.event_id === 'evt-sundarkand' && c.capacity - c.booked > 0);

  const price = ticket ? priceInfo(ticket) : null;
  const unitPrice = price?.finalPrice ?? 0;
  const total = unitPrice * persons;
  const totalSaved = price && price.hasDiscount ? (price.basePrice - price.finalPrice) * persons : 0;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = lang === 'en' ? 'Name is required' : 'नाम आवश्यक है';
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '')))
      e.phone = lang === 'en' ? 'Enter a valid Indian phone number' : 'मान्य भारतीय फ़ोन नंबर दर्ज करें';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = lang === 'en' ? 'Enter a valid email' : 'मान्य ईमेल दर्ज करें';
    if (isSundarkand && !selectedCity) e.city = lang === 'en' ? 'Select a city' : 'शहर चुनें';
    if (persons < 1) e.persons = lang === 'en' ? 'At least 1 person' : 'कम से कम 1 व्यक्ति';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !ticket) return;

    try {
      setPhase('creating');
      const booking = await createBooking({
        ticket_type_id: ticket.id,
        event_id: ticket.event_id,
        city_id: isSundarkand ? selectedCity : undefined,
        persons,
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        email: email.trim(),
        coupon_code: coupon.trim() || undefined,
      });

      if (booking.amount === 0) {
        // Free booking, skip payment
        toast(lang === 'en' ? 'Registration confirmed!' : 'रजिस्ट्रेशन सफल!', 'success');
        const city = isSundarkand ? cities.find((c) => c.id === selectedCity) : undefined;
        onConfirmed(booking, {
          name: name.trim(),
          persons,
          ticketLabel: uiT(ticket.label, lang),
          eventName: isSundarkand ? 'Mahi Sundarkand' : 'Adhyatmik Bharat Expo',
          eventDate: isSundarkand ? '2027-06-12' : '2027-08-27',
          eventVenue: isSundarkand ? (city ? city.city : 'Multiple cities') : 'Pragati Maidan, Delhi',
          city: city ? { city: city.city, state: city.state } : undefined,
        });
        onClose();
        return;
      }

      setPhase('paying');
      await openRazorpayCheckout(
        booking.amount,
        booking.booking_id,
        booking.booking_code,
        name.trim(),
        email.trim(),
        phone,
        async (paymentId, orderId, signature) => {
          setPhase('verifying');
          const ok = await verifyPayment(booking.booking_id, orderId, paymentId, signature);
          if (ok) {
            toast(lang === 'en' ? 'Payment verified, registration confirmed!' : 'भुगतान सत्यापित, रजिस्ट्रेशन सफल!', 'success');
            const city = isSundarkand ? cities.find((c) => c.id === selectedCity) : undefined;
            onConfirmed(booking, {
              name: name.trim(),
              persons,
              ticketLabel: uiT(ticket.label, lang),
              eventName: isSundarkand ? 'Mahi Sundarkand' : 'Adhyatmik Bharat Expo',
              eventDate: isSundarkand ? '2027-06-12' : '2027-08-27',
              eventVenue: isSundarkand ? (city ? city.city : 'Multiple cities') : 'Pragati Maidan, Delhi',
              city: city ? { city: city.city, state: city.state } : undefined,
            });
            onClose();
          } else {
            toast(lang === 'en' ? 'Payment verification failed' : 'भुगतान सत्यापन विफल', 'error');
            setPhase('form');
          }
        },
        (error) => {
          toast(error === 'Payment cancelled' ? (lang === 'en' ? 'Payment cancelled' : 'भुगतान रद्द') : error, 'warning');
          setPhase('form');
        }
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
      setPhase('form');
    }
  };

  const phaseLabel = {
    form: lang === 'en' ? 'Pay & register' : 'भुगतान करें और रजिस्टर करें',
    creating: lang === 'en' ? 'Creating booking...' : 'बुकिंग बना रहे हैं...',
    paying: lang === 'en' ? 'Opening payment...' : 'भुगतान खोल रहे हैं...',
    verifying: lang === 'en' ? 'Verifying payment...' : 'भुगतान सत्यापित...',
  };

  return (
    <AnimatePresence>
      {open && ticket && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-sindoor-deep/80 backdrop-blur-sm"
            onClick={phase === 'form' ? onClose : undefined}
          />
          <motion.div
            className="card relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px]"
            role="dialog"
            aria-modal="true"
            aria-label={lang === 'en' ? 'Book your seat' : 'अपनी सीट बुक करें'}
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="pointer-events-none sticky top-0 z-10 -mb-2 h-1.5 w-full"
              style={{ background: 'var(--grad-hand)' }}
            />
            <div className="p-6 sm:p-8">
            {phase === 'form' && (
              <button
                onClick={onClose}
                aria-label={lang === 'en' ? 'Close' : 'बंद करें'}
                className="absolute right-4 top-6 grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-muted transition-colors hover:border-saffron hover:text-saffron-ink"
              >
                <X size={18} />
              </button>
            )}

            <span className="eyebrow">{lang === 'en' ? 'Your seat' : 'आपकी सीट'}</span>
            <h3 className="mt-2 mb-1 font-display text-3xl text-ink">
              {uiT(ui.nav.register, lang)}
            </h3>
            <p className="mb-6 text-sm text-muted">
              {uiT(ticket.label, lang)}
              {price && (
                <>
                  {' · '}
                  <span className="font-semibold text-ink">{formatRupees(price.finalPrice)}</span>
                  {price.hasDiscount && (
                    <span className="line-through">{` ${formatRupees(price.basePrice)}`}</span>
                  )}
                </>
              )}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSundarkand && (
                <div>
                  <label className="field-label">{lang === 'en' ? 'City' : 'शहर'}</label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={phase !== 'form'}
                    className="field"
                  >
                    <option value="">{lang === 'en' ? 'Select city' : 'शहर चुनें'}</option>
                    {availableCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.city}, {c.state} ({(c.capacity - c.booked).toLocaleString('en-IN')} {uiT(ui.sundarkand.seatsLeft, lang)})
                      </option>
                    ))}
                  </select>
                  {errors.city && <p className="field-error">{errors.city}</p>}
                </div>
              )}

              <Field icon={<User size={16} />} label={lang === 'en' ? 'Full name' : 'पूरा नाम'}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={phase !== 'form'}
                  className="field pl-10"
                  placeholder={lang === 'en' ? 'Your name' : 'आपका नाम'}
                />
              </Field>
              {errors.name && <p className="field-error -mt-2">{errors.name}</p>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">{lang === 'en' ? 'Phone' : 'फ़ोन'}</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={phase !== 'form'}
                      className="field pl-10"
                      placeholder="9876543210"
                    />
                  </div>
                  {errors.phone && <p className="field-error">{errors.phone}</p>}
                </div>
                <div>
                  <label className="field-label">{lang === 'en' ? 'Persons' : 'व्यक्ति'}</label>
                  <div className="relative">
                    <Users size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" />
                    <input
                      type="number"
                      min={1}
                      max={ticket.max_quantity}
                      value={persons}
                      onChange={(e) => setPersons(Math.max(1, Math.min(ticket.max_quantity, Number(e.target.value))))}
                      disabled={phase !== 'form'}
                      className="field pl-10"
                    />
                  </div>
                  {errors.persons && <p className="field-error">{errors.persons}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {lang === 'en' ? `Max ${ticket.max_quantity} per booking` : `एक बुकिंग में अधिकतम ${ticket.max_quantity}`}
                  </p>
                </div>
              </div>

              <div>
                <label className="field-label">{lang === 'en' ? 'Email' : 'ईमेल'}</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={phase !== 'form'}
                    className="field pl-10"
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && <p className="field-error">{errors.email}</p>}
              </div>

              <div>
                <label className="field-label">{lang === 'en' ? 'Coupon code (optional)' : 'कूपन कोड (वैकल्पिक)'}</label>
                <div className="relative">
                  <Tag size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/70" />
                  <input
                    type="text"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    disabled={phase !== 'form'}
                    className="field pl-10 uppercase"
                    placeholder={lang === 'en' ? 'Enter code' : 'कोड दर्ज करें'}
                  />
                </div>
              </div>

              <div className="mt-2 border-t border-line pt-5">
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xs uppercase tracking-[0.18em] text-muted">
                    {lang === 'en' ? `Total · ${persons} ${persons === 1 ? 'person' : 'people'}` : `कुल · ${persons} व्यक्ति`}
                  </span>
                  <span className="font-display text-3xl font-semibold text-saffron-ink">
                    {formatRupees(total)}
                  </span>
                </div>
                {totalSaved > 0 && (
                  <p className="mt-1 text-right text-sm font-semibold text-success">
                    {lang === 'en' ? `You save ${formatRupees(totalSaved)}` : `आपकी बचत ${formatRupees(totalSaved)}`}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={phase !== 'form'}
                className="btn btn-primary btn-block mt-2 disabled:opacity-70"
              >
                {phase !== 'form' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {phaseLabel[phase]}
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    {phaseLabel.form}
                  </>
                )}
              </button>
            </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="relative">
        {icon && <div className="absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-muted/70">{icon}</div>}
        {children}
      </div>
    </div>
  );
}
