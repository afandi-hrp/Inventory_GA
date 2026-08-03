import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../hooks/useSettings';
import { LogIn, Mail, Lock, Loader2, RefreshCw } from 'lucide-react';

const generateCaptcha = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function Login() {
  const { settings, loading: settingsLoading } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

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
      setError('Captcha tidak cocok. Silakan coba lagi.');
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
      setError('Wrong username or Password');
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
          <p className="text-gray-600 font-medium animate-pulse">Menyiapkan Halaman Login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center p-8 bg-gradient-to-br from-[#FFF9E3] via-[#FFDAB9] to-[#FFB08E]">
      <div className="w-full max-w-md bg-white/40 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/50 relative overflow-hidden">
        {/* Glassmorphism shine effect */}
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
        
        <div className="flex flex-col items-center mb-8 relative z-10">
            <div className="w-16 h-16 bg-blue-600/90 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg border border-blue-400/30">
              <LogIn size={32} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome Back</h2>
            <p className="text-gray-600 mt-1">Please enter your details</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 backdrop-blur-md border border-red-500/20 text-red-700 text-sm rounded-xl font-medium text-center animate-in fade-in slide-in-from-top-2 duration-300 relative z-10">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white/60 border border-white/40 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white text-sm transition-all shadow-sm"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
                  <Lock size={18} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 bg-white/60 border border-white/40 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white text-sm transition-all shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Captcha Section */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Security Captcha</label>
              <div className="flex space-x-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="block w-full px-4 py-2.5 bg-white/60 border border-white/40 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-white text-sm transition-all shadow-sm tracking-widest"
                    placeholder="Enter Captcha"
                    maxLength={4}
                  />
                </div>
                <div className="flex items-center space-x-2 bg-white/60 border border-white/40 rounded-xl px-3 py-1 shadow-sm">
                  <div 
                    className="font-mono text-xl font-bold tracking-widest text-gray-800 select-none relative"
                    style={{ 
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 20 Q 25 0 50 20 T 100 20\' stroke=\'rgba(0,0,0,0.1)\' fill=\'none\' stroke-width=\'2\'/%3E%3Cpath d=\'M0 10 Q 25 30 50 10 T 100 10\' stroke=\'rgba(0,0,0,0.1)\' fill=\'none\' stroke-width=\'2\'/%3E%3C/svg%3E")',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      padding: '0 8px'
                    }}
                  >
                    {captchaText}
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshCaptcha}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Refresh Captcha"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded bg-white/50"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm font-medium text-gray-700">
                  Remember me
                </label>
              </div>
              <a href="#" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-500/30 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2" size={18} />
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-gray-600 text-sm font-medium">
          <p>{settings.login_footer}</p>
        </div>
    </div>
  );
}
