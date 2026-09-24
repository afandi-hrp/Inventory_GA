-- =====================================================================
-- Modul: Form Akses Gudang Berkas + Logbook Kunjungan Gudang Berkas
-- Jalankan file ini manual di Supabase SQL Editor (lihat catatan di
-- supabase_setup.sql: skema project ini tidak pakai folder migrations,
-- tiap modul punya file setup sendiri).
-- Aman dijalankan berkali-kali (idempotent).
-- =====================================================================

-- 1. Header pengajuan (diisi manual oleh admin)
CREATE TABLE IF NOT EXISTS gudang_berkas_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    no_kunjungan TEXT UNIQUE NOT NULL,
    tanggal_kunjungan DATE NOT NULL,
    waktu_mulai TIME,
    waktu_selesai TIME,
    divisi_pemohon TEXT,
    nama_pemohon TEXT NOT NULL,
    jabatan_pemohon TEXT,
    lokasi_gudang TEXT CHECK (lokasi_gudang IN ('Gudang Mergat', 'Gudang Hasanuddin')),
    tujuan_kunjungan TEXT,
    tujuan_lainnya TEXT,
    jumlah_personil INTEGER DEFAULT 1,
    pendamping_nama TEXT,
    pendamping_divisi TEXT,
    status TEXT NOT NULL DEFAULT 'DIAJUKAN' CHECK (status IN ('DIAJUKAN', 'SELESAI')),
    created_by UUID REFERENCES profiles(id),
    created_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Daftar anggota tim / pengunjung (jumlah baris bebas, tidak dibatasi 3)
CREATE TABLE IF NOT EXISTS gudang_berkas_request_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES gudang_berkas_requests(id) ON DELETE CASCADE,
    no_urut INTEGER NOT NULL,
    nama_lengkap TEXT NOT NULL,
    id_karyawan TEXT,
    jabatan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Rincian berkas / dokumen yang dicari / diambil (jumlah baris bebas, tidak dibatasi 4)
CREATE TABLE IF NOT EXISTS gudang_berkas_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES gudang_berkas_requests(id) ON DELETE CASCADE,
    no_urut INTEGER NOT NULL,
    jenis_dokumen TEXT NOT NULL,
    tahun TEXT,
    nomor_dokumen TEXT,
    keterangan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Logbook: 1 baris ringkasan per form/kunjungan
CREATE TABLE IF NOT EXISTS gudang_berkas_logbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE REFERENCES gudang_berkas_requests(id) ON DELETE CASCADE,
    tanggal_verifikasi DATE,
    status_kunjungan TEXT CHECK (status_kunjungan IN ('Masuk', 'Keluar', 'Periksa')),
    ga_verificator_id UUID REFERENCES profiles(id),
    ga_verificator_name TEXT,
    keterangan TEXT,
    total_items INTEGER NOT NULL DEFAULT 0,
    verified_items INTEGER NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Checklist verifikasi per item rincian berkas (1 baris per item, di bawah 1 logbook)
CREATE TABLE IF NOT EXISTS gudang_berkas_logbook_item_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logbook_id UUID NOT NULL REFERENCES gudang_berkas_logbook(id) ON DELETE CASCADE,
    request_item_id UUID NOT NULL REFERENCES gudang_berkas_request_items(id) ON DELETE CASCADE,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_note TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (logbook_id, request_item_id)
);

CREATE INDEX IF NOT EXISTS idx_gb_request_members_request_id ON gudang_berkas_request_members(request_id);
CREATE INDEX IF NOT EXISTS idx_gb_request_items_request_id ON gudang_berkas_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_gb_logbook_request_id ON gudang_berkas_logbook(request_id);
CREATE INDEX IF NOT EXISTS idx_gb_logbook_item_checks_logbook_id ON gudang_berkas_logbook_item_checks(logbook_id);

-- 6. Auto-generate No Kunjungan format KJ<DDMMYY><urutan 2 digit per hari>, contoh: KJ17092601
CREATE OR REPLACE FUNCTION public.generate_gudang_berkas_no_kunjungan()
RETURNS TRIGGER AS $$
DECLARE
  today_prefix TEXT;
  seq_today INTEGER;
BEGIN
  IF NEW.no_kunjungan IS NULL OR NEW.no_kunjungan = '' THEN
    today_prefix := 'KJ' || to_char(NEW.tanggal_kunjungan, 'DDMMYY');
    SELECT COUNT(*) + 1 INTO seq_today
    FROM gudang_berkas_requests
    WHERE no_kunjungan LIKE today_prefix || '%';
    NEW.no_kunjungan := today_prefix || lpad(seq_today::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gudang_berkas_no_kunjungan ON gudang_berkas_requests;
CREATE TRIGGER trg_gudang_berkas_no_kunjungan
  BEFORE INSERT ON gudang_berkas_requests
  FOR EACH ROW EXECUTE FUNCTION public.generate_gudang_berkas_no_kunjungan();

-- 7. updated_at otomatis
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gb_requests_updated_at ON gudang_berkas_requests;
CREATE TRIGGER trg_gb_requests_updated_at
  BEFORE UPDATE ON gudang_berkas_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_gb_logbook_updated_at ON gudang_berkas_logbook;
CREATE TRIGGER trg_gb_logbook_updated_at
  BEFORE UPDATE ON gudang_berkas_logbook
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. RLS: semua user aktif bisa lihat, hanya admin yang bisa input/ubah/hapus
ALTER TABLE gudang_berkas_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang_berkas_request_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang_berkas_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang_berkas_logbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang_berkas_logbook_item_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GB requests viewable by authenticated users" ON gudang_berkas_requests;
CREATE POLICY "GB requests viewable by authenticated users" ON gudang_berkas_requests
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
DROP POLICY IF EXISTS "Only admins can modify GB requests" ON gudang_berkas_requests;
CREATE POLICY "Only admins can modify GB requests" ON gudang_berkas_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
    );

DROP POLICY IF EXISTS "GB members viewable by authenticated users" ON gudang_berkas_request_members;
CREATE POLICY "GB members viewable by authenticated users" ON gudang_berkas_request_members
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
DROP POLICY IF EXISTS "Only admins can modify GB members" ON gudang_berkas_request_members;
CREATE POLICY "Only admins can modify GB members" ON gudang_berkas_request_members
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
    );

DROP POLICY IF EXISTS "GB items viewable by authenticated users" ON gudang_berkas_request_items;
CREATE POLICY "GB items viewable by authenticated users" ON gudang_berkas_request_items
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
DROP POLICY IF EXISTS "Only admins can modify GB items" ON gudang_berkas_request_items;
CREATE POLICY "Only admins can modify GB items" ON gudang_berkas_request_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
    );

DROP POLICY IF EXISTS "GB logbook viewable by authenticated users" ON gudang_berkas_logbook;
CREATE POLICY "GB logbook viewable by authenticated users" ON gudang_berkas_logbook
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
DROP POLICY IF EXISTS "Only admins can modify GB logbook" ON gudang_berkas_logbook;
CREATE POLICY "Only admins can modify GB logbook" ON gudang_berkas_logbook
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
    );

DROP POLICY IF EXISTS "GB logbook checks viewable by authenticated users" ON gudang_berkas_logbook_item_checks;
CREATE POLICY "GB logbook checks viewable by authenticated users" ON gudang_berkas_logbook_item_checks
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
DROP POLICY IF EXISTS "Only admins can modify GB logbook checks" ON gudang_berkas_logbook_item_checks;
CREATE POLICY "Only admins can modify GB logbook checks" ON gudang_berkas_logbook_item_checks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
    );

-- =====================================================================
-- REVISI (23 Sep 2026): nama tanda tangan manual (Diketahui/Disetujui)
-- + status verifikasi per item (Pending / Verified / Tidak Sesuai).
-- Aman dijalankan berkali-kali.
-- =====================================================================

-- 9. Nama penanda tangan "Diketahui Oleh (Pemohon/Depart)" & "Disetujui (Direktur)"
--    diisi manual oleh admin di halaman detail sebelum cetak PDF (tanggal otomatis
--    memakai tanggal saat PDF dicetak).
ALTER TABLE gudang_berkas_requests ADD COLUMN IF NOT EXISTS diketahui_oleh_nama TEXT;
ALTER TABLE gudang_berkas_requests ADD COLUMN IF NOT EXISTS disetujui_oleh_nama TEXT;

-- 10. Status verifikasi per item rincian berkas: PENDING (belum diputuskan),
--     VERIFIED (sesuai/benar), TIDAK_SESUAI (diputuskan tidak sesuai, ditandai merah).
ALTER TABLE gudang_berkas_logbook_item_checks
    ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'TIDAK_SESUAI'));

-- Migrasikan data lama (kalau sebelumnya sempat dipakai is_verified boolean)
UPDATE gudang_berkas_logbook_item_checks SET verification_status = 'VERIFIED' WHERE is_verified = true AND verification_status = 'PENDING';

-- =====================================================================
-- REVISI 2 (23 Sep 2026): role baru "gudang_berkas".
-- Role ini HANYA bisa: membuat Form Akses Gudang Berkas baru, dan
-- melihat/mencetak PDF form miliknya SENDIRI. Tidak bisa mengedit apa pun,
-- dan TIDAK BISA melihat data logbook/verifikasi sama sekali (SELECT logbook
-- & logbook_item_checks diblok total untuk role ini di level database, bukan
-- cuma disembunyikan di UI).
-- Aman dijalankan berkali-kali.
-- =====================================================================

-- 11. Izinkan role 'gudang_berkas' di kolom profiles.role.
--     PENTING: jalankan dulu query cek ini untuk tahu nama CHECK constraint
--     yang SEBENARNYA ada di database Anda sekarang (constraint di project ini
--     kemungkinan sudah pernah diubah manual di masa lalu, jadi namanya belum
--     tentu "profiles_role_check" default Postgres):
--
--       SELECT conname FROM pg_constraint
--       WHERE conrelid = 'profiles'::regclass AND contype = 'c';
--
--     Kalau hasilnya BUKAN "profiles_role_check", ganti nama di baris
--     DROP CONSTRAINT di bawah ini dengan nama yang muncul dari query di atas
--     sebelum menjalankan blok ini. Kalau dibiarkan salah, ALTER ADD di bawah
--     bisa gagal (constraint lama+baru sama-sama aktif dan saling membatasi)
--     alih-alih menggantikannya.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'user', 'auditor', 'spv', 'direktur', 'requester', 'gudang_berkas'));

-- 12. gudang_berkas_requests: staf gudang_berkas cuma boleh lihat & bikin baris
--     miliknya sendiri (created_by = dirinya); tidak boleh update/delete sama sekali.
--     Role lain (admin, auditor, spv, direktur, user) tetap seperti semula: bisa
--     lihat semua baris (perilaku lama, tidak diubah).
DROP POLICY IF EXISTS "GB requests viewable by authenticated users" ON gudang_berkas_requests;
DROP POLICY IF EXISTS "Only admins can modify GB requests" ON gudang_berkas_requests;

CREATE POLICY "GB requests select" ON gudang_berkas_requests
    FOR SELECT USING (
        auth.role() = 'authenticated' AND is_active_user() AND (
            NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas')
            OR created_by = auth.uid()
        )
    );
CREATE POLICY "GB requests insert" ON gudang_berkas_requests
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
        OR (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas' AND profiles.is_active = true)
            AND created_by = auth.uid()
        )
    );
CREATE POLICY "GB requests update admin only" ON gudang_berkas_requests
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB requests delete admin only" ON gudang_berkas_requests
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));

-- 13. gudang_berkas_request_members: sama, staf gudang_berkas cuma boleh lihat
--     & bikin baris anggota tim untuk form miliknya sendiri.
DROP POLICY IF EXISTS "GB members viewable by authenticated users" ON gudang_berkas_request_members;
DROP POLICY IF EXISTS "Only admins can modify GB members" ON gudang_berkas_request_members;

CREATE POLICY "GB members select" ON gudang_berkas_request_members
    FOR SELECT USING (
        auth.role() = 'authenticated' AND is_active_user() AND (
            NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas')
            OR EXISTS (SELECT 1 FROM gudang_berkas_requests r WHERE r.id = gudang_berkas_request_members.request_id AND r.created_by = auth.uid())
        )
    );
CREATE POLICY "GB members insert" ON gudang_berkas_request_members
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
        OR (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas' AND profiles.is_active = true)
            AND EXISTS (SELECT 1 FROM gudang_berkas_requests r WHERE r.id = gudang_berkas_request_members.request_id AND r.created_by = auth.uid())
        )
    );
CREATE POLICY "GB members update admin only" ON gudang_berkas_request_members
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB members delete admin only" ON gudang_berkas_request_members
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));

-- 14. gudang_berkas_request_items: sama pola dengan members.
DROP POLICY IF EXISTS "GB items viewable by authenticated users" ON gudang_berkas_request_items;
DROP POLICY IF EXISTS "Only admins can modify GB items" ON gudang_berkas_request_items;

CREATE POLICY "GB items select" ON gudang_berkas_request_items
    FOR SELECT USING (
        auth.role() = 'authenticated' AND is_active_user() AND (
            NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas')
            OR EXISTS (SELECT 1 FROM gudang_berkas_requests r WHERE r.id = gudang_berkas_request_items.request_id AND r.created_by = auth.uid())
        )
    );
CREATE POLICY "GB items insert" ON gudang_berkas_request_items
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
        OR (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas' AND profiles.is_active = true)
            AND EXISTS (SELECT 1 FROM gudang_berkas_requests r WHERE r.id = gudang_berkas_request_items.request_id AND r.created_by = auth.uid())
        )
    );
CREATE POLICY "GB items update admin only" ON gudang_berkas_request_items
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB items delete admin only" ON gudang_berkas_request_items
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));

-- 15. gudang_berkas_logbook: staf gudang_berkas TIDAK BOLEH SELECT sama sekali
--     (ini yang memblok akses ke halaman verifikasi di level database, bukan
--     cuma UI). Tapi tetap perlu INSERT (dipakai otomatis oleh aplikasi saat
--     form baru dibuat, untuk menyiapkan 1 baris logbook kosong) — dibatasi
--     hanya untuk request miliknya sendiri.
DROP POLICY IF EXISTS "GB logbook viewable by authenticated users" ON gudang_berkas_logbook;
DROP POLICY IF EXISTS "Only admins can modify GB logbook" ON gudang_berkas_logbook;

CREATE POLICY "GB logbook select admin only" ON gudang_berkas_logbook
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB logbook insert" ON gudang_berkas_logbook
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
        OR (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas' AND profiles.is_active = true)
            AND EXISTS (SELECT 1 FROM gudang_berkas_requests r WHERE r.id = gudang_berkas_logbook.request_id AND r.created_by = auth.uid())
        )
    );
CREATE POLICY "GB logbook update admin only" ON gudang_berkas_logbook
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB logbook delete admin only" ON gudang_berkas_logbook
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));

-- 16. gudang_berkas_logbook_item_checks: sama pola dengan logbook di atas —
--     SELECT admin-only, INSERT boleh untuk staf gudang_berkas (dipakai
--     otomatis saat form baru dibuat, menyiapkan checklist kosong per item).
DROP POLICY IF EXISTS "GB logbook checks viewable by authenticated users" ON gudang_berkas_logbook_item_checks;
DROP POLICY IF EXISTS "Only admins can modify GB logbook checks" ON gudang_berkas_logbook_item_checks;

CREATE POLICY "GB logbook checks select admin only" ON gudang_berkas_logbook_item_checks
    FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB logbook checks insert" ON gudang_berkas_logbook_item_checks
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true)
        OR (
            EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'gudang_berkas' AND profiles.is_active = true)
            AND EXISTS (
                SELECT 1 FROM gudang_berkas_logbook lb
                JOIN gudang_berkas_requests r ON r.id = lb.request_id
                WHERE lb.id = gudang_berkas_logbook_item_checks.logbook_id AND r.created_by = auth.uid()
            )
        )
    );
CREATE POLICY "GB logbook checks update admin only" ON gudang_berkas_logbook_item_checks
    FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "GB logbook checks delete admin only" ON gudang_berkas_logbook_item_checks
    FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
