import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgePercent, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  adminCoupons,
  adminCreateCoupon,
  adminDeleteCoupon,
  adminEvents,
  adminUpdateCoupon,
  type AdminCoupon,
  type EventRow,
} from '@/lib/adminApi';
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
  TextInput,
  Toggle,
  formatDay,
} from '@/components/admin/ui';

interface Draft {
  code: string;
  kind: 'percent' | 'flat';
  value: string;
  eventId: string;
  ticketTypeId: string;
  minQty: string;
  maxUses: string;
  perEmailLimit: string;
  validFrom: string;
  validUntil: string;
  labelEn: string;
  labelHi: string;
  active: boolean;
}

const EMPTY_DRAFT: Draft = {
  code: '',
  kind: 'percent',
  value: '10',
  eventId: '',
  ticketTypeId: '',
  minQty: '1',
  maxUses: '',
  perEmailLimit: '1',
  validFrom: '',
  validUntil: '',
  labelEn: '',
  labelHi: '',
  active: true,
};

function toDraft(coupon: AdminCoupon): Draft {
  return {
    code: coupon.code,
    kind: coupon.kind,
    value: String(coupon.value),
    eventId: coupon.event_id ? String(coupon.event_id) : '',
    ticketTypeId: coupon.ticket_type_id ? String(coupon.ticket_type_id) : '',
    minQty: String(coupon.min_qty),
    maxUses: coupon.max_uses ? String(coupon.max_uses) : '',
    perEmailLimit: String(coupon.per_email_limit),
    validFrom: coupon.valid_from ?? '',
    validUntil: coupon.valid_until ?? '',
    labelEn: coupon.label_en ?? '',
    labelHi: coupon.label_hi ?? '',
    active: coupon.active === 1,
  };
}

const inputDate = (value: string | null) => (value ? value.slice(0, 10) : '');

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [couponResult, eventResult] = await Promise.all([adminCoupons(), adminEvents()]);
      setCoupons(couponResult.coupons);
      setEvents(eventResult.events);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load coupons.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const active = coupons.filter((coupon) => coupon.active === 1).length;
    const redeemed = coupons.reduce((sum, coupon) => sum + coupon.used, 0);
    return { active, redeemed };
  }, [coupons]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT });
    setFormError('');
    setNotice('');
  };

  const openEdit = (coupon: AdminCoupon) => {
    setEditing(coupon);
    setDraft(toDraft(coupon));
    setFormError('');
    setNotice('');
  };

  const closeForm = () => {
    if (saving) return;
    setDraft(null);
    setEditing(null);
    setFormError('');
  };

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      if (key === 'eventId') {
        const event = events.find((candidate) => String(candidate.id) === String(value));
        const ticketStillValid = event?.tickets.some((ticket) => String(ticket.id) === current.ticketTypeId);
        if (!ticketStillValid) next.ticketTypeId = '';
      }
      return next;
    });
  };

  const submit = async () => {
    if (!draft) return;
    const value = Number(draft.value);
    const minQty = Number(draft.minQty);
    const perEmailLimit = Number(draft.perEmailLimit);
    const maxUses = draft.maxUses.trim() === '' ? null : Number(draft.maxUses);

    if (!draft.code.trim() || draft.code.trim().length < 3) {
      setFormError('The coupon code needs at least 3 letters or numbers.');
      return;
    }
    if (!Number.isFinite(value) || value < 1) {
      setFormError('Enter a discount value of at least 1.');
      return;
    }
    if (draft.kind === 'percent' && value > 90) {
      setFormError('A percentage coupon cannot cover more than 90% of the fare.');
      return;
    }
    if (!Number.isFinite(minQty) || minQty < 1) {
      setFormError('Minimum seats must be at least 1.');
      return;
    }
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
      setFormError('Maximum uses must be at least 1, or leave it empty for unlimited.');
      return;
    }
    if (!Number.isFinite(perEmailLimit) || perEmailLimit < 0) {
      setFormError('Per-email limit must be 0 (unlimited) or more.');
      return;
    }
    if (draft.validFrom && draft.validUntil && draft.validUntil < draft.validFrom) {
      setFormError('The expiry date is before the start date.');
      return;
    }

    const input = {
      code: draft.code.trim().toUpperCase(),
      kind: draft.kind,
      value: Math.round(value),
      eventId: draft.eventId ? Number(draft.eventId) : null,
      ticketTypeId: draft.ticketTypeId ? Number(draft.ticketTypeId) : null,
      minQty: Math.round(minQty),
      maxUses: maxUses === null ? null : Math.round(maxUses),
      perEmailLimit: Math.round(perEmailLimit),
      validFrom: draft.validFrom || null,
      validUntil: draft.validUntil || null,
      labelEn: draft.labelEn.trim(),
      labelHi: draft.labelHi.trim(),
      active: draft.active,
    };

    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await adminUpdateCoupon(editing.id, input);
        setNotice(`Coupon ${input.code} updated.`);
      } else {
        await adminCreateCoupon(input);
        setNotice(`Coupon ${input.code} created.`);
      }
      setDraft(null);
      setEditing(null);
      await load(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the coupon.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: AdminCoupon) => {
    setError('');
    try {
      await adminUpdateCoupon(coupon.id, {
        code: coupon.code,
        kind: coupon.kind,
        value: coupon.value,
        eventId: coupon.event_id,
        ticketTypeId: coupon.ticket_type_id,
        minQty: coupon.min_qty,
        maxUses: coupon.max_uses,
        perEmailLimit: coupon.per_email_limit,
        validFrom: inputDate(coupon.valid_from) || null,
        validUntil: inputDate(coupon.valid_until) || null,
        labelEn: coupon.label_en ?? '',
        labelHi: coupon.label_hi ?? '',
        active: coupon.active !== 1,
      });
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the coupon status.');
    }
  };

  const remove = async (coupon: AdminCoupon) => {
    const label = coupon.code;
    if (!window.confirm(`Delete coupon ${label}? Coupons already used by a booking are retired instead of removed.`)) return;
    setDeletingId(coupon.id);
    setError('');
    try {
      const result = await adminDeleteCoupon(coupon.id);
      setNotice(result.retired ? `Coupon ${label} was used before, so it is now retired.` : `Coupon ${label} deleted.`);
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the coupon.');
    } finally {
      setDeletingId(null);
    }
  };

  const draftEvent = events.find((event) => String(event.id) === draft?.eventId);

  return (
    <div>
      <PageHeader
        eyebrow="Offers"
        title="Coupons"
        subtitle="Create percentage or flat discounts, limit them to one event or pass type, and cap how often each devotee can use them. Discounts are applied at checkout and stored on the booking."
        actions={
          <>
            <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={15} /> New coupon
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Coupons" value={loading ? '—' : coupons.length.toLocaleString('en-IN')} note="All codes ever created" tone="lotus" />
        <Stat label="Active now" value={loading ? '—' : totals.active.toLocaleString('en-IN')} note="Codes devotees can redeem" tone="sky" />
        <Stat label="Redemptions" value={loading ? '—' : totals.redeemed.toLocaleString('en-IN')} note="Bookings that used a code" tone="amber" />
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}

      <Panel>
        <PanelHead
          title="All coupons"
          subtitle="Codes are case-insensitive. A coupon limited to a pass type also limits the event."
          actions={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sandal-2 px-2.5 py-1 font-ui text-[0.64rem] uppercase tracking-[0.12em] text-muted">
              <BadgePercent size={12} /> {coupons.filter((coupon) => coupon.active === 1).length} live
            </span>
          }
        />
        {loading ? (
          <Spinner label="Loading coupons" />
        ) : coupons.length === 0 ? (
          <Empty title="No coupons yet" hint="Create your first code to offer an early-bird or group discount." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.62rem] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Discount</th>
                  <th className="px-4 py-2.5 font-semibold">Applies to</th>
                  <th className="px-4 py-2.5 font-semibold">Limits</th>
                  <th className="px-4 py-2.5 font-semibold">Valid</th>
                  <th className="px-4 py-2.5 font-semibold">Used</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="align-top transition-colors hover:bg-sandal-2/40">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[0.8rem] font-semibold tracking-[0.06em] text-ink">{coupon.code}</p>
                      {(coupon.label_en || coupon.label_hi) && (
                        <p className="mt-0.5 text-[0.68rem] text-muted">
                          {coupon.label_en || coupon.label_hi}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {coupon.kind === 'percent' ? `${coupon.value}% off` : `₹${coupon.value.toLocaleString('en-IN')} off`}
                    </td>
                    <td className="px-4 py-3 text-[0.76rem] text-muted">
                      {coupon.ticket_en ? (
                        <>
                          <span className="block font-ui text-[0.72rem] font-semibold text-ink">{coupon.ticket_en}</span>
                          {coupon.event_en}
                        </>
                      ) : coupon.event_en ? (
                        coupon.event_en
                      ) : (
                        'All events'
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] leading-relaxed text-muted">
                      <span className="block">Min {coupon.min_qty} seat{coupon.min_qty === 1 ? '' : 's'}</span>
                      <span className="block">{coupon.max_uses ? `${coupon.max_uses} total uses` : 'Unlimited total'}</span>
                      <span className="block">
                        {coupon.per_email_limit === 0 ? 'No per-email cap' : `${coupon.per_email_limit} per email`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] leading-relaxed text-muted">
                      {coupon.valid_from || coupon.valid_until ? (
                        <>
                          <span className="block">From {coupon.valid_from ? formatDay(coupon.valid_from.slice(0, 10)) : 'now'}</span>
                          <span className="block">Till {coupon.valid_until ? formatDay(coupon.valid_until.slice(0, 10)) : 'always'}</span>
                        </>
                      ) : (
                        'Always'
                      )}
                    </td>
                    <td className="px-4 py-3 font-display text-lg text-ink">{coupon.used}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.62rem] uppercase tracking-[0.1em] ${
                          coupon.active === 1
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-line bg-sandal-2 text-muted'
                        }`}
                      >
                        {coupon.active === 1 ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button tone="ghost" size="sm" onClick={() => void toggleActive(coupon)}>
                          {coupon.active === 1 ? 'Pause' : 'Activate'}
                        </Button>
                        <Button tone="ghost" size="sm" onClick={() => openEdit(coupon)}>
                          <Pencil size={12} /> Edit
                        </Button>
                        <Button
                          tone="danger"
                          size="sm"
                          disabled={deletingId === coupon.id}
                          onClick={() => void remove(coupon)}
                        >
                          <Trash2 size={12} /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(draft)}
        onClose={closeForm}
        title={editing ? `Edit ${editing.code}` : 'New coupon'}
        subtitle="Every field except the labels is enforced at checkout on the server."
        wide
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button tone="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save coupon' : 'Create coupon'}
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            {formError && <Notice tone="error">{formError}</Notice>}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Coupon code" hint="3–32 letters or numbers, case-insensitive">
                <TextInput
                  value={draft.code}
                  onChange={(event) => setField('code', event.target.value.toUpperCase())}
                  placeholder="EARLY10"
                  maxLength={32}
                  autoFocus
                />
              </Field>
              <Field label="Type">
                <Select
                  value={draft.kind}
                  onChange={(event) => setField('kind', event.target.value as Draft['kind'])}
                >
                  <option value="percent">Percentage off</option>
                  <option value="flat">Flat rupees off</option>
                </Select>
              </Field>
              <Field label={draft.kind === 'percent' ? 'Percent off (1–90)' : 'Rupees off (per booking)'}>
                <TextInput
                  type="number"
                  min={1}
                  max={draft.kind === 'percent' ? 90 : 1000000}
                  value={draft.value}
                  onChange={(event) => setField('value', event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event" hint="Leave empty to allow the coupon on every event">
                <Select value={draft.eventId} onChange={(event) => setField('eventId', event.target.value)}>
                  <option value="">All events</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name_en}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pass type" hint="Leave empty to allow every pass in the chosen scope">
                <Select
                  value={draft.ticketTypeId}
                  onChange={(event) => setField('ticketTypeId', event.target.value)}
                >
                  <option value="">All pass types</option>
                  {(draftEvent ? draftEvent.tickets : events.flatMap((event) => event.tickets)).map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.name_en}
                      {draftEvent ? '' : ` · ${events.find((event) => event.id === ticket.event_id)?.name_en ?? ''}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Minimum seats" hint="Booking must have at least this many seats">
                <TextInput
                  type="number"
                  min={1}
                  max={20}
                  value={draft.minQty}
                  onChange={(event) => setField('minQty', event.target.value)}
                />
              </Field>
              <Field label="Maximum uses" hint="Empty means unlimited across all devotees">
                <TextInput
                  type="number"
                  min={1}
                  value={draft.maxUses}
                  onChange={(event) => setField('maxUses', event.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
              <Field label="Per-email limit" hint="0 means no limit per email">
                <TextInput
                  type="number"
                  min={0}
                  max={100}
                  value={draft.perEmailLimit}
                  onChange={(event) => setField('perEmailLimit', event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valid from" hint="Leave empty to start immediately">
                <TextInput
                  type="date"
                  value={draft.validFrom}
                  onChange={(event) => setField('validFrom', event.target.value)}
                />
              </Field>
              <Field label="Valid until" hint="Leave empty for no expiry">
                <TextInput
                  type="date"
                  value={draft.validUntil}
                  onChange={(event) => setField('validUntil', event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label (English)" hint="Shown beside the discount at checkout">
                <TextInput
                  value={draft.labelEn}
                  onChange={(event) => setField('labelEn', event.target.value)}
                  placeholder="Early bird offer"
                  maxLength={120}
                />
              </Field>
              <Field label="Label (Hindi)">
                <TextInput
                  value={draft.labelHi}
                  onChange={(event) => setField('labelHi', event.target.value)}
                  placeholder="अर्ली बर्ड ऑफर"
                  maxLength={160}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-line bg-white px-4 py-3">
              <Toggle checked={draft.active} onChange={(next) => setField('active', next)} label="Coupon is active" />
              <p className="mt-1 text-[0.68rem] text-muted">
                Paused coupons stay on record but are rejected at checkout.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
