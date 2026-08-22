import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useModalBackButton } from '../../hooks/useModalBackButton';
import { useToast } from '../UI/Toast';
import { 
  User as UserIcon, Mail, Shield, Key, Camera, 
  Loader2, Save, AlertCircle, CheckCircle2, UserPlus,
  Edit2, X
} from 'lucide-react';
import { Profile } from '../../types';
import SignedImage from '../UI/SignedImage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ManageUsers() {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Add User Modal State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  // Supaya tombol/gesture "Kembali" di mobile menutup modal, bukan keluar aplikasi
  useModalBackButton(isAddUserModalOpen, () => setIsAddUserModalOpen(false));
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'user' as 'admin' | 'user' | 'auditor' | 'spv' | 'direktur' | 'requester'
  });

  // Profile Edit State
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password Change State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchProfiles();
    } else if (profile) {
      setEditingProfile(profile);
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setLoading(false);
    }
  }, [profile]);

  async function fetchProfiles() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      showToast(err.message || 'Gagal mengambil data user', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (error) throw error;
      showToast('Profil berhasil diperbarui', 'success');
      if (profile?.role === 'admin') fetchProfiles();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui profil', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUserForm.password.length < 6) {
      showToast('Password minimal 6 karakter', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('No active session');

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newUserForm)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal membuat user');

      showToast('User berhasil dibuat', 'success');
      setIsAddUserModalOpen(false);
      setNewUserForm({ email: '', password: '', full_name: '', role: 'user' });
      fetchProfiles();
    } catch (err: any) {
      showToast(err.message || 'Gagal membuat user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('Password tidak cocok', 'error');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      showToast('Password berhasil diubah', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengubah password', 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Hanya file gambar (JPG/PNG/WEBP/GIF) yang diperbolehkan');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Ukuran foto terlalu besar (Maks 10MB)');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      
      // Auto update profile with new avatar
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      showToast('Foto profil berhasil diunggah', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunggah foto', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-purple">{profile?.role === 'admin' ? 'Manage Users & Profile' : 'Akun Saya'}</h1>
          <p className="text-brand-purple">
            {profile?.role === 'admin' 
              ? 'Kelola hak akses dan profil seluruh pengguna aplikasi' 
              : 'Kelola informasi profil dan keamanan akun Anda'}
          </p>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-8", profile?.role === 'requester' ? "max-w-4xl mx-auto" : "lg:grid-cols-3")}>
        {/* Profile Section */}
        <div className={cn(profile?.role === 'requester' ? "grid grid-cols-1 sm:grid-cols-2 gap-6" : "lg:col-span-1 space-y-6")}>
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <div className="p-6 border-b border-white/30 bg-white/20">
              <h3 className="font-bold text-brand-purple flex items-center">
                <UserIcon size={18} className="mr-2 text-blue-600" />
                Profil Saya
              </h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-gray-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <SignedImage bucket="item-photos" path={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={40} className="text-brand-purple" />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-2 rounded-full shadow-lg cursor-pointer hover:bg-blue-700 transition-colors group-hover:scale-110 transform duration-200">
                    {uploadingAvatar ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                  </label>
                </div>
                <div className="mt-4 text-center">
                  <p className="font-bold text-brand-purple">{profile?.full_name || 'User'}</p>
                  {profile?.role !== 'requester' && (
                    <p className="text-xs text-brand-purple uppercase tracking-widest font-bold mt-1">
                      <span className={cn(
                        "px-2 py-0.5 rounded",
                        profile?.role === 'admin' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-brand-purple"
                      )}>
                        {profile?.role}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Email</label>
                  <input
                    type="text"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-100 bg-gray-50 rounded-xl text-brand-purple text-sm cursor-not-allowed"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  <span>Simpan Profil</span>
                </button>
              </form>
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden">
            <div className="p-6 border-b border-white/30 bg-white/20">
              <h3 className="font-bold text-brand-purple flex items-center">
                <Key size={18} className="mr-2 text-orange-600" />
                Ganti Password
              </h3>
            </div>
            <form onSubmit={handleUpdatePassword} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Password Baru</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Konfirmasi Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {passwordLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                <span>Update Password</span>
              </button>
            </form>
          </div>
        </div>

        {/* User List Section (Admin Only) — disembunyikan sepenuhnya untuk requester */}
        {profile?.role !== 'requester' && (
        <div className="lg:col-span-2">
          {profile?.role === 'admin' ? (
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 overflow-hidden h-full flex flex-col">
              <div className="p-6 border-b border-white/30 bg-white/20 flex items-center justify-between">
                <h3 className="font-bold text-brand-purple flex items-center">
                  <Shield size={18} className="mr-2 text-emerald-600" />
                  Daftar Seluruh Pengguna
                </h3>
                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                  {profiles.length} Users
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left min-w-[480px]">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wider font-bold text-brand-purple border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Bergabung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {profiles.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 shrink-0">
                              {p.avatar_url ? (
                                <SignedImage bucket="item-photos" path={p.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <UserIcon size={14} className="text-brand-purple" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-brand-purple truncate">{p.full_name || 'No Name'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                            p.role === 'admin' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-brand-purple"
                          )}>
                            {p.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-brand-purple whitespace-nowrap">
                          {new Date(p.created_at).toLocaleDateString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <Shield size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-purple">Akses Terbatas</h3>
                <p className="text-sm text-brand-purple max-w-sm mt-2">
                  Sebagai pengguna dengan role <strong className="capitalize">{profile?.role || 'User'}</strong>, Anda hanya dapat mengelola profil dan keamanan akun Anda sendiri.
                </p>
              </div>
              <div className="pt-4 grid grid-cols-2 gap-4 w-full max-w-xs">
                <div className="bg-white/60 backdrop-blur-md p-3 rounded-xl border border-white/50 shadow-sm">
                  <p className="text-[10px] font-bold text-brand-purple uppercase">Inventory</p>
                  <p className="text-xs font-bold text-blue-600">View Only</p>
                </div>
                <div className="bg-white/60 backdrop-blur-md p-3 rounded-xl border border-white/50 shadow-sm">
                  <p className="text-[10px] font-bold text-brand-purple uppercase">Profile</p>
                  <p className="text-xs font-bold text-blue-600">Full Access</p>
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/30 flex items-center justify-between bg-white/20 shrink-0">
              <h3 className="text-lg font-bold text-brand-purple flex items-center">
                <UserPlus size={20} className="mr-2 text-blue-600" />
                Tambah User Baru
              </h3>
              <button onClick={() => setIsAddUserModalOpen(false)} className="text-brand-purple hover:text-brand-purple p-1 rounded-full hover:bg-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={newUserForm.full_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Nama Lengkap"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Min 6 karakter"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-purple uppercase tracking-wider mb-1">Role</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as 'admin' | 'user' | 'auditor' | 'spv' | 'direktur' | 'requester' })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                >
                  <option value="user">User (View Only)</option>
                  <option value="admin">Admin (Full Access)</option>
                  <option value="auditor">Auditor (Audit Only)</option>
                  <option value="spv">SPV (Level 1 Approval)</option>
                  <option value="direktur">Direktur (Level 2 Approval)</option>
                  <option value="requester">Requester (Ambil Barang Reusable)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-brand-purple hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  <span>Daftarkan User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
