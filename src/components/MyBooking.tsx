import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Calendar, MapPin, Users, Download, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { useToast } from '@/context/ToastContext';
import { lookupBooking } from '@/lib/booking';
import { generateTicketPDF } from '@/lib/ticketPdf';
import ParticleField from '@/components/ParticleField';

interface BookingRecord {
  booking: {
    booking_code: string;
    persons: number;
    name: string;
    phone: string;
    email: string;
    amount: number;
    status: string;
    checked_in: boolean;
    created_at: string;
  };
  event_name_en: string;
  event_name_hi: string;
  ticket_label_en: string;
  ticket_label_hi: string;
  city: string | null;
  state: string | null;
}

const statusConfig = {
  paid: { icon: <CheckCircle size={16} />, color: 'text-green-600', bg: 'bg-green-500/10' },
  pending: { icon: <Clock size={16} />, color: 'text-saffron-ink', bg: 'bg-saffron/10' },
  refunded: { icon: <XCircle size={16} />, color: 'text-red-500', bg: 'bg-red-500/10' },
  cancelled: { icon: <XCircle size={16} />, color: 'text-red-500', bg: 'bg-red-500/10' },
};

export default function MyBooking() {
  const { lang } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookingRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const isPhone = /^\d{10}$/.test(query.replace(/\D/g, ''));
      const data = isPhone
        ? await lookupBooking(query.replace(/\D/g, ''))
        : await lookupBooking(undefined, query.trim().toUpperCase());
      setResults(data as BookingRecord[]);
      if ((data as BookingRecord[]).length === 0) {
        toast(lang === 'en' ? 'No bookings found' : 'कोई बुकिंग नहीं मिली', 'info');
      }
    } catch {
      toast(lang === 'en' ? 'Search failed' : 'खोज विफल', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (r: BookingRecord) => {
    try {
      await generateTicketPDF({
        bookingCode: r.booking.booking_code,
        name: r.booking.name,
        event: lang === 'en' ? r.event_name_en : r.event_name_hi,
        ticket: lang === 'en' ? r.ticket_label_en : r.ticket_label_hi,
        city: r.city ? `${r.city}, ${r.state}` : undefined,
        persons: r.booking.persons,
        amount: r.booking.amount,
        date: '2027-06-12',
        venue: r.city ?? 'Pragati Maidan, Delhi',
      });
    } catch {
      toast(lang === 'en' ? 'Could not generate ticket' : 'टिकट नहीं बना', 'error');
    }
  };

  return (
    <section id="my-booking" className="relative py-24 px-4 sm:px-6 bg-sandal">
      <ParticleField count={10} />
      <div className="relative mx-auto max-w-2xl">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-display text-3xl sm:text-4xl text-ink mb-3">
            <span className="text-gradient-saffron">{uiT(ui.nav.myBooking, lang)}</span>
          </h2>
          <p className="text-muted font-body text-sm">
            {lang === 'en'
              ? 'Look up your booking with your phone number or booking ID.'
              : 'अपनी फ़ोन नंबर या बुकिंग आईडी से अपनी बुकिंग खोजें।'}
          </p>
        </motion.div>

        <motion.div
          className="rounded-24 p-6 border border-line bg-white/60 backdrop-blur-sm mb-8 shadow-sm"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={lang === 'en' ? 'Phone or booking ID' : 'फ़ोन या बुकिंग आईडी'}
                className="w-full pl-12 pr-4 py-3 rounded-14 bg-sandal-2 border border-line text-ink placeholder-muted font-body focus:border-saffron focus:outline-none transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-3 rounded-full bg-grad-hand text-white font-ui font-semibold hover:scale-105 transition-transform disabled:opacity-50"
            >
              {searching ? '...' : (lang === 'en' ? 'Search' : 'खोजें')}
            </button>
          </div>
        </motion.div>

        {/* Results */}
        {searched && results.length > 0 && (
          <div className="space-y-4">
            {results.map((r, i) => {
              const sc = statusConfig[r.booking.status as keyof typeof statusConfig] ?? statusConfig.pending;
              return (
                <motion.div
                  key={r.booking.booking_code}
                  className="rounded-24 p-5 border border-line bg-white/60 backdrop-blur-sm shadow-sm"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-saffron-ink font-ui font-semibold text-sm">{r.booking.booking_code}</p>
                      <p className="text-muted text-xs font-body">{r.booking.name}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${sc.bg} ${sc.color} text-xs font-ui font-semibold`}>
                      {sc.icon}
                      {r.booking.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted font-body">
                      <Calendar size={14} className="text-saffron" />
                      {lang === 'en' ? r.event_name_en : r.event_name_hi}
                    </div>
                    <div className="flex items-center gap-2 text-muted font-body">
                      <Users size={14} className="text-saffron" />
                      {r.booking.persons} {lang === 'en' ? 'persons' : 'व्यक्ति'}
                    </div>
                    {r.city && (
                      <div className="flex items-center gap-2 text-muted font-body">
                        <MapPin size={14} className="text-saffron" />
                        {r.city}, {r.state}
                      </div>
                    )}
                    <div className="text-ink font-body font-semibold">
                      ₹{r.booking.amount.toLocaleString('en-IN')}
                    </div>
                  </div>

                  {r.booking.status === 'paid' && (
                    <button
                      onClick={() => handleDownload(r)}
                      className="mt-4 flex items-center gap-2 text-sm text-saffron-ink hover:text-saffron font-body transition-colors"
                    >
                      <Download size={16} />
                      {lang === 'en' ? 'Download ticket' : 'टिकट डाउनलोड करें'}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {searched && results.length === 0 && !searching && (
          <div className="text-center py-12">
            <p className="text-muted font-body">
              {lang === 'en' ? 'No bookings found. Try a different phone or booking ID.' : 'कोई बुकिंग नहीं मिली। एक अलग फ़ोन या बुकिंग आईडी आज़माएँ।'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
