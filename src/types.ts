export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'user' | 'auditor' | 'spv' | 'direktur' | 'requester' | 'gudang_berkas';
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  nama_kategori: string;
  deskripsi: string | null;
  parent_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Kepemilikan {
  id: string;
  nama_pemilik: string;
  keterangan: string | null;
  created_at?: string;
}

export interface FlagDef {
  id: string;
  nama_flag: string;
  color: string;
  icon: string;
  created_at?: string;
}

export interface Item {
  id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string | null;
  kategori_id: string | null;
  kepemilikan_id?: string | null;
  sifat_barang?: 'PRIVATE' | 'OFFICE' | 'REUSABLE' | null;
  foto_urls: string[];
  deskripsi: string | null;
  kelengkapan_garansi?: boolean;
  dokumen_garansi_url?: string | null;
  kelengkapan_sertifikat?: boolean;
  dokumen_sertifikat_url?: string | null;
  kelengkapan_manual?: boolean;
  dokumen_manual_url?: string | null;
  kondisi_barang?: 'BAIK' | 'CUKUP BAIK' | 'RUSAK' | null;
  note_audit?: 'ADA' | 'TIDAK ADA' | null;
  tanggal_audit?: string | null;
  rfid_tag?: string | null;
  rfid_tag_2?: string | null;
  flags?: string[];
  created_at: string;
  updated_at: string;
  categories?: Category | null;
  master_kepemilikan?: Kepemilikan | null;
}

export interface Location {
  kode_lokasi: string;
  nama_lokasi: string;
  parent_kode_lokasi?: string | null;
  created_at?: string;
}

export interface StockKeluarHistory {
  id: string;
  original_item_id: string | null;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string | null;
  nama_lokasi: string | null;
  lokasi_keluar: string | null;
  foto_urls: string[];
  deskripsi: string | null;
  tanggal_keluar: string;
  keterangan_alasan: string;
  user_name: string | null;
  created_at: string;
}

export interface DisposalRequest {
  id: string;
  nomor_pengajuan: string;
  diajukan_oleh: string;
  user_id?: string;
  jumlah?: number;
  alasan?: string;
  metode_pemusnahan?: string | null;
  status: 'PENDING_AUDITOR' | 'PENDING_SPV' | 'PENDING_DIREKTUR' | 'APPROVED' | 'REJECTED';
  tanggal_pengajuan: string;
  diketahui_auditor_oleh?: string | null;
  tanggal_diketahui_auditor?: string | null;
  approved_by_l1: string | null;
  tanggal_approved_l1: string | null;
  approved_by_l2: string | null;
  tanggal_approved_l2: string | null;
  keterangan: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisposalRequestItem {
  id: string;
  request_id: string;
  item_id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string | null;
  kondisi_barang: string | null;
  foto_urls: string[];
  status_item: 'PENDING' | 'APPROVED' | 'REJECTED';
  alasan_rejection: string | null;
  created_at: string;
  items?: Item | null;
}

export interface SPKRequest {
  id: string;
  nomor_spk: string;
  diajukan_oleh: string;
  user_id?: string;
  jumlah?: number;
  keterangan?: string | null;
  lokasi_tujuan?: string | null;
  status: 'PENDING_ADMIN' | 'PENDING_AUDITOR' | 'PENDING_SPV' | 'APPROVED' | 'REJECTED';
  tanggal_pengajuan: string;
  diketahui_admin_oleh?: string | null;
  tanggal_diketahui_admin?: string | null;
  diketahui_auditor_oleh?: string | null;
  tanggal_diketahui_auditor?: string | null;
  approved_by_l1: string | null;
  tanggal_approved_l1: string | null;
  approved_by_l2: string | null;
  tanggal_approved_l2: string | null;
  created_at: string;
  updated_at: string;
}

export interface SPKRequestItem {
  id: string;
  request_id: string;
  item_id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string | null;
  kepemilikan_id: string | null;
  nama_kategori?: string | null;
  nama_lokasi?: string | null;
  foto_urls: string[];
  status_item: 'PENDING' | 'APPROVED' | 'REJECTED';
  alasan_rejection: string | null;
  created_at: string;
  items?: Item | null;
}

export interface GudangBerkasRequest {
  id: string;
  no_kunjungan: string;
  tanggal_kunjungan: string;
  waktu_mulai: string | null;
  waktu_selesai: string | null;
  divisi_pemohon: string | null;
  nama_pemohon: string;
  jabatan_pemohon: string | null;
  lokasi_gudang: 'Gudang Mergat' | 'Gudang Hasanuddin' | null;
  tujuan_kunjungan: string | null;
  tujuan_lainnya: string | null;
  jumlah_personil: number;
  pendamping_nama: string | null;
  pendamping_divisi: string | null;
  diketahui_oleh_nama: string | null;
  disetujui_oleh_nama: string | null;
  status: 'DIAJUKAN' | 'SELESAI';
  created_by?: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GudangBerkasRequestMember {
  id: string;
  request_id: string;
  no_urut: number;
  nama_lengkap: string;
  id_karyawan: string | null;
  jabatan: string | null;
  created_at: string;
}

export interface GudangBerkasRequestItem {
  id: string;
  request_id: string;
  no_urut: number;
  jenis_dokumen: string;
  tahun: string | null;
  nomor_dokumen: string | null;
  keterangan: string | null;
  created_at: string;
}

export interface GudangBerkasLogbook {
  id: string;
  request_id: string;
  tanggal_verifikasi: string | null;
  status_kunjungan: 'Masuk' | 'Keluar' | 'Periksa' | null;
  ga_verificator_id?: string | null;
  ga_verificator_name: string | null;
  keterangan: string | null;
  total_items: number;
  verified_items: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GudangBerkasLogbookItemCheck {
  id: string;
  logbook_id: string;
  request_item_id: string;
  is_verified: boolean;
  verification_status: 'PENDING' | 'VERIFIED' | 'TIDAK_SESUAI';
  verified_note: string | null;
  verified_at: string | null;
}

export interface AppSettings {
  id?: number;
  login_title: string;
  login_footer: string;
  login_bg_url: string;
  updated_at?: string;
}
