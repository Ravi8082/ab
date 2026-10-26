import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  adminCreateCity,
  adminCreateState,
  adminCreateVenue,
  adminDeleteCity,
  adminDeleteState,
  adminDeleteVenue,
  adminDeleteWaitlist,
  adminDownloadWaitlist,
  adminLocations,
  adminMessageWaitlist,
  adminUpdateCity,
  adminUpdateState,
  adminUpdateVenue,
  adminWaitlist,
  type AdminState,
  type CityInput,
  type StateInput,
  type VenueInput,
  type WaitlistRow,
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
} from '@/components/admin/ui';
import { CityPicker, StatePicker } from '@/components/admin/PlacePickers';
import { mapsSearchUrl } from '@/lib/indiaPlaces';

type Editor =
  | { type: 'state'; mode: 'new' | 'edit'; id?: number; draft: StateInput }
  | { type: 'city'; mode: 'new' | 'edit'; id?: number; label: string; stateCode: string; draft: CityInput }
  | {
      type: 'venue';
      mode: 'new' | 'edit';
      id?: number;
      label: string;
      placeNames: string[];
      draft: VenueInput;
    };

const emptyState = (): StateInput => ({ code: '', name_en: '', name_hi: '', sort_order: 1, active: 1 });
const emptyCity = (stateId: number): CityInput => ({ state_id: stateId, name_en: '', name_hi: '', sort_order: 1, active: 1 });
const emptyVenue = (cityId: number): VenueInput => ({
  city_id: cityId,
  name_en: '',
  name_hi: '',
  address_en: '',
  address_hi: '',
  map_url: '',
  sort_order: 1,
  active: 1,
});

export default function AdminLocations() {
  const [states, setStates] = useState<AdminState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [editor, setEditor] = useState<Editor | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageStateId, setMessageStateId] = useState<number | ''>('');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const waitlistStates = useMemo(() => {
    const map = new Map<number, { name: string; verified: Set<string> }>();
    for (const row of waitlist) {
      const entry = map.get(row.state_id) ?? { name: row.state_en, verified: new Set<string>() };
      if (row.status === 'verified') entry.verified.add(row.email.toLowerCase());
      map.set(row.state_id, entry);
    }
    return Array.from(map, ([id, entry]) => ({ id, name: entry.name, verified: entry.verified.size }));
  }, [waitlist]);

  const verifiedRecipients = useMemo(() => {
    const emails = new Set<string>();
    for (const row of waitlist) {
      if (row.status !== 'verified') continue;
      if (messageStateId !== '' && row.state_id !== messageStateId) continue;
      emails.add(row.email.toLowerCase());
    }
    return emails.size;
  }, [waitlist, messageStateId]);

  const exportWaitlist = async () => {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      await adminDownloadWaitlist();
      setNotice('Waitlist CSV downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the waitlist.');
    } finally {
      setExporting(false);
    }
  };

  const openMessage = () => {
    setMessageStateId('');
    setMessageSubject('');
    setMessageBody('');
    setError('');
    setNotice('');
    setMessageOpen(true);
  };

  const sendMessage = async () => {
    if (!messageSubject.trim() || messageBody.trim().length < 10) {
      setError('Write a subject and a message of at least 10 characters.');
      return;
    }
    setSendingMessage(true);
    setError('');
    setNotice('');
    try {
      const result = await adminMessageWaitlist({
        stateId: messageStateId === '' ? null : messageStateId,
        subject: messageSubject.trim(),
        message: messageBody.trim(),
      });
      const parts = [
        `Email sent to ${result.recipients} verified ${result.recipients === 1 ? 'devotee' : 'devotees'}`,
      ];
      if (result.sent) parts.push(`${result.sent} delivered`);
      if (result.failed) parts.push(`${result.failed} failed`);
      if (!result.emailConfigured) parts.push('SMTP is off, so messages were logged only');
      setNotice(`${parts.join(' · ')}.`);
      setMessageOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the waitlist email.');
    } finally {
      setSendingMessage(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, wl] = await Promise.all([adminLocations(), adminWaitlist()]);
      setStates(result.states);
      setWaitlist(wl.waitlist);
      setExpanded((current) => {
        if (Object.keys(current).length) return current;
        return Object.fromEntries(result.states.filter((state) => state.cities.length > 0).map((state) => [state.id, true]));
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editor.type === 'state') {
        if (editor.mode === 'new') await adminCreateState(editor.draft);
        else if (editor.id) await adminUpdateState(editor.id, editor.draft);
        setNotice(`State ${editor.mode === 'new' ? 'created' : 'updated'}.`);
      }
      if (editor.type === 'city') {
        if (editor.mode === 'new') await adminCreateCity(editor.draft);
        else if (editor.id) await adminUpdateCity(editor.id, editor.draft);
        setNotice(`City ${editor.mode === 'new' ? 'created' : 'updated'}.`);
      }
      if (editor.type === 'venue') {
        const draft = { ...editor.draft };
        if (editor.mode === 'new' && !draft.map_url.trim()) {
          draft.map_url = mapsSearchUrl([draft.name_en, draft.address_en, ...editor.placeNames]);
        }
        if (editor.mode === 'new') await adminCreateVenue(draft);
        else if (editor.id) await adminUpdateVenue(editor.id, draft);
        setNotice(`Venue ${editor.mode === 'new' ? 'created' : 'updated'}.`);
      }
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this location.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: 'state' | 'city' | 'venue', id: number, label: string) => {
    if (!window.confirm(`Delete ${label}? Locations with schedules or nested records cannot be deleted.`)) return;
    setError('');
    setNotice('');
    try {
      if (kind === 'state') await adminDeleteState(id);
      if (kind === 'city') await adminDeleteCity(id);
      if (kind === 'venue') await adminDeleteVenue(id);
      setNotice(`${label} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this location.');
    }
  };

  const dropWaitlist = async (row: WaitlistRow) => {
    if (!window.confirm(`Remove ${row.email} from the ${row.state_en} waitlist?`)) return;
    setError('');
    setNotice('');
    try {
      await adminDeleteWaitlist(row.id);
      setWaitlist((current) => current.filter((item) => item.id !== row.id));
      setNotice('Waitlist request removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this request.');
    }
  };

  const toggleState = (id: number) =>
    setExpanded((current) => ({ ...current, [id]: !current[id] }));

  const nextStateSort = () => states.reduce((max, state) => Math.max(max, Number(state.sort_order) || 0), 0) + 10;
  const nextCitySort = (stateId: number) => ((states.find((state) => state.id === stateId)?.cities.length ?? 0) + 1) * 10;

  return (
    <div>
      <PageHeader
        eyebrow="Event setup"
        title="States & venues"
        subtitle="One state can hold many cities, and one city can host the event at several addresses. Bookings and reports are filtered by this tree."
        actions={
          <>
            <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Button size="sm" onClick={() => setEditor({ type: 'state', mode: 'new', draft: emptyState() })}>
              <Plus size={13} /> Add state
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

      <Panel className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sandal-2/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-saffron-ink shadow-sm">
              <BellRing size={16} />
            </span>
            <div>
              <p className="font-display text-lg leading-none text-ink">State waitlist</p>
              <p className="mt-1 text-[0.7rem] text-muted">
                {waitlist.filter((row) => row.status === 'verified').length} verified of {waitlist.length} — visitors in
                states that have no yatra city yet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button tone="ghost" size="sm" onClick={() => void exportWaitlist()} disabled={exporting || waitlist.length === 0}>
              <Download size={13} /> {exporting ? 'Building…' : 'Export CSV'}
            </Button>
            <Button size="sm" onClick={openMessage} disabled={waitlistStates.every((state) => state.verified === 0)}>
              <Mail size={13} /> Email verified
            </Button>
          </div>
        </div>
        {waitlist.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Nobody on the list yet. Visitors join it by picking a state with no city on the event page.
          </p>
        ) : (
          <div className="max-h-[420px] divide-y divide-line/70 overflow-y-auto">
            {waitlist.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-ui text-[0.84rem] font-semibold text-ink">
                    {row.name}
                    <span className="ml-2 font-mono text-[0.66rem] font-normal text-muted">{row.ref}</span>
                  </p>
                  <p className="text-[0.72rem] text-muted">
                    <a href={`mailto:${row.email}`} className="text-sky-dark hover:underline">
                      {row.email}
                    </a>
                    {row.phone ? ` · ${row.phone}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[0.66rem] text-muted">
                    {row.state_en}
                  </span>
                  {row.status === 'verified' ? (
                    <span className="text-[0.68rem] font-semibold text-emerald-700">Email verified</span>
                  ) : (
                    <span className="chip chip--marigold">Waiting for verification</span>
                  )}
                  <span className="text-[0.66rem] text-muted">{formatDateTime(row.created_at)}</span>
                  <button
                    onClick={() => void dropWaitlist(row)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-300 hover:text-red-600"
                    aria-label={`Remove ${row.email} from the waitlist`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {loading && states.length === 0 ? (
        <Panel>
          <Spinner label="Loading locations" />
        </Panel>
      ) : states.length === 0 ? (
        <Panel>
          <div className="px-5 py-12 text-center">
            <MapPin size={26} className="mx-auto text-saffron" />
            <p className="mt-2 font-display text-xl text-ink">No states yet</p>
            <p className="mt-1 text-sm text-muted">Start with Rajasthan, then add Jaipur and its venues.</p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-4">
          {states.map((state) => {
            const open = Boolean(expanded[state.id]);
            const cityCount = state.cities.length;
            const venueCount = state.cities.reduce((sum, city) => sum + city.venues.length, 0);
            return (
              <Panel key={state.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sandal-2/50 px-4 py-3">
                  <button onClick={() => toggleState(state.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-saffron-ink shadow-sm">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-xl leading-none text-ink">{state.name_en}</span>
                        <span className="font-hindi text-xs text-muted">{state.name_hi}</span>
                        <span className="rounded-full border border-line bg-white px-2 py-0.5 font-mono text-[0.6rem] text-muted">
                          {state.code}
                        </span>
                        {!state.active && <span className="chip chip--lotus">Hidden</span>}
                      </span>
                      <span className="mt-0.5 block text-[0.68rem] text-muted">
                        {cityCount} cit{cityCount === 1 ? 'y' : 'ies'} · {venueCount} venue{venueCount === 1 ? '' : 's'} · sort {state.sort_order}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          type: 'city',
                          mode: 'new',
                          label: state.name_en,
                          stateCode: state.code,
                          draft: emptyCity(state.id),
                        })
                      }
                    >
                      <Plus size={12} /> Add city
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() =>
                        setEditor({
                          type: 'state',
                          mode: 'edit',
                          id: state.id,
                          draft: {
                            code: state.code,
                            name_en: state.name_en,
                            name_hi: state.name_hi,
                            sort_order: Number(state.sort_order),
                            active: Number(state.active),
                          },
                        })
                      }
                    >
                      <Pencil size={12} /> Edit
                    </Button>
                    <button
                      onClick={() => void remove('state', state.id, state.name_en)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-300 hover:text-red-600"
                      aria-label={`Delete ${state.name_en}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="space-y-3 p-4">
                    {state.cities.map((city) => (
                      <div key={city.id} className="rounded-xl border border-line bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Building2 size={15} className="text-sky-dark" />
                            <p className="font-ui text-[0.86rem] font-semibold text-ink">
                              {city.name_en}
                              <span className="ml-1.5 font-hindi text-[0.7rem] font-normal text-muted">{city.name_hi}</span>
                            </p>
                            {!city.active && <span className="chip chip--lotus">Hidden</span>}
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              tone="ghost"
                              size="sm"
                              onClick={() =>
                                setEditor({
                                  type: 'venue',
                                  mode: 'new',
                                  label: `${city.name_en}, ${state.name_en}`,
                                  placeNames: [city.name_en, state.name_en],
                                  draft: emptyVenue(city.id),
                                })
                              }
                            >
                              <Plus size={12} /> Add venue
                            </Button>
                            <button
                              onClick={() =>
                                setEditor({
                                  type: 'city',
                                  mode: 'edit',
                                  id: city.id,
                                  label: state.name_en,
                                  stateCode: state.code,
                                  draft: {
                                    state_id: city.state_id,
                                    name_en: city.name_en,
                                    name_hi: city.name_hi,
                                    sort_order: Number(city.sort_order),
                                    active: Number(city.active),
                                  },
                                })
                              }
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-saffron/40 hover:text-saffron-ink"
                              aria-label={`Edit ${city.name_en}`}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => void remove('city', city.id, city.name_en)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-red-300 hover:text-red-600"
                              aria-label={`Delete ${city.name_en}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-line/60">
                          {city.venues.map((venue) => (
                            <div key={venue.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sandal-2 text-saffron-ink">
                                  <MapPin size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-ui text-[0.82rem] font-semibold text-ink">
                                    {venue.name_en}
                                    <span className="ml-1.5 font-hindi text-[0.68rem] font-normal text-muted">
                                      {venue.name_hi}
                                    </span>
                                    {!venue.active && <span className="ml-2 chip chip--lotus">Hidden</span>}
                                  </p>
                                  <p className="text-[0.68rem] leading-relaxed text-muted">{venue.address_en}</p>
                                  {venue.map_url && (
                                    <a
                                      href={venue.map_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-0.5 inline-flex items-center gap-1 text-[0.66rem] font-semibold text-sky-dark hover:underline"
                                    >
                                      Map <ExternalLink size={10} />
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() =>
                                    setEditor({
                                      type: 'venue',
                                      mode: 'edit',
                                      id: venue.id,
                                      label: `${city.name_en}, ${state.name_en}`,
                                      placeNames: [city.name_en, state.name_en],
                                      draft: {
                                        city_id: venue.city_id,
                                        name_en: venue.name_en,
                                        name_hi: venue.name_hi,
                                        address_en: venue.address_en,
                                        address_hi: venue.address_hi,
                                        map_url: venue.map_url ?? '',
                                        sort_order: Number(venue.sort_order),
                                        active: Number(venue.active),
                                      },
                                    })
                                  }
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-saffron/40 hover:text-saffron-ink"
                                  aria-label={`Edit ${venue.name_en}`}
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() => void remove('venue', venue.id, venue.name_en)}
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-red-300 hover:text-red-600"
                                  aria-label={`Delete ${venue.name_en}`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {city.venues.length === 0 && (
                            <p className="px-4 py-4 text-xs text-muted">No venue yet. Add the address where devotees will gather.</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {state.cities.length === 0 && (
                      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                        No city in {state.name_en} yet. Add the first city.
                      </p>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title="Email the waitlist"
        subtitle="Only visitors who confirmed their email receive this — pending sign-ups are skipped."
        footer={
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setMessageOpen(false)}>Cancel</Button>
            <Button onClick={() => void sendMessage()} disabled={sendingMessage || verifiedRecipients === 0}>
              <Send size={13} /> {sendingMessage ? 'Sending…' : `Send to ${verifiedRecipients}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Recipients">
            <Select
              value={messageStateId}
              onChange={(e) => setMessageStateId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">All states</option>
              {waitlistStates.map((state) => (
                <option key={state.id} value={state.id}>
                  {state.name} — {state.verified} verified
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" hint="Shown as the email subject line.">
            <TextInput
              value={messageSubject}
              onChange={(e) => setMessageSubject(e.target.value)}
              maxLength={120}
              placeholder="Mahi Sundarkand update for your state"
            />
          </Field>
          <Field label="Message" hint="Plain text — line breaks are kept. The footer includes an opt-out line and your support email.">
            <TextArea
              rows={7}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              maxLength={4000}
              placeholder="Radhe Radhe! We are planning the next Mahi Sundarkand cities. Reply to this email with your city so we can plan better."
            />
          </Field>
          <Notice tone="info">
            {verifiedRecipients === 0
              ? 'No verified waitlist email matches this selection yet.'
              : `${verifiedRecipients} verified ${verifiedRecipients === 1 ? 'email' : 'emails'} will receive this. Each send is recorded in the email log and audit trail.`}
          </Notice>
        </div>
      </Modal>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={
          editor?.type === 'state'
            ? editor.mode === 'new'
              ? 'Add state'
              : `Edit ${editor.draft.name_en}`
            : editor?.type === 'city'
              ? editor.mode === 'new'
                ? `Add city in ${editor.label}`
                : `Edit ${editor.draft.name_en}`
              : editor?.type === 'venue'
                ? editor.mode === 'new'
                  ? `Add venue in ${editor.label}`
                  : `Edit ${editor.draft.name_en}`
                : 'Location'
        }
        subtitle="These names and addresses appear in the public city selector and on the pass."
        wide={editor?.type === 'venue'}
        footer={
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setEditor(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editor?.mode === 'new' ? 'Create' : 'Save changes'}
            </Button>
          </div>
        }
      >
        {editor?.type === 'state' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {editor.mode === 'new' && (
              <StatePicker
                takenCodes={states.map((state) => state.code)}
                value={editor.draft.code}
                onPick={(picked) =>
                  setEditor(
                    picked
                      ? {
                          ...editor,
                          draft: {
                            code: picked.code,
                            name_en: picked.en,
                            name_hi: picked.hi,
                            sort_order: nextStateSort(),
                            active: editor.draft.active,
                          },
                        }
                      : { ...editor, draft: { ...editor.draft, code: '', name_en: '', name_hi: '' } },
                  )
                }
              />
            )}
            <Field label="Code" hint="2–8 letters, e.g. RJ, GJ, DL">
              <TextInput
                value={editor.draft.code}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, code: e.target.value.toUpperCase() } })}
              />
            </Field>
            <Field label="Sort order">
              <TextInput
                type="number"
                value={editor.draft.sort_order}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, sort_order: Number(e.target.value) } })}
              />
            </Field>
            <Field label="Name (English)">
              <TextInput
                value={editor.draft.name_en}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_en: e.target.value } })}
              />
            </Field>
            <Field label="Name (हिंदी)">
              <TextInput
                value={editor.draft.name_hi}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_hi: e.target.value } })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                checked={Boolean(editor.draft.active)}
                onChange={(active) => setEditor({ ...editor, draft: { ...editor.draft, active: active ? 1 : 0 } })}
                label="State is visible on the site"
              />
            </div>
          </div>
        )}

        {editor?.type === 'city' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {editor.mode === 'new' && (
              <CityPicker
                stateCode={editor.stateCode}
                takenNames={(states.find((state) => state.code === editor.stateCode)?.cities ?? []).map((city) => city.name_en)}
                value={editor.draft.name_en}
                label={`Pick a city in ${editor.label}`}
                onPick={(picked) =>
                  setEditor(
                    picked
                      ? {
                          ...editor,
                          draft: {
                            state_id: editor.draft.state_id,
                            name_en: picked.en,
                            name_hi: picked.hi,
                            sort_order: nextCitySort(Number(editor.draft.state_id)),
                            active: editor.draft.active,
                          },
                        }
                      : { ...editor, draft: { ...editor.draft, name_en: '', name_hi: '' } },
                  )
                }
              />
            )}
            <Field label="City name (English)">
              <TextInput
                value={editor.draft.name_en}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_en: e.target.value } })}
              />
            </Field>
            <Field label="City name (हिंदी)">
              <TextInput
                value={editor.draft.name_hi}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_hi: e.target.value } })}
              />
            </Field>
            <Field label="Sort order">
              <TextInput
                type="number"
                value={editor.draft.sort_order}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, sort_order: Number(e.target.value) } })}
              />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle
                checked={Boolean(editor.draft.active)}
                onChange={(active) => setEditor({ ...editor, draft: { ...editor.draft, active: active ? 1 : 0 } })}
                label="City is visible on the site"
              />
            </div>
          </div>
        )}

        {editor?.type === 'venue' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Venue name (English)">
              <TextInput
                value={editor.draft.name_en}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_en: e.target.value } })}
              />
            </Field>
            <Field label="Venue name (हिंदी)">
              <TextInput
                value={editor.draft.name_hi}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name_hi: e.target.value } })}
              />
            </Field>
            <Field label="Address (English)" className="sm:col-span-2">
              <TextArea
                value={editor.draft.address_en}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, address_en: e.target.value } })}
              />
            </Field>
            <Field label="Address (हिंदी)" className="sm:col-span-2">
              <TextArea
                value={editor.draft.address_hi}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, address_hi: e.target.value } })}
              />
            </Field>
            <Field
              label="Map link"
              hint="Leave blank and a Google Maps search link is built from the venue name and address."
              className="sm:col-span-2"
            >
              <TextInput
                value={editor.draft.map_url}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, map_url: e.target.value } })}
              />
            </Field>
            <Field label="Sort order">
              <TextInput
                type="number"
                value={editor.draft.sort_order}
                onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, sort_order: Number(e.target.value) } })}
              />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle
                checked={Boolean(editor.draft.active)}
                onChange={(active) => setEditor({ ...editor, draft: { ...editor.draft, active: active ? 1 : 0 } })}
                label="Venue is bookable"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
