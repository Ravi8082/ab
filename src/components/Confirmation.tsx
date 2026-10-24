import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import type { BookingResult } from '@/lib/booking';
import { generateTicketPDF } from '@/lib/ticketPdf';
import { useApp } from '@/context/AppContext';
import TicketPass from '@/components/TicketPass';

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
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-sindoor-deep/80 backdrop-blur-sm" onClick={onClose} />

      {/* Marigold burst on arrival */}
      {burst && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[...Array(14)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-2 w-2 rounded-full"
              style={{ background: i % 2 ? '#FFD21F' : '#EE2C8F' }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((i / 14) * Math.PI * 2) * 230,
                y: Math.sin((i / 14) * Math.PI * 2) * 230,
                opacity: 0,
                scale: 0,
              }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              onAnimationComplete={() => {
                if (i === 13) setBurst(false);
              }}
            />
          ))}
        </div>
      )}

      <motion.div
        className="relative my-auto w-full max-w-lg"
        initial={{ scale: 0.86, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.86, opacity: 0, y: 24 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-5 text-center">
          <motion.span
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-success/15"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 220 }}
          >
            <CheckCircle2 size={30} className="text-success" />
          </motion.span>
          <h3 className="font-display text-3xl text-white">
            {lang === 'en' ? 'Registration confirmed' : 'रजिस्ट्रेशन सफल'}
          </h3>
          <p className="mt-1 text-sm text-cream-on-dark/70">
            {lang === 'en'
              ? 'Carry this pass — the QR is verified against our database at the gate.'
              : 'यह पास साथ रखें — द्वार पर आपका QR डेटाबेस से मेल खाता है।'}
          </p>
        </div>

        <TicketPass
          bookingCode={booking.booking_code}
          holderName={name}
          event={event.name}
          ticket={ticket.label}
          city={city ? `${city.city}, ${city.state}` : undefined}
          persons={persons}
          amount={booking.amount}
          date={event.date}
          venue={event.venue}
          status="paid"
          onDownload={handleDownload}
          downloading={downloading}
        />

        <button
          onClick={onClose}
          className="btn btn-ghost btn-block mt-4 !bg-white/95"
        >
          {lang === 'en' ? 'Close' : 'बंद करें'}
        </button>
      </motion.div>
    </motion.div>
  );
}
