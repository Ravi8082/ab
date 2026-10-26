import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import { adminChangeMyPassword } from '@/lib/adminApi';
import {
  Button,
  Field,
  Notice,
  PageHeader,
  Panel,
  PanelHead,
  TextInput,
} from '@/components/admin/ui';

export default function AdminAccount() {
  const { session } = useAdmin();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async () => {
    setError('');
    setNotice('');
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 10) {
      setError('The new password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password different from the current one.');
      return;
    }

    setSaving(true);
    try {
      await adminChangeMyPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password changed. Sign in again everywhere else — all other admin sessions were revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="My account"
        subtitle="Your admin sign-in details and password. This account can change live bookings and gate settings."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelHead title="Account" subtitle="Signed-in administrator" />
          <div className="space-y-3 px-5 py-5 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-saffron/15 text-saffron-ink">
                <ShieldCheck size={20} />
              </span>
              <div>
                <p className="font-ui font-semibold text-ink">{session?.name}</p>
                <p className="text-[0.72rem] text-muted">{session?.email}</p>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-sandal-2/50 px-4 py-3">
              <p className="font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">Role</p>
              <p className="mt-1 font-semibold capitalize text-ink">{session?.role}</p>
            </div>
            <p className="text-[0.72rem] leading-relaxed text-muted">
              Passwords are stored only as bcrypt hashes. If you forget this password, another owner account
              must reset it — nobody can read the current one.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Change password"
            subtitle="Minimum 10 characters, with upper case, lower case and a number. Other devices are signed out."
          />
          <div className="space-y-4 px-5 py-5">
            {error && <Notice tone="error">{error}</Notice>}
            {notice && <Notice tone="success">{notice}</Notice>}

            <Field label="Current password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password" hint="At least 10 characters, mixed case and a number">
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field label="Confirm new password">
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button onClick={() => void submit()} disabled={saving}>
                <KeyRound size={14} /> {saving ? 'Changing…' : 'Change password'}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
