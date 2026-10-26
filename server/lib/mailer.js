import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { query } from '../db.js';
import { buildPassPdf } from './passPdf.js';
import { isRealSocialUrl } from './social.js';

let transporter = null;
let warnedMissingPass = false;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, user, pass } = config.smtp;
  if (!host || !user) return null;
  if (!pass) {
    if (!warnedMissingPass) {
      console.warn(
        '[mail] SMTP_PASS is empty. Add a Gmail App Password (not the account password) to .env to send OTP and pass emails.',
      );
      warnedMissingPass = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export function mailerConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}

const FROM = () => config.smtp.from;
const supportEmail = () => config.supportEmail;
const siteUrl = () => config.siteUrl;

async function recordEmail({
  kind,
  to,
  subject,
  bookingId = null,
  reference = null,
  reminderType = null,
  status,
  provider,
  error = null,
  meta = null,
}) {
  try {
    await query(
      `INSERT INTO email_log
        (kind, recipient, subject, booking_id, reference, reminder_type, status, provider, error, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kind,
        String(to).slice(0, 190),
        String(subject).slice(0, 255),
        bookingId,
        reference ? String(reference).slice(0, 40) : null,
        reminderType,
        status,
        provider,
        error ? String(error).slice(0, 255) : null,
        meta ? JSON.stringify(meta) : null,
      ],
    );
  } catch (err) {
    console.error('[mail-log] could not save email record:', err.message);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value) {
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function directionsUrl({ mapUrl, venue, address, city, state }) {
  if (mapUrl) return mapUrl;
  const query = [venue, address, city, state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function emailShell({ eyebrow, title, subtitle, body, footerNote, social = false }) {
  return `
  <div style="background:#FFFDF1;padding:28px;font-family:Arial,sans-serif;color:#0F2342">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E1D3;border-radius:16px;overflow:hidden">
      <div style="background:#0F2342;padding:24px 28px">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#FFD21F">${escapeHtml(eyebrow)}</p>
        <h1 style="margin:8px 0 0;font-size:24px;color:#fff">${escapeHtml(title)}</h1>
        ${subtitle ? `<p style="margin:6px 0 0;font-size:14px;color:#E8F1F8">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div style="padding:26px 28px">${body}</div>
      <div style="padding:16px 28px;background:#FAF6E5;font-size:11px;color:#5F6B80;line-height:1.6">
        ${footerNote || `This pass is valid only at the venue printed above. If you did not make this booking, contact ${escapeHtml(supportEmail())}.`}
        ${social ? socialFooter() : ''}
      </div>
    </div>
  </div>`;
}

function detailsTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rows
      .map(
        ([label, value, bold]) => `<tr>
          <td style="padding:6px 0;color:#5F6B80;vertical-align:top">${escapeHtml(label)}</td>
          <td style="padding:6px 0;text-align:right;vertical-align:top;${bold ? 'font-weight:700' : ''}">${value}</td>
        </tr>`,
      )
      .join('')}
  </table>`;
}

function button(href, label, color = '#EE2C8F') {
  return `<p style="margin:22px 0 0;text-align:center">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:14px">${escapeHtml(label)}</a>
  </p>`;
}

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
];

let socialAssets = null;

function socialLinks() {
  if (!socialAssets) {
    socialAssets = SOCIAL_PLATFORMS.map((platform) => ({
      ...platform,
      href: config.social[platform.key] || '',
      content: readFileSync(new URL(`../assets/email/social/${platform.key}.png`, import.meta.url)),
    }));
  }
  return socialAssets.filter((platform) => isRealSocialUrl(platform.key, platform.href));
}

function socialFooter() {
  const links = socialLinks();
  if (links.length === 0) return '';
  return `<div style="margin-top:16px;text-align:center">
    <p style="margin:0 0 8px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#5F6B80">Follow Adhyatmik Bharat</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
      ${links
        .map(
          (platform) => `<td style="padding:0 5px"><a href="${escapeHtml(platform.href)}" target="_blank" rel="noopener" style="text-decoration:none"><img src="cid:social-${platform.key}" width="28" height="28" alt="${platform.label}" style="display:block;border:0;border-radius:7px" /></a></td>`,
        )
        .join('')}
    </tr></table>
  </div>`;
}

function socialAttachments() {
  return socialLinks().map((platform) => ({
    filename: `${platform.key}.png`,
    content: platform.content,
    cid: `social-${platform.key}`,
    contentDisposition: 'inline',
  }));
}

function socialText() {
  const links = socialLinks();
  if (links.length === 0) return '';
  return `Follow us: ${links.map((platform) => `${platform.label} ${platform.href}`).join(' · ')}`;
}

export async function sendOtpEmail({ to, code, purpose = 'booking', bookingId = null, reference = null }) {
  const tx = getTransporter();
  const subject =
    purpose === 'stall' ? 'Your stall booking verification code' : 'Your Adhyatmik Bharat verification code';
  const logBase = { kind: 'otp', to, subject, bookingId, reference, meta: { purpose } };
  if (!tx) {
    // No SMTP configured — the code is surfaced in the server log only.
    console.log(`[OTP][dev] ${purpose} for ${to}: ${code}`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }
  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Verification',
    title: 'Confirm your booking',
    subtitle: 'Use this 6-digit code to continue',
    body: `
      <div style="margin:0 auto 18px;width:max-content;background:#FFFDF1;border:1px dashed #E5E1D3;border-radius:12px;padding:14px 24px;font-family:monospace;font-size:30px;letter-spacing:9px;font-weight:700;color:#0F2342">${escapeHtml(code)}</div>
      <p style="margin:0;text-align:center;font-size:14px;color:#5F6B80;line-height:1.6">
        Enter this code on the booking page. It expires in 10 minutes.<br />If you did not request it, ignore this email.
      </p>`,
    footerNote: `Need help? Write to ${escapeHtml(supportEmail())}.`,
  });
  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      text: `Your Adhyatmik Bharat verification code is ${code}. It expires in 10 minutes.`,
      html,
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendWaitlistOtpEmail({ to, code, stateName, reference = null }) {
  const tx = getTransporter();
  const subject = `Confirm your waitlist request · ${stateName}`;
  const logBase = { kind: 'otp', to, subject, bookingId: null, reference, meta: { purpose: 'waitlist', stateName } };
  if (!tx) {
    console.log(`[OTP][dev] waitlist for ${to} (${stateName}): ${code}`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }
  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Verification',
    title: `Coming to ${stateName}`,
    subtitle: 'Use this 6-digit code to join the waitlist',
    body: `
      <div style="margin:0 auto 18px;width:max-content;background:#FFFDF1;border:1px dashed #E5E1D3;border-radius:12px;padding:14px 24px;font-family:monospace;font-size:30px;letter-spacing:9px;font-weight:700;color:#0F2342">${escapeHtml(code)}</div>
      <p style="margin:0;text-align:center;font-size:14px;color:#5F6B80;line-height:1.6">
        Enter this code on the site to confirm you want news for ${escapeHtml(stateName)}. It expires in 10
        minutes.<br />If you did not request it, ignore this email.
      </p>`,
    footerNote: `We will only write to you when Mahi Sundarkand is scheduled in your state. Need help? Write to ${escapeHtml(supportEmail())}.`,
  });
  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      text: `Your Adhyatmik Bharat waitlist code for ${stateName} is ${code}. It expires in 10 minutes.`,
      html,
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendWaitlistAnnouncementEmail({ to, name, stateName, subject, message, waitlistRef = null }) {
  const tx = getTransporter();
  const logBase = {
    kind: 'notice',
    to,
    subject,
    bookingId: null,
    reference: waitlistRef,
    meta: { purpose: 'waitlist-broadcast', stateName },
  };
  if (!tx) {
    console.log(`[WAITLIST][dev] ${to} (${stateName}): ${subject}`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }
  const body = escapeHtml(message).replace(/\r?\n/g, '<br />');
  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Waitlist update',
    title: subject,
    subtitle: `For devotees waiting in ${stateName}`,
    body: `
      <p style="margin:0 0 6px;font-size:14px;color:#5F6B80">Radhe Radhe, ${escapeHtml(name)}.</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#3A4560">${body}</p>
      ${button(`${siteUrl()}/#passes`, 'View passes & cities')}`,
    footerNote: `You received this because you confirmed the ${escapeHtml(stateName)} waitlist on Adhyatmik Bharat. To stop these updates, write to ${escapeHtml(supportEmail())}.`,
    social: true,
  });
  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      html,
      text: `Radhe Radhe, ${name}.\n\n${message}\n\nView passes & cities: ${siteUrl()}/#passes\n\nYou received this because you confirmed the ${stateName} waitlist on Adhyatmik Bharat. To stop these updates, write to ${supportEmail()}.${socialText() ? `\n\n${socialText()}` : ''}`,
      attachments: socialAttachments(),
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendStaffKycOtpEmail({ to, code, staffName }) {
  const tx = getTransporter();
  const subject = 'Confirm your gate staff account';
  const logBase = { kind: 'otp', to, subject, bookingId: null, reference: null, meta: { purpose: 'staff-kyc', staffName } };
  if (!tx) {
    console.log(`[OTP][dev] staff KYC for ${to} (${staffName}): ${code}`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }
  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Gate staff',
    title: 'Confirm your details',
    subtitle: 'Use this 6-digit code to finish your staff verification',
    body: `
      <div style="margin:0 auto 18px;width:max-content;background:#FFFDF1;border:1px dashed #E5E1D3;border-radius:12px;padding:14px 24px;font-family:monospace;font-size:30px;letter-spacing:9px;font-weight:700;color:#0F2342">${escapeHtml(code)}</div>
      <p style="margin:0;text-align:center;font-size:14px;color:#5F6B80;line-height:1.6">
        Radhe Radhe, ${escapeHtml(staffName)}. Share this code with the administrator so your identity
        details can be marked verified. It expires in 10 minutes.<br />If you did not expect it, contact ${escapeHtml(supportEmail())}.
      </p>`,
  });
  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      text: `Your Adhyatmik Bharat gate staff verification code is ${code}. It expires in 10 minutes.`,
      html,
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendPassEmail({
  to,
  name,
  reference,
  eventName,
  ticketName,
  venue,
  address,
  city,
  state,
  dateLabel,
  mapUrl,
  qty,
  amount,
  qrToken,
  passDays = 1,
  attendees = [],
  bookingId = null,
  note = null,
}) {
  const tx = getTransporter();
  const entryNote =
    Number(passDays) > 1
      ? `One QR covers all ${qty} seat${Number(qty) === 1 ? '' : 's'} in this booking. Every attendee may enter once on each of the ${passDays} event days.`
      : `One QR covers all ${qty} seat${Number(qty) === 1 ? '' : 's'} in this booking. Every attendee may enter once on the event day.`;
  const passUrl = `${siteUrl()}/#my-booking`;
  const directions = directionsUrl({ mapUrl, venue, address, city, state });
  const subject = `Your QR pass · ${reference} · ${eventName}`;
  const amountLine = Number(amount) > 0 ? money(amount) : 'Free pass — no payment needed';
  const logBase = {
    kind: 'pass',
    to,
    subject,
    bookingId,
    reference,
    meta: { eventName, ticketName, city, qty, amount },
  };
  const qrBuffer = await QRCode.toBuffer(qrToken, {
    width: 420,
    margin: 1,
    color: { dark: '#0F2342', light: '#FFFFFF' },
  });

  if (!tx) {
    console.log(`[PASS][dev] ${reference} for ${to} · ${eventName} · ${city} · qty ${qty} · QR token ${qrToken}`);
    console.log(`[PASS][dev] Directions: ${directions}`);
    console.log(`[PASS][dev] The QR pass email would be sent from ${FROM()} once SMTP is configured.`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }

  const pdfName = `Adhyatmik-Bharat-Pass-${reference}.pdf`;
  const pdfBuffer = await buildPassPdf({
    reference,
    name,
    eventName,
    ticketName,
    venue,
    address,
    city,
    state,
    dateLabel,
    mapUrl,
    qty,
    amount,
    qrToken,
    passDays,
    attendees,
    note,
    passUrl,
    supportEmail: supportEmail(),
  });

  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · QR pass',
    title: eventName,
    subtitle: `${ticketName} · ${qty} ${Number(qty) === 1 ? 'seat' : 'seats'}`,
    body: `
      <p style="margin:0 0 6px;font-size:14px;color:#5F6B80">Radhe Radhe, ${escapeHtml(name)}.</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3A4560">
        ${note ? escapeHtml(note) : 'Your payment is confirmed. Show this QR at the gate. Staff will scan it, match your reference in our database and check you in for the day.'}
      </p>
      ${detailsTable([
        ['Reference', `<span style="font-weight:700;letter-spacing:1px">${escapeHtml(reference)}</span>`],
        ['Pass for', `${escapeHtml(name)} · ${escapeHtml(ticketName)}`],
        ['Venue', `${escapeHtml(venue)}, ${escapeHtml(city)}`],
        ['Address', escapeHtml(address)],
        ['State', escapeHtml(state)],
        ['Date', escapeHtml(dateLabel)],
        ['Amount', amountLine, true],
      ])}
      <div style="margin:24px auto 8px;text-align:center">
        <img src="cid:pass-qr" alt="QR pass ${escapeHtml(reference)}" width="210" height="210" style="border:1px solid #E5E1D3;border-radius:12px;padding:8px" />
      </div>
      <p style="margin:0;text-align:center;font-size:12px;color:#5F6B80">${escapeHtml(entryNote)}</p>
      <div style="margin:18px 0 0;border:1px solid #E5E1D3;background:#FFFDF1;border-radius:12px;padding:12px 16px;text-align:center">
        <p style="margin:0;font-size:13px;font-weight:700;color:#0F2342">PDF pass attached</p>
        <p style="margin:4px 0 0;font-size:11px;line-height:1.6;color:#5F6B80">
          Download <strong>${escapeHtml(pdfName)}</strong> from this email for a printable copy with the same QR and the full attendee list. Keep it on your phone or carry a printout.
        </p>
      </div>
      <p style="margin:18px 0 0;text-align:center;font-size:13px;color:#3A4560">
        <strong>Directions:</strong> ${escapeHtml(venue)}, ${escapeHtml(address)}, ${escapeHtml(city)}, ${escapeHtml(state)}
      </p>
      ${button(directions, 'Get directions', '#0F2342')}
      ${button(passUrl, 'Open my booking')}`,
    social: true,
  });

  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      html,
      text: `Your Adhyatmik Bharat pass is confirmed.

Reference: ${reference}
Event: ${eventName}
Ticket: ${ticketName} x ${qty}
Pass for: ${name}
Venue: ${venue}
Address: ${address}, ${city}, ${state}
Date: ${dateLabel}
Amount: ${amountLine}
Directions: ${directions}

${note || 'Show the QR attached to this email at the gate.'} ${entryNote}
A printable PDF pass is attached: ${pdfName}
Open your booking: ${passUrl}${socialText() ? `\n\n${socialText()}` : ''}`,
      attachments: [
        { filename: pdfName, content: pdfBuffer, contentType: 'application/pdf' },
        { filename: `pass-${reference}.png`, content: qrBuffer, cid: 'pass-qr' },
        ...socialAttachments(),
      ],
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendBookingNoticeEmail({
  to,
  name,
  reference,
  eventName,
  ticketName,
  venue,
  city,
  dateLabel,
  qty,
  amount,
  status,
  reason = null,
  refundAmount = 0,
  refundReference = null,
  bookingId = null,
}) {
  const tx = getTransporter();
  const refunded = status === 'refunded' || Number(refundAmount) > 0;
  const subject = `${refunded ? 'Refund recorded' : 'Booking cancelled'} · ${reference} · ${eventName}`;
  const logBase = {
    kind: 'notice',
    to,
    subject,
    bookingId,
    reference,
    meta: { eventName, dateLabel, status, refundAmount: Number(refundAmount) || 0, refundReference },
  };

  if (!tx) {
    console.log(
      `[NOTICE][dev] ${status} for ${reference} (${to}) · refund ₹${Number(refundAmount) || 0}${refundReference ? ` · ${refundReference}` : ''}`,
    );
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }

  const refundBlock = refunded
    ? `<div style="margin:0 0 20px;border:1px solid #E5E1D3;background:#FFFDF1;border-radius:12px;padding:14px 16px">
        <p style="margin:0;font-size:13px;font-weight:700;color:#0F2342">Refund status</p>
        <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#3A4560">
          ${Number(refundAmount) > 0
            ? `A refund of <strong>${money(refundAmount)}</strong> has been recorded${
                refundReference ? ` (reference <strong>${escapeHtml(refundReference)}</strong>)` : ''
              }. As per our refund policy it should reflect in your original payment method within 15 working days.`
            : 'No refund is due on this booking. If you believe this is a mistake, write to us.'}
        </p>
      </div>`
    : '';

  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Booking update',
    title: refunded ? 'Your booking was cancelled and the refund recorded' : 'Your booking was cancelled',
    subtitle: `${eventName} · ${ticketName} · ${qty} seat${Number(qty) === 1 ? '' : 's'}`,
    body: `
      <p style="margin:0 0 6px;font-size:14px;color:#5F6B80">Radhe Radhe, ${escapeHtml(name)}.</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3A4560">
        Booking <strong>${escapeHtml(reference)}</strong> has been cancelled by the Adhyatmik Bharat team.
        The QR pass for this booking is no longer valid at the gate.
      </p>
      ${detailsTable([
        ['Reference', `<span style="font-weight:700;letter-spacing:1px">${escapeHtml(reference)}</span>`],
        ['Pass for', `${escapeHtml(name)} · ${escapeHtml(ticketName)}`],
        ['Venue', `${escapeHtml(venue)}, ${escapeHtml(city)}`],
        ['Date', escapeHtml(dateLabel)],
        ['Paid amount', money(amount)],
        ['Reason', escapeHtml(reason || 'Cancelled by the organiser')],
      ])}
      <div style="height:12px"></div>
      ${refundBlock}
      <p style="margin:0;font-size:13px;line-height:1.6;color:#3A4560">
        If you did not request this cancellation, or you have a question about the refund, write to
        ${escapeHtml(supportEmail())} with your reference number.
      </p>`,
    footerNote: `This is a booking update for ${escapeHtml(reference)}. Need help? Write to ${escapeHtml(supportEmail())}.`,
    social: true,
  });

  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      html,
      text: `Booking ${reference} has been ${refunded ? 'cancelled and refunded' : 'cancelled'}.

Reference: ${reference}
Event: ${eventName}
Ticket: ${ticketName} x ${qty}
Venue: ${venue}, ${city}
Date: ${dateLabel}
Paid amount: ${money(amount)}
Reason: ${reason || 'Cancelled by the organiser'}
${refunded ? `Refund recorded: ₹${Number(refundAmount) || 0}${refundReference ? ` (reference ${refundReference})` : ''}. It should reflect within 15 working days.` : 'No refund is due on this booking.'}

Questions? Write to ${supportEmail()}.${socialText() ? `\n\n${socialText()}` : ''}`,
      attachments: socialAttachments(),
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export async function sendReminderEmail({
  to,
  name,
  reference,
  eventName,
  ticketName,
  venue,
  address,
  city,
  state,
  dateLabel,
  mapUrl,
  qty,
  amount,
  qrToken,
  reminderType,
  bookingId = null,
}) {
  const tx = getTransporter();
  const directions = directionsUrl({ mapUrl, venue, address, city, state });
  const passUrl = `${siteUrl()}/#my-booking`;
  const isPending = reminderType === 'payment_pending';
  const whenLabel = reminderType === 'event_2h' ? 'in 2 hours' : 'tomorrow';
  const subject = isPending
    ? `Seats held · complete your booking ${reference}`
    : `${eventName} is ${whenLabel} · your QR pass ${reference}`;
  const logBase = {
    kind: 'reminder',
    to,
    subject,
    bookingId,
    reference,
    reminderType,
    meta: { eventName, dateLabel, city },
  };

  if (!tx) {
    console.log(`[REMINDER][dev] ${reminderType} for ${reference} (${to})${isPending ? '' : ` · QR ${qrToken}`}`);
    console.log(`[REMINDER][dev] Directions: ${directions}`);
    await recordEmail({ ...logBase, status: 'logged', provider: 'console' });
    return { delivered: false };
  }

  if (isPending) {
    const html = emailShell({
      eyebrow: 'Adhyatmik Bharat · Seats held',
      title: 'Complete your booking',
      subtitle: `${eventName} · ${qty} seat(s) held`,
      body: `
        <p style="margin:0 0 6px;font-size:14px;color:#5F6B80">Radhe Radhe, ${escapeHtml(name)}.</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3A4560">
          Your seats are still reserved, but payment is not complete yet. Seats are released after
          30 minutes, so please finish your booking now.
        </p>
        ${detailsTable([
          ['Reference', `<span style="font-weight:700;letter-spacing:1px">${escapeHtml(reference)}</span>`],
          ['Ticket', `${escapeHtml(ticketName)} × ${qty}`],
          ['Venue', `${escapeHtml(venue)}, ${escapeHtml(city)}`],
          ['Date', escapeHtml(dateLabel)],
          ['Amount', money(amount), true],
        ])}
        ${button(passUrl, 'Complete payment')}`,
      footerNote: `Seats are held for 30 minutes from booking. Need help? Write to ${escapeHtml(supportEmail())}.`,
    });
    try {
      await tx.sendMail({
        from: FROM(),
        to,
        subject,
        html,
        text: `Your seats for ${eventName} are still held.

Reference: ${reference}
Ticket: ${ticketName} x ${qty}
Venue: ${venue}, ${city}
Date: ${dateLabel}
Amount: ${money(amount)}

Complete payment within 30 minutes: ${passUrl}`,
      });
      await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
      return { delivered: true };
    } catch (err) {
      await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
      throw err;
    }
  }

  const qrBuffer = await QRCode.toBuffer(qrToken, {
    width: 420,
    margin: 1,
    color: { dark: '#0F2342', light: '#FFFFFF' },
  });
  const html = emailShell({
    eyebrow: 'Adhyatmik Bharat · Event reminder',
    title: `${eventName} is ${whenLabel}`,
    subtitle: `${ticketName} · ${qty} seat(s) · ${dateLabel}`,
    body: `
      <p style="margin:0 0 6px;font-size:14px;color:#5F6B80">Radhe Radhe, ${escapeHtml(name)}.</p>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3A4560">
        Your pass is confirmed. Keep this email handy — the same QR is scanned at the gate for entry.
      </p>
      ${detailsTable([
        ['Reference', `<span style="font-weight:700;letter-spacing:1px">${escapeHtml(reference)}</span>`],
        ['Venue', `${escapeHtml(venue)}, ${escapeHtml(city)}`],
        ['Address', escapeHtml(address)],
        ['State', escapeHtml(state)],
        ['Date', escapeHtml(dateLabel)],
      ])}
      <div style="margin:24px auto 8px;text-align:center">
        <img src="cid:pass-qr" alt="QR pass ${escapeHtml(reference)}" width="210" height="210" style="border:1px solid #E5E1D3;border-radius:12px;padding:8px" />
      </div>
      ${button(directions, 'Get directions', '#0F2342')}
      ${button(passUrl, 'Open my pass')}`,
    social: true,
  });

  try {
    await tx.sendMail({
      from: FROM(),
      to,
      subject,
      html,
      text: `${eventName} is ${whenLabel}.

Reference: ${reference}
Ticket: ${ticketName} x ${qty}
Venue: ${venue}
Address: ${address}, ${city}, ${state}
Date: ${dateLabel}
Directions: ${directions}

Show the attached QR at the gate: ${passUrl}${socialText() ? `\n\n${socialText()}` : ''}`,
      attachments: [{ filename: `pass-${reference}.png`, content: qrBuffer, cid: 'pass-qr' }, ...socialAttachments()],
    });
    await recordEmail({ ...logBase, status: 'sent', provider: 'smtp' });
    return { delivered: true };
  } catch (err) {
    await recordEmail({ ...logBase, status: 'failed', provider: 'smtp', error: err.message });
    throw err;
  }
}

export const mailerSiteUrl = config.siteUrl;
