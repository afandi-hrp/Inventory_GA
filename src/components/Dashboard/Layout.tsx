import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, MapPin, LogOut, Menu, X,
  Bell, User as UserIcon, ChevronRight, ChevronLeft, ChevronDown, History, ClipboardList, Archive,
  Settings, Users, Layers, UserCheck, ShoppingCart, CheckSquare, Sunrise, Sun, Sunset, Moon
} from 'lucide-react';
import { motion } from 'motion/react';
import SignedImage from '../UI/SignedImage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sapaan pojok kanan atas di semua halaman — logikanya sama dengan yang
// dipakai Dashboard/Home.tsx, supaya teks & ikon (pagi/siang/sore/malam)
// konsisten di seluruh aplikasi.
function getGreeting(hour: number) {
  if (hour >= 4 && hour < 11) {
    return { text: 'Selamat Pagi', Icon: Sunrise, color: 'text-orange-500' };
  }
  if (hour >= 11 && hour < 15) {
    return { text: 'Selamat Siang', Icon: Sun, color: 'text-amber-500' };
  }
  if (hour >= 15 && hour < 18) {
    return { text: 'Selamat Sore', Icon: Sunset, color: 'text-orange-600' };
  }
  return { text: 'Selamat Malam', Icon: Moon, color: 'text-indigo-500' };
}

interface LayoutProps {
  children: React.ReactNode;
  setHistorySearch?: (search: string) => void;
}

export default function Layout({ children, setHistorySearch }: LayoutProps) {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const location = useLocation();
  const currentPath = location.pathname.replace('/', '') || 'dashboard';
  const greeting = getGreeting(new Date().getHours());

  const isExpanded = isHovered || isSidebarOpen;

  // Badge jumlah pengajuan pending di menu Approval — dihitung ulang tiap
  // pindah halaman, biar update begitu user selesai approve/reject di sana.
  useEffect(() => {
    async function fetchPendingApprovalCount() {
      const role = profile?.role;
      if (!role || role === 'requester') return;

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
        const [disposalRes, spkRes] = await Promise.all([
          disposalStageByRole[role]
            ? supabase.from('disposal_requests').select('*', { count: 'exact', head: true }).eq('status', disposalStageByRole[role])
            : Promise.resolve({ count: 0 }),
          spkStageByRole[role]
            ? supabase.from('spk_requests').select('*', { count: 'exact', head: true }).eq('status', spkStageByRole[role])
            : Promise.resolve({ count: 0 }),
        ]);
        setPendingApprovalCount((disposalRes.count || 0) + (spkRes.count || 0));
      } catch (err) {
        console.error('Error fetching pending approval count:', err);
      }
    }
    fetchPendingApprovalCount();
  }, [profile?.role, location.pathname]);

  type MenuLink = { type: 'item'; id: string; label: string; icon: React.ReactNode; badge?: number };
  type MenuGroup = { type: 'group'; id: string; label: string; icon: React.ReactNode; children: { id: string; label: string; icon: React.ReactNode }[] };
  type MenuEntry = MenuLink | MenuGroup;

  // Dikelompokkan jadi 2 grup collapsible (Master Data & Riwayat) supaya
  // sidebar gak kepanjangan — menu yang paling sering diakses langsung
  // (Dashboard, Item Master, Approval, Manage Users) tetap berdiri sendiri.
  const menuItems: MenuEntry[] = profile?.role === 'requester' ? [
    { type: 'item', id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { type: 'item', id: 'office-items', label: 'Barang Reusable', icon: <ShoppingCart size={20} /> },
    { type: 'item', id: 'manage-users', label: 'Akun Saya', icon: <Settings size={20} /> },
  ] : [
    { type: 'item', id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { type: 'item', id: 'barang', label: 'Item Master', icon: <Package size={20} /> },
    { type: 'item', id: 'approval', label: 'Approval', icon: <CheckSquare size={20} />, badge: pendingApprovalCount },
    {
      type: 'group', id: 'master-data', label: 'Master Data', icon: <Layers size={20} />,
      children: [
        { id: 'kategori', label: 'Category Master', icon: <Layers size={18} /> },
        { id: 'lokasi', label: 'Location Master', icon: <MapPin size={18} /> },
        { id: 'kepemilikan', label: 'Ownership Master', icon: <UserCheck size={18} /> },
      ],
    },
    {
      type: 'group', id: 'riwayat', label: 'Riwayat', icon: <History size={20} />,
      children: [
        { id: 'take-item-history', label: 'Take Item History', icon: <History size={18} /> },
        { id: 'log-item-change', label: 'Item Change Logs', icon: <ClipboardList size={18} /> },
        { id: 'stock-out-history', label: 'Stock Out History', icon: <Archive size={18} /> },
      ],
    },
    { type: 'item', id: 'manage-users', label: 'Manage Users', icon: <Users size={20} /> },
  ];

  const isGroupOpen = (group: MenuGroup) =>
    expandedGroups.has(group.id) || group.children.some((c) => c.id === currentPath);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const renderLink = (id: string, label: string, icon: React.ReactNode, badge?: number, indented = false) => {
    const isActive = currentPath === id;
    return (
      <Link
        key={id}
        to={`/${id}`}
        onClick={() => {
          setIsSidebarOpen(false);
          if (setHistorySearch) setHistorySearch('');
        }}
        title={!isExpanded ? label : undefined}
        className={cn(
          "w-full flex items-center rounded-xl transition-colors duration-200 relative group",
          indented ? "py-2 pl-9 pr-3.5 space-x-3" : "px-3.5 py-2.5",
          !isExpanded && !indented ? "justify-center" : "space-x-3",
          isActive ? "text-white" : "text-white/50 hover:text-white hover:bg-white/5"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="active-sidebar-tab"
            className="absolute inset-0 bg-white/15 backdrop-blur-md border border-white/25 rounded-xl shadow-lg shadow-black/10"
            initial={false}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <div className={cn("relative z-10 flex items-center", (!isExpanded && !indented) ? "" : "space-x-3", isExpanded && "flex-1")}>
          <div className="shrink-0 relative">
            {icon}
            {!isExpanded && !!badge && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full border border-brand-purple">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </div>
          {isExpanded && (
            <span className="font-medium text-sm whitespace-nowrap flex-1 flex items-center justify-between">
              {label}
              {!!badge && (
                <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-brand-cream to-brand-coral flex">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-brand-purple/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Desktop Sidebar Placeholder */}
      <div className="hidden lg:block w-20 shrink-0 my-4 ml-4 mr-2" />

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
        "fixed z-50 bg-brand-purple/95 backdrop-blur-xl text-white transition-all duration-300 transform",
        isSidebarOpen ? "translate-x-0 inset-y-0 left-0" : "-translate-x-full inset-y-0 left-0 lg:translate-x-0",
        isExpanded ? "w-64" : "w-20",
        "lg:left-0 lg:top-0 lg:m-4 lg:rounded-3xl lg:h-[calc(100vh-2rem)] shadow-2xl flex flex-col overflow-hidden border border-white/10"
      )}>
        <div className="h-full flex flex-col relative z-10">
          {/* Sidebar Header */}
          <div className={cn("p-5 flex items-center border-b border-white/10 shrink-0", !isExpanded ? "justify-center" : "space-x-3")}>
            <div className="w-11 h-11 shrink-0 flex items-center justify-center">
              <img src="/logo-white.png" alt="Waruna Group" className="w-full h-full object-contain" />
            </div>
            {isExpanded && (
              <div className="overflow-hidden animate-in fade-in duration-300">
                <p className="font-bold text-sm leading-snug break-words line-clamp-2 tracking-wide">{settings.login_title}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 overflow-y-auto scrollbar-hide relative">
            {isExpanded && (
              <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-white/30 font-semibold">Menu</p>
            )}
            <div className="space-y-1">
              {menuItems.map((entry) => {
                if (entry.type === 'item') {
                  return renderLink(entry.id, entry.label, entry.icon, entry.badge);
                }

                const open = isGroupOpen(entry);
                const hasActiveChild = entry.children.some((c) => c.id === currentPath);
                return (
                  <div key={entry.id}>
                    <button
                      onClick={() => isExpanded && toggleGroup(entry.id)}
                      title={!isExpanded ? entry.label : undefined}
                      className={cn(
                        "w-full flex items-center px-3.5 py-2.5 rounded-xl transition-colors duration-200",
                        !isExpanded ? "justify-center" : "space-x-3",
                        hasActiveChild ? "text-white" : "text-white/50 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="shrink-0">{entry.icon}</div>
                      {isExpanded && (
                        <span className="font-medium text-sm whitespace-nowrap flex-1 flex items-center justify-between">
                          {entry.label}
                          <ChevronDown size={14} className={cn("transition-transform shrink-0", open && "rotate-180")} />
                        </span>
                      )}
                    </button>
                    {isExpanded && open && (
                      <div className="mt-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        {entry.children.map((child) => renderLink(child.id, child.label, child.icon, undefined, true))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-white/10 shrink-0 space-y-3">
            {/* User Info */}
            <div className={cn(
              "flex items-center p-2.5 rounded-xl bg-white/5 border border-white/10 transition-all",
              !isExpanded ? "justify-center" : "space-x-3"
            )}>
              <div className="w-9 h-9 rounded-full bg-white/10 ring-2 ring-white/20 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  <SignedImage bucket="item-photos" path={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={18} className="text-white/70" />
                )}
              </div>
              {isExpanded && (
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate">{profile?.full_name || 'User'}</p>
                  {profile?.role && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white/15 text-white/80">
                      {profile.role}
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              title={!isExpanded ? "Sign Out" : undefined}
              className={cn(
                "w-full flex items-center px-3.5 py-2.5 text-white/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 group",
                !isExpanded ? "justify-center" : "space-x-3"
              )}
            >
              <LogOut size={18} className="shrink-0 group-hover:scale-110 transition-transform" />
              {isExpanded && <span className="font-medium text-sm whitespace-nowrap">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Menu Button (Floating) */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden absolute top-4 left-4 z-30 p-2 bg-white/80 backdrop-blur-md text-brand-purple shadow-md rounded-xl border border-gray-200"
        >
          <Menu size={24} />
        </button>

        {/* Sapaan — pojok kanan atas, tampil di semua halaman */}
        <div className="hidden sm:flex flex-col items-end absolute top-4 right-4 lg:top-5 lg:right-8 z-20">
          <div className="flex items-center gap-2 text-lg font-bold text-brand-purple">
            <span>{greeting.text}, {profile?.full_name || 'User'}</span>
            <greeting.Icon className={cn(greeting.color)} size={22} />
          </div>
          <span className="text-sm text-brand-purple/60">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 pl-2 lg:pl-3 pt-16 lg:pt-5">
          <div className="max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
