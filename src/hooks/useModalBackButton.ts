import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;

    // Titipkan entri history LEWAT react-router (bukan window.history langsung),
    // supaya index internal yang dipakai BrowserRouter untuk melacak posisi
    // navigasi tidak desync — kalau desync, popstate berikutnya bisa salah
    // ditafsirkan react-router sebagai perubahan rute dan menyebabkan komponen
    // yang sedang mount (termasuk modal ini) ikut ter-remount / hilang sendiri.
    navigate('.', { state: { modalBackGuard: true } });
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Modal ditutup lewat UI (bukan tombol Kembali) — bersihkan entri
      // history yang tadi dititipkan supaya tidak nyangkut.
      if (pushedRef.current) {
        pushedRef.current = false;
        navigate(-1);
      }
    };
  }, [isOpen]);
}
