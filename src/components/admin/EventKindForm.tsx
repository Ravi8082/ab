import { useEffect, useState } from 'react';
import type { EventKindLayout } from '@/lib/adminApi';
import { Button, Field, Select, TextInput, Toggle } from '@/components/admin/ui';

export interface KindValues {
  label_en: string;
  label_hi: string;
  layout: EventKindLayout;
  active: number;
}

/** Event types are admin-managed, so the same form serves the quick add and the types panel. */
export function EventKindForm({
  initial,
  busy,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: Partial<KindValues>;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: KindValues) => void;
}) {
  const [draft, setDraft] = useState<KindValues>({
    label_en: initial?.label_en ?? '',
    label_hi: initial?.label_hi ?? '',
    layout: initial?.layout ?? 'single',
    active: initial?.active ?? 1,
  });

  useEffect(() => {
    setDraft({
      label_en: initial?.label_en ?? '',
      label_hi: initial?.label_hi ?? '',
      layout: initial?.layout ?? 'single',
      active: initial?.active ?? 1,
    });
  }, [initial]);

  const patch = (values: Partial<KindValues>) => setDraft((current) => ({ ...current, ...values }));

  return (
    <div className="mt-2 grid gap-2 rounded-xl border border-line bg-sandal-2/60 p-3 sm:grid-cols-2">
      <Field label="Type name (English)">
        <TextInput
          value={draft.label_en}
          placeholder="Satsang"
          onChange={(e) => patch({ label_en: e.target.value })}
        />
      </Field>
      <Field label="Type name (हिंदी)">
        <TextInput value={draft.label_hi} placeholder="सत्संग" onChange={(e) => patch({ label_hi: e.target.value })} />
      </Field>
      <Field label="How it runs" hint="The public page has two slots: a city route and a single-venue fair.">
        <Select value={draft.layout} onChange={(e) => patch({ layout: e.target.value as EventKindLayout })}>
          <option value="route">City route — one date per city</option>
          <option value="single">Single venue — multi-day</option>
        </Select>
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle checked={draft.active === 1} onChange={(checked) => patch({ active: checked ? 1 : 0 })} label="Selectable" />
        <div className="flex gap-2">
          <Button tone="ghost" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" type="button" disabled={busy} onClick={() => onSubmit(draft)}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
