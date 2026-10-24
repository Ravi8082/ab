import { query } from '../db.js';

const toDay = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
};

export async function priceSlabsByTicket() {
  const rows = await query(
    `SELECT id, ticket_type_id, effective_from, price, label_en, label_hi
     FROM event_ticket_price_slabs ORDER BY ticket_type_id, effective_from, id`,
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.ticket_type_id)) map.set(row.ticket_type_id, []);
    map.get(row.ticket_type_id).push({
      id: row.id,
      effective_from: toDay(row.effective_from),
      price: Number(row.price),
      label_en: row.label_en,
      label_hi: row.label_hi,
    });
  }
  return map;
}

/** Today's effective price for a ticket, its struck-through actual price and the next scheduled rise. */
export function priceOnDate(ticket, slabs = [], onDate = new Date()) {
  const day = toDay(onDate);
  const listPrice = Number(ticket.price);
  const sorted = [...slabs].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const active = sorted.filter((slab) => slab.effective_from <= day);
  const current = active[active.length - 1];
  const upcoming = sorted.find((slab) => slab.effective_from > day);

  const effective = current ? current.price : listPrice;
  const compareAgainst = Math.max(Number(ticket.original_price) || 0, listPrice);
  const actual = compareAgainst > effective ? compareAgainst : null;

  return {
    price: effective,
    list_price: listPrice,
    actual_price: actual,
    discount_percent: actual ? Math.round(((actual - effective) / actual) * 100) : 0,
    price_effective_from: current ? current.effective_from : null,
    price_label_en: current?.label_en ?? null,
    price_label_hi: current?.label_hi ?? null,
    next_price: upcoming ? upcoming.price : null,
    next_price_from: upcoming ? upcoming.effective_from : null,
  };
}

/** Same maths as priceOnDate, but for one ticket read inside a transaction. */
export async function effectiveUnitPrice(conn, ticket, onDate = new Date()) {
  const [rows] = await conn.execute(
    `SELECT id, effective_from, price, label_en, label_hi
     FROM event_ticket_price_slabs WHERE ticket_type_id = ? ORDER BY effective_from, id`,
    [ticket.id],
  );
  return priceOnDate(
    ticket,
    rows.map((row) => ({
      id: row.id,
      effective_from: toDay(row.effective_from),
      price: Number(row.price),
      label_en: row.label_en,
      label_hi: row.label_hi,
    })),
    onDate,
  );
}
