import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../UI/Toast';
import SignedImage from '../UI/SignedImage';
import { Item, SPKRequest, SPKRequestItem, FlagDef } from '../../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Search, X, Loader2, ShoppingCart, CheckSquare, Square, Package,
  ChevronLeft, ChevronRight, ClipboardList, Calendar, AlertCircle, Eye,
  Tag, AlertTriangle, Star, CheckCircle2, Flag as FlagIcon, Zap, ShieldAlert, Info
} from 'lucide-react';

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
  const [filterFlag, setFilterFlag] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [availableFlags, setAvailableFlags] = useState<string[]>([]);
  const [flagCatalog, setFlagCatalog] = useState<FlagDef[]>([]);

  // SPK submit modal
  const [isSPKModalOpen, setIsSPKModalOpen] = useState(false);
  const [spkKeterangan, setSpkKeterangan] = useState('');
  const [isSubmittingSPK, setIsSubmittingSPK] = useState(false);

  // History tab state
  const [myRequests, setMyRequests] = useState<SPKRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<SPKRequest | null>(null);
  const [requestItems, setRequestItems] = useState<SPKRequestItem[]>([]);
  const [loadingRequestItems, setLoadingRequestItems] = useState(false);

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
  }, [tab, page, debouncedSearch, filterKategori, filterLokasi, filterFlag]);

  async function fetchFilterOptions() {
    // Opsi filter diturunkan dari barang Office yang benar-benar ada saja
    // (bukan dari seluruh tabel categories/master_lokasi), supaya requester
    // tidak lihat kategori/lokasi/flag yang tidak relevan buat mereka.
    try {
      const { data, error } = await supabase
        .from('items')
        .select('kategori_id, kode_lokasi, flags, categories(nama_kategori), master_lokasi(nama_lokasi)')
        .eq('sifat_barang', 'OFFICE');
      if (error) throw error;

      const catMap = new Map<string, string>();
      const locMap = new Map<string, string>();
      const flagSet = new Set<string>();

      (data || []).forEach((item: any) => {
        if (item.kategori_id && item.categories?.nama_kategori) {
          catMap.set(item.kategori_id, item.categories.nama_kategori);
        }
        if (item.kode_lokasi && item.master_lokasi?.nama_lokasi) {
          locMap.set(item.kode_lokasi, item.master_lokasi.nama_lokasi);
        }
        (item.flags || []).forEach((f: string) => flagSet.add(f));
      });

      setCategories(
        Array.from(catMap, ([id, nama_kategori]) => ({ id, nama_kategori }))
          .sort((a, b) => a.nama_kategori.localeCompare(b.nama_kategori))
      );
      setLocations(
        Array.from(locMap, ([kode_lokasi, nama_lokasi]) => ({ kode_lokasi, nama_lokasi }))
          .sort((a, b) => a.nama_lokasi.localeCompare(b.nama_lokasi))
      );
      setAvailableFlags(Array.from(flagSet).sort((a, b) => a.localeCompare(b)));
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
        .eq('sifat_barang', 'OFFICE');

      if (debouncedSearch) {
        query = query.or(`nama_barang.ilike.%${debouncedSearch}%,kode_barang.ilike.%${debouncedSearch}%,deskripsi.ilike.%${debouncedSearch}%`);
      }
      if (filterKategori) {
        query = query.eq('kategori_id', filterKategori);
      }
      if (filterLokasi) {
        query = query.eq('kode_lokasi', filterLokasi);
      }
      if (filterFlag) {
        query = query.contains('flags', [filterFlag]);
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
        .select('*')
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

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedItems(prev => prev.length === items.length ? [] : items.map(i => i.id));
  };

  const submitSPK = async () => {
    if (selectedItems.length === 0 || !spkKeterangan.trim()) return;
    setIsSubmittingSPK(true);
    try {
      const reqRes = await supabase.from('spk_requests').insert({
        nomor_spk: `SPK-${Date.now()}`,
        diajukan_oleh: profile?.full_name || 'Unknown',
        user_id: user?.id,
        jumlah: selectedItems.length,
        status: 'PENDING_ADMIN',
        keterangan: spkKeterangan,
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
        foto_urls: item.foto_urls || [],
        status_item: 'PENDING',
      }));

      const itemRes = await supabase.from('spk_request_items').insert(insertItems);
      if (itemRes.error) throw itemRes.error;

      showToast('Pengajuan SPK berhasil dibuat!', 'success');
      setIsSPKModalOpen(false);
      setSpkKeterangan('');
      setSelectedItems([]);
      fetchItems();
    } catch (err: any) {
      console.error(err);
      showToast('Gagal mengajukan SPK: ' + err.message, 'error');
    } finally {
      setIsSubmittingSPK(false);
    }
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
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <ShoppingCart className="text-sky-600" size={24} />
          <span>Barang Office</span>
        </h2>
        <p className="text-gray-500">Lihat & ajukan pengambilan barang milik kantor</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setTab('items')}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0",
            tab === 'items' ? "border-sky-600 text-sky-700" : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Daftar Barang
        </button>
        <button
          onClick={() => setTab('history')}
          className={cn(
            "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap shrink-0",
            tab === 'history' ? "border-sky-600 text-sky-700" : "border-transparent text-gray-500 hover:text-gray-700"
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
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
            <div className="md:w-52 shrink-0">
              <select
                value={filterFlag}
                onChange={(e) => { setFilterFlag(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm bg-white font-medium"
              >
                <option value="">Semua Flag</option>
                {availableFlags.map((flag) => (
                  <option key={flag} value={flag}>{flag}</option>
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
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="px-6 py-4 w-10">
                      <button onClick={toggleSelectAll} className="text-gray-400 hover:text-sky-600 transition-colors">
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
                        <p className="text-gray-500">Memuat data...</p>
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Package className="mx-auto text-gray-300 mb-2" size={48} />
                        <p className="text-gray-500">Tidak ada barang Office ditemukan</p>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id} className={cn("hover:bg-gray-50 transition-colors", selectedItems.includes(item.id) && "bg-sky-50/50")}>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleSelectItem(item.id)} className="text-gray-400 hover:text-sky-600 transition-colors">
                            {selectedItems.includes(item.id) ? <CheckSquare size={20} className="text-sky-600" /> : <Square size={20} />}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {item.foto_urls && item.foto_urls.length > 0 ? (
                            <SignedImage bucket="item-photos" path={item.foto_urls[0]} alt={item.nama_barang} className="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-sm" />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-100">
                              <Package size={20} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{item.nama_barang}</div>
                          <div className="text-xs text-gray-400 font-mono">{item.kode_barang}</div>
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
                        <td className="px-6 py-4 text-sm text-gray-600">
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
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
                                  +{item.flags.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{item.jumlah_barang}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                Menampilkan <span className="font-medium">{totalCount === 0 ? 0 : (page - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> dari <span className="font-medium">{totalCount}</span> barang
              </p>
              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-sm text-gray-600 px-2">{page} / {totalPages}</span>
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
        </>
      ) : (
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4">Nomor SPK</th>
                  <th className="px-6 py-4">Tanggal</th>
                  <th className="px-6 py-4">Jumlah</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
                      <p className="text-gray-500">Memuat riwayat...</p>
                    </td>
                  </tr>
                ) : myRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <ClipboardList className="mx-auto text-gray-300 mb-2" size={48} />
                      <p className="text-gray-500">Belum ada pengajuan SPK.</p>
                    </td>
                  </tr>
                ) : (
                  myRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => handleViewRequestDetail(req)}>
                      <td className="px-6 py-4 font-semibold text-gray-900">{req.nomor_spk}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 flex items-center">
                        <Calendar size={14} className="mr-1.5 text-gray-400" />
                        {new Date(req.tanggal_pengajuan || req.created_at).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{req.jumlah || '-'} barang</td>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !isSubmittingSPK && setIsSPKModalOpen(false)}
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
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                <label className="block text-sm font-bold text-gray-700">Keterangan / Keperluan <span className="text-red-500">*</span></label>
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
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={submitSPK}
                disabled={isSubmittingSPK || !spkKeterangan.trim()}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRequest.nomor_spk}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{new Date(selectedRequest.created_at).toLocaleDateString('id-ID')}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase">Status</span>
                {statusBadge(selectedRequest.status)}
              </div>
              {selectedRequest.keterangan && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Keterangan</p>
                  <p className="text-sm text-gray-700">{selectedRequest.keterangan}</p>
                </div>
              )}

              <h4 className="text-sm font-bold text-gray-900 pt-2">Daftar Barang</h4>
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
                        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300 shrink-0">
                          <Package size={18} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.nama_barang}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.kode_barang}</p>
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
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
