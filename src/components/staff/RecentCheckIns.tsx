import { RefreshCw } from 'lucide-react';
import type { StaffStats } from '@/lib/adminApi';
import { Empty, Panel, PanelHead, Spinner, formatDateTime } from '@/components/admin/ui';

export default function RecentCheckIns({
  stats,
  loading,
  onRefresh,
}: {
  stats: StaffStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Recent entries"
        subtitle="Latest check-ins across all gates"
        actions={
          <button
            type="button"
            onClick={onRefresh}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-saffron/40 hover:text-saffron-ink"
            aria-label="Refresh recent entries"
          >
            <RefreshCw size={14} />
          </button>
        }
      />
      {loading && !stats ? (
        <Spinner label="Loading entries" />
      ) : stats?.recent.length ? (
        <ul className="divide-y divide-line/70">
          {stats.recent.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-ui text-sm font-semibold text-ink">{entry.name}</p>
                  <p className="font-mono text-[0.66rem] tracking-[0.08em] text-muted">{entry.reference}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 font-ui text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                  {Number(entry.qty)} {Number(entry.qty) === 1 ? 'guest' : 'guests'}
                </span>
              </div>
              <p className="mt-1 truncate text-[0.7rem] text-muted">
                {entry.event_en} · {entry.city_en}
                {entry.gate ? ` · ${entry.gate}` : ''}
              </p>
              <p className="text-[0.66rem] text-muted/80">
                {formatDateTime(entry.check_in_at)}
                {Number(entry.entries_allowed) > 1 ? (
                  <>
                    {' '}· Entry {Number(entry.entry_number)} of {Number(entry.entries_allowed)}
                  </>
                ) : Number(entry.calendar_days) > 1 ? (
                  <>
                    {' '}· single entry · event day {Number(entry.day_number)} of{' '}
                    {Number(entry.calendar_days)}
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No check-ins yet" hint="Scanned passes will appear here instantly." />
      )}
    </Panel>
  );
}
