import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ClipboardList, FileWarning, ChevronRight } from 'lucide-react';
import { DisposalApprovalModal } from './DisposalApprovalModal';
import { SPKApprovalModal } from './SPKApprovalModal';

export default function Approval() {
  const { profile } = useAuth();
  const [pendingDisposalCount, setPendingDisposalCount] = useState(0);
  const [pendingSPKCount, setPendingSPKCount] = useState(0);
  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);
  const [isSPKModalOpen, setIsSPKModalOpen] = useState(false);

  useEffect(() => {
    fetchPendingApprovalCounts();
  }, [profile?.role]);

  async function fetchPendingApprovalCounts() {
    const role = profile?.role;
    if (!role) return;

    // Setiap role cuma "punya" satu tahap yang bisa dia proses di masing-masing
    // alur — hitung berapa pengajuan yang lagi nunggu tahap itu.
    const disposalStageByRole: Record<string, string> = {
      auditor: 'PENDING_AUDITOR',
      spv: 'PENDING_SPV',
      direktur: 'PENDING_DIREKTUR',
    };
    const spkStageByRole: Record<string, string> = {
      admin: 'PENDING_ADMIN',
      auditor: 'PENDING_AUDITOR',
      spv: 'PENDING_SPV',
    };

    try {
      const disposalStage = disposalStageByRole[role];
      if (disposalStage) {
        const { count } = await supabase
          .from('disposal_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', disposalStage);
        setPendingDisposalCount(count || 0);
      } else {
        setPendingDisposalCount(0);
      }

      const spkStage = spkStageByRole[role];
      if (spkStage) {
        const { count } = await supabase
          .from('spk_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', spkStage);
        setPendingSPKCount(count || 0);
      } else {
        setPendingSPKCount(0);
      }
    } catch (err) {
      console.error('Error fetching pending approval counts:', err);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-purple border-b-2 border-orange-500 pb-1 inline-block">Approval</h2>
        <p className="text-brand-purple">Tinjau &amp; proses pengajuan pemusnahan dan SPK yang menunggu persetujuan Anda</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => setIsDisposalModalOpen(true)}
          className="text-left bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 hover:shadow-xl hover:border-indigo-200 transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl">
              <FileWarning size={24} />
            </div>
            {pendingDisposalCount > 0 && (
              <span className="min-w-[28px] h-7 px-2 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full shadow-sm">
                {pendingDisposalCount > 99 ? '99+' : pendingDisposalCount}
              </span>
            )}
          </div>
          <h3 className="mt-4 text-lg font-bold text-brand-purple">Persetujuan Pemusnahan</h3>
          <p className="mt-1 text-sm text-brand-purple/70">Tinjau pengajuan pemusnahan barang rusak/cukup baik yang menunggu persetujuan Anda.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 group-hover:gap-2 transition-all">
            Buka daftar pengajuan <ChevronRight size={16} />
          </span>
        </button>

        <button
          onClick={() => setIsSPKModalOpen(true)}
          className="text-left bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/50 hover:shadow-xl hover:border-emerald-200 transition-all group"
        >
          <div className="flex items-start justify-between">
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
              <ClipboardList size={24} />
            </div>
            {pendingSPKCount > 0 && (
              <span className="min-w-[28px] h-7 px-2 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full shadow-sm">
                {pendingSPKCount > 99 ? '99+' : pendingSPKCount}
              </span>
            )}
          </div>
          <h3 className="mt-4 text-lg font-bold text-brand-purple">Persetujuan SPK</h3>
          <p className="mt-1 text-sm text-brand-purple/70">Tinjau pengajuan SPK pengambilan barang reusable yang menunggu persetujuan Anda.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
            Buka daftar pengajuan <ChevronRight size={16} />
          </span>
        </button>
      </div>

      <DisposalApprovalModal
        isOpen={isDisposalModalOpen}
        onClose={() => {
          setIsDisposalModalOpen(false);
          fetchPendingApprovalCounts();
        }}
        profile={profile}
      />
      <SPKApprovalModal
        isOpen={isSPKModalOpen}
        onClose={() => {
          setIsSPKModalOpen(false);
          fetchPendingApprovalCounts();
        }}
        profile={profile}
      />
    </div>
  );
}
