import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { fetchCookieBanner, type CookieBannerCopy } from '@/lib/eventApi';

const STORAGE_KEY = 'ab-cookie-consent';
const OPEN_EVENT = 'ab:open-cookie-settings';

const DEFAULT_COPY: Required<{ [K in keyof CookieBannerCopy]: { en: string; hi: string } }> = {
  title: { en: 'Your cookie choice', hi: 'कुकीज़ की आपकी पसंद' },
  body: {
    en: 'Strictly necessary cookies (sign-in, QR verification) always run. Optional analytics load only if you accept.',
    hi: 'साइन-इन और QR जाँच के लिए केवल आवश्यक कुकीज़ हमेशा चलती हैं। वैकल्पिक एनालिटिक्स केवल आपकी स्वीकृति के बाद।',
  },
  necessary: { en: 'Necessary only', hi: 'केवल आवश्यक' },
  accept: { en: 'Accept all', hi: 'सभी स्वीकार करें' },
  privacy: { en: 'Privacy policy', hi: 'गोपनीयता नीति' },
};

type CopyKey = keyof typeof DEFAULT_COPY;

function mergeCopy(source: CookieBannerCopy | null): typeof DEFAULT_COPY {
  if (!source) return DEFAULT_COPY;
  const next = { ...DEFAULT_COPY };
  (Object.keys(DEFAULT_COPY) as CopyKey[]).forEach((key) => {
    const value = source[key];
    next[key] = {
      en: value?.en?.trim() || DEFAULT_COPY[key].en,
      hi: value?.hi?.trim() || DEFAULT_COPY[key].hi,
    };
  });
  return next;
}

export type CookieChoice = 'all' | 'necessary';

export function readCookieChoice(): CookieChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { choice?: string };
    return parsed.choice === 'all' || parsed.choice === 'necessary' ? parsed.choice : null;
  } catch {
    return null;
  }
}

export function saveCookieChoice(choice: CookieChoice) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
}

export function openCookieSettings() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Only strictly necessary cookies are used; "Accept all" additionally enables optional analytics. */
export default function CookieConsent() {
  const { lang } = useApp();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [copy, setCopy] = useState(DEFAULT_COPY);

  useEffect(() => {
    setVisible(readCookieChoice() === null);
    const onOpen = () => setVisible(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    let active = true;
    fetchCookieBanner()
      .then((result) => active && setCopy(mergeCopy(result.banner)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const t = (key: CopyKey) => copy[key][lang] || copy[key].en;

  const choose = (choice: CookieChoice) => {
    saveCookieChoice(choice);
    setVisible(false);
  };

  // The consent banner belongs to the public site; it must not cover the admin console or a gate scanner.
  const inConsole = pathname.startsWith('/admin') || pathname.startsWith('/staff');

  return (
    <AnimatePresence>
      {visible && !inConsole && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-5 sm:pb-5"
          role="region"
          aria-label={lang === 'hi' ? 'कुकी सेटिंग्स' : 'Cookie settings'}
        >
          <div className="wrap">
            <div className="flex flex-col gap-3.5 rounded-[22px] border border-white/15 bg-[#0A1830]/95 p-4 text-cream-on-dark shadow-[0_30px_70px_-40px_rgba(0,0,0,.9)] backdrop-blur-md sm:flex-row sm:items-center sm:gap-5 sm:p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marigold/15 text-marigold">
                <Cookie size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-ui text-sm font-semibold text-white">{t('title')}</p>
                <p className="mt-1 text-[0.76rem] leading-relaxed text-cream-on-dark/65">
                  {t('body')}{' '}
                  <Link to="/privacy" className="underline hover:text-marigold">
                    {t('privacy')}
                  </Link>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  onClick={() => choose('necessary')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 font-ui text-[0.78rem] font-semibold text-white/80 transition-colors hover:border-sky hover:text-white"
                >
                  <ShieldCheck size={13} />
                  {t('necessary')}
                </button>
                <button
                  onClick={() => choose('all')}
                  className="btn btn-primary btn-sm"
                >
                  {t('accept')}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
