import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Phone, Ticket, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const LINKS = [
  { id: 'yatra', en: 'Mahi Sundarkand', hi: 'माहि सुंदरकांड' },
  { id: 'expo', en: 'Expo Delhi', hi: 'एक्स्पो दिल्ली' },
  { id: 'my-booking', en: 'My booking', hi: 'मेरी बुकिंग' },
  { id: 'contact', en: 'Contact', hi: 'संपर्क' },
];

function LotusMark() {
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke="#13BBE8" strokeOpacity=".45" />
      <path d="M20 9c3.4 4.6 3.4 9.8 0 14.4-3.4-4.6-3.4-9.8 0-14.4Z" fill="#EE2C8F" />
      <path d="M20 23.4c4-2.2 8.4-1.6 11.4 1.6-4 2.2-8.4 1.6-11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c-4-2.2-8.4-1.6-11.4 1.6 4 2.2 8.4 1.6 11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c5-2.6 10.4-2.4 14.4.8-5 2.6-10.4 2.4-14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
      <path d="M20 23.4c-5-2.6-10.4-2.4-14.4.8 5 2.6 10.4 2.4 14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
    </svg>
  );
}

function LangToggle() {
  const { lang, setLang } = useApp();
  return (
    <div className="flex items-center rounded-full border border-white/20 bg-white/[0.06] p-0.5 backdrop-blur">
      {(['en', 'hi'] as const).map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`rounded-full px-2.5 py-1.5 font-ui text-[0.68rem] font-semibold tracking-wider transition-colors ${
            lang === code ? 'bg-white text-sindoor' : 'text-white/65 hover:text-white'
          }`}
        >
          {code === 'en' ? 'EN' : 'हिंदी'}
        </button>
      ))}
    </div>
  );
}

export default function SiteHeader() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (document.getElementById(id)) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    // Section links live on the home page, so ask it to scroll once it mounts.
    sessionStorage.setItem('ab-pending-section', id);
    navigate('/');
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-500"
      style={{
        background: scrolled || open ? 'rgba(10, 24, 48, .93)' : 'transparent',
        backdropFilter: scrolled || open ? 'blur(16px) saturate(140%)' : 'none',
        WebkitBackdropFilter: scrolled || open ? 'blur(16px) saturate(140%)' : 'none',
        borderBottom: scrolled || open ? '1px solid rgba(19, 187, 232, .16)' : '1px solid transparent',
      }}
    >
      <div className="wrap flex items-center justify-between gap-3" style={{ height: 'var(--header-h)' }}>
        <button onClick={() => go('top')} className="flex shrink-0 items-center gap-2.5 text-left">
          <LotusMark />
          <span className="leading-none">
            <span className="block font-display text-[1.05rem] font-semibold text-white sm:text-[1.15rem]">
              Adhyatmik Bharat
            </span>
            <span className="mt-1 hidden font-ui text-[0.56rem] uppercase tracking-[0.22em] text-sky sm:block">
              {lang === 'en' ? 'Sundarkand Yatra · Expo 2027' : 'सुंदरकांड यात्रा · एक्स्पो 2027'}
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => go(link.id)}
              className="rounded-full px-3.5 py-2 font-ui text-[0.83rem] font-semibold tracking-wide text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {lang === 'en' ? link.en : link.hi}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LangToggle />
          <a
            href="tel:+917499658454"
            className="hidden h-9 w-9 place-items-center rounded-full border border-white/15 text-white/60 transition-colors hover:border-marigold/60 hover:text-marigold lg:grid"
            aria-label="Call the help desk"
          >
            <Phone size={14} />
          </a>
          <button onClick={() => go('yatra')} className="btn btn-primary btn-sm hidden sm:inline-flex">
            <Ticket size={15} />
            {lang === 'en' ? 'Book a pass' : 'पास बुक करें'}
          </button>
          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Menu"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/25 text-white xl:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 bg-sindoor-deep/95 xl:hidden"
          >
            <div className="wrap flex flex-col gap-1 py-4">
              {LINKS.map((link) => (
                <button
                  key={link.id}
                  onClick={() => go(link.id)}
                  className="rounded-xl px-4 py-3 text-left font-ui text-base font-semibold tracking-wide text-white/85 hover:bg-white/10"
                >
                  {lang === 'en' ? link.en : link.hi}
                </button>
              ))}
              <button
                onClick={() => go('yatra')}
                className="btn btn-primary btn-block mt-2"
              >
                <Ticket size={16} />
                {lang === 'en' ? 'Book a pass' : 'पास बुक करें'}
              </button>
              <a href="tel:+917499658454" className="mt-1 flex items-center gap-2 px-4 py-2 text-sm text-cream-on-dark/60">
                <Phone size={14} className="text-marigold" /> +91 7499658454
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
