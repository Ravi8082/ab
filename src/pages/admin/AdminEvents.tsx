import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Edit2, Trash2, Save, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EventItem } from '@/types';

export default function AdminEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<EventItem>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    setEvents((data as EventItem[]) ?? []);
    setLoading(false);
  }

  async function save() {
    if (!form.name_en || !form.name_hi) return;
    const id = form.id || `evt-${Date.now()}`;
    const payload = { ...form, id, status: form.status ?? 'draft' };
    if (form.id) {
      await supabase.from('events').update(payload).eq('id', form.id);
    } else {
      await supabase.from('events').insert(payload);
    }
    await load();
    setShowForm(false);
    setForm({});
    setEditing(null);
  }

  async function remove(id: string) {
    if (!confirm('Delete this event? This will also delete its tickets and cities.')) return;
    await supabase.from('events').delete().eq('id', id);
    await load();
  }

  function startEdit(ev: EventItem) {
    setForm(ev);
    setEditing(ev.id);
    setShowForm(true);
  }

  function startNew() {
    setForm({ status: 'draft' });
    setEditing(null);
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-devanagari text-2xl text-ivory">Events</h1>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-saffron text-ivory font-mukta font-semibold text-sm hover:scale-105 transition-transform">
          <Plus size={16} /> New event
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" /></div>
      ) : (
        <div className="grid gap-4">
          {events.map((ev) => (
            <div key={ev.id} className="glass rounded-2xl p-5 border border-gold/15 flex items-center justify-between">
              <div>
                <h3 className="font-devanagari text-lg text-ivory">{ev.name_en}</h3>
                <p className="text-ivory/40 text-sm font-mukta">{ev.name_hi} · {ev.date} · {ev.venue}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-mukta ${
                  ev.status === 'live' ? 'bg-green-500/10 text-green-400' :
                  ev.status === 'draft' ? 'bg-saffron/10 text-saffron' : 'bg-red-500/10 text-red-400'
                }`}>{ev.status}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(ev)} className="p-2 rounded-lg hover:bg-white/5 text-ivory/60 hover:text-gold"><Edit2 size={16} /></button>
                <button onClick={() => remove(ev.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-ivory/60 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-navy-900/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <motion.div
              className="relative w-full max-w-lg glass rounded-3xl border border-gold/25 p-6 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-devanagari text-xl text-gradient-gold">{editing ? 'Edit event' : 'New event'}</h3>
                <button onClick={() => setShowForm(false)} className="text-ivory/60 hover:text-gold"><X size={20} /></button>
              </div>

              <div className="space-y-3">
                <Input label="Name (English)" value={form.name_en ?? ''} onChange={(v) => setForm({ ...form, name_en: v })} />
                <Input label="Name (Hindi)" value={form.name_hi ?? ''} onChange={(v) => setForm({ ...form, name_hi: v })} />
                <TextArea label="Description (English)" value={form.description_en ?? ''} onChange={(v) => setForm({ ...form, description_en: v })} />
                <TextArea label="Description (Hindi)" value={form.description_hi ?? ''} onChange={(v) => setForm({ ...form, description_hi: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Date" type="date" value={form.date ?? ''} onChange={(v) => setForm({ ...form, date: v })} />
                  <Input label="Time" value={form.time ?? ''} onChange={(v) => setForm({ ...form, time: v })} />
                </div>
                <Input label="Venue" value={form.venue ?? ''} onChange={(v) => setForm({ ...form, venue: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Banner URL" value={form.banner_url ?? ''} onChange={(v) => setForm({ ...form, banner_url: v })} />
                  <div>
                    <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">Status</label>
                    <select
                      value={form.status ?? 'draft'}
                      onChange={(e) => setForm({ ...form, status: e.target.value as EventItem['status'] })}
                      className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none"
                    >
                      <option value="draft">Draft</option>
                      <option value="live">Live</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </div>

              <button onClick={save} className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold flex items-center justify-center gap-2">
                <Save size={18} /> Save
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none transition-colors"
      />
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none transition-colors resize-none"
      />
    </div>
  );
}
