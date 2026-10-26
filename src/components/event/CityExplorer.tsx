import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin, ScrollText } from 'lucide-react';
import type { Lang } from '@/types';
import type { ScheduleContext } from '@/lib/eventView';
import { dayParts, formatDate, formatTimeRange, seatLabel, seatTone } from '@/lib/eventFormat';
import PriceTag from '@/components/event/PriceTag';

export default function CityExplorer({
  contexts,
  lang,
  paused = false,
  past = false,
  onBook,
}: {
  contexts: ScheduleContext[];
  lang: Lang;
  paused?: boolean;
  past?: boolean;
  onBook: (scheduleId: number, ticketId: number) => void;
}) {
  const cityGroups = useMemo(() => {
    const map = new Map<
      string,
      { city: ScheduleContext['city']; state: ScheduleContext['state']; venues: ScheduleContext[] }
    >();
    for (const context of contexts) {
      const key = `${context.city.id}:${context.schedule.event_date}:${context.schedule.start_time ?? ''}`;
      if (!map.has(key)) {
        map.set(key, { city: context.city, state: context.state, venues: [] });
      }
      map.get(key)!.venues.push(context);
    }
    return Array.from(map.values());
  }, [contexts]);

  const uniqueDates = useMemo(
    () => Array.from(new Set(contexts.map((context) => context.schedule.event_date))),
    [contexts],
  );

  return (
    <div>
      {cityGroups.length > 0 && (
        <p className="mb-6 text-xs text-muted">
          {past ? (
            <>
              {cityGroups.length} {lang === 'hi' ? 'बीते आयोजन' : cityGroups.length === 1 ? 'past event' : 'past events'}
            </>
          ) : (
            <>
              {cityGroups.length} {lang === 'hi' ? 'शहर' : cityGroups.length === 1 ? 'city' : 'cities'} ·{' '}
              {cityGroups.reduce((sum, group) => sum + group.venues.length, 0)} {lang === 'hi' ? 'स्थल' : 'venues'}
              {uniqueDates.length === 1
                ? ` · ${lang === 'hi' ? 'सभी' : 'all on'} ${formatDate(uniqueDates[0], lang, true)}`
                : uniqueDates.length > 1
                  ? ` · ${uniqueDates.length} ${lang === 'hi' ? 'तिथियाँ' : 'event dates'}`
                  : ''}
            </>
          )}
        </p>
      )}

      {cityGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 px-5 py-8 text-center text-sm text-muted">
          {past
            ? lang === 'hi'
              ? 'अभी कोई बीता कार्यक्रम नहीं है।'
              : 'No past events yet.'
            : lang === 'hi'
              ? 'नई तिथियाँ जल्द घोषित होंगी।'
              : 'New dates will be announced soon.'}
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {cityGroups.map((group, index) => {
            const first = group.venues[0];
            const date = dayParts(first.schedule.event_date);
            return (
              <motion.article
                key={`${group.city.id}-${first.schedule.event_date}-${first.schedule.start_time ?? ''}`}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.3) }}
                className="flex flex-col overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_20px_50px_-36px_rgba(15,35,66,.5)]"
              >
                <div className="relative overflow-hidden border-b border-line bg-gradient-to-br from-sandal-2 via-white to-sandal px-5 py-4">
                  <div
                    className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-50"
                    style={{ background: 'radial-gradient(circle, rgba(19,187,232,.18), transparent 70%)' }}
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="chip chip--lotus">{lang === 'hi' ? group.state.name_hi : group.state.name_en}</span>
                      <h3 className="mt-2.5 font-display text-[1.7rem] leading-none text-ink">
                        {lang === 'hi' ? group.city.name_hi : group.city.name_en}
                        <span className="ml-2 align-middle font-hindi text-xs font-normal text-muted">
                          {lang === 'hi' ? group.city.name_en : group.city.name_hi}
                        </span>
                      </h3>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className="font-ui uppercase tracking-[0.1em] text-saffron-ink">{date.weekday}</span>
                        <span>{formatDate(first.schedule.event_date, lang)}</span>
                        <span className="text-line">·</span>
                        <span>{formatTimeRange(first.schedule.start_time, first.schedule.end_time)}</span>
                      </p>
                    </div>
                    <div className="grid h-[58px] w-[54px] shrink-0 place-items-center rounded-2xl border border-line bg-white text-center shadow-sm">
                      <div>
                        <span className="block font-display text-2xl leading-none text-ink">{date.day}</span>
                        <span className="mt-0.5 block font-ui text-[0.58rem] uppercase tracking-[0.16em] text-saffron-ink">
                          {date.month}
                        </span>
                      </div>
                    </div>
                  </div>
                  {group.venues.length > 1 && (
                    <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky/10 px-2.5 py-1 text-[0.66rem] text-sky-ink">
                      <MapPin size={11} />{' '}
                      {past
                        ? `${group.venues.length} ${lang === 'hi' ? 'स्थल' : 'venues'}`
                        : `${group.venues.length} venues in this city — pick your address`}
                    </p>
                  )}
                </div>

                <div className="flex flex-1 flex-col divide-y divide-line">
                  {group.venues.map((context) => {
                    const salesClosed = context.schedule.sale_ended || context.schedule.date_passed;
                    const closed = past || paused || salesClosed;
                    return (
                      <div key={context.venue.id} className="p-5">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-saffron/10 text-saffron-ink">
                            <MapPin size={14} />
                          </span>
                          <div className="min-w-0">
                            <p className="font-ui text-sm font-semibold text-ink">
                              {lang === 'hi' ? context.venue.name_hi : context.venue.name_en}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted">
                              {lang === 'hi' ? context.venue.address_hi : context.venue.address_en}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {context.availability.map((item) => {
                            const disabled = closed || item.left <= 0;
                            const tone = seatTone(item.left, item.capacity);
                            const usedPercent =
                              item.capacity > 0 ? Math.min(100, Math.round((item.sold / item.capacity) * 100)) : 0;
                            return (
                              <button
                                key={item.ticket.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => onBook(context.schedule.id, item.ticket.id)}
                                className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-line bg-white px-3.5 py-2.5 text-left transition-all hover:border-saffron/70 hover:shadow-[0_8px_24px_-18px_rgba(238,44,143,.7)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line disabled:hover:shadow-none"
                              >
                                <span className="min-w-0">
                                  <span className="block font-ui text-[0.84rem] font-semibold text-ink">
                                    {lang === 'hi' ? item.ticket.name_hi : item.ticket.name_en}
                                  </span>
                                  <span className="mt-1 block">
                                    <PriceTag
                                      ticket={item.ticket}
                                      lang={lang}
                                      size="sm"
                                      caption={lang === 'hi' ? 'प्रति व्यक्ति' : 'per head'}
                                    />
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span
                                    className={`font-ui text-[0.7rem] ${
                                      closed
                                        ? 'text-muted'
                                        : tone === 'out'
                                          ? 'text-red-500'
                                          : tone === 'low'
                                            ? 'text-amber-600'
                                            : tone === 'limited'
                                              ? 'text-orange-600'
                                              : 'text-emerald-700'
                                    }`}
                                  >
                                    {past
                                      ? lang === 'hi'
                                        ? 'कार्यक्रम संपन्न'
                                        : 'Event ended'
                                      : paused
                                        ? 'Bookings paused'
                                        : salesClosed
                                          ? 'Sales closed'
                                          : seatLabel(item.left)}
                                  </span>
                                  <span className="grid h-7 w-7 place-items-center rounded-full bg-saffron/10 text-saffron-ink transition-colors group-hover:bg-saffron group-hover:text-white">
                                    <ArrowRight size={13} />
                                  </span>
                                </span>
                                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-line/60">
                                  <span
                                    className="block h-full rounded-r-full bg-gradient-to-r from-sky via-saffron to-saffron-dark"
                                    style={{ width: `${usedPercent}%` }}
                                  />
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {(context.schedule.note_en || context.schedule.note_hi) && (
                          <p className="mt-2.5 flex items-start gap-1.5 text-[0.66rem] leading-relaxed text-muted">
                            <ScrollText size={11} className="mt-0.5 shrink-0 text-saffron/70" />
                            {lang === 'hi' ? context.schedule.note_hi || context.schedule.note_en : context.schedule.note_en}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}
