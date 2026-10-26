import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react';
import type { Lang } from '@/types';
import { fetchGateSettings, issueLivePassCode, type EventBookingPass } from '@/lib/eventApi';
import { formatDateRange, formatTimeRange, bi, kindName } from '@/lib/eventFormat';
import { formatRupees } from '@/lib/pricing';

const STATUS_LABEL: Record<string, [string, string]> = {
  paid: ['Confirmed', 'पुष्टि हो गई'],
  pending: ['Payment pending', 'भुगतान लंबित'],
  cancelled: ['Cancelled', 'रद्द हो गया'],
  refunded: ['Refunded', 'पैसा वापस हुआ'],
};

const STATUS_STYLE: Record<string, string> = {
  paid: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  pending: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
  cancelled: 'border-red-400/30 bg-red-400/10 text-red-200',
  refunded: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
};

export default function EventPass({
  pass,
  lang,
  compact = false,
}: {
  pass: EventBookingPass;
  lang: Lang;
  compact?: boolean;
}) {
  const [qr, setQr] = useState('');
  const [liveQr, setLiveQr] = useState('');
  const [liveCode, setLiveCode] = useState('');
  const [liveExpiresAt, setLiveExpiresAt] = useState(0);
  const [liveError, setLiveError] = useState('');
  const [liveQrOnly, setLiveQrOnly] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const dateLabel =
    pass.schedule?.event_date
      ? `${formatDateRange(pass.schedule.event_date, pass.schedule.end_date, lang)}${
          pass.schedule.start_time ? ` · ${formatTimeRange(pass.schedule.start_time, pass.schedule.end_time)}` : ''
        }`
      : bi(pass.event.date_label_en, pass.event.date_label_hi, lang);

  useEffect(() => {
    let active = true;
    if (!pass.qrToken) {
      setQr('');
      return;
    }
    QRCode.toDataURL(pass.qrToken, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#0F2342', light: '#FFFDF1' },
    })
      .then((url) => active && setQr(url))
      .catch(() => active && setQr(''));
    return () => {
      active = false;
    };
  }, [pass.qrToken]);

  const downloadQr = () => {
    if (!qr) return;
    const link = document.createElement('a');
    link.href = qr;
    link.download = `${pass.reference}-pass-qr.png`;
    link.click();
  };

  const paid = pass.status === 'paid';
  const totalDays = Math.max(1, pass.passDays ?? 1);

  useEffect(() => {
    let active = true;
    fetchGateSettings()
      .then((state) => {
        if (active) setLiveQrOnly(Boolean(state.liveQrOnly));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!paid) return;
    let active = true;
    let timer: number | undefined;
    const issue = async () => {
      try {
        const issued = await issueLivePassCode(pass.reference, pass.email);
        const url = await QRCode.toDataURL(issued.code, {
          width: 360,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0F2342', light: '#FFFDF1' },
        });
        if (!active) return;
        setLiveQr(url);
        setLiveCode(issued.code);
        setLiveExpiresAt(Date.parse(issued.expiresAt) || Date.now() + issued.ttlSeconds * 1000);
        setLiveError('');
        timer = window.setTimeout(issue, Math.max(10, issued.ttlSeconds - 12) * 1000);
      } catch (err) {
        if (!active) return;
        setLiveError(err instanceof Error ? err.message : 'Could not load the live QR.');
        timer = window.setTimeout(issue, 15000);
      }
    };
    void issue();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [paid, pass.reference, pass.email]);

  useEffect(() => {
    if (!liveExpiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((liveExpiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [liveExpiresAt]);

  const clockLabel = (value: string) =>
    new Date(value.replace(' ', 'T')).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const qty = Math.max(1, pass.qty);
  const calendarDays = Math.max(1, pass.calendarDays ?? totalDays);
  const multiDay = totalDays > 1;
  const todayEntries = Math.min(qty, pass.todayCheckInCount ?? (pass.todayCheckInAt ? 1 : 0));
  const todayLeft = Math.max(0, qty - todayEntries);
  const entriesUsed = Math.max(0, pass.checkInCount ?? 0);
  const daysUsed = Math.min(totalDays, pass.checkInDays ?? (pass.checkInAt ? 1 : 0));
  const daysLeft = Math.max(0, totalDays - daysUsed);
  const todayTime = pass.todayCheckInAt ? clockLabel(pass.todayCheckInAt) : '';
  const L = (en: string, hi: string) => bi(en, hi, lang);
  const status = STATUS_LABEL[pass.status];
  const roster = pass.attendees ?? [];

  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_24px_70px_-38px_rgba(15,35,66,.55)]">
      <div className={`relative overflow-hidden bg-gradient-to-br from-sindoor-deep via-sindoor to-[#3B1C4A] ${compact ? 'p-5' : 'p-6 sm:p-7'}`}>
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(238,44,143,.8), transparent 65%)' }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="font-ui text-[0.62rem] uppercase tracking-[0.24em] text-sky">
              {L(
                `${kindName(pass.event.kind, 'en', pass.event)} entry pass`,
                `${kindName(pass.event.kind, 'hi', pass.event)} प्रवेश पास`,
              )}{' '}
              · {bi(pass.ticket.name_en, pass.ticket.name_hi, lang)}
            </p>
            <h3 className="mt-2 font-display text-2xl leading-tight text-white sm:text-[1.8rem]">
              {bi(pass.event.name_en, pass.event.name_hi, lang)}
            </h3>
            <p className="mt-1 font-hindi text-sm text-marigold/90">
              {bi(pass.event.name_hi, pass.event.name_en, lang)}
            </p>
          </div>
          <span className={`chip shrink-0 border ${STATUS_STYLE[pass.status] ?? STATUS_STYLE.pending}`}>
            {status ? L(status[0], status[1]) : pass.status}
          </span>
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-4 border-t border-white/15 pt-4">
          <div>
            <p className="font-ui text-[0.6rem] uppercase tracking-[0.2em] text-cream-on-dark/50">
              {L('Reference number', 'संदर्भ नंबर')}
            </p>
            <p className="mt-1 font-mono text-xl font-semibold tracking-[0.18em] text-white">{pass.reference}</p>
          </div>
          <div className="text-right">
            <p className="font-ui text-[0.6rem] uppercase tracking-[0.2em] text-cream-on-dark/50">
              {L('Issued to', 'पास धारक')}
            </p>
            <p className="mt-1 max-w-[190px] truncate font-ui text-sm text-white">{pass.name}</p>
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${compact ? 'p-5' : 'p-6 sm:grid-cols-[auto_1fr] sm:p-7'}`}>
        <div className="mx-auto w-full max-w-[240px]">
          {paid && (
            <div
              className={`mb-3 rounded-2xl border p-3 ${
                liveQrOnly ? 'border-emerald-300 bg-emerald-50' : 'border-line bg-sandal-2'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                  <RefreshCw size={11} className={secondsLeft <= 10 ? 'text-red-500' : 'text-saffron'} />
                  {L('Live gate QR', 'लाइव गेट QR')}
                </p>
                <span
                  className={`font-mono text-[0.66rem] font-semibold ${
                    secondsLeft <= 10 ? 'text-red-600' : 'text-muted'
                  }`}
                >
                  {secondsLeft}s
                </span>
              </div>
              {liveQr ? (
                <img
                  src={liveQr}
                  alt={`Live gate QR ${pass.reference}`}
                  className="mx-auto mt-2 w-full max-w-[190px]"
                />
              ) : (
                <div className="mt-2 grid aspect-square w-full place-items-center rounded-xl border border-dashed border-line">
                  <Loader2 size={22} className="animate-spin text-muted" />
                </div>
              )}
              {liveCode && (
                <p className="mt-1.5 break-all text-center font-mono text-[0.56rem] tracking-[0.06em] text-muted">
                  {liveCode}
                </p>
              )}
              <p className="mt-1.5 text-center text-[0.62rem] leading-snug text-muted">
                {L(
                  'Refreshes every minute. Show this QR at the gate — an old screenshot stops working.',
                  'हर मिनट बदलता है। गेट पर यही QR दिखाएँ — पुराना स्क्रीनशॉट काम नहीं करेगा।',
                )}
              </p>
              {liveError && <p className="mt-1 text-center text-[0.62rem] text-red-600">{liveError}</p>}
            </div>
          )}
          {paid && liveQrOnly && (
            <p className="mb-3 text-center text-[0.62rem] leading-snug text-emerald-700">
              {L(
                'Printed QR is switched off at the gate. Only the live QR above is accepted.',
                'गेट पर प्रिंटेड QR बंद है। ऊपर वाला लाइव QR ही मान्य है।',
              )}
            </p>
          )}
          {(!paid || !liveQrOnly) && (qr ? (
            <div className="relative rounded-2xl border border-line bg-[#FFFDF1] p-3">
              <span className="absolute left-2 top-2 h-4 w-4 rounded-tl-lg border-l-2 border-t-2 border-saffron/40" />
              <span className="absolute right-2 top-2 h-4 w-4 rounded-tr-lg border-r-2 border-t-2 border-saffron/40" />
              <span className="absolute bottom-2 left-2 h-4 w-4 rounded-bl-lg border-b-2 border-l-2 border-saffron/40" />
              <span className="absolute bottom-2 right-2 h-4 w-4 rounded-br-lg border-b-2 border-r-2 border-saffron/40" />
              <img src={qr} alt={`QR pass ${pass.reference}`} className="mx-auto w-full" />
            </div>
          ) : (
            <div className="mx-auto grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-line bg-sandal-2 text-center">
              <div className="px-6">
                <QrCode size={34} className="mx-auto text-muted/50" />
                <p className="mt-3 text-xs text-muted">
                  {paid ? L('Preparing your QR pass…', 'आपका QR पास तैयार हो रहा है…') : L('The QR pass is issued after payment.', 'भुगतान के बाद QR पास जारी होगा।')}
                </p>
              </div>
            </div>
          ))}
          {!liveQrOnly && qr && (
            <button type="button" onClick={downloadQr} className="btn btn-ghost btn-sm btn-block mt-3">
              <Download size={14} /> {L('Download QR', 'QR डाउनलोड करें')}
            </button>
          )}
          <p className="mt-3 text-center text-[0.66rem] leading-relaxed text-muted">
            {L('One QR for', 'एक QR से')} {qty} {qty === 1 ? L('person', 'व्यक्ति') : L('people', 'लोग')} ·{' '}
            {multiDay
              ? L(
                  `${totalDays}-day pass · each attendee may enter once per event day`,
                  `${totalDays} दिनों का पास · हर व्यक्ति हर आयोजन दिन में एक बार प्रवेश`,
                )
              : L(
                  `single-day pass · each attendee may enter once${calendarDays > 1 ? ' on one event day' : ''}`,
                  `एक दिन का पास · हर व्यक्ति ${calendarDays > 1 ? 'किसी एक आयोजन दिन में ' : ''}एक बार प्रवेश`,
                )}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-saffron/10 text-saffron-ink">
              <Ticket size={17} />
            </span>
            <div>
              <p className="font-ui text-sm font-semibold text-ink">
                {bi(pass.ticket.name_en, pass.ticket.name_hi, lang)}
              </p>
              <p className="text-[0.7rem] text-muted">
                {formatRupees(pass.unitPrice)} {L('per head', 'प्रति व्यक्ति')}
              </p>
            </div>
          </div>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <CalendarDays size={15} className="mt-0.5 shrink-0 text-saffron" />
              <div>
                <dt className="font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">{L('Date & time', 'तारीख़ और समय')}</dt>
                <dd className="text-ink">{dateLabel}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="mt-0.5 shrink-0 text-saffron" />
              <div>
                <dt className="font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">{L('Venue', 'स्थान')}</dt>
                <dd className="text-ink">
                  {bi(pass.location.venue_en, pass.location.venue_hi, lang)}
                  <span className="block text-xs text-muted">
                    {bi(pass.location.address_en, pass.location.address_hi, lang)}
                  </span>
                  <span className="block text-xs text-muted">
                    {bi(pass.location.city_en, pass.location.city_hi, lang)},{' '}
                    {bi(pass.location.state_en, pass.location.state_hi, lang)}
                  </span>
                  {pass.location.mapUrl && (
                    <a
                      href={pass.location.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 font-ui text-[0.68rem] font-semibold text-saffron-ink hover:underline"
                    >
                      <Navigation size={11} /> {bi('Get directions', 'दिशा-निर्देश', lang)}
                    </a>
                  )}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users size={15} className="mt-0.5 shrink-0 text-saffron" />
              <div>
                <dt className="font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">{L('Attendees', 'कितने लोग')}</dt>
                <dd className="text-ink">
                  {pass.qty} {pass.qty === 1 ? L('person', 'व्यक्ति') : L('people', 'लोग')} ·{' '}
                  {pass.amount === 0
                    ? L('Free pass', 'निःशुल्क पास')
                    : `${formatRupees(pass.amount)} ${
                        paid
                          ? L('paid', 'भुगतान हुआ')
                          : pass.status === 'pending'
                            ? L('to pay', 'देय राशि')
                            : L('total', 'कुल राशि')
                      }`}
                  {pass.discount ? (
                    <span className="block text-xs text-emerald-700">
                      {L('Coupon discount', 'कूपन छूट')} − {formatRupees(pass.discount)}
                      {pass.couponCode ? ` · ${pass.couponCode}` : ''}
                    </span>
                  ) : null}
                  {roster.length > 1 && (
                    <ol className="mt-2 space-y-1 border-t border-dashed border-line pt-2">
                      {roster.map((person) => (
                        <li key={person.position} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                          <span className="font-ui font-semibold text-ink">
                            {person.position}. {person.name}
                          </span>
                          <span className="font-mono text-muted">{person.phone}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail size={15} className="mt-0.5 shrink-0 text-saffron" />
              <div>
                <dt className="font-ui text-[0.6rem] uppercase tracking-[0.14em] text-muted">{L('Booked by', 'बुक करने वाले')}</dt>
                <dd className="text-ink">
                  {pass.email}
                  <span className="block text-xs text-muted">{pass.phone}</span>
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-4 rounded-xl border border-line bg-sandal-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
            {todayEntries > 0 ? (
              <span className="flex items-start gap-2 text-emerald-700">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                {L(
                  `${todayEntries} of ${qty} ${qty === 1 ? 'person has' : 'people have'} entered today${
                    todayTime ? ` (last at ${todayTime})` : ''
                  }. ${
                    todayLeft > 0
                      ? `${todayLeft} ${todayLeft === 1 ? 'seat is' : 'seats are'} still open today — show this QR once for each remaining person.`
                      : `All ${qty} seats have entered today.${
                          daysLeft > 0
                            ? ` ${daysLeft} of ${totalDays} event ${daysLeft === 1 ? 'day is' : 'days are'} still open — the same QR works on a later event day.`
                            : ' No event days remain.'
                        }`
                  }`,
                  `${qty} में से ${todayEntries} ${qty === 1 ? 'व्यक्ति' : 'लोग'} ने आज प्रवेश किया${
                    todayTime ? ` (अंतिम प्रवेश ${todayTime})` : ''
                  }। ${
                    todayLeft > 0
                      ? `${todayLeft} सीटें आज और खुली हैं — बाकी लोगों के लिए यही QR दोबारा दिखाएँ।`
                      : `आज सभी ${qty} सीटों का प्रवेश हो गया।${
                          daysLeft > 0
                            ? ` ${totalDays} में से ${daysLeft} आयोजन दिन अभी बाकी हैं — बाद के दिन यही QR काम करेगा।`
                            : ' कोई आयोजन दिन बाकी नहीं है।'
                        }`
                  }`,
                )}
              </span>
            ) : entriesUsed > 0 ? (
              <span className="flex items-start gap-2 text-emerald-700">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                {daysLeft > 0
                  ? L(
                      `${entriesUsed} ${entriesUsed === 1 ? 'entry has' : 'entries have'} been used across ${daysUsed} of ${totalDays} event ${
                        totalDays === 1 ? 'day' : 'days'
                      }. Today's ${qty === 1 ? 'entry is' : `${qty} entries are`} still open — show this QR at the gate.`,
                      `इस पास पर ${entriesUsed} प्रवेश उपयोग हो चुके हैं (${totalDays} में से ${daysUsed} आयोजन दिन)। आज ${
                        qty === 1 ? 'का प्रवेश' : `की ${qty} सीटें`
                      } अभी खुली ${qty === 1 ? 'है' : 'हैं'} — गेट पर यही QR दिखाएँ।`,
                    )
                  : L(
                      `All ${totalDays} event ${totalDays === 1 ? 'day' : 'days'} on this pass are used. Entry is closed.`,
                      `इस पास के सभी ${totalDays} आयोजन दिन उपयोग हो चुके हैं। प्रवेश बंद है।`,
                    )}
              </span>
            ) : paid ? (
              <span className="flex items-start gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                {L(
                  `Show this QR at the gate. It admits up to ${qty} ${qty === 1 ? 'person' : 'people'}${
                    multiDay
                      ? `, once per event day on each of ${totalDays} days.`
                      : calendarDays > 1
                        ? ` on one of the ${calendarDays} event days.`
                        : '.'
                  }`,
                  `गेट पर यह QR दिखाएँ। इससे ${qty === 1 ? 'एक व्यक्ति' : `अधिकतम ${qty} लोग`}${
                    multiDay
                      ? ` ${totalDays} आयोजन दिनों में हर दिन एक बार प्रवेश कर सकते हैं।`
                      : calendarDays > 1
                        ? ` ${calendarDays} आयोजन दिनों में से किसी एक दिन प्रवेश कर सकते हैं।`
                        : ' एक बार प्रवेश कर सकते हैं।'
                  }`,
                )}
              </span>
            ) : (
              <span className="flex items-start gap-2">
                <Clock3 size={15} className="mt-0.5 shrink-0 text-amber-600" />
                {L(
                  'This pass becomes valid once payment is confirmed. Keep your reference number.',
                  'भुगतान की पुष्टि के बाद यह पास मान्य होगा। अपना संदर्भ नंबर संभालकर रखें।',
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
