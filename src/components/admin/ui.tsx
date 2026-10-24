import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export const inputClass =
  'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/55 focus:border-saffron focus:ring-2 focus:ring-saffron/10';

export const selectClass =
  'w-full appearance-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-saffron focus:ring-2 focus:ring-saffron/10';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="font-ui text-[0.64rem] uppercase tracking-[0.2em] text-saffron-ink">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-[2rem] leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-white shadow-[0_18px_40px_-34px_rgba(15,35,66,.45)] ${className}`}>
      {children}
    </div>
  );
}

export function PanelHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-xl leading-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.68rem] text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[86px] resize-y leading-relaxed ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${selectClass} ${props.className ?? ''}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onChange(!checked);
          }
        }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-saffron' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      {label}
    </label>
  );
}

type ButtonTone = 'primary' | 'ghost' | 'danger' | 'dark';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-saffron text-white hover:bg-saffron-dark shadow-sm',
  ghost: 'border border-line bg-white text-text hover:border-saffron/50 hover:text-saffron-ink',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  dark: 'bg-sindoor text-white hover:bg-sindoor-deep',
};

export function Button({
  tone = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-ui text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'px-3 py-1.5 text-[0.8rem]' : 'px-4 py-2.5'
      } ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  note,
  tone = 'ink',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'ink' | 'lotus' | 'sky' | 'amber';
}) {
  const color = {
    ink: 'text-ink',
    lotus: 'text-saffron-ink',
    sky: 'text-sky-dark',
    amber: 'text-amber-600',
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-4 shadow-[0_16px_36px_-32px_rgba(15,35,66,.4)]">
      <p className="font-ui text-[0.62rem] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={`mt-1.5 font-display text-[2rem] leading-none ${color}`}>{value}</p>
      {note && <p className="mt-1 text-[0.7rem] text-muted">{note}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-slate-100 text-slate-600 border-slate-200',
  captured: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  created: 'bg-sky/10 text-sky-dark border-sky/25',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-ui text-[0.64rem] uppercase tracking-[0.1em] ${
        STATUS_STYLES[status] ?? 'bg-sandal-2 text-muted border-line'
      }`}
    >
      {status}
    </span>
  );
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  if (!children) return null;
  const styles =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-sky/25 bg-sky/10 text-sky-dark';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-saffron" />
      {label}…
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-sindoor-deep/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-sandal shadow-2xl sm:rounded-[24px] ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-white px-5 py-4">
          <div>
            <h3 className="font-display text-xl text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-sandal-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-line bg-white px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDay(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
