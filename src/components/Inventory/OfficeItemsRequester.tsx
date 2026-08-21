import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import { useToast } from '../UI/Toast';
import SignedImage from '../UI/SignedImage';
import { getSignedUrls, getSignedUrl } from '../../lib/signedStorage';
import { generateDailyDocNumber } from '../../lib/utils';
import { Item, SPKRequest, SPKRequestItem, FlagDef } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import {
  Search, X, Loader2, ShoppingCart, CheckSquare, Square, Package,
  ChevronLeft, ChevronRight, ClipboardList, Calendar, AlertCircle, Eye,
  Tag, AlertTriangle, Star, CheckCircle2, Flag as FlagIcon, Zap, ShieldAlert, Info, MapPin, UserCheck,
  Download, Circle, XCircle
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Daftar lokasi tujuan pengambilan barang SPK — tambahkan di sini kalau ada
// lokasi baru.
const LOKASI_TUJUAN_OPTIONS = ['Belawan'];

const FLAG_COLOR_STYLES: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
};

const FLAG_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  tag: Tag,
  warning: AlertTriangle,
  star: Star,
  check: CheckCircle2,
  flag: FlagIcon,
  zap: Zap,
  info: Info,
  shield: ShieldAlert,
};

export default function OfficeItemsRequester() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'items' | 'history'>('items');

  // Items list state
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterLokasi, setFilterLokasi] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [flagCatalog, setFlagCatalog] = useState<FlagDef[]>([]);

  // SPK submit modal
  const [isSPKModalOpen, setIsSPKModalOpen] = useState(false);
  const [spkKeterangan, setSpkKeterangan] = useState('');
  const [spkLokasiTujuan, setSpkLokasiTujuan] = useState('');
  const [isSubmittingSPK, setIsSubmittingSPK] = useState(false);

  // History tab state
  type SPKRequestWithItemsSummary = SPKRequest & { spk_request_items?: { nama_kategori: string | null; nama_lokasi: string | null }[] };
  const [myRequests, setMyRequests] = useState<SPKRequestWithItemsSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SPKRequest | null>(null);
  const [requestItems, setRequestItems] = useState<SPKRequestItem[]>([]);
  const [loadingRequestItems, setLoadingRequestItems] = useState(false);

  // Item detail modal (+ foto besar)
  const [selectedItemDetail, setSelectedItemDetail] = useState<Item | null>(null);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  // Supaya tombol/gesture "Kembali" di mobile menutup modal, bukan keluar aplikasi
  useModalBackButton(isSPKModalOpen, () => setIsSPKModalOpen(false));
  useModalBackButton(!!selectedRequest, () => setSelectedRequest(null));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchFilterOptions();
    fetchFlagCatalog();
  }, []);

  useEffect(() => {
    if (tab === 'items') {
      fetchItems();
    } else {
      fetchMyRequests();
    }
  }, [tab, page, debouncedSearch, filterKategori, filterLokasi]);

  async function fetchFilterOptions() {
    // Opsi filter diturunkan dari barang Office yang benar-benar ada saja
    // (bukan dari seluruh tabel categories/master_lokasi), supaya requester
    // tidak lihat kategori/lokasi/flag yang tidak relevan buat mereka.
    try {
      const { data, error } = await supabase
        .from('items')
        .select('kategori_id, kode_lokasi, flags, categories(nama_kategori), master_lokasi(nama_lokasi)')
        .eq('sifat_barang', 'REUSABLE');
      if (error) throw error;

      const catMap = new Map<string, string>();
      const locMap = new Map<string, string>();

      (data || []).forEach((item: any) => {
        if (item.kategori_id && item.categories?.nama_kategori) {
          catMap.set(item.kategori_id, item.categories.nama_kategori);
        }
        if (item.kode_lokasi && item.master_lokasi?.nama_lokasi) {
          locMap.set(item.kode_lokasi, item.master_lokasi.nama_lokasi);
        }
      });

      setCategories(
        Array.from(catMap, ([id, nama_kategori]) => ({ id, nama_kategori }))
          .sort((a, b) => a.nama_kategori.localeCompare(b.nama_kategori))
      );
      setLocations(
        Array.from(locMap, ([kode_lokasi, nama_lokasi]) => ({ kode_lokasi, nama_lokasi }))
          .sort((a, b) => a.nama_lokasi.localeCompare(b.nama_lokasi))
      );
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }

  async function fetchFlagCatalog() {
    try {
      const { data, error } = await supabase.from('item_flag_defs').select('*').order('nama_flag');
      if (error) throw error;
      setFlagCatalog(data || []);
    } catch (err) {
      console.error('Error fetching flag catalog:', err);
    }
  }

  function getFlagStyle(name: string) {
    const def = flagCatalog.find((f) => f.nama_flag.toLowerCase() === name.toLowerCase());
    const colorKey = def?.color && FLAG_COLOR_STYLES[def.color] ? def.color : 'teal';
    const iconKey = def?.icon && FLAG_ICON_MAP[def.icon] ? def.icon : 'tag';
    return { classes: FLAG_COLOR_STYLES[colorKey], Icon: FLAG_ICON_MAP[iconKey] };
  }

  async function fetchItems() {
    setLoading(true);
    try {
      let query = supabase
        .from('items')
        .select('*, master_lokasi(nama_lokasi), categories(nama_kategori), master_kepemilikan(nama_pemilik)', { count: 'exact' })
        .eq('sifat_barang', 'REUSABLE');

      if (debouncedSearch) {
        query = query.or(`nama_barang.ilike.%${debouncedSearch}%,kode_barang.ilike.%${debouncedSearch}%,deskripsi.ilike.%${debouncedSearch}%`);
      }
      if (filterKategori) {
        query = query.eq('kategori_id', filterKategori);
      }
      if (filterLokasi) {
        query = query.eq('kode_lokasi', filterLokasi);
      }

      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, count, error } = await query.order('nama_barang', { ascending: true }).range(from, to);
      if (error) throw error;

      setItems(data || []);
      setTotalCount(count || 0);
      setSelectedItems([]);
    } catch (err: any) {
      console.error('Error fetching office items:', err);
      showToast(err.message || 'Gagal mengambil daftar barang', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyRequests() {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('spk_requests')
        .select('*, spk_request_items(nama_kategori, nama_lokasi)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching my SPK requests:', err);
      showToast(err.message || 'Gagal mengambil riwayat pengajuan', 'error');
    } finally {
      setLoadingHistory(false);
    }
  }

  async function fetchRequestItems(requestId: string) {
    setLoadingRequestItems(true);
    try {
      const { data, error } = await supabase
        .from('spk_request_items')
        .select('*, items(master_lokasi(nama_lokasi), categories(nama_kategori), master_kepemilikan(nama_pemilik))')
        .eq('request_id', requestId);

      if (error) throw error;
      setRequestItems(data || []);
    } catch (err: any) {
      showToast('Gagal memuat detail barang', 'error');
    } finally {
      setLoadingRequestItems(false);
    }
  }

  const handleViewRequestDetail = (req: SPKRequest) => {
    setSelectedRequest(req);
    fetchRequestItems(req.id);
  };

  const handleOpenCarousel = async (images: string[], index: number) => {
    const signedMap = await getSignedUrls('item-photos', images);
    setCurrentCarouselIndex(index);
    setCarouselImages(images.map((url) => signedMap[url] || url));
  };

  const getBase64ImageFromUrl = async (imageUrl: string) => {
    try {
      const signedUrl = await getSignedUrl('item-photos', imageUrl);
      if (!signedUrl) return null;
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  const downloadSPKPDF = async () => {
    if (!selectedRequest) return;

    setIsDownloadingPDF(true);
    showToast('Sedang menyiapkan dokumen...', 'info');

    try {
      const doc = new jsPDF();

      const itemsToPrint = requestItems.filter(i => i.status_item !== 'REJECTED');

      if (itemsToPrint.length === 0) {
        showToast('Tidak ada item yang disetujui untuk dicetak', 'error');
        setIsDownloadingPDF(false);
        return;
      }

      const addLogo = async (doc: jsPDF, x: number, y: number) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const imgWidth = img.width;
            const imgHeight = img.height;
            canvas.width = imgWidth;
            canvas.height = imgHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, imgWidth, imgHeight);
              ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
              const dataUrl = canvas.toDataURL('image/png', 1.0);
              const pdfHeight = 16;
              const pdfWidth = (imgWidth / imgHeight) * pdfHeight;
              doc.addImage(dataUrl, 'PNG', x, y, pdfWidth, pdfHeight);
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = '/logo.png';
        });
      };

      let currentY = 20;
      const lineSpacing = 8;
      const pageHeight = doc.internal.pageSize.getHeight();

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > pageHeight - 20) {
          doc.addPage();
          currentY = 20;
          return true;
        }
        return false;
      };

      for (let i = 0; i < itemsToPrint.length; i++) {
        if (i > 0) {
          doc.addPage();
        }

        currentY = 20;

        const item = itemsToPrint[i];

        await addLogo(doc, 14, 14);
        currentY = 55;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SURAT JALAN', 105, currentY, { align: 'center' });
        currentY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nomor Permintaan : ${selectedRequest.nomor_spk}`, 105, currentY, { align: 'center' });
        currentY += 18;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        const kategoriName = item.nama_kategori || (item as any).items?.categories?.nama_kategori || 'Tanpa Kategori';
        const lokasiName = item.nama_lokasi || (item as any).items?.master_lokasi?.nama_lokasi || item.kode_lokasi || 'Tanpa Lokasi';

        doc.text('Kode Barang', 14, currentY);
        doc.text(`: ${item.kode_barang}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Kategori Barang', 14, currentY);
        doc.text(`: ${kategoriName}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Lokasi Barang', 14, currentY);
        doc.text(`: ${lokasiName}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Nama Barang', 14, currentY);
        doc.text(`: ${item.nama_barang}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Lokasi Tujuan', 14, currentY);
        doc.text(`: ${selectedRequest.lokasi_tujuan || '-'}`, 65, currentY, { maxWidth: 130 });
        currentY += lineSpacing;

        doc.text('Alasan Penggunaan', 14, currentY);
        doc.text(`: ${selectedRequest.keterangan || '-'}`, 65, currentY, { maxWidth: 130 });
        currentY += lineSpacing * 2;

        doc.text('Tanggal Permintaan', 14, currentY);
        doc.text(`: ${new Date(selectedRequest.tanggal_pengajuan || selectedRequest.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`, 65, currentY);
        currentY += lineSpacing * 3;

        doc.text('Dokumentasi Barang', 14, currentY);
        doc.text(':', 65, currentY);

        currentY += lineSpacing;

        const photoUrls = item.foto_urls && item.foto_urls.length > 0 ? item.foto_urls : ((item as any).items?.foto_urls || []);
        if (photoUrls && photoUrls.length > 0) {
          try {
            let photoSize = 40;
            let maxPerRow = 4;

            if (photoUrls.length > 8) {
              photoSize = 20;
              maxPerRow = 7;
            } else if (photoUrls.length > 3) {
              photoSize = 30;
              maxPerRow = 5;
            }

            const photoGap = 5;
            let currentPhotoX = 14;

            for (let i = 0; i < photoUrls.length; i++) {
              if (i > 0 && i % maxPerRow === 0) {
                currentPhotoX = 14;
                currentY += photoSize + photoGap;
                checkPageBreak(photoSize + photoGap);
              }
              const base64Img = await getBase64ImageFromUrl(photoUrls[i]);
              if (base64Img) {
                doc.addImage(base64Img as string, 'JPEG', currentPhotoX, currentY, photoSize, photoSize);
                currentPhotoX += photoSize + photoGap;
              }
            }
            currentY += photoSize + photoGap;
          } catch (e) {
            doc.text('(Gagal memuat beberapa foto)', 14, currentY + 5);
            currentY += lineSpacing;
          }
        } else {
          doc.text('(Tidak ada foto)', 14, currentY);
          currentY += lineSpacing;
        }

        checkPageBreak(60);
        currentY += 25;

        const currentDate = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`Medan, ${currentDate}`, 14, currentY);

        currentY += 20;

        doc.setFontSize(9);
        doc.text('Yang mengajukan', 14, currentY);
        doc.text('Diketahui Admin,', 62, currentY);
        doc.text('Diketahui Auditor,', 108, currentY);
        doc.text('Disetujui SPV,', 155, currentY);
        doc.setFontSize(11);

        currentY += 25;

        doc.setFontSize(8);
        doc.text(`(${selectedRequest.diajukan_oleh})`, 14, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.diketahui_admin_oleh || '..................'})`, 62, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.diketahui_auditor_oleh || '..................'})`, 108, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.approved_by_l1 || '..................'})`, 155, currentY, { maxWidth: 40 });
        doc.setFontSize(11);
      }

      doc.save(`SPK_${selectedRequest.nomor_spk}.pdf`);
    } catch (e) {
      showToast('Terjadi kesalahan saat membuat PDF', 'error');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedItems(prev => prev.length === items.length ? [] : items.map(i => i.id));
  };

  const submitSPK = async () => {
    if (selectedItems.length === 0 || !spkKeterangan.trim() || !spkLokasiTujuan.trim()) return;
    setIsSubmittingSPK(true);
    try {
      const nomorSpk = await generateDailyDocNumber('spk_requests', 'nomor_spk', 'SPK');
      const reqRes = await supabase.from('spk_requests').insert({
        nomor_spk: nomorSpk,
        diajukan_oleh: profile?.full_name || 'Unknown',
        user_id: user?.id,
        jumlah: selectedItems.length,
        status: 'PENDING_ADMIN',
        keterangan: spkKeterangan,
        lokasi_tujuan: spkLokasiTujuan,
      }).select('id').single();

      if (reqRes.error) throw reqRes.error;
      const requestId = reqRes.data.id;

      const selectedItemDocs = items.filter(i => selectedItems.includes(i.id));
      const insertItems = selectedItemDocs.map(item => ({
        request_id: requestId,
        item_id: item.id,
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        jumlah_barang: item.jumlah_barang,
        kode_lokasi: item.kode_lokasi,
        kepemilikan_id: item.kepemilikan_id,
        nama_kategori: item.categories?.nama_kategori || null,
        nama_lokasi: (item as any).master_lokasi?.nama_lokasi || null,
        foto_urls: item.foto_urls || [],
        status_item: 'PENDING',
      }));

      const itemRes = await supabase.from('spk_request_items').insert(insertItems);
      if (itemRes.error) throw itemRes.error;

      showToast('Pengajuan SPK berhasil dibuat!', 'success');
      setIsSPKModalOpen(false);
      setSpkKeterangan('');
      setSpkLokasiTujuan('');
      setSelectedItems([]);
      fetchItems();
    } catch (err: any) {
      console.error(err);
      showToast('Gagal mengajukan SPK: ' + err.message, 'error');
    } finally {
      setIsSubmittingSPK(false);
    }
  };

  const summarizeRequestField = (req: SPKRequestWithItemsSummary, field: 'nama_kategori' | 'nama_lokasi') => {
    const values = (req.spk_request_items || []).map((i) => i[field]).filter((v): v is string => !!v);
    const unique = Array.from(new Set(values));
    return unique.length > 0 ? unique.join(', ') : '-';
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const statusBadge = (status: SPKRequest['status']) => (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
      status === 'PENDING_ADMIN' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
      status === 'PENDING_AUDITOR' ? "bg-amber-50 text-amber-700 border-amber-200" :
      status === 'PENDING_SPV' ? "bg-blue-50 text-blue-700 border-blue-200" :
      status === 'APPROVED' ? "bg-green-50 text-green-700 border-green-200" :
      "bg-red-50 text-red-700 border-red-200"
    )}>
      {status === 'PENDING_ADMIN' ? 'Menunggu Diketahui Admin' :
       status === 'PENDING_AUDITOR' ? 'Menunggu Diketahui Auditor' :
       status === 'PENDING_SPV' ? 'Menunggu Persetujuan SPV' :
       status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
    </span>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-brand-purple flex items-center space-x-2">
          <ShoppingCart className="text-sky-600" size={24} />
          <span>Barang Office</span>
        </h2>
        <p className="text-brand-purple">Lihat & ajukan pengambilan barang milik kantor</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setTab('items')}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0",
            tab === 'items' ? "border-sky-600 text-sky-700" : "border-transparent text-brand-purple hover:text-brand-purple"
          )}
        >
          Daftar Barang
        </button>
        <button
          onClick={() => setTab('history')}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap shrink-0",
            tab === 'history' ? "border-sky-600 text-sky-700" : "border-transparent text-brand-purple hover:text-brand-purple"
          )}
        >
          <ClipboardList size={16} />
          <span>Riwayat Pengajuan Saya</span>
        </button>
      </div>

      {tab === 'items' ? (
        <>
          {/* Filters */}
          <div className="bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-purple" size={18} />
              <input
                type="text"
                placeholder="Cari nama, kode, atau deskripsi barang..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
              />
            </div>
            <div className="md:w-52 shrink-0">
              <select
                value={filterKategori}
                onChange={(e) => { setFilterKategori(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm bg-white font-medium"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nama_kategori}</option>
                ))}
              </select>
            </div>
            <div className="md:w-52 shrink-0">
              <select
                value={filterLokasi}
                onChange={(e) => { setFilterLokasi(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm bg-white font-medium"
              >
                <option value="">Semua Lokasi</option>
                {locations.map((loc) => (
                  <option key={loc.kode_lokasi} value={loc.kode_lokasi}>{loc.nama_lokasi}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedItems.length > 0 && (
            <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-300">
              <span className="text-sky-700 font-medium">{selectedItems.length} barang terpilih</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSPKModalOpen(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600 text-white rounded-lg shadow-sm font-semibold text-sm"
                >
                  <ShoppingCart size={16} />
                  <span>Ajukan SPK Pengambilan</span>
                </button>
                <button onClick={() => setSelectedItems([])} className="text-sky-400 hover:text-sky-600 shrink-0">
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                    <th className="px-6 py-4 w-10">
                      <button onClick={toggleSelectAll} className="text-brand-purple hover:text-sky-600 transition-colors">
                        {selectedItems.length === items.length && items.length > 0 ? <CheckSquare size={20} className="text-sky-600" /> : <Square size={20} />}
                      </button>
                    </th>
                    <th className="px-6 py-4">Foto</th>
                    <th className="px-6 py-4">Nama Barang</th>
                    <th className="px-6 py-4">Kategori</th>
                    <th className="px-6 py-4">Lokasi</th>
                    <th className="px-6 py-4">Kepemilikan</th>
                    <th className="px-6 py-4">Flags</th>
                    <th className="px-6 py-4">Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
                        <p className="text-brand-purple">Memuat data...</p>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Package className="mx-auto text-brand-purple mb-2" size={48} />
                        <p className="text-brand-purple">Tidak ada barang Office ditemukan</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItemDetail(item)}
                        className={cn("hover:bg-gray-50 transition-colors cursor-pointer", selectedItems.includes(item.id) && "bg-sky-50/50")}
                      >
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleSelectItem(item.id)} className="text-brand-purple hover:text-sky-600 transition-colors">
                            {selectedItems.includes(item.id) ? <CheckSquare size={20} className="text-sky-600" /> : <Square size={20} />}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {item.foto_urls && item.foto_urls.length > 0 ? (
                            <SignedImage bucket="item-photos" path={item.foto_urls[0]} alt={item.nama_barang} className="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-sm" />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-brand-purple border border-gray-100">
                              <Package size={20} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-brand-purple">{item.nama_barang}</div>
                          <div className="text-xs text-brand-purple font-mono">{item.kode_barang}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
                            {(item as any).categories?.nama_kategori || 'Tanpa Kategori'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {(item as any).master_lokasi?.nama_lokasi || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-brand-purple">
                          {(item as any).master_kepemilikan?.nama_pemilik || '-'}
                        </td>
                        <td className="px-6 py-4">
                          {item.flags && item.flags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {item.flags.slice(0, 2).map((flag) => {
                                const { classes, Icon } = getFlagStyle(flag);
                                return (
                                  <span key={flag} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", classes)}>
                                    <Icon size={9} className="shrink-0" />
                                    {flag}
                                  </span>
                                );
                              })}
                              {item.flags.length > 2 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-brand-purple border border-gray-200">
                                  +{item.flags.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-brand-purple">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-brand-purple">{item.jumlah_barang}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-brand-purple">
                Menampilkan <span className="font-medium">{totalCount === 0 ? 0 : (page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> barang
              </p>
              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm text-brand-purple px-2">{page} / {totalPages}</span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Nomor SPK</th>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4">Jumlah</th>
                  <th className="px-6 py-4">Kategori</th>
                  <th className="px-6 py-4">Lokasi Asal</th>
                  <th className="px-6 py-4">Lokasi Tujuan</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
                      <p className="text-brand-purple">Memuat riwayat...</p>
                    </td>
                  </tr>
                ) : myRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <ClipboardList className="mx-auto text-brand-purple mb-2" size={48} />
                      <p className="text-brand-purple">Belum ada pengajuan SPK.</p>
                    </td>
                  </tr>
                ) : (
                  myRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleViewRequestDetail(req)}>
                      <td className="px-6 py-4 font-semibold text-brand-purple">{req.nomor_spk}</td>
                      <td className="px-6 py-4 text-sm text-brand-purple flex items-center">
                        <Calendar size={14} className="mr-1.5 text-brand-purple" />
                        {new Date(req.tanggal_pengajuan || req.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-brand-purple font-medium">{req.jumlah || '-'} barang</td>
                      <td className="px-6 py-4 text-sm text-brand-purple">{summarizeRequestField(req, 'nama_kategori')}</td>
                      <td className="px-6 py-4 text-sm text-brand-purple">{summarizeRequestField(req, 'nama_lokasi')}</td>
                      <td className="px-6 py-4 text-sm text-brand-purple">{req.lokasi_tujuan || '-'}</td>
                      <td className="px-6 py-4">{statusBadge(req.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-lg text-sm font-medium transition-colors border border-sky-100">
                          <Eye size={16} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SPK Submit Modal */}
      {isSPKModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-sky-50/50 shrink-0">
              <div className="flex items-center space-x-2 text-sky-700">
                <ShoppingCart size={20} />
                <h3 className="text-lg font-bold">Ajukan SPK Pengambilan Barang</h3>
              </div>
              <button
                onClick={() => !isSubmittingSPK && setIsSPKModalOpen(false)}
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
                disabled={isSubmittingSPK}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 flex items-start space-x-3">
                <AlertCircle className="text-sky-600 mt-0.5" size={20} />
                <p className="text-xs text-sky-700">
                  Anda akan mengajukan pengambilan <strong>{selectedItems.length} barang</strong>. Barang tidak langsung keluar, menunggu persetujuan (Level 1 dan Level 2).
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-brand-purple">Lokasi Tujuan <span className="text-red-500">*</span></label>
                <select
                  required
                  value={spkLokasiTujuan}
                  onChange={(e) => setSpkLokasiTujuan(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white"
                >
                  <option value="">Pilih lokasi tujuan...</option>
                  {LOKASI_TUJUAN_OPTIONS.map((lokasi) => (
                    <option key={lokasi} value={lokasi}>{lokasi}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-brand-purple">Keterangan / Keperluan <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={4}
                  value={spkKeterangan}
                  onChange={(e) => setSpkKeterangan(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white"
                  placeholder="Tuliskan keperluan pengambilan barang-barang ini..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsSPKModalOpen(false)}
                disabled={isSubmittingSPK}
                className="px-4 py-2.5 text-sm font-medium text-brand-purple bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={submitSPK}
                disabled={isSubmittingSPK || !spkKeterangan.trim() || !spkLokasiTujuan.trim()}
                className="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600 rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
              >
                {isSubmittingSPK ? <Loader2 className="animate-spin" size={18} /> : <CheckSquare size={18} />}
                <span>Ajukan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Detail Modal */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-brand-purple">{selectedRequest.nomor_spk}</h3>
                <p className="text-xs text-brand-purple mt-0.5">{new Date(selectedRequest.created_at).toLocaleDateString('id-ID')}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-xs font-semibold text-brand-purple uppercase">Status</span>
                {statusBadge(selectedRequest.status)}
              </div>

              {/* Progress Tracker */}
              {(() => {
                const isRejected = selectedRequest.status === 'REJECTED';
                const steps = [
                  { label: 'Diajukan', done: true, by: selectedRequest.diajukan_oleh, at: selectedRequest.tanggal_pengajuan || selectedRequest.created_at },
                  { label: 'Diketahui Admin', done: !!selectedRequest.diketahui_admin_oleh, by: selectedRequest.diketahui_admin_oleh, at: selectedRequest.tanggal_diketahui_admin },
                  { label: 'Diketahui Auditor', done: !!selectedRequest.diketahui_auditor_oleh, by: selectedRequest.diketahui_auditor_oleh, at: selectedRequest.tanggal_diketahui_auditor },
                  { label: 'Disetujui SPV', done: !!selectedRequest.approved_by_l1, by: selectedRequest.approved_by_l1, at: selectedRequest.tanggal_approved_l1 },
                ];
                return (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs font-semibold text-brand-purple uppercase mb-3">Progres Persetujuan</p>
                    <div className="flex items-start">
                      {steps.map((step, idx) => (
                        <React.Fragment key={step.label}>
                          <div className="flex flex-col items-center text-center w-1/4 shrink-0 px-1">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0",
                              step.done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-gray-200 text-brand-purple"
                            )}>
                              {step.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </div>
                            <p className={cn("text-[11px] font-semibold mt-1.5 leading-tight", step.done ? "text-brand-purple" : "text-brand-purple")}>
                              {step.label}
                            </p>
                            {step.done && step.by && (
                              <p className="text-[10px] text-brand-purple mt-0.5 truncate w-full" title={step.by}>{step.by}</p>
                            )}
                            {step.done && step.at && (
                              <p className="text-[10px] text-brand-purple">{new Date(step.at).toLocaleDateString('id-ID')}</p>
                            )}
                          </div>
                          {idx < steps.length - 1 && (
                            <div className={cn("flex-1 h-0.5 mt-4", steps[idx + 1].done ? "bg-emerald-500" : "bg-gray-200")} />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    {isRejected && (
                      <div className="mt-3 flex items-center text-red-600 text-xs font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <XCircle size={14} className="mr-1.5 shrink-0" />
                        Pengajuan ini ditolak sebelum menyelesaikan seluruh tahap persetujuan.
                      </div>
                    )}
                  </div>
                );
              })()}

              {selectedRequest.status === 'APPROVED' && (
                <button
                  onClick={downloadSPKPDF}
                  disabled={isDownloadingPDF || loadingRequestItems}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600 text-white rounded-xl shadow-sm font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {isDownloadingPDF ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                  <span>Download Surat Jalan SPK</span>
                </button>
              )}
              {selectedRequest.lokasi_tujuan && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-brand-purple uppercase mb-1">Lokasi Tujuan</p>
                  <p className="text-sm text-brand-purple">{selectedRequest.lokasi_tujuan}</p>
                </div>
              )}
              {selectedRequest.keterangan && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-brand-purple uppercase mb-1">Keterangan</p>
                  <p className="text-sm text-brand-purple">{selectedRequest.keterangan}</p>
                </div>
              )}

              <h4 className="text-sm font-bold text-brand-purple pt-2">Daftar Barang</h4>
              {loadingRequestItems ? (
                <div className="py-8 text-center">
                  <Loader2 className="animate-spin mx-auto text-sky-600" size={28} />
                </div>
              ) : (
                <div className="space-y-3">
                  {requestItems.map((item) => (
                    <div key={item.id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl">
                      {item.foto_urls && item.foto_urls.length > 0 ? (
                        <SignedImage bucket="item-photos" path={item.foto_urls[0]} alt={item.nama_barang} className="w-12 h-12 rounded-lg object-cover border border-gray-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-brand-purple shrink-0">
                          <Package size={18} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-purple truncate">{item.nama_barang}</p>
                        <p className="text-xs text-brand-purple font-mono">{item.kode_barang}</p>
                      </div>
                      {item.status_item === 'REJECTED' && (
                        <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg shrink-0">Ditolak</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2.5 text-sm font-medium text-brand-purple bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItemDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-brand-purple truncate">{selectedItemDetail.nama_barang}</h3>
                <p className="text-xs text-brand-purple font-mono mt-0.5">{selectedItemDetail.kode_barang}</p>
              </div>
              <button onClick={() => setSelectedItemDetail(null)} className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Foto Besar */}
              {selectedItemDetail.foto_urls && selectedItemDetail.foto_urls.length > 0 ? (
                <div>
                  <button
                    onClick={() => handleOpenCarousel(selectedItemDetail.foto_urls, 0)}
                    className="block w-full aspect-video rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group relative"
                  >
                    <SignedImage
                      bucket="item-photos"
                      path={selectedItemDetail.foto_urls[0]}
                      alt={selectedItemDetail.nama_barang}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-brand-purple/0 group-hover:bg-brand-purple/30 transition-colors flex items-center justify-center">
                      <Eye className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={28} />
                    </div>
                  </button>
                  {selectedItemDetail.foto_urls.length > 1 && (
                    <div className="mt-2 flex items-center space-x-2 overflow-x-auto scrollbar-hide">
                      {selectedItemDetail.foto_urls.map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleOpenCarousel(selectedItemDetail.foto_urls, idx)}
                          className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0 hover:opacity-80 transition-opacity"
                        >
                          <SignedImage bucket="item-photos" path={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full aspect-video rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center text-brand-purple">
                  <Package size={40} />
                  <span className="text-xs mt-2">Tidak ada foto</span>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple uppercase flex items-center"><Tag size={12} className="mr-1" /> Kategori</p>
                  <p className="text-sm font-medium text-brand-purple mt-1">{selectedItemDetail.categories?.nama_kategori || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple uppercase flex items-center"><MapPin size={12} className="mr-1" /> Lokasi</p>
                  <p className="text-sm font-medium text-brand-purple mt-1">{(selectedItemDetail as any).master_lokasi?.nama_lokasi || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple uppercase flex items-center"><UserCheck size={12} className="mr-1" /> Kepemilikan</p>
                  <p className="text-sm font-medium text-brand-purple mt-1">{selectedItemDetail.master_kepemilikan?.nama_pemilik || '-'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple uppercase">Stok</p>
                  <p className="text-sm font-medium text-brand-purple mt-1">{selectedItemDetail.jumlah_barang}</p>
                </div>
              </div>

              {selectedItemDetail.deskripsi && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple uppercase mb-1">Deskripsi</p>
                  <p className="text-sm text-brand-purple">{selectedItemDetail.deskripsi}</p>
                </div>
              )}

              {selectedItemDetail.flags && selectedItemDetail.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedItemDetail.flags.map((flag) => {
                    const { classes, Icon } = getFlagStyle(flag);
                    return (
                      <span key={flag} className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border", classes)}>
                        <Icon size={11} className="shrink-0" />
                        {flag}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <button
                onClick={() => {
                  toggleSelectItem(selectedItemDetail.id);
                  setSelectedItemDetail(null);
                }}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2",
                  selectedItems.includes(selectedItemDetail.id)
                    ? "text-red-600 bg-red-50 hover:bg-red-100 border border-red-200"
                    : "text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200"
                )}
              >
                {selectedItems.includes(selectedItemDetail.id) ? <X size={16} /> : <CheckSquare size={16} />}
                <span>{selectedItems.includes(selectedItemDetail.id) ? 'Batalkan Pilih' : 'Pilih Barang Ini'}</span>
              </button>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="px-4 py-2.5 text-sm font-medium text-brand-purple bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Carousel / Lightbox */}
      {carouselImages.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-purple/90 backdrop-blur-md animate-in fade-in duration-300"
        >
          <div className="relative w-full max-w-5xl h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute top-0 right-0 p-2 text-white/70 hover:text-white transition-colors z-10"
              onClick={() => setCarouselImages([])}
            >
              <X size={32} />
            </button>

            <div className="relative w-full h-[70vh] flex items-center justify-center group">
              {carouselImages.length > 1 && (
                <>
                  <button
                    className="absolute left-2 md:left-4 p-3 bg-brand-purple/20 hover:bg-brand-purple/40 text-white rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    onClick={() => setCurrentCarouselIndex((prev) => (prev === 0 ? carouselImages.length - 1 : prev - 1))}
                  >
                    <ChevronLeft size={32} />
                  </button>
                  <button
                    className="absolute right-2 md:right-4 p-3 bg-brand-purple/20 hover:bg-brand-purple/40 text-white rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    onClick={() => setCurrentCarouselIndex((prev) => (prev === carouselImages.length - 1 ? 0 : prev + 1))}
                  >
                    <ChevronRight size={32} />
                  </button>
                </>
              )}
              <img
                src={carouselImages[currentCarouselIndex]}
                alt={`Preview ${currentCarouselIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                referrerPolicy="no-referrer"
              />
            </div>

            {carouselImages.length > 1 && (
              <div className="mt-8 flex items-center space-x-2 overflow-x-auto pb-4 max-w-full scrollbar-hide">
                {carouselImages.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentCarouselIndex(idx)}
                    className={cn(
                      "w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0",
                      currentCarouselIndex === idx ? "border-sky-500 scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <img src={url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 text-white/70 text-sm font-medium">
              {currentCarouselIndex + 1} / {carouselImages.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
