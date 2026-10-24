import type {
  EventCity,
  EventInfo,
  EventPageData,
  EventSchedule,
  EventState,
  EventTicket,
  EventVenue,
} from '@/lib/eventApi';

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

export function findEvent(data: EventPageData | null, kind: 'yatra' | 'expo'): EventInfo | null {
  return data?.events.find((event) => event.kind === kind) ?? null;
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
