import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Widget Cloudflare Turnstile (mode Managed). Token-nya dikirim ke
// supabase.auth.signInWithPassword({ options: { captchaToken } }) dan diverifikasi
// oleh Supabase Auth (GOTRUE_SECURITY_CAPTCHA_*) — bukan di browser.
// Site key bersifat publik; secret key hanya ada di env server Supabase.

export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

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

const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(({ onToken }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          // 'compact' (150px) supaya muat di kartu login yang sempit.
          size: 'compact',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch((err) => console.error('Turnstile load error:', err));

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

  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />;
});

TurnstileWidget.displayName = 'TurnstileWidget';
export default TurnstileWidget;
