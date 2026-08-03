import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, MapPin, Users, TrendingUp, Clock, Layers, ArrowDownRight, ArrowUpRight, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Item } from '../../types';

export default function DashboardHome() {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalLocations: 0,
    totalCategories: 0,
    totalUsers: 0,
    totalStockIn: 0,
    totalStockOut: 0,
  });
  const [recentItems, setRecentItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const [itemsRes, profilesRes, locationsRes, categoryRes, stockOutRes, auditLogsRes] = await Promise.all([
          supabase.from('items').select('*, master_lokasi(nama_lokasi), categories(nama_kategori)'),
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

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

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
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 border-b-2 border-orange-500 pb-1 inline-block mb-2">Dashboard</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard title="Total Jenis Barang" value={stats.totalItems} icon={<Package className="text-blue-600" size={24} />} color="bg-blue-500/10 border border-blue-500/20" />
        <StatCard title="Total Registrasi Stok" value={stats.totalStockIn} subtitle="Stok Tersedia" icon={<ArrowDownRight className="text-emerald-600" size={24} />} color="bg-emerald-500/10 border border-emerald-500/20" />
        <StatCard title="Total Stok Keluar" value={stats.totalStockOut} subtitle="Dalam 6 bulan" icon={<ArrowUpRight className="text-rose-600" size={24} />} color="bg-rose-500/10 border border-rose-500/20" />
        <div className="grid grid-rows-2 gap-4">
          <MiniStatCard title="Total Lokasi" value={stats.totalLocations} icon={<MapPin size={18} className="text-indigo-600" />} />
          <MiniStatCard title="Total Kategori" value={stats.totalCategories} icon={<Layers size={18} className="text-orange-600" />} />
        </div>
      </div>

      {/* Categories Panel */}
      <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 flex flex-col">
        <h3 className="text-lg font-semibold mb-6 flex items-center shrink-0 text-gray-800">
          <Layers className="mr-2 text-indigo-600" size={20} />
          Jelajahi Kategori
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {categoryData.map((cat, idx) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <div 
                key={idx}
                onClick={() => setSelectedCategory(isSelected ? null : cat.name)}
                className={`p-4 rounded-2xl border cursor-pointer hover:-translate-y-1 transition-all flex flex-col items-center justify-center text-center ${isSelected ? 'bg-indigo-50 border-indigo-300 shadow-md ring-2 ring-indigo-500/20' : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'}`}
              >
                <div className={`p-3 rounded-full mb-3 shadow-sm ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                  <Package size={24} />
                </div>
                <h4 className={`font-semibold text-sm mb-1 ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{cat.name}</h4>
                <p className="text-xs text-gray-500">{cat.value} Barang</p>
              </div>
            );
          })}
        </div>

        {selectedCategory && (
          <div className="mt-6 pt-6 border-t border-gray-200/50 animate-in slide-in-from-top-4 fade-in duration-300">
            <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
              Daftar Barang - <span className="text-indigo-600 ml-1">{selectedCategory}</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left relative">
                <thead className="bg-gray-50/50">
                  <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <th className="py-3 px-4 rounded-tl-lg">Barang</th>
                    <th className="py-3 px-4">Kode</th>
                    <th className="py-3 px-4">Lokasi</th>
                    <th className="py-3 px-4 text-right rounded-tr-lg">Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/50">
                  {allItems
                    .filter(item => ((item as any).categories?.nama_kategori || 'Tanpa Kategori') === selectedCategory)
                    .map((item) => (
                    <tr key={item.id} className="text-sm hover:bg-white/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{item.nama_barang}</td>
                      <td className="py-3 px-4 text-gray-500 font-mono text-xs">{item.kode_barang}</td>
                      <td className="py-3 px-4 text-gray-500">{(item as any).master_lokasi?.nama_lokasi || item.kode_lokasi || '-'}</td>
                      <td className="py-3 px-4 text-right font-bold text-blue-600">{item.jumlah_barang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 w-full">
        <h3 className="text-lg font-semibold mb-6 flex items-center text-gray-800">
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

      {/* Recent Items */}
      <div className="bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 flex flex-col">
        <h3 className="text-lg font-semibold mb-6 flex items-center shrink-0 text-gray-800">
          <Clock className="mr-2 text-blue-600" size={20} />
          Penambahan Barang Terbaru
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left relative">
            <thead className="bg-gray-50/50">
              <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="py-3 px-4 rounded-tl-lg">Barang</th>
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Lokasi</th>
                <th className="py-3 px-4 text-right rounded-tr-lg">Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/50">
              {recentItems.map((item, index) => (
                <tr key={item.id} className={`text-sm hover:bg-white/50 transition-colors ${index < 3 ? 'bg-blue-50/30' : ''}`}>
                  <td className="py-3 px-4 font-medium text-gray-900">
                    <div className="flex items-center space-x-2">
                      {index < 3 && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]" title="Terbaru"></span>}
                      <span className={index < 3 ? 'text-blue-700 font-semibold' : ''}>{item.nama_barang}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{item.kode_barang}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {(item as any).categories?.nama_kategori || 'Tanpa Kategori'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{(item as any).master_lokasi?.nama_lokasi || item.kode_lokasi || '-'}</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-600">{item.jumlah_barang}</td>
                </tr>
              ))}
              {recentItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 italic">Belum ada data barang</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
        {subtitle && <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-600 rounded-full">{subtitle}</span>}
      </div>
      <div>
        <p className="text-3xl font-extrabold text-gray-900 tracking-tight mb-1">{value.toLocaleString()}</p>
        <p className="text-sm font-semibold text-gray-500">{title}</p>
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{title}</p>
        <p className="text-xl font-bold text-gray-900">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

