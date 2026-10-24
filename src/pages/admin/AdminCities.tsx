import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { CityItem } from '@/types';

export default function AdminCities() {
  const [cities, setCities] = useState<CityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CityItem>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('cities').select('*').order('city');
    setCities((data as CityItem[]) ?? []);
    setLoading(false);
  }

  async function save() {
    if (!form.city || !form.state) return;
    const id = form.id || `c-${Date.now()}`;
    const payload = { ...form, id, event_id: form.event_id ?? 'evt-sundarkand', active: form.active ?? true, capacity: form.capacity ?? 1000, booked: form.booked ?? 0 };
    if (form.id) {
      await supabase.from('cities').update(payload).eq('id', form.id);
    } else {
      await supabase.from('cities').insert(payload);
    }
    await load();
    setShowForm(false);
    setForm({});
  }

  async function toggleActive(c: CityItem) {
    await supabase.from('cities').update({ active: !c.active }).eq('id', c.id);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this city?')) return;
    await supabase.from('cities').delete().eq('id', id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-devanagari text-2xl text-ivory">Cities</h1>
        <button onClick={() => { setForm({ active: true, capacity: 1000, booked: 0, event_id: 'evt-sundarkand' }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-saffron text-ivory font-mukta font-semibold text-sm hover:scale-105 transition-transform">
          <Plus size={16} /> New city
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" /></div>
      ) : (
        <div className="grid gap-3">
          {cities.map((c) => {
            const pct = Math.round((c.booked / c.capacity) * 100);
            return (
              <div key={c.id} className="glass rounded-2xl p-4 border border-gold/15 flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-mukta font-semibold text-ivory">{c.city}, {c.state}</h3>
                  <p className="text-ivory/40 text-sm font-mukta">{c.date} · {c.venue || 'TBD'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-32 h-1.5 rounded-full bg-navy-800 overflow-hidden">
                      <div className={`h-full ${pct >= 100 ? 'bg-red-500' : 'bg-gold'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-ivory/40 text-xs font-mukta">{c.booked}/{c.capacity}</span>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => { setForm(c); setShowForm(true); }} className="px-3 py-1.5 rounded-lg bg-gold/10 text-gold-light text-xs font-mukta hover:bg-gold/20">Edit</button>
                  <button onClick={() => toggleActive(c)} className={`p-1 ${c.active ? 'text-green-400' : 'text-ivory/30'}`}>
                    {c.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                  <button onClick={() => remove(c.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-ivory/60 hover:text-red-400"><Trash2 size={16} /></button>
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
            <h3 className="font-devanagari text-xl text-gradient-gold mb-4">{form.id ? 'Edit city' : 'New city'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="City" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input placeholder="State" value={form.state ?? ''} onChange={(e) => setForm({ ...form, state: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input placeholder="Time" value={form.time ?? ''} onChange={(e) => setForm({ ...form, time: e.target.value })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              </div>
              <input placeholder="Venue" value={form.venue ?? ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Capacity" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input type="number" placeholder="Booked" value={form.booked ?? ''} onChange={(e) => setForm({ ...form, booked: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
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
