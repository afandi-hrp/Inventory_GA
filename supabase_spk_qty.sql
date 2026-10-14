-- =====================================================================
-- Modul: SPK requester dengan QTY + notifikasi live
-- Jalankan manual di Supabase SQL Editor SEBELUM deploy kode halaman
-- requester yang baru. Aman dijalankan berkali-kali (idempotent).
--
-- spk_request_items.jumlah_barang sekarang = qty yang DIMINTA requester
-- (dulu selalu = seluruh stok barang). Saat SPV menyetujui final:
--   qty < stok  -> stok items dikurangi, dicatat di take_item_history
--   qty = stok  -> seperti sebelumnya: snapshot ke stock_keluar_history
--                  (semua foto) lalu barang dihapus dari items
-- =====================================================================

BEGIN;

-- 1. Qty minimal 1. NOT VALID = baris lama tidak dicek ulang, baris baru dicek.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'spk_request_items_jumlah_positive'
       AND conrelid = 'public.spk_request_items'::regclass
  ) THEN
    ALTER TABLE public.spk_request_items
      ADD CONSTRAINT spk_request_items_jumlah_positive CHECK (jumlah_barang >= 1) NOT VALID;
  END IF;
END $$;

-- 2. Validasi qty saat requester mengajukan: tidak boleh melebihi stok saat itu.
--    SECURITY DEFINER supaya pengecekan stok tidak tergantung RLS pembaca.
CREATE OR REPLACE FUNCTION public.validate_spk_request_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stok integer;
BEGIN
  IF NEW.jumlah_barang IS NULL OR NEW.jumlah_barang < 1 THEN
    RAISE EXCEPTION 'Qty untuk barang % wajib diisi (minimal 1)', NEW.kode_barang;
  END IF;

  IF NEW.item_id IS NOT NULL THEN
    SELECT jumlah_barang INTO v_stok FROM public.items WHERE id = NEW.item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barang % sudah tidak ada di stok', NEW.kode_barang;
    END IF;
    IF NEW.jumlah_barang > v_stok THEN
      RAISE EXCEPTION 'Qty barang % (%) melebihi stok tersedia (%)', NEW.kode_barang, NEW.jumlah_barang, v_stok;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_spk_request_item ON public.spk_request_items;
CREATE TRIGGER trg_validate_spk_request_item
  BEFORE INSERT ON public.spk_request_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_spk_request_item();

-- 3. Nomor SPK dibuat di server. Dulu dihitung di browser dari jumlah SPK hari
--    ini yang TERLIHAT oleh user — requester cuma melihat SPK miliknya, jadi
--    dua requester bisa dapat nomor yang sama. Advisory lock mencegah bentrok
--    kalau dua orang submit bersamaan. Format sama: SPK-DDMMYYYY-0001 (WIB).
CREATE OR REPLACE FUNCTION public.assign_spk_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text := 'SPK-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'DDMMYYYY') || '-';
  v_seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('spk_requests.nomor_spk'));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(substr(nomor_spk, length(v_prefix) + 1), '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_seq
    FROM public.spk_requests
   WHERE nomor_spk LIKE v_prefix || '%';
  NEW.nomor_spk := v_prefix || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_spk_number ON public.spk_requests;
CREATE TRIGGER trg_assign_spk_number
  BEFORE INSERT ON public.spk_requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_spk_number();

-- 4. Approval final SPK (SPV) — sekarang mendukung ambil sebagian.
CREATE OR REPLACE FUNCTION public.finalize_spk_request(p_request_id uuid, p_actor_id uuid, p_actor_name text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  req public.spk_requests%ROWTYPE;
  ri public.spk_request_items%ROWTYPE;
  it public.items%ROWTYPE;
  v_qty integer;
  v_nama_lokasi text;
  v_alasan text;
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

  v_alasan := 'SPK No: ' || req.nomor_spk
           || COALESCE(' → ' || NULLIF(req.lokasi_tujuan, ''), '')
           || ' - ' || COALESCE(NULLIF(req.keterangan, ''), '-');

  FOR ri IN
    SELECT * FROM public.spk_request_items
     WHERE request_id = p_request_id AND status_item IS DISTINCT FROM 'REJECTED'
  LOOP
    -- Barang yang sudah keluar lewat SPK/pemusnahan lain TIDAK boleh dicatat
    -- keluar dua kali (dulu tetap masuk stock_keluar_history).
    it := NULL;
    IF ri.item_id IS NOT NULL THEN
      SELECT * INTO it FROM public.items WHERE id = ri.item_id FOR UPDATE;
    END IF;
    IF it.id IS NULL THEN
      RAISE EXCEPTION 'Barang % (%) sudah tidak ada di stok. Batalkan item ini dulu sebelum menyetujui.', ri.nama_barang, ri.kode_barang;
    END IF;

    v_qty := COALESCE(ri.jumlah_barang, 0);
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'Qty barang % tidak valid (%)', ri.kode_barang, v_qty;
    END IF;
    IF v_qty > it.jumlah_barang THEN
      RAISE EXCEPTION 'Stok barang % (%) tinggal %, diminta %. Batalkan item ini atau tambah stok dulu.', ri.nama_barang, ri.kode_barang, it.jumlah_barang, v_qty;
    END IF;

    SELECT ml.nama_lokasi INTO v_nama_lokasi FROM public.master_lokasi ml WHERE ml.kode_lokasi = it.kode_lokasi;

    IF v_qty < it.jumlah_barang THEN
      -- Ambil sebagian: barang tetap di master, stok berkurang.
      UPDATE public.items
         SET jumlah_barang = jumlah_barang - v_qty, updated_at = now()
       WHERE id = it.id;

      INSERT INTO public.take_item_history (
        item_id, kode_barang, nama_barang, jumlah, kode_lokasi, nama_lokasi, user_id, user_name, alasan
      ) VALUES (
        it.id, it.kode_barang, it.nama_barang, v_qty, it.kode_lokasi, v_nama_lokasi,
        req.user_id, req.diajukan_oleh, v_alasan || ' (disetujui ' || p_actor_name || ')'
      );

      UPDATE public.spk_request_items SET status_item = 'APPROVED' WHERE id = ri.id;
    ELSE
      -- Ambil semua: snapshot ke stock_keluar_history lalu hapus dari master.
      INSERT INTO public.stock_keluar_history (
        original_item_id, kode_barang, nama_barang, jumlah_barang, kode_lokasi, nama_lokasi,
        lokasi_keluar, foto_urls, deskripsi, keterangan_alasan, tanggal_keluar, user_name
      ) VALUES (
        it.id, it.kode_barang, it.nama_barang, it.jumlah_barang, it.kode_lokasi, v_nama_lokasi,
        'SPK Pengambilan - ' || req.nomor_spk, COALESCE(it.foto_urls, ri.foto_urls, '{}'), COALESCE(it.deskripsi, ''),
        v_alasan, now(), p_actor_name
      );

      UPDATE public.spk_request_items SET status_item = 'APPROVED' WHERE id = ri.id;
      UPDATE public.disposal_request_items SET item_id = NULL WHERE item_id = it.id;
      UPDATE public.spk_request_items SET item_id = NULL WHERE item_id = it.id;
      DELETE FROM public.items WHERE id = it.id;
    END IF;

    processed := processed + 1;
  END LOOP;

  RETURN processed;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_spk_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_spk_request(uuid, uuid, text) TO service_role;

-- 5. Notifikasi live: siarkan perubahan spk_requests lewat Supabase Realtime.
--    Realtime tetap menghormati RLS — requester hanya menerima SPK miliknya.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'spk_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.spk_requests;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verifikasi (jalankan terpisah, paste hasilnya):
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_validate_spk_request_item','trg_assign_spk_number');
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- SELECT policyname, cmd, roles::text, qual FROM pg_policies WHERE tablename IN ('spk_requests','spk_request_items');
