import type {
  EventCity,
  EventInfo,
  EventPageData,
  EventSchedule,
  EventState,
  EventTicket,
  EventVenue,
} from '@/lib/eventApi';

export type EventLayout = 'route' | 'single';

export interface TicketAvailability {
  ticket: EventTicket;
  capacity: number;
  sold: number;
  left: number;
}

export interface ScheduleContext {
  schedule: EventSchedule;
  event: EventInfo;
  state: EventState;
  city: EventCity;
  venue: EventVenue;
  availability: TicketAvailability[];
}

export function buildContexts(data: EventPageData | null): ScheduleContext[] {
  if (!data) return [];
  const events = new Map(data.events.map((event) => [event.id, event]));
  const states = new Map(data.states.map((state) => [state.id, state]));
  const cities = new Map<number, EventCity>();
  const venues = new Map<number, EventVenue>();
  for (const state of data.states) {
    for (const city of state.cities) {
      cities.set(city.id, city);
      for (const venue of city.venues) venues.set(venue.id, venue);
    }
  }

  const contexts: ScheduleContext[] = [];
  for (const schedule of data.schedules) {
    const event = events.get(schedule.event_id);
    const state = states.get(schedule.state_id);
    const city = cities.get(schedule.city_id);
    const venue = venues.get(schedule.venue_id);
    if (!event || !state || !city || !venue) continue;

    const availability = event.tickets.flatMap((ticket) => {
      const capacity = schedule.capacities.find((item) => item.ticketTypeId === ticket.id);
      if (!capacity) return [];
      return [{ ticket, capacity: capacity.capacity, sold: capacity.sold, left: capacity.left }];
    });

    contexts.push({ schedule, event, state, city, venue, availability });
  }
  return contexts;
}

/** The page is India-only, so "today" must follow IST even when the browser clock is elsewhere. */
export function indiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A multi-day pass stays live until its last day, not its first. */
export function isPastSchedule(schedule: EventSchedule, today: string): boolean {
  const lastDay = String(schedule.end_date || schedule.event_date).slice(0, 10);
  return lastDay < today;
}

/** Soonest date first; within a day, earliest start time first. */
export function sortContexts(contexts: ScheduleContext[]): ScheduleContext[] {
  return [...contexts].sort((a, b) => {
    const dateA = String(a.schedule.event_date).slice(0, 10);
    const dateB = String(b.schedule.event_date).slice(0, 10);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const timeA = a.schedule.start_time || '00:00:00';
    const timeB = b.schedule.start_time || '00:00:00';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return a.schedule.id - b.schedule.id;
  });
}

/** Events are no longer fixed to two types — the admin picks a layout per type. */
export function eventsByLayout(data: EventPageData | null, layout: EventLayout): EventInfo[] {
  return data?.events.filter((event) => event.kind_layout === layout) ?? [];
}

export function findEventByLayout(data: EventPageData | null, layout: EventLayout): EventInfo | null {
  return eventsByLayout(data, layout)[0] ?? null;
}

/** Passes shown in the route slot: every route event's tickets, in their own order. */
export function ticketsForLayout(data: EventPageData | null, layout: EventLayout): EventTicket[] {
  return eventsByLayout(data, layout).flatMap((event) => event.tickets);
}

export function contextFor(contexts: ScheduleContext[], scheduleId: number | null): ScheduleContext | null {
  if (!scheduleId) return null;
  return contexts.find((context) => context.schedule.id === scheduleId) ?? null;
}

export function ticketTotals(contexts: ScheduleContext[], ticketId: number) {
  let capacity = 0;
  let sold = 0;
  let left = 0;
  for (const context of contexts) {
    const item = context.availability.find((entry) => entry.ticket.id === ticketId);
    if (!item) continue;
    capacity += item.capacity;
    sold += item.sold;
    left += item.left;
  }
  return { capacity, sold, left };
}

export function stopLabel(context: ScheduleContext, lang: 'en' | 'hi'): string {
  const city = lang === 'hi' ? context.city.name_hi : context.city.name_en;
  const state = lang === 'hi' ? context.state.name_hi : context.state.name_en;
  return `${city}, ${state}`;
}
