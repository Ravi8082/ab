import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Calendar, Download, MapPin, Ticket as TicketIcon, User, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ui, uiT } from '@/i18n';
import { formatRupees } from '@/lib/pricing';
import { formatEventDate } from '@/lib/format';

export interface TicketPassProps {
  bookingCode: string;
  holderName: string;
  event: string;
  ticket: string;
  city?: string;
  persons: number;
  amount: number;
  date: string;
  venue: string;
  status?: 'paid' | 'pending' | 'refunded' | 'cancelled';
  checkedIn?: boolean;
  onDownload?: () => void;
  downloading?: boolean;
}

const STATUS_TONE: Record<string, { label: { en: string; hi: string }; cls: string }> = {
  paid: { label: { en: 'Confirmed', hi: 'कन्फर्म' }, cls: 'bg-success/15 text-success' },
  pending: { label: { en: 'Awaiting payment', hi: 'भुगतान प्रतीक्षित' }, cls: 'bg-marigold/20 text-[#8a6a00]' },
  refunded: { label: { en: 'Refunded', hi: 'धन वापस' }, cls: 'bg-line text-muted' },
  cancelled: { label: { en: 'Cancelled', hi: 'रद्द' }, cls: 'bg-error/10 text-error' },
};

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-text">
      <span className="mt-0.5 shrink-0 text-saffron">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function TicketPass({
  bookingCode,
  holderName,
  event,
  ticket,
  city,
  persons,
  amount,
  date,
  venue,
  status = 'paid',
  checkedIn,
  onDownload,
  downloading,
}: TicketPassProps) {
  const { lang } = useApp();
  const [qr, setQr] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(bookingCode, {
      width: 320,
      margin: 1,
      color: { dark: '#0F2342', light: '#FFFFFF' },
    })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(''));
    return () => {
      active = false;
    };
  }, [bookingCode]);

  const tone = STATUS_TONE[status] ?? STATUS_TONE.pending;
  const isVoid = status === 'refunded' || status === 'cancelled';

  return (
    <div className="card relative overflow-hidden rounded-[20px]">
      <div className="relative overflow-hidden bg-sindoor px-6 py-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background:url('/pattern-lotus.svg')_repeat] [background-size:170px_170px]" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="font-ui text-[0.68rem] uppercase tracking-[0.24em] text-marigold">
              {uiT(ui.nav.register, lang)} · {lang === 'en' ? 'Pass' : 'पास'}
            </p>
            <h4 className="mt-1 font-display text-2xl leading-tight text-white">{event}</h4>
          </div>
          <span className={`chip shrink-0 ${tone.cls}`}>{tone.label[lang] ?? tone.label.en}</span>
        </div>
      </div>

      <div className="relative grid sm:grid-cols-[1fr_auto]">
        <div className={`p-6 ${isVoid ? 'opacity-55 grayscale' : ''}`}>
          <div className="mb-5">
            <p className="font-ui text-[0.68rem] uppercase tracking-[0.22em] text-muted">
              {lang === 'en' ? 'Booking reference' : 'बुकिंग संदर्भ'}
            </p>
            <p className="mt-1 font-ui text-2xl font-bold tracking-[0.14em] text-saffron-ink">
              {bookingCode}
            </p>
          </div>

          <div className="space-y-2.5">
            <Row icon={<User size={15} />}>{holderName}</Row>
            <Row icon={<TicketIcon size={15} />}>{ticket}</Row>
            {city && <Row icon={<MapPin size={15} />}>{city}</Row>}
            <Row icon={<Calendar size={15} />}>
              {formatEventDate(date, lang)} · {venue}
            </Row>
            <Row icon={<Users size={15} />}>
              {persons} {lang === 'en' ? (persons === 1 ? 'person' : 'persons') : 'व्यक्ति'}
            </Row>
          </div>

          <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
            <span className="font-ui text-[0.68rem] uppercase tracking-[0.22em] text-muted">
              {lang === 'en' ? 'Amount' : 'राशि'}
            </span>
            <span className="font-display text-3xl font-semibold text-ink">
              {formatRupees(amount)}
            </span>
          </div>

          {onDownload && status === 'paid' && (
            <button
              onClick={onDownload}
              disabled={downloading}
              className="btn btn-navy btn-block mt-5 disabled:opacity-60"
            >
              <Download size={17} />
              {downloading
                ? lang === 'en' ? 'Generating…' : 'बना रहे हैं…'
                : lang === 'en' ? 'Download ticket (PDF)' : 'टिकट डाउनलोड करें (PDF)'}
            </button>
          )}
        </div>

        <div className="relative hidden w-[176px] flex-col items-center justify-center gap-3 border-l border-dashed border-line bg-sandal-2 px-4 py-6 sm:flex">
          <span className="absolute -left-[13px] -top-[13px] h-6 w-6 rounded-full bg-sandal" />
          <span className="absolute -bottom-[13px] -left-[13px] h-6 w-6 rounded-full bg-sandal" />
          <div className="grid h-[124px] w-[124px] place-items-center rounded-xl border border-line bg-white p-1.5">
            {qr ? (
              <img src={qr} alt={`${lang === 'en' ? 'Ticket QR' : 'टिकट QR'} ${bookingCode}`} className="h-full w-full" />
            ) : (
              <span className="h-full w-full animate-pulse rounded-lg bg-line" />
            )}
          </div>
          <p className="text-center font-ui text-[0.66rem] uppercase leading-relaxed tracking-[0.14em] text-muted">
            {lang === 'en' ? 'Scan at the gate' : 'द्वार पर स्कैन करें'}
          </p>
          {checkedIn && (
            <span className="chip bg-success/15 text-success">
              {lang === 'en' ? 'Checked in' : 'चेक इन हो गया'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
