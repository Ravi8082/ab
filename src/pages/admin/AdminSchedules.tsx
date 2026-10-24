import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import {
  adminCreateSchedule,
  adminDeleteSchedule,
  adminEvents,
  adminLocations,
  adminSchedules,
  adminUpdateSchedule,
  type AdminSchedule,
  type AdminState,
  type CapacityInput,
  type EventRow,
  type ScheduleInput,
} from '@/lib/adminApi';
import {
  Button,
  Field,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Select,
  Spinner,
  TextArea,
  TextInput,
  Toggle,
  formatDateTime,
  formatDay,
} from '@/components/admin/ui';
import { formatTimeRange } from '@/lib/eventFormat';

const toTimeInput = (value: string | null) => (value ? value.slice(0, 5) : '');
const toInputDateTime = (value: string | null) => (value ? value.replace(' ', 'T').slice(0, 16) : '');

interface Draft {
  event_id: number | '';
  state_id: number | '';
  city_id: number | '';
  venue_id: number | '';
  event_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  sale_ends_at: string;
  note_en: string;
  note_hi: string;
  active: number;
  capacities: Record<number, number>;
}

const emptyDraft = (): Draft => ({
  event_id: '',
  state_id: '',
  city_id: '',
  venue_id: '',
  event_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  sale_ends_at: '',
  note_en: '',
  note_hi: '',
  active: 1,
  capacities: {},
});

export default function AdminSchedules() {
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [states, setStates] = useState<AdminState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filterEvent, setFilterEvent] = useState<number | ''>('');
  const [filterState, setFilterState] = useState<number | ''>('');
  const [editor, setEditor] = useState<{ mode: 'new' | 'edit'; id?: number; draft: Draft } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleResult, eventResult, locationResult] = await Promise.all([
        adminSchedules(),
        adminEvents(),
        adminLocations(),
      ]);
      setSchedules(scheduleResult.schedules);
      setEvents(eventResult.events);
      setStates(locationResult.states);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load schedules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedEvent = editor ? events.find((event) => event.id === Number(editor.draft.event_id)) : null;
  const selectedState = editor ? states.find((state) => state.id === Number(editor.draft.state_id)) : null;
  const selectedCity = selectedState?.cities.find((city) => city.id === Number(editor?.draft.city_id)) ?? null;

  const visible = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          (!filterEvent || schedule.event_id === Number(filterEvent)) &&
          (!filterState || schedule.state_id === Number(filterState)),
      ),
    [schedules, filterEvent, filterState],
  );

  const openNew = () => {
    setEditor({ mode: 'new', draft: emptyDraft() });
  };

  const openEdit = (schedule: AdminSchedule) => {
    const event = events.find((item) => item.id === schedule.event_id);
    const capacities: Record<number, number> = {};
    for (const ticket of event?.tickets ?? []) {
      const existing = schedule.capacities.find((capacity) => capacity.ticket_type_id === ticket.id);
      capacities[ticket.id] = existing?.capacity ?? Number(ticket.default_capacity);
    }
    setEditor({
      mode: 'edit',
      id: schedule.id,
      draft: {
        event_id: schedule.event_id,
        state_id: schedule.state_id,
        city_id: schedule.city_id,
        venue_id: schedule.venue_id,
        event_date: schedule.event_date,
        end_date: schedule.end_date ?? '',
        start_time: toTimeInput(schedule.start_time),
        end_time: toTimeInput(schedule.end_time),
        sale_ends_at: toInputDateTime(schedule.sale_ends_at),
        note_en: schedule.note_en ?? '',
        note_hi: schedule.note_hi ?? '',
        active: Number(schedule.active),
        capacities,
      },
    });
  };

  const update = (patch: Partial<Draft>) =>
    setEditor((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  const changeEvent = (eventId: number) => {
    const event = events.find((item) => item.id === eventId);
    const capacities: Record<number, number> = {};
    for (const ticket of event?.tickets ?? []) capacities[ticket.id] = Number(ticket.default_capacity);
    update({ event_id: eventId, capacities });
  };

  const save = async () => {
    if (!editor) return;
    const draft = editor.draft;
    if (!draft.event_id) return setError('Choose an event.');
    if (!draft.state_id) return setError('Choose a state.');
    if (!draft.city_id) return setError('Choose a city.');
    if (!draft.venue_id) return setError('Choose a venue.');
    if (!draft.event_date) return setError('Choose the event date.');

    const event = events.find((item) => item.id === Number(draft.event_id));
    const capacities: CapacityInput[] = (event?.tickets ?? []).map((ticket) => ({
      ticket_type_id: ticket.id,
      capacity: Math.max(0, Number(draft.capacities[ticket.id] ?? ticket.default_capacity)),
    }));

    const payload: ScheduleInput = {
      event_id: Number(draft.event_id),
      state_id: Number(draft.state_id),
      city_id: Number(draft.city_id),
      venue_id: Number(draft.venue_id),
      event_date: draft.event_date,
      end_date: draft.end_date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      sale_ends_at: draft.sale_ends_at,
      note_en: draft.note_en,
      note_hi: draft.note_hi,
      active: draft.active,
      capacities,
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editor.mode === 'new') await adminCreateSchedule(payload);
      else if (editor.id) await adminUpdateSchedule(editor.id, payload);
      setEditor(null);
      setNotice(editor.mode === 'new' ? 'Schedule created with its seat capacity.' : 'Schedule updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (schedule: AdminSchedule) => {
    const label = `${schedule.city_en} · ${formatDay(schedule.event_date)}`;
    if (!window.confirm(`Delete the schedule for ${label}? Schedules with bookings cannot be deleted.`)) return;
    setError('');
    setNotice('');
    try {
      await adminDeleteSchedule(schedule.id);
      setNotice('Schedule deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the schedule.');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Event setup"
        title="Schedules & capacity"
        subtitle="Each city address needs a schedule. Set how many seats are sold for every ticket at that venue."
        actions={
          <>
            <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Button size="sm" onClick={openNew}>
              <Plus size={13} /> Add schedule
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice>{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <Select
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value ? Number(e.target.value) : '')}
          className="!w-auto min-w-[180px]"
        >
          <option value="">All events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.name_en}</option>
          ))}
        </Select>
        <Select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value ? Number(e.target.value) : '')}
          className="!w-auto min-w-[170px]"
        >
          <option value="">All states</option>
          {states.map((state) => (
            <option key={state.id} value={state.id}>{state.name_en}</option>
          ))}
        </Select>
        <span className="inline-flex items-center px-2 text-xs text-muted">
          {visible.length} schedule{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading && schedules.length === 0 ? (
        <Panel>
          <Spinner label="Loading schedules" />
        </Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <div className="px-5 py-12 text-center">
            <CalendarDays size={26} className="mx-auto text-saffron" />
            <p className="mt-2 font-display text-xl text-ink">No schedules</p>
            <p className="mt-1 text-sm text-muted">Add the date and address where this event will run.</p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((schedule) => {
            const totalCapacity = schedule.capacities.reduce((sum, item) => sum + Number(item.capacity), 0);
            const totalSold = schedule.capacities.reduce((sum, item) => sum + Number(item.sold), 0);
            const closed = schedule.active === 0;
            return (
              <Panel key={schedule.id} className={`overflow-hidden ${closed ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3 border-b border-line bg-sand-2/50 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-white text-center">
                      <div>
                        <p className="font-display text-lg leading-none text-ink">{schedule.event_date.slice(8, 10)}</p>
                        <p className="mt-0.5 font-ui text-[0.52rem] uppercase tracking-[0.12em] text-saffron-ink">
                          {new Date(`${schedule.event_date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="chip chip--lotus">{schedule.event_en}</span>
                        {!schedule.active && <span className="chip">Hidden</span>}
                      </div>
                      <p className="mt-1 font-ui text-[0.86rem] font-semibold text-ink">
                        {schedule.venue_en}
                      </p>
                      <p className="text-[0.68rem] text-muted">
                        {schedule.city_en}, {schedule.state_en}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => openEdit(schedule)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-saffron/40 hover:text-saffron-ink"
                      aria-label="Edit schedule"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => void remove(schedule)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-red-300 hover:text-red-600"
                      aria-label="Delete schedule"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 border-b border-line px-4 py-3 text-xs text-muted sm:grid-cols-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={12} className="text-saffron" /> {formatTimeRange(schedule.start_time, schedule.end_time) || 'Time not set'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-saffron" /> Sales close {formatDateTime(schedule.sale_ends_at)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 sm:col-span-2">
                    <MapPin size={12} className="text-saffron" /> {schedule.address_en}
                  </span>
                </div>

                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between text-[0.68rem] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={12} /> {totalSold.toLocaleString('en-IN')} of {totalCapacity.toLocaleString('en-IN')} seats sold
                    </span>
                    <span>{totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sand-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky via-saffron to-saffron-dark"
                      style={{ width: `${totalCapacity > 0 ? Math.min(100, Math.round((totalSold / totalCapacity) * 100)) : 0}%` }}
                    />
                  </div>

                  <div className="mt-3 divide-y divide-line/60">
                    {schedule.capacities.map((capacity) => {
                      const left = Number(capacity.capacity) - Number(capacity.sold);
                      return (
                        <div key={capacity.ticket_type_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-text">{capacity.ticket_en}</span>
                          <span className="shrink-0 text-right text-[0.7rem] text-muted">
                            <span className="font-ui text-[0.82rem] font-semibold text-ink">{Number(capacity.sold)}</span>
                            {' / '}
                            {Number(capacity.capacity)} sold
                            {left < 0 && <span className="ml-1 text-red-600">over capacity</span>}
                          </span>
                        </div>
                      );
                    })}
                    {schedule.capacities.length === 0 && (
                      <p className="py-2 text-xs text-muted">No capacity set for this schedule.</p>
                    )}
                  </div>

                  {(schedule.note_en || schedule.note_hi) && (
                    <p className="mt-2 rounded-lg bg-sand-2 px-3 py-2 text-[0.68rem] text-muted">{schedule.note_en || schedule.note_hi}</p>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'new' ? 'Add schedule' : 'Edit schedule'}
        subtitle="A schedule connects an event to one venue on one date, with seat capacity per ticket."
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setEditor(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editor?.mode === 'new' ? 'Create schedule' : 'Save schedule'}
            </Button>
          </div>
        }
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event">
                <Select
                  value={editor.draft.event_id}
                  onChange={(e) => changeEvent(Number(e.target.value))}
                >
                  <option value="">Choose an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>{event.name_en}</option>
                  ))}
                </Select>
              </Field>
              <Field label="State">
                <Select
                  value={editor.draft.state_id}
                  onChange={(e) => update({ state_id: Number(e.target.value), city_id: '', venue_id: '' })}
                >
                  <option value="">Choose a state</option>
                  {states.map((state) => (
                    <option key={state.id} value={state.id}>{state.name_en}</option>
                  ))}
                </Select>
              </Field>
              <Field label="City">
                <Select
                  value={editor.draft.city_id}
                  onChange={(e) => update({ city_id: Number(e.target.value), venue_id: '' })}
                  disabled={!selectedState}
                >
                  <option value="">Choose a city</option>
                  {(selectedState?.cities ?? []).map((city) => (
                    <option key={city.id} value={city.id}>{city.name_en}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Venue address">
                <Select
                  value={editor.draft.venue_id}
                  onChange={(e) => update({ venue_id: Number(e.target.value) })}
                  disabled={!selectedCity}
                >
                  <option value="">Choose a venue</option>
                  {(selectedCity?.venues ?? []).map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name_en}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Event date">
                <TextInput
                  type="date"
                  value={editor.draft.event_date}
                  onChange={(e) => update({ event_date: e.target.value })}
                />
              </Field>
              <Field label="End date" hint="Optional for multi-day events.">
                <TextInput
                  type="date"
                  value={editor.draft.end_date}
                  onChange={(e) => update({ end_date: e.target.value })}
                />
              </Field>
              <Field label="Starts at">
                <TextInput
                  type="time"
                  value={editor.draft.start_time}
                  onChange={(e) => update({ start_time: e.target.value })}
                />
              </Field>
              <Field label="Ends at">
                <TextInput
                  type="time"
                  value={editor.draft.end_time}
                  onChange={(e) => update({ end_time: e.target.value })}
                />
              </Field>
              <Field label="Ticket sales close at" hint="The public countdown uses this; leave blank to use the event sale close.">
                <TextInput
                  type="datetime-local"
                  value={editor.draft.sale_ends_at}
                  onChange={(e) => update({ sale_ends_at: e.target.value })}
                />
              </Field>
              <div className="flex items-end pb-1">
                <Toggle
                  checked={Boolean(editor.draft.active)}
                  onChange={(active) => update({ active: active ? 1 : 0 })}
                  label="Schedule is bookable"
                />
              </div>
              <Field label="Note (English)" className="sm:col-span-2">
                <TextArea
                  value={editor.draft.note_en}
                  onChange={(e) => update({ note_en: e.target.value })}
                  placeholder="Entry gates open at 7:00 AM, please arrive early."
                />
              </Field>
              <Field label="Note (हिंदी)" className="sm:col-span-2">
                <TextArea
                  value={editor.draft.note_hi}
                  onChange={(e) => update({ note_hi: e.target.value })}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-line bg-sand-2/60 p-4">
              <p className="font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Seat capacity at this venue</p>
              {!selectedEvent ? (
                <p className="mt-2 text-xs text-muted">Choose an event to set capacity per ticket.</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {selectedEvent.tickets.map((ticket) => (
                    <Field key={ticket.id} label={ticket.name_en}>
                      <TextInput
                        type="number"
                        min={0}
                        value={editor.draft.capacities[ticket.id] ?? ticket.default_capacity}
                        onChange={(e) =>
                          update({
                            capacities: { ...editor.draft.capacities, [ticket.id]: Number(e.target.value) },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
