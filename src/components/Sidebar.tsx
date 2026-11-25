import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ActiveTab } from '../types';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import { 
  LayoutDashboard, 
  Receipt, 
  ListOrdered, 
  BarChart3, 
  Users, 
  Settings as SettingsIcon, 
  History, 
  CloudCheck, 
  CloudOff, 
  LogOut, 
  X, 
  Code2, 
  Sun, 
  Moon,
  Globe,
  ExternalLink,
  UserCheck
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPublicSite?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenPublicSite }) => {
  const { 
    currentUser, 
    userPermissions,
    activeTab, 
    setActiveTab, 
    logout, 
    isLiveBackend, 
    settings,
    theme,
    toggleTheme,
    setLastGeneratedReceipt
  } = useApp();

  const isOwner = currentUser?.role === 'OWNER';
  const isMediaOnly = currentUser?.role === 'MEDIA' && !userPermissions.canIssueReceipts;
  const canManageWebsite = isOwner || currentUser?.role === 'ADMIN' || currentUser?.role === 'MEDIA' || Boolean(userPermissions.canManageWebsite);

  // Lock background page scrolling when the sidebar is open on phone/desktop
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  const handleNavClick = (tab: ActiveTab) => {
    setLastGeneratedReceipt(null);
    setActiveTab(tab);
    onClose();
  };

  const navItems: Array<{ tab: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; ownerOnly?: boolean; websiteOnly?: boolean; financeOnly?: boolean; settingsOnly?: boolean }> = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, financeOnly: true },
    { tab: 'generate', label: 'Issue Receipt', icon: Receipt, financeOnly: true },
    { tab: 'transactions', label: 'Transaction Ledger', icon: ListOrdered, financeOnly: true },
    { tab: 'members', label: 'Members Directory', icon: UserCheck, financeOnly: true },
    { tab: 'reports', label: 'Reports & Analytics', icon: BarChart3, financeOnly: true },
    { tab: 'website', label: 'Club News & Website', icon: Globe, websiteOnly: true },
    { tab: 'users', label: 'Administrators', icon: Users, ownerOnly: true },
    { tab: 'audit', label: 'Audit Logs', icon: History, ownerOnly: true },
    { tab: 'settings', label: 'Settings & Appearance', icon: SettingsIcon, ownerOnly: true },
    { tab: 'setup', label: 'Apps Script Backend', icon: Code2, settingsOnly: true }
  ];

  return (
    <>
      {/* Overlay backdrop - smooth mobile opacity fade, locks and darkens background */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/75 z-40 transition-opacity duration-200 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-76 sm:w-80 bg-slate-900 md:bg-slate-900/95 md:backdrop-blur-xl text-slate-100 flex flex-col border-r border-white/10 dark:border-white/5 shadow-2xl shadow-slate-950/60 transition-transform duration-250 ease-out will-change-transform transform-gpu overscroll-contain select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } print:hidden`}
      >
        {/* Subtle top rim light */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <img 
              src={settings.logoUrl || HARDCODED_LOGO_URL} 
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
              }}
              alt={settings.organizationName || 'SC BASIMBUZI'} 
              className="w-10 h-10 object-contain rounded-2xl bg-white/10 p-1 border border-white/20 shrink-0 shadow-inner" 
            />
            <div className="overflow-hidden">
              <h1 className="font-extrabold text-sm tracking-wide text-white uppercase truncate font-heading">
                {settings.organizationName || 'SC BASIMBUZI'}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium tracking-tight">
                Receipt Management Portal
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Backend Connection Indicator */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isLiveBackend ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-xs shadow-emerald-400/50" />
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Live Sheets Connected
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <CloudOff className="w-3.5 h-3.5 text-amber-400" />
                  Sandbox Storage
                </span>
              </>
            )}
          </div>
          
          {(isOwner || (userPermissions.canEditSettings && currentUser?.role !== 'ISSUER')) && (
            <a
              href="#/setup"
              onClick={(e) => {
                e.preventDefault();
                handleNavClick('setup');
              }}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline cursor-pointer"
            >
              {isLiveBackend ? 'Config' : 'Connect'}
            </a>
          )}
        </div>

        {/* Navigation Items - Clean high-performance tabs */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map(item => {
            if (item.ownerOnly && !isOwner) return null;
            if (item.websiteOnly && !canManageWebsite) return null;
            if (item.financeOnly && isMediaOnly) return null;
            if (item.settingsOnly && (currentUser?.role === 'ISSUER' || (!isOwner && !userPermissions.canEditSettings))) return null;

            const isActive = activeTab === item.tab;
            const Icon = item.icon;

            return (
              <a
                key={item.tab}
                id={`nav-item-${item.tab}`}
                href={`#/${item.tab}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(item.tab);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border border-white/20'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] text-slate-300 hover:text-white border border-white/[0.04] hover:border-white/[0.1]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="tracking-wide">{item.label}</span>
                </div>
                {item.ownerOnly && (
                  <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}>
                    Owner
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        {/* Theme Mode Switcher */}
        <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Theme Mode</span>
            <button
              id="btn-sidebar-theme-toggle"
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dark Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Light Mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* User Info & Sign Out Footer */}
        {currentUser && (
          <div className="p-4 border-t border-white/10 bg-slate-950/80">
            <div className="flex items-center justify-between mb-3 bg-white/[0.03] p-2.5 rounded-2xl border border-white/5">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 border border-white/20 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <div className="font-semibold text-xs text-white truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-sans truncate">
                    {currentUser.email}
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                isOwner ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-700/60 text-slate-300 border border-white/10'
              }`}>
                {currentUser.role}
              </span>
            </div>

            {onOpenPublicSite && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPublicSite();
                }}
                className="w-full mb-2 py-2.5 px-3 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Public Club Website</span>
              </button>
            )}

            <button
              id="btn-logout"
              onClick={logout}
              className="w-full py-2.5 px-3 bg-white/5 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/30 border border-white/10 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

