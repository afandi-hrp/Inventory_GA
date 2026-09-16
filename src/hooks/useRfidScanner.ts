import { useEffect, useRef } from 'react';

// Gun RFID (mode "Keystroke output") ngetik ID tag + Enter ke field yang lagi
// fokus, jauh lebih cepat dari ketikan manusia (<~50ms antar karakter). Hook
// ini nangkep pola itu lewat listener keydown global — HANYA aktif kalau
// `active` true (dipasang pas UI lagi eksplisit "menunggu scan"), jadi gak
// pernah ganggu ketikan normal user di form/field lain.
const SCAN_MAX_INTERVAL_MS = 50;
const SCAN_MIN_LENGTH = 3;

export function useRfidScanner(active: boolean, onScan: (tag: string) => void) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!active) return;

    bufferRef.current = '';
    lastKeyTimeRef.current = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = bufferRef.current.trim();
        bufferRef.current = '';
        if (tag.length >= SCAN_MIN_LENGTH) {
          onScanRef.current(tag);
        }
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        const now = Date.now();
        const elapsed = now - lastKeyTimeRef.current;
        lastKeyTimeRef.current = now;

        // Jeda kepanjangan berarti ini ketikan manusia, bukan scan - buang buffer lama
        if (elapsed > SCAN_MAX_INTERVAL_MS && bufferRef.current) {
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [active]);
}
