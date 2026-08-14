import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../hooks/useSettings';
import { Mail, Lock, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const generateCaptcha = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Breakpoint md Tailwind (768px) — dipakai buat pilih video mana yang diputar.
const MOBILE_BREAKPOINT = 768;

export default function Login() {
  const { settings, loading: settingsLoading } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  // Kartu login baru fade-in tepat di detik ke-8 video motion logo (dicek
  // langsung dari waktu putar videonya, bukan tebakan pakai timer) — video
  // sendiri tetap loop terus-menerus dari awal, dan kartunya tidak pernah
  // disembunyikan lagi begitu sudah muncul. Karena ini state React biasa,
  // semuanya otomatis terulang dari awal tiap kali halaman dibuka/di-refresh.
  const REVEAL_AT_SECOND = 8;
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!mounted && e.currentTarget.currentTime >= REVEAL_AT_SECOND) {
      setMounted(true);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setCaptchaText(generateCaptcha());
  }, []);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleRefreshCaptcha = () => {
    setCaptchaText(generateCaptcha());
    setCaptchaInput('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaInput !== captchaText) {
      setError('Captcha does not match. Please try again.');
      handleRefreshCaptcha();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error('No user data returned from login');
      }
    } catch (err: any) {
      console.error('Caught login exception:', err);
      setError('Wrong email or password');
      handleRefreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (settingsLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-brand-cream to-brand-coral">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="animate-spin text-brand-purple" size={48} />
          <p className="text-brand-purple/70 font-medium animate-pulse">Preparing Login Page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden bg-gradient-to-br from-brand-cream to-brand-coral">
      {/* Video motion logo — overlay latar penuh, loop terus-menerus, dan
          tetap di lapisan paling belakang (z-0) supaya tidak pernah
          menutupi/menyembunyikan kartu login yang ada di atasnya. */}
      <video
        ref={videoRef}
        key={isMobile ? 'mobile' : 'desktop'}
        src={isMobile ? '/motion-logo-mobile.mp4' : '/motion-logo-desktop.mp4'}
        autoPlay
        muted
        loop
        playsInline
        onTimeUpdate={handleVideoTimeUpdate}
        className="absolute inset-0 z-0 w-full h-full object-cover"
      />

      {/* Login Card — satu-satunya elemen yang di-fade-in (muncul dari
          "tenggelam": geser naik + membesar tipis + memudar masuk), sekali,
          lalu tetap ada terus. */}
      <div className="relative z-10 min-h-[100dvh] flex items-center justify-center md:justify-start px-4 sm:px-10 lg:px-20 py-8 pointer-events-none">
        <div
          className={cn(
            'w-full max-w-[300px] max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-hide bg-brand-cream/90 backdrop-blur-2xl border border-white/60 rounded-[1.5rem] sm:rounded-[1.75rem] shadow-2xl p-4 sm:p-6 pointer-events-auto transition-all duration-1000 ease-out',
            mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-16 scale-95'
          )}
        >
          {/* Logo & App Name */}
          <div className="flex flex-col items-center mb-3 sm:mb-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-brand-cream to-brand-coral shadow-lg p-1.5 mb-2.5 flex items-center justify-center">
              <img src="/logo-purple.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-brand-purple tracking-tight text-center leading-tight">
              {settings.login_title}
            </h1>
          </div>

          <h2 className="text-sm font-bold text-brand-purple mb-2.5">Log in</h2>

          {error && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-100 text-red-700 text-xs sm:text-sm rounded-xl font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-2.5 sm:space-y-3">
            {/* Email */}
            <div className="relative flex items-center">
              <div className="absolute left-1 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white shadow-sm border border-white flex items-center justify-center text-brand-purple/60">
                <Mail size={15} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 sm:pl-12 pr-4 py-2 sm:py-2.5 bg-white/60 border border-white/80 rounded-full focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple/40 focus:bg-white text-xs sm:text-sm transition-all placeholder:text-brand-purple/40"
                placeholder="username or email"
              />
            </div>

            {/* Password */}
            <div className="relative flex items-center">
              <div className="absolute left-1 z-10 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white shadow-sm border border-white flex items-center justify-center text-brand-purple/60">
                <Lock size={15} />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 sm:pl-12 pr-16 sm:pr-20 py-2 sm:py-2.5 bg-white/60 border border-white/80 rounded-full focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple/40 focus:bg-white text-xs sm:text-sm transition-all placeholder:text-brand-purple/40"
                placeholder="password"
              />
              <span
                className="absolute right-3.5 sm:right-4 text-[10px] sm:text-[11px] font-semibold text-brand-purple/50 select-none"
                title="Hubungi admin untuk reset password"
              >
                I forgot
              </span>
            </div>

            {/* Captcha */}
            <div className="pt-0.5">
              <p className="text-[9px] sm:text-[10px] font-bold text-brand-purple/40 uppercase tracking-wider mb-1.5 ml-1">Security Verification</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  className="flex-1 min-w-0 px-4 py-2 sm:py-2.5 bg-white/60 border border-white/80 rounded-full focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple/40 focus:bg-white text-xs sm:text-sm transition-all tracking-widest placeholder:text-brand-purple/40"
                  placeholder="4 characters"
                />
                <div className="flex items-center space-x-1 bg-white/60 border border-white/80 rounded-full pl-3 pr-1.5 py-1 shrink-0">
                  <span className="font-mono text-sm sm:text-base font-bold tracking-widest text-brand-purple select-none italic">
                    {captchaText}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshCaptcha}
                    className="p-1.5 text-brand-purple/50 hover:text-brand-purple hover:bg-white rounded-full transition-colors"
                    title="Refresh Captcha"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end pt-1.5">
              <button
                type="submit"
                disabled={loading}
                className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-brand-purple hover:bg-brand-purple-light text-white flex items-center justify-center shadow-lg shadow-brand-purple/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                title="Log In"
              >
                {loading ? <Loader2 className="animate-spin" size={17} /> : <ArrowRight size={17} />}
              </button>
            </div>
          </form>

          <p className="text-center text-[11px] sm:text-xs font-bold text-brand-purple mt-4">Powered by Waruna Group</p>
        </div>
      </div>
    </div>
  );
}