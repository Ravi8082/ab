import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Mail, RefreshCw } from 'lucide-react';
import {
  adminEmails,
  type AdminEmailsResponse,
  type AdminEmailLog,
  type AdminOtpLog,
} from '@/lib/adminApi';
import {
  Button,
  Empty,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Spinner,
  Stat,
  formatDateTime,
} from '@/components/admin/ui';

const KIND_LABEL: Record<AdminEmailLog['kind'], string> = {
  otp: 'OTP code',
  pass: 'QR pass',
  reminder: 'Reminder',
  test: 'Test',
};

const EMAIL_STATUS_STYLE: Record<AdminEmailLog['status'], string> = {
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  logged: 'border-sky/30 bg-sky/10 text-sky-dark',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

const OTP_STATUS_STYLE: Record<AdminOtpLog['otp_status'], string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  active: 'border-amber-200 bg-amber-50 text-amber-700',
  expired: 'border-line bg-sandal-2 text-muted',
};

export default function AdminEmails() {
  const [data, setData] = useState<AdminEmailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      setData(await adminEmails());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the email log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Email & OTP log"
        subtitle="Every OTP, QR pass and reminder email is saved in the database with its delivery status."
        actions={
          <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {data && !data.smtpConfigured && (
        <div className="mb-4">
          <Notice tone="info">
            SMTP is not configured. Emails are generated and saved here with the status <strong>Logged</strong>, but
            they are not delivered until a Gmail App Password is added to the server environment.
          </Notice>
        </div>
      )}

      {data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Delivered" value={data.counts.sent.toLocaleString('en-IN')} note="Accepted by SMTP" tone="lotus" />
          <Stat
            label="Saved in dev"
            value={data.counts.logged.toLocaleString('en-IN')}
            note="Not delivered — SMTP off"
            tone="sky"
          />
          <Stat label="Failed" value={data.counts.failed.toLocaleString('en-IN')} note="SMTP errors" />
          <Stat
            label="OTP requests"
            value={data.otpCounts.total.toLocaleString('en-IN')}
            note={`${data.otpCounts.active} active · ${data.otpCounts.verified} verified`}
            tone="amber"
          />
        </div>
      )}

      <Panel className="mb-5 overflow-hidden">
        <PanelHead
          title="Outbound emails"
          subtitle="Latest 150 attempts. OTP codes and QR tokens are never written to this log."
          actions={<Mail size={16} className="text-saffron" />}
        />
        {loading && !data ? (
          <Spinner label="Loading email log" />
        ) : !data || data.emails.length === 0 ? (
          <Empty
            title="No emails recorded yet"
            hint="Request an OTP or complete a booking — the email will appear here immediately."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5">When</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Recipient</th>
                  <th className="px-3 py-2.5">Subject</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.emails.map((email) => (
                  <tr key={email.id} className="align-middle hover:bg-sandal-2/30">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{formatDateTime(email.created_at)}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-sindoor/5 px-2 py-0.5 font-ui text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                        {KIND_LABEL[email.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="max-w-[190px] truncate text-ink">{email.recipient}</p>
                      {email.reference && <p className="font-mono text-[0.66rem] text-muted">{email.reference}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <p className="max-w-[260px] truncate text-ink" title={email.subject}>
                        {email.subject}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${EMAIL_STATUS_STYLE[email.status]}`}
                      >
                        {email.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs text-muted">{email.provider === 'smtp' ? 'Gmail SMTP' : 'Server console'}</p>
                      {email.error && (
                        <p className="max-w-[220px] truncate text-[0.66rem] text-red-600" title={email.error}>
                          {email.error}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-sandal-2/40 px-5 py-3 text-[0.7rem] text-muted">
          {data ? `${data.counts.total.toLocaleString('en-IN')} email records stored in email_log` : 'Loading…'}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHead
          title="OTP activity"
          subtitle="Verification codes are stored as bcrypt hashes in event_booking_otps — never as plain text."
          actions={<KeyRound size={16} className="text-saffron" />}
        />
        {loading && !data ? (
          <Spinner label="Loading OTP log" />
        ) : !data || data.otps.length === 0 ? (
          <Empty title="No OTP requests yet" hint="Codes appear here as soon as a devotee asks for one." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[740px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5">Requested</th>
                  <th className="px-3 py-2.5">Reference</th>
                  <th className="px-3 py-2.5">Devotee</th>
                  <th className="px-3 py-2.5">Expires</th>
                  <th className="px-3 py-2.5">Attempts</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.otps.map((otp) => (
                  <tr key={otp.id} className="align-middle hover:bg-sandal-2/30">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">{formatDateTime(otp.created_at)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-ink">{otp.reference || `#${otp.booking_id}`}</td>
                    <td className="px-3 py-3">
                      <p className="max-w-[170px] truncate text-ink">{otp.name || '—'}</p>
                      <p className="max-w-[170px] truncate text-xs text-muted">{otp.email || '—'}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{formatDateTime(otp.expires_at)}</td>
                    <td className="px-3 py-3 font-display text-lg text-ink">{otp.attempts}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${OTP_STATUS_STYLE[otp.otp_status]}`}
                      >
                        {otp.otp_status}
                      </span>
                      {otp.consumed_at && (
                        <p className="mt-1 text-[0.64rem] text-muted">Verified {formatDateTime(otp.consumed_at)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-sandal-2/40 px-5 py-3 text-[0.7rem] text-muted">
          {data
            ? `${data.otpCounts.total.toLocaleString('en-IN')} codes generated · ${data.otpCounts.verified} verified · ${data.otpCounts.active} active · ${data.otpCounts.expired} expired`
            : 'Loading…'}
        </div>
      </Panel>
    </div>
  );
}
