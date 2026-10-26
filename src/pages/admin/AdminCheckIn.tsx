import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  adminCheckIn,
  adminGateSettings,
  adminSaveGateSettings,
  adminScanAlerts,
  staffStats,
  type ScanAlert,
  type StaffStats,
} from '@/lib/adminApi';
import ScanConsole from '@/components/staff/ScanConsole';
import RecentCheckIns from '@/components/staff/RecentCheckIns';
import { Notice, PageHeader, Stat, formatDateTime } from '@/components/admin/ui';

const REASON_COPY: Record<string, string> = {
  already_scanned: 'Already scanned today',
  entries_exhausted: 'All entries used',
};

export default function AdminCheckIn() {
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [alerts, setAlerts] = useState<ScanAlert[]>([]);
  const [liveQrOnly, setLiveQrOnly] = useState(false);
  const [savingGate, setSavingGate] = useState(false);
  const [gateError, setGateError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [statsResult, alertsResult, gateResult] = await Promise.allSettled([
      staffStats(),
      adminScanAlerts(),
      adminGateSettings(),
    ]);
    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
      setError('');
    } else {
      const err = statsResult.reason;
      setError(err instanceof Error ? err.message : 'Could not load gate statistics.');
    }
    setAlerts(alertsResult.status === 'fulfilled' ? alertsResult.value.alerts : []);
    if (gateResult.status === 'fulfilled') setLiveQrOnly(gateResult.value.settings.live_qr_only);
    setLoading(false);
  }, []);

  const toggleLiveQr = async (next: boolean) => {
    setLiveQrOnly(next);
    setSavingGate(true);
    try {
      const saved = await adminSaveGateSettings(next);
      setLiveQrOnly(saved.settings.live_qr_only);
      setGateError('');
    } catch (err) {
      setLiveQrOnly(!next);
      setGateError(err instanceof Error ? err.message : 'Could not save the gate policy.');
    } finally {
      setSavingGate(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        eyebrow="Gate"
        title="Gate check-in"
        subtitle="Scan a devotee's QR pass or type the reference number. Every code is verified against the booking register and each pass allows entry only once."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Checked in today"
          value={stats ? stats.todayCheckIns.toLocaleString('en-IN') : '—'}
          note="Across all gates"
          tone="lotus"
        />
        <Stat
          label="Checked in by you"
          value={stats ? stats.myCheckIns.toLocaleString('en-IN') : '—'}
          note="Your scans at the gate"
          tone="sky"
        />
        <Stat
          label="All-time check-ins"
          value={stats ? stats.totalCheckIns.toLocaleString('en-IN') : '—'}
          note="Every verified pass"
          tone="amber"
        />
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {alerts.length > 0 && (
        <section className="mb-5 overflow-hidden rounded-2xl border border-red-200 bg-red-50">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-600 text-white">
                <ShieldAlert size={17} />
              </span>
              <div>
                <h2 className="font-display text-lg leading-tight text-red-900">
                  Duplicate gate attempts today
                </h2>
                <p className="text-[0.7rem] text-red-800/80">
                  Same pass presented again after entry — check the gates before allowing anyone in.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 font-ui text-[0.68rem] font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <ul className="divide-y divide-red-200/70">
            {alerts.map((alert) => (
              <li key={`${alert.booking_id}-${alert.reason}`} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-ui text-sm font-semibold text-red-900">{alert.name}</p>
                    <p className="font-mono text-[0.66rem] tracking-[0.08em] text-red-800/80">
                      {alert.reference}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 font-ui text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-white">
                    {REASON_COPY[alert.reason] ?? alert.reason} · {alert.attempts}{' '}
                    {alert.attempts === 1 ? 'try' : 'tries'}
                  </span>
                </div>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-red-900/90">
                  Tried at: <span className="font-semibold">{alert.gates}</span>
                  {alert.entry_gate ? (
                    <>
                      {' '}· Already entered via <span className="font-semibold">{alert.entry_gate}</span>
                      {alert.entry_staff ? ` (${alert.entry_staff})` : ''}
                    </>
                  ) : (
                    ' · no accepted entry recorded today'
                  )}
                </p>
                <p className="text-[0.64rem] text-red-800/70">Last attempt {formatDateTime(alert.last_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ScanConsole scan={adminCheckIn} onCheckedIn={load} title="Scan or enter a pass" />

        <div className="space-y-4">
          <RecentCheckIns stats={stats} loading={loading} onRefresh={load} />

          <div className="rounded-2xl border border-sindoor/10 bg-sindoor px-5 py-4 text-cream-on-dark">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.08] text-marigold">
                <ShieldCheck size={17} />
              </span>
              <p className="font-display text-lg text-white">Gate rules</p>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-cream-on-dark/65">
              <li>Only paid passes are allowed through the gate.</li>
              <li>A pass allows one entry per event day, only for the days it covers. Repeats and extra days are rejected.</li>
              <li>One QR covers every attendee on that booking.</li>
              <li>Fill in your gate name once — every scan is stamped with it, and a QR tried at a second gate is flagged above.</li>
              <li>If a pass fails, send the devotee to the help desk.</li>
            </ul>

            <div className="mt-4 flex items-start justify-between gap-3 border-t border-white/15 pt-3">
              <div className="min-w-0">
                <p className="font-ui text-xs font-semibold text-white">Live QR only</p>
                <p className="mt-0.5 text-[0.68rem] leading-snug text-cream-on-dark/60">
                  Reject printed QR passes and reference numbers. Devotees must show the 60-second live code
                  from their pass screen.
                </p>
                {gateError && <p className="mt-1 text-[0.68rem] text-red-200">{gateError}</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={liveQrOnly}
                aria-label="Accept only live QR passes"
                disabled={savingGate}
                onClick={() => void toggleLiveQr(!liveQrOnly)}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
                  liveQrOnly ? 'border-marigold bg-marigold/90' : 'border-white/25 bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${
                    liveQrOnly ? 'left-[1.35rem]' : 'left-0.5'
                  }`}
                  style={{ width: '1.125rem', height: '1.125rem' }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
