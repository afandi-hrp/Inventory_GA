import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types';
import { IDLE_TIMEOUT_MS, LAST_ACTIVITY_KEY, markActivity } from './useIdleTimeout';

// Pesan untuk halaman Login setelah logout paksa (dibaca & dihapus oleh Login.tsx).
export const AUTH_NOTICE_KEY = 'auth_notice';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.warn('Session check error:', error.message);
        // If there's an error (like invalid refresh token), ensure we clear the state
        currentUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (session?.user) {
        // Sesi valid secara token gak berarti user-nya masih "aktif" — kalau
        // tab ditutup lalu dibuka lagi setelah lebih dari 30 menit tanpa
        // aktivitas (timestamp ini di-update tiap aktivitas oleh
        // useIdleTimeout), paksa logout di sini juga, sebelum konten
        // ter-autentikasi sempat dirender (halaman masih nampilin loader).
        let lastActivity = 0;
        try {
          lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
        } catch {
          // localStorage gak tersedia - lewati pengecekan ini, tetap andalkan timer in-memory
        }
        const idleFor = lastActivity ? Date.now() - lastActivity : 0;
        if (lastActivity && idleFor > IDLE_TIMEOUT_MS) {
          await supabase.auth.signOut();
          currentUserIdRef.current = null;
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        markActivity();
      }

      currentUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    }).catch(err => {
      console.warn('Unexpected session error:', err);
      setLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;

      // Supabase juga memicu event ini saat cuma refresh token di belakang layar
      // (mis. tab kembali fokus setelah pindah ke aplikasi lain) — kalau user-nya
      // masih sama persis, tidak perlu query ulang profil / bikin state baru,
      // supaya komponen lain yang punya `profile` di dependency useEffect-nya
      // (mis. daftar barang di Master Barang) tidak ikut fetch ulang tanpa alasan.
      if (newUserId === currentUserIdRef.current) {
        return;
      }

      currentUserIdRef.current = newUserId;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Akun login tapi tidak punya profil (seharusnya selalu dibuat oleh
          // trigger handle_new_user saat admin membuat user). JANGAN bikin
          // profil dari sini — versi lama otomatis bikin profil role 'admin',
          // artinya akun tanpa profil langsung jadi admin. Keluarkan saja.
          console.warn('Profil tidak ditemukan untuk akun ini - logout paksa.');
          try {
            sessionStorage.setItem(AUTH_NOTICE_KEY, 'Akun Anda belum terdaftar di aplikasi. Hubungi admin.');
          } catch {
            // sessionStorage gak tersedia - lewati pesannya, logout tetap jalan
          }
          await supabase.auth.signOut();
          setProfile(null);
          setUser(null);
          return;
        } else {
          throw error;
        }
      } else {
        if (data && data.is_active === false) {
          // User is explicitly disabled, sign them out
          await supabase.auth.signOut();
          setProfile(null);
          setUser(null);
          return;
        }
        setProfile(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  }

  return { user, profile, loading };
}
