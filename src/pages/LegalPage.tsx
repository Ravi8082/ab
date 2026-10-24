import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Mail, Phone } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { LegalPageData, LegalPageKey } from '@/lib/eventApi';
import { eventApi } from '@/lib/eventApi';
import { pickL } from '@/lib/eventFormat';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

const TITLES: Record<LegalPageKey, { en: string; hi: string; crumb: string }> = {
  terms: { en: 'Terms & conditions', hi: 'नियम एवं शर्तें', crumb: 'terms' },
  privacy: { en: 'Privacy policy', hi: 'गोपनीयता नीति', crumb: 'privacy' },
  refund: { en: 'Refund policy', hi: 'धनवापसी नीति', crumb: 'refund' },
};

export default function LegalPage({ page }: { page: LegalPageKey }) {
  const { lang } = useApp();
  const [data, setData] = useState<LegalPageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    eventApi
      .legal(page)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : 'This page could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [page]);

  const meta = TITLES[page];
  const sections = data?.content.sections ?? [];
  const support = data?.support as { email?: string; phone?: string } | null | undefined;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="section section--deep" style={{ paddingTop: 'calc(var(--header-h) + 2.5rem)' }}>
        <div className="wrap section-inner">
          <span className="chip chip--on-dark">
            <FileText size={12} /> {lang === 'hi' ? 'आधिकारिक नीति' : 'Official policy'}
          </span>
          <h1 className="mt-4 font-display text-[2.4rem] leading-tight text-white sm:text-[3.1rem]">
            {data ? pickL(data.content.title, lang, meta[lang === 'hi' ? 'hi' : 'en']) : meta[lang === 'hi' ? 'hi' : 'en']}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-on-dark/65">
            {data ? pickL(data.content.intro, lang) : lang === 'hi' ? 'लोड हो रहा है…' : 'Loading…'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to="/" className="btn btn-ghost btn-sm">
              <ArrowLeft size={14} /> {lang === 'hi' ? 'मुख्य पृष्ठ पर वापस' : 'Back to home'}
            </Link>
            <span className="flex items-center gap-3 text-[0.7rem] text-cream-on-dark/50">
              {(['terms', 'privacy', 'refund'] as const)
                .filter((key) => key !== page)
                .map((key) => (
                  <Link key={key} to={`/${key}`} className="underline transition-colors hover:text-marigold">
                    {lang === 'hi' ? TITLES[key].hi : TITLES[key].en}
                  </Link>
                ))}
            </span>
          </div>
        </div>
      </section>

      <section className="section section--cream">
        <div className="wrap section-inner">
          {error && (
            <div className="rounded-2xl border border-red-400/30 bg-red-50 px-4 py-4 text-sm text-red-700">
              {error}{' '}
              <Link to="/" className="font-semibold underline">
                {lang === 'hi' ? 'मुख्य पृष्ठ' : 'Home'}
              </Link>
            </div>
          )}

          {!error && (
            <div className="mx-auto max-w-3xl space-y-4">
              {sections.map((section, index) => (
                <motion.article
                  key={index}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.2) }}
                  className="rounded-[22px] border border-line bg-white p-5 shadow-[0_18px_46px_-38px_rgba(15,35,66,.5)]"
                >
                  <h2 className="flex items-start gap-2.5 font-display text-xl text-ink">
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-saffron/15 font-ui text-[0.66rem] font-semibold text-saffron-ink">
                      {index + 1}
                    </span>
                    {pickL(section.heading, lang)}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-text/85">{pickL(section.body, lang)}</p>
                </motion.article>
              ))}

              {support?.email && (
                <div className="rounded-[22px] border border-dashed border-line bg-white/70 p-5">
                  <p className="font-ui text-sm font-semibold text-ink">
                    {lang === 'hi' ? 'इसके बारे में और सवाल?' : 'Questions about this policy?'}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-4 text-[0.78rem] text-muted">
                    <a href={`mailto:${support.email}`} className="inline-flex items-center gap-1.5 text-saffron-ink underline">
                      <Mail size={13} /> {support.email}
                    </a>
                    {support.phone && (
                      <a
                        href={`tel:${String(support.phone).replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1.5 text-saffron-ink underline"
                      >
                        <Phone size={13} /> {support.phone}
                      </a>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
