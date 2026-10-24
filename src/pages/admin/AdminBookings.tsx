import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Download, Loader2, CheckCircle, XCircle, RotateCcw } from 'lucide-react';

interface BookingRow {
  id: string;
  booking_code: string;
  event_id: string;
  ticket_type_id: string;
  city_id: string | null;
  persons: number;
  name: string;
  phone: string;
  email: string;
  amount: number;
  status: string;
  checked_in: boolean;
  created_at: string;
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [filtered, setFiltered] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [events, setEvents] = useState<{ id: string; name_en: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; city: string }[]>([]);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = bookings;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((b) =>
        b.name.toLowerCase().includes(q) ||
        b.phone.includes(q) ||
        b.email.toLowerCase().includes(q) ||
        b.booking_code.toLowerCase().includes(q)
      );
    }
    if (filterEvent) result = result.filter((b) => b.event_id === filterEvent);
    if (filterStatus) result = result.filter((b) => b.status === filterStatus);
    setFiltered(result);
  }, [bookings, search, filterEvent, filterStatus]);

  async function load() {
    setLoading(true);
    const [bkRes, evRes, ciRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('id, name_en'),
      supabase.from('cities').select('id, city'),
    ]);
    setBookings((bkRes.data as BookingRow[]) ?? []);
    setFiltered((bkRes.data as BookingRow[]) ?? []);
    setEvents((evRes.data as { id: string; name_en: string }[]) ?? []);
    setCities((ciRes.data as { id: string; city: string }[]) ?? []);
    setLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('bookings').update({ status }).eq('id', id);
    await load();
  }

  function exportCSV() {
    const headers = ['Code', 'Name', 'Phone', 'Email', 'Event', 'Ticket', 'City', 'Persons', 'Amount', 'Status', 'Checked In', 'Date'];
    const rows = filtered.map((b) => {
      const ev = events.find((e) => e.id === b.event_id)?.name_en ?? '';
      const ci = cities.find((c) => c.id === b.city_id)?.city ?? '';
      return [b.booking_code, b.name, b.phone, b.email, ev, b.ticket_type_id, ci, b.persons, b.amount, b.status, b.checked_in ? 'Yes' : 'No', new Date(b.created_at).toLocaleDateString()];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const eventName = (id: string) => events.find((e) => e.id === id)?.name_en ?? id;
  const cityName = (id: string | null) => id ? (cities.find((c) => c.id === id)?.city ?? '') : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-devanagari text-2xl text-ivory">Bookings</h1>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold/15 text-gold-light font-mukta font-semibold text-sm hover:bg-gold/25 transition-colors">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
          <input
            placeholder="Search name, phone, email, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none text-sm"
          />
        </div>
        <select value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none text-sm">
          <option value="">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name_en}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory font-mukta focus:border-gold focus:outline-none text-sm">
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <p className="text-ivory/40 text-sm font-mukta">{filtered.length} bookings</p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" /></div>
      ) : (
        <div className="glass rounded-2xl border border-gold/15 overflow-x-auto">
          <table className="w-full text-sm font-mukta">
            <thead>
              <tr className="text-ivory/40 text-left border-b border-gold/10">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Persons</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-ivory/30">No bookings found</td></tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="border-b border-gold/5 hover:bg-white/5">
                    <td className="py-3 px-4 text-gold-light">{b.booking_code}</td>
                    <td className="py-3 px-4 text-ivory/70">{b.name}</td>
                    <td className="py-3 px-4 text-ivory/50">{b.phone}</td>
                    <td className="py-3 px-4 text-ivory/60">{eventName(b.event_id)}</td>
                    <td className="py-3 px-4 text-ivory/60">{cityName(b.city_id)}</td>
                    <td className="py-3 px-4 text-ivory/60">{b.persons}</td>
                    <td className="py-3 px-4 text-ivory/70">₹{b.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        b.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                        b.status === 'pending' ? 'bg-saffron/10 text-saffron' : 'bg-red-500/10 text-red-400'
                      }`}>{b.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        {b.status === 'pending' && (
                          <button onClick={() => updateStatus(b.id, 'paid')} title="Mark paid" className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-400"><CheckCircle size={16} /></button>
                        )}
                        {b.status === 'paid' && (
                          <button onClick={() => updateStatus(b.id, 'refunded')} title="Refund" className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"><RotateCcw size={16} /></button>
                        )}
                        {b.status === 'refunded' && (
                          <button onClick={() => updateStatus(b.id, 'paid')} title="Reinstate" className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-400"><CheckCircle size={16} /></button>
                        )}
                        {b.checked_in && <span title="Checked in" className="p-1.5 text-green-400"><CheckCircle size={16} /></span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
