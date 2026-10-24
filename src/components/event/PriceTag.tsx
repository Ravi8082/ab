import type { EventTicket } from '@/lib/eventApi';
import type { Lang } from '@/types';
import { formatDate } from '@/lib/eventFormat';
import { formatRupees } from '@/lib/pricing';

/** `price` already carries today's admin-set date slab, resolved by the server. */
export default function PriceTag({
  ticket,
  lang,
  dark = false,
  size = 'md',
  align = 'left',
  caption,
  showRise = false,
}: {
  ticket: EventTicket;
  lang: Lang;
  dark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
  caption?: string;
  showRise?: boolean;
}) {
  const price = Number(ticket.price);
  const actual = ticket.actual_price == null ? null : Number(ticket.actual_price);
  const percent = Number(ticket.discount_percent ?? 0);
  const nextPrice = ticket.next_price == null ? null : Number(ticket.next_price);
  const nextFrom = ticket.next_price_from ?? null;

  const valueSize =
    size === 'lg' ? 'text-[2.7rem] leading-none' : size === 'sm' ? 'text-base leading-none' : 'text-[1.8rem] leading-none';
  const valueTone = dark ? 'text-marigold' : 'text-ink';
  const muteTone = dark ? 'text-cream-on-dark/45' : 'text-muted';

  return (
    <span className="block">
      <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span className={`font-display ${valueSize} ${valueTone}`}>{formatRupees(price)}</span>
        {actual != null && percent > 0 && (
          <>
            <span className={`font-ui text-xs line-through ${muteTone}`}>{formatRupees(actual)}</span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-emerald-700">
              {percent}% {lang === 'hi' ? 'छूट' : 'off'}
            </span>
          </>
        )}
        {caption && <span className={`font-ui text-[0.62rem] ${muteTone}`}>{caption}</span>}
      </span>
      {showRise && nextPrice != null && nextFrom && nextPrice > price && (
        <span
          className={`mt-1 block font-ui text-[0.66rem] ${dark ? 'text-marigold' : 'text-saffron-ink'}`}
        >
          {lang === 'hi'
            ? `${formatDate(nextFrom, lang)} से ${formatRupees(nextPrice)} हो जाएगी`
            : `Goes to ${formatRupees(nextPrice)} from ${formatDate(nextFrom, lang)}`}
        </span>
      )}
    </span>
  );
}
