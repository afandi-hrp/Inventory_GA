import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Edit2, ChevronLeft, ChevronRight,
  Package, Image as ImageIcon, Upload, Download, X, Loader2, AlertCircle,
  FileSpreadsheet, CheckSquare, Square, MoreHorizontal,
  ArrowUpDown, ChevronUp, ChevronDown, Info, Calendar, MapPin, Hash,
  LogOut, History, ClipboardList, Archive, XCircle, Camera, AlertTriangle, FileWarning,
  UserCheck, Tag, Star, CheckCircle2, Flag as FlagIcon, Zap, ShieldAlert, FileText
} from 'lucide-react';
import { Item, FlagDef } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useToast } from '../UI/Toast';
import SignedImage from '../UI/SignedImage';
import { getSignedUrl, getSignedUrls, extractPath } from '../../lib/signedStorage';
import { generateDailyDocNumber } from '../../lib/utils';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';
import { jsPDF } from 'jspdf';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

const FLAG_COLOR_SWATCH: Record<string, string> = {
  teal: 'bg-teal-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  orange: 'bg-orange-500',
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

interface MasterBarangProps {
  setHistorySearch?: (search: string) => void;
}

export default function MasterBarang({ setHistorySearch }: MasterBarangProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterLokasi, setFilterLokasi] = useState('');
  // Halaman pagination disimpan di URL (?page=10), bukan cuma state lokal —
  // supaya kalau ada remount/refresh tak terduga (mis. setelah simpan/edit
  // barang), user tidak "terlempar" balik ke halaman 1.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10) || 1;
  const setPage = (value: number | ((prev: number) => number)) => {
    const nextPage = typeof value === 'function' ? value(page) : value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPage <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(nextPage));
      }
      return next;
    }, { replace: true });
  };
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [availableLocations, setAvailableLocations] = useState<any[]>([]);
  const [locationStats, setLocationStats] = useState<{name: string, count: number, stock: number}[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isTakeItemModalOpen, setIsTakeItemModalOpen] = useState(false);
  const [isStockOutModalOpen, setIsStockOutModalOpen] = useState(false);
  const [isBulkStockOutModalOpen, setIsBulkStockOutModalOpen] = useState(false);
  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);
  const [disposalData, setDisposalData] = useState({ keterangan: '', metode_pemusnahan: '' });
  const [isSubmittingDisposal, setIsSubmittingDisposal] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<Item | null>(null);
  const [isItemHistoryModalOpen, setIsItemHistoryModalOpen] = useState(false);
  const [isAuditHistoryModalOpen, setIsAuditHistoryModalOpen] = useState(false);
  const [itemHistoryLogs, setItemHistoryLogs] = useState<{ id: string; action: string; old_values: Record<string, any> | null; new_values: Record<string, any> | null; created_at: string; profiles: { full_name: string } | null }[]>([]);
  const [loadingItemHistory, setLoadingItemHistory] = useState(false);
  const [selectedItemForTake, setSelectedItemForTake] = useState<Item | null>(null);
  const [selectedItemForStockOut, setSelectedItemForStockOut] = useState<Item | null>(null);
  const [documentPreview, setDocumentPreview] = useState<{ url: string; name: string } | null>(null);
  const [actionMenu, setActionMenu] = useState<{ itemId: string; top: number; left: number } | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [auditHistory, setAuditHistory] = useState<{ id: string; note_audit: string; tanggal_audit: string | null; audited_by: string | null; created_at: string }[]>([]);
  const [loadingAuditHistory, setLoadingAuditHistory] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);

  // Export state
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    kode_barang: '',
    nama_barang: '',
    jumlah_barang: 0,
    kode_lokasi: '',
    kategori_id: '',
    kepemilikan_id: '',
    sifat_barang: 'PRIVATE' as 'PRIVATE' | 'OFFICE' | 'REUSABLE',
    deskripsi: '',
    kelengkapan_garansi: false,
    kelengkapan_sertifikat: false,
    kelengkapan_manual: false,
    kondisi_barang: '' as 'BAIK' | 'CUKUP BAIK' | 'RUSAK' | '',
    dokumen_garansi_url: '' as string | null,
    dokumen_sertifikat_url: '' as string | null,
    dokumen_manual_url: '' as string | null,
    note_audit: '' as '' | 'ADA' | 'TIDAK ADA',
    tanggal_audit: '' as string,
    foto_urls: [] as string[],
    flags: [] as string[],
  });

  const [docGaransiFile, setDocGaransiFile] = useState<File | null>(null);
  const [docSertifikatFile, setDocSertifikatFile] = useState<File | null>(null);
  const [docManualFile, setDocManualFile] = useState<File | null>(null);

  const [takeItemData, setTakeItemData] = useState({
    jumlah: 1,
    alasan: '',
  });

  const [stockOutData, setStockOutData] = useState({
    alasan: '',
    lokasi_keluar: '',
  });

  const [categories, setCategories] = useState<any[]>([]);
  const [kepemilikanList, setKepemilikanList] = useState<any[]>([]);
  const [filterKategori, setFilterKategori] = useState('');
  const [filterKepemilikan, setFilterKepemilikan] = useState('');
  const [filterSifat, setFilterSifat] = useState<'' | 'PRIVATE' | 'OFFICE' | 'REUSABLE'>('');
  const [flagInput, setFlagInput] = useState('');
  const [flagCatalog, setFlagCatalog] = useState<FlagDef[]>([]);
  const [newFlagColorKey, setNewFlagColorKey] = useState('teal');
  const [newFlagIconKey, setNewFlagIconKey] = useState('tag');
  const [savingNewFlag, setSavingNewFlag] = useState(false);
  const [activeFilterPanel, setActiveFilterPanel] = useState<'' | 'kategori' | 'lokasi' | 'kepemilikan'>('');
  // Posisi dropdown dihitung manual (bukan cuma absolute+relative) & dirender
  // lewat portal ke document.body, karena baris filter sekarang overflow-x-auto
  // (biar muat 1 baris) — overflow-x-auto otomatis ikut meng-clip overflow-y,
  // jadi dropdown yang absolute di dalamnya bakal ke-potong/gak keliatan kalau
  // gak di-portal keluar dari container itu.
  const [dimensionMenuPos, setDimensionMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [filterPemusnahan, setFilterPemusnahan] = useState(false);
  const [isPemusnahanModalOpen, setIsPemusnahanModalOpen] = useState(false);
  const [fileMenuPos, setFileMenuPos] = useState<{ top: number; left: number } | null>(null);

  const [bulkEditData, setBulkEditData] = useState({
    kode_lokasi: '',
    kategori_id: '',
    kepemilikan_id: '',
    sifat_barang: '' as '' | 'PRIVATE' | 'OFFICE' | 'REUSABLE',
    jumlah_barang: -1, // -1 means no change
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [removedPhotoUrls, setRemovedPhotoUrls] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // Dimension Stats (kartu master Kepemilikan/Kategori/Lokasi yang saling cross-filter)
  const [dimensionStats, setDimensionStats] = useState<{ id: string, name: string, count: number, stock: number }[]>([]);
  const [loadingDimensionStats, setLoadingDimensionStats] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // DIMATIKAN SEMENTARA: 3 pendekatan berbeda untuk fitur "tombol Kembali
  // menutup modal" sama-sama menyebabkan modal Edit Barang hilang sendiri.
  // Nonaktifkan dulu supaya alur Edit Barang tetap berfungsi normal sampai
  // akar masalahnya benar-benar ditemukan.
  // useModalBackButton(isModalOpen, () => setIsModalOpen(false));
  // useModalBackButton(isDetailModalOpen, () => setIsDetailModalOpen(false));
  // useModalBackButton(isTakeItemModalOpen, () => setIsTakeItemModalOpen(false));
  // useModalBackButton(isStockOutModalOpen, () => setIsStockOutModalOpen(false));
  // useModalBackButton(isBulkStockOutModalOpen, () => setIsBulkStockOutModalOpen(false));
  // useModalBackButton(isDisposalModalOpen, () => setIsDisposalModalOpen(false));
  // useModalBackButton(isBulkEditOpen, () => setIsBulkEditOpen(false));
  // useModalBackButton(isImportPreviewOpen, () => setIsImportPreviewOpen(false));
  // useModalBackButton(isExportPreviewOpen, () => setIsExportPreviewOpen(false));
  // useModalBackButton(carouselImages.length > 0, () => setCarouselImages([]));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchItems();
    fetchCategories();
    fetchKepemilikan();
    fetchFlagCatalog();
  }, [page, debouncedSearch, filterLokasi, filterKategori, filterKepemilikan, filterSifat, filterPemusnahan, itemsPerPage, profile, sortColumn, sortOrder]);

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

  async function handleDeleteFlagDef(id: string, name: string) {
    if (!window.confirm(`Hapus flag "${name}" dari daftar referensi? Barang yang sudah punya flag ini tidak akan otomatis kehilangan flag-nya, cuma definisi warna/ikonnya saja yang dihapus.`)) {
      return;
    }
    try {
      const { error } = await supabase.from('item_flag_defs').delete().eq('id', id);
      if (error) throw error;
      setFlagCatalog((prev) => prev.filter((f) => f.id !== id));
      showToast('Flag dihapus dari daftar referensi', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus flag', 'error');
    }
  }

  async function handleSaveNewFlag() {
    const newFlagName = flagInput.trim();
    if (!newFlagName) return;
    setSavingNewFlag(true);
    try {
      const { data, error } = await supabase
        .from('item_flag_defs')
        .insert([{ nama_flag: newFlagName, color: newFlagColorKey, icon: newFlagIconKey }])
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          // Unique violation: another user just created the same flag concurrently — reuse it.
          await fetchFlagCatalog();
          setFormData((prev) => ({ ...prev, flags: [...prev.flags, newFlagName] }));
        } else {
          throw error;
        }
      } else if (data) {
        setFlagCatalog((prev) => [...prev, data]);
        setFormData((prev) => ({ ...prev, flags: [...prev.flags, data.nama_flag] }));
      }
      setFlagInput('');
      setNewFlagColorKey('teal');
      setNewFlagIconKey('tag');
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat flag baru', 'error');
    } finally {
      setSavingNewFlag(false);
    }
  }

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('nama_kategori');
      if (error) throw error;
      if (data) {
        setCategories(data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }

  async function fetchKepemilikan() {
    try {
      const { data, error } = await supabase
        .from('master_kepemilikan')
        .select('*')
        .order('nama_pemilik');
      if (error) throw error;
      if (data) {
        setKepemilikanList(data);
      }
    } catch (err) {
      console.error('Error fetching kepemilikan:', err);
    }
  }

  async function fetchStatsAndLocations() {
    try {
      const { data, error } = await supabase.from('master_lokasi').select('*').order('nama_lokasi');
      if (error) throw error;
      if (data) {
        setAvailableLocations(data);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }

  async function fetchDimensionStats(dimension: 'kategori' | 'lokasi' | 'kepemilikan') {
    setLoadingDimensionStats(true);
    try {
      let query = supabase.from('items').select('kategori_id, kode_lokasi, kepemilikan_id, jumlah_barang');

      // Terapkan filter dari 2 dimensi lain yang sedang aktif (bukan dimensi yang lagi dibuka)
      if (dimension !== 'kategori' && filterKategori) {
        if (filterKategori === 'unassigned') {
          query = query.is('kategori_id', null);
        } else {
          const subCats = categories.filter(c => c.parent_id === filterKategori).map(c => c.id);
          query = subCats.length > 0
            ? query.in('kategori_id', [filterKategori, ...subCats])
            : query.eq('kategori_id', filterKategori);
        }
      }
      if (dimension !== 'lokasi' && filterLokasi) {
        query = filterLokasi === 'unassigned'
          ? query.is('kode_lokasi', null)
          : query.eq('kode_lokasi', filterLokasi);
      }
      if (dimension !== 'kepemilikan' && filterKepemilikan) {
        query = filterKepemilikan === 'unassigned'
          ? query.is('kepemilikan_id', null)
          : query.eq('kepemilikan_id', filterKepemilikan);
      }

      const { data, error } = await query;
      if (error) throw error;

      const map: Record<string, { id: string, name: string, count: number, stock: number }> = {};

      (data || []).forEach((item: any) => {
        let key = 'unassigned';
        let name = 'Tanpa Data';

        if (dimension === 'kategori') {
          const cat = categories.find(c => c.id === item.kategori_id);
          if (cat) {
            const top = cat.parent_id ? categories.find(c => c.id === cat.parent_id) : cat;
            key = top?.id || cat.id;
            name = top?.nama_kategori || cat.nama_kategori;
          } else {
            name = 'Tanpa Kategori';
          }
        } else if (dimension === 'lokasi') {
          const loc = availableLocations.find(l => l.kode_lokasi === item.kode_lokasi);
          if (loc) {
            key = loc.kode_lokasi;
            name = loc.nama_lokasi;
          } else {
            name = 'Tanpa Lokasi';
          }
        } else {
          const owner = kepemilikanList.find(k => k.id === item.kepemilikan_id);
          if (owner) {
            key = owner.id;
            name = owner.nama_pemilik;
          } else {
            name = 'Tanpa Kepemilikan';
          }
        }

        if (!map[key]) map[key] = { id: key, name, count: 0, stock: 0 };
        map[key].count += 1;
        map[key].stock += (item.jumlah_barang || 0);
      });

      setDimensionStats(Object.values(map).sort((a, b) => b.count - a.count));
    } catch (err) {
      console.error('Error fetching dimension stats:', err);
      setDimensionStats([]);
    } finally {
      setLoadingDimensionStats(false);
    }
  }

  useEffect(() => {
    if (activeFilterPanel) {
      fetchDimensionStats(activeFilterPanel);
    }
  }, [activeFilterPanel, filterKategori, filterLokasi, filterKepemilikan, categories, availableLocations, kepemilikanList]);

  async function fetchItems() {
    setLoading(true);
    try {
      let query = supabase
        .from('items')
        .select(`
          *,
          master_lokasi (
            nama_lokasi
          ),
          categories (
            nama_kategori
          ),
          master_kepemilikan (
            nama_pemilik
          )
        `, { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`nama_barang.ilike.%${debouncedSearch}%,kode_barang.ilike.%${debouncedSearch}%,deskripsi.ilike.%${debouncedSearch}%`);
      }

      if (filterLokasi === 'unassigned') {
        query = query.is('kode_lokasi', null);
      } else if (filterLokasi) {
        query = query.eq('kode_lokasi', filterLokasi);
      }

      if (filterKategori === 'unassigned') {
        query = query.is('kategori_id', null);
      } else if (filterKategori) {
        const subCats = categories.filter(c => c.parent_id === filterKategori).map(c => c.id);
        if (subCats.length > 0) {
          query = query.in('kategori_id', [filterKategori, ...subCats]);
        } else {
          query = query.eq('kategori_id', filterKategori);
        }
      }

      if (filterPemusnahan) {
        query = query.in('kondisi_barang', ['RUSAK', 'CUKUP BAIK']);
      }

      if (filterKepemilikan === 'unassigned') {
        query = query.is('kepemilikan_id', null);
      } else if (filterKepemilikan) {
        query = query.eq('kepemilikan_id', filterKepemilikan);
      }

      if (filterSifat) {
        query = query.eq('sifat_barang', filterSifat);
      }

      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, count, error } = await query
        .order(sortColumn, { ascending: sortOrder === 'asc' })
        .range(from, to);

      if (error) throw error;
      setItems(data || []);
      setTotalCount(count || 0);
      setSelectedItems([]); // Clear selection on page change
      
      // Refresh locations
      fetchStatsAndLocations();
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const handleShowDetail = (item: Item) => {
    setSelectedItemForDetail(item);
    setIsDetailModalOpen(true);
  };

  const handleOpenDocument = async (e: React.MouseEvent, docUrl: string | null | undefined, label: string = 'Dokumen') => {
    e.preventDefault();
    if (!docUrl) return;
    const signedUrl = await getSignedUrl('item-documents', docUrl);
    if (signedUrl) {
      const extMatch = docUrl.match(/\.[a-zA-Z0-9]+(\?|$)/);
      const ext = extMatch ? extMatch[0].replace('?', '') : '';
      setDocumentPreview({ url: signedUrl, name: `${label}${ext}` });
    } else {
      showToast('Gagal membuka dokumen', 'error');
    }
  };

  const handleDownloadDocument = async () => {
    if (!documentPreview) return;
    try {
      const response = await fetch(documentPreview.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = documentPreview.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      showToast('Gagal mengunduh dokumen', 'error');
    }
  };

  const handleOpenCarousel = async (images: string[], index: number) => {
    const signedMap = await getSignedUrls('item-photos', images);
    setCarouselImages(images.map((url) => signedMap[url] || url));
    setCurrentCarouselIndex(index);
  };

  const handleOpenItemHistory = async (item: Item) => {
    setIsItemHistoryModalOpen(true);
    setLoadingItemHistory(true);
    try {
      const { data, error } = await supabase
        .from('item_audit_logs')
        .select('id, action, old_values, new_values, created_at, profiles(full_name)')
        .eq('item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      setItemHistoryLogs((data as any) || []);
    } catch (err) {
      console.error('Error fetching item history:', err);
      setItemHistoryLogs([]);
    } finally {
      setLoadingItemHistory(false);
    }
  };

  // id/created_at/updated_at gak berarti buat ditampilkan sebagai "perubahan" ke
  // user — updated_at khususnya selalu berubah tiap kali item disimpan.
  const TECHNICAL_DIFF_KEYS = ['id', 'created_at', 'updated_at'];

  const HISTORY_FIELD_LABELS: Record<string, string> = {
    kode_barang: 'Kode Barang',
    nama_barang: 'Nama Barang',
    jumlah_barang: 'Jumlah Barang',
    kode_lokasi: 'Lokasi',
    kategori_id: 'Kategori',
    kepemilikan_id: 'Kepemilikan',
    sifat_barang: 'Sifat Barang',
    kondisi_barang: 'Kondisi Barang',
    deskripsi: 'Deskripsi',
    foto_urls: 'Foto',
    flags: 'Flags',
    kelengkapan_garansi: 'Kelengkapan Garansi',
    dokumen_garansi_url: 'Dokumen Garansi',
    kelengkapan_sertifikat: 'Kelengkapan Sertifikat',
    dokumen_sertifikat_url: 'Dokumen Sertifikat',
    kelengkapan_manual: 'Kelengkapan Manual',
    dokumen_manual_url: 'Dokumen Manual',
    note_audit: 'Hasil Audit',
    tanggal_audit: 'Tanggal Audit',
    keterangan_restore: 'Keterangan Restore',
  };
  const HISTORY_FIELD_ORDER = Object.keys(HISTORY_FIELD_LABELS);

  const formatHistoryValue = (key: string, value: any): string => {
    if (value === undefined || value === null || value === '') return '-';
    if (key === 'kode_lokasi') return availableLocations.find(l => l.kode_lokasi === value)?.nama_lokasi || value;
    if (key === 'kategori_id') return categories.find(c => c.id === value)?.nama_kategori || value;
    if (key === 'kepemilikan_id') return kepemilikanList.find(k => k.id === value)?.nama_pemilik || value;
    if (key === 'foto_urls') return Array.isArray(value) ? `${value.length} foto` : '-';
    if (key === 'flags' && Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-';
    if (key === 'tanggal_audit') return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (key === 'kelengkapan_garansi' || key === 'kelengkapan_sertifikat' || key === 'kelengkapan_manual') {
      return value === true ? 'Ya' : value === false ? 'Tidak' : '-';
    }
    if (key === 'dokumen_garansi_url' || key === 'dokumen_sertifikat_url' || key === 'dokumen_manual_url') {
      return value ? 'Ada' : '-';
    }
    return String(value);
  };

  const getFieldChanges = (oldValues: Record<string, any> | null, newValues: Record<string, any> | null) => {
    if (!oldValues || !newValues) return [];
    const allKeys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
      .filter(key => !TECHNICAL_DIFF_KEYS.includes(key));
    const orderedKeys = [
      ...HISTORY_FIELD_ORDER.filter(key => allKeys.includes(key)),
      ...allKeys.filter(key => !HISTORY_FIELD_ORDER.includes(key)),
    ];
    return orderedKeys
      .filter(key => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))
      .map(key => ({
        label: HISTORY_FIELD_LABELS[key] || key,
        oldDisplay: formatHistoryValue(key, oldValues[key]),
        newDisplay: formatHistoryValue(key, newValues[key]),
      }));
  };

  const handleTakeItem = (item: Item) => {
    setSelectedItemForTake(item);
    setTakeItemData({ jumlah: 1, alasan: '' });
    setIsTakeItemModalOpen(true);
  };

  const handleStockOut = (item: Item) => {
    setSelectedItemForStockOut(item);
    setStockOutData({ alasan: '', lokasi_keluar: '' });
    setIsStockOutModalOpen(true);
  };

  const submitDisposalRequest = async () => {
    if (selectedItems.length === 0) return;
    setIsSubmittingDisposal(true);
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      let diajukan_oleh = profile?.full_name || 'Unknown';
      const nomorPengajuan = await generateDailyDocNumber('disposal_requests', 'nomor_pengajuan', 'PM');

      const reqRes = await supabase.from('disposal_requests').insert({
        nomor_pengajuan: nomorPengajuan,
        diajukan_oleh: diajukan_oleh,
        user_id: userId,
        jumlah: selectedItems.length,
        status: 'PENDING_AUDITOR',
        keterangan: disposalData.keterangan || null,
        alasan: disposalData.keterangan || '-',
        metode_pemusnahan: disposalData.metode_pemusnahan || null
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
        kondisi_barang: item.kondisi_barang,
        foto_urls: item.foto_urls || [],
        status_item: 'PENDING'
      }));

      const itemRes = await supabase.from('disposal_request_items').insert(insertItems);
      if (itemRes.error) throw itemRes.error;

      showToast('Pengajuan pemusnahan berhasil dibuat!', 'success');
      setIsDisposalModalOpen(false);
      setDisposalData({ keterangan: '', metode_pemusnahan: '' });
      setSelectedItems([]);
      setFilterPemusnahan(false);
      setIsPemusnahanModalOpen(false);
      // We don't deduct stock here, because it waits for final (Direktur) approval.
      fetchItems();
    } catch (err: any) {
      console.error(err);
      showToast('Gagal mengajukan pemusnahan: ' + err.message, 'error');
    } finally {
      setIsSubmittingDisposal(false);
    }
  };

  const confirmTakeItem = async () => {
    if (!selectedItemForTake) return;
    if (takeItemData.jumlah <= 0) {
      showToast('Jumlah harus lebih dari 0', 'error');
      return;
    }
    if (takeItemData.jumlah > selectedItemForTake.jumlah_barang) {
      showToast('Stok tidak mencukupi', 'error');
      return;
    }

    setFormLoading(true);
    try {
      // 1. Update stock
      const newStock = selectedItemForTake.jumlah_barang - takeItemData.jumlah;
      const { error: updateError } = await supabase
        .from('items')
        .update({ jumlah_barang: newStock })
        .eq('id', selectedItemForTake.id);

      if (updateError) throw updateError;

      // 2. Record history
      const locationName = availableLocations.find(loc => loc.kode_lokasi === selectedItemForTake.kode_lokasi)?.nama_lokasi;
      
      const { error: historyError } = await supabase
        .from('take_item_history')
        .insert([{
          item_id: selectedItemForTake.id,
          kode_barang: selectedItemForTake.kode_barang,
          nama_barang: selectedItemForTake.nama_barang,
          jumlah: takeItemData.jumlah,
          kode_lokasi: selectedItemForTake.kode_lokasi,
          nama_lokasi: locationName,
          user_id: profile?.id,
          user_name: profile?.full_name || profile?.email,
          alasan: takeItemData.alasan
        }]);

      if (historyError) throw historyError;

      showToast('Barang berhasil diambil', 'success');
      setIsTakeItemModalOpen(false);
      setSelectedItemForTake(null);
      fetchItems();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengambil barang', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const confirmStockOut = async () => {
    if (!selectedItemForStockOut) return;
    if (!stockOutData.alasan.trim()) {
      showToast('Alasan harus diisi', 'error');
      return;
    }

    setFormLoading(true);
    try {
      // 1. Copy to history
      const locationName = availableLocations.find(loc => loc.kode_lokasi === selectedItemForStockOut.kode_lokasi)?.nama_lokasi;
      
      const { error: insertError } = await supabase
        .from('stock_keluar_history')
        .insert([{
          original_item_id: selectedItemForStockOut.id,
          kode_barang: selectedItemForStockOut.kode_barang,
          nama_barang: selectedItemForStockOut.nama_barang,
          jumlah_barang: selectedItemForStockOut.jumlah_barang,
          kode_lokasi: selectedItemForStockOut.kode_lokasi,
          nama_lokasi: locationName,
          lokasi_keluar: stockOutData.lokasi_keluar,
          foto_urls: selectedItemForStockOut.foto_urls,
          deskripsi: selectedItemForStockOut.deskripsi,
          created_at: selectedItemForStockOut.created_at,
          updated_at: selectedItemForStockOut.updated_at,
          keterangan_alasan: stockOutData.alasan,
          user_name: profile?.full_name || profile?.email,
          tanggal_keluar: new Date().toISOString()
        }]);

      if (insertError) throw insertError;

      // 2. Delete from items
      const { error: deleteError } = await supabase
        .from('items')
        .delete()
        .eq('id', selectedItemForStockOut.id);

      if (deleteError) throw deleteError;

      showToast('Barang berhasil dipindahkan ke riwayat keluar', 'success');
      setIsStockOutModalOpen(false);
      setSelectedItemForStockOut(null);
      navigate('/stock-out-history');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeluarkan barang', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const generateNextKodeBarang = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('kode_barang')
        .ilike('kode_barang', 'BRG-%');

      if (error) throw error;

      if (!data || data.length === 0) {
        return 'BRG-1';
      }

      let maxNumber = 0;
      data.forEach(item => {
        const match = item.kode_barang.match(/^BRG-(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      });

      return `BRG-${maxNumber + 1}`;
    } catch (err) {
      console.error('Error generating next kode_barang:', err);
      return `BRG-${Math.floor(10000 + Math.random() * 90000)}`;
    }
  };

  const handleOpenAuditHistory = (item: Item) => {
    setIsAuditHistoryModalOpen(true);
    fetchAuditHistory(item.id);
  };

  const fetchAuditHistory = async (itemId: string) => {
    setLoadingAuditHistory(true);
    try {
      const { data, error } = await supabase
        .from('item_audit_history')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAuditHistory(data || []);
    } catch (err) {
      console.error('Error fetching audit history:', err);
    } finally {
      setLoadingAuditHistory(false);
    }
  };

  const handleOpenModal = async (item?: Item) => {
    if (profile?.role !== 'admin' && profile?.role !== 'auditor' && profile?.role !== 'spv') {
      showToast('Akses Ditolak: Anda tidak memiliki izin untuk melakukan aksi ini', 'error');
      return;
    }
    if (profile?.role === 'auditor' && !item) {
      showToast('Akses Ditolak: Auditor tidak dapat menambah barang baru', 'error');
      return;
    }

    if (item) {
      setEditingItem(item);
      setFormData({
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        jumlah_barang: item.jumlah_barang,
        kode_lokasi: item.kode_lokasi || '',
        kategori_id: item.kategori_id || '',
        kepemilikan_id: item.kepemilikan_id || '',
        sifat_barang: item.sifat_barang || 'PRIVATE',
        deskripsi: item.deskripsi || '',
        kelengkapan_garansi: item.kelengkapan_garansi || false,
        kelengkapan_sertifikat: item.kelengkapan_sertifikat || false,
        kelengkapan_manual: item.kelengkapan_manual || false,
        kondisi_barang: item.kondisi_barang || '',
        dokumen_garansi_url: item.dokumen_garansi_url || null,
        dokumen_sertifikat_url: item.dokumen_sertifikat_url || null,
        dokumen_manual_url: item.dokumen_manual_url || null,
        note_audit: item.note_audit || '',
        tanggal_audit: item.tanggal_audit || '',
        foto_urls: item.foto_urls || [],
        flags: item.flags || [],
      });
      setPreviewUrls(item.foto_urls || []);
      setRemovedPhotoUrls([]);
      setDocGaransiFile(null);
      setDocSertifikatFile(null);
      setDocManualFile(null);
      setAuditHistory([]);
      if (profile?.role === 'auditor') {
        fetchAuditHistory(item.id);
      }
    } else {
      setEditingItem(null);
      const nextKode = await generateNextKodeBarang();
      setFormData({
        kode_barang: nextKode,
        nama_barang: '',
        jumlah_barang: 0,
        kode_lokasi: '',
        kategori_id: '',
        kepemilikan_id: '',
        sifat_barang: 'PRIVATE',
        deskripsi: '',
        kelengkapan_garansi: false,
        kelengkapan_sertifikat: false,
        kelengkapan_manual: false,
        kondisi_barang: '',
        dokumen_garansi_url: null,
        dokumen_sertifikat_url: null,
        dokumen_manual_url: null,
        note_audit: '',
        tanggal_audit: '',
        foto_urls: [],
        flags: [],
      });
      setPreviewUrls([]);
      setRemovedPhotoUrls([]);
      setDocGaransiFile(null);
      setDocSertifikatFile(null);
      setDocManualFile(null);
    }
    setSelectedFiles([]);
    setFlagInput('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Kode Barang': 'BRG-00001',
        'Nama Barang': 'Contoh Nama Barang',
        'Jumlah': 10,
        'Deskripsi': 'Deskripsi singkat barang',
        'Lokasi': 'Gudang A',
        'Kategori': 'Elektronik',
        'Kepemilikan': 'Ibu Medelin',
        'Status Barang': 'PRIVATE',
        'Kondisi Barang': 'BAIK',
      },
    ];
    const headers = Object.keys(templateData[0]);
    const ws = XLSXStyle.utils.json_to_sheet(templateData);
    const headerStyle = {
      fill: { fgColor: { rgb: '3D2C44' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
      alignment: { horizontal: 'center', vertical: 'center' },
    };
    headers.forEach((_, colIdx) => {
      const cellRef = XLSXStyle.utils.encode_cell({ r: 0, c: colIdx });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 3, 14), 40) }));
    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Template Import');
    XLSXStyle.writeFile(wb, 'Template_Import_Master_Barang.xlsx');
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Tutup dropdown "Excel & PDF" di sini (bukan di onClick label) — kalau
    // dropdown ditutup pas label diklik, portal-nya (termasuk <input type="file">
    // di dalamnya) langsung ke-unmount SEBELUM dialog pilih file native selesai,
    // jadi event "change" dari file yang dipilih gak pernah nyampe (input-nya
    // udah gak ada di DOM). Makanya import kelihatan "gak masuk apa-apa".
    setFileMenuPos(null);
    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const validSifatBarang = ['OFFICE', 'PRIVATE', 'REUSABLE'];
        const validKondisiBarang = ['BAIK', 'CUKUP BAIK', 'RUSAK'];

        const previewData = data.map(row => {
          const sifatRaw = String(row['Status Barang'] || row['sifat_barang'] || '').toUpperCase().trim();
          const kondisiRaw = String(row['Kondisi Barang'] || row['kondisi_barang'] || '').toUpperCase().trim();
          return {
            // Dikosongkan kalau tidak diisi di Excel — nomornya dibuat berurutan
            // oleh sistem (bukan acak) saat konfirmasi import, supaya tidak
            // lompat-lompat.
            kode_barang: row['Kode Barang'] || row['kode_barang'] || '',
            nama_barang: row['Nama Barang'] || row['nama_barang'],
            jumlah_barang: parseInt(row['Jumlah'] || row['jumlah_barang']) || 0,
            deskripsi: row['Deskripsi'] || row['deskripsi'] || '',
            nama_lokasi: row['Lokasi'] || row['lokasi'] || '', // Temporary store name
            nama_kategori: row['Kategori'] || row['kategori'] || '', // Temporary store name
            nama_kepemilikan: row['Kepemilikan'] || row['kepemilikan'] || '', // Temporary store name
            sifat_barang: validSifatBarang.includes(sifatRaw) ? sifatRaw : 'PRIVATE',
            kondisi_barang: validKondisiBarang.includes(kondisiRaw) ? kondisiRaw : '',
          };
        }).filter(item => item.nama_barang);

        if (previewData.length === 0) {
          showToast('Tidak ada data valid untuk diimport', 'error');
          return;
        }

        setImportPreviewData(previewData);
        setIsImportPreviewOpen(true);
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file excel', 'error');
      } finally {
        setImportLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmImport = async () => {
    setImportLoading(true);
    try {
      // 0. Kode Barang otomatis (berurutan, bukan acak) untuk baris yang
      // dikosongkan di Excel — dihitung sekali dari nomor tertinggi yang ada,
      // lalu diberikan berurutan supaya tidak ada nomor yang lompat/bentrok
      // antar baris dalam satu batch import ini.
      const rowsNeedingAutoCode = importPreviewData.filter(item => !item.kode_barang).length;
      let nextCodeNumber = 1;
      if (rowsNeedingAutoCode > 0) {
        const { data: existingCodes } = await supabase.from('items').select('kode_barang').ilike('kode_barang', 'BRG-%');
        let maxNumber = 0;
        (existingCodes || []).forEach((item: any) => {
          const match = item.kode_barang.match(/^BRG-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNumber) maxNumber = num;
          }
        });
        nextCodeNumber = maxNumber + 1;
      }
      const previewDataWithCode = importPreviewData.map(item => ({
        ...item,
        kode_barang: item.kode_barang || `BRG-${nextCodeNumber++}`,
      }));

      // 1. Handle locations
      const uniqueLocationNames = Array.from(new Set(importPreviewData.map(item => item.nama_lokasi).filter(Boolean))) as string[];

      // Fetch existing locations
      const { data: existingLocs } = await supabase.from('master_lokasi').select('*');
      const locMap = new Map((existingLocs || []).map(l => [l.nama_lokasi.toLowerCase(), l.kode_lokasi]));

      // Create missing locations
      for (const name of uniqueLocationNames) {
        if (!locMap.has(name.toLowerCase())) {
          const newKode = `LOC-${Math.floor(1000 + Math.random() * 9000)}`;
          const { error: locError } = await supabase.from('master_lokasi').insert([{ kode_lokasi: newKode, nama_lokasi: name }]);
          if (!locError) locMap.set(name.toLowerCase(), newKode);
        }
      }

      // 2. Handle categories
      const uniqueCategoryNames = Array.from(new Set(importPreviewData.map(item => item.nama_kategori).filter(Boolean))) as string[];
      const { data: existingCats } = await supabase.from('categories').select('id, nama_kategori');
      const catMap = new Map((existingCats || []).map(c => [c.nama_kategori.toLowerCase(), c.id]));
      for (const name of uniqueCategoryNames) {
        if (!catMap.has(name.toLowerCase())) {
          const { data: newCat, error: catError } = await supabase.from('categories').insert([{ nama_kategori: name }]).select('id').single();
          if (!catError && newCat) catMap.set(name.toLowerCase(), newCat.id);
        }
      }

      // 3. Handle kepemilikan
      const uniqueKepemilikanNames = Array.from(new Set(importPreviewData.map(item => item.nama_kepemilikan).filter(Boolean))) as string[];
      const { data: existingKep } = await supabase.from('master_kepemilikan').select('id, nama_pemilik');
      const kepMap = new Map((existingKep || []).map(k => [k.nama_pemilik.toLowerCase(), k.id]));
      for (const name of uniqueKepemilikanNames) {
        if (!kepMap.has(name.toLowerCase())) {
          const { data: newKep, error: kepError } = await supabase.from('master_kepemilikan').insert([{ nama_pemilik: name }]).select('id').single();
          if (!kepError && newKep) kepMap.set(name.toLowerCase(), newKep.id);
        }
      }

      // 4. Map items ke kode_lokasi/kategori_id/kepemilikan_id — foto_urls
      // sengaja dikosongkan karena Excel tidak bisa membawa file foto;
      // barang hasil import perlu dilengkapi fotonya lewat Edit Barang.
      const itemsToInsert = previewDataWithCode.map(({ nama_lokasi, nama_kategori, nama_kepemilikan, kondisi_barang, ...rest }) => ({
        ...rest,
        kode_lokasi: nama_lokasi ? (locMap.get(nama_lokasi.toLowerCase()) || null) : null,
        kategori_id: nama_kategori ? (catMap.get(nama_kategori.toLowerCase()) || null) : null,
        kepemilikan_id: nama_kepemilikan ? (kepMap.get(nama_kepemilikan.toLowerCase()) || null) : null,
        kondisi_barang: kondisi_barang || null,
        foto_urls: [],
      }));

      const { error } = await supabase.from('items').insert(itemsToInsert);
      if (error) throw error;

      showToast(`${importPreviewData.length} barang berhasil diimport`, 'success');
      setIsImportPreviewOpen(false);
      setImportPreviewData([]);
      fetchItems();
    } catch (err: any) {
      showToast(err.message || 'Gagal mengimport data', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handlePrepareExport = () => {
    try {
      if (items.length === 0) {
        showToast('Tidak ada data untuk diexport', 'info');
        return;
      }

      // Prepare data for export — disinkronkan dengan urutan kolom di tabel Master Barang
      const dataToExport = items.map(item => ({
        'Jumlah Foto': (item.foto_urls || []).length,
        'Kode Barang': item.kode_barang,
        'Nama Barang': item.nama_barang,
        'Deskripsi': item.deskripsi || '-',
        'Lokasi': (item as any).master_lokasi?.nama_lokasi || 'Unassigned',
        'Kategori': (item as any).categories?.nama_kategori || 'Tanpa Kategori',
        'Kepemilikan': (item as any).master_kepemilikan?.nama_pemilik || '-',
        'Flags': (item.flags && item.flags.length > 0) ? item.flags.join(', ') : '-',
        'Status Barang': item.sifat_barang || 'PRIVATE',
        'Kondisi Barang': item.kondisi_barang || '-',
        'Kelengkapan Garansi': item.kelengkapan_garansi ? 'Ya' : 'Tidak',
        'Kelengkapan Sertifikat': item.kelengkapan_sertifikat ? 'Ya' : 'Tidak',
        'Kelengkapan Manual Book': item.kelengkapan_manual ? 'Ya' : 'Tidak',
        'Stok': item.jumlah_barang,
        'Hasil Audit': item.note_audit || '-',
        'Tanggal Audit': item.tanggal_audit ? new Date(item.tanggal_audit).toLocaleDateString('id-ID') : '-',
        'Tanggal Dibuat': new Date(item.created_at).toLocaleDateString('id-ID'),
      }));

      setExportData(dataToExport);
      setIsExportPreviewOpen(true);
    } catch (err: any) {
      showToast(err.message || 'Gagal menyiapkan data export', 'error');
    }
  };

  const handleConfirmExport = () => {
    try {
      if (exportData.length === 0) return;
      const headers = Object.keys(exportData[0]);

      // Create worksheet (pakai xlsx-js-style supaya bisa styling header)
      const ws = XLSXStyle.utils.json_to_sheet(exportData);

      // Style header: background gelap + teks putih tebal, rata tengah
      const headerStyle = {
        fill: { fgColor: { rgb: '3D2C44' } },
        font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 11 },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
      headers.forEach((_, colIdx) => {
        const cellRef = XLSXStyle.utils.encode_cell({ r: 0, c: colIdx });
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      });
      ws['!rows'] = [{ hpx: 22 }];

      // Lebar kolom menyesuaikan konten terpanjang tiap kolom (header vs data)
      ws['!cols'] = headers.map((header) => {
        const maxDataLen = exportData.reduce((max, row) => {
          const val = String((row as any)[header] ?? '');
          return Math.max(max, val.length);
        }, 0);
        const width = Math.max(header.length, maxDataLen) + 3;
        return { wch: Math.min(Math.max(width, 10), 45) };
      });

      // Create workbook
      const wb = XLSXStyle.utils.book_new();
      XLSXStyle.utils.book_append_sheet(wb, ws, 'Master Barang');

      // Save file
      XLSXStyle.writeFile(wb, `Master_Barang_${new Date().toISOString().split('T')[0]}.xlsx`);

      setIsExportPreviewOpen(false);
      showToast('Data berhasil diexport ke Excel', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeksport data', 'error');
    }
  };

  const getBase64ImageFromUrl = async (imageUrl: string) => {
    try {
      const signedUrl = await getSignedUrl('item-photos', imageUrl);
      if (!signedUrl) return null;
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  const handleExportPDF = async () => {
    if (items.length === 0) {
      showToast('Tidak ada data untuk diexport', 'info');
      return;
    }
    setIsExportingPDF(true);
    showToast('Sedang menyiapkan PDF...', 'info');

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const marginBottom = 18;
      const cardPadding = 4;
      const cardGap = 4;
      const photoSize = 24;
      const photoGap = 3;
      const lineH = 5.4;
      const textBlockHeight = lineH * 6; // nama + 4 baris detail + flags

      const cardInnerWidth = pageWidth - marginX * 2 - cardPadding * 2;
      const photosPerRow = Math.max(1, Math.floor((cardInnerWidth + photoGap) / (photoSize + photoGap)));

      let currentY = 20;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Katalog Master Barang', pageWidth / 2, currentY, { align: 'center' });
      currentY += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(
        `Diekspor: ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}  •  Total ${items.length} barang`,
        pageWidth / 2,
        currentY,
        { align: 'center' }
      );
      doc.setTextColor(0);
      currentY += 10;

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > pageHeight - marginBottom) {
          doc.addPage();
          currentY = 20;
          return true;
        }
        return false;
      };

      for (const item of items) {
        const photoUrls = item.foto_urls || [];
        const photoRowCount = photoUrls.length > 0 ? Math.ceil(photoUrls.length / photosPerRow) : 1;
        const photoBlockHeight = photoRowCount * photoSize + (photoRowCount - 1) * photoGap;
        const cardHeight = cardPadding * 2 + textBlockHeight + 4 + photoBlockHeight;

        checkPageBreak(cardHeight);

        const cardTop = currentY;

        // Card border
        doc.setDrawColor(220);
        doc.roundedRect(marginX, cardTop, pageWidth - marginX * 2, cardHeight, 2, 2, 'S');

        // Detail teks (bagian atas kartu)
        const textX = marginX + cardPadding;
        const maxTextWidth = cardInnerWidth;
        let textY = cardTop + cardPadding + 4;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const nameLines = doc.splitTextToSize(item.nama_barang, maxTextWidth);
        const displayName = nameLines.length > 1 ? `${nameLines[0].replace(/\s+\S*$/, '')}...` : nameLines[0];
        doc.text(displayName, textX, textY);
        textY += lineH + 1;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(90);

        const kategori = (item as any).categories?.nama_kategori || 'Tanpa Kategori';
        const lokasi = (item as any).master_lokasi?.nama_lokasi || '-';
        const kepemilikan = (item as any).master_kepemilikan?.nama_pemilik || '-';
        const status = item.sifat_barang || 'PRIVATE';
        const kondisi = item.kondisi_barang || '-';
        const flagsStr = item.flags && item.flags.length > 0 ? item.flags.join(', ') : '-';

        doc.text(`Kode: ${item.kode_barang}`, textX, textY);
        textY += lineH;
        doc.text(`Kategori: ${kategori}   |   Lokasi: ${lokasi}`, textX, textY);
        textY += lineH;
        doc.text(`Kepemilikan: ${kepemilikan}   |   Status: ${status}`, textX, textY);
        textY += lineH;
        doc.text(`Kondisi: ${kondisi}   |   Stok: ${item.jumlah_barang} unit`, textX, textY);
        textY += lineH;
        doc.text(`Flags: ${flagsStr}`, textX, textY, { maxWidth: maxTextWidth });
        doc.setTextColor(0);

        // Grid foto (semua foto, bukan cuma satu) di bawah info teks
        const photoBlockTop = cardTop + cardPadding + textBlockHeight + 4;
        if (photoUrls.length > 0) {
          for (let i = 0; i < photoUrls.length; i++) {
            const row = Math.floor(i / photosPerRow);
            const col = i % photosPerRow;
            const px = textX + col * (photoSize + photoGap);
            const py = photoBlockTop + row * (photoSize + photoGap);

            const base64Img = await getBase64ImageFromUrl(photoUrls[i]);
            if (base64Img) {
              try {
                doc.addImage(base64Img, 'JPEG', px, py, photoSize, photoSize);
              } catch (e) {
                doc.setDrawColor(230);
                doc.setFillColor(245, 245, 245);
                doc.roundedRect(px, py, photoSize, photoSize, 2, 2, 'FD');
              }
            } else {
              doc.setDrawColor(230);
              doc.setFillColor(245, 245, 245);
              doc.roundedRect(px, py, photoSize, photoSize, 2, 2, 'FD');
            }
          }
        } else {
          doc.setDrawColor(230);
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(textX, photoBlockTop, photoSize, photoSize, 2, 2, 'FD');
          doc.setFontSize(7);
          doc.setTextColor(160);
          doc.text('Tidak ada foto', textX + photoSize / 2, photoBlockTop + photoSize / 2, { align: 'center' });
          doc.setTextColor(0);
        }

        currentY = cardTop + cardHeight + cardGap;
      }

      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Halaman ${p} dari ${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
        doc.setTextColor(0);
      }

      doc.save(`Katalog_Master_Barang_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('PDF berhasil dibuat', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat PDF', 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleBulkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItems.length) return;
    setFormLoading(true);

    try {
      const updatePayload: any = {};
      if (bulkEditData.kode_lokasi) updatePayload.kode_lokasi = bulkEditData.kode_lokasi;
      if (bulkEditData.kategori_id) updatePayload.kategori_id = bulkEditData.kategori_id;
      if (bulkEditData.kepemilikan_id) updatePayload.kepemilikan_id = bulkEditData.kepemilikan_id;
      if (bulkEditData.sifat_barang) updatePayload.sifat_barang = bulkEditData.sifat_barang;
      if (bulkEditData.jumlah_barang !== -1) updatePayload.jumlah_barang = bulkEditData.jumlah_barang;

      if (Object.keys(updatePayload).length === 0) {
        showToast('Pilih setidaknya satu kolom untuk diubah', 'info');
        return;
      }

      const { error } = await supabase
        .from('items')
        .update(updatePayload)
        .in('id', selectedItems);

      if (error) throw error;
      showToast(`${selectedItems.length} barang berhasil diperbarui`, 'success');
      setIsBulkEditOpen(false);
      setBulkEditData({ kode_lokasi: '', kategori_id: '', kepemilikan_id: '', sifat_barang: '', jumlah_barang: -1 });
      fetchItems();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui barang secara massal', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file); // Fallback to original if compression fails
            }
          }, 'image/jpeg', 0.9); // 90% quality
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      setIsProcessingImages(true);
      
      try {
        const totalPhotos = formData.foto_urls.length + selectedFiles.length + files.length;
        if (totalPhotos > 10) {
          showToast('Maksimal 10 foto per barang', 'error');
          return;
        }

        const oversizedFiles = files.filter(f => f.size > 10 * 1024 * 1024); // Increased to 10MB before compression
        if (oversizedFiles.length > 0) {
          showToast('Beberapa file terlalu besar (Maks 10MB per foto)', 'error');
          return;
        }

        const nonImageFiles = files.filter(f => !f.type.startsWith('image/'));
        if (nonImageFiles.length > 0) {
          showToast('Hanya file gambar (JPG/PNG/WEBP/GIF) yang diperbolehkan', 'error');
          return;
        }

        // Compress images
        const compressedFiles = await Promise.all(
          files.map(async (file) => {
            if (file.type.startsWith('image/')) {
              return await compressImage(file);
            }
            return file;
          })
        );

        setSelectedFiles(prev => [...prev, ...compressedFiles]);
        const newPreviews = compressedFiles.map(f => URL.createObjectURL(f));
        setPreviewUrls(prev => [...prev, ...newPreviews]);
      } catch (error) {
        console.error('Error processing images:', error);
        showToast('Gagal memproses gambar', 'error');
      } finally {
        setIsProcessingImages(false);
        // Reset input value so the same file can be selected again if needed
        if (e.target) e.target.value = '';
      }
    }
  };

  const removePhoto = (index: number, isExisting: boolean) => {
    if (isExisting) {
      const removedUrl = formData.foto_urls[index];
      if (removedUrl) setRemovedPhotoUrls(prev => [...prev, removedUrl]);
      setFormData(prev => ({
        ...prev,
        foto_urls: prev.foto_urls.filter((_, i) => i !== index)
      }));
      setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    } else {
      // Adjust index for selected files
      const selectedIndex = index - formData.foto_urls.length;
      setSelectedFiles(prev => prev.filter((_, i) => i !== selectedIndex));
      setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    try {
      if (profile?.role !== 'admin' && profile?.role !== 'auditor' && profile?.role !== 'spv') {
        throw new Error('Akses Ditolak: Anda tidak memiliki izin untuk menyimpan perubahan');
      }
      
      let finalFotoUrls = [...formData.foto_urls];
      let finalDocGaransiUrl = formData.dokumen_garansi_url;
      let finalDocSertifikatUrl = formData.dokumen_sertifikat_url;
      let finalDocManualUrl = formData.dokumen_manual_url;

      // Helper function to upload document
      const ALLOWED_DOC_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
      const uploadDocument = async (file: File) => {
        if (!ALLOWED_DOC_TYPES.includes(file.type)) {
          throw new Error('Tipe dokumen tidak didukung. Gunakan PDF, DOC, DOCX, JPG, atau PNG.');
        }
        if (file.size > 15 * 1024 * 1024) {
          throw new Error('Ukuran dokumen terlalu besar (Maks 15MB)');
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `doc-${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('item-documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('item-documents')
          .getPublicUrl(fileName);
        
        return publicUrl;
      };

      if (profile?.role === 'admin' || profile?.role === 'spv') {
        if (docGaransiFile) {
          finalDocGaransiUrl = await uploadDocument(docGaransiFile);
        }
        if (docSertifikatFile) {
          finalDocSertifikatUrl = await uploadDocument(docSertifikatFile);
        }
        if (docManualFile) {
          finalDocManualUrl = await uploadDocument(docManualFile);
        }
      }

      // Upload new files (only if admin/spv)
      if (selectedFiles.length > 0 && (profile?.role === 'admin' || profile?.role === 'spv')) {
        setUploadingPhoto(true);
        const uploadPromises = selectedFiles.map(async (file) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('item-photos')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('item-photos')
            .getPublicUrl(fileName);
          
          return publicUrl;
        });

        const newUrls = await Promise.all(uploadPromises);
        finalFotoUrls = [...finalFotoUrls, ...newUrls];
        setUploadingPhoto(false);
      }

      if (profile?.role !== 'auditor' && finalFotoUrls.length === 0) {
        throw new Error('Minimal 1 foto barang wajib diupload');
      }

      let payload: any = {
        ...formData,
        kategori_id: formData.kategori_id || null,
        kepemilikan_id: formData.kepemilikan_id || null,
        kode_lokasi: formData.kode_lokasi || null,
        kondisi_barang: formData.kondisi_barang || null,
        note_audit: formData.note_audit || null,
        tanggal_audit: formData.tanggal_audit || null,
        dokumen_garansi_url: finalDocGaransiUrl,
        dokumen_sertifikat_url: finalDocSertifikatUrl,
        dokumen_manual_url: finalDocManualUrl,
        foto_urls: finalFotoUrls,
        updated_at: new Date().toISOString(),
      };

      if (profile?.role === 'auditor') {
        // Auditor can only update the audit result (note_audit) & tanggal_audit
        payload = {
          note_audit: formData.note_audit || null,
          tanggal_audit: formData.tanggal_audit || null,
          updated_at: new Date().toISOString(),
        };
      }

      if (editingItem) {
        const isChanged = profile?.role === 'auditor'
          ? (formData.note_audit !== (editingItem.note_audit || '') ||
             formData.tanggal_audit !== (editingItem.tanggal_audit || ''))
          : (formData.kode_barang !== editingItem.kode_barang ||
            formData.nama_barang !== editingItem.nama_barang ||
            formData.jumlah_barang !== editingItem.jumlah_barang ||
            formData.kode_lokasi !== (editingItem.kode_lokasi || '') ||
            formData.kategori_id !== (editingItem.kategori_id || '') ||
            formData.kepemilikan_id !== (editingItem.kepemilikan_id || '') ||
            formData.sifat_barang !== (editingItem.sifat_barang || 'PRIVATE') ||
            formData.deskripsi !== (editingItem.deskripsi || '') ||
            formData.kelengkapan_garansi !== (editingItem.kelengkapan_garansi || false) ||
            formData.kelengkapan_sertifikat !== (editingItem.kelengkapan_sertifikat || false) ||
            formData.kelengkapan_manual !== (editingItem.kelengkapan_manual || false) ||
            formData.kondisi_barang !== (editingItem.kondisi_barang || '') ||
            formData.note_audit !== (editingItem.note_audit || '') ||
            JSON.stringify(formData.flags) !== JSON.stringify(editingItem.flags || []) ||
            selectedFiles.length > 0 ||
            docGaransiFile !== null ||
            docSertifikatFile !== null ||
            docManualFile !== null ||
            formData.dokumen_garansi_url !== (editingItem.dokumen_garansi_url || null) ||
            formData.dokumen_sertifikat_url !== (editingItem.dokumen_sertifikat_url || null) ||
            formData.dokumen_manual_url !== (editingItem.dokumen_manual_url || null) ||
            JSON.stringify(formData.foto_urls) !== JSON.stringify(editingItem.foto_urls || []));

        if (!isChanged) {
          setIsModalOpen(false);
          setFormLoading(false);
          return;
        }

        const { error } = await supabase
          .from('items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;

        // Barang tersimpan — sekarang hapus juga file foto yang dicabut dari
        // storage, supaya tidak jadi file yatim yang menumpuk selamanya.
        if (removedPhotoUrls.length > 0) {
          try {
            const pathsToRemove = removedPhotoUrls.map((url) => extractPath('item-photos', url));
            await supabase.storage.from('item-photos').remove(pathsToRemove);
          } catch (storageErr) {
            console.error('Gagal menghapus file foto lama dari storage:', storageErr);
          }
        }

        // Catat hasil audit ini ke riwayat (bukan cuma menimpa nilai terakhir
        // di kolom items.note_audit/tanggal_audit) supaya histori audit
        // sebelumnya tetap tersimpan dan bisa ditampilkan.
        if (formData.note_audit &&
            (formData.note_audit !== (editingItem.note_audit || '') ||
             formData.tanggal_audit !== (editingItem.tanggal_audit || ''))) {
          try {
            await supabase.from('item_audit_history').insert({
              item_id: editingItem.id,
              note_audit: formData.note_audit,
              tanggal_audit: formData.tanggal_audit || null,
              audited_by: profile?.full_name || null,
            });
          } catch (histErr) {
            console.error('Gagal mencatat riwayat audit:', histErr);
          }
        }

        showToast('Barang berhasil diperbarui', 'success');
      } else {
        const { error } = await supabase
          .from('items')
          .insert([payload]);
        if (error) throw error;
        showToast('Barang berhasil ditambahkan', 'success');
      }

      setIsModalOpen(false);
      fetchItems();
      fetchFlagCatalog();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred');
    } finally {
      setFormLoading(false);
    }
  };

  const confirmBulkStockOut = async () => {
    if (!selectedItems.length) return;
    if (!stockOutData.alasan.trim()) {
      showToast('Alasan harus diisi', 'error');
      return;
    }

    setFormLoading(true);
    try {
      // 1. Get all selected items details
      const { data: itemsToMove, error: fetchError } = await supabase
        .from('items')
        .select('*')
        .in('id', selectedItems);

      if (fetchError) throw fetchError;
      if (!itemsToMove || itemsToMove.length === 0) throw new Error('Barang tidak ditemukan');

      // 2. Prepare history data
      const historyData = itemsToMove.map(item => ({
        original_item_id: item.id,
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        jumlah_barang: item.jumlah_barang,
        kode_lokasi: item.kode_lokasi,
        lokasi_keluar: stockOutData.lokasi_keluar,
        foto_urls: item.foto_urls,
        deskripsi: item.deskripsi,
        created_at: item.created_at,
        updated_at: item.updated_at,
        keterangan_alasan: stockOutData.alasan,
        user_name: profile?.full_name || profile?.email,
        tanggal_keluar: new Date().toISOString()
      }));

      // 3. Insert into history
      const { error: insertError } = await supabase
        .from('stock_keluar_history')
        .insert(historyData);

      if (insertError) throw insertError;

      // 4. Delete from items
      const { error: deleteError } = await supabase
        .from('items')
        .delete()
        .in('id', selectedItems);

      if (deleteError) throw deleteError;

      showToast(`${selectedItems.length} barang berhasil dipindahkan ke riwayat keluar`, 'success');
      setIsBulkStockOutModalOpen(false);
      setSelectedItems([]);
      navigate('/stock-out-history');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeluarkan barang secara massal', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block">Master Barang</h2>
        <p className="text-brand-purple">Kelola daftar inventaris barang Anda</p>
      </div>

      {/* Bulk Actions Bar */}
      {selectedItems.length > 0 && (profile?.role === 'admin' || profile?.role === 'spv') && !filterPemusnahan && (
        <div className="bg-brand-purple/10 backdrop-blur-xl border border-brand-purple/20 p-4 rounded-xl flex flex-wrap items-center justify-between gap-y-2 animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-brand-purple font-medium">{selectedItems.length} barang terpilih</span>
            <button
              onClick={() => setIsBulkEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-brand-cream text-brand-purple border border-brand-purple/20 text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Edit2 size={16} /> Edit Massal
            </button>
            <button
              onClick={() => {
                setStockOutData({ alasan: '' });
                setIsBulkStockOutModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-brand-cream text-brand-purple border border-brand-purple/20 text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              <LogOut size={16} className="text-brand-coral" /> Keluarkan Massal
            </button>
          </div>
          <button onClick={() => setSelectedItems([])} className="text-brand-purple/60 hover:text-brand-purple">
            <X size={20} />
          </button>
        </div>
      )}

      {/* Panel Kontrol: Search + Filter, digabung jadi satu kartu biar tidak numpuk.
          Dipadatkan (padding & tinggi dikecilkan, semua filter jadi 1 baris)
          supaya tabel barang di bawahnya gak keteken terlalu jauh. */}
      <div className="bg-white/60 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-white/50 space-y-2.5">
      {/* Search + semua filter cepat (Status, Kategori/Lokasi/Kepemilikan,
          Perlu Pemusnahan, Reset, Excel & PDF, Tambah Barang) dipaksa jadi
          SATU baris (flex-nowrap) — kalau layar sempit, baris ini scroll
          horizontal sendiri (overflow-x-auto) alih-alih pindah ke baris baru. */}
      <div className="flex items-center gap-2">
      {/* Cuma bagian filter yang scroll horizontal kalau kepanjangan — tombol
          aksi utama (Excel & PDF, Tambah Barang) sengaja ditaruh DI LUAR area
          scroll ini supaya selalu keliatan penuh, gak ikut ke-scroll/terpotong
          di layar sempit (mis. laptop 14"). */}
      <div className="flex-1 min-w-0 flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
        <div className="relative group shrink-0 w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-purple" size={16} />
          <input
            type="text"
            placeholder="Cari nama, kode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-purple hover:text-brand-purple"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={filterSifat}
          onChange={(e) => { setFilterSifat(e.target.value as '' | 'PRIVATE' | 'OFFICE' | 'REUSABLE'); setPage(1); }}
          className="shrink-0 px-3 py-2 border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm appearance-none bg-white font-medium"
        >
          <option value="">Semua Status</option>
          <option value="OFFICE">OFFICE</option>
          <option value="PRIVATE">PRIVATE</option>
          <option value="REUSABLE">REUSABLE</option>
        </select>

        {/* Kategori/Lokasi/Kepemilikan digabung jadi SATU tombol dropdown
            (accordion 3 bagian di dalamnya) supaya gak makan banyak tempat
            di baris filter. Dirender lewat portal (posisi dihitung manual)
            karena baris filter ini overflow-x-auto — kalau dropdown-nya taruh
            di dalam container itu langsung, dia ke-clip/gak keliatan. */}
        <div className="shrink-0">
          <button
            onClick={(e) => {
              if (dimensionMenuPos) {
                setDimensionMenuPos(null);
                setActiveFilterPanel('');
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setDimensionMenuPos({ top: rect.bottom + 8, left: rect.left });
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all",
              (filterKategori || filterLokasi || filterKepemilikan || dimensionMenuPos)
                ? "bg-orange-50 border-orange-300 text-orange-800"
                : "bg-white border-brand-purple/20 text-brand-purple hover:border-brand-purple/40"
            )}
          >
            <Filter size={15} className="shrink-0" />
            <span className="max-w-[160px] truncate">
              {[
                filterKategori && (filterKategori === 'unassigned' ? 'Tanpa Kategori' : categories.find(c => c.id === filterKategori)?.nama_kategori),
                filterLokasi && (filterLokasi === 'unassigned' ? 'Tanpa Lokasi' : availableLocations.find(l => l.kode_lokasi === filterLokasi)?.nama_lokasi),
                filterKepemilikan && (filterKepemilikan === 'unassigned' ? 'Tanpa Kepemilikan' : kepemilikanList.find(k => k.id === filterKepemilikan)?.nama_pemilik),
              ].filter(Boolean).join(', ') || 'Kategori, Lokasi, Kepemilikan'}
            </span>
            <ChevronDown size={14} className={cn("shrink-0 transition-transform", dimensionMenuPos && "rotate-180")} />
          </button>
          {dimensionMenuPos && createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setDimensionMenuPos(null); setActiveFilterPanel(''); }} />
              <div
                className="fixed w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
                style={{ top: dimensionMenuPos.top, left: dimensionMenuPos.left }}
              >
                {([
                  { key: 'kategori' as const, label: 'Kategori', icon: <Package size={14} />, value: filterKategori, setValue: setFilterKategori, list: categories as any[], nameKey: 'nama_kategori', idKey: 'id' },
                  { key: 'lokasi' as const, label: 'Lokasi', icon: <MapPin size={14} />, value: filterLokasi, setValue: setFilterLokasi, list: availableLocations as any[], nameKey: 'nama_lokasi', idKey: 'kode_lokasi' },
                  { key: 'kepemilikan' as const, label: 'Kepemilikan', icon: <UserCheck size={14} />, value: filterKepemilikan, setValue: setFilterKepemilikan, list: kepemilikanList as any[], nameKey: 'nama_pemilik', idKey: 'id' },
                ]).map((dim) => {
                  const currentLabel = dim.value
                    ? (dim.value === 'unassigned' ? `Tanpa ${dim.label}` : dim.list.find((it) => it[dim.idKey] === dim.value)?.[dim.nameKey] || 'Terpilih')
                    : `Semua ${dim.label}`;
                  return (
                    <div key={dim.key} className="border-b border-gray-50 last:border-0">
                      <button
                        onClick={() => setActiveFilterPanel(activeFilterPanel === dim.key ? '' : dim.key)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                      >
                        <span className="flex items-center gap-2 font-semibold">{dim.icon}{dim.label}</span>
                        <span className="flex items-center gap-1 text-xs text-brand-purple/60 min-w-0">
                          <span className="truncate max-w-[90px]">{currentLabel}</span>
                          <ChevronDown size={12} className={cn("transition-transform shrink-0", activeFilterPanel === dim.key && "rotate-180")} />
                        </span>
                      </button>
                      {activeFilterPanel === dim.key && (
                        <div className="bg-gray-50/60 py-1 max-h-48 overflow-y-auto">
                          {loadingDimensionStats ? (
                            <div className="py-4 text-center">
                              <Loader2 className="animate-spin mx-auto text-brand-purple" size={16} />
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => { dim.setValue(''); setPage(1); setActiveFilterPanel(''); setDimensionMenuPos(null); }}
                                className="w-full text-left px-6 py-1.5 text-xs text-brand-purple hover:bg-white transition-colors font-medium"
                              >
                                Semua {dim.label}
                              </button>
                              {dimensionStats.length === 0 ? (
                                <p className="px-6 py-1.5 text-xs text-brand-purple italic">Tidak ada data</p>
                              ) : (
                                dimensionStats.map((stat) => (
                                  <button
                                    key={stat.id}
                                    onClick={() => { dim.setValue(stat.id); setPage(1); setActiveFilterPanel(''); setDimensionMenuPos(null); }}
                                    className="w-full flex items-center justify-between gap-2 px-6 py-1.5 text-xs text-brand-purple hover:bg-white transition-colors"
                                  >
                                    <span className="truncate">{stat.name}</span>
                                    <span className="text-brand-purple/50 shrink-0">{stat.count}</span>
                                  </button>
                                ))
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>,
            document.body
          )}
        </div>

        {profile?.role !== 'auditor' && (
          <button
            onClick={() => {
              setFilterPemusnahan(true);
              setSelectedItems([]);
              setPage(1);
              setIsPemusnahanModalOpen(true);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all bg-white text-brand-purple border-brand-purple/20 hover:border-brand-purple/40"
          >
            <AlertTriangle size={15} className="text-red-500 shrink-0" />
            <span>Perlu Pemusnahan</span>
          </button>
        )}

        <button
          onClick={() => {
            setSearch('');
            setFilterLokasi('');
            setFilterKategori('');
            setFilterKepemilikan('');
            setFilterSifat('');
            setFilterPemusnahan(false);
            setActiveFilterPanel('');
            setDimensionMenuPos(null);
            setPage(1);
          }}
          title="Reset Pencarian & Filter"
          className="shrink-0 flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 rounded-lg transition-all"
        >
          <XCircle size={16} />
        </button>
      </div>

        {(profile?.role === 'admin' || profile?.role === 'spv') && (
          <div className="shrink-0 flex items-center gap-2">
            <div>
              <button
                onClick={(e) => {
                  if (fileMenuPos) {
                    setFileMenuPos(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setFileMenuPos({ top: rect.bottom + 8, left: Math.max(8, rect.right - 224) });
                  }
                }}
                className="flex items-center justify-center gap-2 bg-white hover:bg-brand-purple/5 border border-brand-purple/25 text-brand-purple px-3 py-2 rounded-lg transition-all shadow-sm font-semibold text-sm"
              >
                <FileSpreadsheet size={16} />
                <span>Excel &amp; PDF</span>
                <ChevronDown size={14} className={cn("transition-transform", fileMenuPos && "rotate-180")} />
              </button>
              {fileMenuPos && createPortal(
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFileMenuPos(null)} />
                  <div
                    className="fixed w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                    style={{ top: fileMenuPos.top, left: fileMenuPos.left }}
                  >
                    <button
                      onClick={() => { handleDownloadTemplate(); setFileMenuPos(null); }}
                      className="w-full flex items-center space-x-2.5 px-4 py-2.5 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                    >
                      <Download size={16} className="text-brand-purple" />
                      <span>Download Template</span>
                    </button>
                    <label
                      className="w-full flex items-center space-x-2.5 px-4 py-2.5 text-sm text-brand-purple hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      {importLoading ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : <FileSpreadsheet size={16} className="text-emerald-500" />}
                      <span>Import Excel</span>
                      <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} disabled={importLoading} />
                    </label>
                    <button
                      onClick={() => { handlePrepareExport(); setFileMenuPos(null); }}
                      className="w-full flex items-center space-x-2.5 px-4 py-2.5 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                    >
                      <FileSpreadsheet size={16} className="text-emerald-600" />
                      <span>Export Excel</span>
                    </button>
                    <button
                      onClick={() => { handleExportPDF(); setFileMenuPos(null); }}
                      disabled={isExportingPDF}
                      className="w-full flex items-center space-x-2.5 px-4 py-2.5 text-sm text-brand-purple hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {isExportingPDF ? <Loader2 size={16} className="animate-spin text-red-500" /> : <FileText size={16} className="text-red-500" />}
                      <span>Export PDF</span>
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 bg-brand-purple hover:bg-brand-purple-light text-white px-3 py-2 rounded-lg transition-all shadow-md shadow-brand-purple/20 font-semibold text-sm whitespace-nowrap"
            >
              <Plus size={18} />
              <span>Tambah Barang</span>
            </button>
          </div>
        )}
      </div>
      </div>

      {/* List Barang Pemusnahan sekarang tampil sebagai modal (bukan inline
          menggantikan tabel utama) — dipicu dari tombol "Perlu Pemusnahan" di
          bar Menunggu Persetujuan. Tabel & pagination di bawah ini dipakai
          bersama (sama persis) untuk mode biasa maupun mode pemusnahan,
          cuma dibungkus tampilan modal kalau isPemusnahanModalOpen aktif. */}
      <div className={cn(isPemusnahanModalOpen && "fixed inset-0 z-[70] bg-brand-purple/50 backdrop-blur-sm flex items-center justify-center p-4")}>
      <div className={cn(isPemusnahanModalOpen && "bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90dvh] overflow-y-auto flex flex-col p-4")}>
      {isPemusnahanModalOpen && (
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-lg font-bold text-brand-purple flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={20} />
            <span>List Barang Pemusnahan (Rusak/Cukup Baik)</span>
          </h3>
          <button
            onClick={() => {
              setIsPemusnahanModalOpen(false);
              setFilterPemusnahan(false);
              setSelectedItems([]);
              setPage(1);
            }}
            className="text-brand-purple hover:text-red-600"
          >
            <X size={22} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg overflow-hidden">
        <div
          className="overflow-x-auto custom-scrollbar"
          ref={tableContainerRef}
        >
          <table className="w-full text-left">
            <thead>
              <tr className="bg-brand-purple text-xs font-semibold text-white uppercase tracking-wider">
                <th className="pl-3 pr-1 py-3 w-8 rounded-tl-3xl">
                  <button onClick={toggleSelectAll} className="text-white/80 hover:text-white transition-colors">
                    {selectedItems.length === items.length && items.length > 0 ? <CheckSquare size={17} className="text-white" /> : <Square size={17} />}
                  </button>
                </th>
                <th className="px-3 py-3">Foto</th>
                <th
                  className="px-3 py-3 cursor-pointer hover:bg-white/10 transition-colors group"
                  onClick={() => handleSort('kode_barang')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Kode</span>
                    {sortColumn === 'kode_barang' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th
                  className="px-3 py-3 cursor-pointer hover:bg-white/10 transition-colors group"
                  onClick={() => handleSort('nama_barang')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Nama Barang</span>
                    {sortColumn === 'nama_barang' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-3 py-3">Deskripsi</th>
                <th
                  className="px-3 py-3 cursor-pointer hover:bg-white/10 transition-colors group"
                  onClick={() => handleSort('kode_lokasi')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Lokasi</span>
                    {sortColumn === 'kode_lokasi' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3">Kepemilikan</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Kondisi</th>
                <th className="px-3 py-3">Dokumen</th>
                <th
                  className="px-1.5 py-3 w-12 cursor-pointer hover:bg-white/10 transition-colors group"
                  onClick={() => handleSort('jumlah_barang')}
                >
                  <div className="flex items-center space-x-0.5">
                    <span>Stok</span>
                    {sortColumn === 'jumlah_barang' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="pl-2 pr-5 py-3 text-center rounded-tr-3xl">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
                    <p className="text-brand-purple">Memuat data...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center">
                    <Package className="mx-auto text-brand-purple mb-2" size={48} />
                    <p className="text-brand-purple">Tidak ada barang ditemukan</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={cn(
                    "hover:bg-brand-purple/5 transition-colors group cursor-pointer",
                    selectedItems.includes(item.id) && "bg-brand-purple/10"
                  )} onClick={() => handleShowDetail(item)}>
                    <td className="pl-3 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelectItem(item.id)} className="text-brand-purple hover:text-blue-600 transition-colors">
                        {selectedItems.includes(item.id) ? <CheckSquare size={17} className="text-blue-600" /> : <Square size={17} />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex -space-x-4 overflow-hidden py-1">
                        {item.foto_urls && item.foto_urls.length > 0 ? (
                          <>
                            {item.foto_urls.slice(0, 2).map((url, idx) => (
                              <SignedImage
                                key={idx}
                                bucket="item-photos"
                                path={url}
                                alt={`${item.nama_barang} ${idx + 1}`}
                                className="w-14 h-14 shrink-0 rounded-lg object-cover border-2 border-white shadow-md cursor-zoom-in hover:z-10 transition-transform hover:scale-110"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCarousel(item.foto_urls, idx);
                                }}
                              />
                            ))}
                            {item.foto_urls.length > 2 && (
                              <div className="w-14 h-14 shrink-0 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-bold text-brand-purple shadow-md">
                                +{item.foto_urls.length - 2}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-14 h-14 shrink-0 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-200 shadow-sm" title="Belum ada foto">
                            <AlertTriangle size={18} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-brand-purple">{item.kode_barang}</td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-medium text-brand-purple">{item.nama_barang}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs text-brand-purple">{item.deskripsi || '-'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {(item as any).master_lokasi?.nama_lokasi || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
                        {(item as any).categories?.nama_kategori || 'Tanpa Kategori'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-brand-purple">
                        {(item as any).master_kepemilikan?.nama_pemilik || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                        item.sifat_barang === 'OFFICE' ? "bg-sky-50 text-sky-700 border-sky-200" :
                        item.sifat_barang === 'REUSABLE' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        "bg-purple-50 text-purple-700 border-purple-200"
                      )}>
                        {item.sifat_barang || 'PRIVATE'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {item.kondisi_barang ? (
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                          item.kondisi_barang === 'BAIK' ? "bg-green-50 text-green-700 border-green-200" :
                          item.kondisi_barang === 'CUKUP BAIK' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          item.kondisi_barang === 'RUSAK' ? "bg-red-50 text-red-700 border-red-200" : ""
                        )}>
                          {item.kondisi_barang}
                        </span>
                      ) : (
                        <span className="text-brand-purple text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(item.dokumen_garansi_url || item.dokumen_sertifikat_url || item.dokumen_manual_url) ? (
                        <div className="flex flex-col gap-1 items-start">
                          {item.dokumen_garansi_url && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenDocument(e, item.dokumen_garansi_url, `${item.kode_barang} - Garansi`); }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              <FileText size={10} />
                              Garansi
                            </button>
                          )}
                          {item.dokumen_sertifikat_url && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenDocument(e, item.dokumen_sertifikat_url, `${item.kode_barang} - Sertifikat`); }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              <FileText size={10} />
                              Sertifikat
                            </button>
                          )}
                          {item.dokumen_manual_url && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOpenDocument(e, item.dokumen_manual_url, `${item.kode_barang} - Manual Book`); }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              <FileText size={10} />
                              Manual
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-brand-purple">-</span>
                      )}
                    </td>
                    <td className="px-1.5 py-3">
                      <div className={cn(
                        "text-sm font-bold",
                        item.jumlah_barang <= 5 ? "text-red-600" : "text-brand-purple"
                      )}>
                        {item.jumlah_barang}
                      </div>
                    </td>
                    <td className="pl-2 pr-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActionMenu(actionMenu?.itemId === item.id ? null : {
                            itemId: item.id,
                            top: rect.bottom + 4,
                            left: Math.max(8, rect.right - 192),
                          });
                        }}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-brand-purple rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <span>Aksi</span>
                        <ChevronDown size={14} className={cn("transition-transform", actionMenu?.itemId === item.id && "rotate-180")} />
                      </button>
                      {actionMenu?.itemId === item.id && createPortal(
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActionMenu(null)} />
                          <div
                            className="fixed w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                            style={{ top: actionMenu.top, left: actionMenu.left }}
                          >
                            <button
                              onClick={() => {
                                setActionMenu(null);
                                if (setHistorySearch) {
                                  setHistorySearch(item.kode_barang);
                                  navigate('/log-item-change');
                                }
                              }}
                              className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                            >
                              <History size={16} className="text-indigo-600 shrink-0" />
                              <span>Lihat Riwayat</span>
                            </button>
                            {(profile?.role === 'admin' || profile?.role === 'auditor' || profile?.role === 'spv') && (
                              <>
                                {(profile?.role === 'admin' || profile?.role === 'spv') && (
                                  <>
                                    <button
                                      onClick={() => { setActionMenu(null); handleStockOut(item); }}
                                      className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                                    >
                                      <Archive size={16} className="text-red-600 shrink-0" />
                                      <span>Keluarkan Barang</span>
                                    </button>
                                    <button
                                      onClick={() => { setActionMenu(null); handleTakeItem(item); }}
                                      className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                                    >
                                      <LogOut size={16} className="text-orange-600 shrink-0" />
                                      <span>Ambil Barang</span>
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => { setActionMenu(null); handleOpenModal(item); }}
                                  className="w-full flex items-center space-x-2.5 px-3.5 py-2 text-sm text-brand-purple hover:bg-gray-50 transition-colors"
                                >
                                  <Edit2 size={16} className="text-blue-600 shrink-0" />
                                  <span>Edit</span>
                                </button>
                              </>
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <p className="text-sm text-brand-purple">
              Menampilkan <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> barang
            </p>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-brand-purple">Per halaman:</span>
              <select 
                value={itemsPerPage} 
                onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value));
                  setPage(1);
                }}
                className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {[10, 20, 50, 100, 1000].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = page;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (page <= 3) pageNum = i + 1;
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = page - 2 + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                        page === pageNum ? "bg-brand-purple text-white" : "text-brand-purple hover:bg-gray-100"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
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

      {isPemusnahanModalOpen && selectedItems.length > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100 shrink-0">
          <span className="text-sm font-medium text-brand-purple">{selectedItems.length} barang dipilih</span>
          <button
            onClick={() => setIsDisposalModalOpen(true)}
            className="btn-confirm"
          >
            <FileWarning size={18} />
            <span>Ajukan Pemusnahan ({selectedItems.length} Barang)</span>
          </button>
        </div>
      )}
      </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">
                {editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-purple hover:text-brand-purple p-1 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              {formError && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded flex items-center">
                  <AlertCircle className="mr-2 shrink-0" size={18} />
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Details */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-amber-700 mb-1">Kepemilikan <span className="text-red-500">*</span></label>
                    <select
                      required
                      disabled={profile?.role === 'auditor'}
                      value={formData.kepemilikan_id}
                      onChange={(e) => setFormData({ ...formData, kepemilikan_id: e.target.value })}
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm bg-amber-50 font-medium text-amber-900 disabled:opacity-60 disabled:bg-gray-50"
                    >
                      <option value="" disabled>-- Pilih Kepemilikan --</option>
                      {kepemilikanList.map((k) => (
                        <option key={k.id} value={k.id}>{k.nama_pemilik}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-1">Kode Barang</label>
                    <input
                      type="text"
                      required
                      disabled={profile?.role === 'auditor'}
                      value={formData.kode_barang}
                      onChange={(e) => setFormData({ ...formData, kode_barang: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-gray-50 font-mono disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-1">Nama Barang</label>
                    <input
                      type="text"
                      required
                      disabled={profile?.role === 'auditor'}
                      value={formData.nama_barang}
                      onChange={(e) => setFormData({ ...formData, nama_barang: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-60 disabled:bg-gray-50"
                      placeholder="Contoh: Laptop Dell XPS 15"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-brand-purple mb-1">Jumlah</label>
                      <input
                        type="number"
                        min="0"
                        required
                        disabled={profile?.role === 'auditor'}
                        value={formData.jumlah_barang}
                        onChange={(e) => setFormData({ ...formData, jumlah_barang: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-60 disabled:bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-brand-purple mb-1">Kategori</label>
                      <select
                        disabled={profile?.role === 'auditor'}
                        value={formData.kategori_id}
                        onChange={(e) => setFormData({ ...formData, kategori_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white disabled:opacity-60 disabled:bg-gray-50"
                      >
                        <option value="">Tanpa Kategori</option>
                        {categories.filter(c => !c.parent_id).map((cat) => (
                          <optgroup key={cat.id} label={cat.nama_kategori}>
                            <option value={cat.id}>{cat.nama_kategori} (Utama)</option>
                            {categories.filter(sub => sub.parent_id === cat.id).map(sub => (
                              <option key={sub.id} value={sub.id}>-- {sub.nama_kategori}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-1">Lokasi</label>
                    <select
                      required
                      disabled={profile?.role === 'auditor'}
                      value={formData.kode_lokasi}
                      onChange={(e) => setFormData({ ...formData, kode_lokasi: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white disabled:opacity-60 disabled:bg-gray-50"
                    >
                      <option value="">Pilih Lokasi</option>
                      {availableLocations.filter(loc => !loc.parent_kode_lokasi).map((loc) => (
                        <optgroup key={loc.kode_lokasi} label={loc.nama_lokasi}>
                          <option value={loc.kode_lokasi}>{loc.nama_lokasi} (Utama)</option>
                          {availableLocations.filter(sub => sub.parent_kode_lokasi === loc.kode_lokasi).map(sub => (
                            <option key={sub.kode_lokasi} value={sub.kode_lokasi}>-- {sub.nama_lokasi}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-2">Status Barang <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-3 gap-3">
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.sifat_barang === 'OFFICE' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="sifat_barang"
                          value="OFFICE"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.sifat_barang === 'OFFICE'}
                          onChange={(e) => setFormData({ ...formData, sifat_barang: e.target.value as 'PRIVATE' | 'OFFICE' | 'REUSABLE' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">OFFICE</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.sifat_barang === 'PRIVATE' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="sifat_barang"
                          value="PRIVATE"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.sifat_barang === 'PRIVATE'}
                          onChange={(e) => setFormData({ ...formData, sifat_barang: e.target.value as 'PRIVATE' | 'OFFICE' | 'REUSABLE' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">PRIVATE</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.sifat_barang === 'REUSABLE' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="sifat_barang"
                          value="REUSABLE"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.sifat_barang === 'REUSABLE'}
                          onChange={(e) => setFormData({ ...formData, sifat_barang: e.target.value as 'PRIVATE' | 'OFFICE' | 'REUSABLE' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">REUSABLE</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-brand-purple mb-2">
                      <Tag size={14} className="text-teal-600" /> Flag
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.flags.map((flag) => {
                        const { classes, Icon } = getFlagStyle(flag);
                        return (
                          <span
                            key={flag}
                            className={cn("inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium", classes)}
                          >
                            <Icon size={11} className="shrink-0" />
                            {flag}
                            {profile?.role !== 'auditor' && (
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, flags: formData.flags.filter((f) => f !== flag) })}
                                className="opacity-60 hover:opacity-100"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      disabled={profile?.role === 'auditor'}
                      value={flagInput}
                      onChange={(e) => setFlagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          const value = flagInput.trim();
                          if (!value || formData.flags.some((f) => f.toLowerCase() === value.toLowerCase())) {
                            setFlagInput('');
                            return;
                          }
                          const existingDef = flagCatalog.find((f) => f.nama_flag.toLowerCase() === value.toLowerCase());
                          if (existingDef) {
                            setFormData({ ...formData, flags: [...formData.flags, existingDef.nama_flag] });
                            setFlagInput('');
                          } else {
                            // Flag baru — panel warna/ikon sudah tampil live saat mengetik,
                            // Enter di sini langsung konfirmasi & simpan pakai warna/ikon terpilih.
                            handleSaveNewFlag();
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-teal-50/30 disabled:opacity-60 disabled:bg-gray-50"
                      placeholder="Ketik nama flag..."
                    />

                    {(() => {
                      const trimmedLower = flagInput.trim().toLowerCase();
                      const suggestions = flagCatalog.filter((f) =>
                        !formData.flags.some((sel) => sel.toLowerCase() === f.nama_flag.toLowerCase()) &&
                        (trimmedLower === '' || f.nama_flag.toLowerCase().includes(trimmedLower))
                      );
                      if (suggestions.length === 0) return null;
                      return (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold text-brand-purple uppercase tracking-wide mb-1.5">Flag Tersedia (klik untuk pakai)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((f) => {
                              const { classes, Icon } = getFlagStyle(f.nama_flag);
                              return (
                                <span key={f.id} className={cn("inline-flex items-center gap-1 pl-2.5 pr-1 py-1 border rounded-full text-xs font-medium", classes)}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormData((prev) => ({ ...prev, flags: [...prev.flags, f.nama_flag] }));
                                      setFlagInput('');
                                    }}
                                    className="flex items-center gap-1"
                                  >
                                    <Icon size={11} className="shrink-0" />
                                    {f.nama_flag}
                                  </button>
                                  {profile?.role !== 'auditor' && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFlagDef(f.id, f.nama_flag)}
                                      className="opacity-50 hover:opacity-100 hover:text-red-600 transition-opacity"
                                      title="Hapus flag ini dari daftar referensi"
                                    >
                                      <X size={11} />
                                    </button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {(() => {
                      const trimmedFlagInput = flagInput.trim();
                      const alreadyAdded = trimmedFlagInput !== '' && formData.flags.some((f) => f.toLowerCase() === trimmedFlagInput.toLowerCase());
                      const matchedCatalogFlag = trimmedFlagInput !== '' ? flagCatalog.find((f) => f.nama_flag.toLowerCase() === trimmedFlagInput.toLowerCase()) : undefined;
                      const showNewFlagPicker = trimmedFlagInput !== '' && !alreadyAdded && !matchedCatalogFlag;
                      if (!showNewFlagPicker) return null;
                      return (
                      <div className="mt-2 p-3 border border-teal-200 bg-teal-50/40 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-brand-purple">
                            Buat flag baru: <span className="font-bold text-brand-purple">"{trimmedFlagInput}"</span>
                          </p>
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium", FLAG_COLOR_STYLES[newFlagColorKey])}>
                            {React.createElement(FLAG_ICON_MAP[newFlagIconKey], { size: 11, className: "shrink-0" })}
                            {trimmedFlagInput}
                          </span>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold text-brand-purple uppercase tracking-wide mb-1.5">Warna</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.keys(FLAG_COLOR_SWATCH).map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setNewFlagColorKey(key)}
                                className={cn(
                                  "w-7 h-7 rounded-full transition-all",
                                  FLAG_COLOR_SWATCH[key],
                                  newFlagColorKey === key ? "ring-2 ring-offset-1 ring-gray-800" : "hover:scale-110"
                                )}
                                title={key}
                              />
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] font-semibold text-brand-purple uppercase tracking-wide mb-1.5">Ikon</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(FLAG_ICON_MAP).map(([key, IconComp]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setNewFlagIconKey(key)}
                                className={cn(
                                  "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
                                  newFlagIconKey === key ? "border-brand-purple bg-white" : "border-gray-200 bg-white/60 hover:bg-white"
                                )}
                                title={key}
                              >
                                <IconComp size={15} className="text-brand-purple" />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => { setFlagInput(''); setNewFlagColorKey('teal'); setNewFlagIconKey('tag'); }}
                            className="px-3 py-1.5 text-xs font-medium text-brand-purple hover:bg-white rounded-lg transition-colors"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveNewFlag}
                            disabled={savingNewFlag}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {savingNewFlag && <Loader2 size={12} className="animate-spin" />}
                            Simpan Flag
                          </button>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-2">Kondisi Barang</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.kondisi_barang === 'BAIK' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="kondisi_barang"
                          value="BAIK"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.kondisi_barang === 'BAIK'}
                          onChange={(e) => setFormData({ ...formData, kondisi_barang: e.target.value as 'BAIK' | 'CUKUP BAIK' | 'RUSAK' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">BAIK</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.kondisi_barang === 'CUKUP BAIK' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="kondisi_barang"
                          value="CUKUP BAIK"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.kondisi_barang === 'CUKUP BAIK'}
                          onChange={(e) => setFormData({ ...formData, kondisi_barang: e.target.value as 'BAIK' | 'CUKUP BAIK' | 'RUSAK' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">CUKUP BAIK</span>
                      </label>
                      <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors ${formData.kondisi_barang === 'RUSAK' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name="kondisi_barang"
                          value="RUSAK"
                          disabled={profile?.role === 'auditor'}
                          checked={formData.kondisi_barang === 'RUSAK'}
                          onChange={(e) => setFormData({ ...formData, kondisi_barang: e.target.value as 'BAIK' | 'CUKUP BAIK' | 'RUSAK' })}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">RUSAK</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-2">Kelengkapan Dokumen</label>
                    <div className="space-y-3">
                      {/* Garansi */}
                      <div className="flex flex-col space-y-2 border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={profile?.role === 'auditor'}
                            checked={formData.kelengkapan_garansi}
                            onChange={(e) => setFormData({ ...formData, kelengkapan_garansi: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="text-sm font-medium text-brand-purple">Garansi</span>
                        </label>
                        {formData.kelengkapan_garansi && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocGaransiFile(e.target.files?.[0] || null)}
                              className="text-xs text-brand-purple file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              required={!formData.dokumen_garansi_url} // Required if no URL exists yet
                            />
                            {formData.dokumen_garansi_url && !docGaransiFile && (
                              <p className="text-xs text-green-600 mt-1">Dokumen tersimpan. Upload baru untuk mengganti.</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sertifikat */}
                      <div className="flex flex-col space-y-2 border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={profile?.role === 'auditor'}
                            checked={formData.kelengkapan_sertifikat}
                            onChange={(e) => setFormData({ ...formData, kelengkapan_sertifikat: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="text-sm font-medium text-brand-purple">Sertifikat</span>
                        </label>
                        {formData.kelengkapan_sertifikat && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocSertifikatFile(e.target.files?.[0] || null)}
                              className="text-xs text-brand-purple file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              required={!formData.dokumen_sertifikat_url}
                            />
                            {formData.dokumen_sertifikat_url && !docSertifikatFile && (
                              <p className="text-xs text-green-600 mt-1">Dokumen tersimpan. Upload baru untuk mengganti.</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Manual Book */}
                      <div className="flex flex-col space-y-2 border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={profile?.role === 'auditor'}
                            checked={formData.kelengkapan_manual}
                            onChange={(e) => setFormData({ ...formData, kelengkapan_manual: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                          />
                          <span className="text-sm font-medium text-brand-purple">Manual Book</span>
                        </label>
                        {formData.kelengkapan_manual && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocManualFile(e.target.files?.[0] || null)}
                              className="text-xs text-brand-purple file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              required={!formData.dokumen_manual_url}
                            />
                            {formData.dokumen_manual_url && !docManualFile && (
                              <p className="text-xs text-green-600 mt-1">Dokumen tersimpan. Upload baru untuk mengganti.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-brand-purple mb-1">Deskripsi</label>
                    <textarea
                      rows={3}
                      disabled={profile?.role === 'auditor'}
                      value={formData.deskripsi}
                      onChange={(e) => setFormData({ ...formData, deskripsi: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-60 disabled:bg-gray-50"
                      placeholder="Keterangan tambahan..."
                    />
                  </div>
                </div>

                {/* Right Column: Photo Upload */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-brand-purple">Foto Barang <span className="text-red-500">*</span> ({formData.foto_urls.length + selectedFiles.length}/10)</label>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {previewUrls.map((url, idx) => (
                      <div key={idx} className="relative aspect-square group">
                        {idx < formData.foto_urls.length ? (
                          <SignedImage bucket="item-photos" path={url} alt={`Preview ${idx}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                        ) : (
                          // Local blob: preview of a file not yet uploaded — render directly, not a storage path
                          <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                        )}
                        {profile?.role !== 'auditor' && (
                          <button
                            type="button"
                            onClick={() => removePhoto(idx, idx < formData.foto_urls.length)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    {profile?.role !== 'auditor' && formData.foto_urls.length + selectedFiles.length < 10 && (
                      <>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={isProcessingImages}
                          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-brand-purple hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingImages ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                          <span className="text-[10px] mt-1 font-medium">{isProcessingImages ? 'Memproses...' : 'Kamera'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isProcessingImages}
                          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-brand-purple hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingImages ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={20} />}
                          <span className="text-[10px] mt-1 font-medium">{isProcessingImages ? 'Memproses...' : 'Galeri'}</span>
                        </button>
                      </>
                    )}
                  </div>
                  {profile?.role !== 'auditor' && (
                    <p className="text-[10px] text-brand-purple italic">Maks 5MB per foto. Format: PNG, JPG, WEBP.</p>
                  )}
                  {/* Hidden input for Gallery (Multiple) */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={profile?.role === 'auditor'}
                  />
                  {/* Hidden input for Camera (Single, direct to camera) */}
                  <input
                    type="file"
                    ref={cameraInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={profile?.role === 'auditor'}
                  />
                </div>
              </div>

              {profile?.role === 'auditor' && (
                <div className="p-4 border-2 border-blue-200 bg-blue-50/40 rounded-2xl">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-3">
                    <ClipboardList size={16} />
                    Hasil Audit
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors bg-white ${formData.note_audit === 'ADA' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="note_audit"
                        value="ADA"
                        checked={formData.note_audit === 'ADA'}
                        onChange={(e) => setFormData({ ...formData, note_audit: e.target.value as 'ADA' | 'TIDAK ADA' })}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">ADA</span>
                    </label>
                    <label className={`flex items-center justify-center p-2 border rounded-lg cursor-pointer transition-colors bg-white ${formData.note_audit === 'TIDAK ADA' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="note_audit"
                        value="TIDAK ADA"
                        checked={formData.note_audit === 'TIDAK ADA'}
                        onChange={(e) => setFormData({ ...formData, note_audit: e.target.value as 'ADA' | 'TIDAK ADA' })}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">TIDAK ADA</span>
                    </label>
                  </div>

                  <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!formData.tanggal_audit}
                      onChange={(e) => setFormData({ ...formData, tanggal_audit: e.target.checked ? new Date().toISOString().split('T')[0] : '' })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-sm font-medium text-brand-purple flex items-center gap-1.5">
                      <Calendar size={14} className="text-brand-purple" />
                      Audit Hari Ini
                    </span>
                  </label>
                  {formData.tanggal_audit && (
                    <p className="text-xs text-brand-purple mt-1 ml-6">
                      Tanggal audit: {new Date(formData.tanggal_audit).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  )}

                  {editingItem && (
                    <div className="mt-4 pt-3 border-t border-blue-100">
                      <h5 className="flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
                        <History size={13} />
                        Riwayat Audit
                      </h5>
                      {loadingAuditHistory ? (
                        <div className="flex items-center text-xs text-brand-purple py-2">
                          <Loader2 size={14} className="animate-spin mr-1.5" />
                          Memuat riwayat...
                        </div>
                      ) : auditHistory.length === 0 ? (
                        <p className="text-xs text-brand-purple">Belum ada riwayat audit sebelumnya.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {auditHistory.map((h) => (
                            <div key={h.id} className="flex items-center justify-between text-xs bg-white border border-blue-100 rounded-lg px-2.5 py-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded-full font-semibold border shrink-0",
                                  h.note_audit === 'ADA' ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                                )}>
                                  {h.note_audit}
                                </span>
                                <span className="text-brand-purple truncate">{h.audited_by || 'Auditor'}</span>
                              </div>
                              <span className="text-brand-purple shrink-0 ml-2">
                                {new Date(h.tanggal_audit || h.created_at).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-cancel"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading || isProcessingImages}
                  className="btn-confirm"
                >
                  {formLoading || isProcessingImages ? <Loader2 className="animate-spin" size={18} /> : null}
                  <span>{isProcessingImages ? 'Memproses Foto...' : formLoading ? (uploadingPhoto ? 'Mengunggah Foto...' : 'Menyimpan...') : (editingItem ? 'Simpan Perubahan' : 'Tambah Barang')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bulk Edit Modal */}
      {isBulkEditOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Edit Massal ({selectedItems.length} barang)</h3>
              <button onClick={() => setIsBulkEditOpen(false)} className="text-brand-purple hover:text-brand-purple">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBulkEdit} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
              <div>
                <label className="block text-sm font-medium text-brand-purple mb-1">Ubah Lokasi</label>
                <select
                  value={bulkEditData.kode_lokasi}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, kode_lokasi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Pilih Lokasi Baru...</option>
                  {availableLocations.map((loc) => (
                    <option key={loc.kode_lokasi} value={loc.kode_lokasi}>{loc.nama_lokasi}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-purple mb-1">Ubah Kategori</label>
                <select
                  value={bulkEditData.kategori_id}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, kategori_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Pilih Kategori Baru...</option>
                  {categories.filter(c => !c.parent_id).map((cat) => (
                    <optgroup key={cat.id} label={cat.nama_kategori}>
                      <option value={cat.id}>{cat.nama_kategori} (Utama)</option>
                      {categories.filter(sub => sub.parent_id === cat.id).map(sub => (
                        <option key={sub.id} value={sub.id}>-- {sub.nama_kategori}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-purple mb-1">Ubah Kepemilikan</label>
                <select
                  value={bulkEditData.kepemilikan_id}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, kepemilikan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Pilih Kepemilikan Baru...</option>
                  {kepemilikanList.map((k) => (
                    <option key={k.id} value={k.id}>{k.nama_pemilik}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-purple mb-1">Ubah Status Barang</label>
                <select
                  value={bulkEditData.sifat_barang}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, sifat_barang: e.target.value as '' | 'PRIVATE' | 'OFFICE' | 'REUSABLE' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">Jangan Ubah Status</option>
                  <option value="OFFICE">OFFICE</option>
                  <option value="PRIVATE">PRIVATE</option>
                  <option value="REUSABLE">REUSABLE</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-purple mb-1">Ubah Jumlah Stok</label>
                <input
                  type="number"
                  min="-1"
                  value={bulkEditData.jumlah_barang}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, jumlah_barang: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="-1 untuk tidak mengubah"
                />
                <p className="text-xs text-brand-purple mt-1">Set ke -1 jika tidak ingin mengubah stok</p>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="btn-cancel"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-confirm"
                >
                  {formLoading ? 'Memproses...' : 'Terapkan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Import Preview Modal */}
      {isImportPreviewOpen && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Preview Import ({importPreviewData.length} barang)</h3>
              <button onClick={() => setIsImportPreviewOpen(false)} className="text-brand-purple hover:text-brand-purple">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className="flex items-start space-x-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>Foto barang tidak bisa dibawa lewat Excel — barang hasil import ini akan tersimpan tanpa foto dulu. Silakan lengkapi foto masing-masing barang lewat Edit Barang setelah import selesai. Kode Barang yang dikosongkan di Excel akan dibuat otomatis oleh sistem secara berurutan.</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-brand-purple font-semibold">
                    <th className="pb-3">Kode</th>
                    <th className="pb-3">Nama Barang</th>
                    <th className="pb-3">Jumlah</th>
                    <th className="pb-3">Lokasi</th>
                    <th className="pb-3">Kategori</th>
                    <th className="pb-3">Kepemilikan</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Kondisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {importPreviewData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-mono text-xs">
                        {row.kode_barang || <span className="italic text-brand-purple font-sans">(Otomatis)</span>}
                      </td>
                      <td className="py-3 font-medium">{row.nama_barang}</td>
                      <td className="py-3">{row.jumlah_barang}</td>
                      <td className="py-3">{row.nama_lokasi || '-'}</td>
                      <td className="py-3">{row.nama_kategori || '-'}</td>
                      <td className="py-3">{row.nama_kepemilikan || '-'}</td>
                      <td className="py-3">{row.sifat_barang}</td>
                      <td className="py-3">{row.kondisi_barang || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsImportPreviewOpen(false)}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importLoading}
                className="btn-confirm"
              >
                {importLoading && <Loader2 className="animate-spin" size={18} />}
                <span>Konfirmasi Import</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Carousel / Preview Modal */}
      {carouselImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-5xl h-full flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Close Button */}
            <button 
              className="absolute top-0 right-0 p-2 text-white/70 hover:text-white transition-colors z-10"
              onClick={() => setCarouselImages([])}
            >
              <X size={32} />
            </button>

            {/* Main Image */}
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

            {/* Thumbnails / Indicators */}
            {carouselImages.length > 1 && (
              <div className="mt-8 flex items-center space-x-2 overflow-x-auto pb-4 max-w-full scrollbar-hide">
                {carouselImages.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentCarouselIndex(idx)}
                    className={cn(
                      "w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0",
                      currentCarouselIndex === idx ? "border-blue-500 scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <img src={url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}

            {/* Counter */}
            <div className="mt-4 text-white/70 text-sm font-medium">
              {currentCarouselIndex + 1} / {carouselImages.length}
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {documentPreview && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-brand-purple/90 backdrop-blur-md animate-in fade-in duration-300"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-brand-purple/40 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-white text-sm font-medium truncate pr-4">{documentPreview.name}</span>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleDownloadDocument}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download size={16} />
                <span>Download</span>
              </button>
              <button
                onClick={() => setDocumentPreview(null)}
                className="p-1.5 text-white/70 hover:text-white transition-colors"
              >
                <X size={22} />
              </button>
            </div>
          </div>
          <div className="flex-1 p-2 sm:p-4 min-h-0" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`${documentPreview.url}#toolbar=0&navpanes=0`}
              title={documentPreview.name}
              className="w-full h-full bg-white rounded-lg shadow-2xl border-0"
            />
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {isDetailModalOpen && selectedItemForDetail && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Detail Barang</h3>
              <button 
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedItemForDetail(null);
                }} 
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Photos */}
                <div className="space-y-4">
                  <div 
                    className="aspect-square rounded-2xl bg-gray-100 overflow-hidden border border-gray-100 cursor-zoom-in group relative"
                    onClick={() => handleOpenCarousel(selectedItemForDetail.foto_urls, 0)}
                  >
                    {selectedItemForDetail.foto_urls && selectedItemForDetail.foto_urls.length > 0 ? (
                      <>
                        <SignedImage
                          bucket="item-photos"
                          path={selectedItemForDetail.foto_urls[0]}
                          alt={selectedItemForDetail.nama_barang}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-brand-purple/0 group-hover:bg-brand-purple/10 transition-colors flex items-center justify-center">
                          <Search className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-brand-purple">
                        <ImageIcon size={48} className="mb-2" />
                        <span className="text-sm">Tidak ada foto</span>
                      </div>
                    )}
                  </div>
                  
                  {selectedItemForDetail.foto_urls && selectedItemForDetail.foto_urls.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {selectedItemForDetail.foto_urls.slice(1).map((url, idx) => (
                        <div 
                          key={idx} 
                          className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-100 cursor-zoom-in hover:ring-2 hover:ring-blue-500 transition-all"
                          onClick={() => handleOpenCarousel(selectedItemForDetail.foto_urls, idx + 1)}
                        >
                          <SignedImage bucket="item-photos" path={url} alt={`Preview ${idx + 2}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Info */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Informasi Dasar</h4>
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-brand-purple">Nama Barang</p>
                          <p className="text-base font-bold text-brand-purple">{selectedItemForDetail.nama_barang}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                          <Hash size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-brand-purple">Kode Barang</p>
                          <p className="text-sm font-mono font-medium text-brand-purple">{selectedItemForDetail.kode_barang}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Lokasi & Kategori & Stok</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-brand-purple">Kategori</p>
                          <p className="text-sm font-medium text-brand-purple">{(selectedItemForDetail as any).categories?.nama_kategori || 'Tanpa Kategori'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                          <MapPin size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-brand-purple">Lokasi</p>
                          <p className="text-sm font-medium text-brand-purple">{(selectedItemForDetail as any).master_lokasi?.nama_lokasi || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Info size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-brand-purple">Stok Saat Ini</p>
                          <p className="text-sm font-bold text-brand-purple">{selectedItemForDetail.jumlah_barang} unit</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedItemForDetail.flags && selectedItemForDetail.flags.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Flags</h4>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedItemForDetail.flags.map((flag) => {
                          const { classes, Icon } = getFlagStyle(flag);
                          return (
                            <span key={flag} className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border", classes)}>
                              <Icon size={11} className="shrink-0" />
                              {flag}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Kondisi Barang</h4>
                    <div className="mt-2">
                      {selectedItemForDetail.kondisi_barang ? (
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border",
                          selectedItemForDetail.kondisi_barang === 'BAIK' ? "bg-green-50 text-green-700 border-green-200" :
                          selectedItemForDetail.kondisi_barang === 'CUKUP BAIK' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          selectedItemForDetail.kondisi_barang === 'RUSAK' ? "bg-red-50 text-red-700 border-red-200" : ""
                        )}>
                          {selectedItemForDetail.kondisi_barang}
                        </span>
                      ) : (
                        <span className="text-sm text-brand-purple">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Deskripsi</h4>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-sm text-brand-purple leading-relaxed">
                        {selectedItemForDetail.deskripsi || 'Tidak ada deskripsi tambahan untuk barang ini.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Kelengkapan Dokumen</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                       {selectedItemForDetail.kelengkapan_garansi ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Garansi: Ada
                           </span>
                           {selectedItemForDetail.dokumen_garansi_url && (
                             <a href="#" onClick={(e) => handleOpenDocument(e, selectedItemForDetail.dokumen_garansi_url, `${selectedItemForDetail.kode_barang} - Garansi`)} className="text-[10px] text-blue-600 hover:underline px-1">
                               Lihat Dokumen Garansi
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-brand-purple border-gray-200 h-[22px]">
                           Garansi: Tidak Ada
                         </span>
                       )}

                       {selectedItemForDetail.kelengkapan_sertifikat ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Sertifikat: Ada
                           </span>
                           {selectedItemForDetail.dokumen_sertifikat_url && (
                             <a href="#" onClick={(e) => handleOpenDocument(e, selectedItemForDetail.dokumen_sertifikat_url, `${selectedItemForDetail.kode_barang} - Sertifikat`)} className="text-[10px] text-blue-600 hover:underline px-1">
                               Lihat Dokumen Sertifikat
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-brand-purple border-gray-200 h-[22px]">
                           Sertifikat: Tidak Ada
                         </span>
                       )}

                       {selectedItemForDetail.kelengkapan_manual ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Manual Book: Ada
                           </span>
                           {selectedItemForDetail.dokumen_manual_url && (
                             <a href="#" onClick={(e) => handleOpenDocument(e, selectedItemForDetail.dokumen_manual_url, `${selectedItemForDetail.kode_barang} - Manual Book`)} className="text-[10px] text-blue-600 hover:underline px-1">
                               Lihat Dokumen Manual Book
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-brand-purple border-gray-200 h-[22px]">
                           Manual Book: Tidak Ada
                         </span>
                       )}
                    </div>
                  </div>

                  {selectedItemForDetail.note_audit && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Hasil Audit</h4>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border",
                          selectedItemForDetail.note_audit === 'ADA' ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                        )}>
                          {selectedItemForDetail.note_audit}
                        </span>
                        {selectedItemForDetail.tanggal_audit && (
                          <span className="text-xs text-brand-purple flex items-center gap-1">
                            <Calendar size={12} />
                            {new Date(selectedItemForDetail.tanggal_audit).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center text-xs text-brand-purple">
                      <Calendar size={14} className="mr-1" />
                      <span>Terakhir diperbarui: {new Date(selectedItemForDetail.updated_at).toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedItemForDetail(null);
                }}
                className="btn-cancel"
              >
                Tutup
              </button>
              <button
                onClick={() => handleOpenItemHistory(selectedItemForDetail)}
                className="px-6 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 bg-indigo-50 rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <History size={15} />
                <span>Riwayat</span>
              </button>
              <button
                onClick={() => handleOpenAuditHistory(selectedItemForDetail)}
                className="px-6 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 bg-blue-50 rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <ClipboardList size={15} />
                <span>Riwayat Audit</span>
              </button>
              {profile?.role === 'admin' || profile?.role === 'auditor' || profile?.role === 'spv' ? (
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenModal(selectedItemForDetail);
                  }}
                  className="btn-confirm"
                >
                  {profile?.role === 'auditor' ? 'Audit Barang' : 'Edit Barang'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-6 py-2 text-sm font-medium text-brand-purple bg-gray-100 rounded-lg cursor-not-allowed flex items-center space-x-2"
                >
                  <AlertCircle size={16} />
                  <span>Mode Lihat Saja</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Item History Modal — riwayat perubahan singkat tanpa pindah halaman */}
      {isItemHistoryModalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-brand-purple flex items-center gap-2">
                <History size={18} className="text-indigo-600" />
                Riwayat Perubahan
              </h3>
              <button
                onClick={() => setIsItemHistoryModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={18} className="text-brand-purple" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              {loadingItemHistory ? (
                <div className="flex items-center justify-center text-sm text-brand-purple py-8">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  Memuat riwayat...
                </div>
              ) : itemHistoryLogs.length === 0 ? (
                <p className="text-sm text-brand-purple text-center py-8">Belum ada riwayat perubahan untuk barang ini.</p>
              ) : (
                <div className="space-y-1.5">
                  {itemHistoryLogs.map((log) => (
                    <div key={log.id} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full font-semibold shrink-0",
                            log.action === 'CREATE' ? "bg-green-100 text-green-700" :
                            log.action === 'UPDATE' ? "bg-blue-100 text-blue-700" :
                            "bg-gray-100 text-brand-purple"
                          )}>
                            {log.action}
                          </span>
                          <span className="text-brand-purple truncate">{log.profiles?.full_name || 'Sistem'}</span>
                        </div>
                        <span className="text-brand-purple shrink-0 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {log.action === 'CREATE' ? (
                        <p className="text-brand-purple">Barang dibuat</p>
                      ) : (
                        <div className="space-y-0.5">
                          {getFieldChanges(log.old_values, log.new_values).map((chg, idx) => (
                            <p key={idx} className="text-brand-purple leading-relaxed">
                              <span className="font-medium text-brand-purple">{chg.label}:</span>{' '}
                              <span className="text-brand-purple">{chg.oldDisplay}</span>
                              <span className="mx-1 text-brand-purple">→</span>
                              <span className="text-brand-purple font-medium">{chg.newDisplay}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audit History Modal — seluruh riwayat hasil audit (item_audit_history)
          untuk barang ini, dipicu dari tombol "Riwayat Audit" di Detail Barang */}
      {isAuditHistoryModalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-brand-purple flex items-center gap-2">
                <ClipboardList size={18} className="text-blue-600" />
                Riwayat Audit
              </h3>
              <button
                onClick={() => setIsAuditHistoryModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={18} className="text-brand-purple" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              {loadingAuditHistory ? (
                <div className="flex items-center justify-center text-sm text-brand-purple py-8">
                  <Loader2 size={18} className="animate-spin mr-2" />
                  Memuat riwayat...
                </div>
              ) : auditHistory.length === 0 ? (
                <p className="text-sm text-brand-purple text-center py-8">Belum ada riwayat audit untuk barang ini.</p>
              ) : (
                <div className="space-y-1.5">
                  {auditHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full font-semibold border shrink-0",
                          h.note_audit === 'ADA' ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                        )}>
                          {h.note_audit || '-'}
                        </span>
                        <span className="text-brand-purple truncate">{h.audited_by || 'Auditor'}</span>
                      </div>
                      <span className="text-brand-purple shrink-0 ml-2">
                        {new Date(h.tanggal_audit || h.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Take Item Modal */}
      {isTakeItemModalOpen && selectedItemForTake && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Ambil Barang: {selectedItemForTake.nama_barang}</h3>
              <button 
                onClick={() => setIsTakeItemModalOpen(false)} 
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); confirmTakeItem(); }} className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              <div className="space-y-2">
                <label htmlFor="takeJumlah" className="block text-sm font-medium text-brand-purple">Jumlah yang Diambil</label>
                <input
                  type="number"
                  id="takeJumlah"
                  value={takeItemData.jumlah}
                  onChange={(e) => setTakeItemData({ ...takeItemData, jumlah: parseInt(e.target.value) || 0 })}
                  min="1"
                  max={selectedItemForTake.jumlah_barang}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  required
                />
                <p className="text-xs text-brand-purple">Stok Tersedia: {selectedItemForTake.jumlah_barang}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="takeAlasan" className="block text-sm font-medium text-brand-purple">Alasan/Tujuan</label>
                <textarea
                  id="takeAlasan"
                  value={takeItemData.alasan}
                  onChange={(e) => setTakeItemData({ ...takeItemData, alasan: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Misal: Untuk proyek X, rusak, dll."
                  required
                ></textarea>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsTakeItemModalOpen(false)}
                  className="btn-cancel"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-confirm"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                  <span>Konfirmasi Ambil</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Out Modal */}
      {isStockOutModalOpen && selectedItemForStockOut && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Keluarkan Barang ke Riwayat</h3>
              <button 
                onClick={() => setIsStockOutModalOpen(false)} 
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              {/* Data Preview (Read-only) */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <span className="text-xs font-semibold text-brand-purple uppercase">Preview Data Barang</span>
                  <span className="text-[10px] bg-gray-200 text-brand-purple px-2 py-0.5 rounded font-bold">READ ONLY</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-brand-purple uppercase font-bold">Kode Barang</p>
                      <p className="text-sm font-mono text-brand-purple">{selectedItemForStockOut.kode_barang}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-brand-purple uppercase font-bold">Nama Barang</p>
                      <p className="text-sm font-medium text-brand-purple">{selectedItemForStockOut.nama_barang}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-brand-purple uppercase font-bold">Lokasi</p>
                      <p className="text-sm text-brand-purple">{(selectedItemForStockOut as any).master_lokasi?.nama_lokasi || '-'}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-brand-purple uppercase font-bold">Stok Saat Ini</p>
                      <p className="text-sm font-bold text-brand-purple">{selectedItemForStockOut.jumlah_barang} unit</p>
                    </div>
                    {selectedItemForStockOut.foto_urls && selectedItemForStockOut.foto_urls.length > 0 && (
                      <div>
                        <p className="text-[10px] text-brand-purple uppercase font-bold mb-1">Foto</p>
                        <div className="flex -space-x-2">
                          {selectedItemForStockOut.foto_urls.slice(0, 4).map((url, idx) => (
                            <SignedImage key={idx} bucket="item-photos" path={url} className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="Preview" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Input Field */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Lokasi Tujuan / Barang Keluar <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={stockOutData.lokasi_keluar}
                    onChange={(e) => setStockOutData({ ...stockOutData, lokasi_keluar: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="">Pilih Lokasi</option>
                    {availableLocations.filter(loc => !loc.parent_kode_lokasi).map((loc) => (
                      <optgroup key={loc.kode_lokasi} label={loc.nama_lokasi}>
                        <option value={loc.nama_lokasi}>{loc.nama_lokasi} (Utama)</option>
                        {availableLocations.filter(sub => sub.parent_kode_lokasi === loc.kode_lokasi).map(sub => (
                          <option key={sub.kode_lokasi} value={sub.nama_lokasi}>-- {sub.nama_lokasi}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Keterangan / Alasan Keluar <span className="text-red-500">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={stockOutData.alasan}
                    onChange={(e) => setStockOutData({ ...stockOutData, alasan: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Contoh: Barang Rusak, Hibah, Pindah Lokasi Permanen, dll."
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsStockOutModalOpen(false)}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={confirmStockOut}
                disabled={formLoading}
                className="btn-confirm"
              >
                {formLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                <span>Konfirmasi Pindah ke Riwayat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disposal Request Modal */}
      {isDisposalModalOpen && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-red-50/50 shrink-0">
              <div className="flex items-center space-x-2 text-red-700">
                <FileWarning size={20} />
                <h3 className="text-lg font-bold">Ajukan Pemusnahan</h3>
              </div>
              <button 
                onClick={() => !isSubmittingDisposal && setIsDisposalModalOpen(false)} 
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
                disabled={isSubmittingDisposal}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start space-x-3">
                <AlertTriangle className="text-red-600 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-bold text-red-800">Pengajuan Approval Pemusnahan</p>
                  <p className="text-xs text-red-700 mt-1">
                    Anda akan mengajukan <strong>{selectedItems.length} barang</strong> untuk dimusnahkan. 
                    Barang ini tidak akan langsung dihapus, melainkan menunggu persetujuan (Level 1 dan Level 2).
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Metode Pemusnahan <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={disposalData.metode_pemusnahan}
                    onChange={(e) => setDisposalData({ ...disposalData, metode_pemusnahan: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white"
                  >
                    <option value="">Pilih Metode Pemusnahan</option>
                    <option value="Dibakar">Dibakar</option>
                    <option value="Dihancurkan">Dihancurkan</option>
                    <option value="Dijual ke penampungan barang bekas">Dijual ke penampungan barang bekas</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Keterangan / Alasan Pemusnahan <span className="text-red-500">*</span></label>
                  <textarea
                    required
                    rows={4}
                    value={disposalData.keterangan}
                    onChange={(e) => setDisposalData({ ...disposalData, keterangan: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white"
                    placeholder="Tuliskan keterangan detail mengapa barang-barang ini diajukan untuk dimusnahkan..."
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsDisposalModalOpen(false)}
                disabled={isSubmittingDisposal}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={submitDisposalRequest}
                disabled={isSubmittingDisposal || !disposalData.keterangan.trim() || !disposalData.metode_pemusnahan}
                className="btn-confirm"
              >
                {isSubmittingDisposal ? <Loader2 className="animate-spin" size={18} /> : <CheckSquare size={18} />}
                <span>Ajukan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Stock Out Modal */}
      {isBulkStockOutModalOpen && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Keluarkan {selectedItems.length} Barang</h3>
              <button 
                onClick={() => setIsBulkStockOutModalOpen(false)} 
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-start space-x-3">
                <AlertCircle className="text-orange-600 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-orange-800">Peringatan</p>
                  <p className="text-xs text-orange-700">
                    Anda akan mengeluarkan <span className="font-bold">{selectedItems.length} barang</span> sekaligus. 
                    Barang-barang ini akan dipindahkan ke riwayat dan dihapus dari daftar master.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Lokasi Tujuan / Barang Keluar <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={stockOutData.lokasi_keluar}
                    onChange={(e) => setStockOutData({ ...stockOutData, lokasi_keluar: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="">Pilih Lokasi</option>
                    {availableLocations.filter(loc => !loc.parent_kode_lokasi).map((loc) => (
                      <optgroup key={loc.kode_lokasi} label={loc.nama_lokasi}>
                        <option value={loc.nama_lokasi}>{loc.nama_lokasi} (Utama)</option>
                        {availableLocations.filter(sub => sub.parent_kode_lokasi === loc.kode_lokasi).map(sub => (
                          <option key={sub.kode_lokasi} value={sub.nama_lokasi}>-- {sub.nama_lokasi}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-brand-purple">Keterangan / Alasan Keluar Massal <span className="text-red-500">*</span></label>
                  <textarea
                    required
                    rows={3}
                    value={stockOutData.alasan}
                    onChange={(e) => setStockOutData({ ...stockOutData, alasan: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Contoh: Pembersihan Gudang, Hibah Massal, dll."
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsBulkStockOutModalOpen(false)}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={confirmBulkStockOut}
                disabled={formLoading}
                className="btn-confirm"
              >
                {formLoading ? <Loader2 className="animate-spin" size={18} /> : null}
                <span>Konfirmasi Keluarkan Massal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      {isExportPreviewOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple">Preview Export ({exportData.length} baris)</h3>
              <button onClick={() => setIsExportPreviewOpen(false)} className="text-brand-purple hover:text-brand-purple">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-brand-purple font-semibold">
                    {exportData.length > 0 && Object.keys(exportData[0]).map(key => (
                      <th key={key} className="pb-3 px-2">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.values(row).map((val: any, i) => (
                        <td key={i} className="py-2 px-2 text-brand-purple">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsExportPreviewOpen(false)}
                className="btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmExport}
                className="btn-confirm"
              >
                <Download size={18} />
                <span>Konfirmasi Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
