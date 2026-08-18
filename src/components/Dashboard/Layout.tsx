import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, MapPin, LogOut, Menu, X,
  Bell, User as UserIcon, ChevronRight, ChevronLeft, History, ClipboardList, Archive,
  Settings, Users, Layers, UserCheck, ShoppingCart
} from 'lucide-react';
import { motion } from 'motion/react';
import SignedImage from '../UI/SignedImage';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  const location = useLocation();
  const currentPath = location.pathname.replace('/', '') || 'dashboard';

  const isExpanded = isHovered || isSidebarOpen;

  const menuItems = profile?.role === 'requester' ? [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'office-items', label: 'Barang Office', icon: <ShoppingCart size={20} /> },
    { id: 'manage-users', label: 'Akun Saya', icon: <Settings size={20} /> },
  ] : [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'barang', label: 'Item Master', icon: <Package size={20} /> },
    { id: 'kategori', label: 'Category Master', icon: <Layers size={20} /> },
    { id: 'lokasi', label: 'Location Master', icon: <MapPin size={20} /> },
    { id: 'kepemilikan', label: 'Ownership Master', icon: <UserCheck size={20} /> },
    { id: 'take-item-history', label: 'Take Item History', icon: <History size={20} /> },
    { id: 'log-item-change', label: 'Item Change Logs', icon: <ClipboardList size={20} /> },
    { id: 'stock-out-history', label: 'Stock Out History', icon: <Archive size={20} /> },
    { id: 'manage-users', label: 'Manage Users', icon: <Users size={20} /> },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
      <div className="hidden lg:block w-20 shrink-0 m-4" />

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
              {menuItems.map((item) => {
                const isActive = currentPath === item.id;
                return (
                  <Link
                    key={item.id}
                    to={`/${item.id}`}
                    onClick={() => {
                      setIsSidebarOpen(false);
                      if (setHistorySearch) setHistorySearch('');
                    }}
                    title={!isExpanded ? item.label : undefined}
                    className={cn(
                      "w-full flex items-center px-3.5 py-2.5 rounded-xl transition-colors duration-200 relative group",
                      !isExpanded ? "justify-center" : "space-x-3",
                      isActive
                        ? "text-white"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-sidebar-tab"
                        className="absolute inset-0 bg-gradient-to-r from-brand-coral to-brand-purple-light rounded-xl shadow-lg shadow-brand-coral/25"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <div className={cn("relative z-10 flex items-center", !isExpanded ? "" : "space-x-3")}>
                      <div className="shrink-0">{item.icon}</div>
                      {isExpanded && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}
                    </div>
                  </Link>
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

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 pt-16 lg:pt-8">
          <div className="max-w-[1800px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
