// Nada beep buat feedback scan RFID — disintesis langsung lewat Web Audio API
// (osilator), bukan file audio, jadi gak perlu aset .mp3/.wav sama sekali.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function tone(freq: number, duration: number, delay = 0) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const startAt = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0.001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export type ScanBeepResult = 'match' | 'mismatch' | 'unknown';

export function playScanBeep(result: ScanBeepResult) {
  try {
    if (result === 'match') {
      tone(880, 0.14); // 1 beep tinggi = cocok
    } else if (result === 'mismatch') {
      tone(220, 0.22); // 1 beep rendah panjang = ketemu tapi beda barang
    } else {
      tone(440, 0.1);
      tone(440, 0.1, 0.16); // 2 beep pendek = tag gak dikenal
    }
  } catch {
    // Web Audio API gak tersedia/diblokir - abaikan, feedback visual tetap jalan
  }
}
