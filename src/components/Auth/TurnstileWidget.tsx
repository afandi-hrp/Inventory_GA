import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

// Widget Cloudflare Turnstile (mode Managed, appearance 'interaction-only'). Token-nya
// dikirim ke supabase.auth.signInWithPassword({ options: { captchaToken } }) dan
// diverifikasi oleh Supabase Auth (GOTRUE_SECURITY_CAPTCHA_*) — bukan di browser.
// Site key bersifat publik; secret key hanya ada di env server Supabase.
//
// Tampilan: iframe Cloudflare disembunyikan Cloudflare sendiri kecuali butuh centang
// manual. Yang terlihat sehari-hari hanya pill status buatan kita (memverifikasi →
// terverifikasi). Kalau tantangan manual muncul, widget ukuran 'normal' (persegi
// panjang 300x65) diperlihatkan, diskalakan sedikit supaya muat di kartu sempit.

export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Widget 'normal' lebarnya tetap 300px, sedangkan isi kartu login cuma ~252px.
const WIDGET_W = 300;
const WIDGET_H = 65;
const WIDGET_SCALE = 0.82;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile tidak tersedia')));
    script.onerror = () => {
      scriptPromise = null; // izinkan coba lagi kalau gagal dimuat
      reject(new Error('Gagal memuat Turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Minta token baru — token Turnstile sekali pakai, wajib dipanggil setelah tiap percobaan login. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Dipanggil dengan token saat lolos, atau null saat token kedaluwarsa/error. */
  onToken: (token: string | null) => void;
}

type Status = 'verifying' | 'interactive' | 'verified' | 'error';

const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(({ onToken }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [status, setStatus] = useState<Status>('verifying');

  const reset = useCallback(() => {
    onTokenRef.current(null);
    setStatus('verifying');
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    let cancelled = false;

    const fail = () => {
      onTokenRef.current(null);
      setStatus('error');
    };

    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          size: 'normal',
          // Widget disembunyikan Cloudflare kecuali butuh interaksi pengguna.
          appearance: 'interaction-only',
          callback: (token: string) => {
            onTokenRef.current(token);
            setStatus('verified');
          },
          'before-interactive-callback': () => setStatus('interactive'),
          'after-interactive-callback': () => setStatus('verifying'),
          'expired-callback': () => {
            onTokenRef.current(null);
            setStatus('verifying');
          },
          'timeout-callback': fail,
          'error-callback': fail,
          'unsupported-callback': fail,
        });
      })
      .catch((err) => {
        console.error('Turnstile load error:', err);
        if (!cancelled) fail();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) {
    return <p className="text-[10px] text-red-600 text-center">Captcha belum dikonfigurasi (VITE_TURNSTILE_SITE_KEY kosong).</p>;
  }

  const interactive = status === 'interactive';

  return (
    <div className="space-y-1.5">
      {/* Pill status — mengikuti gaya input (putih transparan, rounded-full). */}
      {!interactive && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 sm:py-2.5 bg-white/60 border border-white/80 rounded-full text-xs sm:text-sm text-brand-purple"
          role="status"
          aria-live="polite"
        >
          {status === 'verified' && (
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} className="text-green-600 shrink-0" /> Terverifikasi
            </span>
          )}
          {status === 'verifying' && (
            <span className="flex items-center gap-2 text-brand-purple/70">
              <Loader2 size={16} className="animate-spin shrink-0" /> Memverifikasi…
            </span>
          )}
          {status === 'error' && (
            <>
              <span className="flex items-center gap-2 text-red-600 font-medium">
                <AlertCircle size={16} className="shrink-0" /> Verifikasi gagal
              </span>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-purple/70 hover:text-brand-purple transition-colors"
              >
                <RefreshCw size={12} /> Coba lagi
              </button>
            </>
          )}
        </div>
      )}

      {/* Tempat render widget. Tinggi 0 selama disembunyikan Cloudflare (BUKAN display:none),
          dibuka + diskalakan hanya saat butuh centang manual. */}
      <div
        className="mx-auto overflow-hidden rounded-xl transition-[height] duration-200"
        style={{
          width: WIDGET_W * WIDGET_SCALE,
          height: interactive ? WIDGET_H * WIDGET_SCALE : 0,
        }}
      >
        <div ref={containerRef} style={{ transform: `scale(${WIDGET_SCALE})`, transformOrigin: 'top left', width: WIDGET_W }} />
      </div>

      {/* Atribusi Cloudflare (logo widget tidak terlihat di mode interaction-only). */}
      <p className="text-center text-[9px] text-brand-purple/40">
        Dilindungi Cloudflare Turnstile ·{' '}
        <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-purple/70">Privacy</a>
        {' · '}
        <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-purple/70">Terms</a>
      </p>
    </div>
  );
});

TurnstileWidget.displayName = 'TurnstileWidget';
export default TurnstileWidget;
