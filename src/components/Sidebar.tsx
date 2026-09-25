import React from 'react';
import { useApp } from '../context/AppContext';
import { ActiveTab } from '../types';
import { 
  LayoutDashboard, 
  Receipt, 
  ListOrdered, 
  Search, 
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
  Moon
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { 
    currentUser, 
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

  const handleNavClick = (tab: ActiveTab) => {
    setLastGeneratedReceipt(null);
    setActiveTab(tab);
    onClose();
  };

  const navItems: Array<{ tab: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }>; ownerOnly?: boolean }> = [
    { tab: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { tab: 'generate', label: 'Issue Receipt', icon: Receipt },
    { tab: 'transactions', label: 'Transaction Ledger', icon: ListOrdered },
    { tab: 'search', label: 'Search Receipts', icon: Search },
    { tab: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { tab: 'users', label: 'Administrators', icon: Users, ownerOnly: true },
    { tab: 'audit', label: 'Audit Logs', icon: History, ownerOnly: true },
    { tab: 'settings', label: 'Settings & Appearance', icon: SettingsIcon, ownerOnly: true },
    { tab: 'setup', label: 'Apps Script Backend', icon: Code2 }
  ];

  return (
    <>
      {/* Overlay backdrop - active whenever sidebar is open on any screen size */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-76 sm:w-80 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl text-slate-100 flex flex-col border-r border-slate-800/80 shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } print:hidden`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt={settings.organizationName} 
                className="w-10 h-10 object-contain rounded-xl bg-white p-0.5 border border-slate-700 shrink-0" 
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-base shadow-sm shadow-blue-600/30 shrink-0">
                SB
              </div>
            )}
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
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Backend Connection Indicator */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isLiveBackend ? (
              <>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <CloudCheck className="w-3.5 h-3.5 text-blue-400" />
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
          
          <button
            onClick={() => handleNavClick('setup')}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline cursor-pointer"
          >
            {isLiveBackend ? 'Config' : 'Connect'}
          </button>
        </div>

        {/* Navigation Items - Fancy Transparent Tabs */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map(item => {
            if (item.ownerOnly && !isOwner) return null;

            const isActive = activeTab === item.tab;
            const Icon = item.icon;

            return (
              <button
                key={item.tab}
                id={`nav-item-${item.tab}`}
                onClick={() => handleNavClick(item.tab)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 border border-blue-500/50'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 hover:border-white/10 backdrop-blur-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="tracking-wide">{item.label}</span>
                </div>
                {item.ownerOnly && (
                  <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-blue-700 text-white' : 'bg-slate-800/80 text-amber-300 border border-amber-500/20'
                  }`}>
                    Owner
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Theme Changer Bar in Sidebar */}
        <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Theme Mode</span>
            <button
              id="btn-sidebar-theme-toggle"
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 text-xs font-semibold transition cursor-pointer shadow-xs"
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
          <div className="p-4 border-t border-slate-800 bg-slate-950/80">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-blue-900/50 border border-blue-700/50 text-blue-200 flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden">
                  <div className="font-semibold text-xs text-white truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {currentUser.email}
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                isOwner ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-700 text-slate-300'
              }`}>
                {currentUser.role}
              </span>
            </div>

            <button
              id="btn-logout"
              onClick={logout}
              className="w-full py-2 px-3 bg-slate-800/80 hover:bg-red-950/50 hover:text-red-300 hover:border-red-800/50 border border-slate-700/60 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
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

