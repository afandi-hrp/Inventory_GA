import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import { useToast } from '../UI/Toast';
import SignedImage from '../UI/SignedImage';
import { getSignedUrls, getSignedUrl } from '../../lib/signedStorage';
import { generateDailyDocNumber } from '../../lib/utils';
import { Item, SPKRequest, SPKRequestItem, FlagDef } from '../../types';
import {
  ApprovalFilter, ApprovalFilterTabs, matchesApprovalFilter, spkProgress,
  ApprovalProgressCompact, ApprovalProgressStepper, RejectionBanner, parseRejection,
} from './ApprovalProgress';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import { addPdfLogo } from '../../lib/pdfLogo';
import { addPdfRow } from '../../lib/pdfLayout';
import {
  Search, X, Loader2, ShoppingCart, CheckSquare, Package,
  ChevronLeft, ChevronRight, ClipboardList, Calendar, AlertCircle, Eye,
  Tag, AlertTriangle, Star, CheckCircle2, Flag as FlagIcon, Zap, ShieldAlert, Info, MapPin, UserCheck,
  Download, XCircle, Bell, Minus, Plus, Trash2, Clock, Boxes, Send, Hourglass
} from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Daftar lokasi tujuan pengambilan barang SPK — tambahkan di sini kalau ada
// lokasi baru.
const LOKASI_TUJUAN_OPTIONS = ['Belawan'];

const ITEMS_PER_PAGE = 12;
const POLL_INTERVAL_MS = 30000;
const MAX_NOTIFS = 30;

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

type SPKStatus = SPKRequest['status'];

const STATUS_META: Record<SPKStatus, { label: string; classes: string; notif: string }> = {
  PENDING_ADMIN: { label: 'Menunggu Diketahui Admin', classes: 'bg-yellow-50 text-yellow-700 border-yellow-200', notif: 'menunggu diketahui Admin' },
  PENDING_AUDITOR: { label: 'Menunggu Diketahui Auditor', classes: 'bg-amber-50 text-amber-700 border-amber-200', notif: 'sudah diketahui Admin, lanjut ke Auditor' },
  PENDING_SPV: { label: 'Menunggu Persetujuan SPV', classes: 'bg-blue-50 text-blue-700 border-blue-200', notif: 'sudah diketahui Auditor, menunggu persetujuan SPV' },
  PENDING_DIREKTUR: { label: 'Menunggu Persetujuan Direktur', classes: 'bg-indigo-50 text-indigo-700 border-indigo-200', notif: 'sudah disetujui SPV, menunggu persetujuan Direktur' },
  APPROVED: { label: 'Disetujui', classes: 'bg-green-50 text-green-700 border-green-200', notif: 'DISETUJUI — surat jalan siap diunduh' },
  REJECTED: { label: 'Ditolak', classes: 'bg-red-50 text-red-700 border-red-200', notif: 'DITOLAK' },
};

type RequestItemSummary = Pick<SPKRequestItem, 'item_id' | 'jumlah_barang' | 'status_item' | 'nama_kategori' | 'nama_lokasi'>;
type SPKRequestWithItems = SPKRequest & { spk_request_items?: RequestItemSummary[] };

interface RequesterNotif {
  id: string;
  requestId: string;
  nomor: string;
  status: SPKStatus;
  at: string;
  read: boolean;
}

// Pengaman localStorage: bisa kosong/throw (mode privat, data situs diblokir).
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* abaikan */
  }
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} hari lalu` : new Date(iso).toLocaleDateString('id-ID');
}

// Karakter ini punya arti khusus di filter .or() PostgREST — kalau ikut
// terketik di kotak cari, query-nya rusak (error 400).
function sanitizeSearch(value: string) {
  return value.replace(/[%,()*\\]/g, ' ').trim();
}

type CartEntry = { item: Item; qty: number | '' };

function qtyError(entry: CartEntry): string | null {
  const { qty, item } = entry;
  if (qty === '' || !Number.isInteger(qty) || qty < 1) return 'Qty wajib diisi (minimal 1)';
  if (qty > item.jumlah_barang) return `Maksimal ${item.jumlah_barang} (stok tersedia)`;
  return null;
}

export default function OfficeItemsRequester() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'items' | 'history'>('items');

  // Daftar barang
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState('');
  const [filterLokasi, setFilterLokasi] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalReusable, setTotalReusable] = useState(0);

  const [categories, setCategories] = useState<{ id: string; nama_kategori: string }[]>([]);
  const [locations, setLocations] = useState<{ kode_lokasi: string; nama_lokasi: string }[]>([]);
  const [flagCatalog, setFlagCatalog] = useState<FlagDef[]>([]);

  // Keranjang pengajuan — tetap tersimpan walau pindah halaman/filter.
  const [cart, setCart] = useState<Record<string, CartEntry>>({});

  // Modal pengajuan SPK
  const [isSPKModalOpen, setIsSPKModalOpen] = useState(false);
  const [spkKeterangan, setSpkKeterangan] = useState('');
  const [spkLokasiTujuan, setSpkLokasiTujuan] = useState('');
  const [isSubmittingSPK, setIsSubmittingSPK] = useState(false);
  const [showQtyErrors, setShowQtyErrors] = useState(false);

  // Riwayat pengajuan
  const [myRequests, setMyRequests] = useState<SPKRequestWithItems[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<ApprovalFilter>('ALL');
  const [selectedRequest, setSelectedRequest] = useState<SPKRequest | null>(null);
  const [requestItems, setRequestItems] = useState<SPKRequestItem[]>([]);
  const [loadingRequestItems, setLoadingRequestItems] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);

  // Notifikasi live
  const [notifs, setNotifs] = useState<RequesterNotif[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [liveMode, setLiveMode] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const notifRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<Record<string, SPKStatus> | null>(null);

  // Detail barang + foto besar
  const [selectedItemDetail, setSelectedItemDetail] = useState<Item | null>(null);
  const [detailQty, setDetailQty] = useState<number | ''>(1);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  // Supaya tombol/gesture "Kembali" di mobile menutup modal, bukan keluar aplikasi
  useModalBackButton(isSPKModalOpen, () => setIsSPKModalOpen(false));
  useModalBackButton(!!selectedRequest, () => setSelectedRequest(null));
  useModalBackButton(isDeleteConfirmOpen, () => !isDeletingRequest && setIsDeleteConfirmOpen(false));
  useModalBackButton(!!selectedItemDetail, () => setSelectedItemDetail(null));
  useModalBackButton(carouselImages.length > 0, () => setCarouselImages([]));

  const notifKey = user ? `requester.notifs.${user.id}` : '';
  const statusKey = user ? `requester.spkStatus.${user.id}` : '';

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchFilterOptions();
    fetchFlagCatalog();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [page, debouncedSearch, filterKategori, filterLokasi]);

  // Tutup panel notifikasi kalau klik di luar
  useEffect(() => {
    if (!isNotifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isNotifOpen]);

  async function fetchFilterOptions() {
    // Opsi filter diturunkan dari barang Reusable yang benar-benar ada saja
    // (bukan dari seluruh tabel categories/master_lokasi), supaya requester
    // tidak lihat kategori/lokasi/flag yang tidak relevan buat mereka.
    try {
      const { data, error } = await supabase
        .from('items')
        .select('kategori_id, kode_lokasi, categories(nama_kategori), master_lokasi(nama_lokasi)')
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

      setTotalReusable((data || []).length);
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

      const term = sanitizeSearch(debouncedSearch);
      if (term) {
        query = query.or(`nama_barang.ilike.%${term}%,kode_barang.ilike.%${term}%,deskripsi.ilike.%${term}%`);
      }
      if (filterKategori) {
        query = query.eq('kategori_id', filterKategori);
      }
      if (filterLokasi) {
        query = query.eq('kode_lokasi', filterLokasi);
      }

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, count, error } = await query.order('nama_barang', { ascending: true }).range(from, to);
      if (error) throw error;

      const fresh = (data || []) as Item[];
      setItems(fresh);
      setTotalCount(count || 0);
      // Stok barang di keranjang ikut disegarkan supaya batas qty selalu terbaru.
      setCart(prev => {
        let changed = false;
        const next = { ...prev };
        fresh.forEach(it => {
          if (next[it.id] && next[it.id].item.jumlah_barang !== it.jumlah_barang) {
            next[it.id] = { ...next[it.id], item: it };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    } catch (err: any) {
      console.error('Error fetching reusable items:', err);
      showToast(err.message || 'Gagal mengambil daftar barang', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang riwayat SPK milik user, lalu bandingkan status dengan yang
  // terakhir diketahui → perubahan status jadi notifikasi. Status terakhir
  // disimpan di localStorage supaya perubahan saat user offline tetap muncul
  // begitu halaman dibuka lagi.
  async function refreshMyRequests(silent = false) {
    if (!user) return;
    if (!silent) setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('spk_requests')
        .select('*, spk_request_items(item_id, jumlah_barang, status_item, nama_kategori, nama_lokasi)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = (data || []) as SPKRequestWithItems[];
      setMyRequests(list);

      if (prevStatusRef.current === null) {
        prevStatusRef.current = readStorage<Record<string, SPKStatus>>(statusKey, {});
      }
      const prev = prevStatusRef.current;
      const isFirstEver = Object.keys(prev).length === 0;
      const changes = isFirstEver ? [] : list.filter(r => prev[r.id] && prev[r.id] !== r.status);

      const nextStatus: Record<string, SPKStatus> = {};
      list.forEach(r => { nextStatus[r.id] = r.status; });
      prevStatusRef.current = nextStatus;
      writeStorage(statusKey, nextStatus);

      if (changes.length > 0) {
        const now = new Date().toISOString();
        const fresh: RequesterNotif[] = changes.map(r => ({
          id: `${r.id}-${r.status}`,
          requestId: r.id,
          nomor: r.nomor_spk,
          status: r.status,
          at: r.updated_at || now,
          read: false,
        }));
        setNotifs(prevNotifs => {
          const existing = new Set(prevNotifs.map(n => n.id));
          const merged = [...fresh.filter(n => !existing.has(n.id)), ...prevNotifs].slice(0, MAX_NOTIFS);
          writeStorage(notifKey, merged);
          return merged;
        });
        changes.slice(0, 3).forEach(r => {
          showToast(`${r.nomor_spk} ${STATUS_META[r.status].notif}`, r.status === 'REJECTED' ? 'error' : r.status === 'APPROVED' ? 'success' : 'info');
        });
        // Stok barang berubah setelah SPK disetujui.
        if (changes.some(r => r.status === 'APPROVED')) {
          fetchItems();
          fetchFilterOptions();
        }
      }

      // Detail yang sedang terbuka ikut diperbarui.
      if (selectedRequest) {
        const updated = list.find(r => r.id === selectedRequest.id);
        if (updated && updated.status !== selectedRequest.status) {
          setSelectedRequest(updated);
          fetchRequestItems(updated.id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching my SPK requests:', err);
      if (!silent) showToast(err.message || 'Gagal mengambil riwayat pengajuan', 'error');
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }

  const refreshRef = useRef(refreshMyRequests);
  refreshRef.current = refreshMyRequests;

  // Notifikasi live: Supabase Realtime (kalau aktif di server) + polling
  // cadangan tiap 30 detik saat tab terlihat, jadi tetap jalan walau Realtime
  // belum diaktifkan untuk tabel spk_requests.
  useEffect(() => {
    if (!user) return;
    setNotifs(readStorage<RequesterNotif[]>(`requester.notifs.${user.id}`, []));
    prevStatusRef.current = null;
    refreshRef.current();

    const channel = supabase
      .channel(`spk-requester-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spk_requests', filter: `user_id=eq.${user.id}` }, () => {
        refreshRef.current(true);
      })
      .subscribe((status) => {
        setLiveMode(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'polling' : 'connecting');
      });

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current(true);
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshRef.current(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifs(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      writeStorage(notifKey, next);
      return next;
    });
  };

  const openNotif = (n: RequesterNotif) => {
    setNotifs(prev => {
      const next = prev.map(x => x.id === n.id ? { ...x, read: true } : x);
      writeStorage(notifKey, next);
      return next;
    });
    setIsNotifOpen(false);
    const req = myRequests.find(r => r.id === n.requestId);
    if (req) {
      setTab('history');
      handleViewRequestDetail(req);
    }
  };

  async function fetchRequestItems(requestId: string) {
    setLoadingRequestItems(true);
    try {
      const { data, error } = await supabase
        .from('spk_request_items')
        .select('*, items(jumlah_barang, foto_urls, master_lokasi(nama_lokasi), categories(nama_kategori), master_kepemilikan(nama_pemilik))')
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
    setRequestItems([]);
    setIsDeleteConfirmOpen(false);
    setSelectedRequest(req);
    fetchRequestItems(req.id);
  };

  // Hapus pengajuan yang masih PENDING. Pemilik & status dicek ulang di server
  // (delete_own_spk_request, lihat supabase_spk_delete.sql); karena approval
  // membaca tabel yang sama, pengajuan otomatis hilang dari antrean approver.
  const deleteSelectedRequest = async () => {
    if (!selectedRequest) return;
    const target = selectedRequest;
    setIsDeletingRequest(true);
    try {
      const { error } = await supabase.rpc('delete_own_spk_request', { p_request_id: target.id });
      if (error) throw error;

      setMyRequests(prev => prev.filter(r => r.id !== target.id));
      setNotifs(prev => {
        const next = prev.filter(n => n.requestId !== target.id);
        writeStorage(notifKey, next);
        return next;
      });
      setIsDeleteConfirmOpen(false);
      setSelectedRequest(null);
      showToast(`Pengajuan ${target.nomor_spk} berhasil dihapus`, 'success');
      refreshMyRequests(true);
    } catch (err: any) {
      console.error('Error deleting SPK request:', err);
      showToast('Gagal menghapus pengajuan: ' + (err.message || 'kesalahan tidak diketahui'), 'error');
      // Status bisa saja sudah berubah (mis. baru disetujui) — segarkan tampilan.
      refreshMyRequests(true);
    } finally {
      setIsDeletingRequest(false);
    }
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

        const item = itemsToPrint[i];

        addPdfLogo(doc, 14, 10, 11);
        currentY = 38;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SURAT JALAN', 105, currentY, { align: 'center' });
        currentY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nomor Permintaan : ${selectedRequest.nomor_spk}`, 105, currentY, { align: 'center' });
        currentY += 14;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        const kategoriName = item.nama_kategori || (item as any).items?.categories?.nama_kategori || 'Tanpa Kategori';
        const lokasiName = item.nama_lokasi || (item as any).items?.master_lokasi?.nama_lokasi || item.kode_lokasi || 'Tanpa Lokasi';

        currentY = addPdfRow(doc, 'Kode Barang', item.kode_barang, currentY);
        currentY = addPdfRow(doc, 'Kategori Barang', kategoriName, currentY);
        currentY = addPdfRow(doc, 'Lokasi Barang', lokasiName, currentY);
        currentY = addPdfRow(doc, 'Nama Barang', item.nama_barang, currentY);
        currentY = addPdfRow(doc, 'Jumlah Diambil', `${item.jumlah_barang} unit`, currentY);
        currentY = addPdfRow(doc, 'Lokasi Tujuan', selectedRequest.lokasi_tujuan || '-', currentY);
        currentY = addPdfRow(doc, 'Alasan Penggunaan', selectedRequest.keterangan || '-', currentY);
        currentY = addPdfRow(doc, 'Tanggal Permintaan', new Date(selectedRequest.tanggal_pengajuan || selectedRequest.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }), currentY);
        currentY += lineSpacing;

        doc.text('Dokumentasi Barang', 14, currentY);
        doc.text(':', 55, currentY);

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

            for (let p = 0; p < photoUrls.length; p++) {
              if (p > 0 && p % maxPerRow === 0) {
                currentPhotoX = 14;
                currentY += photoSize + photoGap;
                checkPageBreak(photoSize + photoGap);
              }
              const base64Img = await getBase64ImageFromUrl(photoUrls[p]);
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
        doc.text('Diketahui Admin,', 52, currentY);
        doc.text('Diketahui Auditor,', 90, currentY);
        doc.text('Disetujui SPV,', 128, currentY);
        doc.text('Disetujui Direktur,', 165, currentY);
        doc.setFontSize(11);

        currentY += 25;

        doc.setFontSize(8);
        doc.text(`(${selectedRequest.diajukan_oleh})`, 14, currentY, { maxWidth: 34 });
        doc.text(`(${selectedRequest.diketahui_admin_oleh || '..................'})`, 52, currentY, { maxWidth: 34 });
        doc.text(`(${selectedRequest.diketahui_auditor_oleh || '..................'})`, 90, currentY, { maxWidth: 34 });
        doc.text(`(${selectedRequest.approved_by_l1 || '..................'})`, 128, currentY, { maxWidth: 34 });
        doc.text(`(${selectedRequest.approved_by_l2 || '..................'})`, 165, currentY, { maxWidth: 30 });
        doc.setFontSize(11);
      }

      doc.save(`SPK_${selectedRequest.nomor_spk}.pdf`);
    } catch (e) {
      showToast('Terjadi kesalahan saat membuat PDF', 'error');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  // ---- Keranjang ----
  const cartEntries = Object.values(cart) as CartEntry[];
  const cartUnits = cartEntries.reduce((sum, e) => sum + (typeof e.qty === 'number' ? e.qty : 0), 0);
  const cartHasErrors = cartEntries.some(e => qtyError(e) !== null);

  const setCartQty = (item: Item, qty: number | '') => {
    setCart(prev => ({ ...prev, [item.id]: { item: prev[item.id]?.item || item, qty } }));
  };
  const removeFromCart = (id: string) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const parseQtyInput = (raw: string): number | '' => {
    if (raw === '') return '';
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? '' : n;
  };

  // Qty barang yang sedang diajukan di SPK saya yang masih diproses.
  const pendingQtyByItem = useMemo(() => {
    const map: Record<string, number> = {};
    myRequests.forEach(r => {
      if (!r.status.startsWith('PENDING')) return;
      (r.spk_request_items || []).forEach(ri => {
        if (!ri.item_id || ri.status_item === 'REJECTED') return;
        map[ri.item_id] = (map[ri.item_id] || 0) + (ri.jumlah_barang || 0);
      });
    });
    return map;
  }, [myRequests]);

  const openSPKModal = () => {
    setShowQtyErrors(false);
    setIsSPKModalOpen(true);
  };

  const submitSPK = async () => {
    if (cartEntries.length === 0 || !spkKeterangan.trim() || !spkLokasiTujuan.trim()) return;
    if (cartHasErrors) {
      setShowQtyErrors(true);
      showToast('Periksa kembali qty barang yang diajukan', 'error');
      return;
    }
    setIsSubmittingSPK(true);
    try {
      // Cek stok terbaru dulu — bisa saja berubah sejak barang dimasukkan keranjang.
      const ids = cartEntries.map(e => e.item.id);
      const { data: stockRows, error: stockError } = await supabase
        .from('items')
        .select('id, jumlah_barang')
        .in('id', ids);
      if (stockError) throw stockError;
      const stockMap = new Map((stockRows || []).map((r: any) => [r.id as string, r.jumlah_barang as number]));
      const problems: string[] = [];
      const refreshed: Record<string, CartEntry> = {};
      cartEntries.forEach(e => {
        const stok = stockMap.get(e.item.id);
        if (stok === undefined) {
          problems.push(`${e.item.kode_barang} sudah tidak tersedia`);
          return;
        }
        refreshed[e.item.id] = { ...e, item: { ...e.item, jumlah_barang: stok } };
        if (typeof e.qty === 'number' && e.qty > stok) problems.push(`${e.item.kode_barang}: stok tinggal ${stok}`);
      });
      if (problems.length > 0) {
        setCart(refreshed);
        setShowQtyErrors(true);
        throw new Error(problems.join('; '));
      }

      // Nomor final dibuat ulang oleh trigger database (lihat supabase_spk_qty.sql).
      const nomorSpk = await generateDailyDocNumber('spk_requests', 'nomor_spk', 'SPK');
      const reqRes = await supabase.from('spk_requests').insert({
        nomor_spk: nomorSpk,
        diajukan_oleh: profile?.full_name || 'Unknown',
        user_id: user?.id,
        jumlah: cartEntries.length,
        status: 'PENDING_ADMIN',
        keterangan: spkKeterangan.trim(),
        lokasi_tujuan: spkLokasiTujuan,
      }).select('id, nomor_spk').single();

      if (reqRes.error) throw reqRes.error;
      const requestId = reqRes.data.id;

      const insertItems = cartEntries.map(({ item, qty }) => ({
        request_id: requestId,
        item_id: item.id,
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        jumlah_barang: qty,
        kode_lokasi: item.kode_lokasi,
        kepemilikan_id: item.kepemilikan_id,
        nama_kategori: item.categories?.nama_kategori || null,
        nama_lokasi: (item as any).master_lokasi?.nama_lokasi || null,
        foto_urls: item.foto_urls || [],
        status_item: 'PENDING',
      }));

      const itemRes = await supabase.from('spk_request_items').insert(insertItems);
      if (itemRes.error) {
        // Jangan tinggalkan pengajuan kosong tanpa barang.
        await supabase.from('spk_requests').delete().eq('id', requestId);
        throw itemRes.error;
      }

      showToast(`Pengajuan ${reqRes.data.nomor_spk || nomorSpk} berhasil dibuat!`, 'success');
      setIsSPKModalOpen(false);
      setSpkKeterangan('');
      setSpkLokasiTujuan('');
      setCart({});
      refreshMyRequests(true);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal mengajukan SPK: ' + err.message, 'error');
    } finally {
      setIsSubmittingSPK(false);
    }
  };

  const openItemDetail = (item: Item) => {
    setSelectedItemDetail(item);
    setDetailQty(cart[item.id]?.qty ?? 1);
  };

  const summarizeRequestField = (req: SPKRequestWithItems, field: 'nama_kategori' | 'nama_lokasi') => {
    const values = (req.spk_request_items || []).map((i) => i[field]).filter((v): v is string => !!v);
    const unique = Array.from(new Set(values));
    return unique.length > 0 ? unique.join(', ') : '-';
  };

  const requestUnits = (req: SPKRequestWithItems) =>
    (req.spk_request_items || []).filter(i => i.status_item !== 'REJECTED').reduce((s, i) => s + (i.jumlah_barang || 0), 0);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  // Hapus hanya boleh selama BELUM ADA approval sama sekali: status masih di
  // Admin (level 1) dan belum ada barang yang ditolak/diproses. Aturan yang
  // sama dicek ulang di server (delete_own_spk_request).
  const canDeleteSelected = !!selectedRequest
    && selectedRequest.status === 'PENDING_ADMIN'
    && !selectedRequest.diketahui_admin_oleh
    && !loadingRequestItems
    && requestItems.every(i => (i.status_item || 'PENDING') === 'PENDING');

  const pendingCount = myRequests.filter(r => r.status.startsWith('PENDING')).length;
  const approvedCount = myRequests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = myRequests.filter(r => r.status === 'REJECTED').length;
  const filteredRequests = myRequests.filter(r => matchesApprovalFilter(r.status, historyFilter));

  const statusBadge = (status: SPKStatus) => (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap", STATUS_META[status].classes)}>
      {STATUS_META[status].label}
    </span>
  );

  const qtyStepper = (item: Item, qty: number | '', onChange: (q: number | '') => void, size: 'sm' | 'md' = 'sm') => {
    const num = typeof qty === 'number' ? qty : 0;
    const btn = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
    return (
      <div className="flex items-center rounded-lg border border-brand-purple/20 bg-white overflow-hidden">
        <button
          type="button"
          aria-label="Kurangi qty"
          onClick={() => onChange(Math.max(1, num - 1))}
          disabled={num <= 1}
          className={cn(btn, "flex items-center justify-center text-brand-purple hover:bg-brand-purple/5 disabled:opacity-30")}
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={item.jumlah_barang}
          value={qty}
          onChange={(e) => onChange(parseQtyInput(e.target.value))}
          className={cn("w-12 text-center font-bold text-brand-purple border-x border-brand-purple/10 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none", size === 'sm' ? 'h-8 text-sm' : 'h-10')}
        />
        <button
          type="button"
          aria-label="Tambah qty"
          onClick={() => onChange(Math.min(item.jumlah_barang, num + 1))}
          disabled={num >= item.jumlah_barang}
          className={cn(btn, "flex items-center justify-center text-brand-purple hover:bg-brand-purple/5 disabled:opacity-30")}
        >
          <Plus size={14} />
        </button>
      </div>
    );
  };

  const qtyOutcomeHint = (item: Item, qty: number | '') => {
    if (typeof qty !== 'number' || qty < 1 || qty > item.jumlah_barang) return null;
    return qty === item.jumlah_barang ? (
      <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> Seluruh stok diambil — barang keluar dari master</p>
    ) : (
      <p className="text-[11px] text-brand-purple/70">Sisa stok setelah diambil: <span className="font-semibold">{item.jumlah_barang - qty}</span></p>
    );
  };

  const statCards = [
    { label: 'Barang Tersedia', value: totalReusable, icon: Boxes, tone: 'text-brand-purple bg-brand-purple/10', onClick: () => setTab('items') },
    { label: 'Dalam Proses', value: pendingCount, icon: Hourglass, tone: 'text-orange-600 bg-orange-100', onClick: () => { setTab('history'); setHistoryFilter('PENDING'); } },
    { label: 'Disetujui', value: approvedCount, icon: CheckCircle2, tone: 'text-green-600 bg-green-100', onClick: () => { setTab('history'); setHistoryFilter('APPROVED'); } },
    { label: 'Ditolak', value: rejectedCount, icon: XCircle, tone: 'text-red-600 bg-red-100', onClick: () => { setTab('history'); setHistoryFilter('REJECTED'); } },
  ];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-flex items-center space-x-2">
          <ShoppingCart className="text-brand-purple" size={24} />
          <span>Barang Reusable</span>
        </h2>
        <p className="text-brand-purple">Pilih barang, tentukan qty, lalu ajukan SPK pengambilan</p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-md border border-white/50 p-4 flex items-center gap-3 text-left hover:shadow-lg hover:bg-white/80 transition-all"
          >
            <span className={cn("p-2.5 rounded-xl shrink-0", card.tone)}>
              <card.icon size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-bold text-brand-purple leading-none">{card.value}</span>
              <span className="block text-xs font-semibold text-brand-purple/70 mt-1 truncate">{card.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Tabs + notifikasi. Notifikasi sengaja di sini (bukan di baris judul)
          supaya tidak tertimpa sapaan pojok kanan atas dari Layout. Dropdown-nya
          di luar container overflow tab supaya tidak terpotong. */}
      <div className="flex items-end gap-2 border-b border-gray-200">
        <div className="flex-1 min-w-0 flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setTab('items')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap shrink-0",
              tab === 'items' ? "border-orange-500 text-brand-purple" : "border-transparent text-brand-purple/60 hover:text-brand-purple"
            )}
          >
            <Package size={16} />
            <span>Daftar Barang</span>
          </button>
          <button
            onClick={() => setTab('history')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap shrink-0",
              tab === 'history' ? "border-orange-500 text-brand-purple" : "border-transparent text-brand-purple/60 hover:text-brand-purple"
            )}
          >
            <ClipboardList size={16} />
            <span>Riwayat Pengajuan Saya</span>
            {pendingCount > 0 && (
              <span className="min-w-[20px] px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] leading-none text-center">{pendingCount}</span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0 pb-1.5" ref={notifRef}>
          <span
            className={cn(
              "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
              liveMode === 'live' ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-brand-purple/70 border-gray-200"
            )}
            title={liveMode === 'live' ? 'Status pengajuan diperbarui otomatis secara langsung' : 'Status pengajuan dicek otomatis tiap 30 detik'}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", liveMode === 'live' ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
            {liveMode === 'live' ? 'Live' : liveMode === 'connecting' ? 'Menghubungkan…' : 'Sinkron otomatis'}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotifOpen(o => !o)}
              className="relative p-2.5 rounded-xl bg-white/70 border border-white/60 shadow-sm text-brand-purple hover:bg-white transition-colors"
              aria-label="Notifikasi status pengajuan"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {isNotifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-bold text-brand-purple text-sm">Notifikasi Pengajuan</p>
                  {unreadCount > 0 && (
                    <button type="button" onClick={markAllRead} className="text-xs font-semibold text-brand-purple/70 hover:text-brand-purple">
                      Tandai semua dibaca
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-brand-purple/60">
                      <Bell className="mx-auto mb-2 text-brand-purple/30" size={28} />
                      Belum ada notifikasi. Perubahan status pengajuan Anda akan muncul di sini.
                    </div>
                  ) : notifs.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openNotif(n)}
                      className={cn("w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-brand-purple/5 transition-colors", !n.read && "bg-orange-50/60")}
                    >
                      <span className={cn(
                        "mt-0.5 p-1.5 rounded-lg shrink-0",
                        n.status === 'APPROVED' ? "bg-green-100 text-green-600" :
                        n.status === 'REJECTED' ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                      )}>
                        {n.status === 'APPROVED' ? <CheckCircle2 size={14} /> : n.status === 'REJECTED' ? <XCircle size={14} /> : <Clock size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-brand-purple leading-snug">
                          <span className="font-bold">{n.nomor}</span> {STATUS_META[n.status].notif}
                        </span>
                        <span className="block text-[11px] text-brand-purple/60 mt-0.5">{timeAgo(n.at)}</span>
                      </span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === 'items' ? (
        <>
          {/* Filter */}
          <div className="bg-white/60 backdrop-blur-xl p-4 rounded-3xl shadow-lg border border-white/50 flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-purple" size={18} />
              <input
                type="text"
                placeholder="Cari nama, kode, atau deskripsi barang..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-9 py-2 bg-white border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-brand-purple/60 hover:text-brand-purple" aria-label="Hapus pencarian">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:flex gap-3">
              <select
                value={filterKategori}
                onChange={(e) => { setFilterKategori(e.target.value); setPage(1); }}
                className="w-full md:w-52 px-3 py-2 bg-white border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple text-sm font-medium text-brand-purple"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.nama_kategori}</option>
                ))}
              </select>
              <select
                value={filterLokasi}
                onChange={(e) => { setFilterLokasi(e.target.value); setPage(1); }}
                className="w-full md:w-52 px-3 py-2 bg-white border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple text-sm font-medium text-brand-purple"
              >
                <option value="">Semua Lokasi</option>
                {locations.map((loc) => (
                  <option key={loc.kode_lokasi} value={loc.kode_lokasi}>{loc.nama_lokasi}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Card barang */}
          {loading ? (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg px-6 py-12 text-center">
              <Loader2 className="animate-spin mx-auto text-brand-purple mb-2" size={32} />
              <p className="text-brand-purple">Memuat data...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg px-6 py-12 text-center">
              <Package className="mx-auto text-brand-purple mb-2" size={48} />
              <p className="text-brand-purple font-semibold">Tidak ada barang Reusable ditemukan</p>
              {(search || filterKategori || filterLokasi) && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFilterKategori(''); setFilterLokasi(''); setPage(1); }}
                  className="mt-3 text-sm font-semibold text-orange-600 hover:text-orange-700"
                >
                  Reset filter
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {items.map((item) => {
                const entry = cart[item.id];
                const inCart = !!entry;
                const outOfStock = item.jumlah_barang < 1;
                const pendingQty = pendingQtyByItem[item.id] || 0;
                const lokasiNama = (item as any).master_lokasi?.nama_lokasi || '-';
                const kategoriNama = (item as any).categories?.nama_kategori || 'Tanpa Kategori';
                const kepemilikanNama = (item as any).master_kepemilikan?.nama_pemilik || '-';
                const err = entry ? qtyError(entry) : null;
                return (
                  <div
                    key={item.id}
                    onClick={() => openItemDetail(item)}
                    className={cn(
                      "bg-white/85 rounded-2xl shadow-md border p-4 flex flex-col gap-3 cursor-pointer hover:shadow-lg transition-shadow",
                      inCart ? "border-brand-purple ring-2 ring-brand-purple/30" : "border-white/70"
                    )}
                  >
                    {/* Header: kode + kondisi */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-bold text-sm text-brand-purple truncate">{item.kode_barang}</span>
                      <div className="flex flex-wrap justify-end gap-1 shrink-0">
                        {inCart && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-purple text-white">
                            <ShoppingCart size={10} /> Dipilih
                          </span>
                        )}
                        {item.kondisi_barang && (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                            item.kondisi_barang === 'BAIK' ? "bg-green-50 text-green-700 border-green-200" :
                            item.kondisi_barang === 'CUKUP BAIK' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            "bg-red-50 text-red-700 border-red-200"
                          )}>
                            {item.kondisi_barang}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Panel: foto + nama + deskripsi + stok */}
                    <div className="rounded-xl bg-brand-purple/5 p-3 flex items-stretch gap-3 min-h-[6.5rem]">
                      {item.foto_urls && item.foto_urls.length > 0 ? (
                        <div className="relative shrink-0 self-center">
                          <SignedImage
                            bucket="item-photos"
                            path={item.foto_urls[0]}
                            alt={item.nama_barang}
                            className="w-20 h-20 rounded-lg object-cover border-2 border-white shadow-sm cursor-zoom-in"
                            containerClassName="w-20 h-20 rounded-lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCarousel(item.foto_urls, 0);
                            }}
                          />
                          {item.foto_urls.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-brand-purple text-white text-[10px] font-bold shadow">
                              +{item.foto_urls.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-20 h-20 shrink-0 self-center rounded-lg bg-white flex items-center justify-center text-brand-purple/40 border border-brand-purple/10" title="Belum ada foto">
                          <Package size={24} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 self-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-purple/60">Nama Barang</p>
                        <p className="font-bold text-brand-purple leading-snug line-clamp-2 break-words">{item.nama_barang}</p>
                        <p className="text-xs text-brand-purple/70 mt-0.5 line-clamp-2 break-words whitespace-pre-line">{item.deskripsi || '-'}</p>
                      </div>
                      <div className="shrink-0 pl-3 border-l border-brand-purple/10 flex flex-col items-center justify-center text-center leading-none">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-purple/60 mb-1.5">Stok</p>
                        <p className={cn("text-2xl font-bold", item.jumlah_barang <= 5 ? "text-red-600" : "text-brand-purple")}>{item.jumlah_barang}</p>
                      </div>
                    </div>

                    {/* Kategori, Lokasi & Milik */}
                    <div className="space-y-2">
                      <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-1.5" title={kategoriNama}>
                        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-orange-700/70"><Tag size={10} /> Kategori</p>
                        <p className="text-sm font-bold text-orange-800 line-clamp-2 break-words">{kategoriNama}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 min-w-0" title={lokasiNama}>
                          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700/70"><MapPin size={10} /> Lokasi</p>
                          <p className="text-sm font-bold text-blue-800 line-clamp-2 break-words">{lokasiNama}</p>
                        </div>
                        <div className="rounded-xl border border-brand-purple/25 bg-brand-purple/10 px-3 py-1.5 min-w-0" title={kepemilikanNama}>
                          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-purple/70"><UserCheck size={10} /> Milik</p>
                          <p className="text-sm font-bold text-brand-purple line-clamp-2 break-words">{kepemilikanNama}</p>
                        </div>
                      </div>
                    </div>

                    {/* Flags */}
                    {item.flags && item.flags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.flags.slice(0, 3).map((flag) => {
                          const { classes, Icon } = getFlagStyle(flag);
                          return (
                            <span key={flag} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", classes)}>
                              <Icon size={9} className="shrink-0" />
                              {flag}
                            </span>
                          );
                        })}
                        {item.flags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-brand-purple border border-gray-200">
                            +{item.flags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {pendingQty > 0 && (
                      <p className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-100">
                        <Hourglass size={12} className="shrink-0" /> {pendingQty} unit sedang Anda ajukan di SPK lain
                      </p>
                    )}

                    {/* Aksi */}
                    <div className="mt-auto pt-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      {inCart ? (
                        <>
                          <div className="flex items-center gap-2">
                            {qtyStepper(item, entry.qty, (q) => setCartQty(item, q))}
                            <span className="text-xs text-brand-purple/60">/ {item.jumlah_barang}</span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="ml-auto p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors"
                              title="Hapus dari pengajuan"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {err ? <p className="text-[11px] text-red-600">{err}</p> : qtyOutcomeHint(item, entry.qty)}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openItemDetail(item)}
                            className="flex-1 px-3 py-2 rounded-lg bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                          >
                            <Eye size={15} /> Detail
                          </button>
                          <button
                            type="button"
                            disabled={outOfStock}
                            onClick={() => setCartQty(item, 1)}
                            className="flex-1 px-3 py-2 rounded-lg bg-brand-purple text-white hover:bg-brand-purple-light text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
                          >
                            <Plus size={15} /> {outOfStock ? 'Stok habis' : 'Ambil'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalCount > 0 && (
            <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-md border border-white/50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-brand-purple">
                Menampilkan <span className="font-medium">{(page - 1) * ITEMS_PER_PAGE + 1}</span>–<span className="font-medium">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> barang
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
          )}
        </>
      ) : (
        <div className="space-y-3">
          <ApprovalFilterTabs statuses={myRequests.map(r => r.status)} value={historyFilter} onChange={setHistoryFilter} />

          {loadingHistory ? (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg px-6 py-12 text-center">
              <Loader2 className="animate-spin mx-auto text-brand-purple mb-2" size={32} />
              <p className="text-brand-purple">Memuat riwayat...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg px-6 py-12 text-center">
              <ClipboardList className="mx-auto text-brand-purple mb-2" size={48} />
              <p className="text-brand-purple font-semibold">
                {myRequests.length === 0 ? 'Belum ada pengajuan SPK.' : 'Tidak ada pengajuan dengan status ini.'}
              </p>
              {myRequests.length === 0 && (
                <button type="button" onClick={() => setTab('items')} className="mt-3 text-sm font-semibold text-orange-600 hover:text-orange-700">
                  Pilih barang untuk diajukan
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredRequests.map((req) => {
                const itemCount = (req.spk_request_items || []).length || req.jumlah || 0;
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => handleViewRequestDetail(req)}
                    className="text-left bg-white/85 rounded-2xl shadow-md border border-white/70 p-4 hover:shadow-lg transition-shadow flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-brand-purple truncate">{req.nomor_spk}</p>
                        <p className="text-xs text-brand-purple/70 flex items-center mt-0.5">
                          <Calendar size={12} className="mr-1" />
                          {new Date(req.tanggal_pengajuan || req.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      {statusBadge(req.status)}
                    </div>
                    <ApprovalProgressCompact data={spkProgress(req)} />
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-brand-purple/5 px-2.5 py-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-purple/60">Barang</p>
                        <p className="font-bold text-brand-purple">{itemCount} item · {requestUnits(req)} unit</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">Asal</p>
                        <p className="font-bold text-blue-800 truncate" title={summarizeRequestField(req, 'nama_lokasi')}>{summarizeRequestField(req, 'nama_lokasi')}</p>
                      </div>
                      <div className="rounded-lg bg-orange-50 px-2.5 py-1.5 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700/70">Tujuan</p>
                        <p className="font-bold text-orange-800 truncate">{req.lokasi_tujuan || '-'}</p>
                      </div>
                    </div>
                    {req.keterangan && <p className="text-xs text-brand-purple/80 line-clamp-1">“{req.keterangan}”</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bar keranjang mengambang */}
      {cartEntries.length > 0 && !isSPKModalOpen && (
        <div className="sticky bottom-4 z-30 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-brand-purple text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-white/15 shrink-0"><ShoppingCart size={20} /></span>
              <div className="min-w-0">
                <p className="font-bold leading-tight">{cartEntries.length} barang · {cartUnits} unit dipilih</p>
                <p className="text-xs text-white/70 truncate">{cartEntries.map(e => e.item.kode_barang).join(', ')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setCart({})} className="px-3 py-2 rounded-lg text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors">
                Kosongkan
              </button>
              <button
                type="button"
                onClick={openSPKModal}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow transition-colors"
              >
                <Send size={16} /> Ajukan SPK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pengajuan SPK */}
      {isSPKModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-brand-purple/5 shrink-0">
              <div className="flex items-center space-x-2 text-brand-purple">
                <ShoppingCart size={20} />
                <h3 className="text-lg font-bold">Ajukan SPK Pengambilan Barang</h3>
              </div>
              <button
                onClick={() => !isSubmittingSPK && setIsSPKModalOpen(false)}
                className="p-2 text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
                disabled={isSubmittingSPK}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="bg-brand-purple/5 p-4 rounded-xl border border-brand-purple/10 flex items-start space-x-3">
                <AlertCircle className="text-brand-purple mt-0.5 shrink-0" size={20} />
                <p className="text-xs text-brand-purple">
                  Anda mengajukan <strong>{cartEntries.length} barang ({cartUnits} unit)</strong>. Stok baru berkurang setelah disetujui Direktur
                  (Admin → Auditor → SPV → Direktur). Jika qty = seluruh stok, barang akan keluar dari master barang.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-brand-purple">Barang & Qty <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {cartEntries.map(entry => {
                    const err = qtyError(entry);
                    return (
                      <div key={entry.item.id} className={cn("flex items-center gap-3 p-3 rounded-xl border", showQtyErrors && err ? "border-red-300 bg-red-50/50" : "border-gray-200")}>
                        {entry.item.foto_urls && entry.item.foto_urls.length > 0 ? (
                          <SignedImage bucket="item-photos" path={entry.item.foto_urls[0]} alt={entry.item.nama_barang} className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0" containerClassName="w-12 h-12 rounded-lg shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-brand-purple shrink-0">
                            <Package size={18} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-purple truncate">{entry.item.nama_barang}</p>
                          <p className="text-xs text-brand-purple/70 font-mono">{entry.item.kode_barang} · stok {entry.item.jumlah_barang}</p>
                          {err ? (
                            <p className={cn("text-[11px]", showQtyErrors ? "text-red-600 font-semibold" : "text-brand-purple/60")}>{err}</p>
                          ) : qtyOutcomeHint(entry.item, entry.qty)}
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                          {qtyStepper(entry.item, entry.qty, (q) => setCartQty(entry.item, q))}
                          <button
                            type="button"
                            onClick={() => removeFromCart(entry.item.id)}
                            disabled={isSubmittingSPK}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            title="Hapus dari pengajuan"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {cartEntries.length === 0 && (
                    <p className="text-sm text-brand-purple/60 text-center py-4">Belum ada barang dipilih.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-brand-purple">Lokasi Tujuan <span className="text-red-500">*</span></label>
                <select
                  required
                  value={spkLokasiTujuan}
                  onChange={(e) => setSpkLokasiTujuan(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm bg-white text-brand-purple"
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
                  rows={3}
                  value={spkKeterangan}
                  onChange={(e) => setSpkKeterangan(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm bg-white"
                  placeholder="Tuliskan keperluan pengambilan barang-barang ini..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsSPKModalOpen(false)}
                disabled={isSubmittingSPK}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={submitSPK}
                disabled={isSubmittingSPK || cartEntries.length === 0 || !spkKeterangan.trim() || !spkLokasiTujuan.trim()}
                className="btn-confirm"
              >
                {isSubmittingSPK ? <Loader2 className="animate-spin" size={18} /> : <CheckSquare size={18} />}
                <span>Ajukan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Pengajuan */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50 shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-brand-purple font-mono truncate">{selectedRequest.nomor_spk}</h3>
                <p className="text-xs text-brand-purple/70 mt-0.5">
                  Diajukan {new Date(selectedRequest.tanggal_pengajuan || selectedRequest.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="hidden sm:inline">{statusBadge(selectedRequest.status)}</span>
                <button onClick={() => setSelectedRequest(null)} className="p-2 text-brand-purple hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 bg-gray-50/40">
              <div className="sm:hidden">{statusBadge(selectedRequest.status)}</div>

              <ApprovalProgressStepper data={spkProgress(selectedRequest)} />

              {selectedRequest.status === 'REJECTED' && (
                <RejectionBanner
                  requestReason={selectedRequest.alasan_penolakan}
                  itemReasons={requestItems.filter(i => i.status_item === 'REJECTED').map(i => i.alasan_rejection)}
                />
              )}

              {selectedRequest.status === 'APPROVED' && (
                <button
                  onClick={downloadSPKPDF}
                  disabled={isDownloadingPDF || loadingRequestItems}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-brand-purple hover:bg-brand-purple-light text-white rounded-xl shadow-sm font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {isDownloadingPDF ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                  <span>Download Surat Jalan SPK</span>
                </button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple/70 uppercase mb-1 flex items-center"><MapPin size={12} className="mr-1" /> Lokasi Tujuan</p>
                  <p className="text-sm font-semibold text-brand-purple">{selectedRequest.lokasi_tujuan || '-'}</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-brand-purple/70 uppercase mb-1">Keterangan</p>
                  <p className="text-sm text-brand-purple whitespace-pre-line">{selectedRequest.keterangan || '-'}</p>
                </div>
              </div>

              <h4 className="text-sm font-bold text-brand-purple pt-1">Daftar Barang</h4>
              {loadingRequestItems ? (
                <div className="py-8 text-center">
                  <Loader2 className="animate-spin mx-auto text-brand-purple" size={28} />
                </div>
              ) : (
                <div className="space-y-2">
                  {requestItems.map((item) => {
                    const rejection = item.status_item === 'REJECTED' ? parseRejection(item.alasan_rejection) : null;
                    return (
                      <div key={item.id} className="p-3 bg-white border border-gray-200 rounded-xl">
                        <div className="flex items-center gap-3">
                          {item.foto_urls && item.foto_urls.length > 0 ? (
                            <SignedImage bucket="item-photos" path={item.foto_urls[0]} alt={item.nama_barang} className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0" containerClassName="w-12 h-12 rounded-lg shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-brand-purple shrink-0">
                              <Package size={18} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-brand-purple truncate">{item.nama_barang}</p>
                            <p className="text-xs text-brand-purple/70 font-mono">{item.kode_barang}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-purple/60">Qty</p>
                            <p className="text-lg font-bold text-brand-purple leading-none">{item.jumlah_barang}</p>
                          </div>
                        </div>
                        {item.status_item === 'REJECTED' ? (
                          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                            <span className="font-semibold">Item ditolak</span>
                            {rejection && <> oleh {rejection.rejectedBy}{rejection.role ? ` (${rejection.role})` : ''}: “{rejection.alasan}”</>}
                          </p>
                        ) : item.status_item === 'APPROVED' ? (
                          <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5 font-semibold">
                            Disetujui — {item.jumlah_barang} unit diambil
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-between gap-3 bg-gray-50/50">
              {canDeleteSelected ? (
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 size={16} /> Hapus Pengajuan
                </button>
              ) : selectedRequest.status.startsWith('PENDING') && !loadingRequestItems ? (
                <p className="text-xs text-brand-purple/70 flex items-center gap-1.5 sm:max-w-xs">
                  <Info size={14} className="shrink-0" /> Sudah diproses approval, pengajuan tidak bisa dihapus.
                </p>
              ) : <span className="hidden sm:block" />}
              <button onClick={() => setSelectedRequest(null)} className="btn-cancel w-full sm:w-auto">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Pengajuan */}
      {selectedRequest && isDeleteConfirmOpen && canDeleteSelected && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={isDeletingRequest ? undefined : () => setIsDeleteConfirmOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shrink-0">
                  <Trash2 size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-brand-purple text-lg">Hapus Pengajuan?</h3>
                  <p className="mt-2 text-sm text-brand-purple">
                    Pengajuan <span className="font-semibold font-mono">{selectedRequest.nomor_spk}</span>{' '}
                    ({requestItems.length || selectedRequest.jumlah || 0} barang) akan dihapus permanen dan
                    otomatis hilang dari daftar approval Admin, Auditor, SPV, dan Direktur.
                  </p>
                  <p className="mt-2 text-sm text-brand-purple/80">
                    Jika ingin merevisi barang atau qty, ajukan SPK baru setelah menghapus.
                  </p>
                  <p className="mt-2 text-sm font-semibold text-red-600">Tindakan ini tidak bisa dibatalkan.</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeletingRequest} className="btn-cancel w-full sm:w-auto">
                Batal
              </button>
              <button
                onClick={deleteSelectedRequest}
                disabled={isDeletingRequest}
                className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingRequest ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Ya, Hapus Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Barang */}
      {selectedItemDetail && (() => {
        const inCart = !!cart[selectedItemDetail.id];
        const detailErr = qtyError({ item: selectedItemDetail, qty: detailQty });
        const outOfStock = selectedItemDetail.jumlah_barang < 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-brand-purple truncate">{selectedItemDetail.nama_barang}</h3>
                  <p className="text-xs text-brand-purple font-mono mt-0.5">{selectedItemDetail.kode_barang}</p>
                </div>
                <button onClick={() => setSelectedItemDetail(null)} className="p-2 text-brand-purple hover:bg-gray-100 rounded-full transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
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
                    <p className="text-[11px] font-semibold text-brand-purple uppercase">Stok / Kondisi</p>
                    <p className="text-sm font-medium text-brand-purple mt-1">{selectedItemDetail.jumlah_barang} unit · {selectedItemDetail.kondisi_barang || '-'}</p>
                  </div>
                </div>

                {selectedItemDetail.deskripsi && (
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[11px] font-semibold text-brand-purple uppercase mb-1">Deskripsi</p>
                    <p className="text-sm text-brand-purple whitespace-pre-line">{selectedItemDetail.deskripsi}</p>
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

                {!outOfStock && (
                  <div className="p-4 rounded-xl border border-brand-purple/15 bg-brand-purple/5 space-y-2">
                    <label className="block text-sm font-bold text-brand-purple">Qty yang diambil <span className="text-red-500">*</span></label>
                    <div className="flex items-center gap-3">
                      {qtyStepper(selectedItemDetail, detailQty, setDetailQty, 'md')}
                      <span className="text-sm text-brand-purple/70">maks. {selectedItemDetail.jumlah_barang}</span>
                    </div>
                    {detailErr ? <p className="text-[11px] text-red-600">{detailErr}</p> : qtyOutcomeHint(selectedItemDetail, detailQty)}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap justify-between items-center gap-2 bg-gray-50/50 shrink-0">
                {inCart ? (
                  <button
                    onClick={() => { removeFromCart(selectedItemDetail.id); setSelectedItemDetail(null); }}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200"
                  >
                    <Trash2 size={16} />
                    <span>Hapus dari Pengajuan</span>
                  </button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedItemDetail(null)} className="btn-cancel">
                    Tutup
                  </button>
                  {!outOfStock && (
                    <button
                      disabled={!!detailErr}
                      onClick={() => {
                        setCartQty(selectedItemDetail, detailQty);
                        setSelectedItemDetail(null);
                        showToast(`${selectedItemDetail.kode_barang} (${detailQty} unit) ${inCart ? 'diperbarui' : 'ditambahkan ke pengajuan'}`, 'success');
                      }}
                      className="btn-confirm"
                    >
                      <ShoppingCart size={16} />
                      <span>{inCart ? 'Perbarui Qty' : 'Tambah ke Pengajuan'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Image Carousel / Lightbox */}
      {carouselImages.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-purple/90 backdrop-blur-md animate-in fade-in duration-300">
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
                      currentCarouselIndex === idx ? "border-orange-400 scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
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
