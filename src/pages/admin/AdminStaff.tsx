import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plus, RefreshCw, ScanLine, ShieldCheck, UserRound } from 'lucide-react';
import {
  adminCreateStaff,
  adminResetStaffPassword,
  adminStaffList,
  adminUpdateStaff,
  type AdminStaff as StaffAccount,
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
  Spinner,
  Stat,
  TextInput,
  formatDateTime,
} from '@/components/admin/ui';

const emptyDraft = { name: '', email: '', password: '' };

function suggestPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

export default function AdminStaff() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const result = await adminStaffList();
      setAccounts(result.staff);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = accounts.filter((account) => Number(account.active)).length;
  const totalCheckins = accounts.reduce((sum, account) => sum + Number(account.checkins), 0);

  const openAdd = () => {
    setDraft(emptyDraft);
    setModalError('');
    setAddOpen(true);
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      await adminCreateStaff({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
      });
      setAddOpen(false);
      setNotice(`${draft.name.trim()} can now sign in and scan passes at the gate.`);
      await load(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not create the staff account.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: StaffAccount) => {
    setBusyId(account.id);
    setError('');
    try {
      const active = Number(account.active) ? 0 : 1;
      await adminUpdateStaff(account.id, { active });
      setNotice(`${account.name} ${active ? 'can scan again' : 'has been disabled'}.`);
      await load(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  };

  const openReset = (account: StaffAccount) => {
    setResetTarget(account);
    setResetPassword('');
    setModalError('');
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    setModalError('');
    try {
      await adminResetStaffPassword(resetTarget.id, resetPassword);
      setNotice(`Password updated for ${resetTarget.name}. Share it securely.`);
      setResetTarget(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Staff accounts"
        subtitle="Create gate accounts, rotate passwords and switch scanners off when a shift ends."
        actions={
          <>
            <Button tone="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus size={14} /> Add staff
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-4 rounded-2xl bg-sindoor px-5 py-5 text-cream-on-dark sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-marigold">
            <ShieldCheck size={19} />
          </span>
          <div>
            <p className="font-display text-xl leading-tight text-white">Gate-only access</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-on-dark/60">
              Staff sign in through the same secure login and only reach the scanner. Content, prices, schedules
              and bookings stay locked to owners and managers.
            </p>
          </div>
        </div>
        <Link
          to="/staff"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-2 font-ui text-sm font-semibold text-cream-on-dark transition-colors hover:border-marigold/60 hover:text-marigold"
        >
          <ScanLine size={15} /> Open staff scanner
        </Link>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Active scanners" value={activeCount.toLocaleString('en-IN')} note="Can sign in today" tone="lotus" />
        <Stat label="Staff accounts" value={accounts.length.toLocaleString('en-IN')} note="Including disabled" />
        <Stat label="Gate check-ins" value={totalCheckins.toLocaleString('en-IN')} note="Completed by staff" tone="sky" />
      </div>

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

      <Panel className="overflow-hidden">
        <PanelHead
          title="Gate team"
          subtitle="Each account is an individual sign-in — never share one scanner login between people."
        />
        {loading && accounts.length === 0 ? (
          <Spinner label="Loading staff" />
        ) : accounts.length === 0 ? (
          <Empty title="No staff accounts yet" hint="Add your gate team so they can scan passes on event day." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-sandal-2/60 font-ui text-[0.6rem] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5">Staff</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Check-ins</th>
                  <th className="px-3 py-2.5">Last sign-in</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {accounts.map((account) => {
                  const active = Boolean(Number(account.active));
                  return (
                    <tr key={account.id} className="align-middle hover:bg-sandal-2/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-saffron/10 text-saffron-ink">
                            <UserRound size={16} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-ui font-semibold text-ink">{account.name}</p>
                            <p className="truncate text-xs text-muted">{account.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-sindoor/5 px-2 py-0.5 font-ui text-[0.62rem] uppercase tracking-[0.12em] text-muted">
                          {account.role}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-display text-lg text-ink">
                        {Number(account.checkins).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{formatDateTime(account.last_login_at)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${
                            active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-line bg-sandal-2 text-muted'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-muted'}`} />
                          {active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button tone="ghost" size="sm" onClick={() => openReset(account)}>
                            <KeyRound size={13} /> Reset password
                          </Button>
                          <Button
                            tone={active ? 'danger' : 'ghost'}
                            size="sm"
                            disabled={busyId === account.id}
                            onClick={() => void toggleActive(account)}
                          >
                            {busyId === account.id ? 'Saving…' : active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-sandal-2/40 px-5 py-3 text-[0.7rem] text-muted">
          {accounts.length} account{accounts.length === 1 ? '' : 's'} · {activeCount} active · Passwords are stored as
          bcrypt hashes and every change is recorded in the audit log.
        </div>
      </Panel>

      <Modal
        open={addOpen}
        title="Add a staff account"
        subtitle="They can sign in and scan passes at the gate."
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button tone="ghost" type="button" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-staff-form" disabled={saving}>
              {saving ? 'Creating…' : 'Create staff account'}
            </Button>
          </>
        }
      >
        <form id="add-staff-form" onSubmit={submitAdd} className="space-y-4">
          {modalError && <Notice tone="error">{modalError}</Notice>}
          <Field label="Full name">
            <TextInput
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Gate staff name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
            />
          </Field>
          <Field label="Email">
            <TextInput
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              placeholder="staff@example.com"
              required
              autoComplete="off"
            />
          </Field>
          <Field
            label="Temporary password"
            hint="At least 8 characters. Share it with the staff member securely — it is stored only as a bcrypt hash."
          >
            <div className="flex gap-2">
              <TextInput
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                placeholder="Set a temporary password"
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button
                tone="ghost"
                type="button"
                className="shrink-0"
                onClick={() => setDraft({ ...draft, password: suggestPassword() })}
              >
                Generate
              </Button>
            </div>
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title="Reset password"
        subtitle={resetTarget ? `${resetTarget.name} · ${resetTarget.email}` : undefined}
        onClose={() => setResetTarget(null)}
        footer={
          <>
            <Button tone="ghost" type="button" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="reset-password-form" disabled={resetting}>
              {resetting ? 'Saving…' : 'Set new password'}
            </Button>
          </>
        }
      >
        <form id="reset-password-form" onSubmit={submitReset} className="space-y-4">
          {modalError && <Notice tone="error">{modalError}</Notice>}
          <Field
            label="New password"
            hint="At least 8 characters. Any existing lockout is cleared when the password changes."
          >
            <div className="flex gap-2">
              <TextInput
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="New temporary password"
                required
                minLength={8}
                maxLength={200}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button
                tone="ghost"
                type="button"
                className="shrink-0"
                onClick={() => setResetPassword(suggestPassword())}
              >
                Generate
              </Button>
            </div>
          </Field>
          <p className="rounded-xl border border-line bg-sandal-2 px-4 py-3 text-xs leading-relaxed text-muted">
            Tell the new password to {resetTarget?.name ?? 'the staff member'} directly. Do not send it in public
            channels and ask them to change it with the owner after the event.
          </p>
        </form>
      </Modal>
    </div>
  );
}
