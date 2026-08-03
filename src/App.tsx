import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import Login from './components/Auth/Login';
import Layout from './components/Dashboard/Layout';
import DashboardHome from './components/Dashboard/Home';
import MasterBarang from './components/Inventory/MasterBarang';
import MasterLokasi from './components/Inventory/MasterLokasi';
import MasterKategori from './components/Inventory/MasterKategori';
import TakeItemHistory from './components/Inventory/TakeItemHistory';
import LogItemChange from './components/Inventory/LogItemChange';
import StockOutHistory from './components/Inventory/StockOutHistory';
import LoginSettings from './components/Admin/LoginSettings';
import ManageUsers from './components/Admin/ManageUsers';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/UI/Toast';

export default function App() {
  const { user, loading } = useAuth();
  const [historySearch, setHistorySearch] = useState('');
  
  // Set idle timeout ke 1 jam (3600000 ms) saat user sudah login
  useIdleTimeout(!!user, 3600000);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF9E3] via-[#FFDAB9] to-[#FFB08E]">
        <div className="text-center">
          <Loader2 className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
          <p className="text-gray-600 font-medium">Menyiapkan Aplikasi...</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      {!user ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Layout setHistorySearch={setHistorySearch}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/barang" element={<MasterBarang setHistorySearch={setHistorySearch} />} />
            <Route path="/lokasi" element={<MasterLokasi setHistorySearch={setHistorySearch} />} />
            <Route path="/kategori" element={<MasterKategori />} />
            <Route path="/take-item-history" element={<TakeItemHistory initialSearch={historySearch} />} />
            <Route path="/log-item-change" element={<LogItemChange initialSearch={historySearch} />} />
            <Route path="/stock-out-history" element={<StockOutHistory setHistorySearch={setHistorySearch} />} />
            <Route path="/login-settings" element={<LoginSettings />} />
            <Route path="/manage-users" element={<ManageUsers />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Layout>
      )}
    </ToastProvider>
  );
}
