import type { TicketType } from '@/types';

export interface PriceInfo {
  basePrice: number;
  finalPrice: number;
  hasDiscount: boolean;
  discountPercent: number;
  savings: number;
  windowStart: Date | null;
  windowEnd: Date | null;
}

const toDate = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function priceInfo(ticket: TicketType, now: Date = new Date()): PriceInfo {
  const windowStart = toDate(ticket.discount_from);
  const windowEnd = toDate(ticket.discount_to);

  const hasDiscount =
    ticket.discount_percent > 0 &&
    (!windowStart || windowStart <= now) &&
    (!windowEnd || windowEnd >= now);

  const finalPrice = hasDiscount
    ? Math.round(ticket.price * (1 - ticket.discount_percent / 100))
    : ticket.price;

  return {
    basePrice: ticket.price,
    finalPrice,
    hasDiscount,
    discountPercent: hasDiscount ? ticket.discount_percent : 0,
    savings: ticket.price - finalPrice,
    windowStart,
    windowEnd,
  };
}

export const formatRupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export interface PriceSlabLike {
  effective_from: string;
  price: number;
}

export interface DatedPricing {
  price: number;
  list_price: number;
  actual_price: number | null;
  discount_percent: number;
}

/** Mirrors server/lib/ticketPricing.js so the admin panel can preview what visitors pay today. */
export function datedPricing(
  ticket: { price: number; original_price: number | null },
  slabs: PriceSlabLike[] = [],
  onDate: Date = new Date(),
): DatedPricing {
  const day = onDate.toISOString().slice(0, 10);
  const listPrice = Number(ticket.price);
  const sorted = [...slabs].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const active = sorted.filter((slab) => slab.effective_from <= day);
  const effective = active.length ? Number(active[active.length - 1].price) : listPrice;
  const compareAgainst = Math.max(Number(ticket.original_price) || 0, listPrice);
  const actual = compareAgainst > effective ? compareAgainst : null;
  return {
    price: effective,
    list_price: listPrice,
    actual_price: actual,
    discount_percent: actual ? Math.round(((actual - effective) / actual) * 100) : 0,
  };
}
