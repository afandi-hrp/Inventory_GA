import { useEffect, useRef } from 'react';

// Dipusatkan (bukan satu push per modal) supaya seberapa pun banyak modal yang
// dipakai di satu komponen, cuma ADA SATU entri history yang dititipkan ke
// browser selama minimal satu modal terbuka. Modal-modal ditumpuk di sini
// (LIFO, sesuai urutan dibuka) supaya tombol Kembali menutup modal PALING ATAS
// dulu, baru modal di bawahnya kalau ditekan lagi.
let modalStack: number[] = [];
let nextId = 1;
let listenerAttached = false;
const closers = new Map<number, () => void>();

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('popstate', () => {
    const topId = modalStack.pop();
    if (topId === undefined) return;
    const close = closers.get(topId);
    closers.delete(topId);
    close?.();
  });
}

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const idRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    ensureListener();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const id = nextId++;
    idRef.current = id;
    closers.set(id, () => onCloseRef.current());

    const wasEmpty = modalStack.length === 0;
    modalStack.push(id);
    if (wasEmpty) {
      window.history.pushState({ modalGuard: true }, '');
    }

    return () => {
      idRef.current = null;
      closers.delete(id);
      const idx = modalStack.indexOf(id);
      if (idx === -1) return;
      modalStack.splice(idx, 1);
      // Modal ini yang tadi memicu titip entri history (dia yang pertama
      // dibuka, stack sekarang kosong lagi) — bersihkan entri itu supaya
      // tidak nyangkut kalau modal ditutup lewat UI (bukan tombol Kembali).
      if (modalStack.length === 0) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
