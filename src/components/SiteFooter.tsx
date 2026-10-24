import { Link } from 'react-router-dom';
import { Mail, MapPin, MessageCircle, Phone, ShieldCheck, UserCog } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { pickL } from '@/lib/eventFormat';
import { openCookieSettings } from '@/components/CookieConsent';

const JUMP = [
  { id: 'yatra', en: 'Mahi Sundarkand', hi: 'माहि सुंदरकांड' },
  { id: 'expo', en: 'Expo Delhi', hi: 'एक्स्पो दिल्ली' },
  { id: 'my-booking', en: 'My booking', hi: 'मेरी बुकिंग' },
  { id: 'faq', en: 'Questions', hi: 'सामान्य प्रश्न' },
];

function LotusMark() {
  return (
    <svg width="42" height="42" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke="#13BBE8" strokeOpacity=".45" />
      <path d="M20 9c3.4 4.6 3.4 9.8 0 14.4-3.4-4.6-3.4-9.8 0-14.4Z" fill="#EE2C8F" />
      <path d="M20 23.4c4-2.2 8.4-1.6 11.4 1.6-4 2.2-8.4 1.6-11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c-4-2.2-8.4-1.6-11.4 1.6 4 2.2 8.4 1.6 11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c5-2.6 10.4-2.4 14.4.8-5 2.6-10.4 2.4-14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
      <path d="M20 23.4c-5-2.6-10.4-2.4-14.4.8 5 2.6 10.4 2.4 14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
    </svg>
  );
}

export default function SiteFooter({ contact }: { contact?: Record<string, unknown> }) {
  const { lang } = useApp();

  const email = typeof contact?.email === 'string' ? contact.email : 'adhyatmikbharatexpo@gmail.com';
  const phone = typeof contact?.phone === 'string' ? contact.phone : '+91 7499658454';
  const whatsapp = typeof contact?.whatsapp === 'string' ? contact.whatsapp : '917499658454';
  const address = pickL(contact?.address, lang, lang === 'hi' ? 'जयपुर, राजस्थान' : 'Jaipur, Rajasthan');

  return (
    <footer id="contact" className="section--deep pattern-lotus relative">
      <div className="wrap section-inner pb-8 pt-16 sm:pt-20">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_1fr_.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <LotusMark />
              <div>
                <p className="font-hindi text-lg text-marigold">आध्यात्मिक भारत</p>
                <p className="font-display text-2xl leading-tight text-white">Adhyatmik Bharat</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm font-light leading-relaxed text-cream-on-dark/60">
              {lang === 'hi'
                ? 'एक दिन, दस शहर, दस राज्य — और दिल्ली में तीन दिन का भव्य आध्यात्मिक एक्स्पो। हर पास OTP से सत्यापित और QR से सुरक्षित।'
                : 'One day, ten cities, ten states — and a three-day spiritual expo in Delhi. Every pass is OTP-verified and protected by a gate-checked QR pass.'}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-sky/20 bg-sky/5 px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-sky">
              <ShieldCheck size={13} /> {lang === 'hi' ? 'सुरक्षित बुकिंग' : 'Secure booking'}
            </p>
          </div>

          <div>
            <h4 className="font-ui text-[0.68rem] uppercase tracking-[0.2em] text-marigold">
              {lang === 'hi' ? 'यात्रा' : 'Explore'}
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {JUMP.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })}
                    className="text-left text-cream-on-dark/65 transition-colors hover:text-marigold"
                  >
                    {lang === 'hi' ? item.hi : item.en}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-ui text-[0.68rem] uppercase tracking-[0.2em] text-marigold">
              {lang === 'hi' ? 'संपर्क' : 'Help desk'}
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href={`mailto:${email}`} className="flex items-start gap-2.5 text-cream-on-dark/65 transition-colors hover:text-marigold">
                  <Mail size={15} className="mt-0.5 shrink-0 text-sky" />
                  <span className="break-all">{email}</span>
                </a>
              </li>
              <li>
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5 text-cream-on-dark/65 transition-colors hover:text-marigold">
                  <Phone size={15} className="shrink-0 text-sky" />
                  {phone}
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-cream-on-dark/65 transition-colors hover:text-marigold"
                >
                  <MessageCircle size={15} className="shrink-0 text-sky" />
                  WhatsApp
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-cream-on-dark/55">
                <MapPin size={15} className="mt-0.5 shrink-0 text-sky" />
                {address}
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-ui text-[0.68rem] uppercase tracking-[0.2em] text-marigold">
              {lang === 'hi' ? 'टीम एक्सेस' : 'Team access'}
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/staff" className="flex items-center gap-2.5 text-cream-on-dark/65 transition-colors hover:text-marigold">
                  <ShieldCheck size={15} className="text-sky" />
                  {lang === 'hi' ? 'गेट स्कैनर' : 'Gate scanner'}
                </Link>
              </li>
              <li>
                <Link to="/admin" className="flex items-center gap-2.5 text-cream-on-dark/65 transition-colors hover:text-marigold">
                  <UserCog size={15} className="text-sky" />
                  {lang === 'hi' ? 'एडमिन पैनल' : 'Admin panel'}
                </Link>
              </li>
            </ul>
            <p className="mt-5 text-[0.66rem] leading-relaxed text-cream-on-dark/35">
              {lang === 'hi'
                ? 'प्रवेश केवल QR स्कैन और डेटाबेस सत्यापन के बाद।'
                : 'Entry only after QR scan and database verification.'}
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-cream-on-dark/40 sm:flex-row">
          <span>
            © {new Date().getFullYear()} Adhyatmik Bharat.{' '}
            {lang === 'hi' ? 'सर्वाधिकार सुरक्षित।' : 'All rights reserved.'}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-4 sm:justify-end">
            <Link to="/privacy" className="transition-colors hover:text-marigold">
              {lang === 'hi' ? 'गोपनीयता' : 'Privacy'}
            </Link>
            <Link to="/terms" className="transition-colors hover:text-marigold">
              {lang === 'hi' ? 'नियम' : 'Terms'}
            </Link>
            <Link to="/refund" className="transition-colors hover:text-marigold">
              {lang === 'hi' ? 'धनवापसी' : 'Refunds'}
            </Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="transition-colors hover:text-marigold"
            >
              {lang === 'hi' ? 'कुकी सेटिंग्स' : 'Cookie settings'}
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}
