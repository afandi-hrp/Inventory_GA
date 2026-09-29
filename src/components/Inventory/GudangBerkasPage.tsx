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
  X, Loader2, Warehouse, Search, User, Users, Calendar, Clock, MapPin, Eye, Download, Plus, Trash2,
  ClipboardCheck, CheckCircle2, XCircle, CircleDashed, ArrowLeft, Printer, Save, ChevronLeft, ChevronRight,
  FileText, ShieldCheck, Pencil, AlertTriangle, Info, NotebookPen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { jsPDF } from 'jspdf';
import { addPdfLogo } from '../../lib/pdfLogo';
import autoTable from 'jspdf-autotable';

interface GudangBerkasPageProps {
  profile: Profile | null;
}

type ViewMode = 'list' | 'create' | 'detail';
type StatusFilter = 'ALL' | 'DIAJUKAN' | 'SELESAI';
type VerificationStatus = 'PENDING' | 'VERIFIED' | 'TIDAK_SESUAI';
type PersonOption = Pick<Profile, 'id' | 'full_name' | 'divisi' | 'jabatan' | 'role'>;

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

// Ringkasan logbook yang di-embed di query daftar (1:1 dengan request).
type LogbookSummary = Pick<GudangBerkasLogbook, 'verified_items' | 'total_items' | 'is_completed'>;
type RequestRow = GudangBerkasRequest & { gudang_berkas_logbook?: LogbookSummary | LogbookSummary[] | null };

const emptyMember: MemberRow = { nama_lengkap: '', id_karyawan: '', jabatan: '' };
const emptyItem: ItemRow = { jenis_dokumen: '', tahun: '', nomor_dokumen: '', keterangan: '' };

const TUJUAN_OPTIONS = ['Pemeriksaan / Pencarian Berkas Fisik', 'Pengambilan Berkas', 'Tambah Berkas', 'Lainnya'];
const LOKASI_OPTIONS = ['Gudang Mergat', 'Gudang Hasanuddin'] as const;

const inputClass = 'w-full px-3 py-2 border border-brand-purple/20 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple/40 outline-none transition-colors';

function formatTanggalDDMMMYYYY(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmmm = d.toLocaleDateString('id-ID', { month: 'long' });
  return `${dd}-${mmmm}-${d.getFullYear()}`;
}

function formatWaktu(req: Pick<GudangBerkasRequest, 'waktu_mulai' | 'waktu_selesai'>) {
  if (!req.waktu_mulai && !req.waktu_selesai) return '-';
  return `${req.waktu_mulai?.slice(0, 5) || '-'} – ${req.waktu_selesai?.slice(0, 5) || '-'} WIB`;
}

function initials(name: string | null | undefined) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');
}

function logbookOf(req: RequestRow): LogbookSummary | null {
  const lb = req.gudang_berkas_logbook;
  return Array.isArray(lb) ? (lb[0] || null) : (lb || null);
}

const STATUS_KUNJUNGAN_STYLE: Record<string, string> = {
  Masuk: 'bg-green-100 text-green-700 border-green-300',
  Keluar: 'bg-red-100 text-red-700 border-red-300',
  Periksa: 'bg-blue-100 text-blue-700 border-blue-300',
};

// ---------- komponen tampilan kecil ----------

function SectionCard({ no, icon, title, subtitle, action, children }: {
  no?: number; icon?: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {no !== undefined ? (
            <span className="w-8 h-8 rounded-full bg-brand-purple text-white text-sm font-bold flex items-center justify-center shrink-0">{no}</span>
          ) : icon ? (
            <span className="w-8 h-8 rounded-xl bg-brand-purple/10 text-brand-purple flex items-center justify-center shrink-0">{icon}</span>
          ) : null}
          <div className="min-w-0">
            <h4 className="font-bold text-brand-purple leading-tight">{title}</h4>
            {subtitle && <p className="text-xs text-brand-purple/60 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-brand-purple mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-brand-purple/60 mt-1">{hint}</p>}
    </div>
  );
}

// Kartu identitas read-only (pemohon / pendamping) — data dari profil user.
function IdentityCard({ person, emptyText }: { person: PersonOption | null; emptyText: string }) {
  if (!person) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-brand-purple/25 text-sm text-brand-purple/50">
        <User size={18} /> {emptyText}
      </div>
    );
  }
  const incomplete = !person.divisi || !person.jabatan;
  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-xl border', incomplete ? 'border-amber-300 bg-amber-50' : 'border-brand-purple/15 bg-brand-purple/5')}>
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-purple to-brand-purple-light text-white font-bold text-sm flex items-center justify-center shrink-0">
        {initials(person.full_name)}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-brand-purple text-sm truncate">{person.full_name || '-'}</p>
        <p className="text-xs text-brand-purple/70 truncate">
          {person.divisi || <span className="text-amber-700">Divisi belum diisi</span>}
          {' · '}
          {person.jabatan || <span className="text-amber-700">Jabatan belum diisi</span>}
        </p>
      </div>
    </div>
  );
}

function VerificationSegment({ value, onChange, disabled }: {
  value: VerificationStatus; onChange: (status: VerificationStatus) => void; disabled?: boolean;
}) {
  const options: { id: VerificationStatus; label: string; icon: React.ReactNode; active: string }[] = [
    { id: 'PENDING', label: 'Pending', icon: <CircleDashed size={13} />, active: 'bg-gray-200 text-gray-700' },
    { id: 'VERIFIED', label: 'Sesuai', icon: <CheckCircle2 size={13} />, active: 'bg-green-600 text-white' },
    { id: 'TIDAK_SESUAI', label: 'Tidak Sesuai', icon: <XCircle size={13} />, active: 'bg-red-600 text-white' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-brand-purple/15 bg-white p-0.5">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors disabled:cursor-not-allowed',
            value === opt.id ? opt.active : 'text-brand-purple/60 hover:bg-brand-purple/5'
          )}
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus | undefined }) {
  if (status === 'VERIFIED') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><CheckCircle2 size={12} /> Sesuai</span>;
  if (status === 'TIDAK_SESUAI') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200"><XCircle size={12} /> Tidak Sesuai</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200"><CircleDashed size={12} /> Pending</span>;
}

function StatusBadge({ status, large }: { status: GudangBerkasRequest['status']; large?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-semibold border',
      large ? 'px-3 py-1.5 text-sm shadow-sm' : 'px-2.5 py-1 text-xs',
      status === 'SELESAI' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
    )}>
      {status === 'SELESAI' ? 'Selesai Diverifikasi' : 'Diajukan'}
    </span>
  );
}

// ---------- halaman ----------

export function GudangBerkasPage({ profile }: GudangBerkasPageProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState<ViewMode>('list');
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state — data pemohon & pendamping diambil dari profil user (lihat pemohon/pendamping di bawah)
  const [form, setForm] = useState({
    tanggal_kunjungan: new Date().toISOString().slice(0, 10),
    waktu_mulai: '',
    waktu_selesai: '',
    lokasi_gudang: 'Gudang Mergat' as 'Gudang Mergat' | 'Gudang Hasanuddin',
    tujuan_kunjungan: TUJUAN_OPTIONS[0],
    tujuan_lainnya: '',
    pemohon_id: '',
    pendamping_id: '',
  });
  const [members, setMembers] = useState<MemberRow[]>([{ ...emptyMember }]);
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [pemohonOptions, setPemohonOptions] = useState<PersonOption[]>([]);
  const [pendampingOptions, setPendampingOptions] = useState<PersonOption[]>([]);
  const [selfPerson, setSelfPerson] = useState<PersonOption | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);

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

  // Temuan lapangan (baris rincian tambahan saat verifikasi)
  const [temuanDraft, setTemuanDraft] = useState<ItemRow | null>(null);
  const [editingTemuanId, setEditingTemuanId] = useState<string | null>(null);
  const [temuanEditDraft, setTemuanEditDraft] = useState<ItemRow>({ ...emptyItem });
  const [savingTemuan, setSavingTemuan] = useState(false);

  // Admin & SPV setara di modul ini: input form, verifikasi logbook, isi nama
  // penanda tangan, tambah temuan lapangan, tandai selesai.
  const canManage = profile?.role === 'admin' || profile?.role === 'spv';
  // Role khusus: hanya boleh membuat form & melihat/cetak PDF miliknya sendiri.
  // Tidak boleh mengedit apa pun, dan sama sekali tidak boleh melihat bagian
  // verifikasi/logbook — dijaga juga di level RLS (lihat supabase_gudang_berkas_setup.sql),
  // ini cuma lapisan UI-nya.
  const isStaffGudangBerkas = profile?.role === 'gudang_berkas';
  const canCreate = canManage || isStaffGudangBerkas;

  const pemohon: PersonOption | null = isStaffGudangBerkas
    ? selfPerson
    : pemohonOptions.find(p => p.id === form.pemohon_id) || null;
  const pendamping: PersonOption | null = pendampingOptions.find(p => p.id === form.pendamping_id) || null;

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  function resetCreateForm() {
    setForm({
      tanggal_kunjungan: new Date().toISOString().slice(0, 10),
      waktu_mulai: '',
      waktu_selesai: '',
      lokasi_gudang: 'Gudang Mergat',
      tujuan_kunjungan: TUJUAN_OPTIONS[0],
      tujuan_lainnya: '',
      pemohon_id: '',
      pendamping_id: '',
    });
    setMembers([{ ...emptyMember }]);
    setItems([{ ...emptyItem }]);
  }

  // Muat pilihan pemohon (user role Akses Gudang) & pendamping (user role admin),
  // plus profil diri sendiri yang terbaru (divisi/jabatan bisa baru diubah di Akun Saya).
  async function loadPeople() {
    setLoadingPeople(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, divisi, jabatan, role, is_active')
        .in('role', ['admin', 'gudang_berkas'])
        .order('full_name');
      if (error) throw error;
      const active = (data || []).filter((p: any) => p.is_active !== false) as PersonOption[];
      setPendampingOptions(active.filter(p => p.role === 'admin'));
      setPemohonOptions(active.filter(p => p.role === 'gudang_berkas'));

      if (isStaffGudangBerkas && profile) {
        const { data: me } = await supabase
          .from('profiles')
          .select('id, full_name, divisi, jabatan, role')
          .eq('id', profile.id)
          .maybeSingle();
        setSelfPerson((me as PersonOption) || profile);
      }
    } catch (err) {
      showToast('Gagal memuat daftar pemohon / pendamping', 'error');
    } finally {
      setLoadingPeople(false);
    }
  }

  function openCreate() {
    resetCreateForm();
    setView('create');
    loadPeople();
  }

  async function fetchRequests() {
    setLoading(true);
    try {
      let query = supabase
        .from('gudang_berkas_requests')
        // Ringkasan logbook ikut di-embed buat progress verifikasi di daftar.
        // Role gudang_berkas gak punya akses baca logbook (RLS) → cukup jadi null.
        .select('*, gudang_berkas_logbook(verified_items, total_items, is_completed)')
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
    setTemuanDraft(null);
    setEditingTemuanId(null);
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

    if (!pemohon) {
      showToast(isStaffGudangBerkas ? 'Profil Anda belum termuat, coba muat ulang halaman' : 'Pilih pemohon terlebih dahulu', 'error');
      return;
    }
    if (!pemohon.divisi || !pemohon.jabatan) {
      showToast(isStaffGudangBerkas
        ? 'Divisi & jabatan Anda belum diisi. Lengkapi dulu di menu Akun Saya.'
        : 'Divisi & jabatan pemohon belum diisi. Lengkapi dulu di Manage Users.', 'error');
      return;
    }
    if (!pendamping) {
      showToast('Pilih pendamping (petugas gudang) terlebih dahulu', 'error');
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
          pemohon_id: pemohon.id,
          nama_pemohon: (pemohon.full_name || '').trim(),
          divisi_pemohon: pemohon.divisi || null,
          jabatan_pemohon: pemohon.jabatan || null,
          lokasi_gudang: form.lokasi_gudang,
          tujuan_kunjungan: form.tujuan_kunjungan,
          tujuan_lainnya: form.tujuan_kunjungan === 'Lainnya' ? (form.tujuan_lainnya || null) : null,
          jumlah_personil: Math.max(validMembers.length, 1),
          pendamping_id: pendamping.id,
          pendamping_nama: pendamping.full_name || null,
          pendamping_divisi: pendamping.divisi || null,
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

  // Simpan jumlah item & jumlah yang sudah diputuskan ke baris logbook.
  async function syncLogbookCounts(checks: GudangBerkasLogbookItemCheck[]) {
    if (!logbook) return;
    const decidedCount = checks.filter(c => c.verification_status !== 'PENDING').length;
    const totalItems = checks.length;
    await supabase.from('gudang_berkas_logbook').update({ verified_items: decidedCount, total_items: totalItems }).eq('id', logbook.id);
    setLogbook({ ...logbook, verified_items: decidedCount, total_items: totalItems });
  }

  async function setItemVerificationStatus(check: GudangBerkasLogbookItemCheck, status: VerificationStatus) {
    if (!canManage || !logbook) return;
    try {
      const verifiedAt = status !== 'PENDING' ? new Date().toISOString() : null;
      const { error } = await supabase
        .from('gudang_berkas_logbook_item_checks')
        .update({
          verification_status: status,
          is_verified: status === 'VERIFIED',
          verified_at: verifiedAt,
        })
        .eq('id', check.id);
      if (error) throw error;

      const updatedChecks = logbookChecks.map(c => c.id === check.id ? {
        ...c,
        verification_status: status,
        is_verified: status === 'VERIFIED',
        verified_at: verifiedAt,
      } : c);
      setLogbookChecks(updatedChecks);
      await syncLogbookCounts(updatedChecks);
    } catch (err) {
      showToast('Gagal mengubah status verifikasi item', 'error');
    }
  }

  function updateItemNote(check: GudangBerkasLogbookItemCheck, note: string) {
    setLogbookChecks(prev => prev.map(c => c.id === check.id ? { ...c, verified_note: note } : c));
  }

  async function saveItemNote(check: GudangBerkasLogbookItemCheck) {
    if (!canManage) return;
    try {
      const current = logbookChecks.find(c => c.id === check.id);
      const { error } = await supabase
        .from('gudang_berkas_logbook_item_checks')
        .update({ verified_note: current?.verified_note || null })
        .eq('id', check.id);
      if (error) throw error;
      showToast('Catatan item tersimpan', 'success');
    } catch (err) {
      showToast('Gagal menyimpan catatan item', 'error');
    }
  }

  // Temuan lapangan: baris rincian tambahan (kondisi nyata di gudang beda dari
  // permohonan). Disimpan di tabel rincian yang sama dengan penanda
  // is_temuan_lapangan, plus 1 baris checklist verifikasi. Tidak ikut di PDF.
  async function addTemuan() {
    if (!canManage || !selectedRequest || !logbook || !temuanDraft) return;
    if (!temuanDraft.jenis_dokumen.trim()) {
      showToast('Jenis dokumen temuan wajib diisi', 'error');
      return;
    }
    setSavingTemuan(true);
    try {
      const nextNo = detailItems.reduce((max, it) => Math.max(max, it.no_urut), 0) + 1;
      const { data: newItem, error: itemError } = await supabase
        .from('gudang_berkas_request_items')
        .insert({
          request_id: selectedRequest.id,
          no_urut: nextNo,
          jenis_dokumen: temuanDraft.jenis_dokumen.trim(),
          tahun: temuanDraft.tahun || null,
          nomor_dokumen: temuanDraft.nomor_dokumen || null,
          keterangan: temuanDraft.keterangan || null,
          is_temuan_lapangan: true,
          ditambahkan_oleh: profile?.full_name || null,
        })
        .select()
        .single();
      if (itemError) throw itemError;

      const { data: newCheck, error: checkError } = await supabase
        .from('gudang_berkas_logbook_item_checks')
        .insert({ logbook_id: logbook.id, request_item_id: newItem.id })
        .select()
        .single();
      if (checkError) throw checkError;

      const updatedChecks = [...logbookChecks, newCheck];
      setDetailItems(prev => [...prev, newItem]);
      setLogbookChecks(updatedChecks);
      await syncLogbookCounts(updatedChecks);
      setTemuanDraft(null);
      showToast('Temuan lapangan ditambahkan', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menambah temuan lapangan', 'error');
    } finally {
      setSavingTemuan(false);
    }
  }

  function startEditTemuan(item: GudangBerkasRequestItem) {
    setEditingTemuanId(item.id);
    setTemuanEditDraft({
      jenis_dokumen: item.jenis_dokumen,
      tahun: item.tahun || '',
      nomor_dokumen: item.nomor_dokumen || '',
      keterangan: item.keterangan || '',
    });
  }

  async function saveTemuanEdit(item: GudangBerkasRequestItem) {
    if (!temuanEditDraft.jenis_dokumen.trim()) {
      showToast('Jenis dokumen temuan wajib diisi', 'error');
      return;
    }
    setSavingTemuan(true);
    try {
      const patch = {
        jenis_dokumen: temuanEditDraft.jenis_dokumen.trim(),
        tahun: temuanEditDraft.tahun || null,
        nomor_dokumen: temuanEditDraft.nomor_dokumen || null,
        keterangan: temuanEditDraft.keterangan || null,
      };
      const { data, error } = await supabase
        .from('gudang_berkas_request_items')
        .update(patch)
        .eq('id', item.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Gagal menyimpan: kemungkinan tidak punya izin (RLS).');
      setDetailItems(prev => prev.map(it => it.id === item.id ? { ...it, ...patch } : it));
      setEditingTemuanId(null);
      showToast('Temuan lapangan diperbarui', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui temuan lapangan', 'error');
    } finally {
      setSavingTemuan(false);
    }
  }

  async function deleteTemuan(item: GudangBerkasRequestItem) {
    if (!window.confirm(`Hapus temuan lapangan "${item.jenis_dokumen}"?`)) return;
    setSavingTemuan(true);
    try {
      // Checklist verifikasinya ikut terhapus (FK ON DELETE CASCADE).
      const { data, error } = await supabase
        .from('gudang_berkas_request_items')
        .delete()
        .eq('id', item.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Gagal menghapus: kemungkinan tidak punya izin (RLS).');
      const updatedChecks = logbookChecks.filter(c => c.request_item_id !== item.id);
      setDetailItems(prev => prev.filter(it => it.id !== item.id));
      setLogbookChecks(updatedChecks);
      await syncLogbookCounts(updatedChecks);
      showToast('Temuan lapangan dihapus', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus temuan lapangan', 'error');
    } finally {
      setSavingTemuan(false);
    }
  }

  async function saveSignNames() {
    if (!canManage || !selectedRequest) return;
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
    if (!canManage || !logbook || !selectedRequest) return;
    const decidedCount = logbookChecks.filter(c => c.verification_status !== 'PENDING').length;

    if (markComplete && decidedCount < logbookChecks.length) {
      showToast(`Belum semua item diverifikasi (${decidedCount}/${logbookChecks.length})`, 'error');
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

  const addLogo = async (doc: jsPDF, x: number, y: number) => addPdfLogo(doc, x, y);

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
    // Surat permohonan hanya memuat rincian permohonan asli — temuan lapangan
    // (ditambahkan saat verifikasi) sengaja TIDAK dicetak.
    const detailItems = (itemsOverride || []).filter(it => !it.is_temuan_lapangan);
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

  const searchedRequests = requests.filter(req =>
    req.no_kunjungan.toLowerCase().includes(search.toLowerCase()) ||
    req.nama_pemohon.toLowerCase().includes(search.toLowerCase()) ||
    (req.divisi_pemohon || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredRequests = searchedRequests.filter(req => statusFilter === 'ALL' || req.status === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const listColSpan = isStaffGudangBerkas ? 6 : 7;

  // Ringkasan verifikasi di detail
  const decidedCount = logbookChecks.filter(c => c.verification_status !== 'PENDING').length;
  const sesuaiCount = logbookChecks.filter(c => c.verification_status === 'VERIFIED').length;
  const tidakSesuaiCount = logbookChecks.filter(c => c.verification_status === 'TIDAK_SESUAI').length;
  const totalChecks = logbookChecks.length;
  const canEditTemuan = canManage && !!logbook && !logbook.is_completed;

  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: 'ALL', label: 'Semua' },
    { id: 'DIAJUKAN', label: 'Diajukan' },
    { id: 'SELESAI', label: 'Selesai' },
  ];

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
          <div className="bg-white/60 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-white/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                    onClick={openCreate}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-orange-600 transition-colors shrink-0"
                  >
                    <Plus size={16} /> Buat Form Baru
                  </button>
                )}
                {!isStaffGudangBerkas && (
                  <button
                    onClick={() => navigate('/approval')}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-purple hover:bg-brand-purple-light text-white rounded-lg text-sm font-semibold shadow-sm transition-colors shrink-0"
                  >
                    <ArrowLeft size={16} /> Kembali ke Approval
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusTabs.map(tab => {
                const count = searchedRequests.filter(r => tab.id === 'ALL' || r.status === tab.id).length;
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors',
                      active ? 'bg-brand-purple text-white border-brand-purple' : 'bg-white text-brand-purple border-brand-purple/20 hover:bg-brand-purple/5'
                    )}
                  >
                    {tab.label}
                    <span className={cn('min-w-[22px] px-1.5 py-0.5 rounded-full text-[11px] leading-none text-center', active ? 'bg-white/20 text-white' : 'bg-brand-purple/10 text-brand-purple')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-brand-purple text-xs font-semibold text-white uppercase tracking-wider">
                    <th className="px-5 py-4">No. Kunjungan</th>
                    <th className="px-5 py-4">Pemohon</th>
                    <th className="px-5 py-4">Jadwal</th>
                    <th className="px-5 py-4">Lokasi</th>
                    {!isStaffGudangBerkas && <th className="px-5 py-4">Verifikasi</th>}
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-purple/5">
                  {loading ? (
                    <tr>
                      <td colSpan={listColSpan} className="px-6 py-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-brand-purple mb-2" size={32} />
                        <p className="text-brand-purple">Memuat data...</p>
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={listColSpan} className="px-6 py-12 text-center">
                        <Warehouse className="mx-auto text-brand-purple mb-2" size={48} />
                        <p className="text-brand-purple">{requests.length === 0 ? 'Belum ada Form Akses Gudang Berkas.' : 'Tidak ada form pada filter ini.'}</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRequests.map((req) => {
                      const lb = logbookOf(req);
                      const pct = lb && lb.total_items > 0 ? Math.round((lb.verified_items / lb.total_items) * 100) : 0;
                      return (
                        <tr key={req.id} className="hover:bg-brand-purple/5 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-brand-purple">{req.no_kunjungan}</p>
                            <p className="text-xs text-brand-purple/60 mt-0.5 max-w-[200px] truncate" title={req.tujuan_kunjungan || ''}>
                              {req.tujuan_kunjungan === 'Lainnya' ? `Lainnya: ${req.tujuan_lainnya || '-'}` : (req.tujuan_kunjungan || '-')}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-brand-purple/10 text-brand-purple text-xs font-bold flex items-center justify-center shrink-0">
                                {initials(req.nama_pemohon)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-brand-purple truncate">{req.nama_pemohon}</p>
                                <p className="text-xs text-brand-purple/60 truncate">{req.divisi_pemohon || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-brand-purple">
                            <p className="flex items-center gap-1.5"><Calendar size={13} /> {new Date(req.tanggal_kunjungan).toLocaleDateString('id-ID')}</p>
                            <p className="flex items-center gap-1.5 text-xs text-brand-purple/60 mt-0.5"><Clock size={12} /> {formatWaktu(req)}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 whitespace-nowrap">
                              <MapPin size={11} /> {req.lokasi_gudang || '-'}
                            </span>
                          </td>
                          {!isStaffGudangBerkas && (
                            <td className="px-5 py-4">
                              {lb ? (
                                <div className="w-28">
                                  <div className="h-1.5 rounded-full bg-brand-purple/10 overflow-hidden">
                                    <div className={cn('h-full rounded-full', lb.is_completed ? 'bg-green-500' : 'bg-brand-purple')} style={{ width: `${pct}%` }} />
                                  </div>
                                  <p className="text-[11px] text-brand-purple/70 mt-1">{lb.verified_items}/{lb.total_items} item</p>
                                </div>
                              ) : (
                                <span className="text-xs text-brand-purple/40">-</span>
                              )}
                            </td>
                          )}
                          <td className="px-5 py-4"><StatusBadge status={req.status} /></td>
                          <td className="px-5 py-4 text-right">
                            {isStaffGudangBerkas ? (
                              <button
                                onClick={() => quickPreviewPDF(req)}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 rounded-lg text-sm font-medium transition-colors border border-brand-purple/10 disabled:opacity-50"
                              >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                <span>Lihat PDF</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => fetchDetail(req)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 rounded-lg text-sm font-medium transition-colors border border-brand-purple/10"
                              >
                                <Eye size={16} />
                                <span>Detail</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && filteredRequests.length > 0 && (
              <div className="px-6 py-4 bg-white/40 border-t border-brand-purple/5 flex flex-col sm:flex-row items-center justify-between gap-4">
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
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <button type="button" onClick={() => setView('list')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg shadow-sm transition-colors">
            <ArrowLeft size={16} /> Kembali ke Daftar
          </button>

          <SectionCard no={1} title="Informasi Kunjungan & Pemohon" subtitle="Data pemohon & pendamping diambil otomatis dari profil user">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Pemohon */}
              <div className="space-y-2">
                <Field label="Pemohon" required>
                  {isStaffGudangBerkas ? (
                    loadingPeople && !selfPerson ? (
                      <div className="flex items-center gap-2 text-sm text-brand-purple/60 p-3"><Loader2 size={16} className="animate-spin" /> Memuat profil...</div>
                    ) : (
                      <IdentityCard person={selfPerson} emptyText="Profil tidak ditemukan" />
                    )
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={form.pemohon_id}
                        onChange={e => setForm({ ...form, pemohon_id: e.target.value })}
                        className={inputClass}
                        disabled={loadingPeople}
                      >
                        <option value="">{loadingPeople ? 'Memuat...' : '— Pilih user Akses Gudang —'}</option>
                        {pemohonOptions.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name || 'Tanpa nama'}{p.divisi ? ` — ${p.divisi}` : ''}</option>
                        ))}
                      </select>
                      <IdentityCard person={pemohon} emptyText="Belum ada pemohon dipilih" />
                    </div>
                  )}
                </Field>
                {pemohon && (!pemohon.divisi || !pemohon.jabatan) && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    {isStaffGudangBerkas
                      ? 'Divisi & jabatan Anda belum diisi. Lengkapi dulu di menu Akun Saya, lalu buka form ini lagi.'
                      : 'Divisi & jabatan user ini belum diisi. Lengkapi dulu di Manage Users.'}
                  </p>
                )}
                {!isStaffGudangBerkas && !loadingPeople && pemohonOptions.length === 0 && (
                  <p className="text-xs text-amber-700">Belum ada user dengan role Akses Gudang Berkas.</p>
                )}
              </div>

              {/* Pendamping */}
              <div className="space-y-2">
                <Field label="Pendamping (Petugas Gudang)" required>
                  <div className="space-y-2">
                    <select
                      value={form.pendamping_id}
                      onChange={e => setForm({ ...form, pendamping_id: e.target.value })}
                      className={inputClass}
                      disabled={loadingPeople}
                    >
                      <option value="">{loadingPeople ? 'Memuat...' : '— Pilih pendamping —'}</option>
                      {pendampingOptions.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name || 'Tanpa nama'}{p.divisi ? ` — ${p.divisi}` : ''}</option>
                      ))}
                    </select>
                    <IdentityCard person={pendamping} emptyText="Belum ada pendamping dipilih" />
                  </div>
                </Field>
              </div>
            </div>

            <div className="border-t border-brand-purple/10 my-5" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Tanggal Kunjungan" required>
                <input type="date" required value={form.tanggal_kunjungan} onChange={e => setForm({ ...form, tanggal_kunjungan: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Waktu Mulai">
                <input type="time" value={form.waktu_mulai} onChange={e => setForm({ ...form, waktu_mulai: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Waktu Selesai">
                <input
                  type="time"
                  value={form.waktu_selesai}
                  onChange={e => setForm({ ...form, waktu_selesai: e.target.value })}
                  className={cn(inputClass, form.waktu_mulai && form.waktu_selesai && form.waktu_selesai < form.waktu_mulai && 'border-red-400 focus:ring-red-300')}
                />
                {form.waktu_mulai && form.waktu_selesai && form.waktu_selesai < form.waktu_mulai && (
                  <p className="text-xs text-red-600 mt-1">Waktu Selesai tidak boleh lebih kecil dari Waktu Mulai</p>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              <Field label="Lokasi Gudang" required>
                <div className="grid grid-cols-2 gap-2">
                  {LOKASI_OPTIONS.map(lokasi => (
                    <button
                      key={lokasi}
                      type="button"
                      onClick={() => setForm({ ...form, lokasi_gudang: lokasi })}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors',
                        form.lokasi_gudang === lokasi ? 'bg-brand-purple text-white border-brand-purple' : 'bg-white text-brand-purple border-brand-purple/20 hover:bg-brand-purple/5'
                      )}
                    >
                      <MapPin size={14} /> {lokasi.replace('Gudang ', '')}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="lg:col-span-2">
                <Field label="Tujuan Kunjungan" required>
                  <div className="flex flex-wrap gap-2">
                    {TUJUAN_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setForm({ ...form, tujuan_kunjungan: opt })}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-semibold border transition-colors',
                          form.tujuan_kunjungan === opt ? 'bg-brand-purple text-white border-brand-purple' : 'bg-white text-brand-purple border-brand-purple/20 hover:bg-brand-purple/5'
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </Field>
                {form.tujuan_kunjungan === 'Lainnya' && (
                  <div className="mt-3">
                    <Field label="Keterangan Tujuan Lainnya">
                      <input type="text" value={form.tujuan_lainnya} onChange={e => setForm({ ...form, tujuan_lainnya: e.target.value })} className={inputClass} placeholder="Jelaskan tujuan kunjungan" />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            no={2}
            title="Daftar Anggota Tim / Pengunjung"
            subtitle={`${members.filter(m => m.nama_lengkap.trim()).length} orang`}
            action={
              <button type="button" onClick={addMemberRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-purple bg-white hover:bg-brand-purple/5 border border-brand-purple/20 rounded-lg transition-colors shrink-0">
                <Plus size={14} /> Tambah Anggota
              </button>
            }
          >
            <div className="space-y-2">
              {members.map((m, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-2 rounded-xl bg-white/70 border border-brand-purple/10">
                  <span className="w-7 h-7 rounded-full bg-brand-purple/10 text-brand-purple text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                  <input type="text" placeholder="Nama Lengkap" value={m.nama_lengkap} onChange={e => updateMemberRow(idx, 'nama_lengkap', e.target.value)} className={cn(inputClass, 'sm:flex-[2]')} />
                  <input type="text" placeholder="ID Karyawan" value={m.id_karyawan} onChange={e => updateMemberRow(idx, 'id_karyawan', e.target.value)} className={cn(inputClass, 'sm:flex-1')} />
                  <input type="text" placeholder="Jabatan / Posisi" value={m.jabatan} onChange={e => updateMemberRow(idx, 'jabatan', e.target.value)} className={cn(inputClass, 'sm:flex-1')} />
                  <button type="button" onClick={() => removeMemberRow(idx)} disabled={members.length <= 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="Hapus baris">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            no={3}
            title="Rincian Berkas / Dokumen yang Dicari / Diambil"
            subtitle="Minimal 1 dokumen"
            action={
              <button type="button" onClick={addItemRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-purple bg-white hover:bg-brand-purple/5 border border-brand-purple/20 rounded-lg transition-colors shrink-0">
                <Plus size={14} /> Tambah Dokumen
              </button>
            }
          >
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-2 rounded-xl bg-white/70 border border-brand-purple/10">
                  <span className="w-7 h-7 rounded-full bg-brand-purple/10 text-brand-purple text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                  <input type="text" placeholder="Jenis Dokumen" value={it.jenis_dokumen} onChange={e => updateItemRow(idx, 'jenis_dokumen', e.target.value)} className={cn(inputClass, 'sm:flex-[2]')} />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Tahun"
                    value={it.tahun}
                    maxLength={4}
                    onChange={e => updateItemRow(idx, 'tahun', e.target.value.replace(/\D/g, ''))}
                    className={cn(inputClass, 'sm:max-w-[100px]')}
                  />
                  <input type="text" placeholder="No. Dokumen / Kardus" value={it.nomor_dokumen} onChange={e => updateItemRow(idx, 'nomor_dokumen', e.target.value)} className={cn(inputClass, 'sm:flex-1')} />
                  <input type="text" placeholder="Keterangan / Status" value={it.keterangan} onChange={e => updateItemRow(idx, 'keterangan', e.target.value)} className={cn(inputClass, 'sm:flex-1')} />
                  <button type="button" onClick={() => removeItemRow(idx)} disabled={items.length <= 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="Hapus baris">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          <p className="flex items-start gap-2 text-xs text-brand-purple/70 bg-white/50 border border-white/60 rounded-xl p-3">
            <Info size={14} className="shrink-0 mt-0.5" />
            No. Kunjungan dibuat otomatis saat form disimpan. Tanda tangan "Diajukan Oleh (Petugas/GA)" pada dokumen cetak memakai nama pemohon. Tanda tangan lain ditandatangani secara fisik.
          </p>

          <div className="sticky bottom-4 z-10 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 p-3 flex justify-end gap-3">
            <button type="button" onClick={() => setView('list')} className="btn-cancel">Batal</button>
            <button type="submit" disabled={isSubmitting || loadingPeople} className="px-6 py-2.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
              <span>Simpan Form</span>
            </button>
          </div>
        </form>
      )}

      {view === 'detail' && selectedRequest && (
        <div className="space-y-4">
          {/* Header detail */}
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <button onClick={() => setView('list')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg shadow-sm transition-colors mb-3">
                <ArrowLeft size={16} /> Kembali ke Daftar
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-xl font-bold text-brand-purple">Kunjungan {selectedRequest.no_kunjungan}</h4>
                <StatusBadge status={selectedRequest.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-brand-purple">
                <span className="flex items-center gap-1.5"><User size={14} /> {selectedRequest.nama_pemohon}</span>
                <span className="flex items-center gap-1.5"><Calendar size={14} /> {formatTanggalDDMMMYYYY(selectedRequest.tanggal_kunjungan)}</span>
                <span className="flex items-center gap-1.5"><Clock size={14} /> {formatWaktu(selectedRequest)}</span>
                <span className="flex items-center gap-1.5"><MapPin size={14} /> {selectedRequest.lokasi_gudang || '-'}</span>
              </div>
            </div>
            <button onClick={() => generatePDFPreview(selectedRequest ?? undefined, detailMembers, detailItems)} disabled={isSubmitting} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-purple hover:bg-brand-purple-light text-white rounded-xl shadow-md text-sm font-semibold transition-colors disabled:opacity-50 shrink-0">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              <span>Preview Surat Permohonan (PDF)</span>
            </button>
          </div>

          {loadingDetail ? (
            <div className="py-12 text-center">
              <Loader2 className="animate-spin mx-auto text-brand-purple mb-2" size={32} />
              <p className="text-brand-purple">Memuat detail...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* Kolom kiri: informasi, anggota, rincian + verifikasi */}
              <div className="lg:col-span-2 space-y-4">
                <SectionCard icon={<FileText size={16} />} title="Informasi Kunjungan">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {([
                      ['Tujuan Kunjungan', selectedRequest.tujuan_kunjungan === 'Lainnya' ? `Lainnya: ${selectedRequest.tujuan_lainnya || '-'}` : (selectedRequest.tujuan_kunjungan || '-')],
                      ['Lokasi Gudang', selectedRequest.lokasi_gudang || '-'],
                      ['Pemohon', selectedRequest.nama_pemohon],
                      ['Divisi / Jabatan Pemohon', `${selectedRequest.divisi_pemohon || '-'} / ${selectedRequest.jabatan_pemohon || '-'}`],
                      ['Pendamping', selectedRequest.pendamping_nama || '-'],
                      ['Divisi Pendamping', selectedRequest.pendamping_divisi || '-'],
                      ['Jumlah Personil', `${selectedRequest.jumlah_personil} orang`],
                      ['Dibuat Oleh', selectedRequest.created_by_name || '-'],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs font-semibold text-brand-purple/60 uppercase tracking-wide">{label}</dt>
                        <dd className="font-medium text-brand-purple mt-0.5">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </SectionCard>

                <SectionCard icon={<Users size={16} />} title="Anggota Tim / Pengunjung" subtitle={`${detailMembers.length} orang`}>
                  {detailMembers.length === 0 ? (
                    <p className="text-sm text-brand-purple/60">Tidak ada anggota tim tercatat.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-brand-purple/10">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="bg-brand-purple/5 text-xs font-semibold text-brand-purple uppercase">
                            <th className="py-2 px-3">No.</th>
                            <th className="py-2 px-3">Nama Lengkap</th>
                            <th className="py-2 px-3">ID Karyawan</th>
                            <th className="py-2 px-3">Jabatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-purple/5 text-brand-purple">
                          {detailMembers.map((m, i) => (
                            <tr key={m.id}>
                              <td className="py-2 px-3">{i + 1}</td>
                              <td className="py-2 px-3 font-medium">{m.nama_lengkap}</td>
                              <td className="py-2 px-3">{m.id_karyawan || '-'}</td>
                              <td className="py-2 px-3">{m.jabatan || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  icon={<ClipboardCheck size={16} />}
                  title="Rincian Berkas & Verifikasi"
                  subtitle={logbook ? `${decidedCount}/${totalChecks} item sudah diputuskan` : 'Data verifikasi hanya bisa dilihat Admin/SPV'}
                  action={canEditTemuan && !temuanDraft ? (
                    <button
                      type="button"
                      onClick={() => setTemuanDraft({ ...emptyItem })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-colors shrink-0"
                    >
                      <Plus size={14} /> Tambah Temuan Lapangan
                    </button>
                  ) : undefined}
                >
                  <div className="space-y-2">
                    {detailItems.map((it, i) => {
                      const check = logbookChecks.find(c => c.request_item_id === it.id);
                      const isEditing = editingTemuanId === it.id;
                      return (
                        <div
                          key={it.id}
                          className={cn(
                            'rounded-xl border p-3',
                            it.is_temuan_lapangan ? 'border-orange-200 bg-orange-50/60' : 'border-brand-purple/10 bg-white/70'
                          )}
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <input type="text" placeholder="Jenis Dokumen" value={temuanEditDraft.jenis_dokumen} onChange={e => setTemuanEditDraft({ ...temuanEditDraft, jenis_dokumen: e.target.value })} className={cn(inputClass, 'sm:col-span-2')} />
                                <input type="text" inputMode="numeric" maxLength={4} placeholder="Tahun" value={temuanEditDraft.tahun} onChange={e => setTemuanEditDraft({ ...temuanEditDraft, tahun: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                                <input type="text" placeholder="No. Dokumen / Kardus" value={temuanEditDraft.nomor_dokumen} onChange={e => setTemuanEditDraft({ ...temuanEditDraft, nomor_dokumen: e.target.value })} className={inputClass} />
                                <input type="text" placeholder="Keterangan" value={temuanEditDraft.keterangan} onChange={e => setTemuanEditDraft({ ...temuanEditDraft, keterangan: e.target.value })} className={cn(inputClass, 'sm:col-span-4')} />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditingTemuanId(null)} className="btn-cancel">Batal</button>
                                <button type="button" onClick={() => saveTemuanEdit(it)} disabled={savingTemuan} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg disabled:opacity-50">
                                  {savingTemuan ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col md:flex-row md:items-start gap-3">
                                <span className="w-7 h-7 rounded-full bg-brand-purple/10 text-brand-purple text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-bold text-brand-purple">{it.jenis_dokumen}</p>
                                    {it.is_temuan_lapangan && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                        <NotebookPen size={11} /> Temuan Lapangan
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-brand-purple/70 mt-0.5">
                                    Tahun {it.tahun || '-'} · No. {it.nomor_dokumen || '-'} · {it.keterangan || 'Tanpa keterangan'}
                                  </p>
                                  {it.is_temuan_lapangan && it.ditambahkan_oleh && (
                                    <p className="text-[11px] text-orange-700/80 mt-0.5">Ditambahkan oleh {it.ditambahkan_oleh}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {canManage && check ? (
                                    <VerificationSegment value={check.verification_status} onChange={s => setItemVerificationStatus(check, s)} />
                                  ) : check ? (
                                    <VerificationBadge status={check.verification_status} />
                                  ) : null}
                                  {it.is_temuan_lapangan && canEditTemuan && (
                                    <>
                                      <button type="button" onClick={() => startEditTemuan(it)} title="Edit temuan" className="p-1.5 text-brand-purple hover:bg-brand-purple/10 rounded-lg">
                                        <Pencil size={14} />
                                      </button>
                                      <button type="button" onClick={() => deleteTemuan(it)} disabled={savingTemuan} title="Hapus temuan" className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {canManage && check && (
                                <input
                                  type="text"
                                  placeholder="Catatan verifikasi (opsional)"
                                  value={check.verified_note || ''}
                                  onChange={e => updateItemNote(check, e.target.value)}
                                  onBlur={() => saveItemNote(check)}
                                  className={cn(inputClass, 'mt-2 text-xs py-1.5 md:ml-10 md:w-[calc(100%-2.5rem)]')}
                                />
                              )}
                              {!canManage && check?.verified_note && (
                                <p className="text-xs text-brand-purple/70 mt-2 md:ml-10">Catatan: {check.verified_note}</p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}

                    {temuanDraft && (
                      <div className="rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/60 p-3 space-y-2">
                        <p className="text-sm font-bold text-orange-700 flex items-center gap-1.5"><NotebookPen size={14} /> Temuan Lapangan Baru</p>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input type="text" autoFocus placeholder="Jenis Dokumen *" value={temuanDraft.jenis_dokumen} onChange={e => setTemuanDraft({ ...temuanDraft, jenis_dokumen: e.target.value })} className={cn(inputClass, 'sm:col-span-2')} />
                          <input type="text" inputMode="numeric" maxLength={4} placeholder="Tahun" value={temuanDraft.tahun} onChange={e => setTemuanDraft({ ...temuanDraft, tahun: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                          <input type="text" placeholder="No. Dokumen / Kardus" value={temuanDraft.nomor_dokumen} onChange={e => setTemuanDraft({ ...temuanDraft, nomor_dokumen: e.target.value })} className={inputClass} />
                          <input type="text" placeholder="Keterangan kondisi di lapangan" value={temuanDraft.keterangan} onChange={e => setTemuanDraft({ ...temuanDraft, keterangan: e.target.value })} className={cn(inputClass, 'sm:col-span-4')} />
                        </div>
                        <p className="text-[11px] text-orange-700/80">Temuan lapangan dicatat di logbook verifikasi dan tidak ikut dicetak di surat permohonan.</p>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setTemuanDraft(null)} className="btn-cancel">Batal</button>
                          <button type="button" onClick={addTemuan} disabled={savingTemuan} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50">
                            {savingTemuan ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan Temuan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* Kolom kanan: progress, logbook, tanda tangan */}
              <div className="space-y-4 lg:sticky lg:top-4">
                {logbook && (
                  <div className="bg-gradient-to-br from-brand-purple to-brand-purple-light text-white rounded-3xl shadow-lg p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Progress Verifikasi</p>
                    <p className="text-3xl font-bold mt-1">{decidedCount}<span className="text-lg text-white/60"> / {totalChecks} item</span></p>
                    <div className="h-2 rounded-full bg-white/20 overflow-hidden mt-3">
                      <div className="h-full rounded-full bg-orange-400 transition-all" style={{ width: `${totalChecks ? (decidedCount / totalChecks) * 100 : 0}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="rounded-xl bg-white/10 py-2">
                        <p className="text-lg font-bold">{sesuaiCount}</p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Sesuai</p>
                      </div>
                      <div className="rounded-xl bg-white/10 py-2">
                        <p className="text-lg font-bold">{tidakSesuaiCount}</p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Tidak Sesuai</p>
                      </div>
                      <div className="rounded-xl bg-white/10 py-2">
                        <p className="text-lg font-bold">{totalChecks - decidedCount}</p>
                        <p className="text-[10px] uppercase tracking-wide text-white/70">Pending</p>
                      </div>
                    </div>
                  </div>
                )}

                <SectionCard icon={<ShieldCheck size={16} />} title="Logbook Kunjungan">
                  {!logbook ? (
                    <p className="text-sm text-brand-purple/60">Logbook hanya dapat dilihat Admin/SPV.</p>
                  ) : logbook.is_completed ? (
                    <div className="text-sm text-brand-purple space-y-2">
                      <p className="flex items-center gap-2">
                        <span className="font-semibold">Status:</span>
                        <span className={cn(
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border',
                          STATUS_KUNJUNGAN_STYLE[logbook.status_kunjungan || ''] || 'bg-gray-100 text-gray-700 border-gray-300'
                        )}>
                          {logbook.status_kunjungan || '-'}
                        </span>
                      </p>
                      <p><span className="font-semibold">GA Verificator:</span> {logbook.ga_verificator_name}</p>
                      <p><span className="font-semibold">Tanggal Verifikasi:</span> {formatTanggalDDMMMYYYY(logbook.tanggal_verifikasi)}</p>
                      <p><span className="font-semibold">Keterangan:</span> {logbook.keterangan || '-'}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Field label="Status Kunjungan">
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['Masuk', 'Keluar', 'Periksa'] as const).map(s => (
                            <button
                              key={s}
                              type="button"
                              disabled={!canManage}
                              onClick={() => setLogbookStatus(s)}
                              className={cn(
                                'px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:cursor-not-allowed',
                                logbookStatus === s ? STATUS_KUNJUNGAN_STYLE[s] : 'bg-white text-brand-purple/60 border-brand-purple/15 hover:bg-brand-purple/5'
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="GA Verificator">
                        <input type="text" disabled value={profile?.full_name || '-'} className={cn(inputClass, 'bg-gray-50')} />
                      </Field>
                      <Field label="Keterangan">
                        <textarea rows={2} value={logbookKeterangan} onChange={e => setLogbookKeterangan(e.target.value)} disabled={!canManage} className={cn(inputClass, 'disabled:bg-gray-50')} placeholder="Catatan tambahan (opsional)" />
                      </Field>
                      {canManage && (
                        <div className="flex flex-col gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => saveLogbook(true)}
                            disabled={isSubmitting || decidedCount < totalChecks}
                            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            title={decidedCount < totalChecks ? 'Putuskan status semua item dulu' : undefined}
                          >
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                            <span>Selesaikan Verifikasi</span>
                          </button>
                          <button type="button" onClick={() => saveLogbook(false)} disabled={isSubmitting} className="btn-cancel w-full">
                            Simpan Sementara
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </SectionCard>

                {canManage && (
                  <SectionCard icon={<Pencil size={16} />} title="Nama Tanda Tangan PDF" subtitle="Tanggal muncul otomatis saat PDF dicetak">
                    <div className="space-y-3">
                      <Field label="Diketahui Oleh (Pemohon/Depart)">
                        <input type="text" value={signNames.diketahui_oleh_nama} onChange={e => setSignNames({ ...signNames, diketahui_oleh_nama: e.target.value })} className={inputClass} placeholder="Nama yang mengetahui" />
                      </Field>
                      <Field label="Disetujui (Direktur)">
                        <input type="text" value={signNames.disetujui_oleh_nama} onChange={e => setSignNames({ ...signNames, disetujui_oleh_nama: e.target.value })} className={inputClass} placeholder="Nama Direktur" />
                      </Field>
                      <button type="button" onClick={saveSignNames} disabled={savingSignNames} className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-xl shadow-sm transition-colors disabled:opacity-50">
                        {savingSignNames ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Simpan Nama
                      </button>
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          )}
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
