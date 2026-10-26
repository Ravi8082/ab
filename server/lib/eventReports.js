import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../db.js';

const STATUSES = ['pending', 'paid', 'cancelled', 'refunded'];

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function parseBookingFilters(source = {}) {
  const status = STATUSES.includes(String(source.status || '')) ? String(source.status) : '';
  const checkedIn = ['1', '0'].includes(String(source.checkedIn || '')) ? String(source.checkedIn) : '';
  return {
    stateId: toId(source.stateId),
    cityId: toId(source.cityId),
    venueId: toId(source.venueId),
    eventId: toId(source.eventId),
    ticketTypeId: toId(source.ticketTypeId),
    scheduleId: toId(source.scheduleId),
    status,
    checkedIn,
    q: String(source.q || '').trim().slice(0, 120),
    from: toDate(source.from),
    to: toDate(source.to),
  };
}

function filterParts(filters) {
  const where = [];
  const params = [];
  if (filters.stateId) { where.push('s.state_id = ?'); params.push(filters.stateId); }
  if (filters.cityId) { where.push('s.city_id = ?'); params.push(filters.cityId); }
  if (filters.venueId) { where.push('s.venue_id = ?'); params.push(filters.venueId); }
  if (filters.eventId) { where.push('b.event_id = ?'); params.push(filters.eventId); }
  if (filters.ticketTypeId) { where.push('b.ticket_type_id = ?'); params.push(filters.ticketTypeId); }
  if (filters.scheduleId) { where.push('b.schedule_id = ?'); params.push(filters.scheduleId); }
  if (filters.status) { where.push('b.status = ?'); params.push(filters.status); }
  if (filters.checkedIn === '1') where.push('b.check_in_at IS NOT NULL');
  if (filters.checkedIn === '0') where.push('b.check_in_at IS NULL');
  if (filters.from) { where.push('b.created_at >= ?'); params.push(`${filters.from} 00:00:00`); }
  if (filters.to) { where.push('b.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${filters.to} 00:00:00`); }
  if (filters.q) {
    const like = `%${filters.q}%`;
    where.push('(b.reference LIKE ? OR b.name LIKE ? OR b.email LIKE ? OR b.phone LIKE ?)');
    params.push(like, like, like, like);
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const FROM_SQL = `
  FROM event_bookings b
  JOIN events e ON e.id = b.event_id
  JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
  JOIN event_schedules s ON s.id = b.schedule_id
  JOIN event_states st ON st.id = s.state_id
  JOIN event_cities c ON c.id = s.city_id
  JOIN event_venues v ON v.id = s.venue_id
  LEFT JOIN admins a ON a.id = b.checked_in_by
  LEFT JOIN admins ca ON ca.id = b.cancelled_by
  LEFT JOIN admins ra ON ra.id = b.refunded_by
`;

const SELECT_COLUMNS = `
  b.id, b.reference, b.event_id, b.schedule_id, b.name, b.email, b.phone, b.qty, b.pass_days,
  b.unit_price, b.amount, b.status,
  b.source, b.guest_category, b.coupon_code, b.discount_amount, b.gross_amount, b.admin_note,
  b.otp_verified_at, b.pass_sent_at, b.check_in_at, b.created_at,
  b.cancelled_at, b.cancel_reason, b.refund_amount, b.refund_reference, b.refunded_at,
  (SELECT GROUP_CONCAT(att.name ORDER BY att.position SEPARATOR ' | ')
     FROM event_booking_attendees att WHERE att.booking_id = b.id) AS attendee_names,
  (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', att.position, 'name', att.name,
                                    'phone', att.phone, 'email', att.email))
     FROM event_booking_attendees att WHERE att.booking_id = b.id) AS attendees_json,
  e.name_en AS event_en, e.name_hi AS event_hi, e.kind,
  tt.name_en AS ticket_en, tt.name_hi AS ticket_hi,
  s.event_date, s.end_date,
  st.name_en AS state_en, st.name_hi AS state_hi,
  c.name_en AS city_en, c.name_hi AS city_hi,
  v.name_en AS venue_en, v.name_hi AS venue_hi, v.address_en, v.address_hi,
  a.name AS checked_in_by_name, ca.name AS cancelled_by_name, ra.name AS refunded_by_name
`;

export async function fetchAdminBookings(filters, limit = 500) {
  const { where, params } = filterParts(filters);
  const safeLimit = Math.min(50000, Math.max(1, Number(limit) || 500));
  return query(
    `SELECT ${SELECT_COLUMNS} ${FROM_SQL} ${where} ORDER BY b.id DESC LIMIT ${safeLimit}`,
    params,
  );
}

export async function bookingSummary(filters) {
  const { where, params } = filterParts(filters);
  const [totals] = await query(
    `SELECT COUNT(*) AS bookings,
            COALESCE(SUM(b.qty), 0) AS seats,
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(b.status = 'paid'), 0) AS paid,
            COALESCE(SUM(b.status = 'pending'), 0) AS pending,
            COALESCE(SUM(b.status = 'cancelled'), 0) AS cancelled,
            COALESCE(SUM(b.status = 'refunded'), 0) AS refunded,
            COALESCE(SUM(b.check_in_at IS NOT NULL), 0) AS checked_in
     ${FROM_SQL} ${where}`,
    params,
  );

  const byState = await query(
    `SELECT st.id, st.name_en, st.name_hi,
            COUNT(*) AS bookings,
            COALESCE(SUM(b.qty), 0) AS seats,
            COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(b.check_in_at IS NOT NULL), 0) AS checked_in
     ${FROM_SQL} ${where}
     GROUP BY st.id, st.name_en, st.name_hi ORDER BY revenue DESC, seats DESC`,
    params,
  );

  return {
    totals: {
      bookings: Number(totals.bookings),
      seats: Number(totals.seats),
      revenue: Number(totals.revenue),
      paid: Number(totals.paid),
      pending: Number(totals.pending),
      cancelled: Number(totals.cancelled),
      refunded: Number(totals.refunded),
      checkedIn: Number(totals.checked_in),
    },
    byState: byState.map((row) => ({
      id: row.id,
      name_en: row.name_en,
      name_hi: row.name_hi,
      bookings: Number(row.bookings),
      seats: Number(row.seats),
      revenue: Number(row.revenue),
      checkedIn: Number(row.checked_in),
    })),
  };
}

export async function describeFilters(filters) {
  const parts = [];
  const lookups = [
    ['stateId', 'SELECT name_en FROM event_states WHERE id = ?', 'State'],
    ['cityId', 'SELECT name_en FROM event_cities WHERE id = ?', 'City'],
    ['venueId', 'SELECT name_en FROM event_venues WHERE id = ?', 'Venue'],
    ['eventId', 'SELECT name_en FROM events WHERE id = ?', 'Event'],
    ['ticketTypeId', 'SELECT name_en FROM event_ticket_types WHERE id = ?', 'Ticket'],
  ];
  for (const [key, sql, label] of lookups) {
    if (!filters[key]) continue;
    const [row] = await query(sql, [filters[key]]);
    if (row) parts.push(`${label}: ${row.name_en}`);
  }
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.checkedIn) parts.push(filters.checkedIn === '1' ? 'Checked in: yes' : 'Checked in: no');
  if (filters.from) parts.push(`From: ${filters.from}`);
  if (filters.to) parts.push(`To: ${filters.to}`);
  if (filters.q) parts.push(`Search: ${filters.q}`);
  return parts.length ? parts.join(' · ') : 'All bookings';
}

function summariseRows(rows) {
  const byState = new Map();
  const byCity = new Map();
  const byTicket = new Map();

  for (const row of rows) {
    const paidAmount = row.status === 'paid' ? Number(row.amount) : 0;
    const stateKey = row.state_en;
    const cityKey = `${row.city_en} (${row.state_en})`;
    const ticketKey = `${row.ticket_en} · ${row.event_en}`;

    const state = byState.get(stateKey) || { name: stateKey, bookings: 0, seats: 0, revenue: 0, checkedIn: 0 };
    state.bookings += 1;
    state.seats += Number(row.qty);
    state.revenue += paidAmount;
    if (row.check_in_at) state.checkedIn += 1;
    byState.set(stateKey, state);

    const city = byCity.get(cityKey) || { name: cityKey, bookings: 0, seats: 0, revenue: 0 };
    city.bookings += 1;
    city.seats += Number(row.qty);
    city.revenue += paidAmount;
    byCity.set(cityKey, city);

    const ticket = byTicket.get(ticketKey) || { name: ticketKey, bookings: 0, seats: 0, revenue: 0 };
    ticket.bookings += 1;
    ticket.seats += Number(row.qty);
    ticket.revenue += paidAmount;
    byTicket.set(ticketKey, ticket);
  }

  const sortByRevenue = (a, b) => b.revenue - a.revenue || b.seats - a.seats;
  return {
    byState: [...byState.values()].sort(sortByRevenue),
    byCity: [...byCity.values()].sort(sortByRevenue),
    byTicket: [...byTicket.values()].sort(sortByRevenue),
    totals: {
      bookings: rows.length,
      seats: rows.reduce((sum, row) => sum + Number(row.qty), 0),
      revenue: rows.reduce((sum, row) => sum + (row.status === 'paid' ? Number(row.amount) : 0), 0),
      checkedIn: rows.filter((row) => row.check_in_at).length,
    },
  };
}

const STYLE_HEADER = {
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2342' } },
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
  alignment: { vertical: 'middle' },
};

function styleHeaderRow(row) {
  row.height = 22;
  row.eachCell((cell) => Object.assign(cell, STYLE_HEADER));
}

function addTableSheet(workbook, name, title, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.mergeCells('A1', `${String.fromCharCode(64 + columns.length)}1`);
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2342' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;

  const header = sheet.getRow(3);
  header.values = columns.map((column) => column.header);
  styleHeaderRow(header);
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  rows.forEach((values) => {
    const row = sheet.addRow(values);
    row.height = 18;
    row.eachCell((cell) => {
      cell.font = { size: 9 };
      cell.alignment = { vertical: 'middle' };
      if (typeof cell.value === 'number' && values[cell.col - 1] !== undefined && columns[cell.col - 1]?.money) {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + rows.length, column: columns.length },
  };
  return sheet;
}

export async function exportBookingsXlsx(filters) {
  const rows = await fetchAdminBookings(filters, 50000);
  const summary = summariseRows(rows);
  const filterText = await describeFilters(filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Adhyatmik Bharat';
  workbook.created = new Date();

  const cover = workbook.addWorksheet('Summary');
  cover.getColumn(1).width = 30;
  cover.getColumn(2).width = 26;
  cover.getColumn(3).width = 18;
  cover.getColumn(4).width = 18;
  cover.getColumn(5).width = 16;
  cover.mergeCells('A1:E1');
  cover.getCell('A1').value = 'Adhyatmik Bharat — Event booking report';
  cover.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF0F2342' } };
  cover.getRow(1).height = 30;
  cover.mergeCells('A2:E2');
  cover.getCell('A2').value = `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · ${filterText}`;
  cover.getCell('A2').font = { size: 10, color: { argb: 'FF5F6B80' } };
  cover.getRow(2).height = 22;

  const totals = [
    ['Total bookings', summary.totals.bookings],
    ['Total seats', summary.totals.seats],
    ['Paid revenue (INR)', summary.totals.revenue],
    ['Checked in', summary.totals.checkedIn],
  ];
  totals.forEach(([label, value], index) => {
    const row = cover.getRow(4 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: 'FF5F6B80' } };
    row.getCell(2).value = value;
    row.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF0F2342' } };
    if (label.includes('revenue')) row.getCell(2).numFmt = '₹#,##0';
  });

  cover.getCell('A10').value = 'Visitors and revenue by state';
  cover.getCell('A10').font = { bold: true, size: 12, color: { argb: 'FF0F2342' } };
  const stateHeader = cover.getRow(12);
  stateHeader.values = ['State', 'Bookings', 'Seats', 'Revenue (INR)', 'Checked in'];
  styleHeaderRow(stateHeader);
  summary.byState.forEach((row, index) => {
    const excelRow = cover.getRow(13 + index);
    excelRow.values = [row.name, row.bookings, row.seats, row.revenue, row.checkedIn];
    excelRow.getCell(4).numFmt = '₹#,##0';
    excelRow.eachCell((cell) => { cell.font = { size: 9 }; });
  });
  const stateTotalRow = cover.getRow(13 + summary.byState.length);
  stateTotalRow.values = ['Total', summary.totals.bookings, summary.totals.seats, summary.totals.revenue, summary.totals.checkedIn];
  stateTotalRow.font = { bold: true, size: 9 };
  stateTotalRow.getCell(4).numFmt = '₹#,##0';

  addTableSheet(workbook, 'By city', 'Visitors and revenue by city', [
    { header: 'City (State)', width: 34 }, { header: 'Bookings', width: 14 },
    { header: 'Seats', width: 14 }, { header: 'Revenue (INR)', width: 20, money: true },
  ], summary.byCity.map((row) => [row.name, row.bookings, row.seats, row.revenue]));

  addTableSheet(workbook, 'By ticket', 'Visitors and revenue by ticket', [
    { header: 'Ticket (Event)', width: 44 }, { header: 'Bookings', width: 14 },
    { header: 'Seats', width: 14 }, { header: 'Revenue (INR)', width: 20, money: true },
  ], summary.byTicket.map((row) => [row.name, row.bookings, row.seats, row.revenue]));

  addTableSheet(
    workbook,
    'Bookings',
    `Bookings · ${rows.length} rows`,
    [
      { header: 'Reference', width: 15 },
      { header: 'Status', width: 12 },
      { header: 'Event', width: 24 },
      { header: 'Ticket', width: 26 },
      { header: 'Name', width: 22 },
      { header: 'Email', width: 28 },
      { header: 'Phone', width: 14 },
      { header: 'Qty', width: 7 },
      { header: 'Unit price', width: 13, money: true },
      { header: 'Amount', width: 14, money: true },
      { header: 'Guest', width: 12 },
      { header: 'Source', width: 13 },
      { header: 'Coupon', width: 13 },
      { header: 'Discount', width: 11, money: true },
      { header: 'Attendees', width: 46 },
      { header: 'State', width: 16 },
      { header: 'City', width: 16 },
      { header: 'Venue', width: 28 },
      { header: 'Address', width: 42 },
      { header: 'Event date', width: 13 },
      { header: 'Booked at', width: 20 },
      { header: 'OTP verified', width: 12 },
      { header: 'Checked in at', width: 20 },
      { header: 'Checked in by', width: 18 },
      { header: 'Cancelled at', width: 20 },
      { header: 'Cancelled by', width: 18 },
      { header: 'Cancel reason', width: 32 },
      { header: 'Refund', width: 14, money: true },
      { header: 'Refund ref', width: 22 },
      { header: 'Refunded at', width: 20 },
    ],
    rows.map((row) => [
      row.reference, row.status, row.event_en, row.ticket_en, row.name, row.email, row.phone,
      Number(row.qty), Number(row.unit_price), Number(row.amount),
      row.guest_category || 'visitor', row.source || 'online', row.coupon_code || '',
      Number(row.discount_amount || 0), row.attendee_names || row.name,
      row.state_en, row.city_en,
      row.venue_en, row.address_en, row.event_date, row.created_at, row.otp_verified_at ? 'Yes' : 'No',
      row.check_in_at || '', row.checked_in_by_name || '',
      row.cancelled_at || '', row.cancelled_by_name || '', row.cancel_reason || '',
      row.refund_amount == null ? '' : Number(row.refund_amount),
      row.refund_reference || '', row.refunded_at || '',
    ]),
  );

  return workbook.xlsx.writeBuffer();
}

export async function exportBookingsPdf(filters) {
  const rows = await fetchAdminBookings(filters, 50000);
  const summary = summariseRows(rows);
  const filterText = await describeFilters(filters);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 32,
      bufferPages: true,
      info: { Title: 'Adhyatmik Bharat booking report', Author: 'Adhyatmik Bharat' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ink = '#0F2342';
    const muted = '#5F6B80';
    const lotus = '#EE2C8F';
    const pageWidth = doc.page.width - 64;

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(19).text('Adhyatmik Bharat — Event booking report');
    doc.moveDown(0.35);
    doc.fillColor(muted).font('Helvetica').fontSize(9)
      .text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}  ·  ${filterText}`, { width: pageWidth });
    doc.moveDown(0.8);

    const cards = [
      ['Bookings', String(summary.totals.bookings)],
      ['Seats', String(summary.totals.seats)],
      ['Revenue', `Rs ${summary.totals.revenue.toLocaleString('en-IN')}`],
      ['Checked in', String(summary.totals.checkedIn)],
    ];
    const cardWidth = (pageWidth - 30) / 4;
    const cardY = doc.y;
    cards.forEach(([label, value], index) => {
      const x = 32 + index * (cardWidth + 10);
      doc.roundedRect(x, cardY, cardWidth, 52, 8).fillAndStroke('#FAF6E5', '#E5E1D3');
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 12, cardY + 10);
      doc.fillColor(lotus).font('Helvetica-Bold').fontSize(16).text(value, x + 12, cardY + 24);
    });
    doc.y = cardY + 70;

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('Visitors by state');
    doc.moveDown(0.4);
    const stateX = 32;
    let y = doc.y;
    const stateCols = [190, 80, 80, 110, 80];
    doc.font('Helvetica-Bold').fontSize(8).fillColor(muted);
    ['STATE', 'BOOKINGS', 'SEATS', 'REVENUE (INR)', 'CHECKED IN'].forEach((label, i) => {
      doc.text(label, stateX + stateCols.slice(0, i).reduce((a, b) => a + b, 0), y, { width: stateCols[i] });
    });
    y += 14;
    doc.moveTo(stateX, y).lineTo(stateX + stateCols.reduce((a, b) => a + b, 0), y).strokeColor('#E5E1D3').stroke();
    y += 6;
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    summary.byState.forEach((row) => {
      const cells = [row.name, String(row.bookings), String(row.seats), row.revenue.toLocaleString('en-IN'), String(row.checkedIn)];
      cells.forEach((cell, i) => {
        doc.text(cell, stateX + stateCols.slice(0, i).reduce((a, b) => a + b, 0), y, { width: stateCols[i] });
      });
      y += 16;
    });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(9);
    doc.text('Bookings detail', 32, y + 12);
    doc.y = y + 30;

    const columns = [
      { label: 'REFERENCE', width: 68 },
      { label: 'NAME', width: 82 },
      { label: 'CONTACT', width: 100 },
      { label: 'EVENT / TICKET', width: 120 },
      { label: 'STATE / CITY', width: 92 },
      { label: 'VENUE', width: 100 },
      { label: 'QTY', width: 26 },
      { label: 'AMOUNT', width: 54 },
      { label: 'STATUS', width: 60 },
      { label: 'CHECK-IN', width: 60 },
    ];
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const drawHeader = () => {
      const headerY = doc.y;
      doc.rect(32, headerY, tableWidth, 18).fill('#0F2342');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7);
      let x = 36;
      columns.forEach((column) => {
        doc.text(column.label, x, headerY + 5, { width: column.width - 6, lineBreak: false });
        x += column.width;
      });
      doc.y = headerY + 22;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(7.5).fillColor(ink);
    rows.forEach((row) => {
      if (doc.y > 540) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(7.5).fillColor(ink);
      }
      const values = [
        row.reference,
        row.name,
        `${row.email} · ${row.phone}`,
        `${row.event_en} / ${row.ticket_en}`,
        `${row.state_en} / ${row.city_en}`,
        `${row.venue_en}`,
        String(row.qty),
        `Rs ${Number(row.amount).toLocaleString('en-IN')}`,
        [
          row.status,
          row.guest_category && row.guest_category !== 'visitor' ? row.guest_category : '',
          row.source === 'admin_free' ? 'free issue' : '',
          row.refund_amount != null ? `refund Rs ${Number(row.refund_amount).toLocaleString('en-IN')}` : '',
        ].filter(Boolean).join(' · '),
        row.check_in_at ? 'Checked in' : '—',
      ];
      const rowY = doc.y;
      let x = 36;
      const heights = values.map((value, index) => {
        doc.text(String(value), x, rowY, { width: columns[index].width - 6 });
        x += columns[index].width;
        return doc.heightOfString(String(value), { width: columns[index].width - 6 });
      });
      const rowHeight = Math.max(14, ...heights) + 4;
      doc.moveTo(32, rowY + rowHeight - 3).lineTo(32 + tableWidth, rowY + rowHeight - 3)
        .strokeColor('#EFECE2').lineWidth(0.6).stroke();
      doc.y = rowY + rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(
        `Adhyatmik Bharat · Booking report · Page ${i + 1} of ${range.count}`,
        32,
        doc.page.height - 24,
        { width: pageWidth, align: 'right' },
      );
    }

    doc.end();
  });
}
