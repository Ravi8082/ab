export type Lang = 'en' | 'hi';

export type EventStatus = 'draft' | 'live' | 'closed';

export interface LocalizedText {
  en: string;
  hi: string;
}

export interface EventItem {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  date: string;
  time: string;
  venue: string;
  banner_url: string | null;
  status: EventStatus;
}

export interface TicketType {
  id: string;
  event_id: string;
  label: LocalizedText;
  price: number;
  discount_percent: number;
  discount_from: string | null;
  discount_to: string | null;
  max_quantity: number;
  active: boolean;
}

export interface CityItem {
  id: string;
  event_id: string;
  city: string;
  state: string;
  date: string;
  time: string;
  venue: string;
  capacity: number;
  booked: number;
  active: boolean;
}

export interface TierCard {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface Booking {
  id: string;
  booking_code: string;
  event_id: string;
  ticket_type_id: string;
  city_id: string | null;
  persons: number;
  name: string;
  phone: string;
  email: string;
  amount: number;
  coupon_id: string | null;
  status: 'pending' | 'paid' | 'refunded';
  checked_in: boolean;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  percent_or_flat: 'percent' | 'flat';
  value: number;
  expiry: string;
  usage_limit: number | null;
  used_count: number;
}
