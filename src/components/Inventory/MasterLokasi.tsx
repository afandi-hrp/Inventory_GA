import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Edit2, Trash2, X, Loader2, MapPin, Hash, ChevronLeft, ChevronRight, History
} from 'lucide-react';
import { Location } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useToast } from '../UI/Toast';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MasterLokasiProps {
  setHistorySearch?: (search: string) => void;
}

export default function MasterLokasi({ setHistorySearch }: MasterLokasiProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    kode_lokasi: '',
    nama_lokasi: '',
    parent_kode_lokasi: '',
  });

  useEffect(() => {
    fetchLocations();
  }, [page, search, itemsPerPage]);

  async function fetchLocations() {
    setLoading(true);
    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('master_lokasi')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.or(`nama_lokasi.ilike.%${search}%,kode_lokasi.ilike.%${search}%`);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setLocations(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching locations:', err);
      showToast('Gagal mengambil data lokasi', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (location?: Location) => {
    if (profile?.role !== 'admin') {
      showToast('Akses Ditolak: Anda tidak memiliki izin untuk melakukan aksi ini', 'error');
      return;
    }
    if (location) {
      setEditingLocation(location);
      setFormData({
        kode_lokasi: location.kode_lokasi,
        nama_lokasi: location.nama_lokasi,
        parent_kode_lokasi: location.parent_kode_lokasi || '',
      });
    } else {
      setEditingLocation(null);
      setFormData({
        kode_lokasi: `LOC-${Math.floor(1000 + Math.random() * 9000)}`,
        nama_lokasi: '',
        parent_kode_lokasi: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const payload = {
        kode_lokasi: formData.kode_lokasi,
        nama_lokasi: formData.nama_lokasi,
        parent_kode_lokasi: formData.parent_kode_lokasi || null,
      };

      if (editingLocation) {
        if (formData.nama_lokasi === editingLocation.nama_lokasi && formData.parent_kode_lokasi === (editingLocation.parent_kode_lokasi || '')) {
          setIsModalOpen(false);
          setFormLoading(false);
          return;
        }

        const { error } = await supabase
          .from('master_lokasi')
          .update(payload)
          .eq('kode_lokasi', editingLocation.kode_lokasi);
        if (error) throw error;
        showToast('Lokasi berhasil diperbarui', 'success');
      } else {
        const { error } = await supabase
          .from('master_lokasi')
          .insert([payload]);
        if (error) throw error;
        showToast('Lokasi berhasil ditambahkan', 'success');
      }
      setIsModalOpen(false);
      fetchLocations();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan lokasi', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (kode: string) => {
    if (profile?.role !== 'admin') {
      showToast('Akses Ditolak', 'error');
      return;
    }
    if (!confirm('Apakah Anda yakin ingin menghapus lokasi ini?')) return;

    try {
      const { error } = await supabase
        .from('master_lokasi')
        .delete()
        .eq('kode_lokasi', kode);
      if (error) throw error;
      showToast('Lokasi berhasil dihapus', 'success');
      fetchLocations();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus lokasi', 'error');
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Master Lokasi</h2>
          <p className="text-gray-500">Kelola daftar lokasi penyimpanan barang</p>
        </div>
        {profile?.role === 'admin' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition-all shadow-sm font-medium"
          >
            <Plus size={20} />
            <span>Tambah Lokasi</span>
          </button>
        )}
      </div>

      <div className="bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Cari kode atau nama lokasi..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-4">Kode Lokasi</th>
                <th className="px-6 py-4">Nama Lokasi</th>
                <th className="px-6 py-4">Sub Dari</th>
                <th className="px-6 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center">
                    <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={32} />
                    <p className="text-gray-500">Memuat data...</p>
                  </td>
                </tr>
              ) : locations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center">
                    <MapPin className="text-gray-300 mx-auto mb-2" size={48} />
                    <p className="text-gray-500">Tidak ada lokasi ditemukan</p>
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr key={loc.kode_lokasi} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <Hash size={16} className="text-gray-400" />
                        <span className="font-mono text-sm font-medium text-blue-600">{loc.kode_lokasi}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 font-medium">{loc.nama_lokasi}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {loc.parent_kode_lokasi ? locations.find(l => l.kode_lokasi === loc.parent_kode_lokasi)?.nama_lokasi || loc.parent_kode_lokasi : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setHistorySearch) {
                              setHistorySearch(loc.nama_lokasi);
                              navigate('/take-item-history');
                            }
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Lihat Riwayat"
                        >
                          <History size={18} />
                        </button>
                        <button
                          onClick={() => handleOpenModal(loc)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(loc.kode_lokasi)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 border-t border-gray-200/50 bg-gray-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Menampilkan <span className="font-medium text-gray-900">{(page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium text-gray-900">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium text-gray-900">{totalCount}</span> lokasi
            </div>
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

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                {editingLocation ? 'Edit Lokasi' : 'Tambah Lokasi Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 flex items-center">
                  <Hash size={14} className="mr-1" /> Kode Lokasi
                </label>
                <input
                  type="text"
                  value={formData.kode_lokasi}
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-mono text-sm cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-400">Kode digenerate otomatis</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 flex items-center">
                  <MapPin size={14} className="mr-1" /> Nama Lokasi
                </label>
                <input
                  type="text"
                  required
                  value={formData.nama_lokasi}
                  onChange={(e) => setFormData({ ...formData, nama_lokasi: e.target.value })}
                  placeholder="Contoh: Gudang A, Rak 01, dsb."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 flex items-center">
                  <MapPin size={14} className="mr-1" /> Sub Dari (Opsional)
                </label>
                <select
                  value={formData.parent_kode_lokasi}
                  onChange={(e) => setFormData({ ...formData, parent_kode_lokasi: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-sm bg-white"
                >
                  <option value="">Pilih Lokasi Utama...</option>
                  {locations
                    .filter(loc => !editingLocation || loc.kode_lokasi !== editingLocation.kode_lokasi)
                    .map((loc) => (
                    <option key={loc.kode_lokasi} value={loc.kode_lokasi}>{loc.nama_lokasi}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200 font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-70"
                >
                  {formLoading ? <Loader2 className="animate-spin" size={18} /> : <span>{editingLocation ? 'Simpan Perubahan' : 'Tambah Lokasi'}</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
