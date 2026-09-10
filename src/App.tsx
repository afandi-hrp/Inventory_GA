import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useIdleTimeout, IDLE_TIMEOUT_MS } from './hooks/useIdleTimeout';
import Login from './components/Auth/Login';
import LockScreen from './components/Auth/LockScreen';
import Layout from './components/Dashboard/Layout';
import DashboardHome from './components/Dashboard/Home';
import MasterBarang from './components/Inventory/MasterBarang';
import MasterLokasi from './components/Inventory/MasterLokasi';
import MasterKategori from './components/Inventory/MasterKategori';
import MasterKepemilikan from './components/Inventory/MasterKepemilikan';
import OfficeItemsRequester from './components/Inventory/OfficeItemsRequester';
import TakeItemHistory from './components/Inventory/TakeItemHistory';
import LogItemChange from './components/Inventory/LogItemChange';
import StockOutHistory from './components/Inventory/StockOutHistory';
import Approval from './components/Inventory/Approval';
import ManageUsers from './components/Admin/ManageUsers';
import { ToastProvider } from './components/UI/Toast';
import { supabase } from './lib/supabase';

interface LockedIdentity {
  email: string;
  fullName?: string;
  wasRequester: boolean;
}

export default function App() {
  const { user, profile, loading } = useAuth();
  const [historySearch, setHistorySearch] = useState('');
  const isRequester = profile?.role === 'requester';

  // Selagi masih authenticated, ref ini selalu nyimpen identitas terbaru —
  // dipakai begitu idle-timeout kepicu (sesi udah di-signOut beneran duluan),
  // supaya layar terkunci masih bisa nunjukin "siapa yang lagi login" walau
  // `user`/`profile` dari useAuth() udah null saat itu.
  const identityRef = useRef<LockedIdentity | null>(null);
  useEffect(() => {
    identityRef.current = user ? { email: user.email || '', fullName: profile?.full_name, wasRequester: isRequester } : null;
  }, [user, profile, isRequester]);

  const [isLocked, setIsLocked] = useState(false);
  const [lockedIdentity, setLockedIdentity] = useState<LockedIdentity | null>(null);

  const handleIdleTimeout = useCallback(() => {
    setLockedIdentity(identityRef.current);
    setIsLocked(true);
  }, []);

  // Auto logout setelah 30 menit tidak ada aktivitas — sesinya di-invalidate
  // beneran, tapi selama masih di tab yang sama, tampilan terakhir tetap ada
  // (di-blur) lewat LockScreen, bukan langsung dilempar ke halaman Login.
  useIdleTimeout(!!user, IDLE_TIMEOUT_MS, handleIdleTimeout);

  const handleUnlock = () => {
    setIsLocked(false);
    setLockedIdentity(null);
  };

  const handleLogoutFromLock = async () => {
    await supabase.auth.signOut();
    setIsLocked(false);
    setLockedIdentity(null);
  };

  // Cuma dipakai selagi sesi login sedang dicek ke server — animasi bermerek
  // yang sesungguhnya (video motion logo) ada di halaman Login itu sendiri.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-cream to-brand-coral">
        <Loader2 className="animate-spin text-brand-purple" size={40} />
      </div>
    );
  }

  // Kalau lagi terkunci, tetap render tampilan terakhir (state halaman gak
  // ikut hilang) — cuma `user` udah null karena sesi asli sudah di-signOut,
  // jadi dimensi Kategori/Lokasi/Kepemilikan dsb pakai identitas yang
  // di-cache (lockedIdentity) supaya gak keliru nampilin halaman Login penuh.
  if (!user && !isLocked) {
    return (
      <ToastProvider>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </ToastProvider>
    );
  }

  const effectiveIsRequester = isLocked ? !!lockedIdentity?.wasRequester : isRequester;

  return (
    <ToastProvider>
      <div className={isLocked ? 'pointer-events-none select-none blur-sm brightness-95' : undefined}>
        <Layout setHistorySearch={setHistorySearch}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/office-items" element={<OfficeItemsRequester />} />
            <Route path="/manage-users" element={<ManageUsers />} />
            {!effectiveIsRequester && (
              <>
                <Route path="/barang" element={<MasterBarang setHistorySearch={setHistorySearch} />} />
                <Route path="/approval" element={<Approval />} />
                <Route path="/lokasi" element={<MasterLokasi setHistorySearch={setHistorySearch} />} />
                <Route path="/kategori" element={<MasterKategori />} />
                <Route path="/kepemilikan" element={<MasterKepemilikan />} />
                <Route path="/take-item-history" element={<TakeItemHistory initialSearch={historySearch} />} />
                <Route path="/log-item-change" element={<LogItemChange initialSearch={historySearch} />} />
                <Route path="/stock-out-history" element={<StockOutHistory setHistorySearch={setHistorySearch} />} />
              </>
            )}
            <Route path="*" element={<Navigate to={effectiveIsRequester ? "/office-items" : "/dashboard"} replace />} />
          </Routes>
        </Layout>
      </div>

      {isLocked && lockedIdentity && (
        <LockScreen
          email={lockedIdentity.email}
          fullName={lockedIdentity.fullName}
          onUnlock={handleUnlock}
          onLogoutInstead={handleLogoutFromLock}
        />
      )}
    </ToastProvider>
  );
}
