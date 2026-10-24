import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ScanLine, Search, CheckCircle, XCircle, Camera, CameraOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CheckInResult {
  found: boolean;
  alreadyCheckedIn?: boolean;
  booking?: {
    booking_code: string;
    name: string;
    phone: string;
    event_id: string;
    status: string;
    checked_in: boolean;
  };
  message?: string;
}

export default function AdminCheckIn() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<unknown>(null);
  const html5QrRef = useRef<HTMLElement | null>(null);

  async function checkIn(bookingCode: string) {
    if (!bookingCode.trim()) return;
    setLoading(true);
    setResult(null);

    const { data: booking } = await supabase
      .from('bookings')
      .select('booking_code, name, phone, event_id, status, checked_in')
      .eq('booking_code', bookingCode.toUpperCase().trim())
      .maybeSingle();

    if (!booking) {
      setResult({ found: false, message: 'Booking not found' });
      setLoading(false);
      return;
    }

    if (booking.checked_in) {
      setResult({ found: true, alreadyCheckedIn: true, booking: booking as CheckInResult['booking'] });
      setLoading(false);
      return;
    }

    if (booking.status !== 'paid') {
      setResult({ found: true, booking: booking as CheckInResult['booking'], message: `Payment status: ${booking.status}` });
      setLoading(false);
      return;
    }

    await supabase.from('bookings').update({ checked_in: true }).eq('booking_code', bookingCode.toUpperCase().trim());
    setResult({ found: true, booking: { ...booking, checked_in: true } as CheckInResult['booking'] });
    setLoading(false);
  }

  async function startScanner() {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          setCode(decodedText);
          setScanning(false);
          scanner.stop();
          checkIn(decodedText);
        },
        () => {}
      );
    } catch {
      setScanning(false);
      setResult({ found: false, message: 'Camera access failed' });
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current as { stop: () => Promise<void> } | null;
    if (scanner) {
      try { await scanner.stop(); } catch { /* ignore */ }
    }
    setScanning(false);
  }

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-devanagari text-2xl text-ivory">Check-in</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Scanner */}
        <div className="glass rounded-2xl p-6 border border-gold/15">
          <h3 className="text-ivory font-mukta font-semibold mb-4 flex items-center gap-2">
            <ScanLine size={18} className="text-saffron" /> Scan QR code
          </h3>
          <div id="qr-reader" ref={html5QrRef as React.RefObject<HTMLElement>} className="w-full rounded-xl overflow-hidden bg-navy-900 min-h-[250px] flex items-center justify-center" />
          {!scanning ? (
            <button onClick={startScanner} className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold flex items-center justify-center gap-2">
              <Camera size={18} /> Start camera
            </button>
          ) : (
            <button onClick={stopScanner} className="mt-4 w-full py-3 rounded-xl bg-red-500/20 text-red-400 font-mukta font-semibold flex items-center justify-center gap-2">
              <CameraOff size={18} /> Stop camera
            </button>
          )}
        </div>

        {/* Manual entry + result */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 border border-gold/15">
            <h3 className="text-ivory font-mukta font-semibold mb-4">Manual entry</h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ivory/40" />
                <input
                  placeholder="Enter booking ID"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && checkIn(code)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-navy-800/60 border border-gold/20 text-ivory placeholder-ivory/30 font-mukta focus:border-gold focus:outline-none text-sm uppercase"
                />
              </div>
              <button
                onClick={() => checkIn(code)}
                disabled={loading || !code}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-saffron to-saffron-dark text-ivory font-mukta font-semibold disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Check in'}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                className={`glass rounded-2xl p-6 border ${
                  result.found && !result.alreadyCheckedIn && !result.message
                    ? 'border-green-500/30'
                    : result.alreadyCheckedIn || result.message
                    ? 'border-saffron/30'
                    : 'border-red-500/30'
                }`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                {result.found && !result.alreadyCheckedIn && !result.message && (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle size={28} className="text-green-400" />
                      <span className="font-devanagari text-xl text-green-400">Checked in!</span>
                    </div>
                    <div className="space-y-1 text-sm font-mukta">
                      <p className="text-ivory/70"><span className="text-gold-light">{result.booking?.booking_code}</span></p>
                      <p className="text-ivory/70">{result.booking?.name}</p>
                      <p className="text-ivory/50">{result.booking?.phone}</p>
                    </div>
                  </>
                )}
                {result.alreadyCheckedIn && (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <XCircle size={28} className="text-saffron" />
                      <span className="font-devanagari text-xl text-saffron">Already checked in</span>
                    </div>
                    <div className="space-y-1 text-sm font-mukta">
                      <p className="text-ivory/70">{result.booking?.name} · {result.booking?.booking_code}</p>
                    </div>
                  </>
                )}
                {result.message && !result.alreadyCheckedIn && (
                  <div className="flex items-center gap-3">
                    <XCircle size={28} className="text-saffron" />
                    <div>
                      <p className="font-mukta text-saffron">{result.message}</p>
                      <p className="text-ivory/50 text-sm font-mukta">{result.booking?.name}</p>
                    </div>
                  </div>
                )}
                {!result.found && (
                  <div className="flex items-center gap-3">
                    <XCircle size={28} className="text-red-400" />
                    <p className="font-mukta text-red-400">{result.message}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
