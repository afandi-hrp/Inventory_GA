import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../hooks/useSettings';
import { Mail, Lock, Loader2, RefreshCw, ArrowRight } from 'lucide-react';

const generateCaptcha = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const isVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov)$|video/i.test(url);

export default function Login() {
  const { settings, loading: settingsLoading } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[#FFF9E3] via-[#FFDAB9] to-[#FFB08E]">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-gray-600 font-medium animate-pulse">Preparing Login Page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-3 sm:p-6 bg-gradient-to-br from-[#FFF9E3] via-[#FFDAB9] to-[#FFB08E]">
      <div className="w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto bg-white/30 backdrop-blur-2xl border border-white/50 rounded-[2rem] shadow-2xl flex flex-col md:flex-row">
        {/* Left Panel: Form */}
        <div className="w-full md:w-[55%] p-6 sm:p-10 flex flex-col justify-center shrink-0">
          <div className="max-w-sm mx-auto w-full">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Log In</h1>
            <p className="text-gray-500 mt-1.5 text-sm sm:text-base">Log in to the {settings.login_title} Dashboard</p>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-3.5">
              {/* Email */}
              <div className="relative flex items-center">
                <div className="absolute left-1 z-10 w-11 h-11 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-16 pr-5 py-3 bg-orange-50/70 border border-orange-100 rounded-full focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 focus:bg-white text-sm transition-all"
                  placeholder="Email"
                />
              </div>

              {/* Password */}
              <div className="relative flex items-center">
                <div className="absolute left-1 z-10 w-11 h-11 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-16 pr-5 py-3 bg-orange-50/70 border border-orange-100 rounded-full focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 focus:bg-white text-sm transition-all"
                  placeholder="Password"
                />
              </div>

              {/* Captcha */}
              <div className="pt-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Security Verification</p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="flex-1 min-w-0 px-5 py-3 bg-orange-50/70 border border-orange-100 rounded-full focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 focus:bg-white text-sm transition-all tracking-widest"
                    placeholder="4 characters"
                  />
                  <div className="flex items-center space-x-1 bg-orange-50/70 border border-orange-100 rounded-full pl-4 pr-1.5 py-1.5 shrink-0">
                    <span className="font-mono text-lg font-bold tracking-widest text-gray-700 select-none italic">
                      {captchaText}
                    </span>
                    <button
                      type="button"
                      onClick={handleRefreshCaptcha}
                      className="p-2 text-gray-400 hover:text-orange-600 hover:bg-white rounded-full transition-colors"
                      title="Refresh Captcha"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer row: powered-by + submit */}
              <div className="flex items-center justify-between pt-3">
                <p className="text-xs text-gray-400">Powered By Waruna Group</p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-12 h-12 shrink-0 rounded-full bg-[#3D2C44] hover:bg-[#4a3654] text-white flex items-center justify-center shadow-lg shadow-[#3D2C44]/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  title="Log In"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel: Branding */}
        <div className="hidden md:block md:w-[45%] relative overflow-hidden">
          {settings.login_bg_url && isVideoUrl(settings.login_bg_url) ? (
            <video
              src={settings.login_bg_url}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: settings.login_bg_url
                  ? `url(${settings.login_bg_url})`
                  : undefined,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-[#3D2C44]/90 via-[#5b3f66]/85 to-[#FFB08E]/60" />
          {/* Dot pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />

          <div className="relative z-10 h-full flex flex-col items-start justify-center px-10 text-white">
            <h2 className="text-3xl font-extrabold tracking-tight leading-tight">
              {settings.login_title}
            </h2>
            <p className="text-white/70 mt-3 text-sm max-w-xs">
              {settings.login_footer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
