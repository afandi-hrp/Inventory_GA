import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import {
  Package, MapPin, Users, TrendingUp, Clock, Layers, ArrowDownRight, ArrowUpRight, BarChart2,
  ShoppingCart, ClipboardList, ArrowRight, X, Hash, Info, Calendar, Image as ImageIcon, UserCheck,
  Sunrise, Sun, Sunset, Moon, AlertTriangle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Item } from '../../types';
import SignedImage from '../UI/SignedImage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getGreeting(hour: number) {
  if (hour >= 4 && hour < 11) {
    return { text: 'Selamat Pagi', Icon: Sunrise, color: 'text-orange-500' };
  }
  if (hour >= 11 && hour < 15) {
    return { text: 'Selamat Siang', Icon: Sun, color: 'text-amber-500' };
  }
  if (hour >= 15 && hour < 18) {
    return { text: 'Selamat Sore', Icon: Sunset, color: 'text-orange-600' };
  }
  return { text: 'Selamat Malam', Icon: Moon, color: 'text-indigo-500' };
}

export default function DashboardHome() {
  const { user, profile } = useAuth();
  const isRequester = profile?.role === 'requester';
  const [stats, setStats] = useState({
    totalItems: 0,
    totalLocations: 0,
    totalCategories: 0,
    totalUsers: 0,
    totalStockIn: 0,
    totalStockOut: 0,
  });
  const [mySpkStats, setMySpkStats] = useState({ total: 0, pending: 0 });
  const [pendingDisposalCount, setPendingDisposalCount] = useState(0);
  const [pendingSPKCount, setPendingSPKCount] = useState(0);
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedKepemilikan, setSelectedKepemilikan] = useState<string | null>(null);
  const [selectedLokasi, setSelectedLokasi] = useState<string | null>(null);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<Item | null>(null);
  // Supaya tombol/gesture "Kembali" di mobile menutup modal, bukan keluar aplikasi
  useModalBackButton(!!selectedItemForDetail, () => setSelectedItemForDetail(null));
  const [chartData, setChartData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [kepemilikanData, setKepemilikanData] = useState<any[]>([]);
  const [lokasiData, setLokasiData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const [itemsRes, profilesRes, locationsRes, categoryRes, stockOutRes, auditLogsRes] = await Promise.all([
          supabase.from('items').select('*, master_lokasi(nama_lokasi), categories(nama_kategori), master_kepemilikan(nama_pemilik)'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('master_lokasi').select('*', { count: 'exact', head: true }),
          supabase.from('categories').select('*', { count: 'exact', head: true }),
          supabase.from('stock_keluar_history').select('tanggal_keluar, created_at, jumlah_barang').or(`tanggal_keluar.gte.${sixMonthsAgo.toISOString()},created_at.gte.${sixMonthsAgo.toISOString()}`),
          supabase.from('item_audit_logs').select('action, created_at, new_values').gte('created_at', sixMonthsAgo.toISOString())
        ]);

        if (itemsRes.data) {
          const totalStockIn = itemsRes.data.reduce((acc, item) => acc + (item.jumlah_barang || 0), 0);
          const totalStockOut = stockOutRes.data ? stockOutRes.data.reduce((acc, curr) => acc + (curr.jumlah_barang || 0), 0) : 0;
          
          setStats({
            totalItems: itemsRes.data.length,
            totalLocations: locationsRes.count || 0,
            totalCategories: categoryRes.count || 0,
            totalUsers: profilesRes.count || 0,
            totalStockIn,
            totalStockOut
          });

          // Recent items
          const sorted = [...itemsRes.data].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ).slice(0, 20);
          setRecentItems(sorted);
          setAllItems(itemsRes.data as Item[]);

          // Category distribution
          const catCount: Record<string, number> = {};
          itemsRes.data.forEach(item => {
            const catName = (item as any).categories?.nama_kategori || 'Tanpa Kategori';
            catCount[catName] = (catCount[catName] || 0) + 1;
          });
          const catDataChart = Object.keys(catCount).map(key => ({
            name: key,
            value: catCount[key]
          })).sort((a,b) => b.value - a.value);
          setCategoryData(catDataChart);

          // Kepemilikan distribution
          const ownerCount: Record<string, number> = {};
          itemsRes.data.forEach(item => {
            const ownerName = (item as any).master_kepemilikan?.nama_pemilik || 'Tanpa Kepemilikan';
            ownerCount[ownerName] = (ownerCount[ownerName] || 0) + 1;
          });
          const ownerDataChart = Object.keys(ownerCount).map(key => ({
            name: key,
            value: ownerCount[key]
          })).sort((a,b) => b.value - a.value);
          setKepemilikanData(ownerDataChart);

          // Lokasi distribution
          const lokasiCount: Record<string, number> = {};
          itemsRes.data.forEach(item => {
            const lokasiName = (item as any).master_lokasi?.nama_lokasi || 'Tanpa Lokasi';
            lokasiCount[lokasiName] = (lokasiCount[lokasiName] || 0) + 1;
          });
          const lokasiDataChart = Object.keys(lokasiCount).map(key => ({
            name: key,
            value: lokasiCount[key]
          })).sort((a,b) => b.value - a.value);
          setLokasiData(lokasiDataChart);

          // Chart data: Monthly stats (last 6 months)
          const months: any[] = [];
          const now = new Date();
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
              name: d.toLocaleString('id-ID', { month: 'short' }),
              monthNum: d.getMonth(),
              year: d.getFullYear(),
              Baru: 0,
              Keluar: 0,
              Diedit: 0
            });
          }

          itemsRes.data.forEach(item => {
            const createdDate = new Date(item.created_at);
            months.forEach(m => {
              if (createdDate.getMonth() === m.monthNum && createdDate.getFullYear() === m.year) {
                m.Baru += 1;
              }
            });
          });

          if (auditLogsRes.data) {
            auditLogsRes.data.forEach(log => {
              const logDate = new Date(log.created_at);
              months.forEach(m => {
                if (logDate.getMonth() === m.monthNum && logDate.getFullYear() === m.year) {
                  if (log.action === 'UPDATE') {
                    m.Diedit += 1;
                  }
                }
              });
            });
          }

          if (stockOutRes.data) {
            stockOutRes.data.forEach(out => {
              const outDate = new Date(out.tanggal_keluar || out.created_at);
              const createdDate = new Date(out.created_at);
              months.forEach(m => {
                // Count as Keluar based on outDate
                if (outDate.getMonth() === m.monthNum && outDate.getFullYear() === m.year) {
                  m.Keluar += 1;
                }
                // Also count as Baru based on original createdDate, because it was deleted from items
                if (createdDate.getMonth() === m.monthNum && createdDate.getFullYear() === m.year) {
                  m.Baru += 1;
                }
              });
            });
          }

          setChartData(months);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  useEffect(() => {
    async function fetchMySpkStats() {
      if (!isRequester || !user) return;
      try {
        const { data, error } = await supabase
          .from('spk_requests')
          .select('status')
          .eq('user_id', user.id);
        if (error) throw error;
        const total = data?.length || 0;
        const pending = (data || []).filter(r => r.status === 'PENDING_ADMIN' || r.status === 'PENDING_AUDITOR' || r.status === 'PENDING_SPV').length;
        setMySpkStats({ total, pending });
      } catch (err) {
        console.error('Error fetching my SPK stats:', err);
      }
    }
    fetchMySpkStats();
  }, [isRequester, user]);

  useEffect(() => {
    async function fetchPendingApprovalCounts() {
      const role = profile?.role;
      if (!role || isRequester) return;

      // Setiap role cuma "punya" satu tahap yang bisa dia proses di masing-masing
      // alur — hitung berapa pengajuan yang lagi nunggu tahap itu.
      const disposalStageByRole: Record<string, string> = {
        auditor: 'PENDING_AUDITOR',
        spv: 'PENDING_SPV',
        direktur: 'PENDING_DIREKTUR',
      };
      const spkStageByRole: Record<string, string> = {
        admin: 'PENDING_ADMIN',
        auditor: 'PENDING_AUDITOR',
        spv: 'PENDING_SPV',
      };

      try {
        const disposalStage = disposalStageByRole[role];
        if (disposalStage) {
          const { count } = await supabase
            .from('disposal_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', disposalStage);
          setPendingDisposalCount(count || 0);
        }

        const spkStage = spkStageByRole[role];
        if (spkStage) {
          const { count } = await supabase
            .from('spk_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', spkStage);
          setPendingSPKCount(count || 0);
        }
      } catch (err) {
        console.error('Error fetching pending approval counts:', err);
      }
    }
    fetchPendingApprovalCounts();
  }, [isRequester, profile?.role]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];
  const greeting = getGreeting(new Date().getHours());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Summary */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block mb-2">
          {isRequester ? 'Dashboard Barang Office' : 'Dashboard'}
        </h1>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium text-brand-purple">
            {greeting.text}, <span className="font-bold text-brand-purple">{profile?.full_name || 'User'}</span>
          </p>
          <greeting.Icon className={cn(greeting.color)} size={20} />
        </div>
        {isRequester && (
          <p className="text-sm text-brand-purple mt-1">Ringkasan barang Office yang tersedia & pengajuan SPK Anda</p>
        )}
      </div>

      {isRequester ? (
        <>
          {/* CTA Banner */}
          <Link
            to="/office-items"
            className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-sky-600 to-sky-500 p-6 rounded-3xl shadow-lg shadow-sky-500/20 text-white hover:shadow-xl transition-all group"
          >
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white/20 rounded-2xl">
                <ShoppingCart size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Mau ambil barang Office?</h3>
                <p className="text-sm text-sky-50">Lihat daftar barang & ajukan SPK pengambilan di sini</p>
              </div>
            </div>
            <span className="flex items-center space-x-2 bg-white/20 group-hover:bg-white/30 px-4 py-2 rounded-xl font-semibold text-sm transition-colors shrink-0">
              <span>Buka Barang Office</span>
              <ArrowRight size={16} />
            </span>
          </Link>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total Jenis Barang Office" value={stats.totalItems} icon={<Package className="text-blue-600" size={24} />} color="bg-blue-500/10 border border-blue-500/20" />
            <StatCard title="Total Stok Office" value={stats.totalStockIn} subtitle="Tersedia" icon={<ArrowDownRight className="text-emerald-600" size={24} />} color="bg-emerald-500/10 border border-emerald-500/20" />
            <Link to="/office-items" className="block">
              <StatCard title="Pengajuan SPK Saya" value={mySpkStats.total} subtitle={`${mySpkStats.pending} Menunggu`} icon={<ClipboardList className="text-indigo-600" size={24} />} color="bg-indigo-500/10 border border-indigo-500/20" />
            </Link>
          </div>
        </>
      ) : (
        /* Summary Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard title="Total Jenis Barang" value={stats.totalItems} icon={<Package className="text-blue-600" size={24} />} color="bg-blue-500/10 border border-blue-500/20" />
          <StatCard title="Total Registrasi Stok" value={stats.totalStockIn} subtitle="Stok Tersedia" icon={<ArrowDownRight className="text-emerald-600" size={24} />} color="bg-emerald-500/10 border border-emerald-500/20" />
          <StatCard title="Total Stok Keluar" value={stats.totalStockOut} subtitle="Dalam 6 bulan" icon={<ArrowUpRight className="text-rose-600" size={24} />} color="bg-rose-500/10 border border-rose-500/20" />
          <div className="grid grid-rows-2 gap-4">
            <MiniStatCard title="Total Lokasi" value={stats.totalLocations} icon={<MapPin size={18} className="text-indigo-600" />} />
            <MiniStatCard title="Total Kategori" value={stats.totalCategories} icon={<Layers size={18} className="text-orange-600" />} />
          </div>
        </div>
      )}

      {/* Notifikasi Persetujuan Tertunda */}
      {!isRequester && (pendingDisposalCount > 0 || pendingSPKCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingDisposalCount > 0 && (
            <Link to="/barang" className="block">
              <StatCard title="Menunggu Persetujuan Pemusnahan" value={pendingDisposalCount} subtitle="Perlu Tindakan" icon={<AlertTriangle className="text-amber-600" size={24} />} color="bg-amber-500/10 border border-amber-500/20" />
            </Link>
          )}
          {pendingSPKCount > 0 && (
            <Link to="/barang" className="block">
              <StatCard title="Menunggu Persetujuan SPK" value={pendingSPKCount} subtitle="Perlu Tindakan" icon={<ClipboardList className="text-emerald-600" size={24} />} color="bg-emerald-500/10 border border-emerald-500/20" />
            </Link>
          )}
        </div>
      )}

      {/* Explore Panels: Kategori & Kepemilikan */}
      <ExploreDimensionPanel
        title="Jelajahi Kategori"
        headerIcon={<Layers className="mr-2 text-indigo-600" size={20} />}
        cardIcon={<Package size={24} />}
        theme="indigo"
        data={categoryData}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        items={allItems}
        getKey={(item) => (item as any).categories?.nama_kategori || 'Tanpa Kategori'}
        onItemClick={setSelectedItemForDetail}
      />

      <ExploreDimensionPanel
        title="Jelajahi Kepemilikan"
        headerIcon={<UserCheck className="mr-2 text-emerald-600" size={20} />}
        cardIcon={<UserCheck size={24} />}
        theme="emerald"
        data={kepemilikanData}
        selected={selectedKepemilikan}
        onSelect={setSelectedKepemilikan}
        items={allItems}
        getKey={(item) => (item as any).master_kepemilikan?.nama_pemilik || 'Tanpa Kepemilikan'}
        onItemClick={setSelectedItemForDetail}
      />

      <ExploreDimensionPanel
        title="Jelajahi Lokasi"
        headerIcon={<MapPin className="mr-2 text-orange-600" size={20} />}
        cardIcon={<MapPin size={24} />}
        theme="orange"
        data={lokasiData}
        selected={selectedLokasi}
        onSelect={setSelectedLokasi}
        items={allItems}
        getKey={(item) => (item as any).master_lokasi?.nama_lokasi || 'Tanpa Lokasi'}
        onItemClick={setSelectedItemForDetail}
      />

      {/* Chart - disembunyikan untuk requester karena datanya (audit log/stock-out) tidak ke-scope ke barang Office saja */}
      {!isRequester && (
        <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 w-full">
          <h3 className="text-lg font-semibold mb-6 flex items-center text-brand-purple">
            <BarChart2 className="mr-2 text-blue-600" size={20} />
            Statistik Aktivitas Inventaris (6 Bulan Terakhir)
          </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 13, fill: '#6b7280', fontWeight: 500 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 13, fill: '#6b7280', fontWeight: 500 }}
                    dx={-10}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(243, 244, 246, 0.5)' }}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '12px',
                      border: '1px solid #f3f4f6',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{ fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                  <Bar dataKey="Baru" name="Barang Masuk" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Keluar" name="Barang Keluar" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Diedit" name="Aktivitas Edit" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
      )}

      {/* Recent Items */}
      <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 flex flex-col">
        <h3 className="text-lg font-semibold mb-6 flex items-center shrink-0 text-brand-purple">
          <Clock className="mr-2 text-blue-600" size={20} />
          {isRequester ? 'Barang Office Terbaru' : 'Penambahan Barang Terbaru'}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left relative">
            <thead className="bg-gray-50/50">
              <tr className="text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                <th className="py-3 px-4 rounded-tl-lg">Barang</th>
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Lokasi</th>
                <th className="py-3 px-4 text-right rounded-tr-lg">Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/50">
              {recentItems.map((item, index) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedItemForDetail(item)}
                  className={`text-sm hover:bg-white/50 transition-colors cursor-pointer ${index < 3 ? 'bg-blue-50/30' : ''}`}
                >
                  <td className="py-3 px-4 font-medium text-brand-purple">
                    <div className="flex items-center space-x-2">
                      {index < 3 && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Terbaru"></span>}
                      <span className={index < 3 ? 'text-blue-700 font-semibold' : ''}>{item.nama_barang}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-brand-purple">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{item.kode_barang}</span>
                  </td>
                  <td className="py-3 px-4 text-brand-purple">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-brand-purple">
                      {(item as any).categories?.nama_kategori || 'Tanpa Kategori'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-brand-purple">{(item as any).master_lokasi?.nama_lokasi || item.kode_lokasi || '-'}</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-600">{item.jumlah_barang}</td>
                </tr>
              ))}
              {recentItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-brand-purple italic">Belum ada data barang</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Detail Modal */}
      {selectedItemForDetail && (
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
                onClick={() => setSelectedItemForDetail(null)}
                className="p-2 text-brand-purple hover:text-brand-purple hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Photo */}
                <div className="space-y-4">
                  <div className="aspect-square rounded-2xl bg-gray-100 overflow-hidden border border-gray-100">
                    {selectedItemForDetail.foto_urls && selectedItemForDetail.foto_urls.length > 0 ? (
                      <SignedImage bucket="item-photos" path={selectedItemForDetail.foto_urls[0]} alt={selectedItemForDetail.nama_barang} className="w-full h-full object-cover" />
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
                        <div key={idx} className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-100">
                          <SignedImage bucket="item-photos" path={url} alt={`Preview ${idx + 2}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Informasi Dasar</h4>
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Package size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Nama Barang</p>
                          <p className="text-base font-bold text-brand-purple">{selectedItemForDetail.nama_barang}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Hash size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Kode Barang</p>
                          <p className="text-sm font-mono font-medium text-brand-purple">{selectedItemForDetail.kode_barang}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Kategori, Lokasi & Kepemilikan</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Package size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Kategori</p>
                          <p className="text-sm font-medium text-brand-purple">{(selectedItemForDetail as any).categories?.nama_kategori || 'Tanpa Kategori'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><MapPin size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Lokasi</p>
                          <p className="text-sm font-medium text-brand-purple">{(selectedItemForDetail as any).master_lokasi?.nama_lokasi || '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-sky-50 text-sky-600 rounded-lg"><UserCheck size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Kepemilikan</p>
                          <p className="text-sm font-medium text-brand-purple">{(selectedItemForDetail as any).master_kepemilikan?.nama_pemilik || '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Info size={18} /></div>
                        <div>
                          <p className="text-xs text-brand-purple">Stok Saat Ini</p>
                          <p className="text-sm font-bold text-brand-purple">{selectedItemForDetail.jumlah_barang} unit</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedItemForDetail.kondisi_barang && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Kondisi Barang</h4>
                      <span className={cn(
                        "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border",
                        selectedItemForDetail.kondisi_barang === 'BAIK' ? "bg-green-50 text-green-700 border-green-200" :
                        selectedItemForDetail.kondisi_barang === 'CUKUP BAIK' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                        "bg-red-50 text-red-700 border-red-200"
                      )}>
                        {selectedItemForDetail.kondisi_barang}
                      </span>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-brand-purple uppercase tracking-wider mb-1">Deskripsi</h4>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-sm text-brand-purple leading-relaxed">
                        {selectedItemForDetail.deskripsi || 'Tidak ada deskripsi tambahan untuk barang ini.'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center text-xs text-brand-purple">
                      <Calendar size={14} className="mr-1" />
                      <span>Terakhir diperbarui: {new Date(selectedItemForDetail.updated_at).toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50 shrink-0">
              <button
                onClick={() => setSelectedItemForDetail(null)}
                className="px-6 py-2 text-sm font-medium text-brand-purple hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
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

const EXPLORE_THEME = {
  indigo: {
    cardActive: 'bg-indigo-50 border-indigo-300 shadow-md ring-2 ring-indigo-500/20',
    iconActive: 'bg-indigo-100 text-indigo-600',
    titleActive: 'text-indigo-900',
    textAccent: 'text-indigo-600',
  },
  emerald: {
    cardActive: 'bg-emerald-50 border-emerald-300 shadow-md ring-2 ring-emerald-500/20',
    iconActive: 'bg-emerald-100 text-emerald-600',
    titleActive: 'text-emerald-900',
    textAccent: 'text-emerald-600',
  },
  orange: {
    cardActive: 'bg-orange-50 border-orange-300 shadow-md ring-2 ring-orange-500/20',
    iconActive: 'bg-orange-100 text-orange-600',
    titleActive: 'text-orange-900',
    textAccent: 'text-orange-600',
  },
} as const;

function ExploreDimensionPanel({ title, headerIcon, cardIcon, theme, data, selected, onSelect, items, getKey, onItemClick }: {
  title: string;
  headerIcon: React.ReactNode;
  cardIcon: React.ReactNode;
  theme: keyof typeof EXPLORE_THEME;
  data: { name: string, value: number }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  items: Item[];
  getKey: (item: Item) => string;
  onItemClick: (item: Item) => void;
}) {
  const t = EXPLORE_THEME[theme];
  return (
    <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 flex flex-col">
      <h3 className="text-lg font-semibold mb-6 flex items-center shrink-0 text-brand-purple">
        {headerIcon}
        {title}
      </h3>

      <div className="max-h-[280px] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {data.map((d, idx) => {
            const isSelected = selected === d.name;
            return (
              <div
                key={idx}
                onClick={() => onSelect(isSelected ? null : d.name)}
                className={cn(
                  "p-4 rounded-2xl border cursor-pointer hover:-translate-y-1 transition-all flex flex-col items-center justify-center text-center",
                  isSelected ? t.cardActive : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
                )}
              >
                <div className={cn("p-3 rounded-full mb-3 shadow-sm", isSelected ? t.iconActive : "bg-gray-50 text-brand-purple")}>
                  {cardIcon}
                </div>
                <h4 className={cn("font-semibold text-sm mb-1", isSelected ? t.titleActive : "text-brand-purple")}>{d.name}</h4>
                <p className="text-xs text-brand-purple">{d.value} Barang</p>
              </div>
            );
          })}
          {data.length === 0 && (
            <p className="col-span-full text-sm text-brand-purple italic py-4">Belum ada data.</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="mt-6 pt-6 border-t border-gray-200/50 animate-in slide-in-from-top-4 fade-in duration-300">
          <h4 className="font-semibold text-brand-purple mb-4 flex items-center">
            Daftar Barang - <span className={cn("ml-1", t.textAccent)}>{selected}</span>
          </h4>
          <div className="overflow-auto max-h-[420px] border border-gray-100 rounded-xl">
            <table className="w-full text-left relative">
              <thead className="bg-gray-50/80 sticky top-0 backdrop-blur-sm z-10">
                <tr className="text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                  <th className="py-3 px-4">Barang</th>
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Lokasi</th>
                  <th className="py-3 px-4 text-right">Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/50">
                {items
                  .filter(item => getKey(item) === selected)
                  .map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onItemClick(item)}
                    className="text-sm hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-brand-purple">{item.nama_barang}</td>
                    <td className="py-3 px-4 text-brand-purple font-mono text-xs">{item.kode_barang}</td>
                    <td className="py-3 px-4 text-brand-purple">{(item as any).master_lokasi?.nama_lokasi || item.kode_lokasi || '-'}</td>
                    <td className="py-3 px-4 text-right font-bold text-blue-600">{item.jumlah_barang}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, color }: { title: string, value: number, subtitle?: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 flex flex-col justify-center hover:shadow-xl transition-all hover:-translate-y-1 group relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl ${color} shadow-sm group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        {subtitle && <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-brand-purple rounded-full">{subtitle}</span>}
      </div>
      <div>
        <p className="text-3xl font-extrabold text-brand-purple tracking-tight mb-1">{value.toLocaleString()}</p>
        <p className="text-sm font-semibold text-brand-purple">{title}</p>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12 scale-150 pointer-events-none group-hover:scale-110 transition-transform duration-500">
        {icon}
      </div>
    </div>
  );
}

function MiniStatCard({ title, value, icon }: { title: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl shadow-sm border border-white/50 flex items-center space-x-4 hover:shadow-md transition-all group">
      <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 group-hover:bg-white transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-brand-purple uppercase tracking-wider mb-0.5">{title}</p>
        <p className="text-xl font-bold text-brand-purple">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

