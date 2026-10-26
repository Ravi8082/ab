import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { isRealSocialUrl } from './social.js';

const NAVY = '#0F2342';
const GOLD = '#FFD21F';
const PINK = '#EE2C8F';
const MUTED = '#5F6B80';
const INK_SOFT = '#3A4560';
const LINE = '#E5E1D3';
const PAGE_WIDTH = 595.28;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
];

let socialCache = null;

function socialLinks() {
  if (!socialCache) {
    socialCache = SOCIAL_PLATFORMS.map((platform) => ({
      ...platform,
      href: config.social[platform.key] || '',
      icon: readFileSync(new URL(`../assets/email/social/${platform.key}.png`, import.meta.url)),
    })).filter((platform) => isRealSocialUrl(platform.key, platform.href));
  }
  return socialCache;
}

function drawSocialRow(doc, y, links) {
  if (links.length === 0) return;
  const iconSize = 12;
  const labelGap = 5;
  const groupGap = 14;
  doc.font('Helvetica-Bold').fontSize(8);
  const sizes = links.map((link) => doc.widthOfString(link.label));
  const total =
    sizes.reduce((sum, width) => sum + iconSize + labelGap + width, 0) + groupGap * (links.length - 1);
  let x = (PAGE_WIDTH - total) / 2;
  links.forEach((link, index) => {
    doc.image(link.icon, x, y, { width: iconSize, height: iconSize, link: link.href });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(link.label, x + iconSize + labelGap, y + 2.5, { link: link.href });
    x += iconSize + labelGap + sizes[index] + groupGap;
  });
}

function drawPill(doc, x, y, width, label, color, link) {
  const height = 22;
  doc.roundedRect(x, y, width, height, 11).fill(color);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(label, x, y + 6.5, { width, align: 'center', link });
  return height;
}

function rupees(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? `Rs. ${amount.toLocaleString('en-IN')}` : 'Free pass — no payment needed';
}

function directionsUrl({ mapUrl, venue, address, city, state }) {
  if (mapUrl) return mapUrl;
  const query = [venue, address, city, state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * A printable A4 pass that mirrors the ticket email: same header, greeting, detail rows,
 * centered QR, entry note, directions and booking links, and the social footer. Names and
 * venue fields use the Latin columns so the PDF renders on every device.
 */
export async function buildPassPdf({
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
  passDays = 1,
  attendees = [],
  note = null,
  supportEmail = '',
  passUrl = '',
}) {
  const seats = Math.max(1, Number(qty) || 1);
  const days = Math.max(1, Number(passDays) || 1);
  const entryNote =
    days > 1
      ? `One QR covers all ${seats} seat${seats === 1 ? '' : 's'} in this booking. Every attendee may enter once on each of the ${days} event days.`
      : `One QR covers all ${seats} seat${seats === 1 ? '' : 's'} in this booking. Every attendee may enter once on the event day.`;
  const intro =
    note ||
    'Your payment is confirmed. Show this QR at the gate. Staff will scan it, match your reference in our database and check you in for the day.';
  const directions = directionsUrl({ mapUrl, venue, address, city, state });
  const bookingUrl = passUrl || `${config.siteUrl.replace(/\/$/, '')}/#my-booking`;
  const roster = Array.isArray(attendees) ? attendees.filter((person) => person?.name) : [];

  const qr = await QRCode.toBuffer(String(qrToken), {
    width: 600,
    margin: 1,
    color: { dark: NAVY, light: '#FFFFFF' },
  });

  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: `Adhyatmik Bharat pass ${reference}`, Author: 'Adhyatmik Bharat' },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(20);
  const titleHeight = doc.heightOfString(eventName || 'Event pass', { width: 370, lineGap: 1 });
  const subtitleY = 48 + titleHeight + 8;
  const headerHeight = Math.max(120, subtitleY + 28);

  doc.rect(0, 0, PAGE_WIDTH, headerHeight).fill(NAVY);
  doc
    .fillColor(GOLD)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('ADHYATMIK BHARAT  ·  QR PASS', MARGIN, 30, { characterSpacing: 2 });
  doc
    .fillColor('#FFFFFF')
    .fontSize(20)
    .text(eventName || 'Event pass', MARGIN, 48, { width: 370, lineGap: 1 });
  doc
    .fillColor('#C9D6E3')
    .font('Helvetica')
    .fontSize(10)
    .text(`${ticketName}  ·  ${seats} ${seats === 1 ? 'seat' : 'seats'}`, MARGIN, subtitleY, { width: 370 });
  doc
    .fillColor(GOLD)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('KEEP THIS PDF', PAGE_WIDTH - 170, 34, { width: 110, align: 'right', characterSpacing: 1.2 });
  doc
    .fillColor('#C9D6E3')
    .font('Helvetica')
    .fontSize(8)
    .text('Works offline at the venue', PAGE_WIDTH - 170, 48, { width: 110, align: 'right' });

  let y = headerHeight + 22;
  doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Radhe Radhe, ${name}.`, MARGIN, y);
  y += 17;
  doc.fillColor(INK_SOFT).fontSize(10.5);
  const introHeight = doc.heightOfString(intro, { width: CONTENT_WIDTH, lineGap: 1.5 });
  doc.text(intro, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 1.5 });
  y += introHeight + 16;

  const details = [
    ['Reference', reference, true],
    ['Pass for', `${name} · ${ticketName}`, false],
    ['Venue', [venue, city].filter(Boolean).join(', '), false],
    ['Address', address, false],
    ['State', state, false],
    ['Date', dateLabel, false],
    ['Amount', rupees(amount), true],
  ];

  const valueWidth = CONTENT_WIDTH - 116;
  for (const [label, value, bold] of details) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(String(label).toUpperCase(), MARGIN, y + 2, { width: 110, characterSpacing: 0.8 });
    doc.fillColor(NAVY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const height = doc.heightOfString(String(value ?? '—'), { width: valueWidth, lineGap: 1.5 });
    doc.text(String(value ?? '—'), MARGIN + 116, y, { width: valueWidth, align: 'right', lineGap: 1.5 });
    y += Math.max(height, 12) + 8;
  }

  y += 8;
  const qrSize = 150;
  const framePad = 8;
  const frameSize = qrSize + framePad * 2;
  const qrX = (PAGE_WIDTH - frameSize) / 2;
  doc.roundedRect(qrX, y, frameSize, frameSize, 12).lineWidth(1).strokeColor(LINE).stroke();
  doc.image(qr, qrX + framePad, y + framePad, { width: qrSize, height: qrSize });
  y += frameSize + 10;

  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  const entryHeight = doc.heightOfString(entryNote, {
    width: CONTENT_WIDTH - 80,
    align: 'center',
    lineGap: 1.5,
  });
  doc.text(entryNote, MARGIN + 40, y, { width: CONTENT_WIDTH - 80, align: 'center', lineGap: 1.5 });
  y += entryHeight + 14;

  if (roster.length > 1) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(`ATTENDEES ON THIS PASS · ${seats}`, MARGIN, y, { characterSpacing: 1 });
    y += 12;
    const visible = roster.slice(0, 20);
    const columns = visible.length > 10 ? 3 : 2;
    const rows = Math.ceil(visible.length / columns);
    const columnGap = 12;
    const columnWidth = (CONTENT_WIDTH - columnGap * (columns - 1)) / columns;
    const startY = y;
    visible.forEach((person, index) => {
      const column = Math.floor(index / rows);
      const lineY = startY + (index % rows) * 12;
      const x = MARGIN + column * (columnWidth + columnGap);
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(`${index + 1}. ${person.name}`, x, lineY, { width: columnWidth - 68, ellipsis: true });
      if (person.phone) {
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(8)
          .text(person.phone, x + columnWidth - 64, lineY + 0.5, { width: 64, align: 'right' });
      }
    });
    y = startY + rows * 12 + 8;
    if (roster.length > visible.length) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(`+ ${roster.length - visible.length} more attendee(s) on the booking record.`, MARGIN, y);
      y += 12;
    }
  }

  doc.fillColor(INK_SOFT).font('Helvetica').fontSize(8.5);
  const directionsText = `Directions: ${[venue, address, city, state].filter(Boolean).join(', ')}`;
  const directionsHeight = doc.heightOfString(directionsText, {
    width: CONTENT_WIDTH - 60,
    align: 'center',
    lineGap: 1,
  });
  doc.text(directionsText, MARGIN + 30, y, { width: CONTENT_WIDTH - 60, align: 'center', lineGap: 1 });
  y += directionsHeight + 8;

  const directionsWidth = 112;
  const bookingWidth = 126;
  const pillGap = 10;
  const pillsX = (PAGE_WIDTH - (directionsWidth + bookingWidth + pillGap)) / 2;
  drawPill(doc, pillsX, y, directionsWidth, 'Get directions', NAVY, directions);
  drawPill(doc, pillsX + directionsWidth + pillGap, y, bookingWidth, 'Open my booking', PINK, bookingUrl);
  y += 22 + 12;

  // Keep the footer above the bottom margin so PDFKit never spills it onto a blank page.
  const footerY = doc.page.height - MARGIN - 42;
  if (y < footerY - 6) {
    const footerNote = `This pass is valid only at the venue printed above. If you did not make this booking, contact ${
      supportEmail || 'our help desk'
    }.`;
    doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY).lineWidth(0.7).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    const footerHeight = doc.heightOfString(footerNote, {
      width: CONTENT_WIDTH,
      align: 'center',
      lineGap: 1.5,
    });
    doc.text(footerNote, MARGIN, footerY + 8, {
      width: CONTENT_WIDTH,
      align: 'center',
      lineGap: 1.5,
    });
    const socialY = footerY + 12 + footerHeight + 6;
    if (socialY + 12 <= doc.page.height - MARGIN) drawSocialRow(doc, socialY, socialLinks());
  }

  doc.end();
  return finished;
}
