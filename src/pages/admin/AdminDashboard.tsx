import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, IndianRupee, Ticket, TrendingUp, Calendar, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

interface Stats {
  totalBookings: number;
  totalRevenue: number;
  paidBookings: number;
  checkedIn: number;
}

interface EventStat {
  event_id: string;
  event_name: string;
  count: number;
}

interface CityStat {
  city: string;
  state: string;
  booked: number;
  capacity: number;
}

interface RecentBooking {
  booking_code: string;
  name: string;
  phone: string;
  amount: number;
  status: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalBookings: 0, totalRevenue: 0, paidBookings: 0, checkedIn: 0 });
  const [eventStats, setEventStats] = useState<EventStat[]>([]);
  const [cityStats, setCityStats] = useState<CityStat[]>([]);
  const [recent, setRecent] = useState<RecentBooking[]>([]);

  useEffect(() => {
    async function load() {
      const { data: bookings } = await supabase.from('bookings').select('*');
      const all = bookings ?? [];
      const paid = all.filter((b) => b.status === 'paid');
      setStats({
        totalBookings: all.length,
        totalRevenue: paid.reduce((s, b) => s + b.amount, 0),
        paidBookings: paid.length,
        checkedIn: all.filter((b) => b.checked_in).length,
      });

      const { data: events } = await supabase.from('events').select('*');
      if (events) {
        setEventStats(
          events.map((e) => ({
            event_id: e.id,
            event_name: e.name_en,
            count: all.filter((b) => b.event_id === e.id).length,
          }))
        );
      }

      const { data: cities } = await supabase.from('cities').select('*').eq('event_id', 'evt-sundarkand');
      if (cities) {
        setCityStats(cities.map((c) => ({ city: c.city, state: c.state, booked: c.booked, capacity: c.capacity })));
      }

      const { data: recentData } = await supabase
        .from('bookings')
        .select('booking_code, name, phone, amount, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      setRecent(recentData ?? []);
    }
    load();
  }, []);

  const statCards = [
    { label: 'Total bookings', value: stats.totalBookings, icon: <Ticket size={20} />, color: 'from-saffron/20 to-saffron/5' },
    { label: 'Revenue (paid)', value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`, icon: <IndianRupee size={20} />, color: 'from-green-500/20 to-green-500/5' },
    { label: 'Paid bookings', value: stats.paidBookings, icon: <Users size={20} />, color: 'from-gold/20 to-gold/5' },
    { label: 'Checked in', value: stats.checkedIn, icon: <TrendingUp size={20} />, color: 'from-blue-500/20 to-blue-500/5' },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-devanagari text-2xl text-ivory">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            className={`rounded-2xl p-5 border border-gold/15 bg-gradient-to-br ${s.color}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-ivory/50 text-sm font-mukta">{s.label}</span>
              <span className="text-gold-light">{s.icon}</span>
            </div>
            <p className="font-devanagari text-2xl text-ivory">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bookings per event */}
        <div className="glass rounded-2xl p-6 border border-gold/15">
          <h3 className="text-ivory font-mukta font-semibold mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-saffron" /> Bookings per event
          </h3>
          <div className="space-y-3">
            {eventStats.map((e) => (
              <div key={e.event_id} className="flex items-center justify-between">
                <span className="text-ivory/60 text-sm font-mukta">{e.event_name}</span>
                <span className="text-gold-light font-mukta font-semibold text-sm">{e.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Seats per city */}
        <div className="glass rounded-2xl p-6 border border-gold/15">
          <h3 className="text-ivory font-mukta font-semibold mb-4 flex items-center gap-2">
            <MapPin size={18} className="text-saffron" /> Seats per city
          </h3>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {cityStats.map((c) => {
              const pct = Math.round((c.booked / c.capacity) * 100);
              return (
                <div key={c.city} className="flex items-center gap-3">
                  <span className="text-ivory/60 text-sm font-mukta w-24 truncate">{c.city}</span>
                  <div className="flex-1 h-2 rounded-full bg-navy-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-saffron' : 'bg-gold'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-ivory/40 text-xs font-mukta w-16 text-right">{c.booked}/{c.capacity}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent bookings */}
      <div className="glass rounded-2xl p-6 border border-gold/15">
        <h3 className="text-ivory font-mukta font-semibold mb-4">Last 10 bookings</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mukta">
            <thead>
              <tr className="text-ivory/40 text-left border-b border-gold/10">
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Phone</th>
                <th className="py-2 px-3">Amount</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-ivory/30">No bookings yet</td></tr>
              ) : (
                recent.map((b) => (
                  <tr key={b.booking_code} className="border-b border-gold/5 hover:bg-white/5">
                    <td className="py-2.5 px-3 text-gold-light">{b.booking_code}</td>
                    <td className="py-2.5 px-3 text-ivory/70">{b.name}</td>
                    <td className="py-2.5 px-3 text-ivory/50">{b.phone}</td>
                    <td className="py-2.5 px-3 text-ivory/70">₹{b.amount.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        b.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                        b.status === 'pending' ? 'bg-saffron/10 text-saffron' :
                        'bg-red-500/10 text-red-400'
                      }`}>{b.status}</span>
                    </td>
                    <td className="py-2.5 px-3 text-ivory/40 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
