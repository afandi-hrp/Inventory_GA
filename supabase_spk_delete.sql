-- =====================================================================
-- Modul: requester hapus pengajuan SPK miliknya sendiri
-- Jalankan manual di Supabase SQL Editor SEBELUM deploy kode halaman
-- requester yang baru. Aman dijalankan berkali-kali (idempotent).
--
-- Approval membaca langsung tabel spk_requests, jadi begitu baris dihapus
-- pengajuan otomatis hilang dari antrean Admin/Auditor/SPV.
-- Aturan (dicek di server, bukan cuma di browser):
--   - hanya pemilik pengajuan (user_id = auth.uid())
--   - hanya selama BELUM ADA approval sama sekali (status PENDING_ADMIN).
--     Begitu Admin (level 1) menandai diketahui, pengajuan terkunci —
--     termasuk APPROVED/REJECTED, supaya jejak approval tidak bisa dihapus.
-- FOR UPDATE mengunci baris, jadi tidak bisa bentrok dengan SPV yang sedang
-- menyetujui final di detik yang sama (finalize_spk_request juga FOR UPDATE).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_own_spk_request(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  req public.spk_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Harus login untuk menghapus pengajuan';
  END IF;

  SELECT * INTO req FROM public.spk_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Pengajuan SPK tidak ditemukan';
  END IF;
  IF req.status <> 'PENDING_ADMIN' OR req.diketahui_admin_oleh IS NOT NULL THEN
    RAISE EXCEPTION 'Pengajuan % sudah diproses approval (status: %) dan tidak bisa dihapus', req.nomor_spk, req.status;
  END IF;
  -- Admin bisa menolak per item tanpa mengubah status pengajuan — itu juga
  -- dihitung sebagai approval yang sudah berjalan.
  IF EXISTS (
    SELECT 1 FROM public.spk_request_items
     WHERE request_id = p_request_id AND status_item IS DISTINCT FROM 'PENDING'
  ) THEN
    RAISE EXCEPTION 'Pengajuan % sudah diproses approval (ada barang yang ditolak/diproses) dan tidak bisa dihapus', req.nomor_spk;
  END IF;

  DELETE FROM public.spk_request_items WHERE request_id = p_request_id;
  DELETE FROM public.spk_requests WHERE id = p_request_id;

  RETURN req.nomor_spk;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_spk_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_spk_request(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verifikasi (jalankan terpisah, paste hasilnya):
-- 1. Fungsi terpasang:
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'delete_own_spk_request';
-- 2. Tabel lain yang punya FK ke spk_requests (kalau ada selain
--    spk_request_items, fungsi di atas perlu ikut membersihkannya):
-- SELECT conrelid::regclass AS tabel, conname, pg_get_constraintdef(oid) AS definisi
--   FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.spk_requests'::regclass;
