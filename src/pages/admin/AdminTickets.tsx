import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { TicketType } from '@/types';

export default function AdminTickets() {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [events, setEvents] = useState<{ id: string; name_en: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<TicketType>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [tkRes, evRes] = await Promise.all([
      supabase.from('ticket_types').select('*'),
      supabase.from('events').select('id, name_en'),
    ]);
    setTickets((tkRes.data as TicketType[]) ?? []);
    setEvents((evRes.data as { id: string; name_en: string }[]) ?? []);
    setLoading(false);
  }

  async function save() {
    if (!form.label_en || !form.event_id) return;
    const id = form.id || `tk-${Date.now()}`;
    const payload = { ...form, id, active: form.active ?? true, max_quantity: form.max_quantity ?? 1, discount_percent: form.discount_percent ?? 0 };
    if (form.id) {
      await supabase.from('ticket_types').update(payload).eq('id', form.id);
    } else {
      await supabase.from('ticket_types').insert(payload);
    }
    await load();
    setShowForm(false);
    setForm({});
  }

  async function toggleActive(t: TicketType) {
    await supabase.from('ticket_types').update({ active: !t.active }).eq('id', t.id);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this ticket type?')) return;
    await supabase.from('ticket_types').delete().eq('id', id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-devanagari text-2xl text-ivory">Ticket types</h1>
        <button onClick={() => { setForm({ active: true, max_quantity: 1, discount_percent: 0 }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-saffron text-ivory font-mukta font-semibold text-sm hover:scale-105 transition-transform">
          <Plus size={16} /> New ticket
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" /></div>
      ) : (
        <div className="grid gap-3">
          {tickets.map((t) => {
            const ev = events.find((e) => e.id === t.event_id);
            return (
              <div key={t.id} className="glass rounded-2xl p-4 border border-gold/15 flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-mukta font-semibold text-ivory">{t.label_en} <span className="text-ivory/40 text-sm">/ {t.label_hi}</span></h3>
                  <p className="text-ivory/40 text-sm font-mukta">{ev?.name_en} · ₹{t.price.toLocaleString('en-IN')} · Max {t.max_quantity}</p>
                  {t.discount_percent > 0 && <p className="text-saffron text-xs font-mukta">{t.discount_percent}% off</p>}
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => toggleActive(t)} className={`p-1 ${t.active ? 'text-green-400' : 'text-ivory/30'}`}>
                    {t.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                  <button onClick={() => remove(t.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-ivory/60 hover:text-red-400"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md glass rounded-3xl border border-gold/25 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-devanagari text-xl text-gradient-gold mb-4">Ticket details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-ivory/70 font-mukta mb-1.5 block">Event</label>
                <select value={form.event_id ?? ''} onChange={(e) => setForm({ ...form, event_id: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none">
                  <option value="">Select event</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{e.name_en}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Label (EN)" value={form.label_en ?? ''} onChange={(e) => setForm({ ...form, label_en: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input placeholder="Label (HI)" value={form.label_hi ?? ''} onChange={(e) => setForm({ ...form, label_hi: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Price" value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input type="number" placeholder="Max quantity" value={form.max_quantity ?? ''} onChange={(e) => setForm({ ...form, max_quantity: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivary font-mukta focus:border-gold focus:outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="number" placeholder="Discount %" value={form.discount_percent ?? ''} onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input type="date" placeholder="From" value={form.discount_from ?? ''} onChange={(e) => setForm({ ...form, discount_from: e.target.value || null })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input type="date" placeholder="To" value={form.discount_to ?? ''} onChange={(e) => setForm({ ...form, discount_to: e.target.value || null })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              </div>
            </div>
            <button onClick={save} className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold flex items-center justify-center gap-2">
              <Save size={18} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
