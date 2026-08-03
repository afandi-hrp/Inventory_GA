import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useIdleTimeout(isAuthenticated: boolean, timeoutMs: number = 3600000) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fungsi untuk melakukan logout
    const handleLogout = async () => {
      await supabase.auth.signOut();
      window.location.href = '/'; // Reload ke halaman login
    };

    // Fungsi untuk mereset timer
    const resetTimer = () => {
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
  }, [isAuthenticated, timeoutMs]);
}
