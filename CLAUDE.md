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
    Auth/
      Login.tsx
      LoginScene.tsx      # animasi SVG "Gudang Hidup" di halaman login (CSS keyframes `ls-*` di index.css)
      LockScreen.tsx      # layar kunci (idle) — logo pakai src/lib/brandLogo.ts
      TurnstileWidget.tsx # widget Cloudflare Turnstile (Managed, appearance interaction-only: pill status buatan sendiri, widget persegi panjang 300x65 diskala 0.82 hanya saat butuh centang manual) dipakai Login & LockScreen; site key dari VITE_TURNSTILE_SITE_KEY
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
      Approval.tsx             # /approval — hub kartu ke halaman approval pemusnahan & SPK
      DisposalApprovalPage.tsx   # /approval/pemusnahan — alur approve/reject pemusnahan (dulu DisposalApprovalModal)
      SPKApprovalPage.tsx        # /approval/spk — alur approve/reject SPK (dulu SPKApprovalModal)
      ApprovalProgress.tsx       # UI bersama halaman approval: progress bar, stepper, banner penolakan
      GudangBerkasPage.tsx       # /gudang-berkas — Form Akses Gudang Berkas + logbook verifikasi + PDF
      OfficeItemsRequester.tsx   # /office-items — halaman khusus role requester ("Barang Reusable")
    Admin/ManageUsers.tsx    # /manage-users
    UI/SignedImage.tsx, Toast.tsx
  hooks/
    useAuth.ts            # profile & session dari Supabase Auth
    useSettings.ts        # app_settings (login_title, dll)
    useModalBackButton.ts # DIMATIKAN di MasterBarang (lihat komentar di file), dipakai normal di file lain
    useIdleTimeout.ts     # auto logout 30 menit idle
    useRfidScanner.ts     # tangkap input gun RFID (mode keystroke) lewat keydown global, hanya saat `active`
  lib/
    supabase.ts           # client Supabase (anon key, dipakai browser)
    signedStorage.ts       # getSignedUrl/getSignedUrls buat bucket private (item-photos, item-documents)
    utils.ts               # generateDailyDocNumber, dll
    roles.ts               # label tampilan role (kode mentah seperti "gudang_berkas" jangan tampil di UI)
    beep.ts                # nada feedback scan RFID via Web Audio API (tanpa file audio)
    nativeDownload.ts      # jembatan download ke shell Android RFID (window.AndroidFileSaver), fallback <a download>
    imageCompress.ts, pdfLogo.ts, brandLogo.ts   # kompres foto upload, logo kop PDF, logo ungu Login/LockScreen
    pdfLayout.ts          # addPdfRow(): baris "Label : isi" PDF Surat Jalan SPK, isi panjang dipecah & Y bergeser (gak saling timpa); addApprovalStamp(): stamp biru "APPROVED" + tanggal/jam WIB di atas nama penandatangan (diisi dari kolom tanggal_* tiap tahap, kosong kalau belum)
  types.ts                 # semua interface TS (Profile, Item, DisposalRequest, SPKRequest, dll) — SUMBER KEBENARAN kolom, cek ini duluan sebelum nebak nama kolom
api/index.ts                # Express API terpisah, butuh SUPABASE_SERVICE_ROLE_KEY
scripts/check-claude-md.mjs # cek semua tabel/kolom/fungsi/bucket/endpoint/route/file sudah tercatat di file ini (Stop hook)
sql/arsip/supabase_setup.sql, sql/arsip/supabase_rbac_setup.sql   # snapshot historis, LIHAT PERINGATAN di bawah
sql/arsip/supabase_approval_finalize.sql, sql/arsip/supabase_spk_qty.sql, sql/arsip/supabase_spk_delete.sql, sql/arsip/supabase_gudang_berkas_setup.sql  # migrasi modul (dijalankan manual di SQL Editor)
```

## Role & Permission

Role: `admin`, `auditor`, `spv`, `direktur`, `requester`, `gudang_berkas` (staf yang mengajukan akses Gudang Berkas — cuma bisa buka `/gudang-berkas`) (+ legacy `user`, gak dipakai aktif). Label tampilan role ada di `src/lib/roles.ts`. Didefinisikan di `Profile.role` (`src/types.ts`).

Ringkasan hak akses per role di Master Barang (setelah perubahan sesi ini):
- **admin**: full CRUD, upload foto/dokumen, semua aksi (Ambil/Keluarkan Barang, Import/Export, Bulk Edit)
- **spv**: **sekarang setara admin** di Master Barang (sebelumnya view-only) — full edit, upload foto/dokumen, semua aksi
- **auditor**: cuma bisa edit field `note_audit` + `tanggal_audit` (field lain di form ke-disable), gak bisa upload foto/dokumen, gak bisa tambah barang baru
- **direktur**: gak akses Master Barang sama sekali (cuma approval tahap akhir pemusnahan & SPK)
- **requester**: gak akses Master Barang; halaman sendiri `/office-items` ("Barang Reusable") — cuma bisa lihat barang `sifat_barang = 'REUSABLE'` (RLS-enforced) dan ajukan SPK pengambilan barang

Alur approval (2 workflow terpisah, dikelola di `Approval.tsx` + modal masing-masing):
- **Disposal (pemusnahan)**: `PENDING_AUDITOR` → `PENDING_SPV` → `PENDING_DIREKTUR` → `APPROVED`/`REJECTED`
- **SPK (pengambilan barang reusable oleh requester)**: `PENDING_ADMIN` → `PENDING_AUDITOR` → `PENDING_SPV` → `PENDING_DIREKTUR` → `APPROVED`/`REJECTED` (tahap Direktur ditambah 22 Okt 2026; SPV bukan final lagi, isi `approved_by_l1`; Direktur final, isi `approved_by_l2`)

Mapping role→stage yang menentukan badge/notifikasi count **diduplikasi** di 3 tempat (bukan disentralisasi): `Layout.tsx` (badge sidebar), `Home.tsx` (kartu dashboard), `Approval.tsx` (badge di kartu). Kalau mapping-nya berubah, harus diupdate di ketiganya.

## Routing (`src/App.tsx`)

| Path | Komponen | Akses |
|---|---|---|
| `/dashboard` | `Home.tsx` | semua |
| `/barang` | `MasterBarang.tsx` | non-requester |
| `/approval` | `Approval.tsx` | non-requester |
| `/approval/pemusnahan` | `DisposalApprovalPage.tsx` | non-requester |
| `/approval/spk` | `SPKApprovalPage.tsx` | non-requester |
| `/gudang-berkas` | `GudangBerkasPage.tsx` | role `gudang_berkas` (halaman default-nya) + admin/SPV (kelola) + direktur (lihat saja) |
| `/kategori`, `/lokasi`, `/kepemilikan` | Master* | non-requester |
| `/take-item-history`, `/log-item-change`, `/stock-out-history` | *History*/*Change* | non-requester |
| `/office-items` | `OfficeItemsRequester.tsx` | semua (tapi isinya khusus requester) |
| `/manage-users` | `ManageUsers.tsx` | semua (profil sendiri; kalau admin bisa kelola semua user) |

## Skema Supabase (setahu sesi terakhir)

⚠️ **PENTING**: `sql/arsip/supabase_setup.sql` dan `sql/arsip/supabase_rbac_setup.sql` (dipindah ke `sql/arsip/` pada 22 Okt 2026; folder itu **di-gitignore**, jadi cuma tersimpan lokal — riwayat lamanya masih ada di git history) adalah **snapshot historis, BUKAN sumber kebenaran skema live**. Ada catatan eksplisit di `sql/arsip/supabase_setup.sql` baris atas yang bilang gitu (hasil audit keamanan 2026-08-14). Banyak tabel (`disposal_requests`, `spk_requests`, `item_flag_defs`, `item_audit_history`, `master_lokasi`, `master_kepemilikan`, dll) dan RLS policy live **gak tercatat** di file itu — semuanya dijalankan langsung lewat SQL Editor Supabase tanpa disinkron balik ke repo. **Sebelum asumsi struktur/RLS dari file itu, verifikasi dulu lewat query `pg_policies`/`information_schema` ke Supabase** (lihat pola verifikasi yang sudah dipakai di percakapan sebelumnya — minta user jalanin query, paste hasilnya, baru bikin perubahan berdasarkan itu).

**Konektor read-only (sejak 22 Okt 2026)**: MCP server `supabase-ro` (di `stock GA/.mcp.json`, paket `@modelcontextprotocol/server-postgres@0.6.2`, tool `mcp__supabase-ro__query`) konek ke Postgres live lewat role `claude_ro` — cuma `SELECT` di schema `public` (22 tabel, ber-RLS diberi policy additive `claude_ro can read`), `default_transaction_read_only=on`, `statement_timeout=15s`, maks 3 koneksi; tulis terbukti ditolak. Connection string TIDAK ada di repo: dibaca dari env var user `SUPABASE_RO_DATABASE_URL` (format `postgresql://claude_ro.<POOLER_TENANT_ID>:<password>@172.16.9.5:5435/postgres` — port 5435 itu Supavisor, wajib `claude_ro.<tenant>`). Pakai ini untuk verifikasi skema/RLS/fungsi/data (`pg_policies`, `pg_get_functiondef`, dst) — tidak perlu lagi minta user paste hasil query. Tabel baru di masa depan: jalankan ulang bagian GRANT + policy `claude_ro can read` supaya terbaca. JANGAN pakai tool `mcp__beehive-prod-ro__*` untuk project ini (itu DB production BeeHive, proyek lain). Kalau server gagal connect: cek env var & restart VS Code.

### Tabel utama (kolom dari `src/types.ts` + observasi kode, bukan dump skema resmi)

- **profiles**: `id, full_name, role, is_active, avatar_url, created_at`
- **items**: `id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kategori_id, kepemilikan_id, sifat_barang ('PRIVATE'|'OFFICE'|'REUSABLE'), foto_urls[], deskripsi, kelengkapan_garansi, kelengkapan_sertifikat, kelengkapan_manual (bool), dokumen_garansi_url, dokumen_sertifikat_url, dokumen_manual_url, kondisi_barang ('BAIK'|'CUKUP BAIK'|'RUSAK'), note_audit ('ADA'|'TIDAK ADA'), tanggal_audit, flags[], rfid_tag, rfid_tag_2, created_at, updated_at`
  - `rfid_tag` / `rfid_tag_2`: maks. 2 tag RFID per barang (null = kosong), unik lintas KEDUA kolom semua barang (dicek di form). Dipakai fitur scan RFID & filter "Status Tag RFID" (Sudah/Belum Ada Tag) di Master Barang.
- **categories**: `id, nama_kategori, deskripsi, parent_id, created_at, updated_at` (bisa nested lewat `parent_id`)
- **master_kepemilikan**: `id, nama_pemilik, keterangan, created_at`
- **master_lokasi**: `kode_lokasi, nama_lokasi, parent_kode_lokasi, created_at`
- **item_flag_defs**: `id, nama_flag, color, icon, created_at` — katalog flag yang bisa ditempel ke item (dipilih di form edit barang)
- **item_audit_logs**: `id, item_id, action ('CREATE'|'UPDATE'|'DELETE'|'DIKEMBALIKAN KE STOCK'), old_values (jsonb), new_values (jsonb), changed_by, created_at` — diisi otomatis lewat trigger (`on_item_changed`) tiap kali tabel `items` berubah. Ditampilkan sebagai "Riwayat Perubahan" di Master Barang & sebagai halaman penuh di `/log-item-change`
- **item_audit_history**: `id, item_id, note_audit, tanggal_audit, audited_by, created_at` — riwayat hasil audit (beda dari `item_audit_logs`!). Diisi manual saat auditor simpan hasil audit. Ditampilkan lewat tombol "Riwayat Audit" di Detail Barang (fitur baru sesi ini)
- **take_item_history**: `id, item_id, kode_barang, nama_barang, jumlah, kode_lokasi, nama_lokasi, user_id, user_name, alasan, created_at`
- **stock_keluar_history**: `id, original_item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, nama_lokasi, lokasi_keluar, foto_urls[], deskripsi, created_at, updated_at, keterangan_alasan, user_name, tanggal_keluar`
- **disposal_requests**: `id, nomor_pengajuan, diajukan_oleh, user_id, jumlah, alasan, metode_pemusnahan, status ('PENDING_AUDITOR'|'PENDING_SPV'|'PENDING_DIREKTUR'|'APPROVED'|'REJECTED'), tanggal_pengajuan, diketahui_auditor_oleh, tanggal_diketahui_auditor, approved_by_l1, approved_by_l2, tanggal_approved_l1, tanggal_approved_l2, keterangan, alasan_penolakan, created_at, updated_at`
- **disposal_request_items**: `id, request_id, item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kondisi_barang, foto_urls[], status_item ('PENDING'|'APPROVED'|'REJECTED'), alasan_rejection, created_at`
- **spk_requests**: `id, nomor_spk, diajukan_oleh, user_id, jumlah, keterangan, lokasi_tujuan, status ('PENDING_ADMIN'|'PENDING_AUDITOR'|'PENDING_SPV'|'PENDING_DIREKTUR'|'APPROVED'|'REJECTED'), tanggal_pengajuan, diketahui_admin_oleh, tanggal_diketahui_admin, diketahui_auditor_oleh, tanggal_diketahui_auditor, approved_by_l1, approved_by_l2, tanggal_approved_l1, tanggal_approved_l2, alasan_penolakan, created_at, updated_at`
- **spk_request_items**: `id, request_id, item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, kepemilikan_id, nama_kategori, nama_lokasi, foto_urls[], status_item, alasan_rejection, created_at`
- **app_settings**: `id, login_title, login_footer, login_bg_url, updated_at`
- **locations**: tabel LEGACY dari `sql/arsip/supabase_setup.sql` (sudah digantikan `master_lokasi`, tidak dipakai kode) — jangan dipakai untuk fitur baru.

Modul Gudang Berkas (`sql/arsip/supabase_gudang_berkas_setup.sql`, dipakai `GudangBerkasPage.tsx`):
- **gudang_berkas_requests**: header permohonan akses — `id, no_kunjungan (auto KJ<DDMMYY><2 digit>), tanggal_kunjungan, waktu_mulai, waktu_selesai, divisi_pemohon, nama_pemohon, jabatan_pemohon, pemohon_id, lokasi_gudang ('Gudang Mergat'|'Gudang Hasanuddin'), tujuan_kunjungan, tujuan_lainnya, jumlah_personil, pendamping_id, pendamping_nama, pendamping_divisi, diketahui_oleh_id, diketahui_oleh_nama, diketahui_oleh_jabatan, disetujui_oleh_nama (legacy, PDF sekarang 2 tanda tangan), members_foto_path, members_catatan, status ('DIAJUKAN'|'SELESAI'), created_by, created_by_name, created_at, updated_at`
- **gudang_berkas_request_members**: anggota tim/pengunjung — `id, request_id, no_urut, nama_lengkap, id_karyawan, jabatan, is_tambahan (ditambah manual admin/SPV), created_at`
- **gudang_berkas_request_items**: rincian berkas yang dicari — `id, request_id, no_urut, jenis_dokumen, tahun, nomor_dokumen, keterangan, is_temuan_lapangan, ditambahkan_oleh, created_at`
- **gudang_berkas_logbook**: 1 ringkasan verifikasi per permohonan — `id, request_id (unique), tanggal_verifikasi, status_kunjungan ('Masuk'|'Keluar'|'Periksa'), ga_verificator_id, ga_verificator_name, keterangan, total_items, verified_items, is_completed, completed_at, created_at, updated_at`
- **gudang_berkas_logbook_item_checks**: checklist per item berkas — `id, logbook_id, request_item_id, is_verified, verification_status ('PENDING'|'VERIFIED'|'TIDAK_SESUAI'), verified_note, verified_at, foto_path`
- **profiles** tambahan modul ini: `divisi`, `jabatan`.

### Fungsi, trigger & RPC Postgres

| Nama | File | Fungsi |
|---|---|---|
| `log_item_changes` + trigger `on_item_changed` | `sql/arsip/supabase_setup.sql` | isi `item_audit_logs` tiap `items` berubah (atribusi user lewat override transaksi, fallback `auth.uid()`) |
| `delete_item_as` | `sql/arsip/supabase_setup.sql` | RPC lama hapus item atas nama user (service-role); endpoint pemanggilnya sudah dihapus |
| `is_admin`, `is_active_user`, `app_role()` | `sql/arsip/supabase_setup.sql` / `sql/arsip/supabase_rbac_setup.sql` / audit keamanan | helper RLS (role & status aktif user) |
| `handle_new_user` + trigger `on_auth_user_created` | `sql/arsip/supabase_rbac_setup.sql` | bikin baris `profiles` saat user Auth dibuat |
| `finalize_disposal_request`, `finalize_spk_request` | `sql/arsip/supabase_approval_finalize.sql`, `sql/arsip/supabase_spk_qty.sql` | approval final dalam 1 transaksi (hanya `service_role`, dipanggil `POST /api/approval/finalize`). `finalize_spk_request` diganti 22 Okt 2026 (live, sudah diverifikasi): wajib status `PENDING_DIREKTUR`, isi `approved_by_l2`/`tanggal_approved_l2` |
| `validate_spk_request_item` + trigger `trg_validate_spk_request_item` | `sql/arsip/supabase_spk_qty.sql` | tolak qty SPK > stok saat diajukan |
| `assign_spk_number` + trigger `trg_assign_spk_number` | `sql/arsip/supabase_spk_qty.sql` | nomor SPK `SPK-DDMMYYYY-0001` (WIB) di server, pakai advisory lock |
| `delete_own_spk_request` (RPC) | `sql/arsip/supabase_spk_delete.sql` | requester hapus SPK miliknya selama masih `PENDING_ADMIN` (dipanggil dari `OfficeItemsRequester.tsx`) |
| `generate_gudang_berkas_no_kunjungan` + trigger `trg_gudang_berkas_no_kunjungan` | `sql/arsip/supabase_gudang_berkas_setup.sql` | nomor kunjungan otomatis `KJ<DDMMYY><urut>` |
| `set_updated_at` + trigger `trg_gb_requests_updated_at`, `trg_gb_logbook_updated_at` | `sql/arsip/supabase_gudang_berkas_setup.sql` | isi `updated_at` otomatis |

### Bucket storage

- `item-photos` (private) — foto barang; `item-documents` (private) — dokumen garansi/sertifikat/manual; `gudang-berkas-photos` (private) — foto verifikasi Gudang Berkas; `app-assets` (public, dibuat di `sql/arsip/supabase_setup.sql`; tidak dirujuk langsung oleh kode saat ini).

### Endpoint API (`api/index.ts`)

- `POST /api/admin/create-user`, `DELETE /api/admin/delete-user/:userId` — kelola user (admin only, dipanggil `ManageUsers.tsx`)
- `POST /api/approval/finalize` — approval final pemusnahan/SPK (lihat bagian Keamanan)

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

Tahap Direktur SPK (22 Okt 2026, live & terverifikasi): CHECK `spk_requests_status_check` memuat `PENDING_DIREKTUR`; policy baru additive `Direktur can view/update spk_requests` dan `Direktur can view/update spk_request_items` (pakai `public.app_role() = 'direktur'`). SPK yang sudah APPROVED sebelum tahap ini punya `approved_by_l2` kosong (PDF: kolom Direktur kosong).

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
14. **Master Barang — tampilan Card** (9 Okt 2026): toggle Card/Tabel di baris filter (default Card, pilihan disimpan di `localStorage['masterBarang.viewMode']`). Card memuat kode, badge status+kondisi, kategori, foto+nama+deskripsi, lokasi, kepemilikan, stok, chip dokumen, strip peringatan (list pemusnahan / belum ada foto), bar **kelengkapan data** 5 komponen (foto, garansi, sertifikat, manual, audit — dihitung dari kolom `items` yang sudah ada), dan tombol Detail/Edit/Riwayat/Ambil/Keluarkan sesuai role. Dropdown "Urutkan" khusus mode card (tabel tetap sort via header). Panel kontrol = 1 kartu 2 baris (baris 1 filter, baris 2 pilih-semua/jumlah + Urutkan + Excel & PDF + Tambah Barang); di HP panel tersembunyi default (`isMobileFilterExpanded=false`) dan muncul via tombol "Filter & Aksi"; di modal Perlu Pemusnahan kontrol card (pilih semua + urutan) dirender di dalam modal. Pagination & bulk-select dipakai bersama. **Tidak ada kolom/tabel database baru** untuk fitur ini (kolom baru Gudang Berkas ada di bagian Keamanan, revisi 6).
15. **Requester — qty & notifikasi live** (14 Okt 2026, `sql/arsip/supabase_spk_qty.sql`): requester pilih barang ke "keranjang" (tampilan card, tetap tersimpan saat pindah halaman/filter) dengan **qty wajib** 1..stok; `spk_request_items.jumlah_barang` sekarang = qty DIMINTA (dulu = seluruh stok). `finalize_spk_request` baru: qty < stok → stok dikurangi + `take_item_history` (user = requester); qty = stok → `stock_keluar_history` + hapus item seperti dulu; item yang sudah hilang/stok kurang → RAISE (SPV harus batalkan item, dulu tercatat keluar 2x). Trigger validasi qty saat insert + trigger nomor SPK di server (dulu dihitung di browser dari SPK yang terlihat → requester bisa dapat nomor kembar). Notifikasi status: Supabase Realtime `spk_requests` + polling 30 detik cadangan, riwayat notif & status terakhir di `localStorage['requester.notifs.<uid>'/'requester.spkStatus.<uid>']`. Halaman SPK approval menampilkan qty diminta vs stok saat ini.
13. Halaman Manage Users & Profile disamakan wrapper-nya (`space-y-4`, tanpa `max-w`/`p-6` sendiri) biar konsisten sama halaman lain.

**Status akhir**: semua perubahan sudah lolos `npx tsc --noEmit` dan `npx vite build` tanpa error di setiap langkah. Belum ada testing end-to-end otomatis (gak ada test suite di project ini) — verifikasi selama ini murni lewat review kode + build check + user screenshot manual.

## Aturan Dokumentasi (WAJIB)

Setiap kali menambah/mengubah **tabel, kolom, fungsi/trigger/RPC Postgres, bucket storage, endpoint API, route halaman, atau file baru di `src/components|hooks|lib`**, catat di file ini pada bagian yang sesuai (Struktur Folder, Routing, Skema Supabase, Fungsi/trigger, Bucket, Endpoint API) — termasuk SQL yang cuma dikasih di chat dan dijalankan manual di SQL Editor. **Sebelum bikin nama baru, cek dulu di file ini** supaya tidak bentrok dengan yang sudah ada.

Pengecek otomatis: `node scripts/check-claude-md.mjs` (dari folder `Inventory_GA`) memindai `src/`, `api/`, `src/types.ts`, dan `*.sql`, lalu melaporkan nama yang belum tercatat di sini. Skrip ini dipasang sebagai **Stop hook** Claude Code di `stock GA/.claude/settings.json`: kalau ada yang belum tercatat, Claude dipaksa melengkapi CLAUDE.md sebelum selesai. Catatan: kolom yang ditambah lewat SQL Editor tanpa disinkron ke `src/types.ts`/file `.sql` tidak terdeteksi skrip — tetap catat manual.

## Cara Kerja yang Terbukti Efektif di Sesi Ini (buat sesi lanjutan)

- User (panggilan "lae") sering minta **konsep/opini dulu sebelum eksekusi** ("apakah bisa... bagaimana menurut lae?") — jangan langsung ubah kode untuk pertanyaan eksploratif, kasih rekomendasi singkat + trade-off dulu, tunggu konfirmasi.
- Setelah user bilang "silahkan eksekusi"/"oke lae, lakukan" — baru jalan, dan **selalu tutup dengan `npx tsc --noEmit -p tsconfig.json` + `npx vite build`** sebelum lapor selesai (project ini gak ada CI, jadi ini gate kualitas satu-satunya).
- **Git (sejak 15 Okt 2026)**: repo ini punya remote `origin` = github.com/afandi-hrp/Inventory_GA (branch `main`). Setiap selesai satu perubahan yang lolos build gate, Claude **commit lokal** (1 commit per perubahan, pesan deskriptif bahasa Indonesia) supaya bisa di-revert kalau ternyata tidak sesuai. **JANGAN push** — push ke GitHub dilakukan user sendiri setelah dicek. Jangan ikut-commit `.env*` atau file yang tidak terkait.
- Perubahan SQL/RLS ke Supabase (sejak 15 Okt 2026): **taruh file baru di folder `sql/`** (`YYYYMMDD_<topik>.sql`, idempotent — lihat `sql/README.md`), JANGAN paste di chat. User jalankan manual di SQL Editor (gak ada koneksi Supabase MCP yang authenticated) lalu konfirmasi → verifikasi (minta hasil query cek bila perlu) → catat di CLAUDE.md → hapus file SQL-nya dari `sql/`.
- User cukup sering kasih feedback visual lewat screenshot + minta revisi kecil (warna, margin, posisi) — biasanya butuh 1-3 putaran iterasi sebelum pas, itu normal buat project ini.

## Keamanan (audit 2026-09-28)

- Prod: `https://inventory.waruna-group.co.id` (Docker di belakang Cloudflare), Supabase **self-hosted** di `https://supabase.waruna-group.co.id` (juga di belakang Cloudflare). Signup publik mati. Pengunjung anonim terverifikasi tidak bisa baca tabel/bucket apa pun (selain `app_settings`).
- **Upgrade runtime & Supabase (25 Okt 2026)**: Dockerfile pakai `node:24-alpine` (Node 20 EOL 30 Apr 2026; pertimbangkan Node 26 setelah LTS 28 Okt) + `npm audit fix` → 0 kerentanan (image prod perlu di-rebuild di server: `docker compose build --no-cache && docker compose up -d`). Stack Supabase self-hosted (`~jeffry/supabase/supabase-project` di server `172.16.9.5`, SSH alias `supabase-server`, docker butuh sudo) diupgrade 3 wave: auth v2.197.0, postgrest v14.18, realtime v2.143.3, storage-api v1.81.0, studio 2026.10.12, imgproxy v3.31.4, postgres-meta v0.100.0, edge-runtime v1.77.4, supavisor 2.9.13. **API gateway: Kong 2.8.1 diganti Envoy v1.39.1 (25 Okt 2026)** — service `api-gw` (container `supabase-envoy`, port 8000; port 8443 tidak ada lagi; alias jaringan `kong`/`envoy`), config di `volumes/api/envoy/` (envoy.yaml, cds.yaml, lds.template.yaml, docker-entrypoint.sh dari tag upstream `self-hosted/v0.8.3`), mode legacy (anon/service_role JWT lama, tanpa kunci `sb_`). `lds.template.yaml` dipatch LOKAL: route `/functions/v1/` → `direct_response` 403 (app tidak pakai Edge Functions); versi upstream asli ada di `~jeffry/backups/supabase-project-upgrade/envoy-staging/lds.template.yaml.upstream` — pasang ulang patch ini tiap kali config Envoy di-upgrade. Envoy juga memblokir `/realtime/v1/api/tenants` + `/api/openapi` (403; di Kong lama anon key bisa baca config tenant Realtime) → health check Realtime `/api/tenants/realtime-dev/health` kini 403 (pakai `/auth/v1/health` atau `/rest/v1/`). Rollback: compose lama `docker-compose.yml.pre-envoy` + `docker compose up -d kong`; `kong.yml` (+`kong.yml.proposed` yg sudah diperketat) masih tersimpan. Sengaja TIDAK diubah: Postgres 15.8 (upgrade ke 17 butuh dump/restore), logflare/vector. Catatan: konektor `supabase-ro` lewat Supavisor :5435, tidak lewat gateway. Backup + compose lama di `~jeffry/backups/supabase-project-upgrade/`. Host yang sama juga menjalankan stack Supabase milik aplikasi LAIN (`~jeffry/supabase/project2` dan `project3`) — BUKAN bagian Inventory GA, jangan diubah/dipakai untuk uji coba.
- SQL perbaikan RLS/storage dikasih di chat dalam 3 bagian (Bagian 1 = tutup celah tulis + helper `public.app_role()`, Bagian 2 = batasi akses baca per role, Bagian 3 = policy upload avatar). **Cek live `pg_policies` dulu** sebelum asumsi bagian mana yang sudah dijalankan user.
- **Approval final** (Direktur untuk pemusnahan DAN SPK — sejak 22 Okt 2026 SPK juga final di Direktur) = `POST /api/approval/finalize` `{type: 'disposal'|'spk', requestId}` → RPC `finalize_disposal_request` / `finalize_spk_request` (`sql/arsip/supabase_approval_finalize.sql`, cuma bisa dipanggil `service_role`). Satu transaksi: status APPROVED + insert `stock_keluar_history` + item APPROVED + putus FK + hapus `items`. Endpoint lama `DELETE /api/inventory/delete-item` sudah DIHAPUS (dulu loop per barang dari browser, bisa setengah jadi). Tahap non-final tetap update langsung dari klien.
- Halaman approval (`DisposalApprovalPage`/`SPKApprovalPage`) pakai UI bersama di `ApprovalProgress.tsx`: progress bar (list) + stepper (detail), tab filter "Perlu Tindakan Saya", modal konfirmasi setujui final, banner alasan penolakan (kolom baru `alasan_penolakan` di `disposal_requests`/`spk_requests`, JSON `{alasan, rejectedBy, role}`).
- `useAuth` TIDAK lagi bikin profil kalau hilang (dulu bikin role `admin`!) — sekarang logout paksa + pesan di Login via `sessionStorage['auth_notice']`.
- **Form Akses Gudang Berkas** (revisi 3, `sql/arsip/supabase_gudang_berkas_setup.sql` bagian 17–20): pemohon & pendamping dipilih dari profil user (`profiles.divisi`/`jabatan` baru; pemohon = user role `gudang_berkas` — otomatis diri sendiri kalau yang login role itu, pilih dari daftar kalau admin/SPV; pendamping & "Diketahui Oleh" di PDF = user role `admin` yang jabatannya mengandung "general affair"; "Disetujui" di PDF hardcode Direktur Medelin Dini; jabatan di footer PDF dibaca terbaru dari profil lewat `pemohon_id`/`diketahui_oleh_id`, revisi 4–5), id-nya disimpan di `pemohon_id`/`pendamping_id` + nama/divisi tetap disalin ke kolom teks lama. Tujuan kunjungan +"Tambah Berkas". Admin/SPV bisa tambah **temuan lapangan** saat verifikasi (`gudang_berkas_request_items.is_temuan_lapangan = true`) — ikut dihitung di logbook, TIDAK dicetak di PDF surat permohonan. Divisi/jabatan diisi di Akun Saya (user sendiri) atau Manage Users (admin: tombol edit per user + form Tambah User).
- **Gudang Berkas revisi 6** (`sql/arsip/supabase_gudang_berkas_setup.sql` bagian 21–24): PDF cuma 2 tanda tangan (Diajukan Oleh & Diketahui Oleh — "Disetujui"/Direktur dihapus). Foto verifikasi di bucket private `gudang-berkas-photos` (path `<request_id>/<tag>-<acak>.jpg`, dikompres lewat `src/lib/imageCompress.ts`, parameter sama dengan Master Barang): 1 foto wajib + catatan opsional per panel Anggota Tim (`requests.members_foto_path/members_catatan`; wajib diisi sebelum "Selesaikan Verifikasi"), 1 foto opsional per baris verifikasi (`logbook_item_checks.foto_path`). Admin/SPV bisa tambah anggota manual (`members.is_tambahan`). Tombol "Hapus Permohonan" (admin only) hapus semua file di folder `<request_id>` DULU, baru barisnya; hapus temuan lapangan & ganti/hapus foto juga membersihkan file lama. Role `direktur` bisa buka halaman ini tapi lihat-saja (`canManage` false; RLS SELECT logbook/checks/foto dibuka khusus direktur, tanpa policy tulis).
- Logo di kop PDF (approval, SPK, gudang berkas) pakai `addPdfLogo()` dari `src/lib/pdfLogo.ts` (logo ditanam di bundle via `src/assets/logo-full.png?inline`) — JANGAN balik ke `new Image()` + `/logo-full.png` (gagal diam-diam kalau request/cache bermasalah). Logo ungu di Login/LockScreen sama polanya (`src/lib/brandLogo.ts`).
- CSP `frame-src` = `'self' blob: <supabase>` (dulu `'none'` → preview PDF & dokumen di iframe ke-blok di production). `frame-ancestors 'none'` tetap.
- **Captcha login = Cloudflare Turnstile (26 Okt 2026)**, menggantikan captcha 4 karakter buatan browser (bisa dilewati karena `signInWithPassword` langsung ke Supabase). Frontend: `TurnstileWidget.tsx` → token dikirim lewat `signInWithPassword({ options: { captchaToken } })` di `Login.tsx` DAN `LockScreen.tsx`; token sekali pakai, di-reset tiap percobaan gagal. Site key (publik) = env build `VITE_TURNSTILE_SITE_KEY` di `.env` (dibaca Vite saat `docker compose build`). Verifikasi token dilakukan GoTrue di server Supabase: env auth `GOTRUE_SECURITY_CAPTCHA_ENABLED=true`, `GOTRUE_SECURITY_CAPTCHA_PROVIDER=turnstile`, `GOTRUE_SECURITY_CAPTCHA_SECRET=<secret key>` (secret TIDAK boleh ada di repo/frontend). CSP (`api/index.ts`) menambah `https://challenges.cloudflare.com` di `script-src`/`frame-src`/`connect-src`. Endpoint admin (service role: create-user, dsb) tidak terpengaruh captcha. Hostname `inventory.waruna-group.co.id` harus terdaftar di widget Turnstile Cloudflare.
- Signed URL foto/dokumen TTL 10 menit (dibuat ulang tiap gambar dibuka, jangan di-cache lama).
- File yang dulu di `public/` tapi gak boleh ikut ter-deploy dipindah ke `_arsip_public/`.
