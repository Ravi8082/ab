import type { Localized } from '@/lib/eventFormat';

export type { Localized };

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'staff' | string;
}

export interface AdminOverview {
  totals: {
    bookings: number;
    seats: number;
    revenue: number;
    pending: number;
    checkins: number;
  };
  byState: {
    id: number;
    name_en: string;
    name_hi: string;
    bookings: number;
    seats: number;
    revenue: number;
  }[];
  byTicket: {
    id: number;
    name_en: string;
    name_hi: string;
    price: number;
    default_capacity: number;
    event_en: string;
    event_hi: string;
    kind: string;
    capacity: number;
    sold: number;
    left: number;
  }[];
  byEvent: {
    id: number;
    name_en: string;
    name_hi: string;
    kind: string;
    bookings: number | string;
    seats: number | string;
    revenue: number | string;
  }[];
  recent: {
    reference: string;
    name: string;
    qty: number;
    amount: number;
    status: string;
    created_at: string;
    event_en: string;
    ticket_en: string;
  }[];
}

export interface AdminContentSection {
  content_key: string;
  value_json: Record<string, unknown>;
  updated_at: string;
}

export interface EventTicketRow {
  id: number;
  event_id: number;
  slug: string;
  name_en: string;
  name_hi: string;
  description_en: string;
  description_hi: string;
  price: number;
  original_price: number | null;
  default_capacity: number;
  valid_days: number;
  inclusions: Localized[];
  badge_en: string | null;
  badge_hi: string | null;
  sort_order: number;
  active: number;
  price_slabs?: TicketPriceSlab[];
}

/** One dated price for a ticket: from `effective_from` (inclusive) visitors pay `price`. */
export interface TicketPriceSlab {
  id: number;
  effective_from: string;
  price: number;
  label_en: string | null;
  label_hi: string | null;
}

export interface TicketPriceSlabInput {
  effective_from: string;
  price: number;
  label_en?: string;
  label_hi?: string;
}

export interface EventRow {
  id: number;
  slug: string;
  kind: 'yatra' | 'expo';
  name_en: string;
  name_hi: string;
  tagline_en: string;
  tagline_hi: string;
  description_en: string | null;
  description_hi: string | null;
  date_label_en: string;
  date_label_hi: string;
  starts_on: string | null;
  ends_on: string | null;
  sale_ends_at: string | null;
  active: number;
  sort_order: number;
  tickets: EventTicketRow[];
}

export interface AdminVenue {
  id: number;
  city_id: number;
  name_en: string;
  name_hi: string;
  address_en: string;
  address_hi: string;
  map_url: string | null;
  sort_order: number;
  active: number;
}

export interface AdminCity {
  id: number;
  state_id: number;
  name_en: string;
  name_hi: string;
  sort_order: number;
  active: number;
  venues: AdminVenue[];
}

export interface AdminState {
  id: number;
  code: string;
  name_en: string;
  name_hi: string;
  sort_order: number;
  active: number;
  cities: AdminCity[];
}

export interface AdminScheduleCapacity {
  schedule_id: number;
  ticket_type_id: number;
  capacity: number;
  sold: number;
  ticket_en: string;
  ticket_hi: string;
}

export interface AdminSchedule {
  id: number;
  event_id: number;
  state_id: number;
  city_id: number;
  venue_id: number;
  event_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  sale_ends_at: string | null;
  note_en: string | null;
  note_hi: string | null;
  active: number;
  event_en: string;
  event_hi: string;
  kind: string;
  event_slug: string;
  state_en: string;
  state_hi: string;
  city_en: string;
  city_hi: string;
  venue_en: string;
  venue_hi: string;
  address_en: string;
  address_hi: string;
  capacities: AdminScheduleCapacity[];
  tickets: Pick<EventTicketRow, 'id' | 'event_id' | 'name_en' | 'name_hi' | 'default_capacity' | 'active'>[];
}

export interface AdminBooking {
  id: number;
  reference: string;
  name: string;
  email: string;
  phone: string;
  qty: number;
  unit_price: number;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  otp_verified_at: string | null;
  pass_sent_at: string | null;
  check_in_at: string | null;
  created_at: string;
  event_en: string;
  event_hi: string;
  kind: string;
  ticket_en: string;
  ticket_hi: string;
  event_date: string;
  end_date: string | null;
  state_en: string;
  state_hi: string;
  city_en: string;
  city_hi: string;
  venue_en: string;
  venue_hi: string;
  address_en: string;
  address_hi: string;
  checked_in_by_name: string | null;
}

export interface BookingSummary {
  totals: {
    bookings: number;
    seats: number;
    revenue: number;
    paid: number;
    pending: number;
    cancelled: number;
    refunded: number;
    checkedIn: number;
  };
  byState: {
    id: number;
    name_en: string;
    name_hi: string;
    bookings: number;
    seats: number;
    revenue: number;
    checkedIn: number;
  }[];
}

export interface BookingFilters {
  stateId?: number | '';
  cityId?: number | '';
  venueId?: number | '';
  eventId?: number | '';
  ticketTypeId?: number | '';
  scheduleId?: number | '';
  status?: string;
  checkedIn?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface AdminPayment {
  id: number;
  booking_id: number;
  provider: string;
  provider_ref: string | null;
  amount: number;
  status: string;
  created_at: string;
  reference: string;
  name: string;
}

export interface AdminStaff {
  id: number;
  email: string;
  name: string;
  role: string;
  active: number;
  last_login_at: string | null;
  created_at: string;
  checkins: number;
}

export interface CheckInResult {
  allowed: boolean;
  reference: string;
  name: string;
  email: string;
  phone: string;
  qty: number;
  amount: number;
  discount?: number;
  couponCode?: string | null;
  source?: 'online' | 'admin_free' | 'admin_issued';
  guestCategory?: 'visitor' | 'vip' | 'press' | 'organiser' | 'staff' | 'other';
  guestLabel?: string;
  passDays?: number;
  validFrom?: string;
  validTo?: string;
  attendees?: { position: number; name: string; phone: string }[];
  status: string;
  checkedInAt: string;
  checkIn: {
    entryDate: string;
    dayNumber: number;
    calendarDays: number;
    entriesUsed: number;
    entriesAllowed: number;
    entriesLeft: number;
  };
  event: { name_en: string; name_hi: string; kind: string };
  ticket: { name_en: string; name_hi: string };
  schedule: { event_date: string; end_date: string | null; start_time: string | null; end_time: string | null };
  location: {
    state_en: string;
    state_hi: string;
    city_en: string;
    city_hi: string;
    venue_en: string;
    venue_hi: string;
    address_en: string;
    address_hi: string;
  };
}

export class AdminApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new AdminApiError('Could not reach the server. Check the API is running.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(body?.error || 'Request failed', response.status, body?.details);
  }
  return body as T;
}

function queryString(filters: BookingFilters = {}, extra: Record<string, string> = {}) {
  const query = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '' || value === 0) return;
    query.set(key, String(value));
  };
  add('stateId', filters.stateId);
  add('cityId', filters.cityId);
  add('venueId', filters.venueId);
  add('eventId', filters.eventId);
  add('ticketTypeId', filters.ticketTypeId);
  add('scheduleId', filters.scheduleId);
  add('status', filters.status);
  add('checkedIn', filters.checkedIn);
  add('q', filters.q?.trim());
  add('from', filters.from);
  add('to', filters.to);
  Object.entries(extra).forEach(([key, value]) => query.set(key, value));
  return query.toString();
}

export const adminLogin = (email: string, password: string) =>
  request<{ admin: AdminUser; token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const adminLogout = () => request<{ ok: boolean }>('/logout', { method: 'POST' });

export const adminMe = () => request<{ admin: AdminUser }>('/me');

export const adminOverview = () => request<AdminOverview>('/overview');

/* Content */
export const adminContent = () => request<{ sections: AdminContentSection[] }>('/content');

export const adminSaveContent = (key: string, value: Record<string, unknown>) =>
  request<{ ok: boolean }>(`/content/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

/* State waitlist (visitors asking for a state with no yatra city yet) */
export interface WaitlistRow {
  id: number;
  ref: string;
  state_id: number;
  state_code: string;
  state_en: string;
  state_hi: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'pending' | 'verified';
  verified_at: string | null;
  created_at: string;
}

export const adminWaitlist = () =>
  request<{
    waitlist: WaitlistRow[];
    byState: { state_id: number; total: number | string; verified: number | string }[];
  }>('/waitlist');

export const adminDeleteWaitlist = (id: number) =>
  request<{ ok: boolean }>(`/waitlist/${id}`, { method: 'DELETE' });

/* Events & tickets */
export const adminEvents = () => request<{ events: EventRow[] }>('/events');export interface EventInput {
  name_en: string;
  name_hi: string;
  tagline_en: string;
  tagline_hi: string;
  description_en: string;
  description_hi: string;
  date_label_en: string;
  date_label_hi: string;
  starts_on: string;
  ends_on: string;
  sale_ends_at: string;
  active: number;
}

export const adminUpdateEvent = (id: number, input: EventInput) =>
  request<{ ok: boolean }>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export interface TicketInput {
  event_id: number;
  slug: string;
  name_en: string;
  name_hi: string;
  description_en: string;
  description_hi: string;
  price: number;
  original_price: number | null;
  default_capacity: number;
  valid_days: number;
  inclusions: Localized[];
  badge_en: string;
  badge_hi: string;
  sort_order: number;
  active: number;
}

export const adminCreateTicket = (input: TicketInput) =>
  request<{ id: number }>('/tickets', { method: 'POST', body: JSON.stringify(input) });

export const adminUpdateTicket = (id: number, input: TicketInput) =>
  request<{ ok: boolean }>(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const adminDeleteTicket = (id: number) =>
  request<{ ok: boolean }>(`/tickets/${id}`, { method: 'DELETE' });

export const adminSaveTicketSlab = (ticketId: number, input: TicketPriceSlabInput) =>
  request<{ ok: boolean; id: number }>(`/tickets/${ticketId}/slabs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const adminDeleteTicketSlab = (ticketId: number, slabId: number) =>
  request<{ ok: boolean }>(`/tickets/${ticketId}/slabs/${slabId}`, { method: 'DELETE' });

/* Locations */
export const adminLocations = () => request<{ states: AdminState[] }>('/locations');

export interface StateInput {
  code: string;
  name_en: string;
  name_hi: string;
  sort_order: number;
  active: number;
}

export interface CityInput {
  state_id: number;
  name_en: string;
  name_hi: string;
  sort_order: number;
  active: number;
}

export interface VenueInput {
  city_id: number;
  name_en: string;
  name_hi: string;
  address_en: string;
  address_hi: string;
  map_url: string;
  sort_order: number;
  active: number;
}

export const adminCreateState = (input: StateInput) =>
  request<{ id: number }>('/states', { method: 'POST', body: JSON.stringify(input) });
export const adminUpdateState = (id: number, input: StateInput) =>
  request<{ ok: boolean }>(`/states/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const adminDeleteState = (id: number) =>
  request<{ ok: boolean }>(`/states/${id}`, { method: 'DELETE' });

export const adminCreateCity = (input: CityInput) =>
  request<{ id: number }>('/cities', { method: 'POST', body: JSON.stringify(input) });
export const adminUpdateCity = (id: number, input: CityInput) =>
  request<{ ok: boolean }>(`/cities/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const adminDeleteCity = (id: number) =>
  request<{ ok: boolean }>(`/cities/${id}`, { method: 'DELETE' });

export const adminCreateVenue = (input: VenueInput) =>
  request<{ id: number }>('/venues', { method: 'POST', body: JSON.stringify(input) });
export const adminUpdateVenue = (id: number, input: VenueInput) =>
  request<{ ok: boolean }>(`/venues/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const adminDeleteVenue = (id: number) =>
  request<{ ok: boolean }>(`/venues/${id}`, { method: 'DELETE' });

/* Schedules */
export const adminSchedules = () =>
  request<{ schedules: AdminSchedule[]; tickets: AdminSchedule['tickets'] }>('/schedules');

export interface CapacityInput {
  ticket_type_id: number;
  capacity: number;
}

export interface ScheduleInput {
  event_id: number;
  state_id: number;
  city_id: number;
  venue_id: number;
  event_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  sale_ends_at: string;
  note_en: string;
  note_hi: string;
  active: number;
  capacities: CapacityInput[];
}

export const adminCreateSchedule = (input: ScheduleInput) =>
  request<{ id: number }>('/schedules', { method: 'POST', body: JSON.stringify(input) });

export const adminUpdateSchedule = (id: number, input: ScheduleInput) =>
  request<{ ok: boolean }>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const adminDeleteSchedule = (id: number) =>
  request<{ ok: boolean }>(`/schedules/${id}`, { method: 'DELETE' });

/* Bookings & reports */
export const adminBookings = (filters: BookingFilters = {}, limit = 500) =>
  request<{ bookings: AdminBooking[]; summary: BookingSummary }>(
    `/bookings?${queryString(filters, { limit: String(limit) })}`,
  );

export async function adminDownloadBookings(format: 'xlsx' | 'pdf', filters: BookingFilters = {}) {
  let response: Response;
  try {
    response = await fetch(`/api/admin/exports/bookings.${format}?${queryString(filters)}`, {
      credentials: 'include',
    });
  } catch {
    throw new AdminApiError('Could not reach the server for the export.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new AdminApiError(body?.error || 'The export could not be generated.', response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = match?.[1] || `adhyatmik-bookings-${stamp}.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const adminCheckIn = (code: string) =>
  request<CheckInResult>('/check-in', { method: 'POST', body: JSON.stringify({ code }) });

export const adminPayments = () => request<{ payments: AdminPayment[] }>('/payments');

/* Sales switch & reminders */
export interface SalesSettings {
  paused: boolean;
  closed: boolean;
  message_en: string;
  message_hi: string;
  resume_at: string | null;
  reminders_enabled: boolean;
  updated_at: string | null;
}

export interface SalesSettingsResponse {
  settings: SalesSettings;
  smtpConfigured: boolean;
}

export const adminSalesSettings = () => request<SalesSettingsResponse>('/settings/sales');

export const adminSaveSalesSettings = (input: {
  paused: boolean;
  message_en: string;
  message_hi: string;
  resume_at: string | null;
  reminders_enabled: boolean;
}) => request<SalesSettingsResponse>('/settings/sales', { method: 'PUT', body: JSON.stringify(input) });

export interface AdminReminder {
  id: number;
  booking_id: number;
  reminder_type: 'payment_pending' | 'event_24h' | 'event_2h';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  reference: string;
  name: string;
  email: string;
  booking_status: string;
}

export interface ReminderRunResult {
  skipped?: boolean;
  reason?: string;
  enqueued: number;
  sent: number;
  skippedCount?: number;
  failed: number;
  processed?: number;
}

export const adminReminders = () =>
  request<{
    counts: { total: number; sent: number; pending: number; failed: number; skipped: number };
    reminders: AdminReminder[];
  }>('/reminders');

export const adminRunReminders = () => request<ReminderRunResult>('/reminders/run', { method: 'POST' });

export const adminRetryReminder = (id: number) =>
  request<{ ok: boolean }>(`/reminders/${id}/retry`, { method: 'POST' });

/* Email & OTP log */
export interface AdminEmailLog {
  id: number;
  kind: 'otp' | 'pass' | 'reminder' | 'test';
  recipient: string;
  subject: string;
  booking_id: number | null;
  reference: string | null;
  reminder_type: string | null;
  status: 'sent' | 'logged' | 'failed';
  provider: 'smtp' | 'console';
  error: string | null;
  created_at: string;
}

export interface AdminOtpLog {
  id: number;
  booking_id: number;
  reference: string | null;
  name: string | null;
  email: string | null;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  otp_status: 'verified' | 'expired' | 'active';
}

export interface AdminEmailsResponse {
  smtpConfigured: boolean;
  counts: { total: number; sent: number; logged: number; failed: number };
  otpCounts: { total: number; verified: number; active: number; expired: number };
  emails: AdminEmailLog[];
  otps: AdminOtpLog[];
}

export const adminEmails = () => request<AdminEmailsResponse>('/emails');

/* Staff */
export const adminStaffList = () => request<{ staff: AdminStaff[] }>('/staff');

export const adminCreateStaff = (input: { name: string; email: string; password: string }) =>
  request<{ id: number }>('/staff', { method: 'POST', body: JSON.stringify(input) });

export const adminUpdateStaff = (id: number, input: { name?: string; active?: number }) =>
  request<{ ok: boolean }>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(input) });

export const adminResetStaffPassword = (id: number, password: string) =>
  request<{ ok: boolean }>(`/staff/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) });

export const adminDisableStaff = (id: number) =>
  request<{ ok: boolean }>(`/staff/${id}`, { method: 'DELETE' });

/* Staff scanner API (works for owner, manager and staff cookies) */
async function staffRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/staff${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new AdminApiError('Could not reach the server. Check the API is running.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(body?.error || 'Request failed', response.status, body?.details);
  }
  return body as T;
}

export interface StaffStats {
  myCheckIns: number;
  todayCheckIns: number;
  totalCheckIns: number;
  recent: {
    id: number;
    reference: string;
    name: string;
    qty: number;
    check_in_at: string;
    entry_date: string;
    day_number: number;
    calendar_days: number;
    entries_allowed: number;
    entry_number: number;
    event_en: string;
    ticket_en: string;
    city_en: string;
    venue_en: string;
  }[];
}

export const staffMe = () => staffRequest<{ staff: AdminUser }>('/me');

export const staffStats = () => staffRequest<StaffStats>('/stats');

export const staffScan = (code: string) =>
  staffRequest<CheckInResult>('/scan', { method: 'POST', body: JSON.stringify({ code }) });
