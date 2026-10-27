import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import type { Lang } from '@/types';
import type { LegalPageData, LegalPageKey } from '@/lib/eventApi';
import { eventApi } from '@/lib/eventApi';
import { pickL } from '@/lib/eventFormat';

const PAGES: { key: LegalPageKey; en: string; hi: string }[] = [
  { key: 'terms', en: 'Terms & conditions', hi: 'नियम एवं शर्तें' },
  { key: 'privacy', en: 'Privacy policy', hi: 'गोपनीयता नीति' },
  { key: 'refund', en: 'Refund policy', hi: 'धनवापसी नीति' },
];

/** The rules a devotee accepts, read from the same database rows the legal pages use. */
export default function PolicySummary({
  lang,
  reloadKey = 0,
  onVersion,
}: {
  lang: Lang;
  reloadKey?: number;
  onVersion?: (version: string | null) => void;
}) {
  const [pages, setPages] = useState<Partial<Record<LegalPageKey, LegalPageData>>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    onVersion?.(null);
    Promise.allSettled(PAGES.map((page) => eventApi.legal(page.key, { fresh: reloadKey > 0 }))).then((results) => {
      if (!live) return;
      const next: Partial<Record<LegalPageKey, LegalPageData>> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[PAGES[index].key] = result.value;
      });
      setPages(next);
      setFailed(PAGES.every((page) => !next[page.key]));
      onVersion?.(PAGES.map((page) => next[page.key]?.version).find(Boolean) ?? null);
    });
    return () => {
      live = false;
    };
  }, [reloadKey, onVersion]);

  return (
    <div className="rounded-2xl border border-line bg-white px-3.5 py-3">
      <p className="flex items-center gap-1.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">
        <ShieldCheck size={13} className="text-saffron" />
        {lang === 'hi' ? 'इन नियमों पर आपकी स्वीकृति ज़रूरी है' : 'These rules apply to your booking'}
      </p>

      {failed ? (
        <p className="mt-2 text-[0.72rem] leading-relaxed text-error">
          {lang === 'hi'
            ? 'नीति का पाठ लोड नहीं हो सका। कृपया इंटरनेट जोड़ जाँचें और दोबारा खोलें।'
            : 'The policy text could not be loaded. Check your connection and reopen this panel.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {PAGES.map((page) => {
            const content = pages[page.key]?.content;
            const sections = content?.sections ?? [];
            return (
              <li key={page.key} className="group overflow-hidden rounded-xl border border-line bg-sandal-2/40">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-ui text-[0.72rem] font-semibold text-ink">
                    <span>{lang === 'hi' ? page.hi : page.en}</span>
                    <ChevronDown size={13} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-line bg-white px-3 py-2.5">
                    {content?.intro && (
                      <p className="text-[0.7rem] leading-relaxed text-text/85">{pickL(content.intro, lang)}</p>
                    )}
                    <ul className="mt-2 space-y-2">
                      {sections.map((section, index) => (
                        <li key={index} className="text-[0.7rem] leading-relaxed text-text/85">
                          <span className="font-ui font-semibold text-ink">{pickL(section.heading, lang)}</span>
                          {' — '}
                          {pickL(section.body, lang)}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={`/${page.key}`}
                      target="_blank"
                      className="mt-2.5 inline-block font-ui text-[0.68rem] font-semibold text-saffron-ink underline"
                    >
                      {lang === 'hi' ? 'पूरा पढ़ें' : 'Read the full page'}
                    </Link>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
