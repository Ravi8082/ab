import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, RotateCcw, Save } from 'lucide-react';
import { adminContent, adminSaveContent, type AdminContentSection } from '@/lib/adminApi';
import SectionEditor from '@/components/admin/SectionEditor';
import { Button, Notice, PageHeader, Panel, Spinner, formatDateTime } from '@/components/admin/ui';

const SECTION_META: Record<string, { label: string; hint: string }> = {
  hero: { label: 'Hero', hint: 'Title, subtitle, date, statistics and top buttons' },
  yatra: { label: 'Yatra intro', hint: 'Choose-your-city section heading and pricing note' },
  expo: { label: 'Expo', hint: 'Expo heading, benefits, venue and closing copy' },
  process: { label: 'How it works', hint: 'The four booking steps shown to visitors' },
  faq: { label: 'FAQ', hint: 'Questions and answers in English and Hindi' },
  contact: { label: 'Help desk', hint: 'Support email, phone, WhatsApp and address' },
  legal_terms: { label: 'Terms & conditions', hint: 'The /terms page visitors must accept before paying' },
  legal_privacy: { label: 'Privacy policy', hint: 'The /privacy page, also linked from the cookie banner' },
  legal_refund: { label: 'Refund policy', hint: 'The /refund page shown at checkout and in the footer' },
};

const ORDER = ['hero', 'yatra', 'expo', 'process', 'faq', 'contact', 'legal_terms', 'legal_privacy', 'legal_refund'];

function sortSections(sections: AdminContentSection[]) {
  return [...sections].sort((a, b) => {
    const ai = ORDER.indexOf(a.content_key);
    const bi = ORDER.indexOf(b.content_key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export default function AdminContent() {
  const [sections, setSections] = useState<AdminContentSection[]>([]);
  const [activeKey, setActiveKey] = useState<string>('hero');
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminContent();
      const sorted = sortSections(result.sections);
      setSections(sorted);
      setDrafts(Object.fromEntries(sorted.map((section) => [section.content_key, section.value_json])));
      if (!sorted.some((section) => section.content_key === activeKey)) {
        setActiveKey(sorted[0]?.content_key ?? '');
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load page content.');
    } finally {
      setLoading(false);
    }
  }, [activeKey]);

  useEffect(() => {
    void load();
    // Load once; activeKey is only used to keep a valid selection on refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSection = sections.find((section) => section.content_key === activeKey) ?? null;
  const draft = drafts[activeKey] ?? {};
  const original = activeSection?.value_json ?? {};
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);

  const selectSection = (key: string) => {
    if (dirty && !window.confirm('Discard the unsaved changes in this section?')) return;
    if (activeSection) {
      setDrafts((current) => ({ ...current, [activeKey]: original }));
    }
    setActiveKey(key);
    setNotice('');
    setError('');
  };

  const save = async () => {
    if (!activeSection) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await adminSaveContent(activeKey, draft);
      setSections((current) =>
        current.map((section) =>
          section.content_key === activeKey
            ? { ...section, value_json: draft, updated_at: new Date().toISOString() }
            : section,
        ),
      );
      setNotice(`${SECTION_META[activeKey]?.label ?? activeKey} saved. The public page updates on next refresh.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this section.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!activeSection) return;
    setDrafts((current) => ({ ...current, [activeKey]: activeSection.value_json }));
    setNotice('');
  };

  return (
    <div>
      <PageHeader
        eyebrow="Public page"
        title="Page content"
        subtitle="Every heading, FAQ answer and contact detail on the event page is stored here. English and Hindi are edited side by side."
      />

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

      {loading ? (
        <Panel>
          <Spinner label="Loading content sections" />
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <Panel className="h-fit overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="font-ui text-[0.6rem] uppercase tracking-[0.16em] text-muted">Sections</p>
            </div>
            <div className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
              {sections.map((section) => {
                const meta = SECTION_META[section.content_key];
                const isActive = section.content_key === activeKey;
                const isDirty = JSON.stringify(drafts[section.content_key]) !== JSON.stringify(section.value_json);
                return (
                  <button
                    key={section.content_key}
                    onClick={() => selectSection(section.content_key)}
                    className={`flex shrink-0 items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors lg:w-full ${
                      isActive ? 'bg-sindoor text-white' : 'text-text hover:bg-sandal-2'
                    }`}
                  >
                    <FileText size={15} className={isActive ? 'mt-0.5 text-marigold' : 'mt-0.5 text-muted'} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-ui text-[0.82rem] font-semibold">
                        {meta?.label ?? section.content_key}
                        {isDirty && <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-marigold' : 'bg-saffron'}`} />}
                      </span>
                      <span className={`block whitespace-normal text-[0.64rem] leading-snug ${isActive ? 'text-white/50' : 'text-muted'}`}>
                        {meta?.hint ?? 'Custom content block'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-display text-xl text-ink">{SECTION_META[activeKey]?.label ?? activeKey}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {activeSection ? `Last saved ${formatDateTime(activeSection.updated_at)}` : 'Choose a section'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {dirty && <span className="chip chip--marigold">Unsaved changes</span>}
                <Button tone="ghost" size="sm" onClick={reset} disabled={!dirty || saving}>
                  <RotateCcw size={13} /> Reset
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
                  <Save size={13} /> {saving ? 'Saving…' : 'Save section'}
                </Button>
              </div>
            </div>
            <div className="p-5">
              {activeSection ? (
                <SectionEditor
                  value={draft}
                  onChange={(next) => setDrafts((current) => ({ ...current, [activeKey]: next }))}
                />
              ) : (
                <p className="text-sm text-muted">No content sections found. Run the database seed first.</p>
              )}
            </div>
            {dirty && (
              <div className="flex items-center gap-2 border-t border-line bg-sandal-2 px-5 py-3 text-xs text-muted">
                <CheckCircle2 size={14} className="text-saffron" /> Changes stay on this screen until you save.
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
