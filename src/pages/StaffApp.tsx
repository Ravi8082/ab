import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import { AdminProvider, useAdmin } from '@/context/AdminContext';
import AdminLogin from '@/pages/admin/AdminLogin';
import ScanConsole from '@/components/staff/ScanConsole';
import RecentCheckIns from '@/components/staff/RecentCheckIns';
import { staffScan, staffStats, type StaffStats } from '@/lib/adminApi';
import { Notice, Stat } from '@/components/admin/ui';

function StaffShell() {
  const { session, loading, signOut } = useAdmin();
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await staffStats());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load gate statistics.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-sindoor-deep">
        <div className="flex flex-col items-center gap-4">
          <div className="h-11 w-11 animate-spin rounded-full border-2 border-sky/25 border-t-marigold" />
          <p className="font-ui text-[0.66rem] uppercase tracking-[0.22em] text-cream-on-dark/55">
            Opening gate scanner
          </p>
        </div>
      </div>
    );
  }

  if (!session) return <AdminLogin variant="staff" />;

  const firstName = session.name.split(' ')[0];

  return (
    <div className="min-h-screen bg-[#F5F1E6]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-sindoor-deep">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <circle cx="20" cy="20" r="19" stroke="#13BBE8" strokeWidth="1.2" opacity=".5" />
              <path d="M20 8c3.6 5 3.6 10.8 0 15.8C16.4 18.8 16.4 13 20 8Z" fill="#EE2C8F" />
              <path d="M20 23.8c5.2-3 10.6-1.9 13.8 2.4-5.2 3-10.6 1.9-13.8-2.4Z" fill="#F39A1E" />
              <path d="M20 23.8C14.8 20.8 9.4 21.9 6.2 26.2c5.2 3 10.6 1.9 13.8-2.4Z" fill="#FFD21F" />
            </svg>
            <span className="leading-tight">
              <span className="block font-display text-[1.05rem] font-semibold text-white">Adhyatmik Bharat</span>
              <span className="block font-ui text-[0.56rem] uppercase tracking-[0.2em] text-marigold/80">
                Gate scanner
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {session.role !== 'staff' && (
              <Link
                to="/admin"
                className="hidden items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 font-ui text-xs text-cream-on-dark/70 transition-colors hover:border-marigold/50 hover:text-white sm:inline-flex"
              >
                <LayoutDashboard size={13} /> Admin panel
              </Link>
            )}
            <div className="hidden text-right sm:block">
              <p className="font-ui text-xs text-white">{session.name}</p>
              <p className="font-ui text-[0.56rem] uppercase tracking-[0.16em] text-marigold/75">{session.role}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 font-ui text-xs text-cream-on-dark/70 transition-colors hover:border-red-400/40 hover:text-red-300"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-ui text-[0.62rem] uppercase tracking-[0.2em] text-saffron-ink">Event day</p>
            <h1 className="mt-1 font-display text-[2rem] leading-tight text-ink">Namaste, {firstName}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Scan a QR pass or type the reference number to verify entry. Only paid passes are allowed through the
              gate.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-[0.64rem] font-semibold uppercase tracking-[0.12em] ${
              error
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 animate-pulse rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-500'}`}
            />
            {error ? 'Connection issue' : 'Live database'}
          </span>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Today at the gate"
            value={stats ? stats.todayCheckIns.toLocaleString('en-IN') : '—'}
            note="All staff"
            tone="lotus"
          />
          <Stat
            label="Your check-ins"
            value={stats ? stats.myCheckIns.toLocaleString('en-IN') : '—'}
            note="This account"
            tone="sky"
          />
          <Stat
            label="All-time entries"
            value={stats ? stats.totalCheckIns.toLocaleString('en-IN') : '—'}
            note="Verified passes"
            tone="amber"
          />
        </div>

        {error && (
          <div className="mb-4">
            <Notice tone="error">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="font-ui text-xs font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            </Notice>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ScanConsole scan={staffScan} onCheckedIn={load} title="Scan devotee pass" />

          <div className="space-y-4">
            <RecentCheckIns stats={stats} loading={statsLoading} onRefresh={load} />

            <div className="rounded-2xl bg-sindoor px-5 py-4 text-cream-on-dark">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.08] text-marigold">
                  <ShieldCheck size={17} />
                </span>
                <p className="font-display text-lg text-white">Before you scan</p>
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-cream-on-dark/65">
                <li>Check that the devotee is physically present with the pass.</li>
                <li>Only paid passes are allowed through the gate.</li>
                <li>Each pass allows one entry per event day, for as many days as it was bought for — same-day repeats and extra days are rejected.</li>
                <li>One QR covers every attendee in that booking.</li>
                <li>If a pass fails, send the devotee to the help desk.</li>
              </ul>
            </div>

            <Link
              to="/"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-4 py-2.5 font-ui text-sm text-muted transition-colors hover:border-saffron/40 hover:text-saffron-ink"
            >
              <ArrowLeft size={14} /> Back to event site
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function StaffApp() {
  return (
    <AdminProvider>
      <StaffShell />
    </AdminProvider>
  );
}
