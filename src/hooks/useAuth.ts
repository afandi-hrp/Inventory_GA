import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('Session check error:', error.message);
        // If there's an error (like invalid refresh token), ensure we clear the state
        currentUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      currentUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user);
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
      if (session?.user) fetchProfile(session.user.id, session.user);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string, currentUser?: User | null) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([{ 
              id: userId, 
              role: 'admin', 
              full_name: (currentUser || user)?.email?.split('@')[0] || 'User' 
            }])
            .select()
            .single();
          
          if (insertError) throw insertError;
          setProfile(newProfile);
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
