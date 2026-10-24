import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Ticket,
  MapPin,
  Tag,
  Users,
  ScanLine,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { AdminProvider, useAdmin } from '@/context/AdminContext';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import AdminEvents from './admin/AdminEvents';
import AdminTickets from './admin/AdminTickets';
import AdminCities from './admin/AdminCities';
import AdminCoupons from './admin/AdminCoupons';
import AdminBookings from './admin/AdminBookings';
import AdminCheckIn from './admin/AdminCheckIn';

type Tab = 'dashboard' | 'events' | 'tickets' | 'cities' | 'coupons' | 'bookings' | 'checkin';

const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'events', label: 'Events', icon: <Calendar size={18} /> },
  { id: 'tickets', label: 'Tickets', icon: <Ticket size={18} /> },
  { id: 'cities', label: 'Cities', icon: <MapPin size={18} /> },
  { id: 'coupons', label: 'Coupons', icon: <Tag size={18} /> },
  { id: 'bookings', label: 'Bookings', icon: <Users size={18} /> },
  { id: 'checkin', label: 'Check-in', icon: <ScanLine size={18} /> },
];

function AdminShell() {
  const { session, isAdmin, loading, signOut } = useAdmin();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <div className="w-10 h-10 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
      </div>
    );
  }

  if (!session || !isAdmin) {
    return <AdminLogin />;
  }

  return (
    <div className="min-h-screen bg-navy-900 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 glass border-r border-gold/15 p-5 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-devanagari text-gradient-gold">ॐ</span>
            <span className="font-devanagari text-sm text-ivory">आध्यात्मिक भारत</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-ivory/60">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-mukta transition-all ${
                tab === item.id
                  ? 'bg-gradient-to-r from-saffron/20 to-transparent text-gold-light border border-gold/20'
                  : 'text-ivory/50 hover:text-ivory hover:bg-white/5'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="space-y-2 pt-4 border-t border-gold/10">
          <Link to="/" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-ivory/50 hover:text-gold transition-colors font-mukta">
            <ExternalLink size={16} /> View site
          </Link>
          <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all font-mukta">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-navy-900/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 glass border-b border-gold/15 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-ivory">
            <Menu size={22} />
          </button>
          <span className="font-devanagari text-sm text-gradient-gold">Admin Panel</span>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {tab === 'dashboard' && <AdminDashboard />}
          {tab === 'events' && <AdminEvents />}
          {tab === 'tickets' && <AdminTickets />}
          {tab === 'cities' && <AdminCities />}
          {tab === 'coupons' && <AdminCoupons />}
          {tab === 'bookings' && <AdminBookings />}
          {tab === 'checkin' && <AdminCheckIn />}
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  );
}
