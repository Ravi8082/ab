import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const inputClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder-muted/60 focus:border-saffron focus:outline-none transition-colors';

const smallButton =
  'inline-flex items-center gap-1 rounded-lg border border-line bg-sandal-2 px-2.5 py-1.5 text-xs font-semibold text-saffron-ink transition-colors hover:border-saffron/50';

function labelFor(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isLocalized(value: unknown): value is { en: string; hi: string } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as { en?: unknown }).en === 'string' &&
    typeof (value as { hi?: unknown }).hi === 'string'
  );
}

function emptyLike(value: Json): Json {
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    if (isLocalized(value)) return { en: '', hi: '' };
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptyLike(v)]));
  }
  return '';
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-[0.68rem] uppercase tracking-[0.14em] text-muted">{children}</span>;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className={`${inputClass} min-h-[74px] resize-y leading-relaxed`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function LocalizedInput({
  value,
  onChange,
}: {
  value: { en: string; hi: string };
  onChange: (v: { en: string; hi: string }) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <span className="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-muted">English</span>
        <TextInput value={value.en} onChange={(en) => onChange({ ...value, en })} />
      </div>
      <div>
        <span className="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-muted">हिंदी</span>
        <TextInput value={value.hi} onChange={(hi) => onChange({ ...value, hi })} />
      </div>
    </div>
  );
}

export function LocalizedListEditor({
  items,
  onChange,
  addLabel = 'Add item',
}: {
  items: { en: string; hi: string }[];
  onChange: (items: { en: string; hi: string }[]) => void;
  addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1">
            <LocalizedInput
              value={item}
              onChange={(next) => onChange(items.map((it, i) => (i === index ? next : it)))}
            />
          </div>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-400/40 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className={smallButton} onClick={() => onChange([...items, { en: '', hi: '' }])}>
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  );
}

function ArrayField({ name, value, onChange }: { name: string; value: Json[]; onChange: (v: Json[]) => void }) {
  const allLocalized = value.length > 0 && value.every(isLocalized);
  const allStrings = value.length > 0 && value.every((item) => typeof item === 'string');

  if (allLocalized) {
    return (
      <LocalizedListEditor
        items={value as { en: string; hi: string }[]}
        onChange={onChange}
        addLabel={`Add ${labelFor(name).toLowerCase()}`}
      />
    );
  }

  if (allStrings) {
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <TextInput
                value={String(item)}
                onChange={(next) => onChange(value.map((it, i) => (i === index ? next : it)))}
              />
            </div>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-red-400/40 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className={smallButton} onClick={() => onChange([...value, ''])}>
          <Plus size={13} /> Add {labelFor(name).toLowerCase()}
        </button>
      </div>
    );
  }

  const template = value.length > 0 ? value[0] : { en: '', hi: '' };
  return (
    <div className="space-y-3">
      {value.map((item, index) => (
        <div key={index} className="rounded-xl border border-line bg-sandal-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.62rem] uppercase tracking-[0.16em] text-muted font-mukta">
              {labelFor(name)} {index + 1}
            </span>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="text-muted transition-colors hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <Fields
            value={(item && typeof item === 'object' && !Array.isArray(item) ? item : {}) as Record<string, Json>}
            onChange={(next) => onChange(value.map((it, i) => (i === index ? next : it)))}
          />
        </div>
      ))}
      <button type="button" className={smallButton} onClick={() => onChange([...value, emptyLike(template as Json)])}>
        <Plus size={13} /> Add {labelFor(name).toLowerCase()}
      </button>
    </div>
  );
}

function Field({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Json;
  onChange: (v: Json) => void;
}) {
  if (isLocalized(value)) {
    return (
      <div>
        <Label>{labelFor(name)}</Label>
        <LocalizedInput value={value} onChange={onChange} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <Label>{labelFor(name)}</Label>
        <ArrayField name={name} value={value} onChange={onChange} />
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className="rounded-xl border border-line bg-sandal-2 p-3">
        <p className="mb-3 text-[0.68rem] uppercase tracking-[0.16em] text-saffron-ink/80">{labelFor(name)}</p>
        <Fields value={value as Record<string, Json>} onChange={onChange as (v: Record<string, Json>) => void} />
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-gold" />
        {labelFor(name)}
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <Label>{labelFor(name)}</Label>
        <input
          type="number"
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      </div>
    );
  }

  const text = value == null ? '' : String(value);
  const multiline = /(subtitle|desc|note|answer|^a$|body|address)/i.test(name) || text.length > 90;

  return (
    <div>
      <Label>{labelFor(name)}</Label>
      {multiline ? (
        <TextArea value={text} onChange={onChange} />
      ) : (
        <TextInput value={text} onChange={onChange} />
      )}
    </div>
  );
}

function Fields({ value, onChange }: { value: Record<string, Json>; onChange: (v: Record<string, Json>) => void }) {
  return (
    <div className="space-y-4">
      {Object.entries(value).map(([key, child]) => (
        <Field key={key} name={key} value={child} onChange={(next) => onChange({ ...value, [key]: next })} />
      ))}
    </div>
  );
}

export default function SectionEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return <Fields value={value as Record<string, Json>} onChange={onChange as (v: Record<string, Json>) => void} />;
}
