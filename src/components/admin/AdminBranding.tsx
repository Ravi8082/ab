import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Save, Upload } from 'lucide-react';
import { adminBrand, adminRemoveBrandImage, adminSaveBrand, adminUploadBrandImage } from '@/lib/adminApi';
import { useBrand } from '@/context/BrandContext';
import type { Brand, BrandField } from '@/lib/brand';
import { Button, Field, Notice, Panel, PanelHead, Spinner, TextInput } from '@/components/admin/ui';

const IMAGE_SLOTS: { field: BrandField; label: string; hint: string; box: string }[] = [
  {
    field: 'logo',
    label: 'Site logo',
    hint: 'Header, footer and the admin/scanner bars. Square works best.',
    box: 'h-20 w-20',
  },
  {
    field: 'favicon',
    label: 'Browser tab icon',
    hint: 'The small tab icon. Leave it empty to reuse the logo.',
    box: 'h-12 w-12',
  },
];

const MAX_BYTES = 2 * 1024 * 1024;

function readFileBase64(file: File) {
  return new Promise<{ name: string; mime: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve({ name: file.name, mime: file.type, data: result.includes(',') ? result.split(',')[1] : '' });
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

export default function AdminBranding() {
  const { refresh } = useBrand();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [draft, setDraft] = useState({ name_en: '', name_hi: '', tagline_en: '', tagline_hi: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyField, setBusyField] = useState<BrandField | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputs = useRef<Partial<Record<BrandField, HTMLInputElement | null>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { brand: next } = await adminBrand();
      setBrand(next);
      setDraft({
        name_en: next.name_en,
        name_hi: next.name_hi,
        tagline_en: next.tagline_en,
        tagline_hi: next.tagline_hi,
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the branding.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyBrand = async (next: Brand) => {
    setBrand(next);
    setDraft({
      name_en: next.name_en,
      name_hi: next.name_hi,
      tagline_en: next.tagline_en,
      tagline_hi: next.tagline_hi,
    });
    await refresh();
  };

  const saveNames = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { brand: next } = await adminSaveBrand(draft);
      await applyBrand(next);
      setNotice('Branding names saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the branding.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (field: BrandField, file: File) => {
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 2 MB. Please choose a smaller file.');
      return;
    }
    setBusyField(field);
    setError('');
    setNotice('');
    try {
      const payload = await readFileBase64(file);
      const { brand: next } = await adminUploadBrandImage(field, payload);
      await applyBrand(next);
      setNotice(`${field === 'logo' ? 'Logo' : 'Tab icon'} updated across the site.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setBusyField(null);
      const input = fileInputs.current[field];
      if (input) input.value = '';
    }
  };

  const remove = async (field: BrandField) => {
    if (!window.confirm(`Remove the ${field === 'logo' ? 'logo' : 'tab icon'}? The lotus mark will be used again.`)) return;
    setBusyField(field);
    setError('');
    setNotice('');
    try {
      const { brand: next } = await adminRemoveBrandImage(field);
      await applyBrand(next);
      setNotice('Image removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that image.');
    } finally {
      setBusyField(null);
    }
  };

  const dirty =
    brand !== null &&
    (draft.name_en !== brand.name_en ||
      draft.name_hi !== brand.name_hi ||
      draft.tagline_en !== brand.tagline_en ||
      draft.tagline_hi !== brand.tagline_hi);

  return (
    <Panel className="mb-5">
      <PanelHead
        title="Logo & tab icon"
        subtitle="Uploaded here, stored in the database and read by every page — including the browser tab icon."
      />
      <div className="p-5">
        {error && (
          <div className="mb-4">
            <Notice>{error}</Notice>
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice tone="success">{notice}</Notice>
          </div>
        )}

        {loading || !brand ? (
          <Spinner label="Loading branding" />
        ) : (
          <>
            <div className="flex flex-wrap gap-6">
              {IMAGE_SLOTS.map((slot) => {
                const image = brand[slot.field];
                const url = slot.field === 'logo' ? brand.logo_url : brand.favicon_url;
                const shownAsOwn = slot.field === 'favicon' ? Boolean(brand.favicon) : Boolean(brand.logo);
                return (
                  <div key={slot.field} className="flex items-start gap-4">
                    <div
                      className={`grid ${slot.box} shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-sandal-2`}
                    >
                      {url ? (
                        <img src={url} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <ImageOff size={20} className="text-muted" />
                      )}
                    </div>
                    <div>
                      <p className="font-ui text-[0.64rem] uppercase tracking-[0.14em] text-muted">{slot.label}</p>
                      <p className="mt-1 max-w-[240px] text-[0.68rem] leading-snug text-muted">{slot.hint}</p>
                      {shownAsOwn && image && (
                        <p className="mt-1 text-[0.68rem] text-muted">
                          {(image.size / 1024).toFixed(0)} KB · {image.mime.replace('image/', '')}
                        </p>
                      )}
                      {slot.field === 'favicon' && !brand.favicon && brand.logo && (
                        <p className="mt-1 text-[0.68rem] text-muted">Currently using the logo.</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer">
                          <input
                            ref={(node) => {
                              fileInputs.current[slot.field] = node;
                            }}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            disabled={busyField === slot.field}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void upload(slot.field, file);
                            }}
                          />
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sindoor px-3 py-1.5 font-ui text-xs font-semibold text-white transition-colors hover:bg-sindoor-deep">
                            <Upload size={13} />
                            {busyField === slot.field ? 'Uploading…' : shownAsOwn ? 'Replace' : 'Upload'}
                          </span>
                        </label>
                        {shownAsOwn && (
                          <Button
                            tone="ghost"
                            size="sm"
                            disabled={busyField === slot.field}
                            onClick={() => void remove(slot.field)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Site name (English)">
                <TextInput
                  value={draft.name_en}
                  maxLength={60}
                  onChange={(event) => setDraft((current) => ({ ...current, name_en: event.target.value }))}
                />
              </Field>
              <Field label="Site name (हिंदी)">
                <TextInput
                  value={draft.name_hi}
                  maxLength={60}
                  onChange={(event) => setDraft((current) => ({ ...current, name_hi: event.target.value }))}
                />
              </Field>
              <Field label="Tagline (English)" hint="The small line under the name in the header.">
                <TextInput
                  value={draft.tagline_en}
                  maxLength={90}
                  onChange={(event) => setDraft((current) => ({ ...current, tagline_en: event.target.value }))}
                />
              </Field>
              <Field label="Tagline (हिंदी)">
                <TextInput
                  value={draft.tagline_hi}
                  maxLength={90}
                  onChange={(event) => setDraft((current) => ({ ...current, tagline_hi: event.target.value }))}
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center gap-2">
              {dirty && <span className="chip chip--marigold">Unsaved changes</span>}
              <Button size="sm" onClick={() => void saveNames()} disabled={!dirty || saving}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save names'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
