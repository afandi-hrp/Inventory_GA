import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../UI/Toast';
import { Save, Upload, Loader2, Image as ImageIcon, Layout, Type, MessageSquare } from 'lucide-react';

export default function LoginSettings() {
  const { settings, loading: settingsLoading, setSettings } = useSettings();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    login_title: '',
    login_footer: '',
    login_bg_url: '',
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        login_title: settings.login_title || '',
        login_footer: settings.login_footer || '',
        login_bg_url: settings.login_bg_url || '',
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({
          login_title: formData.login_title,
          login_footer: formData.login_footer,
          login_bg_url: formData.login_bg_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;

      setSettings({
        ...settings,
        ...formData,
      });
      showToast('Pengaturan berhasil disimpan', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan pengaturan', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `login-bg-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `settings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('item-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('item-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, login_bg_url: publicUrl }));
      showToast('File berhasil diunggah', 'success');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunggah file', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Pengaturan Tampilan Login</h1>
        <p className="text-gray-500">Sesuaikan tampilan halaman masuk aplikasi Anda</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Section */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <Type size={16} className="mr-2 text-blue-600" />
                  Judul Login
                </label>
                <input
                  type="text"
                  value={formData.login_title}
                  onChange={(e) => setFormData({ ...formData, login_title: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Contoh: Stock GA"
                  required
                />
              </div>

              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <MessageSquare size={16} className="mr-2 text-blue-600" />
                  Teks Footer
                </label>
                <input
                  type="text"
                  value={formData.login_footer}
                  onChange={(e) => setFormData({ ...formData, login_footer: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Contoh: © 2024 Stock GA"
                  required
                />
              </div>

              <div>
                <label className="flex items-center text-sm font-semibold text-gray-700 mb-2">
                  <ImageIcon size={16} className="mr-2 text-blue-600" />
                  Gambar Latar Belakang
                </label>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      value={formData.login_bg_url}
                      onChange={(e) => setFormData({ ...formData, login_bg_url: e.target.value })}
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                      placeholder="URL Gambar atau Unggah"
                    />
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl transition-colors flex items-center shrink-0">
                      {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                      <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">Gunakan URL gambar/video atau unggah file baru (Rekomendasi: 1920x1080px)</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </form>
        </div>

        {/* Preview Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center">
            <Layout size={16} className="mr-2" />
            Pratinjau Langsung
          </h3>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-gray-100 group">
            {formData.login_bg_url && (formData.login_bg_url.match(/\.(mp4|webm|ogg|mov)$|video/i) || formData.login_bg_url.includes('video')) ? (
              <video 
                src={formData.login_bg_url} 
                autoPlay 
                muted 
                loop 
                playsInline
                className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
              />
            ) : (
              <div 
                className="absolute inset-0 bg-cover bg-center transition-all duration-700"
                style={{ backgroundImage: `url(${formData.login_bg_url || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80'})` }}
              />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-6 text-center">
              <div className="text-white">
                <h4 className="text-2xl font-bold mb-2 break-words">{formData.login_title || 'Judul Anda'}</h4>
                <p className="text-sm opacity-80 break-words">{formData.login_footer || 'Teks footer anda'}</p>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-white font-medium uppercase tracking-widest">
              Live Preview
            </div>
          </div>
          <div className="bg-blue-500/10 backdrop-blur-md p-4 rounded-xl border border-blue-500/20">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Tips:</strong> Gunakan gambar dengan kontras yang baik agar teks tetap terbaca. Perubahan pada pratinjau bersifat sementara sampai Anda menekan tombol <strong>Simpan</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
