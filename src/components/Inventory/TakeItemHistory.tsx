import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Loader2, History, Package, User as UserIcon, Calendar, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Search, Filter, XCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TakeItemHistoryEntry {
  id: string;
  item_id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah: number;
  kode_lokasi: string;
  nama_lokasi: string;
  user_id: string;
  user_name: string;
  alasan: string;
  created_at: string;
  items: { // Joined item details (optional if item deleted)
    kode_barang: string;
    nama_barang: string;
  } | null;
  master_lokasi: { // Joined location details
    nama_lokasi: string;
  } | null;
  profiles: { // Joined user details
    full_name: string;
  } | null;
}

interface TakeItemHistoryProps {
  initialSearch?: string;
}

export default function TakeItemHistory({ initialSearch = '' }: TakeItemHistoryProps) {
  const { profile } = useAuth();
  const [history, setHistory] = useState<TakeItemHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [sortColumn, setSortColumn] = useState<'created_at' | 'nama_barang' | 'jumlah' | null>('created_at');
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

  // Modal state for viewing detailed history
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedHistoryEntryForDetail, setSelectedHistoryEntryForDetail] = useState<TakeItemHistoryEntry | null>(null);

  // Export state
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('take_item_history')
        .select(`*, items(kode_barang, nama_barang), master_lokasi(nama_lokasi), profiles(full_name)`, { count: 'exact' });

      if (searchTerm) {
        // Search in persisted columns in history table
        // This is much safer and avoids cross-table OR issues
        query = query.or(`nama_barang.ilike.%${searchTerm}%,kode_barang.ilike.%${searchTerm}%,nama_lokasi.ilike.%${searchTerm}%,user_name.ilike.%${searchTerm}%`);
      }

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00`);
      }

      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59`);
      }

      if (sortColumn) {
        if (sortColumn === 'nama_barang') {
          // Try to sort by items table if it exists, otherwise fallback to history table
          query = query.order('nama_barang', { ascending: sortDirection === 'asc' });
        } else {
          query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
        }
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setHistory(data as TakeItemHistoryEntry[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Error fetching take item history:', err);
      setError(err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, itemsPerPage, sortColumn, sortDirection, searchTerm, startDate, endDate]);

  const handleSort = (column: 'created_at' | 'nama_barang' | 'jumlah') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleOpenDetailModal = (entry: TakeItemHistoryEntry) => {
    setSelectedHistoryEntryForDetail(entry);
    setIsDetailModalOpen(true);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handlePrepareExport = () => {
    const dataToExport = history.map(entry => ({
      'Tanggal': new Date(entry.created_at).toLocaleString('id-ID'),
      'Kode Barang': entry.items.kode_barang,
      'Nama Barang': entry.items.nama_barang,
      'Lokasi': entry.master_lokasi?.nama_lokasi || '-',
      'Jumlah': entry.jumlah,
      'Pengambil': entry.profiles?.full_name || entry.user_name || 'Unknown User',
      'Alasan': entry.alasan || '-'
    }));
    setExportData(dataToExport);
    setIsExportPreviewOpen(true);
  };

  const handleConfirmExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Take Item History");
    XLSX.writeFile(workbook, `Take_Item_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    setIsExportPreviewOpen(false);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <History size={24} className="text-blue-600" />
          <span>Take Item History</span>
        </h2>
        {profile?.role === 'admin' && (
          <button
            onClick={handlePrepareExport}
            disabled={history.length === 0}
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

      {/* Advanced Search & Filters */}
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
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Calendar size={18} className="text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={handleClearSearch}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 backdrop-blur-md rounded-lg transition-all whitespace-nowrap shadow-sm"
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
                onClick={() => handleSort('nama_barang')}
              >
                <div className="flex items-center space-x-1">
                  <span>Nama Barang</span>
                  {sortColumn === 'nama_barang' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'nama_barang' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('jumlah')}
              >
                <div className="flex items-center space-x-1">
                  <span>Jumlah</span>
                  {sortColumn === 'jumlah' && (sortDirection === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                  {sortColumn !== 'jumlah' && <ArrowUpDown size={16} className="text-gray-300" />}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pengambil</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alasan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
                  <p className="text-gray-500">Memuat riwayat...</p>
                </td>
              </tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <History size={48} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500">Tidak ada riwayat pengambilan barang.</p>
                </td>
              </tr>
            ) : (
              history.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleOpenDetailModal(entry)}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Package size={18} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{entry.nama_barang || entry.items?.nama_barang || 'Item Deleted'}</p>
                        <p className="text-xs text-gray-500 font-mono">{entry.kode_barang || entry.items?.kode_barang || '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">
                      -{entry.jumlah}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <UserIcon size={18} className="text-gray-400" />
                      <p className="text-sm text-gray-900">{entry.profiles?.full_name || entry.user_name || 'Unknown User'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                    {entry.alasan || '-'}
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
            Menampilkan <span className="font-medium">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> riwayat
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

      {/* Detail History Modal */}
      {isDetailModalOpen && selectedHistoryEntryForDetail && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={() => setIsDetailModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Detail Riwayat Pengambilan</h3>
              <button 
                onClick={() => setIsDetailModalOpen(false)} 
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm overflow-y-auto flex-1 scrollbar-hide">
              <div>
                <p className="font-medium text-gray-700">Tanggal:</p>
                <p className="text-gray-900">{new Date(selectedHistoryEntryForDetail.created_at).toLocaleString('id-ID')}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Nama Barang:</p>
                <p className="text-gray-900">{selectedHistoryEntryForDetail.nama_barang || selectedHistoryEntryForDetail.items?.nama_barang || 'Item Deleted'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Kode Barang:</p>
                <p className="text-gray-900 font-mono">{selectedHistoryEntryForDetail.kode_barang || selectedHistoryEntryForDetail.items?.kode_barang || '-'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Lokasi:</p>
                <p className="text-gray-900">{selectedHistoryEntryForDetail.nama_lokasi || selectedHistoryEntryForDetail.master_lokasi?.nama_lokasi || selectedHistoryEntryForDetail.kode_lokasi || '-'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Jumlah:</p>
                <p className="text-gray-900">{selectedHistoryEntryForDetail.jumlah}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Pengambil:</p>
                <p className="text-gray-900">{selectedHistoryEntryForDetail.profiles?.full_name || selectedHistoryEntryForDetail.user_name || 'Unknown User'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">Alasan:</p>
                <p className="text-gray-900">{selectedHistoryEntryForDetail.alasan || '-'}</p>
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
    </div>
  );
}
