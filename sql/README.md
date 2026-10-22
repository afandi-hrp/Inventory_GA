# sql/ — SQL yang menunggu dijalankan

Folder ini berisi SQL **baru** (tabel, kolom, fungsi, trigger, RLS) yang belum dijalankan di Supabase.

Alur:
1. Claude menaruh file `YYYYMMDD_<topik>.sql` di sini (lengkap & aman dijalankan ulang / idempotent).
2. User menjalankan isinya di Supabase SQL Editor, lalu konfirmasi ke Claude.
3. Claude memverifikasi (minta hasil query cek bila perlu), mencatat perubahannya di `CLAUDE.md`, lalu **menghapus** file SQL tersebut dari folder ini.

Kalau folder ini hanya berisi README, berarti tidak ada SQL yang menunggu.

SQL lama/snapshot historis ada di `sql/arsip/` (di-gitignore, hanya tersimpan lokal; riwayat lamanya masih ada di git).
