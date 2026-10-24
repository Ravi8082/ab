import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPinned,
  Menu,
  Power,
  ScanLine,
  ShieldCheck,
  Store,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { AdminProvider, useAdmin } from '@/context/AdminContext';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import AdminContent from './admin/AdminContent';
import AdminEvents from './admin/AdminEvents';
import AdminLocations from './admin/AdminLocations';
import AdminSchedules from './admin/AdminSchedules';
import AdminBookings from './admin/AdminBookings';
import AdminCheckIn from './admin/AdminCheckIn';
import AdminStaff from './admin/AdminStaff';
import AdminSales from './admin/AdminSales';
import AdminEmails from './admin/AdminEmails';

type Tab =
  | 'dashboard'
  | 'content'
  | 'events'
  | 'locations'
  | 'schedules'
  | 'bookings'
  | 'checkin'
  | 'sales'
  | 'emails'
  | 'staff';

const NAV: { id: Tab; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} />, group: 'Overview' },
  { id: 'bookings', label: 'Bookings & reports', icon: <Users size={17} />, group: 'Overview' },
  { id: 'checkin', label: 'Gate check-in', icon: <ScanLine size={17} />, group: 'Overview' },
  { id: 'sales', label: 'Sales & reminders', icon: <Power size={17} />, group: 'Overview' },
  { id: 'emails', label: 'Email & OTP log', icon: <Mail size={17} />, group: 'Overview' },
  { id: 'content', label: 'Page content', icon: <Store size={17} />, group: 'Event setup' },
  { id: 'events', label: 'Events & tickets', icon: <Ticket size={17} />, group: 'Event setup' },
  { id: 'locations', label: 'States & venues', icon: <MapPinned size={17} />, group: 'Event setup' },
  { id: 'schedules', label: 'Schedules & capacity', icon: <CalendarRange size={17} />, group: 'Event setup' },
  { id: 'staff', label: 'Staff accounts', icon: <ShieldCheck size={17} />, group: 'Team' },
];

const PAGE_TITLES: Record<Tab, string> = {
  dashboard: 'Dashboard',
  content: 'Page content',
  events: 'Events & tickets',
  locations: 'States & venues',
  schedules: 'Schedules & capacity',
  bookings: 'Bookings & reports',
  checkin: 'Gate check-in',
  sales: 'Sales & reminders',
  emails: 'Email & OTP log',
  staff: 'Staff accounts',
};

function AdminShell() {
  const { session, isAdmin, loading, signOut } = useAdmin();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-sindoor-deep">
        <div className="flex flex-col items-center gap-4">
          <div className="h-11 w-11 animate-spin rounded-full border-2 border-sky/25 border-t-marigold" />
          <p className="font-ui text-[0.66rem] uppercase tracking-[0.22em] text-cream-on-dark/55">
            Opening admin panel
          </p>
        </div>
      </div>
    );
  }

  if (!session || !isAdmin) return <AdminLogin />;

  if (session.role === 'staff') {
    return (
      <div className="grid min-h-screen place-items-center bg-sindoor-deep px-5">
        <div className="w-full max-w-md rounded-[24px] border border-white/10 bg-white/[0.05] p-8 text-center backdrop-blur">
          <ShieldCheck size={30} className="mx-auto text-marigold" />
          <h1 className="mt-3 font-display text-2xl text-white">Staff account</h1>
          <p className="mt-2 text-sm text-cream-on-dark/60">
            This account scans passes at the gate. Open the staff scanner to check devotees in.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/staff" className="btn btn-primary btn-sm">
              <ScanLine size={15} /> Open staff scanner
            </Link>
            <button onClick={() => void signOut()} className="btn btn-outline btn-sm">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const groups = Array.from(new Set(NAV.map((item) => item.group)));

  return (
    <div className="min-h-screen bg-[#F5F1E6] lg:flex">
      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-[264px] shrink-0 flex-col border-r border-white/10 bg-sindoor-deep transition-transform duration-300 lg:sticky lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <Link to="/" className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <circle cx="20" cy="20" r="19" stroke="#13BBE8" strokeWidth="1.2" opacity=".5" />
              <path d="M20 8c3.6 5 3.6 10.8 0 15.8C16.4 18.8 16.4 13 20 8Z" fill="#EE2C8F" />
              <path d="M20 23.8c5.2-3 10.6-1.9 13.8 2.4-5.2 3-10.6 1.9-13.8-2.4Z" fill="#F39A1E" />
              <path d="M20 23.8C14.8 20.8 9.4 21.9 6.2 26.2c5.2 3 10.6 1.9 13.8-2.4Z" fill="#FFD21F" />
            </svg>
            <span className="leading-tight">
              <span className="block font-display text-[1.05rem] font-semibold text-white">Adhyatmik Bharat</span>
              <span className="block font-ui text-[0.58rem] uppercase tracking-[0.2em] text-marigold/80">
                Event admin
              </span>
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="text-cream-on-dark/50 lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-3 font-ui text-[0.56rem] uppercase tracking-[0.2em] text-cream-on-dark/35">
                {group}
              </p>
              <div className="space-y-0.5">
                {NAV.filter((item) => item.group === group).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left font-ui text-[0.84rem] transition-all ${
                      tab === item.id
                        ? 'bg-white/[0.09] text-white shadow-inner ring-1 ring-inset ring-marigold/20'
                        : 'text-cream-on-dark/55 hover:bg-white/[0.04] hover:text-cream-on-dark'
                    }`}
                  >
                    <span className={tab === item.id ? 'text-marigold' : 'text-cream-on-dark/40'}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          <div className="mb-2 rounded-xl bg-white/[0.04] px-3 py-2">
            <p className="truncate font-ui text-[0.8rem] text-cream-on-dark">{session.name}</p>
            <p className="truncate text-[0.66rem] text-cream-on-dark/45">{session.email}</p>
            <span className="mt-1 inline-flex rounded-full bg-marigold/15 px-2 py-0.5 font-ui text-[0.56rem] uppercase tracking-[0.14em] text-marigold">
              {session.role}
            </span>
          </div>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl px-3 py-2 font-ui text-[0.82rem] text-cream-on-dark/50 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ExternalLink size={15} /> View public site
          </Link>
          <Link
            to="/staff"
            className="flex items-center gap-2 rounded-xl px-3 py-2 font-ui text-[0.82rem] text-cream-on-dark/50 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ScanLine size={15} /> Staff scanner
          </Link>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 font-ui text-[0.82rem] text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-sindoor-deep/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-sandal/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-ink" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <span className="font-display text-lg text-ink">{PAGE_TITLES[tab]}</span>
          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-saffron to-marigold" />
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {tab === 'dashboard' && <AdminDashboard onGoTo={(next) => setTab(next as Tab)} />}
          {tab === 'content' && <AdminContent />}
          {tab === 'events' && <AdminEvents />}
          {tab === 'locations' && <AdminLocations />}
          {tab === 'schedules' && <AdminSchedules />}
          {tab === 'bookings' && <AdminBookings />}
          {tab === 'checkin' && <AdminCheckIn />}
          {tab === 'sales' && <AdminSales />}
          {tab === 'emails' && <AdminEmails />}
          {tab === 'staff' && <AdminStaff />}
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
