import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Search, Filter, Calendar, Package, MapPin, 
  ChevronLeft, ChevronRight, Loader2, Info, X, ArrowUpDown, ChevronUp, ChevronDown, Download, RotateCcw, AlertCircle, History
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../UI/Toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockOutEntry {
  id: string;
  original_item_id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string;
  nama_lokasi: string;
  foto_urls: string[];
  deskripsi: string;
  created_at: string;
  updated_at: string;
  tanggal_keluar: string;
  keterangan_alasan: string;
  user_name: string;
  master_lokasi: {
    nama_lokasi: string;
  } | null;
}

interface StockOutHistoryProps {
  setHistorySearch?: (search: string) => void;
}

export default function StockOutHistory({ setHistorySearch }: StockOutHistoryProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [history, setHistory] = useState<StockOutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string>('tanggal_keluar');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedEntry, setSelectedEntry] = useState<StockOutEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [entryToRestore, setEntryToRestore] = useState<StockOutEntry | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Export state
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  // Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === lightboxImages.length - 1 ? 0 : prev + 1));
  };

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? lightboxImages.length - 1 : prev - 1));
  };

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setCurrentImageIndex(index);
    setIsLightboxOpen(true);
  };

  useEffect(() => {
    fetchHistory();
  }, [page, search, startDate, endDate, sortColumn, sortOrder, itemsPerPage]);

  async function fetchHistory() {
    setLoading(true);
    try {
      let query = supabase
        .from('stock_keluar_history')
        .select('*, master_lokasi(nama_lokasi)', { count: 'exact' });

      if (search) {
        // Search in the history table's own columns for reliability
        query = query.or(`nama_barang.ilike.%${search}%,kode_barang.ilike.%${search}%,nama_lokasi.ilike.%${search}%,user_name.ilike.%${search}%,deskripsi.ilike.%${search}%`);
      }

      if (startDate) {
        query = query.gte('tanggal_keluar', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('tanggal_keluar', `${endDate}T23:59:59`);
      }

      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data, count, error } = await query
        .order(sortColumn, { ascending: sortOrder === 'asc' })
        .range(from, to);

      if (error) throw error;
      setHistory(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching stock out history:', err);
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

  const handlePrepareExport = () => {
    const dataToExport = history.map(entry => ({
      'Tanggal Keluar': new Date(entry.tanggal_keluar).toLocaleString('id-ID'),
      'Kode Barang': entry.kode_barang,
      'Nama Barang': entry.nama_barang,
      'Lokasi Asal': entry.nama_lokasi || entry.master_lokasi?.nama_lokasi || entry.kode_lokasi || '-',
      'Lokasi Keluar': entry.lokasi_keluar || '-',
      'Jumlah': entry.jumlah_barang,
      'Oleh': entry.user_name,
      'Alasan': entry.keterangan_alasan || '-'
    }));
    setExportData(dataToExport);
    setIsExportPreviewOpen(true);
  };

  const handleConfirmExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Out History");
    XLSX.writeFile(workbook, `Stock_Out_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    setIsExportPreviewOpen(false);
  };

  const handleRestore = async () => {
    if (!entryToRestore) return;
    setIsRestoring(true);

    try {
      // 1. Insert back to items table (use upsert to handle halfway failures)
      const { data: insertedItem, error: insertError } = await supabase
        .from('items')
        .upsert([{
          id: entryToRestore.original_item_id, // Keep the original ID if possible
          kode_barang: entryToRestore.kode_barang,
          nama_barang: entryToRestore.nama_barang,
          jumlah_barang: entryToRestore.jumlah_barang,
          kode_lokasi: entryToRestore.kode_lokasi,
          foto_urls: entryToRestore.foto_urls,
          deskripsi: entryToRestore.deskripsi,
          created_at: entryToRestore.created_at,
          updated_at: new Date().toISOString()
        }], { onConflict: 'id' })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') { // unique_violation on kode_barang
          throw new Error('Kode barang ini sudah digunakan oleh barang lain di Master Barang. Silakan cek kembali.');
        }
        throw insertError;
      }

      // 2. Update the audit log created by the trigger
      // Fetch the latest INSERT log for this item
      const { data: latestLog, error: logFetchError } = await supabase
        .from('item_audit_logs')
        .select('id, new_values')
        .eq('item_id', insertedItem.id)
        .eq('action', 'INSERT')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (logFetchError) {
        console.error('Error fetching latest log:', logFetchError);
      }

      if (latestLog) {
        // Update the action to 'DIKEMBALIKAN KE STOCK' and add a note
        const { error: updateLogError } = await supabase
          .from('item_audit_logs')
          .update({
            action: 'DIKEMBALIKAN KE STOCK',
            new_values: {
              ...(latestLog.new_values as object || {}),
              keterangan_restore: `Dikembalikan dari riwayat keluar. Alasan keluar sebelumnya: ${entryToRestore.keterangan_alasan}`
            }
          })
          .eq('id', latestLog.id);
          
        if (updateLogError) {
          console.error('Error updating log:', updateLogError);
        }
      } else {
        // If trigger didn't create a log, manually insert one
        const { error: insertLogError } = await supabase
          .from('item_audit_logs')
          .insert([{
            item_id: insertedItem.id,
            action: 'DIKEMBALIKAN KE STOCK',
            new_values: {
              kode_barang: entryToRestore.kode_barang,
              nama_barang: entryToRestore.nama_barang,
              jumlah_barang: entryToRestore.jumlah_barang,
              keterangan_restore: `Dikembalikan dari riwayat keluar. Alasan keluar sebelumnya: ${entryToRestore.keterangan_alasan}`
            },
            changed_by: profile?.id
          }]);
          
        if (insertLogError) {
          console.error('Error inserting manual log:', insertLogError);
        }
      }

      // 3. Delete from stock_keluar_history
      const { error: deleteError, count } = await supabase
        .from('stock_keluar_history')
        .delete({ count: 'exact' })
        .eq('id', entryToRestore.id);

      if (deleteError) throw deleteError;
      
      if (count === 0) {
        console.warn('Peringatan: Data tidak terhapus dari stock_keluar_history. Kemungkinan karena RLS (Row Level Security).');
      }

      showToast('Barang berhasil dikembalikan ke stock', 'success');
      setIsRestoreModalOpen(false);
      setEntryToRestore(null);
      fetchHistory(); // Refresh the list
    } catch (err: any) {
      console.error('Error restoring item:', err);
      showToast(err.message || 'Gagal mengembalikan barang', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Out History</h2>
          <p className="text-gray-500">Daftar barang yang telah dikeluarkan dari inventaris</p>
        </div>
        {profile?.role === 'admin' && (
          <button
            onClick={handlePrepareExport}
            disabled={history.length === 0}
            className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium disabled:opacity-50"
          >
            <Download size={20} />
            <span>Export Excel</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Cari nama, kode, lokasi, atau deskripsi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center space-x-2">
            <Calendar size={18} className="text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          {(startDate || endDate || search) && (
            <button 
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearch('');
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 backdrop-blur-md rounded-lg transition-all whitespace-nowrap shadow-sm"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group"
                  onClick={() => handleSort('tanggal_keluar')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Tanggal Keluar</span>
                    {sortColumn === 'tanggal_keluar' ? (
                      sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4">Kode</th>
                <th className="px-6 py-4">Nama Barang</th>
                <th className="px-6 py-4">Lokasi Asal</th>
                <th className="px-6 py-4">Lokasi Keluar</th>
                <th className="px-6 py-4">Jumlah</th>
                <th className="px-6 py-4">Alasan</th>
                <th className="px-6 py-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
                    <p className="text-gray-500">Memuat riwayat...</p>
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="mx-auto text-gray-300 mb-2" size={48} />
                    <p className="text-gray-500">Tidak ada riwayat ditemukan</p>
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr 
                    key={entry.id} 
                    className="hover:bg-gray-50 transition-colors group cursor-pointer"
                    onClick={() => {
                      setSelectedEntry(entry);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(entry.tanggal_keluar).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{entry.kode_barang}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{entry.nama_barang}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {entry.nama_lokasi || entry.master_lokasi?.nama_lokasi || entry.kode_lokasi || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                        {entry.lokasi_keluar || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{entry.jumlah_barang}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500 truncate max-w-[150px]">{entry.keterangan_alasan}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setHistorySearch) {
                              setHistorySearch(entry.kode_barang);
                              navigate('/log-item-change');
                            }
                          }}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Lihat Riwayat"
                        >
                          <History size={18} />
                        </button>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEntryToRestore(entry);
                              setIsRestoreModalOpen(true);
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Kembalikan ke Stock"
                          >
                            <RotateCcw size={18} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEntry(entry);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Detail"
                        >
                          <Info size={18} />
                        </button>
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
              Menampilkan <span className="font-medium text-gray-900">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium text-gray-900">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium text-gray-900">{totalCount}</span> riwayat
            </p>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Per halaman:</span>
              <select
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

      {/* Detail Modal */}
      {isDetailModalOpen && selectedEntry && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsDetailModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detail Barang Keluar</h3>
              <button onClick={() => setIsDetailModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-hide">
              {/* Item Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Informasi Barang</label>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Kode Barang</span>
                        <span className="text-sm font-mono font-medium text-gray-900">{selectedEntry.kode_barang}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Nama Barang</span>
                        <span className="text-sm font-medium text-gray-900">{selectedEntry.nama_barang}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Lokasi Asal</span>
                        <span className="text-sm font-medium text-gray-900">{selectedEntry.nama_lokasi || selectedEntry.master_lokasi?.nama_lokasi || selectedEntry.kode_lokasi || '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Lokasi Keluar</span>
                        <span className="text-sm font-bold text-orange-600 bg-orange-50 px-2 rounded">{selectedEntry.lokasi_keluar || '-'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Jumlah</span>
                        <span className="text-sm font-bold text-gray-900">{selectedEntry.jumlah_barang}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail Pengeluaran</label>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Tanggal Keluar</span>
                        <span className="text-sm font-medium text-gray-900">{new Date(selectedEntry.tanggal_keluar).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Oleh</span>
                        <span className="text-sm font-medium text-gray-900">{selectedEntry.user_name}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alasan / Keterangan</label>
                    <p className="mt-2 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100 italic">
                      "{selectedEntry.keterangan_alasan}"
                    </p>
                  </div>
                </div>
              </div>

              {/* Photos */}
              {selectedEntry.foto_urls && selectedEntry.foto_urls.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Foto Snapshot</label>
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {selectedEntry.foto_urls.map((url, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => openLightbox(selectedEntry.foto_urls, idx)}
                        className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer"
                      >
                        <img src={url} alt="Snapshot" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedEntry.deskripsi && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deskripsi Barang</label>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {selectedEntry.deskripsi}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
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

      {/* Restore Confirmation Modal */}
      {isRestoreModalOpen && entryToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4 mx-auto">
                <RotateCcw className="text-emerald-600" size={24} />
              </div>
              
              <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
                Kembalikan ke Stock?
              </h3>
              
              <p className="text-center text-gray-500 mb-6">
                Anda akan mengembalikan <span className="font-semibold text-gray-900">{entryToRestore.nama_barang}</span> sebanyak <span className="font-semibold text-gray-900">{entryToRestore.jumlah_barang}</span> ke Master Barang.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start space-x-3">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Penting:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Barang akan dihapus dari riwayat ini.</li>
                    <li>Akan tercatat di Log Item Change sebagai "Barang dikembali ke stock".</li>
                  </ul>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setEntryToRestore(null);
                  }}
                  disabled={isRestoring}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw size={18} />
                      <span>Ya, Kembalikan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {isLightboxOpen && lightboxImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setIsLightboxOpen(false)}
        >
          <button 
            className="absolute top-6 right-6 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
            onClick={() => setIsLightboxOpen(false)}
          >
            <X size={32} />
          </button>

          <div className="relative w-full h-full flex items-center justify-center p-4">
            {lightboxImages.length > 1 && (
              <button 
                className="absolute left-6 p-4 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
              >
                <ChevronLeft size={48} />
              </button>
            )}

            <div className="max-w-5xl max-h-[85vh] relative group" onClick={(e) => e.stopPropagation()}>
              <img 
                src={lightboxImages[currentImageIndex]} 
                alt="Enlarged view" 
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                referrerPolicy="no-referrer"
              />
            </div>

            {lightboxImages.length > 1 && (
              <button 
                className="absolute right-6 p-4 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
              >
                <ChevronRight size={48} />
              </button>
            )}

            {lightboxImages.length > 1 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/50 rounded-full text-white text-lg font-medium backdrop-blur-md border border-white/10">
                {currentImageIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
