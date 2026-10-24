import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, CheckCircle, Calendar, MapPin, Users, Sparkles } from 'lucide-react';
import type { BookingResult } from '@/lib/booking';
import { generateTicketPDF } from '@/lib/ticketPdf';
import { useApp } from '@/context/AppContext';
import { ui } from '@/i18n';

interface ConfirmationProps {
  booking: BookingResult;
  event: { name: string; date: string; venue: string };
  ticket: { label: string };
  city?: { city: string; state: string };
  persons: number;
  name: string;
  onClose: () => void;
}

export default function Confirmation({
  booking,
  event,
  ticket,
  city,
  persons,
  name,
  onClose,
}: ConfirmationProps) {
  const { lang } = useApp();
  const [downloading, setDownloading] = useState(false);
  const [burst, setBurst] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBurst(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generateTicketPDF({
        bookingCode: booking.booking_code,
        name,
        event: event.name,
        ticket: ticket.label,
        city: city ? `${city.city}, ${city.state}` : undefined,
        persons,
        amount: booking.amount,
        date: event.date,
        venue: event.venue,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-navy-900/90 backdrop-blur-md" onClick={onClose} />

      {/* Golden burst */}
      {burst && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-gold"
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((i / 12) * Math.PI * 2) * 200,
                y: Math.sin((i / 12) * Math.PI * 2) * 200,
                opacity: 0,
                scale: 0,
              }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}

      <motion.div
        className="relative w-full max-w-md glass rounded-3xl border border-gold/30 p-8 text-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-green-500/30 to-green-600/20 flex items-center justify-center mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        >
          <CheckCircle size={40} className="text-green-400" />
        </motion.div>

        <h3 className="font-devanagari text-2xl text-gradient-gold mb-2">
          {lang === 'en' ? 'Registration confirmed!' : 'रजिस्ट्रेशन सफल!'}
        </h3>
        <p className="text-ivory/60 text-sm font-mukta mb-6">
          {lang === 'en'
            ? 'Your booking has been confirmed. Download your ticket below.'
            : 'आपकी बुकिंग कन्फर्म हो गई है। नीचे अपना टिकट डाउनलोड करें।'}
        </p>

        <div className="glass rounded-2xl p-5 mb-6 text-left space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-ivory/50 text-sm font-mukta">{lang === 'en' ? 'Booking ID' : 'बुकिंग आईडी'}</span>
            <span className="text-gold-light font-mukta font-semibold">{booking.booking_code}</span>
          </div>
          <div className="flex items-center gap-2 text-ivory/70 text-sm font-mukta">
            <Calendar size={15} className="text-saffron" /> {event.name}
          </div>
          <div className="flex items-center gap-2 text-ivory/70 text-sm font-mukta">
            <Sparkles size={15} className="text-saffron" /> {ticket.label}
          </div>
          {city && (
            <div className="flex items-center gap-2 text-ivory/70 text-sm font-mukta">
              <MapPin size={15} className="text-saffron" /> {city.city}, {city.state}
            </div>
          )}
          <div className="flex items-center gap-2 text-ivory/70 text-sm font-mukta">
            <Users size={15} className="text-saffron" /> {persons} {lang === 'en' ? 'persons' : 'व्यक्ति'}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gold/10">
            <span className="text-ivory/50 text-sm font-mukta">{lang === 'en' ? 'Amount paid' : 'राशि चुकी'}</span>
            <span className="font-devanagari text-xl text-gradient-gold">
              ₹{booking.amount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-saffron/30 transition-all duration-300 ease-smooth disabled:opacity-50"
        >
          <Download size={18} />
          {downloading
            ? (lang === 'en' ? 'Generating...' : 'बना रहे हैं...')
            : (lang === 'en' ? 'Download ticket (PDF)' : 'टिकट डाउनलोड करें (PDF)')}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full py-2.5 text-ivory/50 text-sm font-mukta hover:text-ivory transition-colors"
        >
          {lang === 'en' ? 'Close' : 'बंद करें'}
        </button>
      </motion.div>
    </motion.div>
  );
}
