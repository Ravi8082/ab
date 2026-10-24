import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, Mail, Users, Tag, Check, Loader2 } from 'lucide-react';
import type { CityItem, TicketType } from '@/types';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { useToast } from '@/context/ToastContext';
import { createBooking, openRazorpayCheckout, verifyPayment, type BookingResult } from '@/lib/booking';

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

  const unitPrice = ticket?.price ?? 0;
  const total = unitPrice * persons;

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
          <div className="absolute inset-0 bg-navy-900/85 backdrop-blur-md" onClick={phase === 'form' ? onClose : undefined} />
          <motion.div
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto glass rounded-3xl border border-gold/25 p-6 sm:p-8"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {phase === 'form' && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full text-ivory/60 hover:text-gold hover:bg-white/5 transition-all"
              >
                <X size={20} />
              </button>
            )}

            <h3 className="font-devanagari text-2xl text-gradient-gold mb-1">
              {uiT(ui.nav.register, lang)}
            </h3>
            <p className="text-ivory/50 text-sm font-mukta mb-6">
              {uiT(ticket.label, lang)} · ₹{ticket.price.toLocaleString('en-IN')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSundarkand && (
                <div>
                  <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">
                    {lang === 'en' ? 'City' : 'शहर'}
                  </label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={phase !== 'form'}
                    className="w-full px-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">{lang === 'en' ? 'Select city' : 'शहर चुनें'}</option>
                    {availableCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.city}, {c.state} ({c.capacity - c.booked} {uiT(ui.sundarkand.seatsLeft, lang)})
                      </option>
                    ))}
                  </select>
                  {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
                </div>
              )}

              <Field icon={<User size={16} />} label={lang === 'en' ? 'Full name' : 'पूरा नाम'}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={phase !== 'form'}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors disabled:opacity-50"
                  placeholder={lang === 'en' ? 'Your name' : 'आपका नाम'}
                />
              </Field>
              {errors.name && <p className="text-red-400 text-xs -mt-2">{errors.name}</p>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">
                    {lang === 'en' ? 'Phone' : 'फ़ोन'}
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={phase !== 'form'}
                      className="w-full pl-10 pr-3 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors disabled:opacity-50"
                      placeholder="9876543210"
                    />
                  </div>
                  {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">
                    {lang === 'en' ? 'Persons' : 'व्यक्ति'}
                  </label>
                  <div className="relative">
                    <Users size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
                    <input
                      type="number"
                      min={1}
                      max={ticket.max_quantity}
                      value={persons}
                      onChange={(e) => setPersons(Math.max(1, Math.min(ticket.max_quantity, Number(e.target.value))))}
                      disabled={phase !== 'form'}
                      className="w-full pl-10 pr-3 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none transition-colors disabled:opacity-50"
                    />
                  </div>
                  {errors.persons && <p className="text-red-400 text-xs mt-1">{errors.persons}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">
                  {lang === 'en' ? 'Email' : 'ईमेल'}
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={phase !== 'form'}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors disabled:opacity-50"
                    placeholder="you@example.com"
                  />
                </div>
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">
                  {lang === 'en' ? 'Coupon code (optional)' : 'कूपन कोड (वैकल्पिक)'}
                </label>
                <div className="relative">
                  <Tag size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
                  <input
                    type="text"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    disabled={phase !== 'form'}
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none transition-colors uppercase disabled:opacity-50"
                    placeholder={lang === 'en' ? 'Enter code' : 'कोड दर्ज करें'}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gold/15">
                <span className="text-ivory/60 font-mukta">{lang === 'en' ? 'Total (approx)' : 'कुल (अनुमानित)'}</span>
                <span className="font-devanagari text-2xl text-gradient-gold">
                  ₹{total.toLocaleString('en-IN')}
                </span>
              </div>

              <button
                type="submit"
                disabled={phase !== 'form'}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold disabled:opacity-70 hover:shadow-lg hover:shadow-saffron/30 transition-all duration-300 ease-smooth flex items-center justify-center gap-2"
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
      <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">{label}</label>
      <div className="relative">{icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40">{icon}</div>}{children}</div>
    </div>
  );
}
