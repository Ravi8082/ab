import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, QrCode, ReceiptText, Search, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { EventBookingPass } from '@/lib/eventApi';
import { eventApi } from '@/lib/eventApi';
import EventPass from '@/components/event/EventPass';

export default function BookingLookup() {
  const { lang } = useApp();
  const [reference, setReference] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pass, setPass] = useState<EventBookingPass | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanReference = reference.trim().toUpperCase();
    if (!cleanReference) {
      setError('Enter the booking reference from your confirmation.');
      return;
    }
    if (!contact.trim()) {
      setError('Enter the email or mobile number used for the booking.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await eventApi.lookup(cleanReference, contact.trim());
      setPass(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find this booking.');
      setPass(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,430px)_1fr]">
      <div className="rounded-[24px] border border-line bg-white p-6 shadow-[0_24px_60px_-45px_rgba(15,35,66,.5)] sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-saffron/10 text-saffron-ink">
          <ReceiptText size={20} />
        </span>
        <h3 className="mt-4 font-display text-2xl text-ink">
          {lang === 'hi' ? 'अपना पास खोजें' : 'Find your pass'}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {lang === 'hi'
            ? 'बुकिंग संदर्भ और वही ईमेल या मोबाइल दर्ज करें जो बुकिंग के समय दिया था।'
            : 'Enter your booking reference and the same email or mobile number you used at checkout.'}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="lookup-ref" className="field-label">
              {lang === 'hi' ? 'बुकिंग संदर्भ' : 'Booking reference'}
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" />
              <input
                id="lookup-ref"
                className="field pl-10 font-mono uppercase tracking-[0.14em] placeholder:font-body placeholder:normal-case placeholder:tracking-normal"
                value={reference}
                onChange={(event) => setReference(event.target.value.toUpperCase())}
                placeholder="AB26-XXXXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div>
            <label htmlFor="lookup-contact" className="field-label">
              {lang === 'hi' ? 'ईमेल या मोबाइल' : 'Email or mobile number'}
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" />
              <input
                id="lookup-contact"
                className="field pl-10"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="you@example.com or 98765 43210"
                autoComplete="email"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary btn-block">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            {busy ? (lang === 'hi' ? 'खोज रहे हैं…' : 'Looking up…') : lang === 'hi' ? 'मेरा पास दिखाएँ' : 'Show my pass'}
          </button>
        </form>

        <p className="mt-4 flex items-center gap-1.5 text-[0.68rem] text-muted">
          <Lock size={12} className="text-success" />
          {lang === 'hi' ? 'आपका विवरण केवल इस बुकिंग से मिलाया जाता है।' : 'Details are matched privately against this booking only.'}
        </p>
      </div>

      <div>
        {pass ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-ui text-sm font-semibold text-ink">
                {pass.status === 'paid'
                  ? lang === 'hi'
                    ? 'आपका पास तैयार है'
                    : 'Your pass is ready'
                  : lang === 'hi'
                    ? 'बुकिंग स्थिति'
                    : 'Booking status'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPass(null);
                  setReference('');
                  setContact('');
                  setError('');
                }}
                className="font-ui text-xs font-semibold text-saffron-ink hover:underline"
              >
                {lang === 'hi' ? 'दूसरा पास खोजें' : 'Look up another pass'}
              </button>
            </div>
            <EventPass pass={pass} lang={lang} />
          </motion.div>
        ) : (
          <div className="relative overflow-hidden rounded-[24px] border border-sky/20 bg-sindoor-deep p-6 text-cream-on-dark sm:p-7">
            <div
              className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(238,44,143,.75), transparent 65%)' }}
            />
            <p className="relative font-ui text-[0.64rem] uppercase tracking-[0.2em] text-marigold">
              {lang === 'hi' ? 'गेट पर तैयार' : 'At the gate'}
            </p>
            <h3 className="relative mt-2 font-display text-2xl text-white">
              {lang === 'hi' ? 'एक QR। हर आयोजन दिन में प्रवेश।' : 'One QR. Entry on every event day.'}
            </h3>
            <p className="relative mt-2 max-w-md text-sm font-light leading-relaxed text-cream-on-dark/65">
              {lang === 'hi'
                ? 'आपका पास भुगतान के तुरंत बाद जारी होता है। गेट पर स्टाफ QR स्कैन करके संदर्भ संख्या डेटाबेस से मिलाता है — जितने दिनों का पास है, उतने दिनों में एक-एक प्रवेश।'
                : 'Your pass is issued right after payment. At the gate, staff scan the QR and match the reference in our database — one entry on each of the days your pass covers.'}
            </p>
            <div className="relative mt-6 grid gap-3">
              {[
                {
                  icon: <ReceiptText size={15} />,
                  en: 'Keep your AB26 reference handy',
                  hi: 'AB26 संदर्भ साथ रखें',
                },
                {
                  icon: <QrCode size={15} />,
                  en: 'Show the QR on your phone — no print needed',
                  hi: 'फ़ोन पर QR दिखाएँ — प्रिंट आवश्यक नहीं',
                },
                {
                  icon: <ShieldCheck size={15} />,
                  en: 'The pass is valid for the number of people booked',
                  hi: 'पास उतने ही लोगों के लिए मान्य है जितने बुक किए',
                },
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
                  <span className="mt-0.5 text-marigold">{item.icon}</span>
                  <span className="text-xs leading-relaxed text-cream-on-dark/70">
                    {lang === 'hi' ? item.hi : item.en}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative mt-5 inline-flex items-center gap-2 text-[0.68rem] text-cream-on-dark/45">
              <ArrowRight size={13} className="text-sky" />
              {lang === 'hi' ? 'बुकिंग के समय भेजे गए संदर्भ से शुरुआत करें' : 'Start with the reference sent at booking'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
