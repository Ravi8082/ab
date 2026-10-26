import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import type { Lang } from '@/types';
import type { EventState } from '@/lib/eventApi';
import type { ScheduleContext } from '@/lib/eventView';
import { seatLabel, seatTone } from '@/lib/eventFormat';
import Countdown from '@/components/event/Countdown';
import PriceTag from '@/components/event/PriceTag';
import StateWaitlist from '@/components/event/StateWaitlist';

interface QuickBookCardProps {
  contexts: ScheduleContext[];
  states: EventState[];
  lang: Lang;
  paused?: boolean;
  onBook: (scheduleId: number, ticketId: number) => void;
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: number | '';
  onChange: (value: number) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-ui text-[0.6rem] uppercase tracking-[0.18em] text-cream-on-dark/45">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full appearance-none rounded-xl border border-sky/25 bg-white/[0.06] px-3.5 py-2.5 pr-9 font-ui text-sm text-white outline-none transition-colors focus:border-marigold/70"
        >
          {children}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-marigold/70" />
      </span>
    </label>
  );
}

export default function QuickBookCard({ contexts, states, lang, paused = false, onBook }: QuickBookCardProps) {
  const groups = useMemo(() => {
    const stateMap = new Map<
      number,
      {
        state: ScheduleContext['state'];
        cities: Map<number, { city: ScheduleContext['city']; venues: Map<number, ScheduleContext> }>;
      }
    >();
    for (const context of contexts) {
      if (!stateMap.has(context.state.id)) {
        stateMap.set(context.state.id, { state: context.state, cities: new Map() });
      }
      const stateGroup = stateMap.get(context.state.id)!;
      if (!stateGroup.cities.has(context.city.id)) {
        stateGroup.cities.set(context.city.id, { city: context.city, venues: new Map() });
      }
      stateGroup.cities.get(context.city.id)!.venues.set(context.venue.id, context);
    }
    return Array.from(stateMap.values()).map((entry) => ({
      state: entry.state,
      cities: Array.from(entry.cities.values()).map((cityEntry) => ({
        city: cityEntry.city,
        venues: Array.from(cityEntry.venues.values()),
      })),
    }));
  }, [contexts]);

  const stateOptions = useMemo(() => {
    const seen = new Set<number>();
    const options: EventState[] = [];
    for (const group of groups) {
      if (seen.has(group.state.id)) continue;
      seen.add(group.state.id);
      options.push(group.state);
    }
    for (const state of states) {
      if (seen.has(state.id)) continue;
      seen.add(state.id);
      options.push(state);
    }
    return options;
  }, [groups, states]);

  const [stateId, setStateId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [venueId, setVenueId] = useState<number | null>(null);

  const activeGroup = stateId == null ? (groups[0] ?? null) : (groups.find((group) => group.state.id === stateId) ?? null);
  const waitlistState =
    stateId != null && !groups.some((group) => group.state.id === stateId)
      ? (states.find((state) => state.id === stateId) ?? null)
      : null;
  const activeStateInfo = activeGroup?.state ?? waitlistState;
  const activeCity = activeGroup?.cities.find((city) => city.city.id === cityId) ?? activeGroup?.cities[0];
  const activeVenue = activeCity?.venues.find((entry) => entry.venue.id === venueId) ?? activeCity?.venues[0];
  const context = activeVenue ?? null;

  if (groups.length === 0) {
    return (
      <div className="rounded-[26px] border border-sky/20 bg-sindoor-deep/80 p-6 backdrop-blur-xl">
        <p className="font-ui text-[0.62rem] uppercase tracking-[0.2em] text-sky">Pass booking</p>
        <h3 className="mt-2 font-display text-2xl text-white">Bookings open shortly</h3>
        <p className="mt-2 text-sm text-cream-on-dark/60">Our team is preparing the cities and venues. Please check back soon.</p>
      </div>
    );
  }

  const saleEnd = context?.schedule.sale_ends_at ?? context?.schedule.event_sale_ends_at ?? null;
  const salesClosed = context ? context.schedule.sale_ended || context.schedule.date_passed : false;
  const closed = paused || salesClosed;
  const closedLabel = paused ? (lang === 'hi' ? 'बुकिंग अस्थायी रूप से बंद' : 'Bookings paused') : lang === 'hi' ? 'बिक्री बंद' : 'Sales closed';

  const changeState = (id: number) => {
    const group = groups.find((item) => item.state.id === id);
    setStateId(id);
    const city = group?.cities[0];
    setCityId(city?.city.id ?? null);
    setVenueId(city?.venues[0]?.venue.id ?? null);
  };

  const changeCity = (id: number) => {
    const city = activeGroup?.cities.find((item) => item.city.id === id);
    setCityId(id);
    setVenueId(city?.venues[0]?.venue.id ?? null);
  };

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-sky/25 bg-sindoor-deep/85 shadow-[0_30px_90px_-30px_rgba(0,0,0,.85)] backdrop-blur-xl">
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#13BBE8,#EE2C8F,#FFD21F)' }} />
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(238,44,143,.8), transparent 65%)' }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-marigold/35 bg-marigold/10 px-2.5 py-1 font-ui text-[0.58rem] uppercase tracking-[0.18em] text-marigold">
              <Sparkles size={11} />{' '}
              {paused
                ? closedLabel
                : waitlistState
                  ? lang === 'hi'
                    ? 'जल्द आ रहा है'
                    : 'Coming soon'
                  : salesClosed
                    ? 'Booking closed'
                    : 'Instant QR pass'}
            </span>
            <h2 className="mt-3 font-display text-[1.65rem] leading-tight text-white">Book your city pass</h2>
            <p className="mt-1 text-xs text-cream-on-dark/55">
              {activeStateInfo ? biCity(activeStateInfo.name_en, activeStateInfo.name_hi, lang) : ''}
              {activeGroup
                ? ` · ${activeGroup.cities.length} ${activeGroup.cities.length === 1 ? 'city' : 'cities'}`
                : waitlistState
                  ? ` · ${lang === 'hi' ? 'यात्रा अभी यहाँ नहीं' : 'not on the route yet'}`
                  : ''}
            </p>
          </div>
          {context && (
            <div className="shrink-0 pt-1">
              <Countdown target={saleEnd} compact onDark />
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={waitlistState ? 'sm:col-span-2' : undefined}>
            <Select label="State" value={activeStateInfo?.id ?? ''} onChange={changeState}>
              {stateOptions.map((state) => (
                <option key={state.id} value={state.id} className="bg-sindoor-deep">
                  {lang === 'hi' ? state.name_hi : state.name_en}
                </option>
              ))}
            </Select>
          </div>

          {activeCity && (
            <Select label="City" value={activeCity.city.id} onChange={changeCity}>
              {activeGroup!.cities.map((city) => (
                <option key={city.city.id} value={city.city.id} className="bg-sindoor-deep">
                  {lang === 'hi' ? city.city.name_hi : city.city.name_en}
                </option>
              ))}
            </Select>
          )}
        </div>

        {waitlistState ? (
          <div className="mt-4">
            <StateWaitlist state={waitlistState} lang={lang} dark />
          </div>
        ) : (
          <>
            <div className="mt-3">
              <Select
                label={activeCity && activeCity.venues.length > 1 ? 'Venue address' : 'Venue'}
                value={activeVenue?.venue.id ?? ''}
                onChange={(id) => setVenueId(id)}
              >
                {(activeCity?.venues ?? []).map((entry) => (
                  <option key={entry.venue.id} value={entry.venue.id} className="bg-sindoor-deep">
                    {lang === 'hi' ? entry.venue.name_hi : entry.venue.name_en}
                  </option>
                ))}
              </Select>
            </div>

            {context && (
              <>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-marigold" />
                  <div className="min-w-0 text-xs leading-relaxed text-cream-on-dark/65">
                    <p className="text-cream-on-dark/85">{lang === 'hi' ? context.venue.name_hi : context.venue.name_en}</p>
                    <p className="mt-0.5">{lang === 'hi' ? context.venue.address_hi : context.venue.address_en}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {context.availability.map((item) => {
                    const tone = seatTone(item.left, item.capacity);
                    const disabled = closed || item.left <= 0;
                    return (
                      <button
                        key={item.ticket.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onBook(context.schedule.id, item.ticket.id)}
                        className="group relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.045] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-marigold/60 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                      >
                        <span className="block font-ui text-[0.58rem] uppercase tracking-[0.16em] text-cream-on-dark/50">
                          {lang === 'hi' ? item.ticket.name_hi : item.ticket.name_en}
                        </span>
                        <span className="mt-1.5 block">
                          <PriceTag
                            ticket={item.ticket}
                            lang={lang}
                            dark
                            caption={lang === 'hi' ? 'प्रति व्यक्ति' : '/ head'}
                            showRise
                          />
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className={`font-ui text-[0.68rem] ${
                              tone === 'out'
                                ? 'text-red-300'
                                : tone === 'low'
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }`}
                          >
                            {paused ? closedLabel : salesClosed ? 'Sales closed' : seatLabel(item.left)}
                          </span>
                          <ArrowRight
                            size={14}
                            className="text-marigold/70 transition-transform group-hover:translate-x-0.5 group-hover:text-marigold"
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3.5">
                  <span className="inline-flex items-center gap-1.5 text-[0.65rem] text-cream-on-dark/45">
                    <ShieldCheck size={13} className="text-emerald-300" /> Seats held 30 min · OTP verified
                  </span>
                  <span className="font-ui text-[0.62rem] uppercase tracking-[0.12em] text-cream-on-dark/40">
                    {context.schedule.start_time
                      ? `Gates 6:00 AM · Path ${context.schedule.start_time.slice(0, 5)}`
                      : 'One day only'}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function biCity(en: string, hi: string, lang: Lang) {
  return lang === 'hi' ? hi || en : en || hi;
}
