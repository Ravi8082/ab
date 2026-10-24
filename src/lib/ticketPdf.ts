import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

interface TicketData {
  bookingCode: string;
  name: string;
  event: string;
  ticket: string;
  city?: string;
  persons: number;
  amount: number;
  date: string;
  venue: string;
}

export async function generateTicketPDF(data: TicketData): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(data.bookingCode, {
    width: 200,
    margin: 1,
    color: { dark: '#0F2342', light: '#FBF4E4' },
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;

  // Background
  pdf.setFillColor(10, 23, 48);
  pdf.rect(0, 0, pageW, 297, 'F');

  // Gold border
  pdf.setDrawColor(217, 164, 65);
  pdf.setLineWidth(1.5);
  pdf.rect(10, 10, pageW - 20, 277);

  // Header
  pdf.setTextColor(217, 164, 65);
  pdf.setFontSize(28);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Adhyatmik Bharat', pageW / 2, 35, { align: 'center' });

  pdf.setTextColor(251, 244, 228);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Official Event Ticket', pageW / 2, 44, { align: 'center' });

  // Divider
  pdf.setDrawColor(217, 164, 65);
  pdf.setLineWidth(0.5);
  pdf.line(30, 52, pageW - 30, 52);

  // Booking details
  pdf.setFontSize(12);
  pdf.setTextColor(251, 244, 228);
  const startY = 68;
  const lineH = 10;

  const rows: [string, string][] = [
    ['Booking ID', data.bookingCode],
    ['Name', data.name],
    ['Event', data.event],
    ['Ticket', data.ticket],
    ...(data.city ? [['City', data.city] as [string, string]] : []),
    ['Persons', String(data.persons)],
    ['Amount', `Rs. ${data.amount.toLocaleString('en-IN')}`],
    ['Date', data.date],
    ['Venue', data.venue],
  ];

  rows.forEach(([label, value], i) => {
    const y = startY + i * lineH;
    pdf.setTextColor(217, 164, 65);
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, 30, y);
    pdf.setTextColor(251, 244, 228);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value, 70, y);
  });

  // QR code
  pdf.addImage(qrDataUrl, 'PNG', pageW - 65, 65, 45, 45);

  pdf.setTextColor(232, 137, 29);
  pdf.setFontSize(9);
  pdf.text('Scan at entry', pageW - 42.5, 118, { align: 'center' });

  // Footer
  pdf.setTextColor(251, 244, 228);
  pdf.setFontSize(10);
  pdf.text('Please carry a valid photo ID along with this ticket.', pageW / 2, 270, { align: 'center' });
  pdf.setTextColor(120, 130, 150);
  pdf.setFontSize(8);
  pdf.text('adhyatmikbharatexpo@gmail.com  |  +91 7499658454', pageW / 2, 278, { align: 'center' });

  pdf.save(`ticket-${data.bookingCode}.pdf`);
}
