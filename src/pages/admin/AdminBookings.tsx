import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  FilterX,
  Gift,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldOff,
  Users,
  XCircle,
} from 'lucide-react';
import {
  adminAmendBooking,
  adminAmendOptions,
  adminBookings,
  adminCancelBooking,
  adminCancelSeats,
  adminCreateEntryBlock,
  adminDownloadBookings,
  adminEntryBlocks,
  adminEvents,
  adminIssueBooking,
  adminLocations,
  adminRefundBooking,
  adminResendPass,
  adminSchedules,
  adminSetEntryBlock,
  adminUpdateBooking,
  type AdminBooking,
  type AdminSchedule,
  type AdminState,
  type AmendOptions,
  type BookingFilters,
  type BookingSummary,
  type EntryBlock,
  type EventRow,
} from '@/lib/adminApi';
import { formatRupees } from '@/lib/pricing';
import {
  Button,
  Empty,
  Field,
  Modal,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Select,
  Spinner,
  Stat,
  StatusChip,
  TextArea,
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

const GUEST_CATEGORIES = ['visitor', 'vip', 'press', 'organiser', 'staff', 'other'] as const;
type GuestCategory = (typeof GUEST_CATEGORIES)[number];

const GUEST_LABELS: Record<GuestCategory, string> = {
  visitor: 'Visitor',
  vip: 'VIP',
  press: 'Press',
  organiser: 'Organiser',
  staff: 'Staff',
  other: 'Other',
};

const CATEGORY_STYLES: Record<GuestCategory, string> = {
  visitor: 'border-line bg-sandal-2 text-muted',
  vip: 'border-amber-200 bg-amber-50 text-amber-700',
  press: 'border-sky/25 bg-sky/10 text-sky-dark',
  organiser: 'border-saffron/25 bg-saffron/10 text-saffron-ink',
  staff: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  other: 'border-line bg-white text-muted',
};

interface RosterRow {
  name: string;
  phone: string;
  email: string;
}

const EMPTY_ROSTER: RosterRow = { name: '', phone: '', email: '' };

const phoneOk = (value: string) => /^[6-9]\d{9}$/.test(value.trim());
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function resizeRoster(rows: RosterRow[], count: number): RosterRow[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => rows[index] ?? { ...EMPTY_ROSTER });
}

function rosterForBooking(booking: AdminBooking): RosterRow[] {
  const existing = [...(booking.attendees ?? [])].sort((a, b) => a.position - b.position).slice(1);
  return resizeRoster(
    existing.map((attendee) => ({
      name: attendee.name,
      phone: attendee.phone,
      email: attendee.email ?? '',
    })),
    Math.max(0, Number(booking.qty) - 1),
  );
}

function CategoryChip({ category }: { category: GuestCategory }) {
  if (category === 'visitor') return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-ui text-[0.58rem] font-semibold uppercase tracking-[0.1em] ${CATEGORY_STYLES[category]}`}
    >
      {GUEST_LABELS[category]}
    </span>
  );
}

function defaultIssueSchedule(schedules: AdminSchedule[]) {
  return schedules.find((schedule) => schedule.active === 1 && schedule.capacities.length > 0) ?? null;
}

function IssuePassDialog({
  open,
  schedules,
  onClose,
  onIssued,
}: {
  open: boolean;
  schedules: AdminSchedule[];
  onClose: () => void;
  onIssued: () => void;
}) {
  const [scheduleId, setScheduleId] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState<GuestCategory>('vip');
  const [note, setNote] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ reference: string; email: string } | null>(null);

  const resetDraft = useCallback(() => {
    const first = defaultIssueSchedule(schedules);
    setScheduleId(first ? String(first.id) : '');
    setTicketTypeId(first?.capacities[0] ? String(first.capacities[0].ticket_type_id) : '');
    setName('');
    setEmail('');
    setPhone('');
    setQty(1);
    setCategory('vip');
    setNote('');
    setRoster([]);
    setError('');
    setIssued(null);
  }, [schedules]);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, resetDraft]);

  const schedule = schedules.find((candidate) => String(candidate.id) === scheduleId) ?? null;

  const changeSchedule = (value: string) => {
    setScheduleId(value);
    const next = schedules.find((candidate) => String(candidate.id) === value);
    setTicketTypeId(next?.capacities[0] ? String(next.capacities[0].ticket_type_id) : '');
  };

  const changeQty = (value: number) => {
    const next = Math.max(1, Math.min(20, Number.isFinite(value) ? Math.round(value) : 1));
    setQty(next);
    setRoster((rows) => resizeRoster(rows, next - 1));
  };

  const ticketOptions = schedule?.capacities ?? [];
  const activeSchedules = schedules.filter((candidate) => candidate.active === 1);

  const submit = async () => {
    if (!schedule) {
      setError('Choose the city and date this pass is for.');
      return;
    }
    if (!ticketTypeId) {
      setError('Choose the pass type.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Enter the devotee’s full name.');
      return;
    }
    if (!emailOk(email)) {
      setError('Enter a valid email address — the QR pass is mailed to it.');
      return;
    }
    if (!phoneOk(phone)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    for (let index = 0; index < roster.length; index += 1) {
      const person = roster[index];
      if (person.name.trim().length < 2) {
        setError(`Enter the full name for attendee ${index + 2}.`);
        return;
      }
      if (!phoneOk(person.phone)) {
        setError(`Enter a valid 10-digit mobile number for attendee ${index + 2}.`);
        return;
      }
      if (person.email.trim() && !emailOk(person.email)) {
        setError(`The email for attendee ${index + 2} is not valid.`);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const result = await adminIssueBooking({
        scheduleId: Number(scheduleId),
        ticketTypeId: Number(ticketTypeId),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        qty,
        guestCategory: category,
        note: note.trim() || undefined,
        attendees: roster.map((person) => ({
          name: person.name.trim(),
          phone: person.phone.trim(),
          email: person.email.trim() || undefined,
        })),
      });
      setIssued({ reference: result.pass.reference, email: email.trim() });
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue the pass.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="Issue a free pass"
      subtitle="The pass is created as paid at ₹0, a QR is emailed to the buyer and every attendee with an email, and the gate accepts the normal rules."
      wide
      footer={
        issued ? (
          <div className="flex items-center justify-end gap-2">
            <Button tone="ghost" onClick={resetDraft}>
              Issue another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button tone="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving || activeSchedules.length === 0}>
              {saving ? 'Issuing…' : 'Issue free pass'}
            </Button>
          </div>
        )
      }
    >
      {issued ? (
        <div className="space-y-4">
          <Notice tone="success">
            Free pass <span className="font-mono font-semibold">{issued.reference}</span> issued. The QR pass is
            emailed to <span className="font-semibold">{issued.email}</span> and to every attendee who has an
            email address. It also appears in the booking register immediately.
          </Notice>
          <p className="text-xs leading-relaxed text-muted">
            If SMTP is not configured on the server, the email is recorded in the Email &amp; OTP log instead of
            being delivered. The pass can still be scanned at the gate.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          {activeSchedules.length === 0 ? (
            <Notice tone="info">
              No active schedule has ticket capacity open yet. Create a schedule with capacity before issuing
              passes.
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City, venue & date">
              <Select value={scheduleId} onChange={(event) => changeSchedule(event.target.value)}>
                {activeSchedules.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.event_en} · {candidate.venue_en}, {candidate.city_en} · {formatDay(candidate.event_date)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pass type" hint="Only pass types open for this schedule are listed">
              <Select value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)}>
                {ticketOptions.length === 0 && <option value="">No pass types open</option>}
                {ticketOptions.map((ticket) => (
                  <option key={ticket.ticket_type_id} value={ticket.ticket_type_id}>
                    {ticket.ticket_en} · {Math.max(0, ticket.capacity - ticket.sold)} of {ticket.capacity} left
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guest category" hint="The gate scanner shows this badge to the staff">
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as GuestCategory)}
              >
                {GUEST_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {GUEST_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seats on this pass" hint="Names and mobiles are collected for every extra seat">
              <TextInput
                type="number"
                min={1}
                max={20}
                value={qty}
                onChange={(event) => changeQty(Number(event.target.value))}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-line bg-white p-4">
            <p className="mb-3 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Primary devotee</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Full name">
                <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="As per ID" />
              </Field>
              <Field label="Mobile number">
                <TextInput
                  value={phone}
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Email" hint="QR pass is emailed here">
                <TextInput
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            </div>
          </div>

          {qty > 1 && (
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="mb-3 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">
                Other attendees ({qty - 1})
              </p>
              <div className="space-y-3">
                {roster.map((person, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr]">
                    <TextInput
                      value={person.name}
                      onChange={(event) =>
                        setRoster((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, name: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder={`Attendee ${index + 2} name`}
                    />
                    <TextInput
                      value={person.phone}
                      onChange={(event) =>
                        setRoster((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }
                              : row,
                          ),
                        )
                      }
                      placeholder="Mobile"
                      inputMode="numeric"
                    />
                    <TextInput
                      type="email"
                      value={person.email}
                      onChange={(event) =>
                        setRoster((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, email: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Email (optional)"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[0.68rem] text-muted">
                Every attendee with an email receives their own copy of the QR pass.
              </p>
            </div>
          )}

          <Field label="Internal note" hint="Visible only in the admin panel">
            <TextArea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={255}
              placeholder="e.g. Chief guest, invited by the trust"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function EditBookingDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<GuestCategory>('visitor');
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState('0');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!booking) return;
    setCategory((booking.guest_category || 'visitor') as GuestCategory);
    setNote(booking.admin_note ?? '');
    setDiscount(String(Number(booking.discount_amount) || 0));
    setRoster(rosterForBooking(booking));
    setError('');
  }, [booking]);

  if (!booking) return null;

  const gross = Number(booking.gross_amount ?? Number(booking.unit_price) * Number(booking.qty));
  const pending = booking.status === 'pending';
  const payable = Math.max(0, gross - (Number(discount) || 0));

  const submit = async () => {
    if (Number(discount) > gross) {
      setError(`The discount cannot exceed the ₹${gross.toLocaleString('en-IN')} fare.`);
      return;
    }
    for (let index = 0; index < roster.length; index += 1) {
      const person = roster[index];
      if (person.name.trim().length < 2) {
        setError(`Enter the full name for attendee ${index + 2}.`);
        return;
      }
      if (!phoneOk(person.phone)) {
        setError(`Enter a valid 10-digit mobile number for attendee ${index + 2}.`);
        return;
      }
      if (person.email.trim() && !emailOk(person.email)) {
        setError(`The email for attendee ${index + 2} is not valid.`);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      await adminUpdateBooking(booking.id, {
        guestCategory: category,
        adminNote: note.trim() || null,
        ...(pending ? { discountAmount: Math.max(0, Number(discount) || 0) } : {}),
        ...(booking.qty > 1
          ? {
              attendees: roster.map((person) => ({
                name: person.name.trim(),
                phone: person.phone.trim(),
                email: person.email.trim() || undefined,
              })),
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the booking.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={`Edit ${booking.reference}`}
      subtitle="Category, roster and internal note can change any time. Re-pricing works only while the booking is unpaid."
      wide
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <p className="font-ui font-semibold text-ink">{booking.name}</p>
          <p className="text-[0.72rem] text-muted">
            {booking.phone} · {booking.email}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted">
            {booking.event_en} · {booking.ticket_en} · {formatDay(booking.event_date)} · {booking.qty} seat
            {booking.qty === 1 ? '' : 's'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest category" hint="Shown on the gate scanner">
            <Select value={category} onChange={(event) => setCategory(event.target.value as GuestCategory)}>
              {GUEST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {GUEST_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Discount (₹)"
            hint={pending ? `Fare ₹${gross.toLocaleString('en-IN')} · payable ₹${payable.toLocaleString('en-IN')}` : 'Only unpaid bookings can be re-priced'}
          >
            <TextInput
              type="number"
              min={0}
              max={gross}
              value={discount}
              disabled={!pending}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </Field>
        </div>

        {booking.coupon_code && (
          <Notice tone="info">
            Coupon {booking.coupon_code} already gives {formatRupees(Number(booking.discount_amount) || 0)} off this
            booking. Changing the discount replaces the stored amount.
          </Notice>
        )}

        {booking.qty > 1 && (
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="mb-3 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">
              Other attendees ({booking.qty - 1})
            </p>
            <div className="space-y-3">
              {roster.map((person, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr]">
                  <TextInput
                    value={person.name}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, name: event.target.value } : row,
                        ),
                      )
                    }
                    placeholder={`Attendee ${index + 2} name`}
                  />
                  <TextInput
                    value={person.phone}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index
                            ? { ...row, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }
                            : row,
                        ),
                      )
                    }
                    placeholder="Mobile"
                    inputMode="numeric"
                  />
                  <TextInput
                    type="email"
                    value={person.email}
                    onChange={(event) =>
                      setRoster((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, email: event.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Email (optional)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Field label="Internal note" hint="Visible only in the admin panel">
          <TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={255} />
        </Field>
      </div>
    </Modal>
  );
}

function BlockEntryDialog({
  open,
  seed,
  events,
  onClose,
  onSaved,
}: {
  open: boolean;
  seed: AdminBooking | null;
  events: EventRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reference, setReference] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'all_events' | 'event'>('all_events');
  const [eventId, setEventId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setReference(seed?.reference ?? '');
    setName(seed?.name ?? '');
    setEmail(seed?.email ?? '');
    setPhone(seed?.phone ?? '');
    setReason('');
    setScope('all_events');
    setEventId(seed?.event_id ? String(seed.event_id) : '');
    setError('');
  }, [open, seed]);

  const submit = async () => {
    if (!reference.trim() && !email.trim() && !phone.trim()) {
      setError('Give the booking reference, email or mobile number to block.');
      return;
    }
    if (email.trim() && !emailOk(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (phone.trim() && !phoneOk(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Write a short reason for the block.');
      return;
    }
    if (scope === 'event' && !eventId) {
      setError('Choose the event this block applies to.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await adminCreateEntryBlock({
        reference: reference.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        name: name.trim() || undefined,
        reason: reason.trim(),
        scope,
        eventId: scope === 'event' ? Number(eventId) : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block this person.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={seed ? `Block entry — ${seed.reference}` : 'Block a person at the gate'}
      subtitle="A blocked person is refused even with a valid paid pass. Matching is on the booking, email or mobile number."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button tone="danger" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Blocking…' : 'Block entry'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Booking reference" hint="Optional when email or mobile is given">
            <TextInput
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase())}
              placeholder="AB26-XXXXXX"
              maxLength={20}
            />
          </Field>
          <Field label="Name" hint="For the block register only">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Mobile number">
            <TextInput
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile"
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Reason" hint="Recorded in the audit log and shown in the block register">
          <TextArea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={255}
            placeholder="e.g. Pass shared with another person, entry refused"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Applies to">
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as 'all_events' | 'event')}
            >
              <option value="all_events">All events</option>
              <option value="event">One event</option>
            </Select>
          </Field>
          {scope === 'event' && (
            <Field label="Event">
              <Select value={eventId} onChange={(event) => setEventId(event.target.value)}>
                <option value="">Choose event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name_en}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ResendPassDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!booking) return;
    setEmail(booking.email);
    setError('');
  }, [booking]);

  if (!booking) return null;

  const submit = async () => {
    if (!emailOk(email)) {
      setError('Enter a valid email address for the pass.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const corrected = email.trim().toLowerCase() !== booking.email.trim().toLowerCase();
      const result = await adminResendPass(booking.id, corrected ? email.trim() : undefined);
      onSaved(
        result.delivered
          ? `The existing pass and PDF were resent to ${result.to}.`
          : 'SMTP is not configured on this server, so the pass was logged instead of emailed. Add the SMTP settings in .env to deliver it.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the pass.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={sending ? () => undefined : onClose}
      title={`Resend pass — ${booking.reference}`}
      subtitle="Sends the same QR and PDF pass that was already issued. This does not create a new booking or a free pass."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button onClick={() => void submit()} disabled={sending}>
            <Send size={13} /> {sending ? 'Sending…' : 'Resend pass'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <p className="font-ui font-semibold text-ink">{booking.name}</p>
          <p className="text-[0.72rem] text-muted">
            {booking.event_en} · {booking.ticket_en} · {formatDay(booking.event_date)}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted">
            Last sent: {booking.pass_sent_at ? formatDateTime(booking.pass_sent_at) : 'not recorded'}
          </p>
        </div>

        <Field
          label="Send to"
          hint="Change this only if the devotee gave a corrected email address"
        >
          <TextInput
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AmendBookingDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [options, setOptions] = useState<AmendOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [qty, setQty] = useState(1);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [reason, setReason] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!booking) return;
    setOptions(null);
    setLoadError('');
    setError('');
    setReason('');
    setPaymentReference('');
    setRefundAmount('');
    setRefundReference('');
    setQty(Number(booking.qty));
    setRoster(rosterForBooking(booking));
    setLoading(true);
    adminAmendOptions(booking.id)
      .then((result) => {
        setOptions(result);
        setScheduleId(String(result.booking.scheduleId));
        setTicketTypeId(String(result.booking.ticketTypeId));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load change options.'))
      .finally(() => setLoading(false));
  }, [booking]);

  const selectedSchedule = options?.schedules.find((item) => String(item.scheduleId) === scheduleId) ?? null;
  const selectedTicket =
    selectedSchedule?.tickets.find((item) => String(item.ticketTypeId) === ticketTypeId) ?? null;
  const discount = options ? Math.min(options.booking.discountAmount, (selectedTicket?.price ?? 0) * qty) : 0;
  const newAmount = options && selectedTicket ? selectedTicket.price * qty - discount : 0;
  const difference = options ? newAmount - options.booking.amount : 0;
  const refundValue = Math.max(0, Math.floor(Number(refundAmount) || 0));

  useEffect(() => {
    // A cheaper pass releases money; default the refund to the full release so nothing is forgotten.
    if (difference < 0) setRefundAmount(String(-difference));
    else setRefundAmount('');
  }, [difference]);

  if (!booking) return null;

  const changeQty = (value: number) => {
    const next = Math.max(1, Math.min(20, Number.isFinite(value) ? Math.round(value) : 1));
    setQty(next);
    setRoster((rows) => resizeRoster(rows, next - 1));
  };

  const submit = async () => {
    if (!options || !selectedSchedule || !selectedTicket) {
      setError('Choose the city, date and ticket for the updated pass.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Write a short reason for the change.');
      return;
    }
    if (qty > selectedTicket.left) {
      setError(`Only ${selectedTicket.left} seat(s) left for that ticket.`);
      return;
    }
    if (difference > 0 && !paymentReference.trim()) {
      setError(
        `The updated pass costs ₹${difference.toLocaleString('en-IN')} more. Collect the difference and enter its payment reference.`,
      );
      return;
    }
    if (difference < 0 && refundValue > -difference) {
      setError(`The refund cannot exceed ₹${(-difference).toLocaleString('en-IN')} released by this change.`);
      return;
    }
    for (let index = 0; index < roster.length; index += 1) {
      const person = roster[index];
      if (person.name.trim().length < 2) {
        setError(`Enter the full name for attendee ${index + 2}.`);
        return;
      }
      if (!phoneOk(person.phone)) {
        setError(`Enter a valid 10-digit mobile number for attendee ${index + 2}.`);
        return;
      }
      if (person.email.trim() && !emailOk(person.email)) {
        setError(`The email for attendee ${index + 2} is not valid.`);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const result = await adminAmendBooking(booking.id, {
        scheduleId: selectedSchedule.scheduleId,
        ticketTypeId: selectedTicket.ticketTypeId,
        qty,
        reason: reason.trim(),
        paymentReference: paymentReference.trim() || undefined,
        refundAmount: difference < 0 ? refundValue : undefined,
        refundReference: difference < 0 ? refundReference.trim() || undefined : undefined,
        attendees: roster.map((person) => ({
          name: person.name.trim(),
          phone: person.phone.trim(),
          email: person.email.trim() || undefined,
        })),
      });
      const money = (value: number) => `₹${Math.abs(value).toLocaleString('en-IN')}`;
      onSaved(
        result.difference > 0
          ? `${booking.reference} updated. ${money(result.difference)} extra recorded and a new QR was reissued.`
          : result.difference < 0
            ? result.refundRecorded > 0
              ? `${booking.reference} updated. ${money(result.refundRecorded)} refund recorded against the lower fare and a new QR was reissued.`
              : `${booking.reference} updated. The fare is ${money(result.difference)} lower; no refund recorded, so that amount stays with the organisation.`
            : `${booking.reference} updated and a new QR was reissued.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change this booking.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={`Change booking — ${booking.reference}`}
      subtitle="Move the pass to another city or date, change the ticket or seat count. A new QR is issued and the old pass stops working."
      wide
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={() => void submit()} disabled={saving || loading || !options}>
            {saving ? 'Reissuing…' : 'Save & reissue pass'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        {loadError && <Notice tone="error">{loadError}</Notice>}
        {loading && <Spinner label="Loading available cities and fares" />}

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <p className="font-ui font-semibold text-ink">{booking.name}</p>
          <p className="mt-1 text-[0.72rem] text-muted">
            {booking.event_en} · {booking.ticket_en} · {formatDay(booking.event_date)} · {booking.qty} seat
            {booking.qty === 1 ? '' : 's'} · paid {formatRupees(Number(booking.amount))}
          </p>
        </div>

        {options && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City & date">
                <Select
                  value={scheduleId}
                  onChange={(event) => {
                    setScheduleId(event.target.value);
                    const next = options.schedules.find((item) => String(item.scheduleId) === event.target.value);
                    setTicketTypeId(next?.tickets[0] ? String(next.tickets[0].ticketTypeId) : '');
                  }}
                >
                  {options.schedules.map((item) => (
                    <option key={item.scheduleId} value={item.scheduleId}>
                      {item.city_en} · {formatDay(item.eventDate)} · {item.venue_en}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ticket" hint={selectedTicket ? `${selectedTicket.left} seat(s) left` : undefined}>
                <Select
                  value={ticketTypeId}
                  onChange={(event) => setTicketTypeId(event.target.value)}
                >
                  {(selectedSchedule?.tickets ?? []).map((ticket) => (
                    <option key={ticket.ticketTypeId} value={ticket.ticketTypeId}>
                      {ticket.name_en} · {formatRupees(ticket.price)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Seats" hint="1 to 20">
                <TextInput
                  type="number"
                  min={1}
                  max={20}
                  value={qty}
                  onChange={(event) => changeQty(Number(event.target.value))}
                />
              </Field>
              <Field label="Reason" hint="Recorded in the audit log">
                <TextInput
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={255}
                  placeholder="e.g. Devotee moved to the Pune date"
                />
              </Field>
            </div>

            {selectedTicket && (
              <div className="rounded-xl border border-line bg-sandal-2/40 px-4 py-3 text-[0.76rem]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    New fare: {formatRupees(selectedTicket.price)} × {qty}
                    {discount > 0 ? ` − ${formatRupees(discount)} discount` : ''}
                  </span>
                  <span className="font-ui font-semibold text-ink">{formatRupees(Math.max(0, newAmount))}</span>
                </div>
                <p className="mt-1 font-ui font-semibold">
                  {difference > 0 ? (
                    <span className="text-amber-700">
                      Collect {formatRupees(difference)} extra from the devotee.
                    </span>
                  ) : difference < 0 ? (
                    <span className="text-emerald-700">
                      {formatRupees(Math.abs(difference))} lower than the amount paid — record the refund below.
                    </span>
                  ) : (
                    <span className="text-muted">No payment difference.</span>
                  )}
                </p>
                {selectedTicket.passDays > 1 && (
                  <p className="mt-1 text-muted">
                    Pass duration: {selectedTicket.passDays} days for this city.
                  </p>
                )}
              </div>
            )}

            {difference > 0 && (
              <Field
                label="Payment reference for the difference"
                hint="Required — UPI / bank UTR / cash receipt number"
              >
                <TextInput
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  maxLength={120}
                  placeholder="e.g. UPI 1234567890"
                />
              </Field>
            )}

            {difference < 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Refund amount (₹)"
                  hint={`This change releases ${formatRupees(-difference)}. Set 0 to keep it as a cancellation fee.`}
                >
                  <TextInput
                    type="number"
                    min={0}
                    max={-difference}
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                  />
                </Field>
                <Field label="Refund reference" hint="UPI / bank UTR / Razorpay refund ID">
                  <TextInput
                    value={refundReference}
                    onChange={(event) => setRefundReference(event.target.value)}
                    maxLength={120}
                    placeholder="Optional"
                  />
                </Field>
              </div>
            )}

            {qty > 1 && (
              <div className="rounded-xl border border-line bg-white p-4">
                <p className="mb-3 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">
                  Other attendees ({qty - 1})
                </p>
                <div className="space-y-3">
                  {roster.map((person, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr]">
                      <TextInput
                        value={person.name}
                        onChange={(event) =>
                          setRoster((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, name: event.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Full name"
                      />
                      <TextInput
                        value={person.phone}
                        onChange={(event) =>
                          setRoster((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }
                                : row,
                            ),
                          )
                        }
                        placeholder="Mobile"
                        inputMode="numeric"
                      />
                      <TextInput
                        type="email"
                        value={person.email}
                        onChange={(event) =>
                          setRoster((rows) =>
                            rows.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, email: event.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Email (optional)"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function CancelRefundDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: AdminBooking | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [mode, setMode] = useState<'all' | 'seats'>('all');
  const [seats, setSeats] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('0');
  const [refundReference, setRefundReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refundOnly = booking?.status === 'cancelled';

  useEffect(() => {
    if (!booking) return;
    setMode('all');
    setSeats(1);
    setSelected([]);
    setReason('');
    setRefundAmount(
      booking.status === 'paid' && Number(booking.amount) > 0 ? String(Number(booking.amount)) : '0',
    );
    setRefundReference('');
    setError('');
  }, [booking]);

  if (!booking) return null;

  const paidAmount = Number(booking.amount) || 0;
  const totalSeats = Number(booking.qty) || 1;
  const canRefund = booking.status === 'paid' && paidAmount > 0;
  const partialAvailable = booking.status === 'paid' && totalSeats > 1 && !booking.check_in_at;
  const roster = [...(booking.attendees ?? [])]
    .sort((a, b) => a.position - b.position)
    .filter((person) => person.position > 1);
  const usingRoster = roster.length > 0;
  const cancelledQty = mode === 'seats' ? (usingRoster ? selected.length : seats) : totalSeats;

  /** Fare held by the pass after `count` seats leave; the difference is what can go back. */
  const releaseFor = (count: number) => {
    if (count <= 0) return 0;
    const left = totalSeats - count;
    const gross = Number(booking.unit_price) * left;
    const discount = Math.min(Number(booking.discount_amount || 0), gross);
    return Math.max(0, paidAmount - (gross - discount));
  };
  const released = mode === 'seats' ? releaseFor(cancelledQty) : paidAmount;
  const refundValue = Math.max(0, Math.floor(Number(refundAmount) || 0));

  const toggleSeat = (position: number) => {
    const picked = selected.includes(position);
    if (!picked && selected.length >= totalSeats - 1) {
      setError('Keep at least one seat on the pass. Use “Whole booking” to cancel every seat.');
      return;
    }
    setError('');
    const next = picked
      ? selected.filter((value) => value !== position)
      : [...selected, position];
    setSelected(next);
    setRefundAmount(String(releaseFor(next.length)));
  };

  const changeSeats = (value: number) => {
    const next = Math.max(1, Math.min(totalSeats - 1, Math.floor(value) || 1));
    setSeats(next);
    setRefundAmount(String(releaseFor(next)));
  };

  const startPartial = () => {
    setMode('seats');
    setError('');
    setRefundAmount(String(releaseFor(usingRoster ? selected.length : seats)));
  };

  const startWhole = () => {
    setMode('all');
    setError('');
    setRefundAmount(String(paidAmount));
  };

  const submit = async () => {
    setError('');
    if (refundOnly) {
      if (refundValue <= 0) {
        setError('Enter the refund amount being returned.');
        return;
      }
      if (refundValue > paidAmount) {
        setError(`The refund cannot exceed the paid amount of ₹${paidAmount.toLocaleString('en-IN')}.`);
        return;
      }
      setSaving(true);
      try {
        await adminRefundBooking(booking.id, {
          refundAmount: refundValue,
          refundReference: refundReference.trim() || undefined,
        });
        onSaved(`Refund of ₹${refundValue.toLocaleString('en-IN')} recorded for ${booking.reference}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not record the refund.');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (reason.trim().length < 3) {
      setError('Write a short cancellation reason.');
      return;
    }

    if (mode === 'seats') {
      if (cancelledQty < 1) {
        setError('Tick the attendees who are leaving, or enter how many seats to cancel.');
        return;
      }
      if (cancelledQty >= totalSeats) {
        setError('That is every seat. Use “Whole booking” to cancel the pass.');
        return;
      }
      if (refundValue > released) {
        setError(`The refund cannot exceed ₹${released.toLocaleString('en-IN')} released by these seats.`);
        return;
      }
      setSaving(true);
      try {
        const result = await adminCancelSeats(booking.id, {
          qty: cancelledQty,
          reason: reason.trim(),
          refundAmount: refundValue,
          refundReference: refundReference.trim() || undefined,
          positions: usingRoster ? selected : undefined,
        });
        onSaved(
          `${result.seatsCancelled} seat${result.seatsCancelled === 1 ? '' : 's'} cancelled on ${booking.reference}. ` +
            `${result.seatsLeft} seat${result.seatsLeft === 1 ? '' : 's'} stay valid` +
            (result.refundRecorded > 0
              ? `, a ₹${result.refundRecorded.toLocaleString('en-IN')} refund is recorded, and the new QR was emailed.`
              : ', and the new QR was emailed.'),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not cancel these seats.');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (canRefund && refundValue > paidAmount) {
      setError(`The refund cannot exceed the paid amount of ₹${paidAmount.toLocaleString('en-IN')}.`);
      return;
    }
    if (!canRefund && refundValue > 0) {
      setError('This booking has no captured payment, so there is nothing to refund.');
      return;
    }

    setSaving(true);
    try {
      await adminCancelBooking(booking.id, {
        reason: reason.trim(),
        refundAmount: refundValue,
        refundReference: refundReference.trim() || undefined,
      });
      onSaved(
        refundValue > 0
          ? `${booking.reference} cancelled and a ₹${refundValue.toLocaleString('en-IN')} refund recorded.`
          : `${booking.reference} cancelled. The QR pass is no longer valid at the gate.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this booking.');
    } finally {
      setSaving(false);
    }
  };

  const footerLabel = saving
    ? 'Saving…'
    : refundOnly
      ? 'Record refund'
      : mode === 'seats'
        ? `Cancel ${cancelledQty} seat${cancelledQty === 1 ? '' : 's'}${refundValue > 0 ? ` & refund ₹${refundValue.toLocaleString('en-IN')}` : ''}`
        : refundValue > 0
          ? `Cancel & refund ₹${refundValue.toLocaleString('en-IN')}`
          : 'Cancel booking';

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={
        refundOnly
          ? `Record refund — ${booking.reference}`
          : mode === 'seats'
            ? `Cancel some seats — ${booking.reference}`
            : `Cancel booking — ${booking.reference}`
      }
      subtitle={
        refundOnly
          ? 'This booking is already cancelled. Record the money returned to the devotee.'
          : mode === 'seats'
            ? 'Only the seats you pick are cancelled. The rest of the pass stays valid and a fresh QR is emailed.'
            : 'Cancelling closes the pass and releases its seats. The QR stops working at the gate immediately.'
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button tone="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button
            tone="danger"
            onClick={() => void submit()}
            disabled={saving || (!refundOnly && mode === 'seats' && cancelledQty < 1)}
          >
            {footerLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <p className="font-ui font-semibold text-ink">{booking.name}</p>
          <p className="text-[0.72rem] text-muted">
            {booking.phone} · {booking.email}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted">
            {booking.event_en} · {booking.ticket_en} · {formatDay(booking.event_date)} · {booking.qty} seat
            {booking.qty === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted">
            Paid amount: <span className="font-semibold text-ink">₹{paidAmount.toLocaleString('en-IN')}</span>
          </p>
          {refundOnly && booking.cancel_reason && (
            <p className="mt-1 text-[0.72rem] text-muted">
              Cancellation reason: <span className="text-ink">{booking.cancel_reason}</span>
            </p>
          )}
        </div>

        {partialAvailable && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={startWhole}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                mode === 'all'
                  ? 'border-saffron bg-saffron/5 text-ink'
                  : 'border-line bg-white text-muted hover:border-saffron/40'
              }`}
            >
              <span className="block font-ui text-[0.82rem] font-semibold">Whole booking</span>
              <span className="block text-[0.68rem]">Every seat goes back on sale</span>
            </button>
            <button
              type="button"
              onClick={startPartial}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                mode === 'seats'
                  ? 'border-saffron bg-saffron/5 text-ink'
                  : 'border-line bg-white text-muted hover:border-saffron/40'
              }`}
            >
              <span className="block font-ui text-[0.82rem] font-semibold">Some seats</span>
              <span className="block text-[0.68rem]">Cancel {totalSeats - 1 <= 1 ? 'a seat' : 'part of the group'} and keep the rest</span>
            </button>
          </div>
        )}

        {mode === 'all' && !refundOnly && (
          <Notice tone="info">
            The devotee receives a cancellation email. If a refund is recorded, the email says it will reach
            them within 15 working days, as promised in the refund policy.
          </Notice>
        )}

        {mode === 'seats' && (
          <div className="rounded-xl border border-line bg-white p-4">
            <p className="mb-2 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">
              Who is leaving? ({cancelledQty} of {totalSeats - 1} selectable)
            </p>
            {usingRoster ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line bg-sandal-2/40 px-3 py-2">
                  <span className="font-ui text-[0.78rem] font-semibold text-ink">
                    {booking.name}
                    <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 font-ui text-[0.54rem] uppercase tracking-[0.1em] text-muted">
                      Primary · stays
                    </span>
                  </span>
                  <span className="text-[0.68rem] text-muted">{booking.phone}</span>
                </div>
                {roster.map((person) => (
                  <label
                    key={person.position}
                    className={`flex cursor-pointer flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2 ${
                      selected.includes(person.position)
                        ? 'border-red-300 bg-red-50/60'
                        : 'border-line bg-white hover:border-saffron/40'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(person.position)}
                        onChange={() => toggleSeat(person.position)}
                        className="h-4 w-4 accent-red-600"
                      />
                      <span className="font-ui text-[0.78rem] font-semibold text-ink">{person.name}</span>
                    </span>
                    <span className="text-[0.68rem] text-muted">{person.phone}</span>
                  </label>
                ))}
              </div>
            ) : (
              <Field label="Seats to cancel" hint={`1 to ${totalSeats - 1}`}>
                <TextInput
                  type="number"
                  min={1}
                  max={totalSeats - 1}
                  value={seats}
                  onChange={(event) => changeSeats(Number(event.target.value))}
                />
              </Field>
            )}
            <p className="mt-2 text-[0.72rem] text-muted">
              Fare released by these seats:{' '}
              <span className="font-semibold text-ink">{formatRupees(released)}</span> · the pass keeps{' '}
              {formatRupees(paidAmount - released)} for {totalSeats - cancelledQty} seat
              {totalSeats - cancelledQty === 1 ? '' : 's'}.
            </p>
          </div>
        )}

        {!refundOnly && (
          <Field label="Cancellation reason" hint="Stored in the audit log and sent to the devotee">
            <TextArea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={255}
              placeholder={
                mode === 'seats'
                  ? 'e.g. Four devotees from this group cannot travel'
                  : 'e.g. Devotee requested cancellation on phone'
              }
            />
          </Field>
        )}

        {(canRefund || refundOnly) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Refund amount (₹)"
              hint={
                refundOnly
                  ? `Paid amount ₹${paidAmount.toLocaleString('en-IN')}`
                  : mode === 'seats'
                    ? `Up to ${formatRupees(released)} released by these seats. Set 0 to keep it as a cancellation fee.`
                    : 'Set 0 to cancel without a refund; you can record it later from this row.'
              }
            >
              <TextInput
                type="number"
                min={refundOnly ? 1 : 0}
                max={refundOnly || mode === 'all' ? paidAmount : released}
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </Field>
            <Field label="Refund reference" hint="UPI / bank UTR / Razorpay refund ID">
              <TextInput
                value={refundReference}
                onChange={(event) => setRefundReference(event.target.value)}
                maxLength={120}
                placeholder="Optional"
              />
            </Field>
          </div>
        )}

        {!canRefund && !refundOnly && (
          <Notice tone="info">No payment was captured on this booking, so no refund is due.</Notice>
        )}
      </div>
    </Modal>
  );
}

export default function AdminBookings() {
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [states, setStates] = useState<AdminState[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [blocks, setBlocks] = useState<EntryBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [busyBlockId, setBusyBlockId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<AdminBooking | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [resendingBooking, setResendingBooking] = useState<AdminBooking | null>(null);
  const [amendingBooking, setAmendingBooking] = useState<AdminBooking | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockSeed, setBlockSeed] = useState<AdminBooking | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const requestId = useRef(0);

  useEffect(() => {
    void Promise.all([adminLocations(), adminEvents(), adminSchedules()])
      .then(([locationResult, eventResult, scheduleResult]) => {
        setStates(locationResult.states);
        setEvents(eventResult.events);
        setSchedules(scheduleResult.schedules);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load filters.'));
  }, []);

  const loadBlocks = useCallback(async (showSpinner = true) => {
    if (showSpinner) setBlocksLoading(true);
    try {
      const result = await adminEntryBlocks(includeRevoked);
      setBlocks(result.blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the block register.');
    } finally {
      setBlocksLoading(false);
    }
  }, [includeRevoked]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

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

  const activeBlocks = useMemo(() => blocks.filter((block) => block.active === 1), [blocks]);

  const blockedBookingIds = useMemo(
    () => new Set(activeBlocks.map((block) => block.booking_id).filter((id): id is number => Boolean(id))),
    [activeBlocks],
  );
  const blockedEmails = useMemo(
    () =>
      new Set(
        activeBlocks
          .map((block) => block.email?.toLowerCase())
          .filter((value): value is string => Boolean(value)),
      ),
    [activeBlocks],
  );
  const blockedPhones = useMemo(
    () => new Set(activeBlocks.map((block) => block.phone).filter((value): value is string => Boolean(value))),
    [activeBlocks],
  );

  const isBlocked = (booking: AdminBooking) =>
    blockedBookingIds.has(booking.id) ||
    blockedEmails.has(booking.email.toLowerCase()) ||
    blockedPhones.has(booking.phone);

  const toggleExpanded = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const toggleBlock = async (block: EntryBlock) => {
    const revoking = block.active === 1;
    if (revoking && !window.confirm(`Revoke the block for ${block.name || block.email || block.phone}? They will be allowed through the gate again.`)) {
      return;
    }
    setBusyBlockId(block.id);
    setError('');
    try {
      await adminSetEntryBlock(block.id, !revoking);
      setNotice(revoking ? 'Block revoked — the pass is accepted at the gate again.' : 'Block reinstated.');
      await loadBlocks(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the block.');
    } finally {
      setBusyBlockId(null);
    }
  };

  const openBlockFrom = (booking: AdminBooking | null) => {
    setBlockSeed(booking);
    setBlockOpen(true);
    setNotice('');
  };

  const totals = summary?.totals;

  return (
    <div>
      <PageHeader
        eyebrow="Reporting"
        title="Bookings & reports"
        subtitle="Filter by state, city, venue, event, ticket, status or check-in. Issue free passes, edit the guest roster, and block entry without leaving the register."
        actions={
          <>
            <Button size="sm" onClick={() => setIssueOpen(true)}>
              <Gift size={14} /> Issue free pass
            </Button>
            <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
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
      {notice && (
        <div className="mb-4">
          <Notice tone="success">{notice}</Notice>
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
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Bookings" value={totals.bookings.toLocaleString('en-IN')} tone="sky" />
          <Stat label="Seats" value={totals.seats.toLocaleString('en-IN')} />
          <Stat label="Collected" value={formatRupees(totals.collected)} tone="sky" />
          <Stat label="Refunds returned" value={formatRupees(totals.refunds)} tone="amber" />
          <Stat label="Net revenue" value={formatRupees(totals.revenue)} tone="lotus" />
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
                    <th className="px-3 py-2.5 text-right">Collected</th>
                    <th className="px-3 py-2.5 text-right">Refunds</th>
                    <th className="px-3 py-2.5 text-right">Net revenue</th>
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
                      <td className="px-3 py-2.5 text-right">{formatRupees(state.collected)}</td>
                      <td className="px-3 py-2.5 text-right text-red-700">
                        {state.refunds > 0 ? formatRupees(state.refunds) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-ink">{formatRupees(state.revenue)}</td>
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
            subtitle="Latest 500 bookings matching the filters. Expand a row for the full roster, or download Excel or PDF for the full report."
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
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {bookings.map((booking) => {
                    const category = (booking.guest_category || 'visitor') as GuestCategory;
                    const roster = [...(booking.attendees ?? [])].sort((a, b) => a.position - b.position);
                    const adjustments = [...(booking.adjustments ?? [])].sort((a, b) => b.id - a.id);
                    const hasMoneyTrail =
                      Number(booking.collected_amount) > 0 ||
                      Number(booking.refunds_total) > 0 ||
                      adjustments.length > 0;
                    const blocked = isBlocked(booking);
                    const closed = booking.status === 'cancelled' || booking.status === 'refunded';
                    const canCancel = !closed && !booking.check_in_at;
                    const canRecordRefund =
                      booking.status === 'cancelled' && Number(booking.amount) > 0 && !booking.check_in_at;
                    const canExpand =
                      roster.length > 1 ||
                      Boolean(booking.admin_note) ||
                      Number(booking.discount_amount) > 0 ||
                      Boolean(booking.coupon_code) ||
                      Boolean(booking.cancelled_at) ||
                      Boolean(booking.terms_accepted_at) ||
                      booking.refund_amount != null ||
                      Number(booking.refunds_total) > 0 ||
                      (booking.adjustments?.length ?? 0) > 0;
                    const open = expanded.has(booking.id);
                    return (
                      <Fragment key={booking.id}>
                        <tr className="align-top hover:bg-sandal-2/30">
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="font-mono text-[0.72rem] tracking-wide text-saffron-ink">{booking.reference}</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <CategoryChip category={category} />
                              {booking.source === 'admin_free' && (
                                <span className="inline-flex items-center rounded-full border border-saffron/25 bg-saffron/10 px-2 py-0.5 font-ui text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-saffron-ink">
                                  Free pass
                                </span>
                              )}
                              {blocked && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-ui text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-red-700">
                                  <Ban size={9} /> Blocked
                                </span>
                              )}
                            </div>
                            {booking.otp_verified_at && (
                              <span className="mt-1 block text-[0.6rem] text-muted">OTP verified</span>
                            )}
                            {booking.terms_accepted_at && (
                              <span className="mt-1 block text-[0.6rem] text-muted">
                                {booking.source === 'online' ? 'Policy accepted' : 'Policy marked accepted'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-ui text-[0.82rem] font-semibold text-ink">{booking.name}</p>
                            <p className="text-[0.66rem] text-muted">{booking.phone}</p>
                            <p className="max-w-[190px] truncate text-[0.66rem] text-muted">{booking.email}</p>
                            {roster.length > 1 && (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(booking.id)}
                                className="mt-1 inline-flex items-center gap-1 font-ui text-[0.64rem] font-semibold text-saffron-ink hover:underline"
                              >
                                <Users size={11} /> Roster · {roster.length}
                              </button>
                            )}
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
                            {Number(booking.discount_amount) > 0 && (
                              <span className="block text-[0.6rem] font-ui font-normal text-emerald-700">
                                {formatRupees(Number(booking.discount_amount))} off
                              </span>
                            )}
                            {Number(booking.refunds_total) > 0 && (
                              <span className="block text-[0.6rem] font-ui font-normal text-red-700">
                                {formatRupees(Number(booking.refunds_total))} refunded
                              </span>
                            )}
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
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {canExpand && (
                                <Button tone="ghost" size="sm" onClick={() => toggleExpanded(booking.id)}>
                                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Details
                                </Button>
                              )}
                              <Button tone="ghost" size="sm" onClick={() => setEditingBooking(booking)}>
                                <Pencil size={12} /> Edit
                              </Button>
                              {booking.status === 'paid' && (
                                <Button
                                  tone="ghost"
                                  size="sm"
                                  title="Resend the existing QR and PDF pass"
                                  onClick={() => setResendingBooking(booking)}
                                >
                                  <Send size={12} /> Resend
                                </Button>
                              )}
                              {booking.status === 'paid' && !booking.check_in_at && (
                                <Button
                                  tone="ghost"
                                  size="sm"
                                  title="Change the city, date, ticket or seat count and reissue the QR"
                                  onClick={() => setAmendingBooking(booking)}
                                >
                                  <ArrowRightLeft size={12} /> Change
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  tone="ghost"
                                  size="sm"
                                  title="Cancel this booking and record a refund if one is due"
                                  onClick={() => setCancellingBooking(booking)}
                                >
                                  <XCircle size={12} /> Cancel
                                </Button>
                              )}
                              {canRecordRefund && (
                                <Button
                                  tone="ghost"
                                  size="sm"
                                  title="Record the refund for this cancelled booking"
                                  onClick={() => setCancellingBooking(booking)}
                                >
                                  <RotateCcw size={12} /> Refund
                                </Button>
                              )}
                              <Button
                                tone="danger"
                                size="sm"
                                disabled={blocked}
                                title={blocked ? 'This devotee is already blocked' : 'Block entry at the gate'}
                                onClick={() => openBlockFrom(booking)}
                              >
                                <Ban size={12} /> Block
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {open && canExpand && (
                          <tr className="bg-sandal-2/30">
                            <td colSpan={11} className="px-4 py-4">
                              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                                <div>
                                  <p className="mb-2 font-ui text-[0.62rem] uppercase tracking-[0.14em] text-muted">
                                    Guest roster
                                  </p>
                                  {roster.length > 0 ? (
                                    <ul className="space-y-1.5">
                                      {roster.map((attendee) => (
                                        <li
                                          key={`${attendee.position}-${attendee.name}`}
                                          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-3 py-2"
                                        >
                                          <span className="font-ui text-[0.78rem] font-semibold text-ink">
                                            {attendee.name}
                                            {attendee.position === 1 && (
                                              <span className="ml-1.5 rounded-full bg-sandal-2 px-1.5 py-0.5 font-ui text-[0.54rem] uppercase tracking-[0.1em] text-muted">
                                                Primary
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-[0.68rem] text-muted">{attendee.phone}</span>
                                          {attendee.email && (
                                            <span className="truncate text-[0.66rem] text-muted">{attendee.email}</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-[0.72rem] text-muted">
                                      {booking.name} · {booking.phone} · {booking.email}
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-2 text-[0.72rem]">
                                  <p className="font-ui text-[0.62rem] uppercase tracking-[0.14em] text-muted">
                                    Booking details
                                  </p>
                                  <div className="rounded-lg border border-line bg-white px-3 py-2 leading-relaxed text-muted">
                                    <p>
                                      Guest category:{' '}
                                      <span className="font-semibold text-ink">{GUEST_LABELS[category]}</span>
                                    </p>
                                    <p>
                                      Source:{' '}
                                      <span className="font-semibold text-ink">
                                        {booking.source === 'admin_free'
                                          ? 'Admin free pass'
                                          : booking.source === 'admin_issued'
                                            ? 'Admin issued'
                                            : 'Online purchase'}
                                      </span>
                                    </p>
                                    {Number(booking.discount_amount) > 0 && (
                                      <p>
                                        Discount:{' '}
                                        <span className="font-semibold text-ink">
                                          {formatRupees(Number(booking.discount_amount))}
                                        </span>
                                        {booking.coupon_code ? ` · ${booking.coupon_code}` : ''}
                                      </p>
                                    )}
                                    {booking.pass_days > 1 && <p>Pass duration: {booking.pass_days} days</p>}
                                    {booking.admin_note && (
                                      <p className="mt-1.5 border-t border-line pt-1.5">
                                        <span className="font-ui text-[0.6rem] uppercase tracking-[0.1em] text-muted">
                                          Note
                                        </span>
                                        <br />
                                        {booking.admin_note}
                                      </p>
                                    )}
                                    {booking.cancelled_at && (
                                      <p className="mt-1.5 border-t border-line pt-1.5">
                                        <span className="font-ui text-[0.6rem] uppercase tracking-[0.1em] text-muted">
                                          Cancelled
                                        </span>
                                        <br />
                                        {formatDateTime(booking.cancelled_at)}
                                        {booking.cancelled_by_name ? ` · ${booking.cancelled_by_name}` : ''}
                                        {booking.cancel_reason ? ` · ${booking.cancel_reason}` : ''}
                                      </p>
                                    )}
                                    {hasMoneyTrail && (
                                      <div className="mt-1.5 border-t border-line pt-1.5">
                                        <span className="font-ui text-[0.6rem] uppercase tracking-[0.1em] text-muted">
                                          Money trail
                                        </span>
                                        <p className="mt-1">
                                          Collected from devotee:{' '}
                                          <span className="font-semibold text-ink">
                                            {formatRupees(Number(booking.collected_amount))}
                                          </span>
                                          {Number(booking.refunds_total) > 0 && (
                                            <>
                                              {' · '}refunded{' '}
                                              <span className="font-semibold text-red-700">
                                                {formatRupees(Number(booking.refunds_total))}
                                              </span>
                                            </>
                                          )}
                                        </p>
                                        <p>
                                          Retained by the organisation:{' '}
                                          <span className="font-semibold text-ink">
                                            {formatRupees(Number(booking.net_amount))}
                                          </span>
                                          {booking.status === 'cancelled' || booking.status === 'refunded'
                                            ? ' (includes any cancellation fee kept)'
                                            : ''}
                                        </p>
                                        {booking.refund_amount != null && (
                                          <p>
                                            Whole-booking refund {formatRupees(Number(booking.refund_amount))}
                                            {booking.refund_reference ? ` · ${booking.refund_reference}` : ''}
                                            {booking.refunded_at ? ` · ${formatDateTime(booking.refunded_at)}` : ''}
                                            {booking.refunded_by_name ? ` · by ${booking.refunded_by_name}` : ''}
                                          </p>
                                        )}
                                        {Number(booking.captured_amount) > 0 &&
                                          Math.abs(
                                            Number(booking.captured_amount) - Number(booking.collected_amount),
                                          ) > 1 && (
                                            <p className="text-amber-700">
                                              Gateway payments show{' '}
                                              {formatRupees(Number(booking.captured_amount))} captured, which
                                              does not match the fare ledger above. Check this row manually.
                                            </p>
                                          )}
                                        {adjustments.length > 0 && (
                                          <ul className="mt-1.5 space-y-1.5">
                                            {adjustments.map((adjustment) => (
                                              <li
                                                key={adjustment.id}
                                                className="rounded-md border border-line bg-sandal-2/40 px-2 py-1.5"
                                              >
                                                <p className="font-ui text-[0.68rem] font-semibold text-ink">
                                                  {adjustment.kind === 'seats_cancelled'
                                                    ? `${adjustment.seats} seat${adjustment.seats === 1 ? '' : 's'} cancelled`
                                                    : 'Fare reduced'}{' '}
                                                  · {formatRupees(adjustment.amountBefore)} →{' '}
                                                  {formatRupees(adjustment.amountAfter)}
                                                </p>
                                                <p>
                                                  Refund {formatRupees(adjustment.refund)}
                                                  {adjustment.reference ? ` · ${adjustment.reference}` : ''}
                                                  {adjustment.by ? ` · by ${adjustment.by}` : ''} ·{' '}
                                                  {formatDateTime(adjustment.created_at)}
                                                </p>
                                                {adjustment.removed && adjustment.removed.length > 0 && (
                                                  <p>
                                                    Removed:{' '}
                                                    {adjustment.removed
                                                      .map((person) => person.name)
                                                      .join(', ')}
                                                  </p>
                                                )}
                                                <p>{adjustment.reason}</p>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    )}
                                    {booking.terms_accepted_at && (
                                      <p className="mt-1.5 border-t border-line pt-1.5">
                                        <span className="font-ui text-[0.6rem] uppercase tracking-[0.1em] text-muted">
                                          Policy acceptance
                                        </span>
                                        <br />
                                        {formatDateTime(booking.terms_accepted_at)}
                                        {booking.terms_version
                                          ? ` · wording ${booking.terms_version}`
                                          : booking.source === 'online'
                                            ? ' · wording not captured for this booking'
                                            : ' · stamped when this pass was issued, not clicked by the devotee'}
                                        {booking.terms_ip ? ` · from ${booking.terms_ip}` : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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

        <Panel>
          <PanelHead
            title="Blocked at the gate"
            subtitle="A blocked booking, email or mobile is refused at the gate even with a valid paid pass. Revoke a block to let the person in again."
            actions={
              <>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => setIncludeRevoked((current) => !current)}
                >
                  {includeRevoked ? 'Hide revoked' : 'Show revoked'}
                </Button>
                <Button tone="danger" size="sm" onClick={() => openBlockFrom(null)}>
                  <ShieldOff size={13} /> Block a person
                </Button>
              </>
            }
          />
          {blocksLoading ? (
            <Spinner label="Loading the block register" />
          ) : blocks.length === 0 ? (
            <Empty
              title="No one is blocked"
              hint="Use the Block action on a booking, or block a person by email or mobile."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-2.5">Person</th>
                    <th className="px-3 py-2.5">Reason</th>
                    <th className="px-3 py-2.5">Scope</th>
                    <th className="px-3 py-2.5">Blocked</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {blocks.map((block) => (
                    <tr key={block.id} className="align-top hover:bg-sandal-2/30">
                      <td className="px-4 py-3">
                        <p className="font-ui text-[0.8rem] font-semibold text-ink">
                          {block.name || 'Unnamed visitor'}
                        </p>
                        {block.email && <p className="text-[0.66rem] text-muted">{block.email}</p>}
                        {block.phone && <p className="text-[0.66rem] text-muted">{block.phone}</p>}
                      </td>
                      <td className="max-w-[280px] px-3 py-3 text-[0.74rem] leading-relaxed text-muted">
                        {block.reason}
                      </td>
                      <td className="px-3 py-3 text-[0.72rem] text-muted">
                        {block.scope === 'event' ? block.event_name_en || 'One event' : 'All events'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[0.66rem] text-muted">
                        <p>{formatDateTime(block.created_at)}</p>
                        {block.blocked_by_name && <p className="mt-0.5">by {block.blocked_by_name}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.6rem] uppercase tracking-[0.1em] ${
                            block.active === 1
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : 'border-line bg-sandal-2 text-muted'
                          }`}
                        >
                          {block.active === 1 ? 'Blocked' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          tone={block.active === 1 ? 'ghost' : 'danger'}
                          size="sm"
                          disabled={busyBlockId === block.id}
                          onClick={() => void toggleBlock(block)}
                        >
                          {block.active === 1 ? 'Revoke' : 'Reinstate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <IssuePassDialog
        open={issueOpen}
        schedules={schedules}
        onClose={() => setIssueOpen(false)}
        onIssued={() => {
          setNotice('Free pass issued. It is already on the gate list.');
          void load();
        }}
      />

      <EditBookingDialog
        booking={editingBooking}
        onClose={() => setEditingBooking(null)}
        onSaved={() => {
          setEditingBooking(null);
          setNotice('Booking updated.');
          void load();
          void loadBlocks(false);
        }}
      />

      <CancelRefundDialog
        booking={cancellingBooking}
        onClose={() => setCancellingBooking(null)}
        onSaved={(message) => {
          setCancellingBooking(null);
          setNotice(message);
          void load();
        }}
      />

      <ResendPassDialog
        booking={resendingBooking}
        onClose={() => setResendingBooking(null)}
        onSaved={(message) => {
          setResendingBooking(null);
          setNotice(message);
          void load();
        }}
      />

      <AmendBookingDialog
        booking={amendingBooking}
        onClose={() => setAmendingBooking(null)}
        onSaved={(message) => {
          setAmendingBooking(null);
          setNotice(message);
          void load();
        }}
      />

      <BlockEntryDialog
        open={blockOpen}
        seed={blockSeed}
        events={events}
        onClose={() => setBlockOpen(false)}
        onSaved={() => {
          setBlockOpen(false);
          setNotice('Entry blocked. The gate will refuse this pass.');
          void loadBlocks(false);
          void load();
        }}
      />
    </div>
  );
}
