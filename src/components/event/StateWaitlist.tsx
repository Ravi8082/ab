import { useState } from 'react';
import { motion } from 'framer-motion';
import { BellRing, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError, eventApi, type EventState } from '@/lib/eventApi';
import type { Lang } from '@/types';

type Step = 'form' | 'otp' | 'done';

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  code?: string;
}

function errorsFrom(err: unknown): FieldErrors | null {
  if (!(err instanceof ApiError) || !err.details || typeof err.details !== 'object') return null;
  const raw = err.details as Record<string, unknown>;
  const first = (key: string) => (Array.isArray(raw[key]) ? String(raw[key][0]) : undefined);
  return { name: first('name'), email: first('email'), phone: first('phone') };
}

const COPY = {
  en: {
    eyebrow: 'Not on the yatra route yet',
    title: (state: string) => `Sundarkand in ${state}`,
    body: 'No Sundarkand yatra city has been announced in this state yet. Leave your details and we will contact you the moment one is scheduled here.',
    name: 'Your name',
    email: 'Email for updates',
    phone: 'Mobile number (optional)',
    submit: 'Send verification code',
    sending: 'Sending…',
    privacy: 'We only email you about this event. No offers, no sharing.',
    otpTitle: 'Confirm your email',
    otpBody: (email: string) => `Enter the 6-digit code we just sent to ${email}. It expires in 10 minutes.`,
    verify: 'Verify and join the list',
    verifying: 'Verifying…',
    resend: 'Send the code again',
    doneTitle: 'Thank you',
    doneBody: (state: string) =>
      `Thank you! When Mahi Sundarkand is scheduled in ${state}, we will contact you. Your reference is`,
  },
  hi: {
    eyebrow: 'यात्रा के मार्ग पर अभी नहीं',
    title: (state: string) => `${state} में सुंदरकांड`,
    body: 'इस राज्य में महि सुंदरकांड का कोई शहर अभी घोषित नहीं हुआ है। अपना नाम और ईमेल छोड़िए — जैसे ही यहाँ यात्रा आएगी, हम आपको सूचित करेंगे।',
    name: 'आपका नाम',
    email: 'अपडेट के लिए ईमेल',
    phone: 'मोबाइल नंबर (वैकल्पिक)',
    submit: 'पुष्टि कोड भेजें',
    sending: 'भेजा जा रहा है…',
    privacy: 'हम आपको केवल इसी आयोजन के बारे में ईमेल करेंगे — न कोई ऑफर, न शेयरिंग।',
    otpTitle: 'अपना ईमेल सत्यापित करें',
    otpBody: (email: string) => `${email} पर भेजा गया 6 अंकों का कोड भरिए। यह 10 मिनट में समाप्त हो जाएगा।`,
    verify: 'सत्यापित करके सूची में जुड़ें',
    verifying: 'सत्यापन…',
    resend: 'कोड दोबारा भेजें',
    doneTitle: 'धन्यवाद',
    doneBody: (state: string) =>
      `धन्यवाद! जैसे ही ${state} में महि सुंदरकांड होगा, हम आपसे संपर्क करेंगे। आपका संदर्भ है`,
  },
};

const TONE = {
  light: {
    wrap: 'rounded-[24px] border border-line bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,35,66,.5)] sm:p-7',
    chip: 'chip chip--lotus inline-flex items-center gap-1.5',
    title: 'mt-3 font-display text-[1.7rem] leading-tight text-ink',
    body: 'mt-2 text-sm leading-relaxed text-muted',
    label: 'field-label',
    input: 'field',
    otp: 'field mt-4 text-center font-mono text-xl tracking-[0.5em]',
    resend: 'btn btn-ghost btn-sm',
    doneTitle: 'mt-2 font-ui text-sm font-semibold text-ink',
    done: 'mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted',
    ref: 'font-mono text-ink',
    privacy: 'mt-3 flex items-start gap-1.5 text-xs text-muted',
    shield: 'mt-0.5 shrink-0 text-saffron',
    email: 'mt-3 text-xs text-muted',
    err: 'field-error',
    note: 'field-error mt-2',
  },
  dark: {
    wrap: 'rounded-2xl border border-white/12 bg-white/[0.045] p-4 sm:p-5',
    chip: 'chip chip--on-dark inline-flex items-center gap-1.5',
    title: 'mt-3 font-display text-[1.45rem] leading-tight text-white',
    body: 'mt-2 text-sm leading-relaxed text-cream-on-dark/65',
    label: 'mb-1.5 block font-ui text-[0.6rem] uppercase tracking-[0.18em] text-cream-on-dark/45',
    input:
      'w-full rounded-xl border border-sky/25 bg-white/[0.06] px-3.5 py-2.5 font-ui text-sm text-white outline-none transition-colors placeholder:text-cream-on-dark/30 focus:border-marigold/70',
    otp: 'mt-4 w-full rounded-xl border border-sky/25 bg-white/[0.06] px-3.5 py-2.5 text-center font-mono text-xl tracking-[0.5em] text-white outline-none transition-colors placeholder:text-cream-on-dark/30 focus:border-marigold/70',
    resend:
      'inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-sm text-cream-on-dark/75 transition-colors hover:border-marigold/50 hover:text-marigold disabled:opacity-50',
    doneTitle: 'mt-2 font-ui text-sm font-semibold text-white',
    done: 'mt-1.5 flex items-start gap-2 text-sm leading-relaxed text-cream-on-dark/70',
    ref: 'font-mono text-white',
    privacy: 'mt-3 flex items-start gap-1.5 text-xs text-cream-on-dark/45',
    shield: 'mt-0.5 shrink-0 text-marigold/70',
    email: 'mt-3 text-xs text-cream-on-dark/45',
    err: 'mt-1 text-xs text-red-300',
    note: 'mt-2 text-xs text-red-300',
  },
} as const;

export default function StateWaitlist({ state, lang, dark = false }: { state: EventState; lang: Lang; dark?: boolean }) {
  const t = COPY[lang];
  const tone = dark ? TONE.dark : TONE.light;
  const stateName = lang === 'hi' ? state.name_hi : state.name_en;
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ref, setRef] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const requestJoin = async () => {
    setBusy(true);
    setNote('');
    try {
      const result = await eventApi.joinWaitlist({ stateId: state.id, name, email, phone });
      setRef(result.ref);
      if (result.verified) {
        setStep('done');
      } else {
        setStep('otp');
      }
    } catch (err) {
      const mapped = errorsFrom(err);
      if (mapped) setErrors(mapped);
      setNote(err instanceof Error ? err.message : 'Could not save your request.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!ref) return;
    setBusy(true);
    setNote('');
    try {
      const result = await eventApi.resendWaitlistCode(ref);
      if (result.verified) setStep('done');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setErrors({ code: lang === 'hi' ? '6 अंकों का कोड भरिए।' : 'Enter the 6-digit code.' });
      return;
    }
    setBusy(true);
    setNote('');
    try {
      await eventApi.verifyWaitlist(ref, digits);
      setStep('done');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={tone.wrap}
    >
      <span className={tone.chip}>
        <BellRing size={12} />
        {t.eyebrow}
      </span>
      <h3 className={tone.title}>{t.title(stateName)}</h3>

      {step === 'form' && (
        <>
          <p className={tone.body}>{t.body}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={tone.label} htmlFor={`wl-name-${state.id}`}>
                {t.name}
              </label>
              <input
                id={`wl-name-${state.id}`}
                className={tone.input}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((c) => ({ ...c, name: undefined }));
                }}
              />
              {errors.name && <p className={tone.err}>{errors.name}</p>}
            </div>
            <div>
              <label className={tone.label} htmlFor={`wl-email-${state.id}`}>
                {t.email}
              </label>
              <input
                id={`wl-email-${state.id}`}
                className={tone.input}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((c) => ({ ...c, email: undefined }));
                }}
              />
              {errors.email && <p className={tone.err}>{errors.email}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={tone.label} htmlFor={`wl-phone-${state.id}`}>
                {t.phone}
              </label>
              <input
                id={`wl-phone-${state.id}`}
                className={tone.input}
                inputMode="numeric"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setErrors((c) => ({ ...c, phone: undefined }));
                }}
              />
              {errors.phone && <p className={tone.err}>{errors.phone}</p>}
            </div>
          </div>

          <button type="button" className="btn btn-primary mt-5 w-full sm:w-auto" onClick={() => void requestJoin()} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
            {busy ? t.sending : t.submit}
          </button>
          {note && <p className={tone.note}>{note}</p>}
          <p className={tone.privacy}>
            <ShieldCheck size={13} className={tone.shield} />
            {t.privacy}
          </p>
        </>
      )}

      {step === 'otp' && (
        <>
          <p className={tone.body}>{t.otpBody(email)}</p>
          <input
            className={tone.otp}
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setErrors({});
            }}
          />
          {errors.code && <p className={tone.note}>{errors.code}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void verify()} disabled={busy || code.length !== 6}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {busy ? t.verifying : t.verify}
            </button>
            <button type="button" className={tone.resend} onClick={() => void resend()} disabled={busy}>
              {t.resend}
            </button>
          </div>
          {note && <p className={tone.note}>{note}</p>}
        </>
      )}

      {step === 'done' && (
        <>
          <h4 className={tone.doneTitle}>{t.doneTitle}</h4>
          <p className={tone.done}>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            <span>
              {t.doneBody(stateName)} <strong className={tone.ref}>{ref}</strong>
            </span>
          </p>
          <p className={tone.email}>{email}</p>
        </>
      )}
    </motion.div>
  );
}
