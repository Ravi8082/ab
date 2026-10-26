import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  adminCreateStaff,
  adminDeleteStaff,
  adminResetStaffPassword,
  adminSaveStaffKyc,
  adminSendStaffKycOtp,
  adminSetStaffKycStatus,
  adminStaffKyc,
  adminStaffList,
  adminUpdateStaff,
  adminUploadStaffKycFile,
  adminVerifyStaffKycOtp,
  staffKycFileUrl,
  type AdminStaff as StaffAccount,
  type StaffKyc,
  type StaffKycDocType,
  type StaffKycFileKind,
  type StaffKycInput,
  type StaffKycStatus,
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
  Select,
  Spinner,
  Stat,
  TextArea,
  TextInput,
  formatDateTime,
} from '@/components/admin/ui';

const emptyDraft = { name: '', email: '', password: '' };

const DOC_TYPES: { value: StaffKycDocType; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar card' },
  { value: 'pan', label: 'PAN card' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'other', label: 'Other government ID' },
];

const FILE_ROWS: { kind: StaffKycFileKind; label: string }[] = [
  { kind: 'aadhaar', label: 'Aadhaar scan' },
  { kind: 'pan', label: 'PAN scan' },
  { kind: 'other', label: 'Other document scan' },
];

const KYC_STATUS_LABELS: Record<StaffKycStatus, string> = {
  pending: 'Pending',
  otp_pending: 'OTP pending',
  docs_uploaded: 'Docs received',
  verified: 'Verified',
  rejected: 'Rejected',
};

const KYC_STATUS_STYLES: Record<StaffKycStatus, string> = {
  pending: 'border-line bg-sandal-2 text-muted',
  otp_pending: 'border-sky/25 bg-sky/10 text-sky-dark',
  docs_uploaded: 'border-amber-200 bg-amber-50 text-amber-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function suggestPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function readFileBase64(file: File) {
  return new Promise<{ name: string; mime: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const data = result.includes(',') ? result.split(',')[1] : '';
      resolve({ name: file.name, mime: file.type, data });
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
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

  const [kycTarget, setKycTarget] = useState<StaffAccount | null>(null);
  const [kyc, setKyc] = useState<StaffKyc | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');
  const [kycNotice, setKycNotice] = useState('');
  const [identity, setIdentity] = useState({
    mobile: '',
    docType: 'aadhaar' as StaffKycDocType,
    aadhaar: '',
    pan: '',
    other: '',
    notes: '',
  });
  const [revealed, setRevealed] = useState<{ aadhaar: string | null; pan: string | null } | null>(null);
  const [uploads, setUploads] = useState<Partial<Record<StaffKycFileKind, { name: string; mime: string; data: string }>>>(
    {},
  );
  const [uploadingKind, setUploadingKind] = useState<StaffKycFileKind | null>(null);
  const [savingKyc, setSavingKyc] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<'verified' | 'rejected' | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  const applyKyc = useCallback((next: StaffKyc) => {
    setKyc(next);
    setIdentity({
      mobile: next.mobile ?? '',
      docType: next.docType,
      aadhaar: '',
      pan: '',
      other: next.otherDocNo ?? '',
      notes: next.notes ?? '',
    });
    setUploads({});
    setOtpCode('');
  }, []);

  const loadKyc = useCallback(
    async (id: number) => {
      setKycLoading(true);
      setKycError('');
      try {
        const result = await adminStaffKyc(id);
        applyKyc(result.kyc);
      } catch (err) {
        setKycError(err instanceof Error ? err.message : 'Could not load the KYC record.');
      } finally {
        setKycLoading(false);
      }
    },
    [applyKyc],
  );

  const openKyc = (account: StaffAccount) => {
    setKycTarget(account);
    setKyc(null);
    setRevealed(null);
    setKycError('');
    setKycNotice('');
    void loadKyc(account.id);
  };

  const closeKyc = () => {
    setKycTarget(null);
    setKyc(null);
    setRevealed(null);
    setUploads({});
    setKycError('');
    setKycNotice('');
  };

  const activeCount = accounts.filter((account) => Number(account.active)).length;
  const verifiedCount = accounts.filter((account) => account.kyc?.status === 'verified').length;
  const pendingKyc = accounts.filter(
    (account) => (account.kyc?.status ?? 'pending') !== 'verified' && (account.kyc?.status ?? 'pending') !== 'rejected',
  ).length;
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
      const created = await adminCreateStaff({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
      });
      setAddOpen(false);
      setNotice(`${draft.name.trim()} can sign in and scan passes. Add their identity documents now.`);
      await load(false);
      openKyc({
        id: created.id,
        name: draft.name.trim(),
        email: draft.email.trim(),
        role: 'staff',
        active: 1,
        last_login_at: null,
        created_at: '',
        checkins: 0,
      });
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Could not create the staff account.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: StaffAccount) => {
    const active = Number(account.active) ? 1 : 0;
    if (active && !window.confirm(`Disable ${account.name}? Their scanner sign-in stops immediately.`)) return;
    if (!active && !window.confirm(`Enable ${account.name}? They will be able to scan passes again.`)) return;
    setBusyId(account.id);
    setError('');
    try {
      await adminUpdateStaff(account.id, { active: active ? 0 : 1 });
      setNotice(`${account.name} ${active ? 'has been disabled' : 'can scan again'}.`);
      await load(false);
      if (kycTarget?.id === account.id) {
        setKycTarget({ ...account, active: active ? 0 : 1 });
      }
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

  const saveKycDetails = async () => {
    if (!kycTarget) return;
    if (identity.mobile.trim() && !/^[6-9]\d{9}$/.test(identity.mobile.trim())) {
      setKycError('Enter a valid 10-digit Indian mobile number, or leave it empty.');
      return;
    }
    if (identity.aadhaar.trim() && !/^\d{12}$/.test(identity.aadhaar.trim())) {
      setKycError('An Aadhaar number has 12 digits.');
      return;
    }
    if (identity.pan.trim() && !/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(identity.pan.trim())) {
      setKycError('A PAN is 10 characters like ABCDE1234F.');
      return;
    }

    const payload: StaffKycInput = {
      mobile: identity.mobile.trim() || null,
      docType: identity.docType,
      otherDocNo: identity.other.trim() || null,
      notes: identity.notes.trim() || null,
    };
    if (identity.aadhaar.trim()) payload.aadhaarNumber = identity.aadhaar.trim();
    if (identity.pan.trim()) payload.panNumber = identity.pan.trim().toUpperCase();

    setSavingKyc(true);
    setKycError('');
    setKycNotice('');
    try {
      const result = await adminSaveStaffKyc(kycTarget.id, payload);
      applyKyc(result.kyc);
      setKycNotice('Identity details saved.');
      await load(false);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not save the KYC details.');
    } finally {
      setSavingKyc(false);
    }
  };

  const toggleReveal = async () => {
    if (!kycTarget) return;
    if (revealed) {
      setRevealed(null);
      return;
    }
    try {
      const result = await adminStaffKyc(kycTarget.id, true);
      setRevealed({
        aadhaar: result.kyc.aadhaarNumber ?? null,
        pan: result.kyc.panNumber ?? null,
      });
      setKycNotice('Full numbers revealed. This view is recorded in the audit log.');
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not reveal the document numbers.');
    }
  };

  const pickFile = async (kind: StaffKycFileKind, file: File | null) => {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      setKycError('Documents must be a JPG, PNG, WEBP image or a PDF.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setKycError('Each document must be 4 MB or smaller.');
      return;
    }
    try {
      const data = await readFileBase64(file);
      setUploads((current) => ({ ...current, [kind]: data }));
      setKycError('');
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not read the selected file.');
    }
  };

  const uploadKind = async (kind: StaffKycFileKind) => {
    if (!kycTarget) return;
    const picked = uploads[kind];
    if (!picked) return;
    setUploadingKind(kind);
    setKycError('');
    setKycNotice('');
    try {
      const result = await adminUploadStaffKycFile(kycTarget.id, kind, {
        mime: picked.mime,
        data: picked.data,
      });
      applyKyc(result.kyc);
      setKycNotice('Document uploaded.');
      await load(false);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not upload the document.');
    } finally {
      setUploadingKind(null);
    }
  };

  const sendOtp = async () => {
    if (!kycTarget) return;
    setSendingOtp(true);
    setKycError('');
    setKycNotice('');
    try {
      const result = await adminSendStaffKycOtp(kycTarget.id);
      setKycNotice(
        result.delivered
          ? `Verification code emailed to ${kycTarget.email}. It expires in 10 minutes.`
          : 'SMTP is not configured, so the code was written to the server log instead of being emailed.',
      );
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not send the verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!kycTarget) return;
    setVerifyingOtp(true);
    setKycError('');
    setKycNotice('');
    try {
      const result = await adminVerifyStaffKycOtp(kycTarget.id, otpCode.trim());
      applyKyc(result.kyc);
      setKycNotice('Email verified.');
      await load(false);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not verify the code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const decide = async (status: 'verified' | 'rejected') => {
    if (!kycTarget) return;
    if (status === 'rejected' && identity.notes.trim().length < 3) {
      setKycError('Add a short reason in the notes before rejecting the KYC.');
      return;
    }
    setDecisionBusy(status);
    setKycError('');
    setKycNotice('');
    try {
      const result = await adminSetStaffKycStatus(
        kycTarget.id,
        status,
        identity.notes.trim() || undefined,
      );
      applyKyc(result.kyc);
      setKycNotice(status === 'verified' ? 'KYC marked verified.' : 'KYC rejected.');
      await load(false);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not update the KYC status.');
    } finally {
      setDecisionBusy(null);
    }
  };

  const purgeStaff = async () => {
    if (!kycTarget) return;
    if (
      !window.confirm(
        `Permanently delete ${kycTarget.name}'s account, KYC record and documents? This cannot be undone. Accounts with gate check-ins must be disabled instead.`,
      )
    ) {
      return;
    }
    setDeleteBusy(true);
    setKycError('');
    try {
      await adminDeleteStaff(kycTarget.id);
      closeKyc();
      setNotice(`${kycTarget.name}'s staff account and documents were deleted.`);
      await load(false);
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'Could not delete the staff account.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const kycStatus = kyc?.status ?? 'pending';

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Staff accounts"
        subtitle="Create gate accounts, collect Aadhaar/PAN documents, verify the staff email by OTP, and block or delete an account when a shift ends."
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
            <p className="font-display text-xl leading-tight text-white">Gate-only access with identity on file</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-on-dark/60">
              Staff sign in through the same secure login and only reach the scanner. KYC numbers stay masked in the
              panel; revealing them is recorded in the audit log, and documents are stored outside the web root.
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

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active scanners" value={activeCount.toLocaleString('en-IN')} note="Can sign in today" tone="lotus" />
        <Stat label="KYC verified" value={verifiedCount.toLocaleString('en-IN')} note="Documents checked" tone="sky" />
        <Stat label="KYC pending" value={pendingKyc.toLocaleString('en-IN')} note="Awaiting documents or review" tone="amber" />
        <Stat label="Gate check-ins" value={totalCheckins.toLocaleString('en-IN')} note="Completed by staff" />
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
                  <th className="px-3 py-2.5">Mobile</th>
                  <th className="px-3 py-2.5">KYC</th>
                  <th className="px-3 py-2.5">Check-ins</th>
                  <th className="px-3 py-2.5">Last sign-in</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {accounts.map((account) => {
                  const active = Boolean(Number(account.active));
                  const status = account.kyc?.status ?? 'pending';
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
                      <td className="px-3 py-3 text-xs text-muted">{account.kyc?.mobile ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 font-ui text-[0.6rem] uppercase tracking-[0.1em] ${KYC_STATUS_STYLES[status]}`}
                        >
                          {KYC_STATUS_LABELS[status]}
                        </span>
                        <div className="mt-1 text-[0.62rem] text-muted">
                          {account.kyc?.hasDocs ? 'Documents on file' : 'No documents yet'}
                        </div>
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
                          <Button tone="ghost" size="sm" onClick={() => openKyc(account)}>
                            <FileCheck2 size={13} /> KYC & docs
                          </Button>
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
          bcrypt hashes and every KYC change is recorded in the audit log.
        </div>
      </Panel>

      <Modal
        open={addOpen}
        title="Add a staff account"
        subtitle="Create the sign-in, then collect identity documents in the next step."
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
          <Field label="Email" hint="The staff member signs in with this address; OTP verification is sent here">
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
        open={Boolean(kycTarget)}
        title={kycTarget ? `KYC & documents — ${kycTarget.name}` : 'KYC & documents'}
        subtitle={kycTarget ? kycTarget.email : undefined}
        onClose={closeKyc}
        wide
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button tone="danger" size="sm" onClick={() => void purgeStaff()} disabled={deleteBusy}>
              <Trash2 size={13} /> {deleteBusy ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <div className="flex items-center gap-2">
              <Button tone="ghost" onClick={closeKyc}>
                Close
              </Button>
              <Button onClick={() => void saveKycDetails()} disabled={savingKyc || !kyc}>
                {savingKyc ? 'Saving…' : 'Save identity details'}
              </Button>
            </div>
          </div>
        }
      >
        {kycLoading && !kyc ? (
          <Spinner label="Loading KYC record" />
        ) : (
          <div className="space-y-4">
            {kycError && <Notice tone="error">{kycError}</Notice>}
            {kycNotice && <Notice tone="success">{kycNotice}</Notice>}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3">
              <div>
                <p className="font-ui text-sm font-semibold text-ink">{kyc?.name ?? kycTarget?.name}</p>
                <p className="text-[0.7rem] text-muted">{kyc?.email ?? kycTarget?.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 font-ui text-[0.62rem] font-semibold uppercase tracking-[0.1em] ${KYC_STATUS_STYLES[kycStatus]}`}
                >
                  {KYC_STATUS_LABELS[kycStatus]}
                </span>
                {kyc && (
                  <Button tone="ghost" size="sm" onClick={() => void toggleReveal()}>
                    {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                    {revealed ? 'Hide numbers' : 'Reveal numbers'}
                  </Button>
                )}
              </div>
            </div>

            {revealed && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                <p>
                  Aadhaar: <span className="font-mono font-semibold">{revealed.aadhaar ?? '—'}</span>
                </p>
                <p>
                  PAN: <span className="font-mono font-semibold">{revealed.pan ?? '—'}</span>
                </p>
                <p className="mt-1 text-[0.66rem] text-amber-800/80">This reveal is recorded in the audit log.</p>
              </div>
            )}

            <div className="rounded-xl border border-line bg-white p-4">
              <p className="mb-3 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">
                Identity details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mobile number">
                  <TextInput
                    value={identity.mobile}
                    inputMode="numeric"
                    onChange={(event) =>
                      setIdentity({ ...identity, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })
                    }
                    placeholder="10-digit mobile"
                  />
                </Field>
                <Field label="Primary document">
                  <Select
                    value={identity.docType}
                    onChange={(event) =>
                      setIdentity({ ...identity, docType: event.target.value as StaffKycDocType })
                    }
                  >
                    {DOC_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field
                  label="Aadhaar number"
                  hint={kyc?.aadhaarMasked ? `Saved: ${kyc.aadhaarMasked}` : '12 digits'}
                >
                  <TextInput
                    value={identity.aadhaar}
                    inputMode="numeric"
                    onChange={(event) =>
                      setIdentity({ ...identity, aadhaar: event.target.value.replace(/\D/g, '').slice(0, 12) })
                    }
                    placeholder={kyc?.aadhaarMasked ?? 'Leave empty if not collected'}
                  />
                </Field>
                <Field label="PAN" hint={kyc?.panMasked ? `Saved: ${kyc.panMasked}` : 'Like ABCDE1234F'}>
                  <TextInput
                    value={identity.pan}
                    onChange={(event) =>
                      setIdentity({ ...identity, pan: event.target.value.toUpperCase().slice(0, 10) })
                    }
                    placeholder={kyc?.panMasked ?? 'Leave empty if not collected'}
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label="Other document no." hint="Voter ID, driving licence or other">
                  <TextInput
                    value={identity.other}
                    onChange={(event) => setIdentity({ ...identity, other: event.target.value.slice(0, 60) })}
                    placeholder="Document number"
                  />
                </Field>
              </div>
              <p className="mt-2 text-[0.68rem] leading-relaxed text-muted">
                Entering a new Aadhaar or PAN replaces the saved number. Leave the field empty to keep the existing
                masked number.
              </p>
              <div className="mt-3">
                <Field label="KYC notes" hint="Reason for rejection, document discrepancies, anything the next reviewer should know">
                  <TextArea
                    value={identity.notes}
                    onChange={(event) => setIdentity({ ...identity, notes: event.target.value.slice(0, 255) })}
                    placeholder="Optional notes"
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-white p-4">
              <p className="mb-2 font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">Documents</p>
              {FILE_ROWS.map((row) => (
                <div
                  key={row.kind}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 py-2.5 first:border-t-0"
                >
                  <div>
                    <p className="font-ui text-sm font-semibold text-ink">{row.label}</p>
                    <p className="text-[0.66rem] text-muted">
                      {kyc?.files[row.kind] ? 'Uploaded' : 'Not uploaded yet'} · JPG, PNG, WEBP or PDF up to 4 MB
                    </p>
                    {uploads[row.kind] && (
                      <p className="text-[0.66rem] text-sky-dark">Selected: {uploads[row.kind]?.name}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {kyc?.files[row.kind] && (
                      <a
                        href={staffKycFileUrl(kycTarget?.id ?? 0, row.kind)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-ui text-[0.72rem] font-semibold text-saffron-ink underline"
                      >
                        View
                      </a>
                    )}
                    <label className="cursor-pointer rounded-xl border border-line bg-white px-3 py-1.5 font-ui text-[0.76rem] font-semibold text-text transition-colors hover:border-saffron/50">
                      Choose file
                      <input
                        type="file"
                        className="hidden"
                        accept={ALLOWED_MIME.join(',')}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          event.currentTarget.value = '';
                          void pickFile(row.kind, file);
                        }}
                      />
                    </label>
                    {uploads[row.kind] && (
                      <Button
                        size="sm"
                        disabled={uploadingKind !== null}
                        onClick={() => void uploadKind(row.kind)}
                      >
                        {uploadingKind === row.kind ? 'Uploading…' : 'Upload'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-ui text-sm font-semibold text-ink">Email verification</p>
                  <p className="text-[0.68rem] text-muted">
                    {kyc?.emailVerifiedAt
                      ? `Verified ${formatDateTime(kyc.emailVerifiedAt)}`
                      : 'Not verified yet — send a 6-digit code to the staff email.'}
                  </p>
                </div>
                <Button tone="ghost" size="sm" onClick={() => void sendOtp()} disabled={sendingOtp}>
                  {sendingOtp ? 'Sending…' : 'Send code'}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <TextInput
                  value={otpCode}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  className="max-w-[180px] font-mono tracking-[0.3em]"
                />
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => void verifyOtp()}
                  disabled={verifyingOtp || otpCode.trim().length !== 6}
                >
                  {verifyingOtp ? 'Verifying…' : 'Verify code'}
                </Button>
              </div>
              <p className="mt-2 text-[0.66rem] leading-relaxed text-muted">
                Without SMTP the code is only written to the server log; identity documents can still be reviewed
                and verified by the owner.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-white p-4">
              <p className="font-ui text-sm font-semibold text-ink">Verification decision</p>
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
                Marking KYC verified requires the selected document’s number and scan. Rejecting requires a reason in
                the notes above.
              </p>
              {kyc?.status === 'verified' && (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[0.7rem] text-emerald-800">
                  Verified {formatDateTime(kyc.verifiedAt)}
                  {kyc.verifiedByName ? ` by ${kyc.verifiedByName}` : ''}.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  tone="dark"
                  onClick={() => void decide('verified')}
                  disabled={decisionBusy !== null || kyc?.status === 'verified'}
                >
                  <ShieldCheck size={13} /> {decisionBusy === 'verified' ? 'Saving…' : 'Mark KYC verified'}
                </Button>
                <Button
                  size="sm"
                  tone="danger"
                  onClick={() => void decide('rejected')}
                  disabled={decisionBusy !== null || kyc?.status === 'rejected'}
                >
                  <ShieldAlert size={13} /> {decisionBusy === 'rejected' ? 'Saving…' : 'Reject KYC'}
                </Button>
              </div>
            </div>
          </div>
        )}
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
