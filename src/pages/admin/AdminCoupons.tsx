import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Coupon } from '@/types';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Coupon>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);
  }

  async function save() {
    if (!form.code || form.value === undefined) return;
    const payload = { ...form, code: form.code.toUpperCase(), percent_or_flat: form.percent_or_flat ?? 'percent', active: form.active ?? true, used_count: form.used_count ?? 0 };
    if (form.id) {
      await supabase.from('coupons').update(payload).eq('id', form.id);
    } else {
      await supabase.from('coupons').insert(payload);
    }
    await load();
    setShowForm(false);
    setForm({});
  }

  async function toggleActive(c: Coupon) {
    await supabase.from('coupons').update({ active: !c.active }).eq('id', c.id);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this coupon?')) return;
    await supabase.from('coupons').delete().eq('id', id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-devanagari text-2xl text-ivory">Coupons</h1>
        <button onClick={() => { setForm({ percent_or_flat: 'percent', active: true, used_count: 0 }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-saffron text-ivory font-mukta font-semibold text-sm hover:scale-105 transition-transform">
          <Plus size={16} /> New coupon
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" /></div>
      ) : (
        <div className="grid gap-3">
          {coupons.map((c) => (
            <div key={c.id} className="glass rounded-2xl p-4 border border-gold/15 flex items-center justify-between">
              <div>
                <h3 className="font-mukta font-semibold text-gold-light">{c.code}</h3>
                <p className="text-ivory/40 text-sm font-mukta">
                  {c.percent_or_flat === 'percent' ? `${c.value}% off` : `₹${c.value} off`} ·
                  Exp: {c.expiry ?? 'never'} ·
                  Used: {c.used_count}/{c.usage_limit ?? '∞'}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => toggleActive(c)} className={`p-1 ${c.active ? 'text-green-400' : 'text-ivory/30'}`}>
                  {c.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
                <button onClick={() => { setForm(c); setShowForm(true); }} className="px-3 py-1.5 rounded-lg bg-gold/10 text-gold-light text-xs font-mukta hover:bg-gold/20">Edit</button>
                <button onClick={() => remove(c.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-ivory/60 hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-navy-900/80 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-sm glass rounded-3xl border border-gold/25 p-6">
            <h3 className="font-devanagari text-xl text-gradient-gold mb-4">{form.id ? 'Edit coupon' : 'New coupon'}</h3>
            <div className="space-y-3">
              <input placeholder="Code" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none uppercase" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.percent_or_flat ?? 'percent'} onChange={(e) => setForm({ ...form, percent_or_flat: e.target.value as 'percent' | 'flat' })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none">
                  <option value="percent">Percent</option>
                  <option value="flat">Flat (₹)</option>
                </select>
                <input type="number" placeholder="Value" value={form.value ?? ''} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.expiry ?? ''} onChange={(e) => setForm({ ...form, expiry: e.target.value || null })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
                <input type="number" placeholder="Usage limit" value={form.usage_limit ?? ''} onChange={(e) => setForm({ ...form, usage_limit: e.target.value ? Number(e.target.value) : null })} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none" />
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
