import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  FilterX,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  adminBookings,
  adminDownloadBookings,
  adminEvents,
  adminLocations,
  type AdminBooking,
  type AdminState,
  type BookingFilters,
  type BookingSummary,
  type EventRow,
} from '@/lib/adminApi';
import { formatRupees } from '@/lib/pricing';
import {
  Button,
  Empty,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Select,
  Spinner,
  Stat,
  StatusChip,
  TextInput,
  formatDateTime,
  formatDay,
} from '@/components/admin/ui';

const EMPTY_FILTERS: BookingFilters = {
  stateId: '',
  cityId: '',
  venueId: '',
  eventId: '',
  ticketTypeId: '',
  status: '',
  checkedIn: '',
  q: '',
  from: '',
  to: '',
};

export default function AdminBookings() {
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [states, setStates] = useState<AdminState[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    void Promise.all([adminLocations(), adminEvents()])
      .then(([locationResult, eventResult]) => {
        setStates(locationResult.states);
        setEvents(eventResult.events);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load filters.'));
  }, []);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await adminBookings(filters, 500);
      if (requestId.current !== id) return;
      setBookings(result.bookings);
      setSummary(result.summary);
      setError('');
    } catch (err) {
      if (requestId.current !== id) return;
      setError(err instanceof Error ? err.message : 'Could not load bookings.');
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = (patch: Partial<BookingFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const selectedState = states.find((state) => state.id === Number(filters.stateId)) ?? null;
  const selectedCity = selectedState?.cities.find((city) => city.id === Number(filters.cityId)) ?? null;
  const selectedEvent = events.find((event) => event.id === Number(filters.eventId)) ?? null;

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => {
        if (key === 'status' || key === 'checkedIn') return Boolean(value);
        return value !== '' && value !== undefined && value !== null;
      }).length,
    [filters],
  );

  const exportReport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    setError('');
    try {
      await adminDownloadBookings(format, filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the export.');
    } finally {
      setExporting(null);
    }
  };

  const totals = summary?.totals;

  return (
    <div>
      <PageHeader
        eyebrow="Reporting"
        title="Bookings & reports"
        subtitle="Filter by state, city, venue, event, ticket, status or check-in. Every filter carries into the Excel and PDF downloads."
        actions={
          <>
            <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Button tone="ghost" size="sm" onClick={() => void exportReport('xlsx')} disabled={Boolean(exporting)}>
              <FileSpreadsheet size={14} /> {exporting === 'xlsx' ? 'Building…' : 'Excel'}
            </Button>
            <Button tone="dark" size="sm" onClick={() => void exportReport('pdf')} disabled={Boolean(exporting)}>
              <FileText size={14} /> {exporting === 'pdf' ? 'Building…' : 'PDF'}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice>{error}</Notice>
        </div>
      )}

      <Panel className="mb-5">
        <div className="p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              value={filters.stateId}
              onChange={(e) =>
                update({
                  stateId: e.target.value ? Number(e.target.value) : '',
                  cityId: '',
                  venueId: '',
                })
              }
            >
              <option value="">All states</option>
              {states.map((state) => (
                <option key={state.id} value={state.id}>{state.name_en}</option>
              ))}
            </Select>

            <Select
              value={filters.cityId}
              onChange={(e) => update({ cityId: e.target.value ? Number(e.target.value) : '', venueId: '' })}
              disabled={!selectedState}
            >
              <option value="">All cities</option>
              {(selectedState?.cities ?? []).map((city) => (
                <option key={city.id} value={city.id}>{city.name_en}</option>
              ))}
            </Select>

            <Select
              value={filters.venueId}
              onChange={(e) => update({ venueId: e.target.value ? Number(e.target.value) : '' })}
              disabled={!selectedCity}
            >
              <option value="">All venues / addresses</option>
              {(selectedCity?.venues ?? []).map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name_en}</option>
              ))}
            </Select>

            <Select
              value={filters.eventId}
              onChange={(e) =>
                update({ eventId: e.target.value ? Number(e.target.value) : '', ticketTypeId: '' })
              }
            >
              <option value="">All events</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.name_en}</option>
              ))}
            </Select>

            <Select
              value={filters.ticketTypeId}
              onChange={(e) => update({ ticketTypeId: e.target.value ? Number(e.target.value) : '' })}
              disabled={!selectedEvent}
            >
              <option value="">All tickets</option>
              {(selectedEvent?.tickets ?? []).map((ticket) => (
                <option key={ticket.id} value={ticket.id}>{ticket.name_en}</option>
              ))}
            </Select>

            <Select value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </Select>

            <Select value={filters.checkedIn} onChange={(e) => update({ checkedIn: e.target.value })}>
              <option value="">Gate: anyone</option>
              <option value="1">Checked in</option>
              <option value="0">Not checked in</option>
            </Select>

            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted/60" />
              <TextInput
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Reference, name, email, phone"
                className="!pl-9"
              />
            </div>

            <label className="block">
              <span className="mb-1 block font-ui text-[0.58rem] uppercase tracking-[0.12em] text-muted">Booked from</span>
              <TextInput type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-ui text-[0.58rem] uppercase tracking-[0.12em] text-muted">Booked to</span>
              <TextInput type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
            </label>

            <div className="flex items-end gap-2 sm:col-span-2">
              <Button
                tone="ghost"
                size="sm"
                onClick={() => setFilters(EMPTY_FILTERS)}
                disabled={activeFilterCount === 0}
              >
                <FilterX size={13} /> Clear filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </Button>
              {loading && <span className="text-xs text-muted">Updating…</span>}
            </div>
          </div>
        </div>
      </Panel>

      {totals && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Bookings" value={totals.bookings.toLocaleString('en-IN')} tone="sky" />
          <Stat label="Seats" value={totals.seats.toLocaleString('en-IN')} />
          <Stat label="Revenue" value={formatRupees(totals.revenue)} tone="lotus" />
          <Stat label="Paid" value={totals.paid.toLocaleString('en-IN')} />
          <Stat label="Pending" value={totals.pending.toLocaleString('en-IN')} tone="amber" />
          <Stat label="Checked in" value={totals.checkedIn.toLocaleString('en-IN')} />
        </div>
      )}

      <div className="space-y-5">
        <Panel>
          <PanelHead
            title="Visitors and revenue by state"
            subtitle={activeFilterCount ? 'Within the selected filters' : 'All bookings'}
            actions={
              <span className="font-ui text-[0.68rem] uppercase tracking-[0.12em] text-muted">
                {bookings.length} rows loaded
              </span>
            }
          />
          {summary && summary.byState.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                    <th className="px-5 py-2.5">State</th>
                    <th className="px-3 py-2.5 text-right">Bookings</th>
                    <th className="px-3 py-2.5 text-right">Seats</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-5 py-2.5 text-right">Checked in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {summary.byState.map((state) => (
                    <tr key={state.id} className="hover:bg-sandal-2/30">
                      <td className="px-5 py-2.5">
                        <span className="font-ui font-semibold text-ink">{state.name_en}</span>
                        <span className="ml-1.5 font-hindi text-[0.7rem] text-muted">{state.name_hi}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted">{state.bookings}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">{state.seats}</td>
                      <td className="px-3 py-2.5 text-right">{formatRupees(state.revenue)}</td>
                      <td className="px-5 py-2.5 text-right text-muted">{state.checkedIn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No bookings match these filters" hint="Try clearing a state, date or status filter." />
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHead
            title="Booking register"
            subtitle="Latest 500 bookings matching the filters. Download Excel or PDF for the full report."
          />
          {loading && bookings.length === 0 ? (
            <Spinner label="Loading bookings" />
          ) : bookings.length === 0 ? (
            <Empty title="No bookings yet" hint="Bookings appear here as soon as a devotee reserves a pass." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-3 py-2.5">Devotee</th>
                    <th className="px-3 py-2.5">Event / ticket</th>
                    <th className="px-3 py-2.5">Venue</th>
                    <th className="px-3 py-2.5">Event date</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Gate</th>
                    <th className="px-4 py-2.5">Booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="align-top hover:bg-sandal-2/30">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-mono text-[0.72rem] tracking-wide text-saffron-ink">{booking.reference}</span>
                        {booking.otp_verified_at && (
                          <span className="mt-1 block text-[0.6rem] text-muted">OTP verified</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-ui text-[0.82rem] font-semibold text-ink">{booking.name}</p>
                        <p className="text-[0.66rem] text-muted">{booking.phone}</p>
                        <p className="max-w-[190px] truncate text-[0.66rem] text-muted">{booking.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[0.78rem] text-text">{booking.event_en}</p>
                        <p className="text-[0.66rem] text-muted">{booking.ticket_en}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[0.78rem] text-text">{booking.venue_en}</p>
                        <p className="text-[0.66rem] text-muted">
                          {booking.city_en}, {booking.state_en}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[0.72rem] text-muted">
                        {formatDay(booking.event_date)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{booking.qty}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-display text-base text-ink">
                        {formatRupees(Number(booking.amount))}
                      </td>
                      <td className="px-3 py-3"><StatusChip status={booking.status} /></td>
                      <td className="px-3 py-3">
                        {booking.check_in_at ? (
                          <div>
                            <span className="chip chip--marigold">Checked in</span>
                            <p className="mt-1 text-[0.62rem] text-muted">
                              {formatDateTime(booking.check_in_at)}
                              {booking.checked_in_by_name ? ` · ${booking.checked_in_by_name}` : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[0.68rem] text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[0.68rem] text-muted">
                        {formatDateTime(booking.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sandal-2/40 px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-[0.68rem] text-muted">
              <Users size={12} /> {bookings.length} booking{bookings.length === 1 ? '' : 's'} shown
            </p>
            <div className="flex gap-2">
              <Button tone="ghost" size="sm" onClick={() => void exportReport('xlsx')} disabled={Boolean(exporting)}>
                <Download size={13} /> Excel
              </Button>
              <Button tone="ghost" size="sm" onClick={() => void exportReport('pdf')} disabled={Boolean(exporting)}>
                <FileText size={13} /> PDF
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
