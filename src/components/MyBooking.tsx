import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { useToast } from '@/context/ToastContext';
import { lookupBooking } from '@/lib/booking';
import { generateTicketPDF } from '@/lib/ticketPdf';
import ParticleField from '@/components/ParticleField';
import TicketPass from '@/components/TicketPass';

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
    <section id="my-booking" className="section section--cream">
      <ParticleField count={10} />
      <div className="wrap section-inner mx-auto max-w-2xl">
        <motion.div
          className="section-head"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow eyebrow--center">
            {lang === 'en' ? 'Your tickets' : 'आपके टिकट'}
          </span>
          <h2 className="font-display text-ink">{uiT(ui.nav.myBooking, lang)}</h2>
          <p>
            {lang === 'en'
              ? 'Look up your booking with your phone number or booking ID.'
              : 'अपनी फ़ोन नंबर या बुकिंग आईडी से अपनी बुकिंग खोजें।'}
          </p>
        </motion.div>

        <motion.div
          className="card mb-8 p-6"
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
                className="w-full rounded-14 border border-line bg-white py-3.5 pl-12 pr-4 text-ink placeholder-muted transition-colors focus:border-saffron focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="btn btn-primary shrink-0 disabled:opacity-50"
            >
              {searching ? '...' : (lang === 'en' ? 'Search' : 'खोजें')}
            </button>
          </div>
        </motion.div>

        {/* Results */}
        {searched && results.length > 0 && (
          <div className="space-y-5">
            {results.map((r, i) => {
              const eventDate = r.city ? '2027-06-12' : '2027-08-27';
              return (
                <motion.div
                  key={r.booking.booking_code}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <TicketPass
                    bookingCode={r.booking.booking_code}
                    holderName={r.booking.name}
                    event={lang === 'en' ? r.event_name_en : r.event_name_hi}
                    ticket={lang === 'en' ? r.ticket_label_en : r.ticket_label_hi}
                    city={r.city ? `${r.city}, ${r.state}` : undefined}
                    persons={r.booking.persons}
                    amount={r.booking.amount}
                    date={eventDate}
                    venue={r.city ?? 'Pragati Maidan, Delhi'}
                    status={r.booking.status as 'paid' | 'pending' | 'refunded' | 'cancelled'}
                    checkedIn={r.booking.checked_in}
                    onDownload={r.booking.status === 'paid' ? () => handleDownload(r) : undefined}
                  />
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
