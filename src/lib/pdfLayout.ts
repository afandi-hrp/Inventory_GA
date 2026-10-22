import type { jsPDF } from 'jspdf';

// Baris "Label : isi" untuk PDF (Surat Jalan SPK). Isi yang panjang / berisi
// baris baru dipecah ke beberapa baris, lalu posisi Y berikutnya digeser sesuai
// jumlah baris — jadi baris di bawahnya tidak tertimpa. Mengembalikan Y baris
// berikutnya.
export function addPdfRow(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  { labelX = 14, valueX = 55, maxWidth = 141, gap = 3.5 } = {}
): number {
  const lines = doc.splitTextToSize(`: ${value}`, maxWidth) as string[];
  const lineHeight = doc.getLineHeight() / doc.internal.scaleFactor;
  doc.text(label, labelX, y);
  doc.text(lines, valueX, y);
  return y + lines.length * lineHeight + gap;
}

// Stamp "APPROVED" + tanggal & jam (WIB) di atas nama penandatangan. Digambar
// langsung di PDF (kotak bergaris biru tua), supaya tetap terbaca kalau dicetak
// hitam-putih. Gak digambar kalau tahapnya belum dilakukan (iso kosong).
export const PDF_STAMP_WIDTH = 31;
export const PDF_STAMP_HEIGHT = 13;

export function addApprovalStamp(doc: jsPDF, x: number, y: number, iso: string | null | undefined, label = 'APPROVED') {
  if (!iso) return;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return;

  const tz = 'Asia/Jakarta';
  const tanggal = d.toLocaleDateString('id-ID', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  const jam = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const cx = x + PDF_STAMP_WIDTH / 2;

  doc.setDrawColor(0, 51, 153);
  doc.setTextColor(0, 51, 153);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, PDF_STAMP_WIDTH, PDF_STAMP_HEIGHT, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(label, cx, y + 5.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`${tanggal} ${jam} WIB`, cx, y + 10.5, { align: 'center' });

  // Kembalikan ke default supaya teks/garis berikutnya tidak ikut biru.
  doc.setDrawColor(0);
  doc.setTextColor(0);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
}
