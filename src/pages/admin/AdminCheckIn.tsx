import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { adminCheckIn, staffStats, type StaffStats } from '@/lib/adminApi';
import ScanConsole from '@/components/staff/ScanConsole';
import RecentCheckIns from '@/components/staff/RecentCheckIns';
import { Notice, PageHeader, Stat } from '@/components/admin/ui';

export default function AdminCheckIn() {
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await staffStats());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load gate statistics.');
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
              <li>If a pass fails, send the devotee to the help desk.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
