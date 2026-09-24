import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../UI/Toast';
import { Profile, SPKRequest, SPKRequestItem } from '../../types';
import { X, Loader2, CheckSquare, XCircle, ShoppingCart, Search, User, Calendar, MapPin, Eye, Download, Package, ClipboardList, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import SignedImage from '../UI/SignedImage';
import { getSignedUrl } from '../../lib/signedStorage';
import { jsPDF } from 'jspdf';

interface SPKApprovalPageProps {
  profile: Profile | null;
}

export function SPKApprovalPage({ profile }: SPKApprovalPageProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<SPKRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<SPKRequest | null>(null);
  const [requestItems, setRequestItems] = useState<SPKRequestItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isDetailView, setIsDetailView] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [rejectItemModal, setRejectItemModal] = useState<{ isOpen: boolean, itemId: string, reason: string }>({ isOpen: false, itemId: '', reason: '' });
  const [rejectFullModal, setRejectFullModal] = useState<{ isOpen: boolean, reason: string }>({ isOpen: false, reason: '' });
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewFileName, setPdfPreviewFileName] = useState('');

  const parseRejectionReason = (reasonStr: string | null) => {
    if (!reasonStr) return { alasan: '-', rejectedBy: 'Sistem', role: '' };
    try {
      const parsed = JSON.parse(reasonStr);
      return {
        alasan: parsed.alasan || reasonStr,
        rejectedBy: parsed.rejectedBy || 'Sistem',
        role: parsed.role || ''
      };
    } catch {
      return { alasan: reasonStr, rejectedBy: 'Sistem', role: '' };
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('spk_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err: any) {
      showToast('Gagal memuat data persetujuan SPK', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRequestItems(requestId: string) {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('spk_request_items')
        .select(`
          *,
          items (
            kepemilikan_id,
            kategori_id,
            master_lokasi ( nama_lokasi ),
            master_kepemilikan ( nama_pemilik ),
            categories ( nama_kategori ),
            foto_urls
          )
        `)
        .eq('request_id', requestId);

      if (error) throw error;
      setRequestItems(data || []);
    } catch (err: any) {
      showToast('Gagal memuat item SPK', 'error');
    } finally {
      setLoadingItems(false);
    }
  }

  const handleViewDetail = (req: SPKRequest) => {
    setSelectedRequest(req);
    setIsDetailView(true);
    fetchRequestItems(req.id);
  };

  const handleRejectItem = async (itemId: string, alasan: string) => {
    try {
      const rejectionData = JSON.stringify({
        alasan,
        rejectedBy: profile?.full_name || 'Unknown',
        role: profile?.role || 'Unknown'
      });

      const { data: updateResult, error } = await supabase
        .from('spk_request_items')
        .update({ status_item: 'REJECTED', alasan_rejection: rejectionData })
        .eq('id', itemId)
        .select('id');

      if (error) throw error;
      if (!updateResult || updateResult.length === 0) {
        throw new Error('Update gagal: kemungkinan Anda tidak memiliki izin (RLS) untuk mengubah item ini.');
      }

      const updatedItems = requestItems.map(item => item.id === itemId ? { ...item, status_item: 'REJECTED' as const, alasan_rejection: rejectionData } : item);
      setRequestItems(updatedItems);
      showToast('Item berhasil ditolak', 'success');

      const allRejected = updatedItems.every(item => item.status_item === 'REJECTED');
      if (allRejected && selectedRequest) {
        await supabase.from('spk_requests').update({ status: 'REJECTED' }).eq('id', selectedRequest.id);
        setSelectedRequest({ ...selectedRequest, status: 'REJECTED' });
        showToast('Semua item ditolak, status pengajuan otomatis menjadi ditolak.', 'info');
        fetchRequests();
      }
    } catch (err) {
      showToast('Gagal menolak item', 'error');
    }
  };

  const advanceStage = async (stage: 'ADMIN' | 'AUDITOR' | 'SPV') => {
    if (!selectedRequest) return;
    setIsSubmitting(true);
    try {
      const updateData: any = {};
      if (stage === 'ADMIN') {
        updateData.status = 'PENDING_AUDITOR';
        updateData.diketahui_admin_oleh = profile?.full_name || 'Admin';
        updateData.tanggal_diketahui_admin = new Date().toISOString();
      } else if (stage === 'AUDITOR') {
        updateData.status = 'PENDING_SPV';
        updateData.diketahui_auditor_oleh = profile?.full_name || 'Auditor';
        updateData.tanggal_diketahui_auditor = new Date().toISOString();
      } else {
        updateData.status = 'APPROVED';
        updateData.approved_by_l1 = profile?.full_name || 'SPV';
        updateData.tanggal_approved_l1 = new Date().toISOString();
      }

      const { data: updateResult, error } = await supabase
        .from('spk_requests')
        .update(updateData)
        .eq('id', selectedRequest.id)
        .select('id');

      if (error) throw error;
      if (!updateResult || updateResult.length === 0) {
        throw new Error('Update gagal: kemungkinan Anda tidak memiliki izin (RLS) untuk mengubah status ini.');
      }

      if (stage === 'SPV') {
        // Final approval: pindahkan item yang disetujui ke stock_keluar_history, hapus dari items.
        const approvedItems = requestItems.filter(i => i.status_item !== 'REJECTED');

        for (const item of approvedItems) {
          const { data: fullItem } = await supabase.from('items').select('*').eq('id', item.item_id).single();

          const { error: histError } = await supabase.from('stock_keluar_history').insert({
            original_item_id: item.item_id,
            kode_barang: item.kode_barang,
            nama_barang: item.nama_barang,
            jumlah_barang: item.jumlah_barang,
            kode_lokasi: item.kode_lokasi,
            nama_lokasi: fullItem?.lokasi || null,
            lokasi_keluar: `SPK Pengambilan - ${selectedRequest.nomor_spk}`,
            foto_urls: fullItem?.foto_urls || item.foto_urls || [],
            deskripsi: fullItem?.deskripsi || '',
            keterangan_alasan: `SPK No: ${selectedRequest.nomor_spk} - ${selectedRequest.keterangan || '-'}`,
            tanggal_keluar: new Date().toISOString(),
            user_name: profile?.full_name
          });

          if (!histError) {
            await supabase.from('spk_request_items')
              .update({ status_item: 'APPROVED' })
              .eq('id', item.id);

            // Putuskan relasi FK di seluruh spk_request_items sebelum item dihapus
            const { error: updError } = await supabase.from('spk_request_items')
              .update({ item_id: null })
              .eq('item_id', item.item_id);

            if (updError) {
              console.error('Error nullifying item_id in spk_request_items:', updError);
              throw new Error(`Gagal memutuskan relasi item: ${updError.message}`);
            }

            // Hapus item asli lewat backend (bypass RLS untuk role non-admin seperti spv/direktur)
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;

            const delRes = await fetch(`/api/inventory/delete-item/${item.item_id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (!delRes.ok) {
              const errData = await delRes.json().catch(() => ({}));
              console.error('Error deleting item from items table via API:', errData);
              throw new Error(`Gagal menghapus item dari master barang: ${errData.error || delRes.statusText}`);
            }
          } else {
            console.error('Error inserting to history:', histError);
            throw new Error(`Gagal mencatat riwayat pengambilan: ${histError.message || 'Izin (RLS) ditolak'}`);
          }
        }
      }

      showToast(
        stage === 'ADMIN' ? 'Ditandai diketahui Admin!' :
        stage === 'AUDITOR' ? 'Ditandai diketahui Auditor!' : 'Disetujui Final oleh SPV!',
        'success'
      );
      setIsDetailView(false);
      fetchRequests();
    } catch (err: any) {
      console.error('Approve SPK Error:', err);
      showToast(err.message || 'Gagal memproses persetujuan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rejectFullRequest = async (alasan: string) => {
    if (!selectedRequest) return;
    setIsSubmitting(true);
    try {
      const rejectionData = JSON.stringify({
        alasan,
        rejectedBy: profile?.full_name || 'Unknown',
        role: profile?.role || 'Unknown'
      });

      const { data: reqUpdateResult, error: reqError } = await supabase
        .from('spk_requests')
        .update({ status: 'REJECTED' })
        .eq('id', selectedRequest.id)
        .select('id');

      if (reqError) throw reqError;
      if (!reqUpdateResult || reqUpdateResult.length === 0) {
        throw new Error('Update gagal: kemungkinan Anda tidak memiliki izin (RLS) untuk menolak pengajuan ini.');
      }

      const pendingItems = requestItems.filter(i => i.status_item !== 'REJECTED');
      if (pendingItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('spk_request_items')
          .update({ status_item: 'REJECTED', alasan_rejection: rejectionData })
          .in('id', pendingItems.map(i => i.id));

        if (itemsError) console.error('Failed to update items to rejected:', itemsError);
      }

      showToast('Pengajuan SPK ditolak sepenuhnya', 'success');
      setIsDetailView(false);
      fetchRequests();
    } catch (err: any) {
      showToast('Gagal menolak pengajuan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBase64ImageFromUrl = async (imageUrl: string) => {
    try {
      const signedUrl = await getSignedUrl('item-photos', imageUrl);
      if (!signedUrl) return null;
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  };

  const generatePDFPreview = async () => {
    if (!selectedRequest) return;

    setIsSubmitting(true);
    showToast('Sedang menyiapkan dokumen...', 'info');

    try {
      const doc = new jsPDF();

      const itemsToPrint = requestItems.filter(i => i.status_item !== 'REJECTED');

      if (itemsToPrint.length === 0) {
        showToast('Tidak ada item yang disetujui untuk dicetak', 'error');
        setIsSubmitting(false);
        return;
      }

      const addLogo = async (doc: jsPDF, x: number, y: number) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const imgWidth = img.width;
            const imgHeight = img.height;
            canvas.width = imgWidth;
            canvas.height = imgHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, imgWidth, imgHeight);
              ctx.drawImage(img, 0, 0, imgWidth, imgHeight);
              const dataUrl = canvas.toDataURL('image/png', 1.0);
              const pdfHeight = 16;
              const pdfWidth = (imgWidth / imgHeight) * pdfHeight;
              doc.addImage(dataUrl, 'PNG', x, y, pdfWidth, pdfHeight);
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = '/logo-full.png';
        });
      };

      let currentY = 20;
      const lineSpacing = 8;
      const pageHeight = doc.internal.pageSize.getHeight();

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > pageHeight - 20) {
          doc.addPage();
          currentY = 20;
          return true;
        }
        return false;
      };

      for (let i = 0; i < itemsToPrint.length; i++) {
        if (i > 0) {
          doc.addPage();
        }

        currentY = 20;

        const item = itemsToPrint[i];

        await addLogo(doc, 14, 14);
        currentY = 55;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('SURAT JALAN', 105, currentY, { align: 'center' });
        currentY += 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nomor Permintaan : ${selectedRequest.nomor_spk}`, 105, currentY, { align: 'center' });
        currentY += 18;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');

        const kategoriName = item.nama_kategori || (item as any).items?.categories?.nama_kategori || 'Tanpa Kategori';
        const lokasiName = item.nama_lokasi || (item as any).items?.master_lokasi?.nama_lokasi || item.kode_lokasi || 'Tanpa Lokasi';

        doc.text('Kode Barang', 14, currentY);
        doc.text(`: ${item.kode_barang}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Kategori Barang', 14, currentY);
        doc.text(`: ${kategoriName}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Lokasi Barang', 14, currentY);
        doc.text(`: ${lokasiName}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Nama Barang', 14, currentY);
        doc.text(`: ${item.nama_barang}`, 65, currentY);
        currentY += lineSpacing;

        doc.text('Lokasi Tujuan', 14, currentY);
        doc.text(`: ${selectedRequest.lokasi_tujuan || '-'}`, 65, currentY, { maxWidth: 130 });
        currentY += lineSpacing;

        doc.text('Alasan Penggunaan', 14, currentY);
        doc.text(`: ${selectedRequest.keterangan || '-'}`, 65, currentY, { maxWidth: 130 });
        currentY += lineSpacing * 2;

        doc.text('Tanggal Permintaan', 14, currentY);
        doc.text(`: ${new Date(selectedRequest.tanggal_pengajuan || selectedRequest.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`, 65, currentY);
        currentY += lineSpacing * 3;

        doc.text('Dokumentasi Barang', 14, currentY);
        doc.text(':', 65, currentY);

        currentY += lineSpacing;

        const photoUrls = item.foto_urls && item.foto_urls.length > 0 ? item.foto_urls : ((item as any).items?.foto_urls || []);
        if (photoUrls && photoUrls.length > 0) {
          try {
            let photoSize = 40;
            let maxPerRow = 4;

            if (photoUrls.length > 8) {
              photoSize = 20;
              maxPerRow = 7;
            } else if (photoUrls.length > 3) {
              photoSize = 30;
              maxPerRow = 5;
            }

            const photoGap = 5;
            let currentPhotoX = 14;

            for (let i = 0; i < photoUrls.length; i++) {
              if (i > 0 && i % maxPerRow === 0) {
                currentPhotoX = 14;
                currentY += photoSize + photoGap;
                checkPageBreak(photoSize + photoGap);
              }
              const base64Img = await getBase64ImageFromUrl(photoUrls[i]);
              if (base64Img) {
                doc.addImage(base64Img as string, 'JPEG', currentPhotoX, currentY, photoSize, photoSize);
                currentPhotoX += photoSize + photoGap;
              }
            }
            currentY += photoSize + photoGap;
          } catch (e) {
            doc.text('(Gagal memuat beberapa foto)', 14, currentY + 5);
            currentY += lineSpacing;
          }
        } else {
          doc.text('(Tidak ada foto)', 14, currentY);
          currentY += lineSpacing;
        }

        checkPageBreak(60);
        currentY += 25;

        const currentDate = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`Medan, ${currentDate}`, 14, currentY);

        currentY += 20;

        doc.setFontSize(9);
        doc.text('Yang mengajukan', 14, currentY);
        doc.text('Diketahui Admin,', 62, currentY);
        doc.text('Diketahui Auditor,', 108, currentY);
        doc.text('Disetujui SPV,', 155, currentY);
        doc.setFontSize(11);

        currentY += 25;

        doc.setFontSize(8);
        doc.text(`(${selectedRequest.diajukan_oleh})`, 14, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.diketahui_admin_oleh || '..................'})`, 62, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.diketahui_auditor_oleh || '..................'})`, 108, currentY, { maxWidth: 44 });
        doc.text(`(${selectedRequest.approved_by_l1 || '..................'})`, 155, currentY, { maxWidth: 40 });
        doc.setFontSize(11);
      }

      const fileName = `SPK_${selectedRequest.nomor_spk}.pdf`;
      setPdfPreviewFileName(fileName);
      setPdfPreviewUrl(doc.output('bloburl') as unknown as string);
    } catch (e) {
      showToast('Terjadi kesalahan saat membuat PDF', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  function closePdfPreview() {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
  }

  const filteredRequests = requests.filter(req =>
    req.nomor_spk.toLowerCase().includes(search.toLowerCase()) ||
    req.diajukan_oleh.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block">Persetujuan SPK Pengambilan Barang</h2>
        <p className="text-brand-purple">Tinjau &amp; proses pengajuan SPK pengambilan barang reusable yang menunggu persetujuan Anda</p>
      </div>

      {!isDetailView && (
        <>
          {/* Panel Filter */}
          <div className="bg-white/60 backdrop-blur-xl p-3 rounded-2xl shadow-lg border border-white/50 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-purple" size={16} />
              <input
                type="text"
                placeholder="Cari nomor SPK atau nama pemohon..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-brand-purple/20 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm bg-white shadow-sm"
              />
            </div>
            <button
              onClick={() => navigate('/approval')}
              className="sm:ml-auto flex items-center justify-center gap-2 px-4 py-2 bg-brand-purple hover:bg-brand-purple-light text-white rounded-lg text-sm font-semibold shadow-sm transition-colors shrink-0"
            >
              <ArrowLeft size={16} /> Kembali ke Approval
            </button>
          </div>

          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/80 sticky top-0 backdrop-blur-sm z-10">
                    <tr className="text-xs font-semibold text-brand-purple uppercase tracking-wider border-b border-gray-100">
                      <th className="px-6 py-4">Nomor SPK</th>
                      <th className="px-6 py-4">Diajukan Oleh</th>
                      <th className="px-6 py-4">Tanggal</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
                          <p className="text-brand-purple">Memuat data...</p>
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center">
                          <ClipboardList className="mx-auto text-brand-purple mb-2" size={48} />
                          <p className="text-brand-purple">Belum ada pengajuan SPK.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-sky-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-brand-purple">{req.nomor_spk}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-brand-purple">
                              <User size={14} className="mr-1.5 text-brand-purple" />
                              {req.diajukan_oleh}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-brand-purple">
                              <Calendar size={14} className="mr-1.5 text-brand-purple" />
                              {new Date(req.tanggal_pengajuan || req.created_at).toLocaleDateString('id-ID')}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border",
                              req.status === 'PENDING_ADMIN' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              req.status === 'PENDING_AUDITOR' ? "bg-amber-50 text-amber-700 border-amber-200" :
                              req.status === 'PENDING_SPV' ? "bg-blue-50 text-blue-700 border-blue-200" :
                              req.status === 'APPROVED' ? "bg-green-50 text-green-700 border-green-200" :
                              "bg-red-50 text-red-700 border-red-200"
                            )}>
                              {req.status === 'PENDING_ADMIN' ? 'Menunggu Diketahui Admin' :
                               req.status === 'PENDING_AUDITOR' ? 'Menunggu Diketahui Auditor' :
                               req.status === 'PENDING_SPV' ? 'Menunggu Persetujuan SPV' :
                               req.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleViewDetail(req)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-lg text-sm font-medium transition-colors border border-sky-100"
                            >
                              <Eye size={16} />
                              <span>Detail</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && filteredRequests.length > 0 && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-brand-purple">
                      Menampilkan <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> sampai <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredRequests.length)}</span> dari <span className="font-medium">{filteredRequests.length}</span> pengajuan
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-brand-purple">Per halaman:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1); }}
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-brand-purple outline-none"
                      >
                        {[10, 20, 50, 100].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={cn(
                              "w-8 h-8 text-sm font-medium rounded-lg transition-colors",
                              currentPage === pageNum ? "bg-brand-purple text-white" : "text-brand-purple hover:bg-gray-100"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-brand-purple hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
          </div>
        </>
      )}

      {isDetailView && selectedRequest && (
        <div className="space-y-6">
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <button
                onClick={() => setIsDetailView(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg shadow-sm transition-colors mb-3"
              >
                <ArrowLeft size={16} /> Kembali ke Daftar
              </button>
              <h4 className="text-xl font-bold text-brand-purple mb-2">Detail Pengajuan: {selectedRequest.nomor_spk}</h4>
              <div className="flex flex-wrap gap-4 text-sm text-brand-purple">
                <span className="flex items-center"><User size={14} className="mr-1.5 text-brand-purple" /> Pemohon: {selectedRequest.diajukan_oleh}</span>
                <span className="flex items-center"><Calendar size={14} className="mr-1.5 text-brand-purple" /> Tanggal: {new Date(selectedRequest.created_at).toLocaleDateString('id-ID')}</span>
              </div>
              <div className="mt-4 p-3 bg-white border rounded-xl shadow-sm">
                <span className="text-xs font-semibold text-brand-purple uppercase">Lokasi Tujuan</span>
                <p className="text-sm font-medium text-brand-purple mt-1">{selectedRequest.lokasi_tujuan || 'Tidak ada lokasi tujuan'}</p>
              </div>
              <div className="mt-3 p-3 bg-white border rounded-xl shadow-sm">
                <span className="text-xs font-semibold text-brand-purple uppercase">Keterangan</span>
                <p className="text-sm font-medium text-brand-purple mt-1">{selectedRequest.keterangan || 'Tidak ada keterangan'}</p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <span className={cn(
                "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border shadow-sm",
                selectedRequest.status === 'PENDING_ADMIN' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                selectedRequest.status === 'PENDING_AUDITOR' ? "bg-amber-50 text-amber-700 border-amber-200" :
                selectedRequest.status === 'PENDING_SPV' ? "bg-blue-50 text-blue-700 border-blue-200" :
                selectedRequest.status === 'APPROVED' ? "bg-green-50 text-green-700 border-green-200" :
                "bg-red-50 text-red-700 border-red-200"
              )}>
                {selectedRequest.status === 'PENDING_ADMIN' ? 'Status: Menunggu Diketahui Admin' :
                 selectedRequest.status === 'PENDING_AUDITOR' ? 'Status: Menunggu Diketahui Auditor' :
                 selectedRequest.status === 'PENDING_SPV' ? 'Status: Menunggu Persetujuan SPV (Final)' :
                 selectedRequest.status === 'APPROVED' ? 'Status: Selesai Disetujui' : 'Status: Ditolak'}
              </span>

              {(selectedRequest.status === 'APPROVED' || selectedRequest.status === 'PENDING_SPV') && (
                <button
                  onClick={generatePDFPreview}
                  disabled={isSubmitting}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-brand-purple rounded-xl shadow-sm text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  <span>Preview SPK (PDF)</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h5 className="font-bold text-brand-purple mb-4 flex items-center">
              <Package className="mr-2 text-sky-500" size={18} />
              Daftar Barang ({requestItems.length})
            </h5>

            {loadingItems ? (
              <div className="py-12 text-center">
                <Loader2 className="animate-spin mx-auto text-sky-600 mb-2" size={32} />
                <p className="text-brand-purple">Memuat barang...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requestItems.map(item => (
                  <div key={item.id} className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center bg-white shadow-sm hover:shadow-md transition-shadow">
                    {item.foto_urls && item.foto_urls.length > 0 ? (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                        <SignedImage bucket="item-photos" path={item.foto_urls[0]} alt={item.nama_barang} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        <Package className="text-brand-purple" size={24} />
                      </div>
                    )}

                    <div className="flex-1">
                      <h6 className="font-bold text-brand-purple text-base">{item.nama_barang}</h6>
                      <div className="text-sm text-brand-purple font-mono mt-0.5">{item.kode_barang}</div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-medium">
                        <span className="flex items-center bg-gray-100 text-brand-purple px-2 py-1 rounded-md">
                          <MapPin size={12} className="mr-1" />
                          {(item as any).items?.master_lokasi?.nama_lokasi || item.kode_lokasi || 'Tanpa Lokasi'}
                        </span>
                        <span className="bg-sky-50 text-sky-700 border border-sky-100 px-2 py-1 rounded-md">
                          {(item as any).items?.master_kepemilikan?.nama_pemilik || 'Tanpa Kepemilikan'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto">
                      {item.status_item === 'REJECTED' ? (
                        <div className="flex flex-col items-end text-right">
                          <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center mb-1">
                            <XCircle size={14} className="mr-1.5" />
                            Item Ditolak
                          </div>
                          <div className="text-[11px] text-brand-purple max-w-[200px]">
                            <span className="font-semibold text-brand-purple block mb-0.5">Oleh: {parseRejectionReason(item.alasan_rejection).rejectedBy} {parseRejectionReason(item.alasan_rejection).role ? `(${parseRejectionReason(item.alasan_rejection).role})` : ''}</span>
                            "{parseRejectionReason(item.alasan_rejection).alasan}"
                          </div>
                        </div>
                      ) : (
                        <span className="text-green-600 font-semibold text-sm flex items-center">
                          <CheckSquare size={14} className="mr-1" />
                          Termasuk
                        </span>
                      )}

                      {/* Reject Item button — cuma di tahap approval SPV (final), tidak di tahap "diketahui" Admin/Auditor */}
                      {selectedRequest.status === 'PENDING_SPV' && profile?.role === 'spv' &&
                       item.status_item !== 'REJECTED' && (
                        <button
                          onClick={() => {
                            setRejectItemModal({ isOpen: true, itemId: item.id, reason: '' });
                          }}
                          className="px-3 py-1.5 mt-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          Batalkan Item
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-brand-purple">
              {selectedRequest.status === 'PENDING_ADMIN' && 'Perlu ditandai diketahui oleh Admin.'}
              {selectedRequest.status === 'PENDING_AUDITOR' && 'Perlu ditandai diketahui oleh Auditor.'}
              {selectedRequest.status === 'PENDING_SPV' && 'Persetujuan SPV (Final) diperlukan.'}
              {selectedRequest.status === 'APPROVED' && 'Pengajuan telah selesai.'}
              {selectedRequest.status === 'REJECTED' && 'Pengajuan telah ditolak.'}
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              {selectedRequest.status === 'PENDING_SPV' && profile?.role === 'spv' && (
                <button
                  onClick={() => setRejectFullModal({ isOpen: true, reason: '' })}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-4 py-2.5 text-sm font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Tolak Semua
                </button>
              )}

              {selectedRequest.status === 'PENDING_ADMIN' && profile?.role === 'admin' && (
                <button
                  onClick={() => advanceStage('ADMIN')}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckSquare size={18} />}
                  <span>Tandai Diketahui (Admin)</span>
                </button>
              )}

              {selectedRequest.status === 'PENDING_AUDITOR' && profile?.role === 'auditor' && (
                <button
                  onClick={() => advanceStage('AUDITOR')}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckSquare size={18} />}
                  <span>Tandai Diketahui (Auditor)</span>
                </button>
              )}

              {selectedRequest.status === 'PENDING_SPV' && profile?.role === 'spv' && (
                <button
                  onClick={() => advanceStage('SPV')}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckSquare size={18} />}
                  <span>Setujui Final (SPV)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Item Modal */}
      {rejectItemModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setRejectItemModal({ isOpen: false, itemId: '', reason: '' })}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-brand-purple">Batalkan Item</h3>
              <button onClick={() => setRejectItemModal({ isOpen: false, itemId: '', reason: '' })} className="text-brand-purple hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-brand-purple mb-2">Alasan Penolakan</label>
              <textarea
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                rows={3}
                placeholder="Masukkan alasan penolakan untuk item ini..."
                value={rejectItemModal.reason}
                onChange={(e) => setRejectItemModal({ ...rejectItemModal, reason: e.target.value })}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setRejectItemModal({ isOpen: false, itemId: '', reason: '' })}
                className="btn-cancel"
              >
                Kembali
              </button>
              <button
                onClick={() => {
                  if (rejectItemModal.reason.trim()) {
                    handleRejectItem(rejectItemModal.itemId, rejectItemModal.reason);
                    setRejectItemModal({ isOpen: false, itemId: '', reason: '' });
                  }
                }}
                disabled={!rejectItemModal.reason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Konfirmasi Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Full Request Modal */}
      {rejectFullModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setRejectFullModal({ isOpen: false, reason: '' })}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-brand-purple">Tolak Semua Pengajuan</h3>
              <button onClick={() => setRejectFullModal({ isOpen: false, reason: '' })} className="text-brand-purple hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-brand-purple mb-2">Alasan Penolakan</label>
              <textarea
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                rows={3}
                placeholder="Masukkan alasan penolakan untuk semua item ini..."
                value={rejectFullModal.reason}
                onChange={(e) => setRejectFullModal({ ...rejectFullModal, reason: e.target.value })}
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setRejectFullModal({ isOpen: false, reason: '' })}
                className="btn-cancel"
              >
                Kembali
              </button>
              <button
                onClick={() => {
                  if (rejectFullModal.reason.trim()) {
                    rejectFullRequest(rejectFullModal.reason);
                    setRejectFullModal({ isOpen: false, reason: '' });
                  }
                }}
                disabled={!rejectFullModal.reason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Konfirmasi Tolak Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={closePdfPreview}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-brand-purple">Preview Surat Jalan SPK</h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewUrl}
                  download={pdfPreviewFileName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-brand-purple bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                >
                  <Download size={15} /> Unduh
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const win = window.open(pdfPreviewUrl, '_blank');
                    win?.addEventListener('load', () => win.print());
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-brand-purple hover:bg-brand-purple-light rounded-lg transition-colors"
                >
                  <Printer size={15} /> Cetak
                </button>
                <button onClick={closePdfPreview} className="p-2 text-brand-purple hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title="Preview PDF" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
