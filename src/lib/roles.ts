import { Profile } from '../types';

// Nama role yang ditampilkan ke user (kode role mentah seperti "gudang_berkas"
// jangan tampil langsung di UI).
const ROLE_LABELS: Record<Profile['role'], string> = {
  admin: 'Admin',
  user: 'User',
  auditor: 'Auditor',
  spv: 'SPV',
  direktur: 'Direktur',
  requester: 'Pemohon Barang',
  gudang_berkas: 'Akses Gudang Berkas',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '-';
  return ROLE_LABELS[role as Profile['role']] || role;
}
