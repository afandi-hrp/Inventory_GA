import React, { useEffect } from 'react';
import {
  Package, Barcode, Tag, ClipboardCheck, Laptop, Armchair, Printer, QrCode, Boxes, Monitor,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Adegan "Gudang Hidup" di halaman login — pengganti video motion logo lama
// (/motion-logo-*.mp4, filenya masih disimpan di public/ sebagai cadangan).
// Semua gerakan pakai CSS keyframes di index.css (class `ls-*`), SVG murni,
// warna dari token brand. Urutan intro:
//   0.0–0.9s  grid lantai, rak tumbuh, conveyor & petugas muncul
//   0.6–1.6s  kardus/aset masuk ke rak atas & bawah satu per satu
//   1.3–1.85s papan nama "Inventory & Asset Center" terpasang di rak tengah
//   1.5–1.85s petugas mengangkat scanner
//   1.9–2.7s  sinar scanner menyapu rak, tiap barang dapat tag ✓
// lalu kartu login muncul (onIntroDone). Setelahnya cuma loop halus:
// conveyor jalan, scan ulang tiap 6 detik, petugas "bernapas", ikon melayang.
export const INTRO_MS = 2900;

const SIGN_AT = 1.3;
const ARM_AT = 1.5;
const SCAN_START = 1.9;
const SCAN_DUR = 0.8;
// Titik x garis scan di awal & akhir sapuan — harus sama dengan keyframe
// ls-sweep / ls-sweep-loop di index.css.
const SCAN_FROM = 90;
const SCAN_TO = 550;

// Ujung scanner di tangan petugas (sumber sinar). Kerucut sinar digambar
// dari sini ke x = SCAN_FROM, lalu di-scaleX dari titik ini supaya ujung
// jauhnya ikut garis scan sampai SCAN_TO.
const TIP_X = 26;
const TIP_Y = 263;
const CONE_SCALE = (SCAN_TO - TIP_X) / (SCAN_FROM - TIP_X);

// Papan rak (y = permukaan atas papan). Barang berdiri di atasnya.
const SHELF_TOPS = [150, 280, 410];

type Item = { kind: 'box' | 'monitor' | 'chair'; x: number; w: number; h: number; shelf: 0 | 2; order: number };

// Rak tengah dipakai papan nama; rak atas & bawah isi kardus + 1 aset kantor.
// order = urutan jatuh (rak bawah dulu, lalu atas).
const ITEMS: Item[] = [
  { kind: 'box', x: 122, w: 112, h: 78, shelf: 0, order: 3 },
  { kind: 'monitor', x: 262, w: 110, h: 82, shelf: 0, order: 4 },
  { kind: 'box', x: 400, w: 118, h: 86, shelf: 0, order: 5 },
  { kind: 'box', x: 120, w: 120, h: 92, shelf: 2, order: 0 },
  { kind: 'chair', x: 268, w: 94, h: 110, shelf: 2, order: 1 },
  { kind: 'box', x: 394, w: 124, h: 98, shelf: 2, order: 2 },
];

const dropDelay = (order: number) => 0.6 + order * 0.1;
const tagDelay = (cx: number) => SCAN_START + ((cx - SCAN_FROM) / (SCAN_TO - SCAN_FROM)) * SCAN_DUR;

// Ikon aset melayang di latar (posisi dalam % layar).
const FLOATERS = [
  { Icon: Package, top: '8%', left: '6%', size: 44, dur: 7 },
  { Icon: Barcode, top: '18%', left: '44%', size: 38, dur: 8 },
  { Icon: Tag, top: '72%', left: '8%', size: 34, dur: 6.5 },
  { Icon: ClipboardCheck, top: '84%', left: '38%', size: 40, dur: 9 },
  { Icon: Laptop, top: '10%', left: '82%', size: 46, dur: 7.5 },
  { Icon: Armchair, top: '80%', left: '88%', size: 42, dur: 8.5 },
  { Icon: Printer, top: '46%', left: '3%', size: 36, dur: 9.5 },
  { Icon: QrCode, top: '52%', left: '94%', size: 34, dur: 6 },
  { Icon: Boxes, top: '4%', left: '62%', size: 36, dur: 8 },
  { Icon: Monitor, top: '90%', left: '64%', size: 38, dur: 7 },
];

const PURPLE = 'var(--color-brand-purple)';
const PURPLE_LIGHT = 'var(--color-brand-purple-light)';
const CREAM = 'var(--color-brand-cream)';
const CORAL = 'var(--color-brand-coral)';
const SKIN = '#E8B08A';

const delay = (s: number): React.CSSProperties => ({ animationDelay: `${s}s` });

function CardboardBox({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={CREAM} stroke={PURPLE} strokeWidth={2.5} />
      {/* bayangan sisi kanan biar kardusnya kerasa bervolume */}
      <rect x={x + w - 14} y={y + 1.5} width={12.5} height={h - 3} rx={2} fill={CORAL} opacity={0.28} />
      {/* garis tutup kardus */}
      <line x1={x} y1={y + 14} x2={x + w} y2={y + 14} stroke={PURPLE} strokeWidth={1.5} opacity={0.35} />
      {/* lakban tengah */}
      <rect x={cx - 7} y={y} width={14} height={Math.min(34, h * 0.45)} fill={CORAL} opacity={0.85} />
      {/* label barcode */}
      <rect x={x + 10} y={y + h - 28} width={40} height={20} rx={2} fill="#fff" stroke={PURPLE} strokeWidth={1.2} />
      {[0, 5, 8, 13, 17, 22, 26].map((dx, i) => (
        <line
          key={dx}
          x1={x + 15 + dx} y1={y + h - 24} x2={x + 15 + dx} y2={y + h - 12}
          stroke={PURPLE} strokeWidth={i % 3 === 0 ? 2 : 1.1}
        />
      ))}
    </>
  );
}

function MonitorAsset({ x, y, w }: { x: number; y: number; w: number }) {
  const cx = x + w / 2;
  return (
    <>
      <rect x={x} y={y} width={w} height={66} rx={6} fill={PURPLE} />
      <rect x={x + 6} y={y + 6} width={w - 12} height={50} rx={3} fill={CREAM} />
      {/* mini chart dashboard di layar */}
      {[18, 30, 24, 38, 32].map((bh, i) => (
        <rect key={i} x={x + 16 + i * 16} y={y + 50 - bh} width={9} height={bh} rx={2} fill={i === 3 ? PURPLE_LIGHT : CORAL} />
      ))}
      <rect x={cx - 6} y={y + 66} width={12} height={10} fill={PURPLE_LIGHT} />
      <rect x={cx - 24} y={y + 76} width={48} height={6} rx={3} fill={PURPLE} />
    </>
  );
}

function ChairAsset({ x, y, w }: { x: number; y: number; w: number }) {
  const cx = x + w / 2;
  return (
    <>
      <rect x={cx - 34} y={y} width={68} height={54} rx={14} fill={CORAL} stroke={PURPLE} strokeWidth={2.5} />
      <rect x={cx - 22} y={y + 12} width={44} height={4} rx={2} fill={CREAM} opacity={0.7} />
      <rect x={cx - 5} y={y + 54} width={10} height={8} fill={PURPLE} />
      <rect x={x} y={y + 62} width={w} height={14} rx={7} fill={CORAL} stroke={PURPLE} strokeWidth={2.5} />
      <rect x={cx - 5} y={y + 76} width={10} height={18} fill={PURPLE} />
      <rect x={cx - 34} y={y + 92} width={68} height={6} rx={3} fill={PURPLE} />
      {[-30, 0, 30].map((dx) => (
        <circle key={dx} cx={cx + dx} cy={y + 104} r={5.5} fill={PURPLE} />
      ))}
    </>
  );
}

function ShelfItem({ item }: { item: Item }) {
  const { x, w, h } = item;
  const y = SHELF_TOPS[item.shelf] - h;

  return (
    <g>
      <g className="ls-drop" style={delay(dropDelay(item.order))}>
        {item.kind === 'box' && <CardboardBox x={x} y={y} w={w} h={h} />}
        {item.kind === 'monitor' && <MonitorAsset x={x} y={y} w={w} />}
        {item.kind === 'chair' && <ChairAsset x={x} y={y} w={w} />}
      </g>

      {/* tag ✓ muncul pas sinar scan lewat */}
      <g className="ls-pop" style={delay(tagDelay(x + w / 2))}>
        <circle cx={x + w - 6} cy={y + 6} r={11} fill={PURPLE} stroke={CREAM} strokeWidth={2} />
        <path d={`M${x + w - 11} ${y + 6} l3.5 3.5 l6.5 -7`} fill="none" stroke={CREAM} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

// Papan nama di rak tengah (bay antara papan rak y=162 s/d y=280).
function Signboard() {
  return (
    <g className="ls-sign" style={delay(SIGN_AT)}>
      {/* gantungan ke papan rak atasnya */}
      <rect x={150} y={160} width={5} height={28} rx={2} fill={PURPLE} />
      <rect x={485} y={160} width={5} height={28} rx={2} fill={PURPLE} />
      <rect x={114} y={186} width={412} height={72} rx={12} fill={CREAM} stroke={PURPLE} strokeWidth={3} />
      <rect x={122} y={194} width={396} height={56} rx={8} fill="none" stroke={CORAL} strokeWidth={1.5} opacity={0.7} />

      <text x={320} y={231} textAnchor="middle" fontSize={24} fill={PURPLE}>
        <tspan fontWeight={800}>INVENTORY</tspan>
        <tspan fontWeight={400} fill={PURPLE_LIGHT}> &amp; ASSET CENTER</tspan>
      </text>
    </g>
  );
}

// Petugas gudang (gaya flat tanpa wajah) yang memegang scanner, berdiri di
// kiri rak menghadap ke kanan.
function StockChecker() {
  return (
    <g className="ls-person" style={delay(0.3)}>
      <ellipse cx={-88} cy={446} rx={46} ry={6} fill={PURPLE} opacity={0.15} />

      {/* kaki & sepatu (diam) */}
      <rect x={-104} y={338} width={18} height={100} rx={8} fill="#472547" />
      <rect x={-84} y={338} width={18} height={100} rx={8} fill={PURPLE} />
      <rect x={-106} y={430} width={30} height={12} rx={6} fill="#3A1E3A" />
      <rect x={-86} y={430} width={32} height={12} rx={6} fill="#3A1E3A" />

      <g className="ls-breathe">
        {/* lengan belakang */}
        <rect x={-116} y={272} width={16} height={70} rx={8} fill={PURPLE_LIGHT} />
        <circle cx={-108} cy={344} r={8} fill={SKIN} />

        {/* badan: kemeja + rompi safety + ikat pinggang */}
        <rect x={-118} y={262} width={58} height={86} rx={20} fill={PURPLE_LIGHT} />
        <rect x={-116} y={266} width={54} height={80} rx={16} fill={CORAL} />
        <rect x={-116} y={306} width={54} height={6} fill={CREAM} />
        <rect x={-116} y={320} width={54} height={4} fill={CREAM} opacity={0.8} />
        <rect x={-118} y={338} width={58} height={9} rx={3} fill="#3A1E3A" />

        {/* kepala + helm proyek */}
        <rect x={-94} y={248} width={14} height={18} rx={4} fill={SKIN} />
        <circle cx={-86} cy={234} r={20} fill={SKIN} />
        <circle cx={-66} cy={239} r={3} fill={SKIN} />
        <path d="M-108 231 A22 22 0 0 1 -64 231 Z" fill={CREAM} stroke={PURPLE} strokeWidth={2.5} strokeLinejoin="round" />
        <rect x={-106} y={227} width={60} height={6} rx={3} fill={CREAM} stroke={PURPLE} strokeWidth={2} />
        <line x1={-86} y1={211} x2={-86} y2={227} stroke={PURPLE} strokeWidth={1.5} opacity={0.5} />

        {/* lengan depan + scanner — diangkat dari bawah sebelum scan */}
        <g className="ls-arm" style={{ ...delay(ARM_AT), transformOrigin: '-70px 276px' }}>
          <rect x={-76} y={268} width={62} height={16} rx={8} fill={PURPLE_LIGHT} />
          <rect x={-14} y={266} width={11} height={22} rx={4} fill={PURPLE} />
          <rect x={-18} y={256} width={42} height={15} rx={5} fill={PURPLE} />
          <rect x={22} y={258} width={4} height={11} rx={1.5} fill="#fff" opacity={0.9} />
          <circle cx={0} cy={260} r={2} fill={CORAL} />
          <circle cx={-10} cy={277} r={9} fill={SKIN} />
        </g>
      </g>
    </g>
  );
}

function ScanBeam({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <g className={className} style={style}>
      <rect x={-34} y={32} width={68} height={392} fill="url(#ls-beam)" />
      <line x1={0} y1={32} x2={0} y2={424} stroke={PURPLE} strokeWidth={2.5} />
    </g>
  );
}

// Kerucut sinar dari ujung scanner ke garis scan.
function ScanCone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return (
    <polygon
      className={className}
      style={{ ...style, transformOrigin: `${TIP_X}px ${TIP_Y}px`, ['--ls-k' as any]: CONE_SCALE }}
      points={`${TIP_X},${TIP_Y} ${SCAN_FROM},32 ${SCAN_FROM},424`}
      fill="url(#ls-cone)"
    />
  );
}

export default function LoginScene({ onIntroDone, dimmed }: { onIntroDone: () => void; dimmed?: boolean }) {
  useEffect(() => {
    // User yang matiin animasi di OS langsung dapat versi diam + kartu login.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(onIntroDone, reduced ? 0 : INTRO_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* grid lantai ala blueprint */}
      <div className="ls-grid absolute inset-0" />

      {FLOATERS.map(({ Icon, top, left, size, dur }, i) => (
        <div
          key={i}
          className="ls-float absolute text-brand-purple"
          style={{ top, left, animationDuration: `0.8s, ${dur}s`, animationDelay: `${0.4 + i * 0.08}s, ${-i * 0.9}s` }}
        >
          <Icon size={size} strokeWidth={1.5} />
        </div>
      ))}

      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center md:justify-end md:pr-[3vw] transition-opacity duration-1000',
          dimmed ? 'opacity-30 md:opacity-100' : 'opacity-100'
        )}
      >
        <svg viewBox="-150 0 790 520" className="w-[96vw] max-w-[620px] md:w-[62vw] md:max-w-[960px] h-auto overflow-visible">
          <defs>
            <linearGradient id="ls-beam" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ls-cone" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
            </linearGradient>
            <clipPath id="ls-belt-clip">
              <rect x={40} y={450} width={560} height={50} />
            </clipPath>
          </defs>

          {/* bayangan lantai */}
          <ellipse className="ls-fade" style={delay(0.2)} cx={320} cy={446} rx={260} ry={12} fill={PURPLE} opacity={0.12} />

          {/* rak */}
          <g className="ls-grow" style={delay(0.2)}>
            <rect x={96} y={40} width={12} height={404} rx={3} fill={PURPLE} />
            <rect x={532} y={40} width={12} height={404} rx={3} fill={PURPLE} />
            {SHELF_TOPS.map((top) => (
              <rect key={top} x={88} y={top} width={464} height={12} rx={3} fill={PURPLE_LIGHT} />
            ))}
          </g>

          {ITEMS.map((item, i) => (
            <g key={i}>
              <ShelfItem item={item} />
            </g>
          ))}

          <Signboard />

          <StockChecker />

          {/* sinar scan intro (sekali) + scan ulang periodik setelah intro */}
          <ScanCone className="ls-cone" style={{ animationDelay: `${SCAN_START}s`, animationDuration: `${SCAN_DUR}s` }} />
          <ScanBeam className="ls-scan" style={{ animationDelay: `${SCAN_START}s`, animationDuration: `${SCAN_DUR}s` }} />
          <ScanCone className="ls-cone-loop" style={delay(SCAN_START + 5)} />
          <ScanBeam className="ls-scan-loop" style={delay(SCAN_START + 5)} />

          {/* conveyor */}
          <g className="ls-fade" style={delay(0.4)}>
            <g clipPath="url(#ls-belt-clip)">
              {[0, 1, 2, 3].map((i) => (
                // atribut transform = posisi diam kalau animasi dimatikan (reduced motion)
                <g key={i} className="ls-belt-box" style={delay(-i * 3)} transform={`translate(${100 + i * 140} 0)`}>
                  <rect x={0} y={466} width={42} height={30} rx={3} fill={CREAM} stroke={PURPLE} strokeWidth={2} />
                  <rect x={16} y={466} width={10} height={12} fill={CORAL} />
                </g>
              ))}
            </g>
            <rect x={40} y={496} width={560} height={10} rx={5} fill={PURPLE} />
            {Array.from({ length: 14 }, (_, i) => (
              <circle key={i} cx={60 + i * 40} cy={501} r={3} fill={CREAM} opacity={0.7} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
