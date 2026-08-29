# Inventory GA — Asset & Inventory Management

Aplikasi manajemen inventaris internal ("Waruna Group" / ex-BeeSuite brand). React SPA + Supabase backend, dengan Express API kecil buat operasi yang butuh service-role key (admin user management, hapus item final-approved).

Baca file ini dulu sebelum mulai kerja di project ini — isinya struktur aplikasi, skema Supabase (setahu sesi terakhir), dan riwayat perubahan besar yang udah dikerjakan supaya gak perlu re-explore dari nol.

## Tech Stack

- **Frontend**: React 18 + TypeScript, Vite build, React Router (`react-router-dom`)
- **Styling**: Tailwind CSS v4 (config lewat `@theme` di `src/index.css`, bukan `tailwind.config.js`)
- **Backend**: Supabase (Postgres + Auth + Storage + RLS) — client di `src/lib/supabase.ts`
- **API kecil**: `api/index.ts` (Express, dijalankan terpisah dari Vite dev server) — cuma dipakai buat operasi yang butuh `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS): create/delete user, delete item setelah disposal final-approved
- **Library lain**: `lucide-react` (ikon), `xlsx` + `xlsx-js-style` (import/export Excel), `jspdf` + `jspdf-autotable` (export PDF), `recharts` (chart dashboard), `motion` (animasi sidebar), `clsx` + `tailwind-merge` (helper `cn()` yang diulang di hampir semua file)

## Struktur Folder

```
src/
  components/
    Auth/Login.tsx
    Dashboard/
      Layout.tsx        # shell aplikasi: sidebar, sapaan pojok kanan atas, main content wrapper
      Home.tsx           # halaman /dashboard
    Inventory/
      MasterBarang.tsx        # /barang — halaman paling kompleks & paling sering diubah
      MasterKategori.tsx      # /kategori
      MasterLokasi.tsx        # /lokasi
      MasterKepemilikan.tsx   # /kepemilikan
      TakeItemHistory.tsx     # /take-item-history
      LogItemChange.tsx       # /log-item-change
      StockOutHistory.tsx     # /stock-out-history
      Approval.tsx             # /approval — hub buka DisposalApprovalModal & SPKApprovalModal
      DisposalApprovalModal.tsx  # modal alur approve/reject pemusnahan (dipanggil dari Approval.tsx)
      SPKApprovalModal.tsx       # modal alur approve/reject SPK (dipanggil dari Approval.tsx)
      OfficeItemsRequester.tsx   # /office-items — halaman khusus role requester ("Barang Reusable")
    Admin/ManageUsers.tsx    # /manage-users
    UI/SignedImage.tsx, Toast.tsx
  hooks/
    useAuth.ts            # profile & session dari Supabase Auth
    useSettings.ts        # app_settings (login_title, dll)
    useModalBackButton.ts # DIMATIKAN di MasterBarang (lihat komentar di file), dipakai normal di file lain
    useIdleTimeout.ts     # auto logout 30 menit idle
  lib/
    supabase.ts           # client Supabase (anon key, dipakai browser)
    signedStorage.ts       # getSignedUrl/getSignedUrls buat bucket private (item-photos, item-documents)
    utils.ts               # generateDailyDocNumber, dll
  types.ts                 # semua interface TS (Profile, Item, DisposalRequest, SPKRequest, dll) — SUMBER KEBENARAN kolom, cek ini duluan sebelum nebak nama kolom
api/index.ts                # Express API terpisah, butuh SUPABASE_SERVICE_ROLE_KEY
supabase_setup.sql, supabase_rbac_setup.sql   # snapshot historis, LIHAT PERINGATAN di bawah
```

## Role & Permission

Role: `admin`, `auditor`, `spv`, `direktur`, `requester` (+ legacy `user`, gak dipakai aktif). Didefinisikan di `Profile.role` (`src/types.ts`).

Ringkasan hak akses per role di Master Barang (setelah perubahan sesi ini):
- **admin**: full CRUD, upload foto/dokumen, semua aksi (Ambil/Keluarkan Barang, Import/Export, Bulk Edit)
- **spv**: **sekarang setara admin** di Master Barang (sebelumnya view-only) — full edit, upload foto/dokumen, semua aksi
- **auditor**: cuma bisa edit field `note_audit` + `tanggal_audit` (field lain di form ke-disable), gak bisa upload foto/dokumen, gak bisa tambah barang baru
- **direktur**: gak akses Master Barang sama sekali (cuma approval tahap akhir pemusnahan)
- **requester**: gak akses Master Barang; halaman sendiri `/office-items` ("Barang Reusable") — cuma bisa lihat barang `sifat_barang = 'REUSABLE'` (RLS-enforced) dan ajukan SPK pengambilan barang

Alur approval (2 workflow terpisah, dikelola di `Approval.tsx` + modal masing-masing):
- **Disposal (pemusnahan)**: `PENDING_AUDITOR` → `PENDING_SPV` → `PENDING_DIREKTUR` → `APPROVED`/`REJECTED`
- **SPK (pengambilan barang reusable oleh requester)**: `PENDING_ADMIN` → `PENDING_AUDITOR` → `PENDING_SPV` → `APPROVED`/`REJECTED`

Mapping role→stage yang menentukan badge/notifikasi count **diduplikasi** di 3 tempat (bukan disentralisasi): `Layout.tsx` (badge sidebar), `Home.tsx` (kartu dashboard), `Approval.tsx` (badge di kartu). Kalau mapping-nya berubah, harus diupdate di ketiganya.

## Routing (`src/App.tsx`)

| Path | Komponen | Akses |
|---|---|---|
| `/dashboard` | `Home.tsx` | semua |
| `/barang` | `MasterBarang.tsx` | non-requester |
| `/approval` | `Approval.tsx` | non-requester |
| `/kategori`, `/lokasi`, `/kepemilikan` | Master* | non-requester |
| `/take-item-history`, `/log-item-change`, `/stock-out-history` | *History*/*Change* | non-requester |
| `/office-items` | `OfficeItemsRequester.tsx` | semua (tapi isinya khusus requester) |
| `/manage-users` | `ManageUsers.tsx` | semua (profil sendiri; kalau admin bisa kelola semua user) |

## Skema Supabase (setahu sesi terakhir)

⚠️ **PENTING**: `supabase_setup.sql` dan `supabase_rbac_setup.sql` di root repo adalah **snapshot historis, BUKAN sumber kebenaran skema live**. Ada catatan eksplisit di `supabase_setup.sql` baris atas yang bilang gitu (hasil audit keamanan 2026-08-14). Banyak tabel (`disposal_requests`, `spk_requests`, `item_flag_defs`, `item_audit_history`, `master_lokasi`, `master_kepemilikan`, dll) dan RLS policy live **gak tercatat** di file itu — semuanya dijalankan langsung lewat SQL Editor Supabase tanpa disinkron balik ke repo. **Sebelum asumsi struktur/RLS dari file itu, verifikasi dulu lewat query `pg_policies`/`information_schema` ke Supabase** (lihat pola verifikasi yang sudah dipakai di percakapan sebelumnya — minta user jalanin query, paste hasilnya, baru bikin perubahan berdasarkan itu).

Belum ada koneksi MCP Supabase yang authenticated di sesi manapun sejauh ini — semua verifikasi live dilakukan dengan **minta user paste hasil query SQL** dari Supabase SQL Editor, bukan lewat tool langsung.

### Tabel utama (kolom dari `src/types.ts` + observasi kode, bukan dump skema resmi)

- **profiles**: `id, full_name, role, is_active, avatar_url, created_at`
- **items**: `id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kategori_id, kepemilikan_id, sifat_barang ('PRIVATE'|'OFFICE'|'REUSABLE'), foto_urls[], deskripsi, kelengkapan_garansi/sertifikat/manual (bool), dokumen_garansi_url/sertifikat_url/manual_url, kondisi_barang ('BAIK'|'CUKUP BAIK'|'RUSAK'), note_audit ('ADA'|'TIDAK ADA'), tanggal_audit, flags[], created_at, updated_at`
- **categories**: `id, nama_kategori, deskripsi, parent_id, created_at, updated_at` (bisa nested lewat `parent_id`)
- **master_kepemilikan**: `id, nama_pemilik, keterangan, created_at`
- **master_lokasi**: `kode_lokasi, nama_lokasi, parent_kode_lokasi, created_at`
- **item_flag_defs**: `id, nama_flag, color, icon, created_at` — katalog flag yang bisa ditempel ke item (dipilih di form edit barang)
- **item_audit_logs**: `id, item_id, action ('CREATE'|'UPDATE'|'DELETE'|'DIKEMBALIKAN KE STOCK'), old_values (jsonb), new_values (jsonb), changed_by, created_at` — diisi otomatis lewat trigger (`on_item_changed`) tiap kali tabel `items` berubah. Ditampilkan sebagai "Riwayat Perubahan" di Master Barang & sebagai halaman penuh di `/log-item-change`
- **item_audit_history**: `id, item_id, note_audit, tanggal_audit, audited_by, created_at` — riwayat hasil audit (beda dari `item_audit_logs`!). Diisi manual saat auditor simpan hasil audit. Ditampilkan lewat tombol "Riwayat Audit" di Detail Barang (fitur baru sesi ini)
- **take_item_history**: `id, item_id, kode_barang, nama_barang, jumlah, kode_lokasi, nama_lokasi, user_id, user_name, alasan, created_at`
- **stock_keluar_history**: `id, original_item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, nama_lokasi, lokasi_keluar, foto_urls[], deskripsi, created_at, updated_at, keterangan_alasan, user_name, tanggal_keluar`
- **disposal_requests**: `id, nomor_pengajuan, diajukan_oleh, user_id, jumlah, alasan, metode_pemusnahan, status ('PENDING_AUDITOR'|'PENDING_SPV'|'PENDING_DIREKTUR'|'APPROVED'|'REJECTED'), tanggal_pengajuan, diketahui_auditor_oleh, tanggal_diketahui_auditor, approved_by_l1/l2, tanggal_approved_l1/l2, keterangan, created_at, updated_at`
- **disposal_request_items**: `id, request_id, item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kondisi_barang, foto_urls[], status_item ('PENDING'|'APPROVED'|'REJECTED'), alasan_rejection, created_at`
- **spk_requests**: `id, nomor_spk, diajukan_oleh, user_id, jumlah, keterangan, lokasi_tujuan, status ('PENDING_ADMIN'|'PENDING_AUDITOR'|'PENDING_SPV'|'APPROVED'|'REJECTED'), tanggal_pengajuan, diketahui_admin_oleh, tanggal_diketahui_admin, diketahui_auditor_oleh, tanggal_diketahui_auditor, approved_by_l1/l2, tanggal_approved_l1/l2, created_at, updated_at`
- **spk_request_items**: `id, request_id, item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kepemilikan_id, nama_kategori, nama_lokasi, foto_urls[], status_item, alasan_rejection, created_at`
- **app_settings**: `id, login_title, login_footer, login_bg_url, updated_at`

### RLS yang diketahui (diverifikasi live lewat query `pg_policies` di sesi sebelumnya)

Tabel `items` — beberapa policy tumpuk (permissive/OR'd):
- `Admins can manage items` (ALL, authenticated)
- `Admins and Direktur can modify items` (ALL)
- `Auditors can update items` (UPDATE)
- `SPV can modify items` (ALL) — **ditambahkan sesi ini**, additive, gak nyentuh policy lain
- `Non-requester can view all items` (SELECT)
- `Requester can view reusable items only` (SELECT, `sifat_barang = 'REUSABLE'`) — **diganti sesi ini dari `sifat_barang = 'OFFICE'`**

Storage `storage.objects`:
- bucket `item-photos` (private): Admin Upload/Update/Delete (role='admin') + `SPV Upload/Update/Delete Photos` (**ditambahkan sesi ini**)
- bucket `item-documents` (private): serupa + `SPV Upload/Update Documents` (**ditambahkan sesi ini**)

Kalau butuh nambah akses role baru ke tabel/bucket manapun, **ikuti pola additive** (bikin policy BARU khusus role itu, jangan drop/replace policy admin yang udah ada) — itu pola yang dipakai & terbukti aman di sesi ini.

## Design System

Palet brand didefinisikan di `src/index.css` sebagai Tailwind v4 theme token:
```css
--color-brand-cream: #FFF5C5;
--color-brand-coral: #F58C77;
--color-brand-purple: #5A305A;       /* warna utama tombol/header/aksen */
--color-brand-purple-light: #73507B;
```
Pakai langsung sebagai class Tailwind: `bg-brand-purple`, `text-brand-purple`, `border-brand-purple/20`, dst.

Class komponen bersama (`@layer components` di `index.css`):
- `.btn-confirm` — solid `brand-purple` + teks putih, dipakai buat tombol konfirmasi di **semua** modal aplikasi
- `.btn-cancel` — abu-abu netral + teks `brand-purple`, dipakai buat tombol batal di semua modal

Pola halaman standar (dipakai konsisten di semua halaman non-modal setelah dirapikan sesi ini):
```
<div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
  <div>
    <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block">Judul</h2>
    <p className="text-brand-purple">Subjudul</p>
  </div>
  {/* kartu filter: bg-white/60 backdrop-blur-xl p-5 rounded-3xl shadow-lg border border-white/50 */}
  {/* kartu tabel: bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg overflow-hidden (TANPA border — lihat catatan di bawah) */}
</div>
```
Header tabel sekarang solid `bg-brand-purple` + teks putih (semua tabel di app). **Kartu tabel sengaja TANPA `border-white/50`** — border putih itu kelihatan jelek/nyembul di sudut rounded begitu header-nya solid gelap (bug yang udah diperbaiki), jadi jangan ditambahin lagi ke kartu tabel manapun. Kartu filter/lainnya tetap pakai `border-white/50` seperti biasa. Hover baris tabel diseragamkan jadi `hover:bg-brand-purple/5`. Angka pagination aktif jadi `bg-brand-purple text-white`.

Layout global (`Layout.tsx`):
- Sidebar dikelompokkan: item berdiri sendiri (Dashboard, Item Master, Approval, Manage Users) + 2 grup collapsible ("Master Data": Kategori/Lokasi/Kepemilikan, "Riwayat": Take Item History/Log Item Change/Stock Out History). Grup auto-expand kalau halaman aktif ada di dalamnya.
- Role user ditampilkan di footer sidebar (di bawah nama), **bukan** lagi di header tiap halaman.
- Sapaan ("Selamat Pagi/Siang/Sore/Malam, [Nama]" + ikon + tanggal) tampil di pojok kanan atas **semua halaman**, dirender sekali di `Layout.tsx` — jangan diduplikasi lagi di komponen halaman manapun.
- **Skala tampilan responsif**: `html { font-size: 90% }` default (laptop 14"), naik ke `112.5%` di viewport ≥1800px (monitor 24"+), plus ikon sidebar `transform: scale(1.2)` di breakpoint yang sama (karena ikon lucide pakai `size` prop dalam px, gak ikut skala rem otomatis).

### Pola teknis yang perlu diketahui

- **Dropdown yang ada di dalam container `overflow-x-auto`** (mis. baris filter Master Barang yang dipaksa 1-baris) **HARUS** dirender lewat `createPortal(..., document.body)` dengan posisi dihitung manual dari `getBoundingClientRect()` — bukan `absolute` biasa, karena `overflow-x-auto` di parent otomatis meng-clip overflow-y juga, bikin dropdown ke-potong/gak keliatan. Sudah ada 2 contoh kerja: menu "Aksi" per baris tabel, dan dropdown filter gabungan Kategori/Lokasi/Kepemilikan + Excel & PDF di Master Barang.
- **`useModalBackButton`** dimatikan sengaja di `MasterBarang.tsx` (dikomentari, ada catatan kenapa) karena 3 pendekatan beda-beda bikin modal Edit Barang hilang sendiri — jangan diaktifkan lagi tanpa investigasi ulang akar masalahnya.

## Riwayat Perubahan Sesi Ini (ringkas, kronologis)

1. **Role SPV** diberi akses penuh (setara admin) di Master Barang — frontend + RLS `items`/storage tambahan (additive).
2. **Role Requester**: diganti dari lihat barang `OFFICE` → `REUSABLE` (RLS + semua label UI "Barang Office" → "Barang Reusable" di seluruh app).
3. **Master Barang — redesign panel filter** (banyak iterasi): dari filter Kategori/Lokasi/Kepemilikan terpisah (card besar) → dipadatkan jadi pill 1 baris → sempat dicoba dropdown terpisah per tombol (di-revert) → akhirnya **1 dropdown gabungan** (accordion 3 bagian) via portal. Filter "Semua Flag" dihapus total (state, query, UI). Tombol Excel & PDF + Tambah Barang dipindah ke dalam panel filter, dipin di luar area scroll biar gak ikut ke-scroll/kepotong di layar sempit.
4. **"Perlu Pemusnahan"**: dari toggle inline di tabel utama → jadi **modal tersendiri** (reuse tabel & pagination utama, dibungkus tampilan modal saat `isPemusnahanModalOpen`).
5. **Halaman `Approval.tsx` baru**: memindahkan tombol "Persetujuan Pemusnahan"/"Persetujuan SPK" dari Master Barang ke halaman `/approval` sendiri, dengan menu sidebar baru "Approval" + badge count.
6. **Sidebar dikelompokkan** jadi 2 grup collapsible (Master Data, Riwayat).
7. **Konsistensi visual besar-besaran** di semua halaman: judul + garis bawah oranye seragam, jarak antar section diseragamkan (`space-y-4`), header tabel jadi solid `brand-purple` + teks putih, hover baris tabel diseragamkan, pagination aktif jadi `brand-purple`, tombol konfirmasi/batal modal diseragamkan (`.btn-confirm`/`.btn-cancel`) — **kecuali** tombol semantik approve/reject (hijau/merah/kuning) di modal approval, itu sengaja dibiarkan gak diseragamkan karena warnanya penting sebagai penanda aksi.
8. **Sapaan pojok kanan atas** (nama + waktu + tanggal) ditambahkan global di `Layout.tsx`, sapaan lama yang dobel di Dashboard dihapus.
9. **Dashboard**: kartu statistik dirombak jadi seragam (sebelumnya campuran kartu besar + mini card numpuk gak rapi), section "Menunggu Persetujuan" dibuat selalu tampil (ada fallback "belum ada" kalau kosong, sebelumnya disembunyikan total).
10. **Skala tampilan responsif** ditambahkan (90% default / 112.5% di layar ≥1800px) + skala ikon sidebar, buat nyamain proporsi antara laptop 14" dan monitor 24"+.
11. **Fitur baru**: tombol "Riwayat Audit" di modal Detail Barang (Master Barang), buka riwayat `item_audit_history` yang sebelumnya cuma keliatan di form edit auditor.
12. **Bug fix** (pre-existing, ketemu pas bug-sweep): `metode_pemusnahan` gak ke-reset setelah submit pengajuan pemusnahan.
13. Halaman Manage Users & Profile disamakan wrapper-nya (`space-y-4`, tanpa `max-w`/`p-6` sendiri) biar konsisten sama halaman lain.

**Status akhir**: semua perubahan sudah lolos `npx tsc --noEmit` dan `npx vite build` tanpa error di setiap langkah. Belum ada testing end-to-end otomatis (gak ada test suite di project ini) — verifikasi selama ini murni lewat review kode + build check + user screenshot manual.

## Cara Kerja yang Terbukti Efektif di Sesi Ini (buat sesi lanjutan)

- User (panggilan "lae") sering minta **konsep/opini dulu sebelum eksekusi** ("apakah bisa... bagaimana menurut lae?") — jangan langsung ubah kode untuk pertanyaan eksploratif, kasih rekomendasi singkat + trade-off dulu, tunggu konfirmasi.
- Setelah user bilang "silahkan eksekusi"/"oke lae, lakukan" — baru jalan, dan **selalu tutup dengan `npx tsc --noEmit -p tsconfig.json` + `npx vite build`** sebelum lapor selesai (project ini gak ada CI, jadi ini gate kualitas satu-satunya).
- Perubahan SQL/RLS ke Supabase: **paste SQL lengkap di chat** (bukan cuma rujukan file), user jalanin manual di SQL Editor (gak ada koneksi Supabase MCP yang authenticated), minta user paste balik hasil verifikasi query.
- User cukup sering kasih feedback visual lewat screenshot + minta revisi kecil (warna, margin, posisi) — biasanya butuh 1-3 putaran iterasi sebelum pas, itu normal buat project ini.
