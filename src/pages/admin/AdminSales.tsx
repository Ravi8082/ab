import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Mail,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
} from 'lucide-react';
import {
  adminReminders,
  adminRetryReminder,
  adminRunReminders,
  adminSalesSettings,
  adminSaveSalesSettings,
  type AdminReminder,
  type SalesSettings,
} from '@/lib/adminApi';
import {
  Button,
  Empty,
  Field,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Spinner,
  Stat,
  TextArea,
  Toggle,
  formatDateTime,
} from '@/components/admin/ui';

interface Draft {
  paused: boolean;
  message_en: string;
  message_hi: string;
  resume_at: string;
  reminders_enabled: boolean;
}

const TYPE_LABEL: Record<AdminReminder['reminder_type'], string> = {
  payment_pending: 'Payment pending',
  event_24h: 'Event in 24 hours',
  event_2h: 'Event in 2 hours',
};

const STATUS_STYLE: Record<AdminReminder['status'], string> = {
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  skipped: 'border-line bg-sandal-2 text-muted',
};

function toInputValue(value: string | null) {
  if (!value) return '';
  return value.replace(' ', 'T').slice(0, 16);
}

function toDraft(settings: SalesSettings): Draft {
  return {
    paused: settings.paused,
    message_en: settings.message_en,
    message_hi: settings.message_hi,
    resume_at: toInputValue(settings.resume_at),
    reminders_enabled: settings.reminders_enabled,
  };
}

export default function AdminSales() {
  const [settings, setSettings] = useState<SalesSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [smtpReady, setSmtpReady] = useState(true);
  const [reminders, setReminders] = useState<AdminReminder[]>([]);
  const [counts, setCounts] = useState({ total: 0, sent: 0, pending: 0, failed: 0, skipped: 0 });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const applySettings = useCallback((next: SalesSettings) => {
    setSettings(next);
    setDraft(toDraft(next));
  }, []);

  const applyReminders = useCallback(
    (result: { counts: { total: number; sent: number; pending: number; failed: number; skipped: number }; reminders: AdminReminder[] }) => {
      setCounts(result.counts);
      setReminders(result.reminders);
    },
    [],
  );

  const load = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const [salesResult, remindersResult] = await Promise.all([adminSalesSettings(), adminReminders()]);
        applySettings(salesResult.settings);
        setSmtpReady(salesResult.smtpConfigured);
        applyReminders(remindersResult);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load sales settings.');
      } finally {
        setLoading(false);
      }
    },
    [applySettings, applyReminders],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refreshReminders = async () => {
    const result = await adminReminders();
    applyReminders(result);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.message_en.trim() || !draft.message_hi.trim()) {
      setError('Both pause messages are required — visitors see them in English and Hindi.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await adminSaveSalesSettings({
        paused: draft.paused,
        message_en: draft.message_en.trim(),
        message_hi: draft.message_hi.trim(),
        resume_at: draft.resume_at ? draft.resume_at : null,
        reminders_enabled: draft.reminders_enabled,
      });
      applySettings(result.settings);
      setSmtpReady(result.smtpConfigured);
      setNotice(
        result.settings.closed
          ? 'New bookings and payments are paused. Existing passes, gate check-in and lookups still work.'
          : 'Online bookings and payments are open.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the sales settings.');
    } finally {
      setSaving(false);
    }
  };

  const runReminders = async () => {
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const result = await adminRunReminders();
      await refreshReminders();
      const parts = result.skipped
        ? [result.reason || 'The reminder run was skipped.']
        : [
            `${result.enqueued} queued`,
            `${result.sent} sent`,
            ...(result.skippedCount ? [`${result.skippedCount} skipped`] : []),
            ...(result.failed ? [`${result.failed} failed`] : []),
          ];
      setNotice(`Reminder check finished: ${parts.join(' · ')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the reminder check.');
    } finally {
      setRunning(false);
    }
  };

  const retry = async (reminder: AdminReminder) => {
    setRetryingId(reminder.id);
    setError('');
    setNotice('');
    try {
      await adminRetryReminder(reminder.id);
      await refreshReminders();
      setNotice(`Reminder for ${reminder.reference} queued again. Run the check to send it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue the reminder again.');
    } finally {
      setRetryingId(null);
    }
  };

  if (loading && !draft) {
    return (
      <div>
        <PageHeader eyebrow="Operations" title="Sales & reminders" />
        <Panel>
          <Spinner label="Loading sales controls" />
        </Panel>
      </div>
    );
  }

  if (!draft || !settings) {
    return (
      <div>
        <PageHeader eyebrow="Operations" title="Sales & reminders" />
        <Notice tone="error">{error || 'Could not load sales settings.'}</Notice>
        <div className="mt-4">
          <Button tone="ghost" onClick={() => void load()}>
            <RefreshCw size={14} /> Try again
          </Button>
        </div>
      </div>
    );
  }

  const closed = settings.closed;
  const autoReopened = settings.paused && !settings.closed;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Sales & reminders"
        subtitle="Stop new bookings and payments the moment something needs attention, then reopen with one switch. Existing passes and gate check-in never stop."
        actions={
          <>
            <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading || saving}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      />

      {notice && (
        <div className="mb-4">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!smtpReady && (
        <div className="mb-4">
          <Notice tone="info">
            Email delivery is not configured yet. Pass emails, OTP emails and automatic reminders stay in the server
            log until an SMTP app password is added to the server environment.
          </Notice>
        </div>
      )}

      <div
        className={`mb-5 flex flex-col gap-3 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:justify-between ${
          closed ? 'bg-amber-600' : 'bg-sindoor'
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.14] text-white">
            {closed ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
          </span>
          <div>
            <p className="font-display text-xl leading-tight text-white">
              {closed ? 'New bookings and payments are paused' : 'Online bookings are open'}
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/70">
              {closed
                ? settings.resume_at
                  ? `Sales reopen automatically on ${formatDateTime(settings.resume_at)}. You can reopen sooner by turning the pause off.`
                  : 'Visitors see the pause message and cannot start a booking or payment. Turn the pause off to reopen.'
                : autoReopened
                  ? 'The auto-reopen time has passed, so sales are live again. Turn the pause switch off to keep it that way.'
                  : 'Visitors can book and pay. Use the pause switch below to stop new sales temporarily.'}
            </p>
          </div>
        </div>
        <span className="shrink-0 self-start rounded-full border border-white/25 px-3 py-1 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-white/85 sm:self-auto">
          Reminders {settings.reminders_enabled ? 'on' : 'off'}
        </span>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Reminders sent" value={counts.sent.toLocaleString('en-IN')} note="Delivered by email" tone="lotus" />
        <Stat label="Pending" value={counts.pending.toLocaleString('en-IN')} note="Waiting for the next check" tone="amber" />
        <Stat label="Failed" value={counts.failed.toLocaleString('en-IN')} note="Can be queued again" tone="ink" />
        <Stat label="Skipped" value={counts.skipped.toLocaleString('en-IN')} note="No longer eligible or email off" tone="sky" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="overflow-hidden">
          <PanelHead
            title="Booking & payment switch"
            subtitle="Server-enforced — a disabled button is never the only protection."
          />
          <div className="space-y-5 px-5 py-5">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-sandal-2/60 px-4 py-3.5">
              <div>
                <p className="font-ui text-sm font-semibold text-ink">Pause new bookings and payments</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  New booking requests, payment orders and payment confirmations are rejected. Existing paid passes,
                  pass lookup, gate check-in and webhooks keep working.
                </p>
              </div>
              <Toggle
                checked={draft.paused}
                onChange={(paused) => setDraft({ ...draft, paused })}
                label={draft.paused ? 'Paused' : 'Open'}
              />
            </div>

            <Field
              label="Pause message — English"
              hint="Shown in the booking flow and on the event page while sales are paused."
            >
              <TextArea
                value={draft.message_en}
                onChange={(event) => setDraft({ ...draft, message_en: event.target.value })}
                maxLength={400}
                rows={3}
              />
            </Field>

            <Field label="Pause message — Hindi" hint="Visitors reading the site in Hindi see this message.">
              <TextArea
                value={draft.message_hi}
                onChange={(event) => setDraft({ ...draft, message_hi: event.target.value })}
                maxLength={500}
                rows={3}
              />
            </Field>

            <Field
              label="Reopen automatically at (optional)"
              hint="Leave empty to keep sales paused until you turn the switch off. The public page reopens on its own when this time passes."
            >
              <input
                type="datetime-local"
                value={draft.resume_at}
                onChange={(event) => setDraft({ ...draft, resume_at: event.target.value })}
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-saffron focus:ring-2 focus:ring-saffron/10"
              />
            </Field>

            {draft.paused && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  If you pause sales just before an event, update the pause message so devotees know where to get help.
                  The support email stays visible on the site.
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-line bg-sandal-2/40 px-5 py-3">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHead title="Automatic reminders" subtitle="Payment, 24-hour and 2-hour emails." />
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-sandal-2/60 px-4 py-3.5">
              <div>
                <p className="font-ui text-sm font-semibold text-ink">Send reminder emails</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Pending payments, then a QR pass with directions 24 hours and 2 hours before the event.
                </p>
              </div>
              <Toggle
                checked={draft.reminders_enabled}
                onChange={(reminders_enabled) => setDraft({ ...draft, reminders_enabled })}
                label={draft.reminders_enabled ? 'On' : 'Off'}
              />
            </div>

            <div className="rounded-xl border border-line px-4 py-3.5">
              <p className="font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Schedule</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
                <li className="flex items-start gap-2">
                  <Send size={13} className="mt-0.5 shrink-0 text-saffron" />
                  Payment reminder 25 minutes after an unpaid hold starts.
                </li>
                <li className="flex items-start gap-2">
                  <BellRing size={13} className="mt-0.5 shrink-0 text-saffron" />
                  24 hours before the event — QR attached with directions.
                </li>
                <li className="flex items-start gap-2">
                  <Mail size={13} className="mt-0.5 shrink-0 text-saffron" />
                  2 hours before the event — final gate reminder.
                </li>
              </ul>
            </div>

            <Button tone="ghost" className="w-full" onClick={() => void runReminders()} disabled={running}>
              <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
              {running ? 'Running reminder check…' : 'Run reminder check now'}
            </Button>
            <p className="text-[0.68rem] leading-relaxed text-muted">
              The server also runs this check automatically every few minutes. Duplicate sends are prevented per
              booking and reminder type.
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="overflow-hidden">
        <PanelHead
          title="Recent reminders"
          subtitle="Last 100 reminder jobs. Failed or skipped jobs can be queued again."
          actions={
            <Button tone="ghost" size="sm" onClick={() => void refreshReminders()}>
              <RefreshCw size={13} /> Refresh
            </Button>
          }
        />
        {reminders.length === 0 ? (
          <Empty
            title="No reminders yet"
            hint="Jobs appear here after a booking is held or as events approach. Run a check to scan now."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5">Reminder</th>
                  <th className="px-3 py-2.5">Devotee</th>
                  <th className="px-3 py-2.5">Booking</th>
                  <th className="px-3 py-2.5">Attempts</th>
                  <th className="px-3 py-2.5">Created</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {reminders.map((reminder) => (
                  <tr key={reminder.id} className="align-middle hover:bg-sandal-2/30">
                    <td className="px-5 py-3">
                      <p className="font-ui font-semibold text-ink">{TYPE_LABEL[reminder.reminder_type]}</p>
                      <p className="text-xs text-muted">{reminder.reference}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="max-w-[170px] truncate text-ink">{reminder.name}</p>
                      <p className="max-w-[170px] truncate text-xs text-muted">{reminder.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-sindoor/5 px-2 py-0.5 font-ui text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                        {reminder.booking_status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-display text-lg text-ink">{reminder.attempts}</td>
                    <td className="px-3 py-3 text-xs text-muted">{formatDateTime(reminder.created_at)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${STATUS_STYLE[reminder.status]}`}
                      >
                        {reminder.status}
                      </span>
                      {reminder.status === 'sent' && reminder.sent_at && (
                        <p className="mt-1 text-[0.64rem] text-muted">{formatDateTime(reminder.sent_at)}</p>
                      )}
                      {reminder.last_error && (
                        <p className="mt-1 max-w-[190px] truncate text-[0.64rem] text-red-600" title={reminder.last_error}>
                          {reminder.last_error}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {reminder.status === 'failed' || reminder.status === 'skipped' ? (
                        <Button
                          tone="ghost"
                          size="sm"
                          disabled={retryingId === reminder.id}
                          onClick={() => void retry(reminder)}
                        >
                          <RotateCcw size={13} /> {retryingId === reminder.id ? 'Queuing…' : 'Retry'}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-sandal-2/40 px-5 py-3 text-[0.7rem] text-muted">
          {counts.total.toLocaleString('en-IN')} reminder jobs · {counts.sent.toLocaleString('en-IN')} sent ·{' '}
          {counts.pending.toLocaleString('en-IN')} pending · {counts.failed.toLocaleString('en-IN')} failed
        </div>
      </Panel>
    </div>
  );
}
