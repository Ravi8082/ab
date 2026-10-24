export interface Localized {
  en: string;
  hi: string;
}

export interface EventTicket {
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
  list_price?: number;
  actual_price?: number | null;
  discount_percent?: number;
  price_effective_from?: string | null;
  price_label_en?: string | null;
  price_label_hi?: string | null;
  next_price?: number | null;
  next_price_from?: string | null;
}

export interface EventInfo {
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
  tickets: EventTicket[];
}

export interface EventVenue {
  id: number;
  city_id: number;
  name_en: string;
  name_hi: string;
  address_en: string;
  address_hi: string;
  map_url: string | null;
}

export interface EventCity {
  id: number;
  state_id: number;
  name_en: string;
  name_hi: string;
  venues: EventVenue[];
}

export interface EventState {
  id: number;
  code: string;
  name_en: string;
  name_hi: string;
  cities: EventCity[];
}

export interface ScheduleCapacity {
  ticketTypeId: number;
  capacity: number;
  sold: number;
  left: number;
}

export interface EventSchedule {
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
  event_sale_ends_at: string | null;
  note_en: string | null;
  note_hi: string | null;
  sale_ended: boolean;
  date_passed: boolean;
  capacities: ScheduleCapacity[];
}

export interface SalesState {
  paused: boolean;
  message_en: string;
  message_hi: string;
  resume_at: string | null;
}

export interface EventPageData {
  content: Record<string, Record<string, unknown>>;
  events: EventInfo[];
  states: EventState[];
  schedules: EventSchedule[];
  paymentMode: 'dev' | 'live';
  requireOtp: boolean;
  sales: SalesState;
  serverNow: string;
}

export type LegalPageKey = 'terms' | 'privacy' | 'refund';

export interface LegalPageData {
  page: LegalPageKey;
  content: {
    title?: Localized;
    intro?: Localized;
    sections?: { heading?: Localized; body?: Localized }[];
  };
  support: Record<string, unknown> | null;
}

export interface WaitlistResult {
  ref: string;
  state?: { id: number; name_en: string; name_hi: string };
  verified: boolean;
  nextStep: 'otp' | 'done';
  delivered?: boolean;
  devMode?: boolean;
  devCode?: string;
}

export interface BookingAttendee {
  position: number;
  name: string;
  phone: string;
  email: string | null;
}

export interface EventBookingPass {
  reference: string;
  name: string;
  email: string;
  phone: string;
  qty: number;
  unitPrice: number;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  qrToken: string | null;
  checkInAt: string | null;
  todayCheckInAt: string | null;
  checkInCount: number;
  passDays: number;
  calendarDays: number;
  entriesLeft: number;
  createdAt: string;
  source?: 'online' | 'admin_free' | 'admin_issued';
  guestCategory?: 'visitor' | 'vip' | 'press' | 'organiser' | 'staff' | 'other';
  couponCode?: string | null;
  discount?: number;
  grossAmount?: number | null;
  adminNote?: string | null;
  attendees?: BookingAttendee[];
  event: {
    slug: string;
    kind: 'yatra' | 'expo';
    name_en: string;
    name_hi: string;
    date_label_en: string;
    date_label_hi: string;
  };
  ticket: { slug: string; name_en: string; name_hi: string };
  schedule: {
    id: number;
    event_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    note_en: string | null;
    note_hi: string | null;
  };
  location: {
    state_id: number;
    city_id: number;
    venue_id: number;
    state_en: string;
    state_hi: string;
    city_en: string;
    city_hi: string;
    venue_en: string;
    venue_hi: string;
    address_en: string;
    address_hi: string;
    mapUrl: string | null;
  };
}

export interface CreateBookingResult {
  reference: string;
  amount: number;
  unitPrice: number;
  grossAmount?: number;
  discount?: number;
  couponCode?: string | null;
  couponLabel?: Localized | null;
  qty: number;
  attendees?: number;
  passDays: number;
  pricing: {
    price: number;
    list_price: number;
    actual_price: number | null;
    discount_percent: number;
    price_effective_from: string | null;
    next_price: number | null;
    next_price_from: string | null;
  };
  nextStep: 'otp';
  saleEndsAt: string | null;
  eventName: Localized;
  ticketName: Localized;
}

export type PaymentOrder =
  | { mode: 'dev' }
  | { mode: 'free'; reference: string; pass: EventBookingPass }
  | {
      mode: 'razorpay';
      keyId: string;
      orderId: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      prefill: { name: string; email: string; contact: string };
      notes: { reference: string };
    };

export class ApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body?.error || 'Request failed', response.status, body?.details);
  }
  return body as T;
}

export interface CouponPreview {
  ok: boolean;
  message?: string;
  code?: string;
  amountOff?: number;
  netAmount?: number;
  grossAmount?: number;
  unitPrice?: number;
  label_en?: string | null;
  label_hi?: string | null;
}

export interface AttendeeInput {
  name: string;
  phone: string;
  email?: string;
}

export const eventApi = {
  page: () => request<EventPageData>('/api/events/page'),

  legal: (page: LegalPageKey) => request<LegalPageData>(`/api/events/legal/${page}`),

  joinWaitlist: (input: { stateId: number; name: string; email: string; phone: string }) =>
    request<WaitlistResult>('/api/events/waitlist', { method: 'POST', body: JSON.stringify(input) }),

  resendWaitlistCode: (ref: string) =>
    request<WaitlistResult>(`/api/events/waitlist/${encodeURIComponent(ref)}/otp`, { method: 'POST' }),

  verifyWaitlist: (ref: string, code: string) =>
    request<{ verified: boolean }>(`/api/events/waitlist/${encodeURIComponent(ref)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  createBooking: (input: {
    scheduleId: number;
    ticketTypeId: number;
    name: string;
    email: string;
    phone: string;
    qty: number;
    acceptTerms: boolean;
    couponCode?: string;
    attendees?: AttendeeInput[];
  }) => request<CreateBookingResult>('/api/events/bookings', { method: 'POST', body: JSON.stringify(input) }),

  previewCoupon: (input: {
    scheduleId: number;
    ticketTypeId: number;
    qty: number;
    email?: string;
    couponCode: string;
  }) => request<CouponPreview>('/api/events/coupon/preview', { method: 'POST', body: JSON.stringify(input) }),

  requestOtp: (reference: string) =>
    request<{ sent: boolean; devMode: boolean; devCode?: string }>(
      `/api/events/bookings/${encodeURIComponent(reference)}/otp`,
      { method: 'POST' },
    ),

  verifyOtp: (reference: string, code: string) =>
    request<{ verified: boolean }>(`/api/events/bookings/${encodeURIComponent(reference)}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  createOrder: (reference: string) =>
    request<PaymentOrder>(`/api/events/bookings/${encodeURIComponent(reference)}/order`, { method: 'POST' }),

  payBooking: (reference: string) =>
    request<{ mode: string; status: string; pass: EventBookingPass }>(
      `/api/events/bookings/${encodeURIComponent(reference)}/pay`,
      { method: 'POST' },
    ),

  lookup: (reference: string, contact: string) =>
    request<EventBookingPass>(
      `/api/events/bookings/${encodeURIComponent(reference)}?contact=${encodeURIComponent(contact)}`,
    ),

  staffStats: () =>
    request<{
      myCheckIns: number;
      todayCheckIns: number;
      totalCheckIns: number;
      recent: {
        reference: string;
        name: string;
        qty: number;
        check_in_at: string;
        event_en: string;
        ticket_en: string;
        city_en: string;
        venue_en: string;
      }[];
    }>('/api/staff/stats'),

  staffScan: (code: string) =>
    request<StaffScanResult>('/api/staff/scan', { method: 'POST', body: JSON.stringify({ code }) }),
};

export interface StaffScanResult {
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
  attendees?: { position: number; name: string; phone: string }[];
  status: string;
  checkedInAt: string;
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
