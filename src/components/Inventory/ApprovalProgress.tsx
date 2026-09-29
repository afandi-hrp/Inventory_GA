import React from 'react';
import { Check, X, AlertTriangle, Loader2, CheckSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { DisposalRequest, SPKRequest } from '../../types';

// UI & helper bersama halaman Persetujuan Pemusnahan & Persetujuan SPK:
// progress tahapan, tab filter status, konfirmasi + panggilan approval final.
// Semua data progress (siapa & kapan tiap tahap) diambil dari kolom yang sudah
// ada di tabel request, gak perlu query tambahan.

// Tahap yang "dimiliki" tiap role (tombol setujui/diketahui-nya cuma muncul di
// tahap ini). Dipakai juga oleh Approval.tsx. CATATAN: mapping serupa masih
// diduplikasi di Layout.tsx & Home.tsx (badge/notifikasi) — kalau alurnya
// berubah, update di sana juga.
export const DISPOSAL_STAGE_BY_ROLE: Record<string, string> = {
  auditor: 'PENDING_AUDITOR',
  spv: 'PENDING_SPV',
  direktur: 'PENDING_DIREKTUR',
};
export const SPK_STAGE_BY_ROLE: Record<string, string> = {
  admin: 'PENDING_ADMIN',
  auditor: 'PENDING_AUDITOR',
  spv: 'PENDING_SPV',
};

export type ApprovalFilter = 'ACTION' | 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export function matchesApprovalFilter(status: string, filter: ApprovalFilter, myStage?: string) {
  switch (filter) {
    case 'ACTION': return !!myStage && status === myStage;
    case 'PENDING': return status.startsWith('PENDING');
    case 'APPROVED': return status === 'APPROVED';
    case 'REJECTED': return status === 'REJECTED';
    default: return true;
  }
}

export function ApprovalFilterTabs({ statuses, myStage, value, onChange }: {
  statuses: string[];
  myStage?: string;
  value: ApprovalFilter;
  onChange: (filter: ApprovalFilter) => void;
}) {
  const tabs: { id: ApprovalFilter; label: string }[] = [
    ...(myStage ? [{ id: 'ACTION' as const, label: 'Perlu Tindakan Saya' }] : []),
    { id: 'ALL', label: 'Semua' },
    { id: 'PENDING', label: 'Dalam Proses' },
    { id: 'APPROVED', label: 'Disetujui' },
    { id: 'REJECTED', label: 'Ditolak' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(tab => {
        const count = statuses.filter(s => matchesApprovalFilter(s, tab.id, myStage)).length;
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors',
              active ? 'bg-brand-purple text-white border-brand-purple' : 'bg-white text-brand-purple border-brand-purple/20 hover:bg-brand-purple/5'
            )}
          >
            {tab.label}
            <span className={cn(
              'min-w-[22px] px-1.5 py-0.5 rounded-full text-[11px] leading-none text-center',
              active ? 'bg-white/20 text-white' : tab.id === 'ACTION' && count > 0 ? 'bg-red-500 text-white' : 'bg-brand-purple/10 text-brand-purple'
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Approval final dijalankan server dalam satu transaksi database (lihat
// POST /api/approval/finalize di api/index.ts) — bukan per barang dari browser.
export async function finalizeApproval(type: 'disposal' | 'spk', requestId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/approval/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ type, requestId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Gagal menyetujui final (${res.status})`);
  }
}

export function ConfirmFinalApprovalModal({ nomor, itemCount, approverLabel, submitting, onCancel, onConfirm }: {
  nomor: string;
  itemCount: number;
  approverLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-purple/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={submitting ? undefined : onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="font-bold text-brand-purple text-lg">Setujui Final ({approverLabel})?</h3>
              <p className="mt-2 text-sm text-brand-purple">
                Pengajuan <span className="font-semibold">{nomor}</span> akan disetujui final.{' '}
                <span className="font-semibold">{itemCount} barang</span> akan dikeluarkan dari Master Barang dan dicatat di Stock Out History.
              </p>
              <p className="mt-2 text-sm font-semibold text-red-600">Tindakan ini tidak bisa dibatalkan.</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <button onClick={onCancel} disabled={submitting} className="btn-cancel w-full sm:w-auto">
            Kembali
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
            Ya, Setujui Final
          </button>
        </div>
      </div>
    </div>
  );
}

// Parse alasan penolakan (JSON {alasan, rejectedBy, role} atau teks lama biasa).
export function parseRejection(reasonStr: string | null | undefined) {
  if (!reasonStr) return null;
  try {
    const parsed = JSON.parse(reasonStr);
    return { alasan: parsed.alasan || reasonStr, rejectedBy: parsed.rejectedBy || 'Sistem', role: parsed.role || '' };
  } catch {
    return { alasan: reasonStr, rejectedBy: 'Sistem', role: '' };
  }
}

// Banner alasan penolakan di detail pengajuan. Pakai alasan di level pengajuan
// (kolom alasan_penolakan); pengajuan lama yang belum punya kolom itu jatuh ke
// alasan item pertama yang ditolak.
export function RejectionBanner({ requestReason, itemReasons }: {
  requestReason?: string | null;
  itemReasons: (string | null | undefined)[];
}) {
  const info = parseRejection(requestReason) || parseRejection(itemReasons.find(Boolean));
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
      <div className="p-2 bg-red-100 text-red-600 rounded-xl shrink-0">
        <X size={18} strokeWidth={3} />
      </div>
      <div>
        <p className="font-bold text-red-700">Pengajuan Ditolak</p>
        {info ? (
          <>
            <p className="text-sm text-red-700 mt-0.5">
              Oleh <span className="font-semibold">{info.rejectedBy}</span>{info.role ? ` (${info.role})` : ''}
            </p>
            <p className="text-sm text-red-800 mt-1">"{info.alasan}"</p>
          </>
        ) : (
          <p className="text-sm text-red-700 mt-0.5">Alasan penolakan tidak tercatat.</p>
        )}
      </div>
    </div>
  );
}

export interface ApprovalStep {
  label: string;
  by?: string | null;
  at?: string | null;
}

export interface ApprovalProgressData {
  steps: ApprovalStep[];
  // Index tahap yang sedang berjalan (atau tempat ditolak). = steps.length kalau semua selesai.
  currentIndex: number;
  rejected: boolean;
}

type StepState = 'done' | 'current' | 'rejected' | 'pending';

function withCurrent(steps: ApprovalStep[], status: string, pendingIndex: Record<string, number>): ApprovalProgressData {
  if (status === 'APPROVED') return { steps, currentIndex: steps.length, rejected: false };
  if (status === 'REJECTED') {
    // Tahap tempat ditolak = tahap pertama (setelah "Diajukan") yang belum punya tanggal.
    const idx = steps.findIndex((s, i) => i > 0 && !s.at);
    return { steps, currentIndex: idx === -1 ? steps.length - 1 : idx, rejected: true };
  }
  return { steps, currentIndex: pendingIndex[status] ?? 1, rejected: false };
}

export function disposalProgress(r: DisposalRequest): ApprovalProgressData {
  return withCurrent([
    { label: 'Diajukan', by: r.diajukan_oleh, at: r.tanggal_pengajuan || r.created_at },
    { label: 'Diketahui Auditor', by: r.diketahui_auditor_oleh, at: r.tanggal_diketahui_auditor },
    { label: 'Disetujui SPV', by: r.approved_by_l1, at: r.tanggal_approved_l1 },
    { label: 'Disetujui Direktur', by: r.approved_by_l2, at: r.tanggal_approved_l2 },
  ], r.status, { PENDING_AUDITOR: 1, PENDING_SPV: 2, PENDING_DIREKTUR: 3 });
}

export function spkProgress(r: SPKRequest): ApprovalProgressData {
  return withCurrent([
    { label: 'Diajukan', by: r.diajukan_oleh, at: r.tanggal_pengajuan || r.created_at },
    { label: 'Diketahui Admin', by: r.diketahui_admin_oleh, at: r.tanggal_diketahui_admin },
    { label: 'Diketahui Auditor', by: r.diketahui_auditor_oleh, at: r.tanggal_diketahui_auditor },
    { label: 'Disetujui SPV', by: r.approved_by_l1, at: r.tanggal_approved_l1 },
  ], r.status, { PENDING_ADMIN: 1, PENDING_AUDITOR: 2, PENDING_SPV: 3 });
}

function stepStates({ steps, currentIndex, rejected }: ApprovalProgressData): StepState[] {
  return steps.map((_, i) =>
    i < currentIndex ? 'done' : i === currentIndex ? (rejected ? 'rejected' : 'current') : 'pending'
  );
}

const formatStepDate = (at: string) =>
  new Date(at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Versi ringkas untuk kolom Status di tabel daftar pengajuan.
export function ApprovalProgressCompact({ data }: { data: ApprovalProgressData }) {
  const states = stepStates(data);
  const total = data.steps.length;
  const doneCount = states.filter(s => s === 'done').length;
  // Nama tahap yang sedang ditunggu sudah tampil di badge status di atasnya,
  // jadi caption cukup angka progres.
  const caption = data.rejected
    ? `Berhenti di tahap ${data.currentIndex + 1} dari ${total}`
    : doneCount === total
      ? `Selesai · ${total}/${total} tahap`
      : `${doneCount} dari ${total} tahap selesai`;

  return (
    <div className="mt-2 w-44">
      <div className="flex gap-1">
        {states.map((state, i) => (
          <div
            key={i}
            title={data.steps[i].label}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              state === 'done' && 'bg-brand-purple',
              state === 'current' && 'bg-orange-400 animate-pulse',
              state === 'rejected' && 'bg-red-500',
              state === 'pending' && 'bg-brand-purple/15'
            )}
          />
        ))}
      </div>
      <p className={cn('mt-1 text-[11px] leading-tight', data.rejected ? 'text-red-600' : 'text-brand-purple/70')}>{caption}</p>
    </div>
  );
}

// Versi lengkap (stepper) untuk tampilan detail pengajuan.
export function ApprovalProgressStepper({ data }: { data: ApprovalProgressData }) {
  const states = stepStates(data);

  return (
    <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-lg border border-white/50 p-5">
      <h5 className="font-bold text-brand-purple mb-5">Progress Persetujuan</h5>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${data.steps.length}, minmax(0, 1fr))` }}>
        {data.steps.map((step, i) => {
          const state = states[i];
          return (
            <li key={step.label} className="relative flex flex-col items-center text-center px-1">
              {/* garis penghubung dari tahap sebelumnya ke tahap ini */}
              {i > 0 && (
                <div
                  className={cn(
                    'absolute top-4 right-1/2 w-full h-1 -translate-y-1/2 rounded-full',
                    state === 'pending' ? 'bg-brand-purple/15' : state === 'rejected' ? 'bg-red-300' : 'bg-brand-purple'
                  )}
                />
              )}
              <div
                className={cn(
                  'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  state === 'done' && 'bg-brand-purple text-white',
                  state === 'current' && 'bg-orange-500 text-white ring-4 ring-orange-200',
                  state === 'rejected' && 'bg-red-500 text-white ring-4 ring-red-100',
                  state === 'pending' && 'bg-white border-2 border-brand-purple/20 text-brand-purple/40'
                )}
              >
                {state === 'done' ? <Check size={16} strokeWidth={3} /> : state === 'rejected' ? <X size={16} strokeWidth={3} /> : i + 1}
              </div>
              <p className={cn('mt-2 text-xs font-bold', state === 'pending' ? 'text-brand-purple/50' : 'text-brand-purple')}>
                {step.label}
              </p>
              <p className={cn(
                'text-[11px] mt-0.5 break-words max-w-full',
                state === 'current' ? 'text-orange-600 font-semibold' : state === 'rejected' ? 'text-red-600 font-semibold' : 'text-brand-purple/80'
              )}>
                {state === 'done' ? (step.by || '-') : state === 'current' ? 'Menunggu' : state === 'rejected' ? 'Ditolak' : '-'}
              </p>
              {state === 'done' && step.at && (
                <p className="text-[10px] text-brand-purple/60">{formatStepDate(step.at)}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
