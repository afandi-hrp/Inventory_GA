import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../UI/Toast';
import {
  Profile,
  GudangBerkasRequest,
  GudangBerkasRequestMember,
  GudangBerkasRequestItem,
  GudangBerkasLogbook,
  GudangBerkasLogbookItemCheck,
} from '../../types';
import {
  X, Loader2, Warehouse, Search, User, Calendar, Eye, Download, Plus, Trash2,
  ClipboardCheck, CheckSquare, XSquare, ArrowLeft, Printer, Save, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface GudangBerkasPageProps {
  profile: Profile | null;
}

type ViewMode = 'list' | 'create' | 'detail';

interface MemberRow {
  nama_lengkap: string;
  id_karyawan: string;
  jabatan: string;
}

interface ItemRow {
  jenis_dokumen: string;
  tahun: string;
  nomor_dokumen: string;
  keterangan: string;
}

const emptyMember: MemberRow = { nama_lengkap: '', id_karyawan: '', jabatan: '' };
const emptyItem: ItemRow = { jenis_dokumen: '', tahun: '', nomor_dokumen: '', keterangan: '' };

const TUJUAN_OPTIONS = ['Pemeriksaan / Pencarian Berkas Fisik', 'Pengambilan Berkas', 'Lainnya'];

function formatTanggalDDMMMYYYY(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmmm = d.toLocaleDateString('id-ID', { month: 'long' });
  return `${dd}-${mmmm}-${d.getFullYear()}`;
}

const STATUS_KUNJUNGAN_STYLE: Record<string, string> = {
  Masuk: 'bg-green-100 text-green-700 border-green-300',
  Keluar: 'bg-red-100 text-red-700 border-red-300',
  Periksa: 'bg-blue-100 text-blue-700 border-blue-300',
};

export function GudangBerkasPage({ profile }: GudangBerkasPageProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState<ViewMode>('list');
  const [requests, setRequests] = useState<GudangBerkasRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    tanggal_kunjungan: new Date().toISOString().slice(0, 10),
    waktu_mulai: '',
    waktu_selesai: '',
    divisi_pemohon: '',
    nama_pemohon: '',
    jabatan_pemohon: '',
    lokasi_gudang: 'Gudang Mergat' as 'Gudang Mergat' | 'Gudang Hasanuddin',
    tujuan_kunjungan: TUJUAN_OPTIONS[0],
    tujuan_lainnya: '',
    pendamping_nama: '',
    pendamping_divisi: '',
  });
  const [members, setMembers] = useState<MemberRow[]>([{ ...emptyMember }]);
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);

  // Detail view state
  const [selectedRequest, setSelectedRequest] = useState<GudangBerkasRequest | null>(null);
  const [detailMembers, setDetailMembers] = useState<GudangBerkasRequestMember[]>([]);
  const [detailItems, setDetailItems] = useState<GudangBerkasRequestItem[]>([]);
  const [logbook, setLogbook] = useState<GudangBerkasLogbook | null>(null);
  const [logbookChecks, setLogbookChecks] = useState<GudangBerkasLogbookItemCheck[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [logbookStatus, setLogbookStatus] = useState<'Masuk' | 'Keluar' | 'Periksa'>('Periksa');
  const [logbookKeterangan, setLogbookKeterangan] = useState('');
  const [signNames, setSignNames] = useState({ diketahui_oleh_nama: '', disetujui_oleh_nama: '' });
  const [savingSignNames, setSavingSignNames] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');

  const isAdmin = profile?.role === 'admin';
  // Role khusus: hanya boleh membuat form & melihat/cetak PDF miliknya sendiri.
  // Tidak boleh mengedit apa pun, dan sama sekali tidak boleh melihat bagian
  // verifikasi/logbook — dijaga juga di level RLS (lihat supabase_gudang_berkas_setup.sql),
  // ini cuma lapisan UI-nya.
  const isStaffGudangBerkas = profile?.role === 'gudang_berkas';
  const canCreate = isAdmin || isStaffGudangBerkas;

  useEffect(() => {
    fetchRequests();
  }, []);

  function resetCreateForm() {
    setForm({
      tanggal_kunjungan: new Date().toISOString().slice(0, 10),
      waktu_mulai: '',
      waktu_selesai: '',
      divisi_pemohon: '',
      nama_pemohon: '',
      jabatan_pemohon: '',
      lokasi_gudang: 'Gudang Mergat',
      tujuan_kunjungan: TUJUAN_OPTIONS[0],
      tujuan_lainnya: '',
      pendamping_nama: '',
      pendamping_divisi: '',
    });
    setMembers([{ ...emptyMember }]);
    setItems([{ ...emptyItem }]);
  }

  async function fetchRequests() {
    setLoading(true);
    try {
      let query = supabase
        .from('gudang_berkas_requests')
        .select('*')
        .order('created_at', { ascending: false });

      // Defense-in-depth di sisi app — pembatasan sesungguhnya sudah dijaga oleh
      // RLS di database, filter ini cuma supaya query lebih ringkas/relevan.
      if (isStaffGudangBerkas && profile?.id) {
        query = query.eq('created_by', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      showToast('Gagal memuat data Form Akses Gudang Berkas', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchDetail(req: GudangBerkasRequest) {
    setLoadingDetail(true);
    setSelectedRequest(req);
    setView('detail');
    try {
      const [{ data: membersData, error: membersErr }, { data: itemsData, error: itemsErr }] = await Promise.all([
        supabase.from('gudang_berkas_request_members').select('*').eq('request_id', req.id).order('no_urut'),
        supabase.from('gudang_berkas_request_items').select('*').eq('request_id', req.id).order('no_urut'),
      ]);
      if (membersErr) throw membersErr;
      if (itemsErr) throw itemsErr;
      setDetailMembers(membersData || []);
      setDetailItems(itemsData || []);
      setSignNames({
        diketahui_oleh_nama: req.diketahui_oleh_nama || '',
        disetujui_oleh_nama: req.disetujui_oleh_nama || '',
      });

      const { data: logbookData, error: logbookErr } = await supabase
        .from('gudang_berkas_logbook')
        .select('*')
        .eq('request_id', req.id)
        .maybeSingle();
      if (logbookErr) throw logbookErr;
      setLogbook(logbookData || null);
      setLogbookStatus((logbookData?.status_kunjungan as any) || 'Periksa');
      setLogbookKeterangan(logbookData?.keterangan || '');

      if (logbookData) {
        const { data: checksData, error: checksErr } = await supabase
          .from('gudang_berkas_logbook_item_checks')
          .select('*')
          .eq('logbook_id', logbookData.id);
        if (checksErr) throw checksErr;
        setLogbookChecks(checksData || []);
      } else {
        setLogbookChecks([]);
      }
    } catch (err) {
      showToast('Gagal memuat detail kunjungan', 'error');
    } finally {
      setLoadingDetail(false);
    }
  }

  // Cetak PDF langsung dari baris tabel di daftar — dipakai role gudang_berkas
  // yang gak boleh masuk ke halaman detail/verifikasi sama sekali. Cuma ambil
  // header + anggota tim + rincian berkas (data yang memang perlu dicetak),
  // TIDAK menyentuh tabel logbook/verifikasi.
  async function quickPreviewPDF(req: GudangBerkasRequest) {
    setIsSubmitting(true);
    try {
      const [{ data: membersData, error: membersErr }, { data: itemsData, error: itemsErr }] = await Promise.all([
        supabase.from('gudang_berkas_request_members').select('*').eq('request_id', req.id).order('no_urut'),
        supabase.from('gudang_berkas_request_items').select('*').eq('request_id', req.id).order('no_urut'),
      ]);
      if (membersErr) throw membersErr;
      if (itemsErr) throw itemsErr;

      await generatePDFPreview(req, membersData || [], itemsData || []);
    } catch (err) {
      showToast('Gagal memuat data untuk PDF', 'error');
      setIsSubmitting(false);
    }
  }

  function addMemberRow() {
    setMembers(prev => [...prev, { ...emptyMember }]);
  }
  function removeMemberRow(idx: number) {
    setMembers(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  }
  function updateMemberRow(idx: number, field: keyof MemberRow, value: string) {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }

  function addItemRow() {
    setItems(prev => [...prev, { ...emptyItem }]);
  }
  function removeItemRow(idx: number) {
    setItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  }
  function updateItemRow(idx: number, field: keyof ItemRow, value: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;

    const validMembers = members.filter(m => m.nama_lengkap.trim());
    const validItems = items.filter(it => it.jenis_dokumen.trim());

    if (!form.nama_pemohon.trim()) {
      showToast('Nama Pemohon wajib diisi', 'error');
      return;
    }
    if (form.waktu_mulai && form.waktu_selesai && form.waktu_selesai < form.waktu_mulai) {
      showToast('Waktu Selesai tidak boleh lebih kecil dari Waktu Mulai', 'error');
      return;
    }
    if (validItems.length === 0) {
      showToast('Minimal 1 baris Rincian Berkas / Dokumen wajib diisi', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: reqData, error: reqError } = await supabase
        .from('gudang_berkas_requests')
        .insert({
          tanggal_kunjungan: form.tanggal_kunjungan,
          waktu_mulai: form.waktu_mulai || null,
          waktu_selesai: form.waktu_selesai || null,
          divisi_pemohon: form.divisi_pemohon || null,
          nama_pemohon: form.nama_pemohon.trim(),
          jabatan_pemohon: form.jabatan_pemohon || null,
          lokasi_gudang: form.lokasi_gudang,
          tujuan_kunjungan: form.tujuan_kunjungan,
          tujuan_lainnya: form.tujuan_kunjungan === 'Lainnya' ? (form.tujuan_lainnya || null) : null,
          jumlah_personil: Math.max(validMembers.length, 1),
          pendamping_nama: form.pendamping_nama || null,
          pendamping_divisi: form.pendamping_divisi || null,
          created_by: profile?.id || null,
          created_by_name: profile?.full_name || null,
        })
        .select()
        .single();

      if (reqError) throw reqError;

      if (validMembers.length > 0) {
        const { error: membersError } = await supabase.from('gudang_berkas_request_members').insert(
          validMembers.map((m, idx) => ({
            request_id: reqData.id,
            no_urut: idx + 1,
            nama_lengkap: m.nama_lengkap.trim(),
            id_karyawan: m.id_karyawan || null,
            jabatan: m.jabatan || null,
          }))
        );
        if (membersError) throw membersError;
      }

      const { data: insertedItems, error: itemsError } = await supabase
        .from('gudang_berkas_request_items')
        .insert(
          validItems.map((it, idx) => ({
            request_id: reqData.id,
            no_urut: idx + 1,
            jenis_dokumen: it.jenis_dokumen.trim(),
            tahun: it.tahun || null,
            nomor_dokumen: it.nomor_dokumen || null,
            keterangan: it.keterangan || null,
          }))
        )
        .select();
      if (itemsError) throw itemsError;

      // Siapkan 1 baris logbook (ringkasan) + checklist verifikasi per item, isi diverifikasi belakangan oleh admin
      const { data: logbookRow, error: logbookError } = await supabase
        .from('gudang_berkas_logbook')
        .insert({
          request_id: reqData.id,
          total_items: (insertedItems || []).length,
          verified_items: 0,
        })
        .select()
        .single();
      if (logbookError) throw logbookError;

      if (insertedItems && insertedItems.length > 0) {
        const { error: checksError } = await supabase.from('gudang_berkas_logbook_item_checks').insert(
          insertedItems.map((it: any) => ({
            logbook_id: logbookRow.id,
            request_item_id: it.id,
          }))
        );
        if (checksError) throw checksError;
      }

      showToast(`Form Akses Gudang Berkas berhasil dibuat: ${reqData.no_kunjungan}`, 'success');
      resetCreateForm();
      await fetchRequests();
      setView('list');
    } catch (err: any) {
      console.error('Error creating gudang berkas request:', err);
      showToast(err.message || 'Gagal menyimpan Form Akses Gudang Berkas', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function setItemVerificationStatus(check: GudangBerkasLogbookItemCheck, status: 'PENDING' | 'VERIFIED' | 'TIDAK_SESUAI') {
    if (!isAdmin || !logbook) return;
    try {
      const { error } = await supabase
        .from('gudang_berkas_logbook_item_checks')
        .update({
          verification_status: status,
          is_verified: status === 'VERIFIED',
          verified_at: status !== 'PENDING' ? new Date().toISOString() : null,
        })
        .eq('id', check.id);
      if (error) throw error;

      const updatedChecks = logbookChecks.map(c => c.id === check.id ? {
        ...c,
        verification_status: status,
        is_verified: status === 'VERIFIED',
        verified_at: status !== 'PENDING' ? new Date().toISOString() : null,
      } : c);
      setLogbookChecks(updatedChecks);

      const decidedCount = updatedChecks.filter(c => c.verification_status !== 'PENDING').length;
      await supabase.from('gudang_berkas_logbook').update({ verified_items: decidedCount }).eq('id', logbook.id);
      setLogbook({ ...logbook, verified_items: decidedCount });
    } catch (err) {
      showToast('Gagal mengubah status verifikasi item', 'error');
    }
  }

  async function updateItemNote(check: GudangBerkasLogbookItemCheck, note: string) {
    setLogbookChecks(prev => prev.map(c => c.id === check.id ? { ...c, verified_note: note } : c));
  }

  async function saveItemNote(check: GudangBerkasLogbookItemCheck) {
    if (!isAdmin) return;
    try {
      const current = logbookChecks.find(c => c.id === check.id);
      const { error } = await supabase
        .from('gudang_berkas_logbook_item_checks')
        .update({ verified_note: current?.verified_note || null })
        .eq('id', check.id);
      if (error) throw error;
      showToast('Keterangan item tersimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan keterangan item', 'error');
    }
  }

  async function saveSignNames() {
    if (!isAdmin || !selectedRequest) return;
    setSavingSignNames(true);
    try {
      const { error } = await supabase
        .from('gudang_berkas_requests')
        .update({
          diketahui_oleh_nama: signNames.diketahui_oleh_nama || null,
          disetujui_oleh_nama: signNames.disetujui_oleh_nama || null,
        })
        .eq('id', selectedRequest.id);
      if (error) throw error;
      setSelectedRequest({ ...selectedRequest, diketahui_oleh_nama: signNames.diketahui_oleh_nama || null, disetujui_oleh_nama: signNames.disetujui_oleh_nama || null });
      showToast('Nama tanda tangan tersimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan nama tanda tangan', 'error');
    } finally {
      setSavingSignNames(false);
    }
  }

  async function saveLogbook(markComplete: boolean) {
    if (!isAdmin || !logbook || !selectedRequest) return;
    const decidedCount = logbookChecks.filter(c => c.verification_status !== 'PENDING').length;

    if (markComplete && decidedCount < logbook.total_items) {
      showToast(`Belum semua item diverifikasi (${decidedCount}/${logbook.total_items})`, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('gudang_berkas_logbook')
        .update({
          tanggal_verifikasi: new Date().toISOString().slice(0, 10),
          status_kunjungan: logbookStatus,
          ga_verificator_id: profile?.id || null,
          ga_verificator_name: profile?.full_name || null,
          keterangan: logbookKeterangan || null,
          is_completed: markComplete,
          completed_at: markComplete ? new Date().toISOString() : null,
        })
        .eq('id', logbook.id);
      if (error) throw error;

      if (markComplete) {
        await supabase.from('gudang_berkas_requests').update({ status: 'SELESAI' }).eq('id', selectedRequest.id);
      }

      showToast(markComplete ? 'Logbook diselesaikan & tersimpan' : 'Logbook tersimpan', 'success');
      await fetchRequests();
      await fetchDetail({ ...selectedRequest, status: markComplete ? 'SELESAI' : selectedRequest.status });
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan logbook', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const addLogo = async (doc: jsPDF, x: number, y: number) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, img.width, img.height);
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const dataUrl = canvas.toDataURL('image/png', 1.0);
          const pdfHeight = 16;
          const pdfWidth = (img.width / img.height) * pdfHeight;
          doc.addImage(dataUrl, 'PNG', x, y, pdfWidth, pdfHeight);
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = '/logo-full.png';
    });
  };

  const BRAND_PURPLE: [number, number, number] = [90, 48, 90];

  async function generatePDFPreview(
    reqOverride?: GudangBerkasRequest,
    membersOverride?: GudangBerkasRequestMember[],
    itemsOverride?: GudangBerkasRequestItem[]
  ) {
    // Terima override eksplisit (dipakai saat cetak langsung dari baris tabel,
    // tanpa melalui halaman detail) supaya gak baca state `selectedRequest`
    // dkk yang mungkin belum ke-update (React batching) kalau dipanggil
    // langsung setelah setState.
    const selectedRequest = reqOverride;
    const detailMembers = membersOverride || [];
    const detailItems = itemsOverride || [];
    if (!selectedRequest) return;
    setIsSubmitting(true);
    try {
      const doc = new jsPDF();
      await addLogo(doc, 14, 14);

      let y = 42;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('FORMULIR IZIN KUNJUNGAN & AKSES GUDANG BERKAS', 105, y, { align: 'center' });
      y += 6;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`No Kunjungan: ${selectedRequest.no_kunjungan}`, 105, y, { align: 'center' });
      y += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('I. INFORMASI KUNJUNGAN & PEMOHON', 14, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      // 2 kolom sejajar baris demi baris: kiri (Tanggal/Waktu/Lokasi/Tujuan/Pendamping),
      // kanan (Divisi/Nama/Jabatan/Jumlah Personil).
      const tujuanValue = selectedRequest.tujuan_kunjungan === 'Lainnya'
        ? `Lainnya: ${selectedRequest.tujuan_lainnya || '-'}`
        : (selectedRequest.tujuan_kunjungan || '-');
      const leftRows: [string, string][] = [
        ['Tanggal Kunjungan', new Date(selectedRequest.tanggal_kunjungan).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })],
        ['Waktu Kunjungan', `${selectedRequest.waktu_mulai || '-'} s.d ${selectedRequest.waktu_selesai || '-'} WIB`],
        ['Lokasi Gudang', selectedRequest.lokasi_gudang || '-'],
        ['Tujuan Kunjungan', tujuanValue],
        ['Pendamping / Divisi', `${selectedRequest.pendamping_nama || '-'} / ${selectedRequest.pendamping_divisi || '-'}`],
      ];
      const rightRows: [string, string][] = [
        ['Divisi Pemohon', selectedRequest.divisi_pemohon || '-'],
        ['Nama Pemohon / Kontak', selectedRequest.nama_pemohon],
        ['Jabatan', selectedRequest.jabatan_pemohon || '-'],
        ['Jumlah Personil', String(selectedRequest.jumlah_personil)],
      ];

      const colLeftX = 14;
      const colLeftValX = 52;
      const colRightX = 116;
      const colRightValX = 154;
      const rowCount = Math.max(leftRows.length, rightRows.length);
      for (let i = 0; i < rowCount; i++) {
        const left = leftRows[i];
        const right = rightRows[i];
        const leftLines = left ? doc.splitTextToSize(`: ${left[1]}`, 60) : [];
        const lineHeight = Math.max(leftLines.length, 1) * 5;
        if (left) {
          doc.text(left[0], colLeftX, y);
          doc.text(leftLines, colLeftValX, y);
        }
        if (right) {
          doc.text(right[0], colRightX, y);
          doc.text(`: ${right[1]}`, colRightValX, y, { maxWidth: 40 });
        }
        y += Math.max(lineHeight, 6.5);
      }
      y += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('II. DAFTAR ANGGOTA TIM / PENGUNJUNG', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['No.', 'Nama Lengkap', 'ID Karyawan', 'Jabatan / Posisi']],
        body: detailMembers.length > 0
          ? detailMembers.map((m, i) => [String(i + 1), m.nama_lengkap, m.id_karyawan || '-', m.jabatan || '-'])
          : [['-', '-', '-', '-']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('III. RINCIAN BERKAS / DOKUMEN YANG DICARI / DIAMBIL', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['No.', 'Jenis Dokumen', 'Tahun', 'Nomor Dokumen / Kardus', 'Keterangan']],
        body: detailItems.map((it, i) => [String(i + 1), it.jenis_dokumen, it.tahun || '-', it.nomor_dokumen || '-', it.keterangan || '-']),
        styles: { fontSize: 9 },
        headStyles: { fillColor: BRAND_PURPLE, textColor: [255, 255, 255] },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      if (y > 230) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('IV. TATA TERTIB & KETENTUAN AKSES GUDANG BERKAS', 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const tataTertib = [
        '1. Pengunjung wajib didampingi Petugas Gudang selama berada di area penyimpanan berkas.',
        '2. Dokumen fisik yang dipinjam/keluar gudang wajib mencatatkan bukti pinjam resmi dan diketahui Petugas Gudang.',
        '3. Dilarang merusak, mengacak susunan box, atau merusak segel arsip yang ada.',
        '4. Pemohon dan Petugas bersedia menjaga keamanan, kerahasiaan, dan kondisi dokumen serta mematuhi ketentuan akses Gudang Dokumen yang berlaku.',
        '5. Dokumen tidak diperkenankan dibawa keluar tanpa pencatatan oleh Petugas Gudang.',
        '6. Jika pemohon akan mengambil berkas, pemohon wajib mendokumentasikan dokumen dan mengirimkan dokumentasi ke Petugas Gudang.',
      ];
      for (const line of tataTertib) {
        const wrapped = doc.splitTextToSize(line, 180);
        doc.text(wrapped, 14, y);
        y += wrapped.length * 4;
      }

      y += 12;
      if (y > 245) {
        doc.addPage();
        y = 20;
      }
      const currentDate = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Medan, ${currentDate}`, 150, y);
      y += 18;

      // Titik tengah tiap kolom tanda tangan (dipakai juga untuk center-align label,
      // nama, dan tanggal di bawahnya supaya semuanya sejajar center per kolom).
      const signColX = [14, 82, 155];
      const signColWidth = [66, 68, 45];
      const signColCenter = signColX.map((x, i) => x + signColWidth[i] / 2);

      doc.text('Diajukan Oleh (Petugas/GA),', signColCenter[0], y, { align: 'center' });
      doc.text('Diketahui Oleh (Pemohon/Depart),', signColCenter[1], y, { align: 'center' });
      doc.text('Disetujui (Direktur),', signColCenter[2], y, { align: 'center' });
      y += 22;
      // Nama, lalu tanggal otomatis di baris bawahnya, semua center per kolom
      doc.text(`(${selectedRequest.nama_pemohon})`, signColCenter[0], y, { align: 'center', maxWidth: signColWidth[0] });
      doc.text(selectedRequest.diketahui_oleh_nama ? `(${selectedRequest.diketahui_oleh_nama})` : '(..................................)', signColCenter[1], y, { align: 'center', maxWidth: signColWidth[1] });
      doc.text(selectedRequest.disetujui_oleh_nama ? `(${selectedRequest.disetujui_oleh_nama})` : '(..................................)', signColCenter[2], y, { align: 'center', maxWidth: signColWidth[2] });
      y += 5;
      doc.setFontSize(8);
      doc.text(currentDate, signColCenter[0], y, { align: 'center' });
      if (selectedRequest.diketahui_oleh_nama) doc.text(currentDate, signColCenter[1], y, { align: 'center' });
      if (selectedRequest.disetujui_oleh_nama) doc.text(currentDate, signColCenter[2], y, { align: 'center' });

      const fileName = `Form_Akses_Gudang_Berkas_${selectedRequest.no_kunjungan}.pdf`;
      setPdfPreviewFileName(fileName);
      setPdfPreviewUrl(doc.output('bloburl') as unknown as string);
    } catch (e) {
      showToast('Terjadi kesalahan saat membuat PDF', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  function closePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
  }

  const filteredRequests = requests.filter(req =>
    req.no_kunjungan.toLowerCase().includes(search.toLowerCase()) ||
    req.nama_pemohon.toLowerCase().includes(search.toLowerCase()) ||
    (req.divisi_pemohon || '').toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block">Form Akses Gudang Berkas</h2>
        <p className="text-brand-purple">Input permohonan kunjungan gudang berkas &amp; verifikasi logbook dokumen yang dicari/diambil</p>
      </div>

      {view === 'list' && (
        <>
          {/* Panel Filter */}
          <div className="bg-white/60 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-white/50 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-purple" size={16} />
              <input
                type="text"
                placeholder="Cari no. kunjungan, pemohon, atau divisi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm bg-white shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              {canCreate && (
                <button
                  onClick={() => { resetCreateForm(); setView('create'); }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-brand-purple-light transition-colors shrink-0"
                >
                  <Plus size={16} /> Buat Form Baru
                </button>
              )}
              <button
                onClick={() => navigate('/approval')}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-purple hover:bg-brand-purple-light text-white rounded-lg text-sm font-semibold shadow-sm transition-colors shrink-0"
              >
                <ArrowLeft size={16} /> Kembali ke Approval
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/80 sticky top-0 backdrop-blur-sm z-10">
                    <tr className="text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                      <th className="px-6 py-4">No. Kunjungan</th>
                      <th className="px-6 py-4">Pemohon</th>
                      <th className="px-6 py-4">Tanggal</th>
                      <th className="px-6 py-4">Lokasi Gudang</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <Loader2 className="animate-spin mx-auto text-orange-600 mb-2" size={32} />
                          <p className="text-brand-purple">Memuat data...</p>
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <Warehouse className="mx-auto text-brand-purple mb-2" size={48} />
                          <p className="text-brand-purple">Belum ada Form Akses Gudang Berkas.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-orange-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-brand-purple">{req.no_kunjungan}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-brand-purple">
                              <User size={14} className="mr-1.5 text-brand-purple" />
                              {req.nama_pemohon}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-brand-purple">
                              <Calendar size={14} className="mr-1.5 text-brand-purple" />
                              {new Date(req.tanggal_kunjungan).toLocaleDateString('id-ID')}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-brand-purple">{req.lokasi_gudang || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
                              req.status === 'SELESAI' ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"
                            )}>
                              {req.status === 'SELESAI' ? 'Selesai Diverifikasi' : 'Diajukan'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isStaffGudangBerkas ? (
                              <button
                                onClick={() => quickPreviewPDF(req)}
                                disabled={isSubmitting}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg text-sm font-medium transition-colors border border-orange-100 disabled:opacity-50"
                              >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                <span>Lihat PDF</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => fetchDetail(req)}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg text-sm font-medium transition-colors border border-orange-100"
                              >
                                <Eye size={16} />
                                <span>Detail</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && filteredRequests.length > 0 && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-brand-purple">
                      Menampilkan <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredRequests.length)}</span> dari <span className="font-medium">{filteredRequests.length}</span> kunjungan
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-brand-purple">Per halaman:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-brand-purple outline-none"
                      >
                        {[10, 20, 50, 100].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={cn(
                              "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                              currentPage === pageNum ? "bg-brand-purple text-white" : "text-brand-purple hover:bg-gray-100"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
        </>
      )}

      {view === 'create' && canCreate && (
        <form onSubmit={handleSubmitForm} className="space-y-6">
              <div className="space-y-6">
                <button type="button" onClick={() => setView('list')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg shadow-sm transition-colors">
                  <ArrowLeft size={16} /> Kembali ke Daftar
                </button>

                <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-6">
                  <div>
                  <h4 className="font-bold text-brand-purple mb-4">I. Informasi Kunjungan &amp; Pemohon</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Tanggal Kunjungan *</label>
                      <input type="date" required value={form.tanggal_kunjungan} onChange={e => setForm({ ...form, tanggal_kunjungan: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-brand-purple mb-1">Waktu Mulai</label>
                        <input type="time" value={form.waktu_mulai} onChange={e => setForm({ ...form, waktu_mulai: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-brand-purple mb-1">Waktu Selesai</label>
                        <input
                          type="time"
                          value={form.waktu_selesai}
                          onChange={e => setForm({ ...form, waktu_selesai: e.target.value })}
                          className={cn(
                            "w-full px-3 py-2 border rounded-lg text-sm",
                            form.waktu_mulai && form.waktu_selesai && form.waktu_selesai < form.waktu_mulai
                              ? "border-red-400 focus:ring-2 focus:ring-red-400 focus:border-red-400"
                              : "border-gray-300"
                          )}
                        />
                        {form.waktu_mulai && form.waktu_selesai && form.waktu_selesai < form.waktu_mulai && (
                          <p className="text-xs text-red-600 mt-1">Waktu Selesai tidak boleh lebih kecil dari Waktu Mulai</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Divisi Pemohon</label>
                      <input type="text" value={form.divisi_pemohon} onChange={e => setForm({ ...form, divisi_pemohon: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Nama Pemohon / Kontak *</label>
                      <input type="text" required value={form.nama_pemohon} onChange={e => setForm({ ...form, nama_pemohon: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Jabatan Pemohon</label>
                      <input type="text" value={form.jabatan_pemohon} onChange={e => setForm({ ...form, jabatan_pemohon: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Lokasi Gudang *</label>
                      <select required value={form.lokasi_gudang} onChange={e => setForm({ ...form, lokasi_gudang: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="Gudang Mergat">Gudang Mergat</option>
                        <option value="Gudang Hasanuddin">Gudang Hasanuddin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Tujuan Kunjungan *</label>
                      <select required value={form.tujuan_kunjungan} onChange={e => setForm({ ...form, tujuan_kunjungan: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        {TUJUAN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    {form.tujuan_kunjungan === 'Lainnya' && (
                      <div>
                        <label className="block text-xs font-semibold text-brand-purple mb-1">Keterangan Tujuan Lainnya</label>
                        <input type="text" value={form.tujuan_lainnya} onChange={e => setForm({ ...form, tujuan_lainnya: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Pendamping (Petugas Gudang)</label>
                      <input type="text" value={form.pendamping_nama} onChange={e => setForm({ ...form, pendamping_nama: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-purple mb-1">Divisi Pendamping</label>
                      <input type="text" value={form.pendamping_divisi} onChange={e => setForm({ ...form, pendamping_divisi: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-brand-purple">II. Daftar Anggota Tim / Pengunjung</h4>
                    <button type="button" onClick={addMemberRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-purple bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors">
                      <Plus size={14} /> Tambah Baris
                    </button>
                  </div>
                  <div className="space-y-3">
                    {members.map((m, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <span className="text-sm font-semibold text-brand-purple w-6 shrink-0">{idx + 1}.</span>
                        <input type="text" placeholder="Nama Lengkap" value={m.nama_lengkap} onChange={e => updateMemberRow(idx, 'nama_lengkap', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <input type="text" placeholder="ID Karyawan" value={m.id_karyawan} onChange={e => updateMemberRow(idx, 'id_karyawan', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <input type="text" placeholder="Jabatan / Posisi" value={m.jabatan} onChange={e => updateMemberRow(idx, 'jabatan', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <button type="button" onClick={() => removeMemberRow(idx)} disabled={members.length <= 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-brand-purple">III. Rincian Berkas / Dokumen yang Dicari / Diambil</h4>
                    <button type="button" onClick={addItemRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-purple bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors">
                      <Plus size={14} /> Tambah Baris
                    </button>
                  </div>
                  <div className="space-y-3">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <span className="text-sm font-semibold text-brand-purple w-6 shrink-0">{idx + 1}.</span>
                        <input type="text" placeholder="Jenis Dokumen" value={it.jenis_dokumen} onChange={e => updateItemRow(idx, 'jenis_dokumen', e.target.value)} className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Tahun"
                          value={it.tahun}
                          maxLength={4}
                          onChange={e => updateItemRow(idx, 'tahun', e.target.value.replace(/\D/g, ''))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full sm:max-w-[100px]"
                        />
                        <input type="text" placeholder="No. Dokumen / Kardus" value={it.nomor_dokumen} onChange={e => updateItemRow(idx, 'nomor_dokumen', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <input type="text" placeholder="Keterangan / Status" value={it.keterangan} onChange={e => updateItemRow(idx, 'keterangan', e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full" />
                        <button type="button" onClick={() => removeItemRow(idx)} disabled={items.length <= 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  </div>

                  <p className="text-xs text-brand-purple/70 bg-gray-50 border border-gray-100 rounded-xl p-3">
                    No. Kunjungan akan dibuat otomatis saat form disimpan. Tanda tangan "Diajukan Oleh (Petugas/GA)" pada dokumen cetak akan menggunakan nama pada field Nama Pemohon. Tanda tangan lain ditandatangani secara fisik.
                  </p>
                </div>
              </div>

              <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 p-4 flex justify-end gap-3">
                <button type="button" onClick={() => setView('list')} className="btn-cancel">Batal</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                  <span>Simpan Form</span>
                </button>
              </div>
        </form>
      )}

      {view === 'detail' && selectedRequest && (
        <div className="space-y-6">
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <button onClick={() => setView('list')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg shadow-sm transition-colors mb-3">
                    <ArrowLeft size={16} /> Kembali ke Daftar
                  </button>
                  <h4 className="text-xl font-bold text-brand-purple mb-2">Kunjungan: {selectedRequest.no_kunjungan}</h4>
                  <div className="flex flex-wrap gap-4 text-sm text-brand-purple">
                    <span className="flex items-center"><User size={14} className="mr-1.5" /> {selectedRequest.nama_pemohon} ({selectedRequest.divisi_pemohon || '-'})</span>
                    <span className="flex items-center"><Calendar size={14} className="mr-1.5" /> {formatTanggalDDMMMYYYY(selectedRequest.tanggal_kunjungan)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <span className={cn(
                    "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border shadow-sm",
                    selectedRequest.status === 'SELESAI' ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"
                  )}>
                    {selectedRequest.status === 'SELESAI' ? 'Selesai Diverifikasi' : 'Diajukan'}
                  </span>
                  <button onClick={() => generatePDFPreview(selectedRequest ?? undefined, detailMembers, detailItems)} disabled={isSubmitting} className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-brand-purple rounded-xl shadow-sm text-sm font-semibold transition-all disabled:opacity-50">
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                    <span>Preview Surat Permohonan (PDF)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {loadingDetail ? (
                  <div className="py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-orange-600 mb-2" size={32} />
                    <p className="text-brand-purple">Memuat detail...</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white border rounded-2xl p-5 shadow-sm">
                      <h5 className="font-bold text-brand-purple mb-3">Daftar Anggota Tim / Pengunjung</h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead>
                            <tr className="text-xs font-semibold text-brand-purple uppercase border-b">
                              <th className="py-2 pr-4">No.</th>
                              <th className="py-2 pr-4">Nama Lengkap</th>
                              <th className="py-2 pr-4">ID Karyawan</th>
                              <th className="py-2 pr-4">Jabatan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {detailMembers.length === 0 ? (
                              <tr><td colSpan={4} className="py-3 text-brand-purple/60">Tidak ada anggota tim tercatat.</td></tr>
                            ) : detailMembers.map((m, i) => (
                              <tr key={m.id}>
                                <td className="py-2 pr-4">{i + 1}</td>
                                <td className="py-2 pr-4">{m.nama_lengkap}</td>
                                <td className="py-2 pr-4">{m.id_karyawan || '-'}</td>
                                <td className="py-2 pr-4">{m.jabatan || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-white border rounded-2xl p-5 shadow-sm">
                      <h5 className="font-bold text-brand-purple mb-3 flex items-center justify-between">
                        <span>Rincian Berkas / Dokumen yang Dicari / Diambil</span>
                        {logbook && <span className="text-xs font-medium text-brand-purple/70">Terverifikasi: {logbook.verified_items}/{logbook.total_items}</span>}
                      </h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead>
                            <tr className="text-xs font-semibold text-brand-purple uppercase border-b">
                              <th className="py-2 pr-4">No.</th>
                              <th className="py-2 pr-4">Jenis Dokumen</th>
                              <th className="py-2 pr-4">Tahun</th>
                              <th className="py-2 pr-4">No. Dokumen/Kardus</th>
                              <th className="py-2 pr-4">Keterangan</th>
                              {isAdmin && <th className="py-2 pr-4 text-center">Verifikasi</th>}
                              {isAdmin && <th className="py-2 pr-4">Catatan Verifikasi</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {detailItems.map((it, i) => {
                              const check = logbookChecks.find(c => c.request_item_id === it.id);
                              return (
                                <tr key={it.id}>
                                  <td className="py-2 pr-4">{i + 1}</td>
                                  <td className="py-2 pr-4">{it.jenis_dokumen}</td>
                                  <td className="py-2 pr-4">{it.tahun || '-'}</td>
                                  <td className="py-2 pr-4">{it.nomor_dokumen || '-'}</td>
                                  <td className="py-2 pr-4">{it.keterangan || '-'}</td>
                                  {isAdmin && (
                                    <td className="py-2 pr-4">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          type="button"
                                          title="Terverifikasi"
                                          onClick={() => check && setItemVerificationStatus(check, 'VERIFIED')}
                                          disabled={!check}
                                          className={cn(
                                            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors",
                                            check?.verification_status === 'VERIFIED' ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-50 text-brand-purple/60 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                                          )}
                                        >
                                          <CheckSquare size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          title="Tidak Terverifikasi"
                                          onClick={() => check && setItemVerificationStatus(check, 'TIDAK_SESUAI')}
                                          disabled={!check}
                                          className={cn(
                                            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors",
                                            check?.verification_status === 'TIDAK_SESUAI' ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-50 text-brand-purple/60 border-gray-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                                          )}
                                        >
                                          <XSquare size={14} />
                                        </button>
                                      </div>
                                      <div className="text-center mt-1">
                                        <span className={cn(
                                          "text-[10px] font-semibold",
                                          check?.verification_status === 'VERIFIED' ? "text-green-600" :
                                          check?.verification_status === 'TIDAK_SESUAI' ? "text-red-600" : "text-brand-purple/50"
                                        )}>
                                          {check?.verification_status === 'VERIFIED' ? 'Terverifikasi' :
                                           check?.verification_status === 'TIDAK_SESUAI' ? 'Tidak Terverifikasi' : 'Belum Diputuskan'}
                                        </span>
                                      </div>
                                    </td>
                                  )}
                                  {isAdmin && (
                                    <td className="py-2 pr-4">
                                      <input
                                        type="text"
                                        placeholder="Catatan (opsional)"
                                        value={check?.verified_note || ''}
                                        onChange={e => check && updateItemNote(check, e.target.value)}
                                        onBlur={() => check && saveItemNote(check)}
                                        disabled={!check}
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                      />
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="bg-white border rounded-2xl p-5 shadow-sm">
                        <h5 className="font-bold text-brand-purple mb-1">Nama Tanda Tangan untuk Cetak PDF</h5>
                        <p className="text-xs text-brand-purple/60 mb-4">Nama "Diajukan Oleh" otomatis dari Nama Pemohon. Isi nama di bawah ini untuk 2 tanda tangan lainnya (opsional, boleh diisi belakangan sebelum dicetak). Tanggal akan muncul otomatis di bawah nama saat PDF dicetak.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-brand-purple mb-1">Diketahui Oleh (Pemohon/Depart)</label>
                            <input type="text" value={signNames.diketahui_oleh_nama} onChange={e => setSignNames({ ...signNames, diketahui_oleh_nama: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Nama yang mengetahui" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-brand-purple mb-1">Disetujui (Direktur)</label>
                            <input type="text" value={signNames.disetujui_oleh_nama} onChange={e => setSignNames({ ...signNames, disetujui_oleh_nama: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Nama Direktur" />
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <button type="button" onClick={saveSignNames} disabled={savingSignNames} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-xl shadow-sm transition-colors disabled:opacity-50">
                            {savingSignNames ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Simpan Nama
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="bg-white border rounded-2xl p-5 shadow-sm">
                      <h5 className="font-bold text-brand-purple mb-4">Logbook Kunjungan Gudang Berkas</h5>
                      {logbook?.is_completed ? (
                        <div className="text-sm text-brand-purple space-y-2">
                          <p className="flex items-center gap-2">
                            <span className="font-semibold">Status:</span>
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border",
                              STATUS_KUNJUNGAN_STYLE[logbook.status_kunjungan || ''] || "bg-gray-100 text-gray-700 border-gray-300"
                            )}>
                              {logbook.status_kunjungan || '-'}
                            </span>
                          </p>
                          <p><span className="font-semibold">GA Verificator:</span> {logbook.ga_verificator_name}</p>
                          <p><span className="font-semibold">Tanggal Verifikasi:</span> {formatTanggalDDMMMYYYY(logbook.tanggal_verifikasi)}</p>
                          <p><span className="font-semibold">Keterangan:</span> {logbook.keterangan || '-'}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-brand-purple mb-1">Status Kunjungan</label>
                              <select value={logbookStatus} onChange={e => setLogbookStatus(e.target.value as any)} disabled={!isAdmin} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50">
                                <option value="Masuk">Masuk</option>
                                <option value="Keluar">Keluar</option>
                                <option value="Periksa">Periksa</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-brand-purple mb-1">GA Verificator</label>
                              <input type="text" disabled value={profile?.full_name || '-'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-brand-purple mb-1">Keterangan</label>
                            <textarea rows={2} value={logbookKeterangan} onChange={e => setLogbookKeterangan(e.target.value)} disabled={!isAdmin} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50" placeholder="Catatan tambahan (opsional)" />
                          </div>
                          {isAdmin && (
                            <div className="flex flex-col sm:flex-row justify-end gap-3">
                              <button type="button" onClick={() => saveLogbook(false)} disabled={isSubmitting} className="btn-cancel">
                                Simpan Sementara
                              </button>
                              <button
                                type="button"
                                onClick={() => saveLogbook(true)}
                                disabled={isSubmitting || !logbook || logbookChecks.filter(c => c.verification_status !== 'PENDING').length < (logbook?.total_items || 0)}
                                className="px-6 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                              >
                                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckSquare size={18} />}
                                <span>Selesaikan Verifikasi Logbook</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={closePdfPreview}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-brand-purple">Preview Surat Permohonan</h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewUrl}
                  download={pdfPreviewFileName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-brand-purple bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                >
                  <Download size={15} /> Unduh
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const win = window.open(pdfPreviewUrl, '_blank');
                    win?.addEventListener('load', () => win.print());
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg transition-colors"
                >
                  <Printer size={15} /> Cetak
                </button>
                <button onClick={closePdfPreview} className="p-2 text-brand-purple hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title="Preview PDF" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
