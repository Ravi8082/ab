import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarRange,
  MapPinned,
  RefreshCw,
  ScanLine,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import { adminOverview, type AdminOverview } from '@/lib/adminApi';
import { useBrand } from '@/context/BrandContext';
import { formatRupees } from '@/lib/pricing';
import {
  Empty,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Spinner,
  Stat,
  StatusChip,
  formatDateTime,
} from '@/components/admin/ui';

export default function AdminDashboard({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const { brand } = useBrand();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await adminOverview());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const paidSeats = data?.totals.seats ?? 0;
  const pending = data?.totals.pending ?? 0;
  const checkins = data?.totals.checkins ?? 0;
  const revenue = data?.totals.revenue ?? 0;

  const actions = [
    { label: 'Page content', hint: 'Hero, FAQ, Expo copy', icon: <Ticket size={16} />, tab: 'content' },
    { label: 'States & venues', hint: 'Add a city or address', icon: <MapPinned size={16} />, tab: 'locations' },
    { label: 'Schedules', hint: 'Dates and seat capacity', icon: <CalendarRange size={16} />, tab: 'schedules' },
    { label: 'Gate scanner', hint: 'Verify a pass on entry', icon: <ScanLine size={16} />, tab: 'checkin' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={`${brand.name_en} · Event control`}
        title="Dashboard"
        subtitle="Live numbers from the booking database, across every city, venue and ticket type."
        actions={
          <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-5">
          <Notice>{error}</Notice>
        </div>
      )}

      {loading && !data ? (
        <Panel>
          <Spinner label="Loading live numbers" />
        </Panel>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Paid revenue" value={formatRupees(revenue)} note="Captured payments only" tone="lotus" />
            <Stat label="Seats confirmed" value={paidSeats.toLocaleString('en-IN')} note="Paid pass holders" tone="sky" />
            <Stat label="Bookings" value={data.totals.bookings.toLocaleString('en-IN')} note={`${pending} pending payment`} />
            <Stat label="Checked in" value={checkins.toLocaleString('en-IN')} note="Scanned at the gate" tone="amber" />
            <Stat
              label="Show rate"
              value={paidSeats > 0 ? `${Math.round((checkins / paidSeats) * 100)}%` : '—'}
              note="Checked in / paid seats"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {actions.map((action) => (
              <button
                key={action.tab}
                onClick={() => onGoTo(action.tab)}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-saffron/40 hover:shadow-[0_16px_34px_-26px_rgba(238,44,143,.5)]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sandal-2 text-saffron-ink transition-colors group-hover:bg-saffron group-hover:text-white">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-ui text-[0.86rem] font-semibold text-ink">{action.label}</span>
                  <span className="block truncate text-[0.68rem] text-muted">{action.hint}</span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
            <Panel>
              <PanelHead
                title="Visitors by state"
                subtitle="Paid seats and revenue, highest first"
                actions={
                  <button onClick={() => onGoTo('bookings')} className="font-ui text-[0.72rem] font-semibold text-saffron-ink hover:underline">
                    Open reports
                  </button>
                }
              />
              {data.byState.length === 0 ? (
                <Empty title="No bookings yet" hint="As soon as a pass is paid, state totals appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.62rem] uppercase tracking-[0.12em] text-muted">
                        <th className="px-5 py-2.5">State</th>
                        <th className="px-3 py-2.5 text-right">Bookings</th>
                        <th className="px-3 py-2.5 text-right">Seats</th>
                        <th className="px-5 py-2.5 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {data.byState.map((state) => (
                        <tr key={state.id} className="hover:bg-sandal-2/40">
                          <td className="px-5 py-3">
                            <span className="font-ui font-semibold text-ink">{state.name_en}</span>
                            <span className="ml-1.5 font-hindi text-[0.7rem] text-muted">{state.name_hi}</span>
                          </td>
                          <td className="px-3 py-3 text-right text-muted">{state.bookings}</td>
                          <td className="px-3 py-3 text-right font-semibold text-ink">{state.seats}</td>
                          <td className="px-5 py-3 text-right font-display text-lg text-ink">{formatRupees(state.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHead
                title="Seats sold by ticket"
                subtitle="Paid seats against configured city capacity"
                actions={
                  <button onClick={() => onGoTo('schedules')} className="font-ui text-[0.72rem] font-semibold text-saffron-ink hover:underline">
                    Manage capacity
                  </button>
                }
              />
              <div className="space-y-4 p-5">
                {data.byTicket.map((ticket) => {
                  const percent = ticket.capacity > 0 ? Math.min(100, Math.round((ticket.sold / ticket.capacity) * 100)) : 0;
                  return (
                    <div key={ticket.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-ui text-[0.82rem] font-semibold text-ink">{ticket.name_en}</p>
                          <p className="truncate text-[0.66rem] text-muted">
                            {ticket.event_en} · {formatRupees(ticket.price)}
                          </p>
                        </div>
                        <p className="shrink-0 text-right text-[0.7rem] text-muted">
                          <span className="font-ui text-sm font-semibold text-ink">{ticket.sold.toLocaleString('en-IN')}</span>
                          {' / '}
                          {ticket.capacity.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sandal-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky via-saffron to-saffron-dark"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.byTicket.length === 0 && <Empty title="No active tickets" />}
              </div>
            </Panel>
          </div>

          <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
            <Panel>
              <PanelHead title="Events" subtitle="Bookings and revenue by event" />
              <div className="divide-y divide-line/70">
                {data.byEvent.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-sandal-2 text-saffron-ink">
                        <TrendingUp size={15} />
                      </span>
                      <div>
                        <p className="font-ui text-[0.84rem] font-semibold text-ink">{event.name_en}</p>
                        <p className="text-[0.66rem] uppercase tracking-[0.12em] text-muted">
                          {event.kind_label || event.kind}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-ui text-sm font-semibold text-ink">{formatRupees(Number(event.revenue))}</p>
                      <p className="text-[0.66rem] text-muted">
                        {Number(event.seats)} seats · {Number(event.bookings)} bookings
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Latest bookings"
                subtitle="Newest first"
                actions={
                  <button onClick={() => onGoTo('bookings')} className="font-ui text-[0.72rem] font-semibold text-saffron-ink hover:underline">
                    All bookings
                  </button>
                }
              />
              {data.recent.length === 0 ? (
                <Empty title="No bookings yet" hint="Share the event page to start receiving pass bookings." />
              ) : (
                <div className="divide-y divide-line/70">
                  {data.recent.map((booking) => (
                    <div key={booking.reference} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sandal-2 text-saffron-ink">
                        <Users size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">
                          <span className="font-mono text-[0.74rem] tracking-wide text-saffron-ink">{booking.reference}</span>
                          <span className="mx-1.5 text-muted/50">·</span>
                          {booking.name}
                        </p>
                        <p className="truncate text-[0.68rem] text-muted">
                          {booking.ticket_en} · {booking.qty} seat{booking.qty === 1 ? '' : 's'} ·{' '}
                          {formatDateTime(booking.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-ui text-sm font-semibold text-ink">{formatRupees(Number(booking.amount))}</p>
                        <StatusChip status={booking.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
