import type { jsPDF } from 'jspdf';
import logoFullSrc from '../assets/logo-full.png?inline';

// Logo kop PDF (WARUNA Shipyard - Shipping), dipakai semua PDF approval
// (Berita Acara Pemusnahan, SPK, Form Akses Gudang Berkas).
// Ditanam langsung di bundle (data URI) — dulu tiap cetak PDF logo di-load
// terpisah dari /logo-full.png lewat <img> + canvas, dan kalau request itu
// gagal, PDF diam-diam jadi tanpa logo (onerror → lanjut tanpa logo).
// File asli tetap ada di public/logo-full.png.
const LOGO_FULL_RATIO = 1532 / 326; // lebar : tinggi file logo-full.png

export function addPdfLogo(doc: jsPDF, x: number, y: number, height = 16) {
  try {
    doc.addImage(logoFullSrc, 'PNG', x, y, height * LOGO_FULL_RATIO, height);
  } catch (err) {
    console.error('Gagal menambahkan logo ke PDF:', err);
  }
}
