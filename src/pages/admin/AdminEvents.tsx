import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  adminCreateEvent,
  adminCreateEventKind,
  adminCreateTicket,
  adminDeleteEventKind,
  adminDeleteTicket,
  adminDeleteTicketSlab,
  adminEventKinds,
  adminEvents,
  adminSaveTicketSlab,
  adminUpdateEvent,
  adminUpdateEventKind,
  adminUpdateTicket,
  type AdminEventKind,
  type EventInput,
  type EventRow,
  type EventTicketRow,
  type NewEventInput,
  type TicketInput,
} from '@/lib/adminApi';
import { datedPricing, formatRupees } from '@/lib/pricing';
import { LocalizedListEditor } from '@/components/admin/SectionEditor';
import { EventKindForm, type KindValues } from '@/components/admin/EventKindForm';
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

const toInputDateTime = (value: string | null) => (value ? value.replace(' ', 'T').slice(0, 16) : '');

const emptyEvent = (event: EventRow): EventInput => ({
  name_en: event.name_en,
  name_hi: event.name_hi,
  tagline_en: event.tagline_en ?? '',
  tagline_hi: event.tagline_hi ?? '',
  description_en: event.description_en ?? '',
  description_hi: event.description_hi ?? '',
  date_label_en: event.date_label_en ?? '',
  date_label_hi: event.date_label_hi ?? '',
  starts_on: event.starts_on ?? '',
  ends_on: event.ends_on ?? '',
  sale_ends_at: toInputDateTime(event.sale_ends_at),
  active: Number(event.active),
});

const blankEvent = (): NewEventInput => ({
  kind: 'yatra',
  slug: '',
  name_en: '',
  name_hi: '',
  tagline_en: '',
  tagline_hi: '',
  description_en: '',
  description_hi: '',
  date_label_en: '',
  date_label_hi: '',
  starts_on: '',
  ends_on: '',
  sale_ends_at: '',
  active: 1,
});

const emptyTicket = (eventId: number): TicketInput => ({
  event_id: eventId,
  slug: '',
  name_en: '',
  name_hi: '',
  description_en: '',
  description_hi: '',
  price: 0,
  original_price: null,
  default_capacity: 100,
  valid_days: 1,
  inclusions: [{ en: '', hi: '' }],
  badge_en: '',
  badge_hi: '',
  sort_order: 1,
  active: 1,
});

const ticketToInput = (ticket: EventTicketRow): TicketInput => ({
  event_id: ticket.event_id,
  slug: ticket.slug,
  name_en: ticket.name_en,
  name_hi: ticket.name_hi,
  description_en: ticket.description_en ?? '',
  description_hi: ticket.description_hi ?? '',
  price: Number(ticket.price),
  original_price: ticket.original_price == null ? null : Number(ticket.original_price),
  default_capacity: Number(ticket.default_capacity),
  valid_days: Number(ticket.valid_days ?? 1),
  inclusions: Array.isArray(ticket.inclusions) && ticket.inclusions.length ? ticket.inclusions : [{ en: '', hi: '' }],
  badge_en: ticket.badge_en ?? '',
  badge_hi: ticket.badge_hi ?? '',
  sort_order: Number(ticket.sort_order),
  active: Number(ticket.active),
});

export default function AdminEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [eventEditor, setEventEditor] = useState<{
    mode: 'new' | 'edit';
    event: EventRow | null;
    draft: NewEventInput;
  } | null>(null);
  const [ticketEditor, setTicketEditor] = useState<{
    mode: 'new' | 'edit';
    eventId: number;
    ticketId?: number;
    draft: TicketInput;
  } | null>(null);
  const [slabDraft, setSlabDraft] = useState({ effective_from: '', price: 0, label_en: '', label_hi: '' });
  const [slabBusy, setSlabBusy] = useState(false);
  const [kinds, setKinds] = useState<AdminEventKind[]>([]);
  const [quickKindOpen, setQuickKindOpen] = useState(false);
  const [kindEditor, setKindEditor] = useState<{ slug: string | null; draft: KindValues } | null>(null);
  const [kindBusy, setKindBusy] = useState(false);

  const activeKinds = useMemo(() => kinds.filter((kind) => Number(kind.active) === 1), [kinds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, kindResult] = await Promise.all([adminEvents(), adminEventKinds()]);
      setEvents(result.events);
      setKinds(kindResult.kinds);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveEvent = async () => {
    if (!eventEditor) return;
    const { draft } = eventEditor;
    if (draft.name_en.trim().length < 2) {
      setError('Enter the event name in English — at least 2 characters.');
      return;
    }
    if (!draft.name_hi.trim()) {
      setError('Enter the event name in हिंदी.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (eventEditor.mode === 'new') {
        const created = await adminCreateEvent({ ...draft, slug: (draft.slug ?? '').trim() || undefined });
        setEventEditor(null);
        setNotice(
          `${draft.name_en} created with address "${created.slug}". Add its tickets below, then set the city, venue and seat capacity in Schedules.`,
        );
      } else if (eventEditor.event) {
        await adminUpdateEvent(eventEditor.event.id, draft);
        setEventEditor(null);
        setNotice('Event details saved.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  };

  const patchEvent = (patch: Partial<NewEventInput>) =>
    setEventEditor((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));

  // Event types are admin-managed, so the list can grow (or an old slug can be switched off)
  // while the Add-event form is open — keep the draft pointing at something selectable.
  useEffect(() => {
    if (!eventEditor || eventEditor.mode !== 'new' || activeKinds.length === 0) return;
    if (activeKinds.some((kind) => kind.slug === eventEditor.draft.kind)) return;
    patchEvent({ kind: activeKinds[0].slug });
  }, [activeKinds, eventEditor]);

  // A saved event can point at a type that was later switched off — keep it selectable in the form.
  const kindOptions = useMemo(() => {
    const list = [...activeKinds];
    const current = eventEditor?.draft.kind;
    if (current && !list.some((kind) => kind.slug === current)) {
      const legacy = kinds.find((kind) => kind.slug === current);
      list.push(
        legacy ?? {
          slug: current,
          label_en: current,
          label_hi: current,
          layout: 'route',
          sort_order: 0,
          active: 0,
          event_count: 0,
        },
      );
    }
    return list;
  }, [activeKinds, eventEditor?.draft.kind, kinds]);

  const selectedKind = kinds.find((kind) => kind.slug === eventEditor?.draft.kind);

  useEffect(() => {
    if (!eventEditor) setQuickKindOpen(false);
  }, [eventEditor]);

  const saveKind = async (values: KindValues) => {
    const labelEn = values.label_en.trim();
    const labelHi = values.label_hi.trim();
    if (labelEn.length < 2) {
      setError('Enter the type name in English — at least 2 characters.');
      return;
    }
    if (!labelHi) {
      setError('Enter the type name in हिंदी.');
      return;
    }
    setKindBusy(true);
    setError('');
    setNotice('');
    try {
      let createdSlug: string | null = null;
      if (kindEditor?.slug) {
        await adminUpdateEventKind(kindEditor.slug, {
          label_en: labelEn,
          label_hi: labelHi,
          layout: values.layout,
          active: values.active,
        });
        setKindEditor(null);
        setNotice(`Type "${labelEn}" updated.`);
      } else {
        const created = await adminCreateEventKind({
          label_en: labelEn,
          label_hi: labelHi,
          layout: values.layout,
          active: values.active,
          sort_order: (kinds.length + 1) * 10,
        });
        createdSlug = created.slug;
        setQuickKindOpen(false);
        setNotice(`"${labelEn}" is now an event type — pick it when you add an event.`);
      }
      await load();
      // Selecting the new type only works once the refreshed list actually contains it.
      if (createdSlug) patchEvent({ kind: createdSlug });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the event type.');
    } finally {
      setKindBusy(false);
    }
  };

  const removeKind = async (kind: AdminEventKind) => {
    if (!window.confirm(`Delete the type "${kind.label_en}"? Move its events to another type first.`)) return;
    setError('');
    setNotice('');
    try {
      await adminDeleteEventKind(kind.slug);
      if (kindEditor?.slug === kind.slug) setKindEditor(null);
      setNotice(`Type "${kind.label_en}" deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the event type.');
    }
  };

  const saveTicket = async () => {
    if (!ticketEditor) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (ticketEditor.mode === 'new') {
        await adminCreateTicket(ticketEditor.draft);
        setNotice('Ticket created. Set its capacity in Schedules before selling.');
      } else if (ticketEditor.ticketId) {
        await adminUpdateTicket(ticketEditor.ticketId, ticketEditor.draft);
        setNotice('Ticket updated.');
      }
      setTicketEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the ticket.');
    } finally {
      setSaving(false);
    }
  };

  const saveSlab = async () => {
    if (!ticketEditor?.ticketId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slabDraft.effective_from)) {
      setError('Pick the date this price starts from.');
      return;
    }
    setSlabBusy(true);
    setError('');
    setNotice('');
    try {
      await adminSaveTicketSlab(ticketEditor.ticketId, {
        effective_from: slabDraft.effective_from,
        price: Number(slabDraft.price),
        label_en: slabDraft.label_en || undefined,
        label_hi: slabDraft.label_hi || undefined,
      });
      setNotice('Dated price saved.');
      setSlabDraft({ effective_from: '', price: 0, label_en: '', label_hi: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the dated price.');
    } finally {
      setSlabBusy(false);
    }
  };

  const removeSlab = async (slabId: number) => {
    if (!ticketEditor?.ticketId) return;
    setSlabBusy(true);
    setError('');
    setNotice('');
    try {
      await adminDeleteTicketSlab(ticketEditor.ticketId, slabId);
      setNotice('Dated price removed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the dated price.');
    } finally {
      setSlabBusy(false);
    }
  };

  const editorSlabs = (() => {
    if (!ticketEditor?.ticketId) return [] as NonNullable<EventTicketRow['price_slabs']>;
    const ticket = events.flatMap((event) => event.tickets).find((item) => item.id === ticketEditor.ticketId);
    return ticket?.price_slabs ?? [];
  })();

  const deleteTicket = async (ticket: EventTicketRow) => {
    if (!window.confirm(`Delete "${ticket.name_en}"? This only works if it has no bookings.`)) return;
    setError('');
    setNotice('');
    try {
      await adminDeleteTicket(ticket.id);
      setNotice(`${ticket.name_en} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the ticket.');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Event setup"
        title="Events & tickets"
        subtitle="Every event shares one booking engine. Add an event here, set its tickets, then give it city dates in Schedules."
        actions={
          <>
            <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Button
              size="sm"
              onClick={() => setEventEditor({ mode: 'new', event: null, draft: { ...blankEvent(), kind: activeKinds[0]?.slug ?? 'yatra' } })}
            >
              <Plus size={13} /> Add event
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

      <Panel className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="font-display text-lg text-ink">Event types</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-muted">
              Yatra and Expo are only the start. Pick a type below to rename it, switch it off, or delete it — types
              that run as a city route fill the yatra slot on the public page, single-venue types fill the expo slot.
            </p>
          </div>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => setKindEditor({ slug: null, draft: { label_en: '', label_hi: '', layout: 'single', active: 1 } })}
          >
            <Plus size={13} /> New type
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">
          {kinds.map((kind) => {
            const open = kindEditor?.slug === kind.slug;
            return (
              <button
                key={kind.slug}
                type="button"
                onClick={() =>
                  setKindEditor(
                    open
                      ? null
                      : {
                          slug: kind.slug,
                          draft: {
                            label_en: kind.label_en,
                            label_hi: kind.label_hi,
                            layout: kind.layout,
                            active: Number(kind.active),
                          },
                        },
                  )
                }
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                  open ? 'border-saffron bg-sandal-2' : 'border-line bg-white hover:bg-sandal-2/60'
                }`}
              >
                <span className="font-ui text-[0.8rem] font-semibold text-ink">
                  {kind.label_en}
                  <span className="ml-1.5 font-hindi text-muted">{kind.label_hi}</span>
                </span>
                <span className="font-ui text-[0.62rem] uppercase tracking-[0.1em] text-sky">
                  {kind.layout === 'route' ? 'city route' : 'single venue'}
                </span>
                <span className="font-ui text-[0.62rem] text-muted">{kind.event_count} event(s)</span>
                {!Number(kind.active) && (
                  <span className="font-ui text-[0.62rem] uppercase tracking-[0.1em] text-error">Off</span>
                )}
              </button>
            );
          })}
        </div>
        {kindEditor && (
          <div className="border-t border-line px-5 pb-5">
            <EventKindForm
              initial={kindEditor.draft}
              busy={kindBusy}
              submitLabel={kindEditor.slug ? 'Save type' : 'Add type'}
              onCancel={() => setKindEditor(null)}
              onSubmit={(values) => void saveKind(values)}
            />
            {kindEditor.slug && (
              <div className="mt-2 flex justify-end">
                <Button
                  tone="danger"
                  size="sm"
                  type="button"
                  disabled={kindBusy}
                  onClick={() => {
                    const kind = kinds.find((item) => item.slug === kindEditor.slug);
                    if (kind) void removeKind(kind);
                  }}
                >
                  <Trash2 size={13} /> Delete type
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>

      {loading && events.length === 0 ? (
        <Panel>
          <Spinner label="Loading events" />
        </Panel>
      ) : (
        <div className="space-y-5">
          {events.map((event) => (
            <Panel key={event.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-sandal-2/50 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip chip--lotus">{event.kind_label || event.kind}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${
                        Number(event.active)
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-line bg-sandal-2 text-muted'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${Number(event.active) ? 'bg-emerald-500' : 'bg-muted'}`}
                      />
                      {Number(event.active) ? 'Live' : 'Hidden'}
                    </span>
                    <span className="font-mono text-[0.66rem] text-muted">/{event.slug}</span>
                  </div>
                  <h2 className="mt-1.5 font-display text-2xl leading-tight text-ink">
                    {event.name_en}
                    <span className="ml-2 font-hindi text-sm text-muted">{event.name_hi}</span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{event.tagline_en}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button tone="ghost" size="sm" onClick={() => setEventEditor({ mode: 'edit', event, draft: { ...emptyEvent(event), kind: event.kind, slug: event.slug } })}>
                    <Pencil size={13} /> Edit event
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSlabDraft({ effective_from: '', price: 0, label_en: '', label_hi: '' });
                      setTicketEditor({ mode: 'new', eventId: event.id, draft: emptyTicket(event.id) });
                    }}
                  >
                    <Plus size={13} /> Add ticket
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 border-b border-line px-5 py-3 text-xs text-muted sm:grid-cols-3">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-saffron" /> {event.date_label_en || formatDay(event.starts_on)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-saffron" /> Event dates: {formatDay(event.starts_on)} – {formatDay(event.ends_on)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} className="text-saffron" /> Sales close: {formatDateTime(event.sale_ends_at)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-white font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                      <th className="px-5 py-2.5">Ticket</th>
                      <th className="px-3 py-2.5">Price</th>
                      <th className="px-3 py-2.5">Default capacity</th>
                      <th className="px-3 py-2.5">Pass days</th>
                      <th className="px-3 py-2.5">Inclusions</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-5 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {event.tickets.map((ticket) => {
                      const pricing = datedPricing(ticket, ticket.price_slabs ?? []);
                      return (
                      <tr key={ticket.id} className="hover:bg-sandal-2/30">
                        <td className="px-5 py-3">
                          <p className="font-ui font-semibold text-ink">{ticket.name_en}</p>
                          <p className="font-hindi text-[0.7rem] text-muted">{ticket.name_hi}</p>
                          <p className="font-mono text-[0.62rem] text-muted">/{ticket.slug}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-display text-lg text-ink">{formatRupees(pricing.price)}</p>
                          {pricing.actual_price != null && (
                            <p className="text-[0.64rem] text-muted">
                              <span className="line-through">{formatRupees(pricing.actual_price)}</span>{' '}
                              <span className="font-semibold text-emerald-700">{pricing.discount_percent}% off</span>
                            </p>
                          )}
                          {(ticket.price_slabs?.length ?? 0) > 0 && (
                            <p className="text-[0.6rem] text-saffron-ink">
                              {ticket.price_slabs!.length} dated price{ticket.price_slabs!.length === 1 ? '' : 's'}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted">{Number(ticket.default_capacity).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-muted">
                          {Number(ticket.valid_days ?? 1)} {Number(ticket.valid_days ?? 1) === 1 ? 'day' : 'days'}
                        </td>
                        <td className="max-w-[240px] px-3 py-3">
                          <p className="line-clamp-2 text-[0.72rem] text-muted">
                            {(ticket.inclusions ?? []).map((item) => item.en).filter(Boolean).join(' · ') || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`chip ${ticket.active ? 'chip--marigold' : 'chip--lotus'}`}>
                            {ticket.active ? 'Active' : 'Hidden'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSlabDraft({ effective_from: '', price: 0, label_en: '', label_hi: '' });
                                setTicketEditor({
                                  mode: 'edit',
                                  eventId: event.id,
                                  ticketId: ticket.id,
                                  draft: ticketToInput(ticket),
                                });
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-saffron/40 hover:text-saffron-ink"
                              aria-label={`Edit ${ticket.name_en}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => void deleteTicket(ticket)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-300 hover:text-red-600"
                              aria-label={`Delete ${ticket.name_en}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {event.tickets.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                          No tickets yet. Add the first ticket for this event.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(eventEditor)}
        onClose={() => setEventEditor(null)}
        title={
          eventEditor?.mode === 'new'
            ? 'Add event'
            : eventEditor?.event
              ? `Edit ${eventEditor.event.name_en}`
              : 'Edit event'
        }
        subtitle="These details appear at the top of the public event page."
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setEventEditor(null)}>Cancel</Button>
            <Button onClick={() => void saveEvent()} disabled={saving}>
              {saving ? 'Saving…' : eventEditor?.mode === 'new' ? 'Create event' : 'Save event'}
            </Button>
          </div>
        }
      >
        {eventEditor && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {eventEditor.mode === 'new' && (
                <>
                  <div className="sm:col-span-2">
                    <Field
                      label="Event type"
                      hint={
                        selectedKind
                          ? selectedKind.layout === 'route'
                            ? `"${selectedKind.label_en}" shows one schedule per city along a route — visitors pick their own city.`
                            : `"${selectedKind.label_en}" runs multi-day at a single venue.`
                          : 'Types are managed here — add as many as you need.'
                      }
                    >
                      <div className="flex gap-2">
                        <Select
                          value={eventEditor.draft.kind}
                          onChange={(e) => patchEvent({ kind: e.target.value })}
                          className="min-w-0 flex-1"
                        >
                          {kindOptions.map((kind) => (
                            <option key={kind.slug} value={kind.slug}>
                              {kind.label_en} · {kind.label_hi} — {kind.layout === 'route' ? 'city route' : 'single venue'}
                            </option>
                          ))}
                        </Select>
                        <Button
                          tone="ghost"
                          type="button"
                          size="sm"
                          className="shrink-0"
                          disabled={kindBusy}
                          onClick={() => setQuickKindOpen((open) => !open)}
                        >
                          <Plus size={13} /> New type
                        </Button>
                      </div>
                      {quickKindOpen && (
                        <EventKindForm
                          busy={kindBusy}
                          submitLabel="Add type"
                          onCancel={() => setQuickKindOpen(false)}
                          onSubmit={(values) => void saveKind(values)}
                        />
                      )}
                    </Field>
                  </div>
                  <Field label="Page address (slug)" hint="Leave blank to build it from the English name.">
                    <TextInput
                      value={eventEditor.draft.slug}
                      placeholder="mahi-sundarkand"
                      onChange={(e) => patchEvent({ slug: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label="Name (English)">
                <TextInput
                  value={eventEditor.draft.name_en}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, name_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Name (हिंदी)">
                <TextInput
                  value={eventEditor.draft.name_hi}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, name_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Tagline (English)">
                <TextInput
                  value={eventEditor.draft.tagline_en}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, tagline_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Tagline (हिंदी)">
                <TextInput
                  value={eventEditor.draft.tagline_hi}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, tagline_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Description (English)" className="sm:col-span-2">
                <TextArea
                  value={eventEditor.draft.description_en}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, description_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Description (हिंदी)" className="sm:col-span-2">
                <TextArea
                  value={eventEditor.draft.description_hi}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, description_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Date label (English)">
                <TextInput
                  value={eventEditor.draft.date_label_en}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, date_label_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Date label (हिंदी)">
                <TextInput
                  value={eventEditor.draft.date_label_hi}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, date_label_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Starts on">
                <TextInput
                  type="date"
                  value={eventEditor.draft.starts_on}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, starts_on: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Ends on">
                <TextInput
                  type="date"
                  value={eventEditor.draft.ends_on}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, ends_on: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Sale closes at" hint="Countdown on the public page uses this time.">
                <TextInput
                  type="datetime-local"
                  value={eventEditor.draft.sale_ends_at}
                  onChange={(e) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, sale_ends_at: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <div className="flex items-end pb-1">
                <Toggle
                  checked={Boolean(eventEditor.draft.active)}
                  onChange={(active) =>
                    setEventEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, active: active ? 1 : 0 } } : current,
                    )
                  }
                  label="Event is live on the site"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(ticketEditor)}
        onClose={() => setTicketEditor(null)}
        title={ticketEditor?.mode === 'new' ? 'Add ticket' : 'Edit ticket'}
        subtitle="Prices are per head. Capacity here applies to newly created schedules."
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setTicketEditor(null)}>Cancel</Button>
            <Button onClick={() => void saveTicket()} disabled={saving}>
              {saving ? 'Saving…' : ticketEditor?.mode === 'new' ? 'Create ticket' : 'Save ticket'}
            </Button>
          </div>
        }
      >
        {ticketEditor && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name (English)">
                <TextInput
                  value={ticketEditor.draft.name_en}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, name_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Name (हिंदी)">
                <TextInput
                  value={ticketEditor.draft.name_hi}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, name_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Slug" hint="Lowercase letters, numbers and dashes.">
                <TextInput
                  value={ticketEditor.draft.slug}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Sort order">
                <TextInput
                  type="number"
                  value={ticketEditor.draft.sort_order}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, sort_order: Number(e.target.value) } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Price (₹)" hint="Offer price shown on the site until a dated price takes over.">
                <TextInput
                  type="number"
                  min={0}
                  value={ticketEditor.draft.price}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, price: Number(e.target.value) } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Actual price (₹)" hint="Struck through on the site with an automatic % off badge when higher than the offer price.">
                <TextInput
                  type="number"
                  min={0}
                  value={ticketEditor.draft.original_price ?? ''}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, original_price: e.target.value === '' ? null : Number(e.target.value) },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field label="Default capacity per city" hint="New schedules start with this number of seats.">
                <TextInput
                  type="number"
                  min={0}
                  value={ticketEditor.draft.default_capacity}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current
                        ? { ...current, draft: { ...current.draft, default_capacity: Number(e.target.value) } }
                        : current,
                    )
                  }
                />
              </Field>
              <Field
                label="Pass days"
                hint="How many event days this ticket admits. One entry per day — 1 for a single day, 3 for the full expo."
              >
                <TextInput
                  type="number"
                  min={1}
                  max={60}
                  value={ticketEditor.draft.valid_days}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, valid_days: Math.max(1, Number(e.target.value) || 1) },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Badge (EN)">
                  <TextInput
                    value={ticketEditor.draft.badge_en}
                    onChange={(e) =>
                      setTicketEditor((current) =>
                        current ? { ...current, draft: { ...current.draft, badge_en: e.target.value } } : current,
                      )
                    }
                  />
                </Field>
                <Field label="Badge (हिं)">
                  <TextInput
                    value={ticketEditor.draft.badge_hi}
                    onChange={(e) =>
                      setTicketEditor((current) =>
                        current ? { ...current, draft: { ...current.draft, badge_hi: e.target.value } } : current,
                      )
                    }
                  />
                </Field>
              </div>
              <Field label="Description (English)" className="sm:col-span-2">
                <TextArea
                  value={ticketEditor.draft.description_en}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, description_en: e.target.value } } : current,
                    )
                  }
                />
              </Field>
              <Field label="Description (हिंदी)" className="sm:col-span-2">
                <TextArea
                  value={ticketEditor.draft.description_hi}
                  onChange={(e) =>
                    setTicketEditor((current) =>
                      current ? { ...current, draft: { ...current.draft, description_hi: e.target.value } } : current,
                    )
                  }
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Inclusions</p>
              <div className="rounded-xl border border-line bg-sandal-2/60 p-3">
                <LocalizedListEditor
                  items={ticketEditor.draft.inclusions}
                  onChange={(inclusions) =>
                    setTicketEditor((current) => (current ? { ...current, draft: { ...current.draft, inclusions } } : current))
                  }
                  addLabel="Add inclusion"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Price by date</p>
              <div className="rounded-xl border border-line bg-sandal-2/60 p-3">
                <p className="text-[0.72rem] leading-relaxed text-muted">
                  Each dated price replaces the ticket price from that day onwards, so prices can rise as the event
                  nears. The site and checkout both use today&apos;s dated price.
                </p>
                <ul className="mt-2.5 divide-y divide-line/70">
                  {editorSlabs.map((slab) => (
                    <li key={slab.id} className="flex items-start justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="font-display text-base text-ink">{formatRupees(Number(slab.price))}</span>
                        <span className="ml-2 font-ui text-[0.68rem] text-muted">from {slab.effective_from}</span>
                        {(slab.label_en || slab.label_hi) && (
                          <span className="block truncate text-[0.66rem] text-muted">{slab.label_en || slab.label_hi}</span>
                        )}
                      </span>
                      <button
                        onClick={() => void removeSlab(slab.id)}
                        disabled={slabBusy}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                        aria-label={`Remove price from ${slab.effective_from}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                  {editorSlabs.length === 0 && (
                    <li className="py-1.5 text-[0.72rem] text-muted">No dated prices yet — the ticket price applies.</li>
                  )}
                </ul>
                {ticketEditor.mode === 'edit' ? (
                  <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_1.6fr_auto]">
                    <TextInput
                      type="date"
                      aria-label="Price starts from"
                      value={slabDraft.effective_from}
                      onChange={(e) => setSlabDraft((current) => ({ ...current, effective_from: e.target.value }))}
                    />
                    <TextInput
                      type="number"
                      min={0}
                      aria-label="Price"
                      placeholder="₹ price"
                      value={slabDraft.price || ''}
                      onChange={(e) => setSlabDraft((current) => ({ ...current, price: Number(e.target.value) }))}
                    />
                    <TextInput
                      aria-label="Label"
                      placeholder="Label (optional)"
                      value={slabDraft.label_en}
                      onChange={(e) => setSlabDraft((current) => ({ ...current, label_en: e.target.value }))}
                    />
                    <Button tone="ghost" onClick={() => void saveSlab()} disabled={slabBusy}>
                      <Plus size={14} /> {slabBusy ? 'Saving…' : 'Add'}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-line pt-3 text-[0.7rem] text-muted">
                    Save the ticket first, then reopen it to add dated prices.
                  </p>
                )}
              </div>
            </div>

            <Toggle
              checked={Boolean(ticketEditor.draft.active)}
              onChange={(active) =>
                setTicketEditor((current) =>
                  current ? { ...current, draft: { ...current.draft, active: active ? 1 : 0 } } : current,
                )
              }
              label="Ticket is on sale"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
