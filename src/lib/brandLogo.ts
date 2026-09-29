import logoPurpleSvg from '../assets/logo-purple.svg?raw';

// Logo ungu ditanam langsung di bundle JS (data URI), bukan <img src="/logo-purple.svg">.
// LockScreen baru muncul setelah 30 menit idle — sering tepat saat laptop baru
// bangun dari sleep dan jaringan belum tersambung, jadi request file terpisah
// gagal dan browser gak pernah retry (ikon gambar rusak). Versi file di public/
// tetap ada untuk pemakaian lain.
export const LOGO_PURPLE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoPurpleSvg)}`;
