import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Package, MapPin, LogOut, Menu, X, 
  Bell, User as UserIcon, ChevronRight, ChevronLeft, History, ClipboardList, Archive,
  Settings, Users, Layers
} from 'lucide-react';
import { motion } from 'motion/react';
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

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'barang', label: 'Item Master', icon: <Package size={20} /> },
    { id: 'kategori', label: 'Category Master', icon: <Layers size={20} /> },
    { id: 'lokasi', label: 'Location Master', icon: <MapPin size={20} /> },
    { id: 'take-item-history', label: 'Take Item History', icon: <History size={20} /> },
    { id: 'log-item-change', label: 'Item Change Logs', icon: <ClipboardList size={20} /> },
    { id: 'stock-out-history', label: 'Stock Out History', icon: <Archive size={20} /> },
    { id: 'manage-users', label: 'Manage Users', icon: <Users size={20} /> },
    ...(profile?.role === 'admin' ? [
      { id: 'login-settings', label: 'Login Settings', icon: <Settings size={20} /> }
    ] : []),
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Auto logout after 10 minutes of inactivity
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // 10 minutes = 10 * 60 * 1000 = 600000 ms
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, 600000);
  }, []);

  useEffect(() => {
    // Initialize timer
    resetTimer();

    // Events to track user activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#FFF9E3] via-[#FFDAB9] to-[#FFB08E] flex">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
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
        "fixed z-50 bg-[#3D2C44]/95 backdrop-blur-xl text-white transition-all duration-300 transform",
        isSidebarOpen ? "translate-x-0 inset-y-0 left-0" : "-translate-x-full inset-y-0 left-0 lg:translate-x-0",
        isExpanded ? "w-64" : "w-20",
        "lg:left-0 lg:top-0 lg:m-4 lg:rounded-3xl lg:h-[calc(100vh-2rem)] shadow-2xl flex flex-col overflow-hidden border border-white/10"
      )}>
        <div className="h-full flex flex-col relative z-10">
          {/* Sidebar Header */}
          <div className="p-6 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 shrink-0 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg border border-white/20">
                {settings.login_title.charAt(0)}
              </div>
              {isExpanded && (
                <span className="font-bold text-lg truncate tracking-wide animate-in fade-in duration-300">{settings.login_title}</span>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide relative">
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
                    "w-full flex items-center px-4 py-3 rounded-2xl transition-colors duration-200 relative group",
                    !isExpanded ? "justify-center" : "space-x-3",
                    isActive 
                      ? "text-white" 
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-sidebar-tab"
                      className="absolute inset-0 bg-white/15 backdrop-blur-md rounded-2xl shadow-lg border border-white/10"
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <div className={cn("relative z-10 flex items-center", !isExpanded ? "" : "space-x-3")}>
                    <div className="shrink-0">{item.icon}</div>
                    {isExpanded && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-white/10 shrink-0 space-y-4">
            {/* User Info */}
            <div className={cn(
              "flex items-center p-3 rounded-2xl bg-white/5 border border-white/10 transition-all",
              !isExpanded ? "justify-center" : "space-x-3"
            )}>
              <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={20} className="text-white/70" />
                )}
              </div>
              {isExpanded && (
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-white truncate">{profile?.full_name || 'User'}</p>
                  <p className="text-xs text-white/60 capitalize truncate">{profile?.role || 'User'}</p>
                </div>
              )}
            </div>

            <button 
              onClick={handleLogout}
              title={!isExpanded ? "Logout" : undefined}
              className={cn(
                "w-full flex items-center px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all duration-200 group",
                !isExpanded ? "justify-center" : "space-x-3"
              )}
            >
              <LogOut size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
              {isExpanded && <span className="font-medium whitespace-nowrap">Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Menu Button (Floating) */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden absolute top-4 left-4 z-30 p-2 bg-white/80 backdrop-blur-md text-gray-700 shadow-md rounded-xl border border-gray-200"
        >
          <Menu size={24} />
        </button>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 pt-16 lg:pt-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
