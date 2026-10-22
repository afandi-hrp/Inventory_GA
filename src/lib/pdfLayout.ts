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
