export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'user' | 'auditor' | 'spv' | 'direktur';
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

export interface Item {
  id: string;
  kode_barang: string;
  nama_barang: string;
  jumlah_barang: number;
  kode_lokasi: string | null;
  kategori_id: string | null;
  foto_urls: string[];
  deskripsi: string | null;
  kelengkapan_garansi?: boolean;
  dokumen_garansi_url?: string | null;
  kelengkapan_sertifikat?: boolean;
  dokumen_sertifikat_url?: string | null;
  kelengkapan_manual?: boolean;
  dokumen_manual_url?: string | null;
  kondisi_barang?: 'BAIK' | 'CUKUP BAIK' | 'RUSAK' | null;
  note_audit?: string | null;
  created_at: string;
  updated_at: string;
  categories?: Category | null;
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
  status: 'PENDING_L1' | 'PENDING_L2' | 'APPROVED' | 'REJECTED';
  tanggal_pengajuan: string;
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

export interface AppSettings {
  id?: number;
  login_title: string;
  login_footer: string;
  login_bg_url: string;
  updated_at?: string;
}
