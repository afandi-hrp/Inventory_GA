-- =====================================================================
-- Modul: Approval final Pemusnahan & SPK (transaksional) + alasan penolakan
-- Jalankan manual di Supabase SQL Editor SEBELUM deploy kode yang memakai
-- endpoint POST /api/approval/finalize & kolom alasan_penolakan.
-- Aman dijalankan berkali-kali (idempotent).
-- =====================================================================

BEGIN;

-- 1. Alasan penolakan di level pengajuan (JSON string: {alasan, rejectedBy, role},
--    format sama dengan disposal/spk_request_items.alasan_rejection).
ALTER TABLE public.disposal_requests ADD COLUMN IF NOT EXISTS alasan_penolakan TEXT;
ALTER TABLE public.spk_requests ADD COLUMN IF NOT EXISTS alasan_penolakan TEXT;

-- 2. Approval final PEMUSNAHAN (Direktur), semua-atau-tidak-sama-sekali:
--    status → APPROVED, tiap item yang tidak ditolak dicatat ke
--    stock_keluar_history, ditandai APPROVED, relasi FK-nya diputus, lalu
--    barangnya dihapus dari items. Kalau satu langkah gagal, semuanya batal.
CREATE OR REPLACE FUNCTION public.finalize_disposal_request(p_request_id uuid, p_actor_id uuid, p_actor_name text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  req public.disposal_requests%ROWTYPE;
  ri public.disposal_request_items%ROWTYPE;
  it public.items%ROWTYPE;
  processed integer := 0;
BEGIN
  SELECT * INTO req FROM public.disposal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan pemusnahan tidak ditemukan';
  END IF;
  IF req.status <> 'PENDING_DIREKTUR' THEN
    RAISE EXCEPTION 'Pengajuan tidak sedang menunggu persetujuan Direktur (status sekarang: %)', req.status;
  END IF;

  UPDATE public.disposal_requests
     SET status = 'APPROVED', approved_by_l2 = p_actor_name, tanggal_approved_l2 = now()
   WHERE id = p_request_id;

  -- Dibaca trigger log_item_changes supaya log audit mencatat pelaku aslinya.
  PERFORM set_config('audit.changed_by', p_actor_id::text, true);

  FOR ri IN
    SELECT * FROM public.disposal_request_items
     WHERE request_id = p_request_id AND status_item IS DISTINCT FROM 'REJECTED'
  LOOP
    it := NULL;
    IF ri.item_id IS NOT NULL THEN
      SELECT * INTO it FROM public.items WHERE id = ri.item_id;
    END IF;

    INSERT INTO public.stock_keluar_history (
      original_item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, nama_lokasi,
      lokasi_keluar, foto_urls, deskripsi, keterangan_alasan, tanggal_keluar, user_name
    ) VALUES (
      ri.item_id, ri.kode_barang, ri.nama_barang, ri.jumlah_barang, ri.kode_lokasi,
      (SELECT ml.nama_lokasi FROM public.master_lokasi ml WHERE ml.kode_lokasi = COALESCE(it.kode_lokasi, ri.kode_lokasi)),
      'PEMUSNAHAN', COALESCE(it.foto_urls, ri.foto_urls, '{}'), COALESCE(it.deskripsi, ''),
      'Berita Acara Pemusnahan No: ' || req.nomor_pengajuan, now(), p_actor_name
    );

    UPDATE public.disposal_request_items SET status_item = 'APPROVED' WHERE id = ri.id;

    IF ri.item_id IS NOT NULL THEN
      -- Putus FK di semua pengajuan yang mereferensikan barang ini, baru hapus.
      UPDATE public.disposal_request_items SET item_id = NULL WHERE item_id = ri.item_id;
      UPDATE public.spk_request_items SET item_id = NULL WHERE item_id = ri.item_id;
      DELETE FROM public.items WHERE id = ri.item_id;
    END IF;

    processed := processed + 1;
  END LOOP;

  RETURN processed;
END;
$$;

-- 3. Approval final SPK (SPV), pola sama dengan pemusnahan.
CREATE OR REPLACE FUNCTION public.finalize_spk_request(p_request_id uuid, p_actor_id uuid, p_actor_name text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  req public.spk_requests%ROWTYPE;
  ri public.spk_request_items%ROWTYPE;
  it public.items%ROWTYPE;
  processed integer := 0;
BEGIN
  SELECT * INTO req FROM public.spk_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan SPK tidak ditemukan';
  END IF;
  IF req.status <> 'PENDING_SPV' THEN
    RAISE EXCEPTION 'Pengajuan tidak sedang menunggu persetujuan SPV (status sekarang: %)', req.status;
  END IF;

  UPDATE public.spk_requests
     SET status = 'APPROVED', approved_by_l1 = p_actor_name, tanggal_approved_l1 = now()
   WHERE id = p_request_id;

  PERFORM set_config('audit.changed_by', p_actor_id::text, true);

  FOR ri IN
    SELECT * FROM public.spk_request_items
     WHERE request_id = p_request_id AND status_item IS DISTINCT FROM 'REJECTED'
  LOOP
    it := NULL;
    IF ri.item_id IS NOT NULL THEN
      SELECT * INTO it FROM public.items WHERE id = ri.item_id;
    END IF;

    INSERT INTO public.stock_keluar_history (
      original_item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, nama_lokasi,
      lokasi_keluar, foto_urls, deskripsi, keterangan_alasan, tanggal_keluar, user_name
    ) VALUES (
      ri.item_id, ri.kode_barang, ri.nama_barang, ri.jumlah_barang, ri.kode_lokasi,
      (SELECT ml.nama_lokasi FROM public.master_lokasi ml WHERE ml.kode_lokasi = COALESCE(it.kode_lokasi, ri.kode_lokasi)),
      'SPK Pengambilan - ' || req.nomor_spk, COALESCE(it.foto_urls, ri.foto_urls, '{}'), COALESCE(it.deskripsi, ''),
      'SPK No: ' || req.nomor_spk || ' - ' || COALESCE(NULLIF(req.keterangan, ''), '-'), now(), p_actor_name
    );

    UPDATE public.spk_request_items SET status_item = 'APPROVED' WHERE id = ri.id;

    IF ri.item_id IS NOT NULL THEN
      UPDATE public.disposal_request_items SET item_id = NULL WHERE item_id = ri.item_id;
      UPDATE public.spk_request_items SET item_id = NULL WHERE item_id = ri.item_id;
      DELETE FROM public.items WHERE id = ri.item_id;
    END IF;

    processed := processed + 1;
  END LOOP;

  RETURN processed;
END;
$$;

-- 4. Cuma server API (service_role) yang boleh memanggil kedua fungsi ini.
REVOKE ALL ON FUNCTION public.finalize_disposal_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_spk_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_disposal_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_spk_request(uuid, uuid, text) TO service_role;

COMMIT;

-- 5. PostgREST perlu reload schema cache supaya fungsi & kolom baru langsung dikenali.
NOTIFY pgrst, 'reload schema';
