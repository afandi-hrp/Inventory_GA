import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lock, Loader2, ArrowRight, LogOut } from 'lucide-react';

interface LockScreenProps {
  email: string;
  fullName?: string;
  onUnlock: () => void;
  onLogoutInstead: () => void;
}

export default function LockScreen({ email, fullName, onUnlock, onLogoutInstead }: LockScreenProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onUnlock();
    } catch (err) {
      console.error('Unlock error:', err);
      setError('Password salah, coba lagi.');
    } finally {
      setLoading(false);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-brand-purple/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-[320px] bg-brand-cream/95 backdrop-blur-2xl border border-white/60 rounded-[1.5rem] shadow-2xl p-6">
        <div className="flex flex-col items-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-cream to-brand-coral shadow-lg p-1.5 mb-3 flex items-center justify-center">
            <img src="/logo-purple.svg" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-white flex items-center justify-center text-brand-purple mb-2">
            <Lock size={20} />
          </div>
          <h1 className="text-sm font-bold text-brand-purple text-center">Sesi Berakhir</h1>
          <p className="text-xs text-brand-purple/70 text-center mt-1">
            {fullName || email} — masukkan password untuk lanjut
          </p>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="relative flex items-center">
            <div className="absolute left-1 z-10 w-8 h-8 rounded-full bg-white shadow-sm border border-white flex items-center justify-center text-brand-purple/60">
              <Lock size={14} />
            </div>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white/60 border border-white/80 rounded-full focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple/40 focus:bg-white text-sm transition-all placeholder:text-brand-purple/40"
              placeholder="password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-brand-purple hover:bg-brand-purple-light text-white text-sm font-semibold shadow-lg shadow-brand-purple/30 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <>Buka <ArrowRight size={15} /></>}
          </button>
        </form>

        <button
          onClick={onLogoutInstead}
          className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 text-xs font-medium text-brand-purple/60 hover:text-brand-purple transition-colors"
        >
          <LogOut size={13} />
          Bukan Anda? Logout
        </button>
      </div>
    </div>
  );
}
