import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const IDLE_TIMEOUT_MS = 1800000; // 30 menit
export const LAST_ACTIVITY_KEY = 'ga_last_activity';

// Dipakai juga dari useAuth (dicek pas app baru dibuka/di-reload) supaya
// aturan "30 menit tanpa aktivitas = logout" berlaku sama baik tab dibiarkan
// kebuka maupun ditutup lalu dibuka lagi belakangan.
export function markActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // localStorage bisa gak tersedia (mis. private mode) - abaikan, fallback ke timer in-memory saja
  }
}

export function useIdleTimeout(isAuthenticated: boolean, timeoutMs: number = IDLE_TIMEOUT_MS, onTimeout?: () => void) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fungsi untuk melakukan logout. Sesi tetap di-invalidate beneran di sini
    // (bukan cuma "ditutupin layar doang") — yang beda cuma reaksi setelahnya:
    // kalau ada onTimeout, serahkan ke situ (mis. tampilkan layar terkunci di
    // tab yang sama), kalau tidak ada, reload penuh ke halaman Login seperti semula.
    const handleLogout = async () => {
      await supabase.auth.signOut();
      if (onTimeout) {
        onTimeout();
      } else {
        window.location.href = '/'; // Reload ke halaman login
      }
    };

    // Fungsi untuk mereset timer
    const resetTimer = () => {
      markActivity();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(handleLogout, timeoutMs);
    };

    // Event listener untuk mendeteksi aktivitas pengguna
    const events = ['mousemove', 'keydown', 'wheel', 'DOMMouseScroll', 'mouseWheel', 'mousedown', 'touchstart', 'touchmove', 'MSPointerDown', 'MSPointerMove'];

    // Set timer pertama kali
    resetTimer();

    // Pasang event listener
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Cleanup saat komponen unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated, timeoutMs, onTimeout]);
}
