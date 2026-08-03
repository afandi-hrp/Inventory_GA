import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Filter, Edit2, ChevronLeft, ChevronRight, 
  Package, Image as ImageIcon, Upload, Download, X, Loader2, AlertCircle,
  FileSpreadsheet, CheckSquare, Square, MoreHorizontal,
  ArrowUpDown, ChevronUp, ChevronDown, Info, Calendar, MapPin, Hash,
  LogOut, History, ClipboardList, Archive, XCircle, Camera, AlertTriangle, FileWarning
} from 'lucide-react';
import { Item } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useToast } from '../UI/Toast';
import { DisposalApprovalModal } from './DisposalApprovalModal';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [page, setPage] = useState(1);
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
  const [isApprovalListModalOpen, setIsApprovalListModalOpen] = useState(false);
  const [disposalData, setDisposalData] = useState({ keterangan: '', metode_pemusnahan: '' });
  const [isSubmittingDisposal, setIsSubmittingDisposal] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<Item | null>(null);
  const [selectedItemForTake, setSelectedItemForTake] = useState<Item | null>(null);
  const [selectedItemForStockOut, setSelectedItemForStockOut] = useState<Item | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);

  // Export state
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    kode_barang: '',
    nama_barang: '',
    jumlah_barang: 0,
    kode_lokasi: '',
    kategori_id: '',
    deskripsi: '',
    kelengkapan_garansi: false,
    kelengkapan_sertifikat: false,
    kelengkapan_manual: false,
    kondisi_barang: '' as 'BAIK' | 'CUKUP BAIK' | 'RUSAK' | '',
    dokumen_garansi_url: '' as string | null,
    dokumen_sertifikat_url: '' as string | null,
    dokumen_manual_url: '' as string | null,
    note_audit: '',
    foto_urls: [] as string[],
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
  const [filterKategori, setFilterKategori] = useState('');
  const [filterPemusnahan, setFilterPemusnahan] = useState(false);

  const [bulkEditData, setBulkEditData] = useState({
    kode_lokasi: '',
    kategori_id: '',
    jumlah_barang: -1, // -1 means no change
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  // Stats States
  const [categoryStats, setCategoryStats] = useState<{
    id: string, 
    name: string, 
    count: number, 
    stock: number, 
    locations: {name: string, kode: string, count: number, stock: number}[]
  }[]>([]);
  const [selectedTopCategory, setSelectedTopCategory] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const topScrollbarRef = useRef<HTMLDivElement>(null);
  const [tableContentWidth, setTableContentWidth] = useState(0);

  useEffect(() => {
    if (!tableContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (tableContainerRef.current) {
        setTableContentWidth(tableContainerRef.current.scrollWidth);
      }
    });
    observer.observe(tableContainerRef.current);
    const table = tableContainerRef.current.querySelector('table');
    if (table) observer.observe(table);
    
    return () => observer.disconnect();
  }, [items]);

  const handleTopScroll = () => {
    if (topScrollbarRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = topScrollbarRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollbarRef.current && tableContainerRef.current) {
      topScrollbarRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (profile) {
      console.log('Current User Profile:', profile);
    }
    fetchItems();
    fetchCategories();
  }, [page, debouncedSearch, filterLokasi, filterKategori, filterPemusnahan, itemsPerPage, profile, sortColumn, sortOrder]);

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

  async function fetchStatsAndLocations() {
    try {
      const [locRes, itemsRes, catRes] = await Promise.all([
        supabase.from('master_lokasi').select('*').order('nama_lokasi'),
        supabase.from('items').select('kategori_id, kode_lokasi, jumlah_barang, master_lokasi(nama_lokasi)'),
        supabase.from('categories').select('*')
      ]);
      
      if (locRes.error) throw locRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (catRes.error) throw catRes.error;
      
      const allCats = catRes.data || [];
      const catMapById = new Map(allCats.map(c => [c.id, c]));
      
      if (locRes.data) {
        setAvailableLocations(locRes.data);
      }

      if (itemsRes.data) {
        const catMap: Record<string, {
          id: string, 
          name: string, 
          count: number, 
          stock: number, 
          locs: Record<string, {kode: string, name: string, count: number, stock: number}>
        }> = {};

        itemsRes.data.forEach(item => {
          const itemCatId = item.kategori_id;
          let topCatId = 'unassigned';
          let topCatName = 'Tanpa Kategori';

          if (itemCatId) {
            const cat = catMapById.get(itemCatId);
            if (cat) {
              if (cat.parent_id) {
                // Roll up to parent
                const parentCat = catMapById.get(cat.parent_id);
                if (parentCat) {
                  topCatId = parentCat.id;
                  topCatName = parentCat.nama_kategori;
                } else {
                  topCatId = cat.id;
                  topCatName = cat.nama_kategori;
                }
              } else {
                topCatId = cat.id;
                topCatName = cat.nama_kategori;
              }
            }
          }

          const locKode = item.kode_lokasi || 'unassigned';
          const locName = (item as any).master_lokasi?.nama_lokasi || locKode || 'Tanpa Lokasi';
          
          if (!catMap[topCatId]) {
            catMap[topCatId] = { id: topCatId, name: topCatName, count: 0, stock: 0, locs: {} };
          }
          catMap[topCatId].count += 1;
          catMap[topCatId].stock += (item.jumlah_barang || 0);

          if (!catMap[topCatId].locs[locKode]) {
            catMap[topCatId].locs[locKode] = { kode: locKode, name: locName, count: 0, stock: 0 };
          }
          catMap[topCatId].locs[locKode].count += 1;
          catMap[topCatId].locs[locKode].stock += (item.jumlah_barang || 0);
        });
        
        const catArray = Object.values(catMap).map(cat => ({
          id: cat.id,
          name: cat.name,
          count: cat.count,
          stock: cat.stock,
          locations: Object.values(cat.locs).sort((a,b) => b.count - a.count)
        })).sort((a, b) => b.count - a.count);
        
        setCategoryStats(catArray);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }

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
          )
        `, { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`nama_barang.ilike.%${debouncedSearch}%,kode_barang.ilike.%${debouncedSearch}%,deskripsi.ilike.%${debouncedSearch}%`);
      }

      if (filterLokasi) {
        query = query.eq('kode_lokasi', filterLokasi);
      }

      if (filterKategori) {
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

  const handleOpenCarousel = (images: string[], index: number) => {
    setCarouselImages(images);
    setCurrentCarouselIndex(index);
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

      const reqRes = await supabase.from('disposal_requests').insert({
        nomor_pengajuan: `PM-${Date.now()}`,
        diajukan_oleh: diajukan_oleh,
        user_id: userId,
        jumlah: selectedItems.length,
        status: 'PENDING_L1',
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
      setDisposalData({ keterangan: '' });
      setSelectedItems([]);
      setFilterPemusnahan(false);
      // We don't deduct stock here, because it waits for L2 approval.
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

  const handleOpenModal = async (item?: Item) => {
    if (profile?.role !== 'admin' && profile?.role !== 'auditor') {
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
        deskripsi: item.deskripsi || '',
        kelengkapan_garansi: item.kelengkapan_garansi || false,
        kelengkapan_sertifikat: item.kelengkapan_sertifikat || false,
        kelengkapan_manual: item.kelengkapan_manual || false,
        kondisi_barang: item.kondisi_barang || '',
        dokumen_garansi_url: item.dokumen_garansi_url || null,
        dokumen_sertifikat_url: item.dokumen_sertifikat_url || null,
        dokumen_manual_url: item.dokumen_manual_url || null,
        note_audit: item.note_audit || '',
        foto_urls: item.foto_urls || [],
      });
      setPreviewUrls(item.foto_urls || []);
      setDocGaransiFile(null);
      setDocSertifikatFile(null);
      setDocManualFile(null);
    } else {
      setEditingItem(null);
      const nextKode = await generateNextKodeBarang();
      setFormData({
        kode_barang: nextKode,
        nama_barang: '',
        jumlah_barang: 0,
        kode_lokasi: '',
        kategori_id: '',
        deskripsi: '',
        kelengkapan_garansi: false,
        kelengkapan_sertifikat: false,
        kelengkapan_manual: false,
        kondisi_barang: '',
        dokumen_garansi_url: null,
        dokumen_sertifikat_url: null,
        dokumen_manual_url: null,
        note_audit: '',
        foto_urls: [],
      });
      setPreviewUrls([]);
      setDocGaransiFile(null);
      setDocSertifikatFile(null);
      setDocManualFile(null);
    }
    setSelectedFiles([]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const previewData = data.map(row => ({
          kode_barang: row['Kode Barang'] || row['kode_barang'] || `BRG-${Math.floor(10000 + Math.random() * 90000)}`,
          nama_barang: row['Nama Barang'] || row['nama_barang'],
          jumlah_barang: parseInt(row['Jumlah'] || row['jumlah_barang']) || 0,
          deskripsi: row['Deskripsi'] || row['deskripsi'] || '',
          nama_lokasi: row['Lokasi'] || row['lokasi'] || '', // Temporary store name
        })).filter(item => item.nama_barang);

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

      // 2. Map items to use kode_lokasi
      const itemsToInsert = importPreviewData.map(({ nama_lokasi, ...rest }) => ({
        ...rest,
        kode_lokasi: locMap.get(nama_lokasi.toLowerCase()) || null
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

      // Prepare data for export
      const dataToExport = items.map(item => ({
        'Kode Barang': item.kode_barang,
        'Nama Barang': item.nama_barang,
        'Jumlah': item.jumlah_barang,
        'Lokasi': (item as any).master_lokasi?.nama_lokasi || '-',
        'Deskripsi': item.deskripsi || '-',
        'Kondisi Barang': item.kondisi_barang || '-',
        'Kelengkapan Garansi': item.kelengkapan_garansi ? 'Ya' : 'Tidak',
        'Kelengkapan Sertifikat': item.kelengkapan_sertifikat ? 'Ya' : 'Tidak',
        'Kelengkapan Manual Book': item.kelengkapan_manual ? 'Ya' : 'Tidak',
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
      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master Barang');

      // Save file
      XLSX.writeFile(wb, `Master_Barang_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      setIsExportPreviewOpen(false);
      showToast('Data berhasil diexport ke Excel', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeksport data', 'error');
    }
  };

  const handleExport = () => {
    try {
      if (items.length === 0) {
        showToast('Tidak ada data untuk diexport', 'info');
        return;
      }

      // Prepare data for export
      const exportData = items.map(item => ({
        'Kode Barang': item.kode_barang,
        'Nama Barang': item.nama_barang,
        'Jumlah': item.jumlah_barang,
        'Lokasi': (item as any).master_lokasi?.nama_lokasi || '-',
        'Deskripsi': item.deskripsi || '-',
        'Tanggal Dibuat': new Date(item.created_at).toLocaleDateString('id-ID'),
      }));

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Master Barang');

      // Save file
      XLSX.writeFile(wb, `Master_Barang_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      showToast('Data berhasil diexport ke Excel', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengeksport data', 'error');
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
      if (profile?.role !== 'admin' && profile?.role !== 'auditor') {
        throw new Error('Akses Ditolak: Anda tidak memiliki izin untuk menyimpan perubahan');
      }
      
      let finalFotoUrls = [...formData.foto_urls];
      let finalDocGaransiUrl = formData.dokumen_garansi_url;
      let finalDocSertifikatUrl = formData.dokumen_sertifikat_url;
      let finalDocManualUrl = formData.dokumen_manual_url;

      // Helper function to upload document
      const uploadDocument = async (file: File) => {
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

      if (profile?.role === 'admin') {
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

      // Upload new files (only if admin)
      if (selectedFiles.length > 0 && profile?.role === 'admin') {
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

      let payload: any = {
        ...formData,
        kategori_id: formData.kategori_id || null,
        kode_lokasi: formData.kode_lokasi || null,
        kondisi_barang: formData.kondisi_barang || null,
        dokumen_garansi_url: finalDocGaransiUrl,
        dokumen_sertifikat_url: finalDocSertifikatUrl,
        dokumen_manual_url: finalDocManualUrl,
        foto_urls: finalFotoUrls,
        updated_at: new Date().toISOString(),
      };

      if (profile?.role === 'auditor') {
        // Auditor can only update note_audit
        payload = {
          note_audit: formData.note_audit,
          updated_at: new Date().toISOString(),
        };
      }

      if (editingItem) {
        const isChanged = profile?.role === 'auditor' 
          ? formData.note_audit !== (editingItem.note_audit || '')
          : (formData.kode_barang !== editingItem.kode_barang ||
            formData.nama_barang !== editingItem.nama_barang ||
            formData.jumlah_barang !== editingItem.jumlah_barang ||
            formData.kode_lokasi !== (editingItem.kode_lokasi || '') ||
            formData.kategori_id !== (editingItem.kategori_id || '') ||
            formData.deskripsi !== (editingItem.deskripsi || '') ||
            formData.kelengkapan_garansi !== (editingItem.kelengkapan_garansi || false) ||
            formData.kelengkapan_sertifikat !== (editingItem.kelengkapan_sertifikat || false) ||
            formData.kelengkapan_manual !== (editingItem.kelengkapan_manual || false) ||
            formData.kondisi_barang !== (editingItem.kondisi_barang || '') ||
            formData.note_audit !== (editingItem.note_audit || '') ||
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Master Barang</h2>
          <div className="flex items-center space-x-2">
            <p className="text-gray-500">Kelola daftar inventaris barang Anda</p>
            {profile && (
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                profile.role === 'admin' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              )}>
                Role: {profile.role}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {profile?.role === 'admin' && (
            <>
              <label className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium cursor-pointer">
                {importLoading ? <Loader2 className="animate-spin" size={20} /> : <FileSpreadsheet size={20} />}
                <span>Import Excel</span>
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} disabled={importLoading} />
              </label>
              <button
                onClick={handlePrepareExport}
                className="flex items-center justify-center space-x-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium"
              >
                <Download size={20} />
                <span>Export Excel</span>
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium"
              >
                <Plus size={20} />
                <span>Tambah Barang</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedItems.length > 0 && profile?.role === 'admin' && !filterPemusnahan && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center space-x-3">
            <span className="text-blue-700 font-medium">{selectedItems.length} barang terpilih</span>
            <div className="h-4 w-px bg-blue-200"></div>
            <button 
              onClick={() => setIsBulkEditOpen(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center"
            >
              <Edit2 size={16} className="mr-1" /> Edit Massal
            </button>
            <div className="h-4 w-px bg-blue-200"></div>
            <button 
              onClick={() => {
                setStockOutData({ alasan: '' });
                setIsBulkStockOutModalOpen(true);
              }}
              className="text-orange-600 hover:text-orange-800 text-sm font-semibold flex items-center"
            >
              <LogOut size={16} className="mr-1" /> Keluarkan Massal
            </button>
          </div>
          <button onClick={() => setSelectedItems([])} className="text-blue-400 hover:text-blue-600">
            <X size={20} />
          </button>
        </div>
      )}

      {/* Category Stats */}
      {categoryStats.length > 0 && (
        <div className="flex flex-col space-y-4">
          <div className="max-h-[160px] overflow-y-auto pr-2 scrollbar-hide">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-500">
              {categoryStats.map((stat, idx) => {
                const isSelected = selectedTopCategory === stat.id;
                return (
                  <div 
                    key={idx} 
                    className={`bg-white/40 backdrop-blur-xl p-4 rounded-3xl shadow-lg border flex items-center space-x-3 transition-all cursor-pointer group ${isSelected ? 'border-orange-500 shadow-orange-500/20 ring-2 ring-orange-500/20' : 'border-white/60 hover:border-orange-300 hover:shadow-xl hover:-translate-y-1'}`}
                    onClick={() => setSelectedTopCategory(isSelected ? null : stat.id)}
                  >
                    <div className={`p-2.5 rounded-2xl shrink-0 border shadow-inner group-hover:scale-110 transition-transform ${isSelected ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-white/50 text-orange-600 border-white/50'}`}>
                      <Package size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-sm font-semibold truncate ${isSelected ? 'text-orange-900' : 'text-gray-900'}`} title={stat.name}>{stat.name}</h4>
                      <p className="text-xs text-gray-600 truncate font-medium">{stat.count} Jenis • {stat.stock} Total Stok</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {selectedTopCategory && (
            <div className="animate-in slide-in-from-top-4 fade-in duration-300 space-y-4">
              
              {/* Sub-Kategori Cards */}
              {categories.filter(c => c.parent_id === selectedTopCategory).length > 0 && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <Package className="text-orange-500" size={18} />
                    <h3 className="text-sm font-semibold text-gray-800">Sub-Kategori {categoryStats.find(c => c.id === selectedTopCategory)?.name}</h3>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {/* Option to select the "Semua" parent category */}
                    <div 
                      className="bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 rounded-xl p-3 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center space-x-3 group"
                      onClick={() => {
                        setFilterKategori(selectedTopCategory === 'unassigned' ? '' : selectedTopCategory);
                        setFilterLokasi('');
                        setSelectedTopCategory(null);
                      }}
                    >
                      <div className="p-1.5 bg-gray-50 group-hover:bg-orange-100 rounded-lg text-gray-400 group-hover:text-orange-600 transition-colors">
                        <Package size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-800">Semua {categoryStats.find(c => c.id === selectedTopCategory)?.name}</h4>
                      </div>
                    </div>
                    {categories.filter(c => c.parent_id === selectedTopCategory).map((subCat) => (
                      <div 
                        key={subCat.id}
                        className="bg-white hover:bg-orange-50 border border-gray-200 hover:border-orange-300 rounded-xl p-3 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center space-x-3 group"
                        onClick={() => {
                          setFilterKategori(subCat.id);
                          setFilterLokasi('');
                          setSelectedTopCategory(null);
                        }}
                      >
                        <div className="p-1.5 bg-gray-50 group-hover:bg-orange-100 rounded-lg text-gray-400 group-hover:text-orange-600 transition-colors">
                          <Package size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-gray-800">{subCat.nama_kategori}</h4>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lokasi Cards */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="text-blue-600" size={18} />
                  <h3 className="text-sm font-semibold text-gray-800">Pilih Lokasi untuk Kategori {categoryStats.find(c => c.id === selectedTopCategory)?.name}</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {categoryStats.find(c => c.id === selectedTopCategory)?.locations.map((loc, idx) => (
                    <div 
                      key={idx}
                      className="bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl p-3 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center space-x-3 group"
                      onClick={() => {
                        setFilterKategori(selectedTopCategory === 'unassigned' ? '' : selectedTopCategory);
                        setFilterLokasi(loc.kode === 'unassigned' ? '' : loc.kode);
                        setSelectedTopCategory(null); // menciut / hide
                      }}
                    >
                      <div className="p-1.5 bg-gray-50 group-hover:bg-blue-100 rounded-lg text-gray-400 group-hover:text-blue-600 transition-colors">
                        <MapPin size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-800">{loc.name}</h4>
                        <p className="text-[10px] text-gray-500">{loc.count} Jenis • {loc.stock} Stok</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50 flex flex-col md:flex-row gap-4">
        <div className="md:flex-[2] relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Cari nama, kode, atau deskripsi barang..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="md:flex-1 flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-2 min-w-[200px]">
          <div className="relative flex-1 w-full flex items-center space-x-2">
            <Filter className="text-gray-400" size={18} />
            <div className="relative flex-1">
              <select
                value={filterKategori}
                onChange={(e) => {
                  setFilterKategori(e.target.value);
                  setFilterLokasi('');
                }}
                className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white font-medium"
              >
                <option value="">Semua Kategori</option>
                {categories.filter(c => !c.parent_id).map((cat) => (
                  <optgroup key={cat.id} label={cat.nama_kategori}>
                    <option value={cat.id}>{cat.nama_kategori} (Utama)</option>
                    {categories.filter(sub => sub.parent_id === cat.id).map(sub => (
                      <option key={sub.id} value={sub.id}>-- {sub.nama_kategori}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {filterKategori && (
                <button 
                  onClick={() => { setFilterKategori(''); setFilterLokasi(''); }}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ChevronRight size={16} className="rotate-90" />
              </div>
            </div>
          </div>
          
          {filterKategori && !filterLokasi && (
            <div className="relative flex-1 w-full animate-in fade-in zoom-in duration-300">
              <select
                value={filterLokasi}
                onChange={(e) => setFilterLokasi(e.target.value)}
                className="w-full pl-3 pr-10 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-blue-50 text-blue-800 text-sm appearance-none font-medium text-center"
              >
                <option value="">-- Pilih Lokasi Kategori --</option>
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
          )}
          
          {filterLokasi && (
            <div className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg border border-blue-200 animate-in fade-in slide-in-from-left-4 max-w-[200px] shrink-0">
              <MapPin size={14} className="mr-1.5 shrink-0 text-blue-600" />
              <span className="text-sm font-semibold truncate">
                {availableLocations.find(l => l.kode_lokasi === filterLokasi)?.nama_lokasi || 'Lokasi Terpilih'}
              </span>
              <button onClick={() => setFilterLokasi('')} className="ml-2 text-blue-400 hover:text-blue-800 shrink-0">
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        
        <button
          onClick={() => {
            setSearch('');
            setFilterLokasi('');
            setFilterKategori('');
            setFilterPemusnahan(false);
            setPage(1);
          }}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 backdrop-blur-md rounded-lg transition-all text-sm font-medium whitespace-nowrap shadow-sm"
        >
          <XCircle size={16} />
          <span>Reset Pencarian</span>
        </button>
      </div>

      {/* Pemusnahan Filter Toggle & Actions */}
      <div className="flex flex-col md:flex-row items-center justify-between bg-white/40 backdrop-blur-sm p-3 rounded-2xl border border-white/60 shadow-sm gap-4">
        <div className="flex items-center space-x-3">
          {profile?.role !== 'auditor' && (
            <button
              onClick={() => {
                setFilterPemusnahan(!filterPemusnahan);
                setPage(1);
              }}
              className={cn(
                "flex items-center space-x-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold border shadow-sm",
                filterPemusnahan 
                  ? "bg-red-500 text-white border-red-600 shadow-red-500/20" 
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              )}
            >
              <AlertTriangle size={18} />
              <span>List Barang Pemusnahan (Rusak/Cukup Baik)</span>
            </button>
          )}

          {['admin', 'spv', 'direktur'].includes(profile?.role || '') && (
            <button
              onClick={() => setIsApprovalListModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold border shadow-sm bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
            >
              <ClipboardList size={18} />
              <span>Persetujuan Pemusnahan</span>
            </button>
          )}
        </div>
        
        {selectedItems.length > 0 && filterPemusnahan && (
          <div className="flex items-center animate-in slide-in-from-right-4 fade-in">
            <button
              onClick={() => {
                setIsDisposalModalOpen(true);
              }}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white rounded-xl shadow-lg shadow-red-500/30 transition-all font-semibold"
            >
              <FileWarning size={18} />
              <span>Ajukan Pemusnahan ({selectedItems.length} Barang)</span>
            </button>
          </div>
        )}
      </div>

      {/* Top Scrollbar */}
      <div 
        className="overflow-x-auto overflow-y-hidden mb-2 rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm custom-scrollbar"
        ref={topScrollbarRef}
        onScroll={handleTopScroll}
      >
        <div style={{ width: tableContentWidth, height: '1px' }} />
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
        <div 
          className="overflow-x-auto custom-scrollbar"
          ref={tableContainerRef}
          onScroll={handleBottomScroll}
        >
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-4 w-10">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-blue-600 transition-colors">
                    {selectedItems.length === items.length && items.length > 0 ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                  </button>
                </th>
                <th className="px-6 py-4">Foto</th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group"
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
                  className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group"
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
                <th className="px-6 py-4">Deskripsi</th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group"
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
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4">Kondisi</th>
                <th className="px-6 py-4">Kelengkapan Dokumen</th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group"
                  onClick={() => handleSort('jumlah_barang')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Stok</span>
                    {sortColumn === 'jumlah_barang' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4">Catatan Audit</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
                    <p className="text-gray-500">Memuat data...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center">
                    <Package className="mx-auto text-gray-300 mb-2" size={48} />
                    <p className="text-gray-500">Tidak ada barang ditemukan</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className={cn(
                    "hover:bg-gray-50 transition-colors group cursor-pointer",
                    selectedItems.includes(item.id) && "bg-blue-50/50"
                  )} onClick={() => handleShowDetail(item)}>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelectItem(item.id)} className="text-gray-400 hover:text-blue-600 transition-colors">
                        {selectedItems.includes(item.id) ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex -space-x-6 overflow-hidden py-2">
                        {item.foto_urls && item.foto_urls.length > 0 ? (
                          <>
                            {item.foto_urls.slice(0, 3).map((url, idx) => (
                              <img 
                                key={idx}
                                src={url} 
                                alt={`${item.nama_barang} ${idx + 1}`} 
                                className="w-20 h-20 shrink-0 rounded-xl object-cover border-2 border-white shadow-md cursor-zoom-in hover:z-10 transition-transform hover:scale-110" 
                                referrerPolicy="no-referrer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCarousel(item.foto_urls, idx);
                                }}
                              />
                            ))}
                            {item.foto_urls.length > 3 && (
                              <div className="w-20 h-20 shrink-0 rounded-xl bg-gray-100 border-2 border-white flex items-center justify-center text-sm font-bold text-gray-500 shadow-md">
                                +{item.foto_urls.length - 3}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-20 h-20 shrink-0 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-100 shadow-sm">
                            <ImageIcon size={32} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{item.kode_barang}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{item.nama_barang}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.deskripsi || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {(item as any).master_lokasi?.nama_lokasi || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
                        {(item as any).categories?.nama_kategori || 'Tanpa Kategori'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {item.kondisi_barang ? (
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                          item.kondisi_barang === 'BAIK' ? "bg-green-50 text-green-700 border-green-200" :
                          item.kondisi_barang === 'CUKUP BAIK' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                          item.kondisi_barang === 'RUSAK' ? "bg-red-50 text-red-700 border-red-200" : ""
                        )}>
                          {item.kondisi_barang}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${item.kelengkapan_garansi ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                           Garansi
                         </span>
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${item.kelengkapan_sertifikat ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                           Sertifikat
                         </span>
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${item.kelengkapan_manual ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                           Manual Book
                         </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "text-sm font-bold",
                        item.jumlah_barang <= 5 ? "text-red-600" : "text-gray-900"
                      )}>
                        {item.jumlah_barang}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 truncate max-w-[150px]">{item.note_audit || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="grid grid-cols-2 gap-1 w-max ml-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setHistorySearch) {
                              setHistorySearch(item.kode_barang);
                              navigate('/log-item-change');
                            }
                          }}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center"
                          title="Lihat Riwayat"
                        >
                          <History size={18} />
                        </button>
                        {profile?.role === 'admin' || profile?.role === 'auditor' ? (
                          <>
                            {profile?.role === 'admin' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStockOut(item);
                                  }}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
                                  title="Keluarkan Barang"
                                >
                                  <Archive size={18} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTakeItem(item);
                                  }}
                                  className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center justify-center"
                                  title="Ambil Barang"
                                >
                                  <LogOut size={18} />
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenModal(item);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                          </>
                        ) : null}
                      </div>
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
            <p className="text-sm text-gray-500">
              Menampilkan <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> barang
            </p>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Per halaman:</span>
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
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
                        page === pageNum ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
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
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                {editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kode Barang</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nama Barang</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kondisi Barang</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kelengkapan Dokumen</label>
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
                          <span className="text-sm font-medium text-gray-700">Garansi</span>
                        </label>
                        {formData.kelengkapan_garansi && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocGaransiFile(e.target.files?.[0] || null)}
                              className="text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                          <span className="text-sm font-medium text-gray-700">Sertifikat</span>
                        </label>
                        {formData.kelengkapan_sertifikat && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocSertifikatFile(e.target.files?.[0] || null)}
                              className="text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                          <span className="text-sm font-medium text-gray-700">Manual Book</span>
                        </label>
                        {formData.kelengkapan_manual && (
                          <div className="pl-6 pt-1">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              disabled={profile?.role === 'auditor'}
                              onChange={(e) => setDocManualFile(e.target.files?.[0] || null)}
                              className="text-xs text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                    <textarea
                      rows={3}
                      disabled={profile?.role === 'auditor'}
                      value={formData.deskripsi}
                      onChange={(e) => setFormData({ ...formData, deskripsi: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-60 disabled:bg-gray-50"
                      placeholder="Keterangan tambahan..."
                    />
                  </div>
                  {profile?.role === 'auditor' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Audit</label>
                      <textarea
                        rows={3}
                        value={formData.note_audit}
                        onChange={(e) => setFormData({ ...formData, note_audit: e.target.value })}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-blue-50/30"
                        placeholder="Masukkan catatan audit..."
                      />
                    </div>
                  )}
                </div>

                {/* Right Column: Photo Upload */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">Foto Barang ({formData.foto_urls.length + selectedFiles.length}/10)</label>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {previewUrls.map((url, idx) => (
                      <div key={idx} className="relative aspect-square group">
                        <img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover rounded-lg border border-gray-200" referrerPolicy="no-referrer" />
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
                          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingImages ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                          <span className="text-[10px] mt-1 font-medium">{isProcessingImages ? 'Memproses...' : 'Kamera'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isProcessingImages}
                          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingImages ? <Loader2 size={20} className="animate-spin" /> : <ImageIcon size={20} />}
                          <span className="text-[10px] mt-1 font-medium">{isProcessingImages ? 'Memproses...' : 'Galeri'}</span>
                        </button>
                      </>
                    )}
                  </div>
                  {profile?.role !== 'auditor' && (
                    <p className="text-[10px] text-gray-500 italic">Maks 5MB per foto. Format: PNG, JPG, WEBP.</p>
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

              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading || isProcessingImages}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsBulkEditOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Edit Massal ({selectedItems.length} barang)</h3>
              <button onClick={() => setIsBulkEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBulkEdit} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubah Lokasi</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubah Kategori</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubah Jumlah Stok</label>
                <input
                  type="number"
                  min="-1"
                  value={bulkEditData.jumlah_barang}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, jumlah_barang: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="-1 untuk tidak mengubah"
                />
                <p className="text-xs text-gray-500 mt-1">Set ke -1 jika tidak ingin mengubah stok</p>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsImportPreviewOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Preview Import ({importPreviewData.length} barang)</h3>
              <button onClick={() => setIsImportPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 font-semibold">
                    <th className="pb-3">Kode</th>
                    <th className="pb-3">Nama Barang</th>
                    <th className="pb-3">Deskripsi</th>
                    <th className="pb-3">Jumlah</th>
                    <th className="pb-3">Lokasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {importPreviewData.map((row, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-mono text-xs">{row.kode_barang}</td>
                      <td className="py-3 font-medium">{row.nama_barang}</td>
                      <td className="py-3 text-xs text-gray-500 max-w-[200px] truncate" title={row.deskripsi}>{row.deskripsi || '-'}</td>
                      <td className="py-3">{row.jumlah_barang}</td>
                      <td className="py-3">{row.nama_lokasi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsImportPreviewOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center space-x-2"
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
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setCarouselImages([])}
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
                    className="absolute left-4 p-3 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                    onClick={() => setCurrentCarouselIndex((prev) => (prev === 0 ? carouselImages.length - 1 : prev - 1))}
                  >
                    <ChevronLeft size={32} />
                  </button>
                  <button 
                    className="absolute right-4 p-3 bg-black/20 hover:bg-black/40 text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
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

      {/* Item Detail Modal */}
      {isDetailModalOpen && selectedItemForDetail && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            setIsDetailModalOpen(false);
            setSelectedItemForDetail(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detail Barang</h3>
              <button 
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedItemForDetail(null);
                }} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                        <img 
                          src={selectedItemForDetail.foto_urls[0]} 
                          alt={selectedItemForDetail.nama_barang}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <Search className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
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
                          <img src={url} alt={`Preview ${idx + 2}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Info */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Informasi Dasar</h4>
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Nama Barang</p>
                          <p className="text-base font-bold text-gray-900">{selectedItemForDetail.nama_barang}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                          <Hash size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Kode Barang</p>
                          <p className="text-sm font-mono font-medium text-gray-700">{selectedItemForDetail.kode_barang}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Lokasi & Kategori & Stok</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Kategori</p>
                          <p className="text-sm font-medium text-gray-700">{(selectedItemForDetail as any).categories?.nama_kategori || 'Tanpa Kategori'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                          <MapPin size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Lokasi</p>
                          <p className="text-sm font-medium text-gray-700">{(selectedItemForDetail as any).master_lokasi?.nama_lokasi || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Info size={18} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Stok Saat Ini</p>
                          <p className="text-sm font-bold text-gray-900">{selectedItemForDetail.jumlah_barang} unit</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Kondisi Barang</h4>
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
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Deskripsi</h4>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {selectedItemForDetail.deskripsi || 'Tidak ada deskripsi tambahan untuk barang ini.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Kelengkapan Dokumen</h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                       {selectedItemForDetail.kelengkapan_garansi ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Garansi: Ada
                           </span>
                           {selectedItemForDetail.dokumen_garansi_url && (
                             <a href={selectedItemForDetail.dokumen_garansi_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline px-1">
                               ⬇ Download Garansi
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-500 border-gray-200 h-[22px]">
                           Garansi: Tidak Ada
                         </span>
                       )}

                       {selectedItemForDetail.kelengkapan_sertifikat ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Sertifikat: Ada
                           </span>
                           {selectedItemForDetail.dokumen_sertifikat_url && (
                             <a href={selectedItemForDetail.dokumen_sertifikat_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline px-1">
                               ⬇ Download Sertifikat
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-500 border-gray-200 h-[22px]">
                           Sertifikat: Tidak Ada
                         </span>
                       )}

                       {selectedItemForDetail.kelengkapan_manual ? (
                         <div className="flex flex-col gap-1">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                             Manual Book: Ada
                           </span>
                           {selectedItemForDetail.dokumen_manual_url && (
                             <a href={selectedItemForDetail.dokumen_manual_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline px-1">
                               ⬇ Download Manual
                             </a>
                           )}
                         </div>
                       ) : (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-500 border-gray-200 h-[22px]">
                           Manual Book: Tidak Ada
                         </span>
                       )}
                    </div>
                  </div>

                  {selectedItemForDetail.note_audit && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-1">Catatan Audit</h4>
                      <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                        <p className="text-sm text-blue-800 leading-relaxed">
                          {selectedItemForDetail.note_audit}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center text-xs text-gray-400">
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
                className="px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
              >
                Tutup
              </button>
              {profile?.role === 'admin' || profile?.role === 'auditor' ? (
                <button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    handleOpenModal(selectedItemForDetail);
                  }}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  {profile?.role === 'auditor' ? 'Audit Barang' : 'Edit Barang'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-6 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed flex items-center space-x-2"
                >
                  <AlertCircle size={16} />
                  <span>Mode Lihat Saja</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Take Item Modal */}
      {isTakeItemModalOpen && selectedItemForTake && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsTakeItemModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Ambil Barang: {selectedItemForTake.nama_barang}</h3>
              <button 
                onClick={() => setIsTakeItemModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); confirmTakeItem(); }} className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              <div className="space-y-2">
                <label htmlFor="takeJumlah" className="block text-sm font-medium text-gray-700">Jumlah yang Diambil</label>
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
                <p className="text-xs text-gray-500">Stok Tersedia: {selectedItemForTake.jumlah_barang}</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="takeAlasan" className="block text-sm font-medium text-gray-700">Alasan/Tujuan</label>
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
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
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
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsStockOutModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Keluarkan Barang ke Riwayat</h3>
              <button 
                onClick={() => setIsStockOutModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              {/* Data Preview (Read-only) */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Preview Data Barang</span>
                  <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-bold">READ ONLY</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Kode Barang</p>
                      <p className="text-sm font-mono text-gray-700">{selectedItemForStockOut.kode_barang}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Nama Barang</p>
                      <p className="text-sm font-medium text-gray-900">{selectedItemForStockOut.nama_barang}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Lokasi</p>
                      <p className="text-sm text-gray-700">{(selectedItemForStockOut as any).master_lokasi?.nama_lokasi || '-'}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Stok Saat Ini</p>
                      <p className="text-sm font-bold text-gray-900">{selectedItemForStockOut.jumlah_barang} unit</p>
                    </div>
                    {selectedItemForStockOut.foto_urls && selectedItemForStockOut.foto_urls.length > 0 && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Foto</p>
                        <div className="flex -space-x-2">
                          {selectedItemForStockOut.foto_urls.slice(0, 4).map((url, idx) => (
                            <img key={idx} src={url} className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="Preview" referrerPolicy="no-referrer" />
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
                  <label className="block text-sm font-bold text-gray-700">Lokasi Tujuan / Barang Keluar <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-bold text-gray-700">Keterangan / Alasan Keluar <span className="text-red-500">*</span></label>
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
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmStockOut}
                disabled={formLoading}
                className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
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
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !isSubmittingDisposal && setIsDisposalModalOpen(false)}
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
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                  <label className="block text-sm font-bold text-gray-700">Metode Pemusnahan <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-bold text-gray-700">Keterangan / Alasan Pemusnahan <span className="text-red-500">*</span></label>
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
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={submitDisposalRequest}
                disabled={isSubmittingDisposal || !disposalData.keterangan.trim() || !disposalData.metode_pemusnahan}
                className="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
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
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsBulkStockOutModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Keluarkan {selectedItems.length} Barang</h3>
              <button 
                onClick={() => setIsBulkStockOutModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                  <label className="block text-sm font-bold text-gray-700">Lokasi Tujuan / Barang Keluar <span className="text-red-500">*</span></label>
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
                  <label className="block text-sm font-bold text-gray-700">Keterangan / Alasan Keluar Massal <span className="text-red-500">*</span></label>
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
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmBulkStockOut}
                disabled={formLoading}
                className="px-6 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
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
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsExportPreviewOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Preview Export ({exportData.length} baris)</h3>
              <button onClick={() => setIsExportPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 font-semibold">
                    {exportData.length > 0 && Object.keys(exportData[0]).map(key => (
                      <th key={key} className="pb-3 px-2">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.values(row).map((val: any, i) => (
                        <td key={i} className="py-2 px-2 text-gray-600">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50">
              <button
                onClick={() => setIsExportPreviewOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmExport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium flex items-center space-x-2"
              >
                <Download size={18} />
                <span>Konfirmasi Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <DisposalApprovalModal
        isOpen={isApprovalListModalOpen}
        onClose={() => {
          setIsApprovalListModalOpen(false);
          fetchItems();
        }}
        profile={profile}
      />
    </div>
  );
}
