import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, ScrollText } from 'lucide-react';
import {
  adminAudit,
  type AdminAuditEntry,
  type AdminAuditResponse,
} from '@/lib/adminApi';
import {
  Button,
  Empty,
  Field,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  Select,
  Spinner,
  TextInput,
  formatDateTime,
} from '@/components/admin/ui';

const PAGE_SIZE = 25;

function actionTone(action: string) {
  if (action.startsWith('admin.')) return 'border-sky/30 bg-sky/10 text-sky-dark';
  if (action.includes('refunded')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (action.includes('cancelled') || action.includes('deleted') || action.includes('failed')) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  if (action.includes('amended') || action.includes('resent') || action.includes('messaged')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-line bg-sandal-2 text-muted';
}

function metaText(meta: unknown) {
  if (meta === null || meta === undefined) return '';
  if (typeof meta === 'string') {
    try {
      return JSON.stringify(JSON.parse(meta), null, 2);
    } catch {
      return meta;
    }
  }
  return JSON.stringify(meta, null, 2);
}

function actorLabel(entry: AdminAuditEntry) {
  if (entry.actor_type === 'admin') return entry.actor_name || `Admin #${entry.actor_id ?? '?'}`;
  if (entry.actor_type === 'system') return 'System';
  return 'Public visitor';
}

export default function AdminAudit() {
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState<'' | 'admin' | 'system' | 'public'>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminAudit({ page, pageSize: PAGE_SIZE, q, action, actorType, from, to }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, q, action, actorType, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = () => {
    setQInput('');
    setQ('');
    setAction('');
    setActorType('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const start = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = data ? Math.min(page * PAGE_SIZE, data.total) : 0;
  const filtersActive = Boolean(q || action || actorType || from || to);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Audit log"
        subtitle="Every admin action, payment event and gate decision is recorded here with actor, IP and metadata."
        actions={
          <>
            {filtersActive && (
              <Button tone="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
            <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <Panel className="mb-5">
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Search" className="sm:col-span-2">
            <TextInput
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Action, entity, reference, admin or IP"
            />
          </Field>
          <Field label="Action">
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All actions</option>
              {(data?.actions ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actor">
            <Select
              value={actorType}
              onChange={(e) => {
                setActorType(e.target.value as '' | 'admin' | 'system' | 'public');
                setPage(1);
              }}
            >
              <option value="">All actors</option>
              <option value="admin">Admin</option>
              <option value="system">System</option>
              <option value="public">Public visitor</option>
            </Select>
          </Field>
          <Field label="From">
            <TextInput
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHead
          title="Recorded events"
          subtitle="Newest first. Select a row to see the stored metadata."
          actions={<ScrollText size={16} className="text-saffron" />}
        />
        {loading && !data ? (
          <Spinner label="Loading audit log" />
        ) : !data || data.entries.length === 0 ? (
          <Empty
            title="No audit events match these filters"
            hint="Try clearing the date range or search, or wait for the next admin action."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Entity</th>
                  <th className="px-5 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.entries.map((entry) => {
                  const open = expanded === entry.id;
                  const meta = metaText(entry.meta);
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : entry.id)}
                        className="cursor-pointer align-middle hover:bg-sandal-2/30"
                      >
                        <td className="px-3 py-3 text-muted">
                          {meta ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{formatDateTime(entry.created_at)}</td>
                        <td className="px-3 py-3">
                          <p className="max-w-[180px] truncate text-ink">{actorLabel(entry)}</p>
                          {entry.actor_email && (
                            <p className="max-w-[180px] truncate text-[0.66rem] text-muted">{entry.actor_email}</p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[0.62rem] ${actionTone(entry.action)}`}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-[210px] truncate font-mono text-[0.68rem] text-ink">
                            {entry.entity || '—'}
                            {entry.entity_id ? ` #${entry.entity_id}` : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3 font-mono text-[0.68rem] text-muted">{entry.ip || '—'}</td>
                      </tr>
                      {open && (
                        <tr className="bg-sandal-2/30">
                          <td colSpan={6} className="px-5 py-3">
                            {meta ? (
                              <pre className="max-h-[280px] overflow-auto rounded-xl border border-line bg-white p-3 font-mono text-[0.68rem] leading-relaxed text-ink">
                                {meta}
                              </pre>
                            ) : (
                              <p className="text-xs text-muted">No metadata stored for this event.</p>
                            )}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sandal-2/40 px-5 py-3">
          <p className="text-[0.7rem] text-muted">
            {data
              ? data.total > 0
                ? `Showing ${start.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${data.total.toLocaleString('en-IN')} events`
                : 'No events'
              : 'Loading…'}
          </p>
          <div className="flex items-center gap-1.5">
            <Button tone="ghost" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>
              Previous
            </Button>
            <span className="px-2 text-[0.7rem] text-muted">
              Page {page} of {pages}
            </span>
            <Button tone="ghost" size="sm" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || loading}>
              Next
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
