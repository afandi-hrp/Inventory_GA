import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Plus, Edit2, Trash2, Search, X, Loader2, AlertCircle, UserCheck } from 'lucide-react';
import { Kepemilikan } from '../../types';
import { useToast } from '../UI/Toast';

export default function MasterKepemilikan() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<Kepemilikan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Kepemilikan | null>(null);
  const [deletingItem, setDeletingItem] = useState<Kepemilikan | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const [formData, setFormData] = useState({
    nama_pemilik: '',
    keterangan: '',
  });

  useEffect(() => {
    fetchItems();
  }, [search]);

  async function fetchItems() {
    setLoading(true);
    try {
      let query = supabase
        .from('master_kepemilikan')
        .select('*')
        .order('nama_pemilik');

      if (search) {
        query = query.ilike('nama_pemilik', `%${search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching kepemilikan:', err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleOpenModal = (item?: Kepemilikan) => {
    if (!isAdmin) {
      showToast('Akses Ditolak: Hanya admin yang dapat mengubah atau menambah kepemilikan.', 'error');
      return;
    }

    if (item) {
      setEditingItem(item);
      setFormData({
        nama_pemilik: item.nama_pemilik,
        keterangan: item.keterangan || '',
      });
    } else {
      setEditingItem(null);
      setFormData({ nama_pemilik: '', keterangan: '' });
    }
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (item: Kepemilikan) => {
    if (!isAdmin) {
      showToast('Akses Ditolak: Hanya admin yang dapat menghapus kepemilikan.', 'error');
      return;
    }
    setDeletingItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setFormLoading(true);
    setFormError(null);

    try {
      const payload = {
        nama_pemilik: formData.nama_pemilik,
        keterangan: formData.keterangan || null,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('master_kepemilikan')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
        showToast('Kepemilikan berhasil diperbarui', 'success');
      } else {
        const { error } = await supabase
          .from('master_kepemilikan')
          .insert([payload]);

        if (error) throw error;
        showToast('Kepemilikan berhasil ditambahkan', 'success');
      }

      setIsModalOpen(false);
      fetchItems();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan kepemilikan. Pastikan nama pemilik belum terdaftar.');
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingItem || !isAdmin) return;
    setFormLoading(true);
    try {
      const { error } = await supabase
        .from('master_kepemilikan')
        .delete()
        .eq('id', deletingItem.id);

      if (error) throw error;
      showToast('Kepemilikan berhasil dihapus', 'success');
      setIsDeleteModalOpen(false);
      fetchItems();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus kepemilikan', 'error');
    } finally {
      setFormLoading(false);
      setDeletingItem(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 border-b-2 border-orange-500 pb-1 inline-block">Master Kepemilikan</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola daftar penanggung jawab (PIC) barang</p>
        </div>

        {isAdmin && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-lg transition-colors shadow-md font-medium"
          >
            <Plus size={20} className="mr-2" />
            Tambah Kepemilikan
          </button>
        )}
      </div>

      <div className="bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50">
        <div className="relative group max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Cari nama pemilik..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
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
      </div>

      <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-4">Nama Pemilik</th>
                <th className="px-6 py-4">Keterangan</th>
                <th className="px-6 py-4">Tgl Dibuat</th>
                {isAdmin && <th className="px-6 py-4 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="animate-spin mx-auto mb-2 text-orange-500" size={24} />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="mx-auto mb-2 text-gray-400" size={24} />
                    <p>Tidak ada data kepemilikan ditemukan.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-orange-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <UserCheck size={16} className="text-orange-500" />
                        <span className="text-sm font-semibold text-gray-900">{item.nama_pemilik}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 truncate max-w-sm">{item.keterangan || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '-'}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(item)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !formLoading && setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                {editingItem ? 'Edit Kepemilikan' : 'Tambah Kepemilikan Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-white rounded-full p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
              {formError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center border border-red-100">
                  <AlertCircle size={16} className="mr-2 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nama Pemilik <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.nama_pemilik}
                    onChange={(e) => setFormData({ ...formData, nama_pemilik: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    placeholder="Misal: Budi Santoso"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Keterangan</label>
                  <textarea
                    rows={4}
                    value={formData.keterangan}
                    onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    placeholder="Tambahkan keterangan (jabatan, divisi, dsb.)..."
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formLoading || !formData.nama_pemilik.trim()}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-lg transition-colors flex items-center shadow-md disabled:opacity-50"
                >
                  {formLoading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                  Simpan Kepemilikan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90dvh] overflow-y-auto p-6 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
              <AlertCircle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">Hapus Kepemilikan?</h3>
            <p className="text-sm text-center text-gray-500 mb-6">
              Hapus kepemilikan <span className="font-bold text-red-600">{deletingItem.nama_pemilik}</span>?
              Pastikan tidak ada barang yang terkait dengan kepemilikan ini.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors w-full"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={formLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center w-full disabled:opacity-50"
              >
                {formLoading ? <Loader2 className="animate-spin" size={16} /> : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
