import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import { Loader2, ClipboardList, Package, User as UserIcon, Calendar, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Search, Filter, XCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import SignedImage from '../UI/SignedImage';
import { getSignedUrls } from '../../lib/signedStorage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ItemAuditLogEntry {
  id: string;
  item_id: string;
  action: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  changed_by: string;
  created_at: string;
  profiles: { // Joined user details
    full_name: string;
  };
  items: { // Joined item details
    kode_barang: string;
    nama_barang: string;
  };
}

interface LogItemChangeProps {
  initialSearch?: string;
}

export default function LogItemChange({ initialSearch = '' }: LogItemChangeProps) {
  const { profile } = useAuth();
  const [auditLogs, setAuditLogs] = useState<ItemAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortColumn, setSortColumn] = useState<'created_at' | 'action' | 'changed_by' | 'kode_barang' | null>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    setSearchTerm(initialSearch);
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, [initialSearch]);

  // Modal state for viewing detailed changes
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLogEntryForDetail, setSelectedLogEntryForDetail] = useState<ItemAuditLogEntry | null>(null);

  // Export state
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  // Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Supaya tombol/gesture "Kembali" di mobile menutup modal, bukan keluar aplikasi
  useModalBackButton(isDetailModalOpen, () => setIsDetailModalOpen(false));
  useModalBackButton(isExportPreviewOpen, () => setIsExportPreviewOpen(false));
  useModalBackButton(isLightboxOpen, () => setIsLightboxOpen(false));

  const openLightbox = async (images: string[], index: number) => {
    const signedMap = await getSignedUrls('item-photos', images);
    setLightboxImages(images.map((url) => signedMap[url] || url));
    setCurrentImageIndex(index);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setLightboxImages([]);
    setCurrentImageIndex(0);
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === lightboxImages.length - 1 ? 0 : prev + 1));
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? lightboxImages.length - 1 : prev - 1));
  };

  const [locations, setLocations] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [kepemilikanMap, setKepemilikanMap] = useState<Record<string, string>>({});

  const fetchLocations = async () => {
    const { data } = await supabase.from('master_lokasi').select('kode_lokasi, nama_lokasi');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(loc => {
        map[loc.kode_lokasi] = loc.nama_lokasi;
      });
      setLocations(map);
    }
  };

  const fetchCategoriesAndKepemilikan = async () => {
    const [catRes, kepRes] = await Promise.all([
      supabase.from('categories').select('id, nama_kategori'),
      supabase.from('master_kepemilikan').select('id, nama_pemilik'),
    ]);
    if (catRes.data) {
      const map: Record<string, string> = {};
      catRes.data.forEach((c: any) => { map[c.id] = c.nama_kategori; });
      setCategories(map);
    }
    if (kepRes.data) {
      const map: Record<string, string> = {};
      kepRes.data.forEach((k: any) => { map[k.id] = k.nama_pemilik; });
      setKepemilikanMap(map);
    }
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Object.keys(locations).length === 0) {
        await fetchLocations();
      }
      if (Object.keys(categories).length === 0) {
        await fetchCategoriesAndKepemilikan();
      }
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('item_audit_logs')
        .select(`*, profiles(full_name), items(kode_barang, nama_barang, kode_lokasi)`, { count: 'exact' });

      if (searchTerm) {
        // Search in the audit log's own JSONB columns (works for both active and deleted items)
        // This avoids cross-table OR issues with the 'items' join
        query = query.or(`old_values->>nama_barang.ilike.%${searchTerm}%,old_values->>kode_barang.ilike.%${searchTerm}%,new_values->>nama_barang.ilike.%${searchTerm}%,new_values->>kode_barang.ilike.%${searchTerm}%`);
      }

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      // Always exclude DELETE actions as requested
      query = query.neq('action', 'DELETE');

      if (sortColumn) {
        if (sortColumn === 'kode_barang') {
          query = query.order('kode_barang', { foreignTable: 'items', ascending: sortDirection === 'asc' });
        } else if (sortColumn === 'changed_by') {
          query = query.order('full_name', { foreignTable: 'profiles', ascending: sortDirection === 'asc' });
        } else {
          query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
        }
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setAuditLogs(data as ItemAuditLogEntry[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, itemsPerPage, sortColumn, sortDirection, searchTerm, startDate, endDate]);

  const handleSort = (column: 'created_at' | 'action' | 'changed_by' | 'kode_barang') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleOpenDetailModal = (entry: ItemAuditLogEntry) => {
    setSelectedLogEntryForDetail(entry);
    setIsDetailModalOpen(true);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handlePrepareExport = () => {
    const formatExportValue = (key: string, value: any) => {
      if (value === undefined || value === null || value === '') return '-';
      if (key === 'kode_lokasi') return locations[value] || value;
      if (key === 'kategori_id') return categories[value] || value;
      if (key === 'kepemilikan_id') return kepemilikanMap[value] || value;
      if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-';
      if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
      return String(value);
    };

    const dataToExport = auditLogs.map(entry => {
      const changes: string[] = [];
      const allKeys = Array.from(new Set([
        ...(entry.old_values ? Object.keys(entry.old_values) : []),
        ...(entry.new_values ? Object.keys(entry.new_values) : []),
      ])).filter(key => !TECHNICAL_DIFF_KEYS.includes(key));
      const orderedKeys = [
        ...KNOWN_DIFF_KEY_ORDER.filter(key => allKeys.includes(key)),
        ...allKeys.filter(key => !KNOWN_DIFF_KEY_ORDER.includes(key)),
      ];

      orderedKeys.forEach(key => {
        const oldValue = entry.old_values ? entry.old_values[key] : null;
        const newValue = entry.new_values ? entry.new_values[key] : null;
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          const label = DIFF_DISPLAY_NAMES[key] || key;
          changes.push(`${label}: ${formatExportValue(key, oldValue)} -> ${formatExportValue(key, newValue)}`);
        }
      });

      return {
        'Tanggal': new Date(entry.created_at).toLocaleString('id-ID'),
        'Aksi': entry.action,
        'Nama Barang': entry.items?.nama_barang || entry.new_values?.nama_barang || entry.old_values?.nama_barang || 'Item Deleted',
        'Kode Barang': entry.items?.kode_barang || entry.new_values?.kode_barang || entry.old_values?.kode_barang || entry.item_id,
        'Perubahan': changes.join(' | '),
        'Diubah Oleh': entry.profiles?.full_name || 'Unknown User'
      };
    });
    setExportData(dataToExport);
    setIsExportPreviewOpen(true);
  };

  const handleConfirmExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Audit Logs");
    XLSX.writeFile(workbook, `Audit_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    setIsExportPreviewOpen(false);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Urutan tampil field yang dikenal — field yang gak ada di daftar ini (misal
  // kolom baru di masa depan) tetap otomatis muncul di bagian bawah, dengan
  // nama kolom mentahnya sebagai label, alih-alih hilang diam-diam.
  const KNOWN_DIFF_KEY_ORDER = [
    'kode_barang', 'nama_barang', 'jumlah_barang', 'kode_lokasi', 'kategori_id', 'kepemilikan_id',
    'sifat_barang', 'kondisi_barang', 'deskripsi', 'foto_urls', 'flags',
    'kelengkapan_garansi', 'dokumen_garansi_url',
    'kelengkapan_sertifikat', 'dokumen_sertifikat_url',
    'kelengkapan_manual', 'dokumen_manual_url',
    'note_audit', 'tanggal_audit', 'keterangan_restore',
  ];

  const DIFF_DISPLAY_NAMES: Record<string, string> = {
    'kode_barang': 'Kode Barang',
    'nama_barang': 'Nama Barang',
    'jumlah_barang': 'Jumlah Barang',
    'kode_lokasi': 'Lokasi',
    'kategori_id': 'Kategori',
    'kepemilikan_id': 'Kepemilikan',
    'sifat_barang': 'Sifat Barang',
    'kondisi_barang': 'Kondisi Barang',
    'deskripsi': 'Deskripsi',
    'foto_urls': 'Foto',
    'flags': 'Flags',
    'kelengkapan_garansi': 'Kelengkapan Garansi',
    'dokumen_garansi_url': 'Dokumen Garansi',
    'kelengkapan_sertifikat': 'Kelengkapan Sertifikat',
    'dokumen_sertifikat_url': 'Dokumen Sertifikat',
    'kelengkapan_manual': 'Kelengkapan Manual',
    'dokumen_manual_url': 'Dokumen Manual',
    'note_audit': 'Hasil Audit',
    'tanggal_audit': 'Tanggal Audit',
    'keterangan_restore': 'Keterangan Restore',
  };

  // Kolom teknis yang gak berarti buat ditampilkan sebagai "perubahan" ke user
  // (updated_at selalu berubah tiap kali disimpan, id/created_at gak pernah berubah).
  const TECHNICAL_DIFF_KEYS = ['id', 'created_at', 'updated_at'];

  const renderChanges = (oldValues: Record<string, any> | null, newValues: Record<string, any> | null) => {
    const allKeys = Array.from(new Set([
      ...(oldValues ? Object.keys(oldValues) : []),
      ...(newValues ? Object.keys(newValues) : []),
    ])).filter(key => !TECHNICAL_DIFF_KEYS.includes(key));

    const orderedKeys = [
      ...KNOWN_DIFF_KEY_ORDER.filter(key => allKeys.includes(key)),
      ...allKeys.filter(key => !KNOWN_DIFF_KEY_ORDER.includes(key)),
    ];

    const formatValue = (key: string, value: any) => {
      if (value === undefined || value === null || value === '') return '-';

      if (key === 'foto_urls' && Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-wrap gap-1 mt-1">
            {value.map((url: string, index: number) => (
              <SignedImage
                key={index}
                bucket="item-photos"
                path={url}
                alt={`Foto ${index + 1}`}
                className="w-10 h-10 object-cover rounded border border-gray-200 shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  openLightbox(value, index);
                }}
              />
            ))}
          </div>
        );
      }

      if (key === 'kode_lokasi') {
        const locationName = locations[value] || value;
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
            {String(locationName)}
          </span>
        );
      }

      if (key === 'kategori_id') {
        return String(categories[value] || value);
      }

      if (key === 'kepemilikan_id') {
        return String(kepemilikanMap[value] || value);
      }

      if (key === 'flags' && Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : '-';
      }

      if (key === 'tanggal_audit') {
        return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      }

      if (key === 'kelengkapan_garansi' || key === 'kelengkapan_sertifikat' || key === 'kelengkapan_manual') {
        return value === true ? 'Ya' : value === false ? 'Tidak' : '-';
      }

      if (key === 'dokumen_garansi_url' || key === 'dokumen_sertifikat_url' || key === 'dokumen_manual_url') {
        return value ? 'Ada' : '-';
      }

      if (key === 'nama_barang') {
        return <span className="font-mono text-xs">{String(value)}</span>;
      }

      return String(value);
    };

    return (
      <div className="overflow-hidden border border-gray-100 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 font-semibold text-gray-600 w-1/4">Field</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-3/8">Lama</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-3/8">Baru</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orderedKeys.map(key => {
              const oldValue = oldValues ? oldValues[key] : null;
              const newValue = newValues ? newValues[key] : null;
              const isChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
              const displayName = DIFF_DISPLAY_NAMES[key] || key;

              return (
                <tr key={key} className={cn(
                  "transition-colors",
                  isChanged ? "bg-emerald-50/30" : "bg-white"
                )}>
                  <td className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    {displayName}
                  </td>
                  <td className={cn(
                    "px-4 py-3",
                    isChanged ? "text-gray-900 font-semibold" : "text-gray-400"
                  )}>
                    {formatValue(key, oldValue)}
                  </td>
                  <td className={cn(
                    "px-4 py-3",
                    isChanged ? "text-emerald-700 font-bold" : "text-gray-400"
                  )}>
                    {formatValue(key, newValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const getChangeCount = (oldValues: Record<string, any> | null, newValues: Record<string, any> | null) => {
    if (!oldValues && !newValues) return 0;
    const allKeys = Array.from(new Set([
      ...(oldValues ? Object.keys(oldValues) : []),
      ...(newValues ? Object.keys(newValues) : []),
    ])).filter(key => !TECHNICAL_DIFF_KEYS.includes(key));
    let count = 0;
    for (const key of allKeys) {
      const oldValue = oldValues ? oldValues[key] : undefined;
      const newValue = newValues ? newValues[key] : undefined;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        count++;
      }
    }
    return count;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <ClipboardList size={24} className="text-blue-600" />
          <span>Log Item Change</span>
        </h2>
        {profile?.role === 'admin' && (
          <button
            onClick={handlePrepareExport}
            disabled={auditLogs.length === 0}
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50"
          >
            <Download size={20} />
            <span>Export Excel</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 text-red-700 p-4 mb-4" role="alert">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      <div className="mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Cari berdasarkan nama, kode barang, atau lokasi..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-gray-400 shrink-0" />
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 flex-1 min-w-0">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-0"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-0"
                />
              </div>
            </div>
            <button
              onClick={handleClearSearch}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 backdrop-blur-md rounded-lg transition-all whitespace-nowrap shadow-sm w-full sm:w-auto"
            >
              <XCircle size={18} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-50">
          <thead className="bg-gray-50">
            <tr>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center space-x-1">
                  <span>Tanggal</span>
                  {sortColumn === 'created_at' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'created_at' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('action')}
              >
                <div className="flex items-center space-x-1">
                  <span>Aksi</span>
                  {sortColumn === 'action' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'action' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nama Barang
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('kode_barang')}
              >
                <div className="flex items-center space-x-1">
                  <span>Kode Barang</span>
                  {sortColumn === 'kode_barang' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'kode_barang' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Perubahan</th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('changed_by')}
              >
                <div className="flex items-center space-x-1">
                  <span>Diubah Oleh</span>
                  {sortColumn === 'changed_by' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'changed_by' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
                  <p className="text-gray-500">Memuat log audit...</p>
                </td>
              </tr>
            ) : auditLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <ClipboardList size={48} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500">Tidak ada log perubahan item.</p>
                </td>
              </tr>
            ) : (
              auditLogs.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOpenDetailModal(entry)}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn(
                      "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                      entry.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                      entry.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                      entry.action === 'DIKEMBALIKAN KE STOCK' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-red-100 text-red-800'
                    )}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {entry.items?.nama_barang || entry.new_values?.nama_barang || entry.old_values?.nama_barang || 'Item Deleted'}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700 max-w-[150px] truncate">
                    {entry.items?.kode_barang || entry.new_values?.kode_barang || entry.old_values?.kode_barang || entry.item_id}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <span className="text-blue-600 hover:underline">
                      {getChangeCount(entry.old_values, entry.new_values)} Perubahan
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <UserIcon size={18} className="text-gray-400" />
                      <p className="text-sm text-gray-900">{entry.profiles?.full_name || 'Unknown User'}</p>
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
            Menampilkan <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> log
          </p>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Per halaman:</span>
            <select
              id="itemsPerPage"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
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

      {/* Detail Log Modal */}
      {isDetailModalOpen && selectedLogEntryForDetail && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={() => setIsDetailModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detail Perubahan Log</h3>
              <button 
                onClick={() => setIsDetailModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Calendar size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Waktu Perubahan</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(selectedLogEntryForDetail.created_at).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <UserIcon size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Diubah Oleh</p>
                    <p className="text-sm font-medium text-gray-900">{selectedLogEntryForDetail.profiles?.full_name || 'Unknown User'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Package size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kode Barang</p>
                    <p className="text-sm font-mono font-medium text-gray-900">{selectedLogEntryForDetail.items?.kode_barang || selectedLogEntryForDetail.new_values?.kode_barang || selectedLogEntryForDetail.old_values?.kode_barang || selectedLogEntryForDetail.item_id}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "p-2 rounded-lg shadow-sm",
                    selectedLogEntryForDetail.action === 'UPDATE' ? "bg-blue-50 text-blue-600" :
                    selectedLogEntryForDetail.action === 'CREATE' ? "bg-green-50 text-green-600" :
                    "bg-red-50 text-red-600"
                  )}>
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipe Aksi</p>
                    <p className={cn(
                      "text-sm font-bold",
                      selectedLogEntryForDetail.action === 'UPDATE' ? "text-blue-600" :
                      selectedLogEntryForDetail.action === 'CREATE' ? "text-green-600" :
                      "text-red-600"
                    )}>{selectedLogEntryForDetail.action}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center">
                  <ArrowUpDown size={14} className="mr-2" />
                  Perbandingan Nilai
                </h4>
                {renderChanges(selectedLogEntryForDetail.old_values, selectedLogEntryForDetail.new_values)}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      {isExportPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Preview Export ({exportData.length} baris)</h3>
              <button onClick={() => setIsExportPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 font-semibold">
                    {exportData.length > 0 && Object.keys(exportData[0]).map(key => (
                      <th key={key} className="pb-3 px-2 whitespace-nowrap">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {exportData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.values(row).map((val: any, i) => (
                        <td key={i} className="py-2 px-2 text-gray-600 max-w-xs truncate">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/50 shrink-0">
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

      {/* Lightbox Modal */}
      {isLightboxOpen && lightboxImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 p-1.5 sm:p-2 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 rounded-full transition-all z-20"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>

          <div
            className="relative w-full max-w-5xl max-h-[90dvh] flex items-center justify-center p-2 sm:p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImages.length > 1 && (
              <button
                onClick={prevImage}
                className="absolute left-1 sm:left-4 p-1.5 sm:p-3 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 rounded-full transition-all z-10"
              >
                <ChevronLeft size={20} className="sm:w-8 sm:h-8" />
              </button>
            )}

            <img
              src={lightboxImages[currentImageIndex]}
              alt={`Foto ${currentImageIndex + 1}`}
              className="max-w-full max-h-[80dvh] sm:max-h-[85dvh] object-contain rounded-lg shadow-2xl"
              referrerPolicy="no-referrer"
            />

            {lightboxImages.length > 1 && (
              <button
                onClick={nextImage}
                className="absolute right-1 sm:right-4 p-1.5 sm:p-3 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 rounded-full transition-all z-10"
              >
                <ChevronRight size={20} className="sm:w-8 sm:h-8" />
              </button>
            )}

            {lightboxImages.length > 1 && (
              <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-1.5 sm:py-2 bg-black/50 rounded-full text-white text-xs sm:text-sm font-medium backdrop-blur-md whitespace-nowrap">
                {currentImageIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
