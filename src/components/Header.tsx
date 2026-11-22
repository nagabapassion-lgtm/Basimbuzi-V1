import React from 'react';
import { useApp } from '../context/AppContext';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import { 
  Menu, 
  RotateCw, 
  PlusCircle, 
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenPublicSite?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onOpenPublicSite }) => {
  const { 
    activeTab, 
    setActiveTab, 
    refreshData, 
    isLoading, 
    isLiveBackend, 
    settings,
    setLastGeneratedReceipt,
    currentUser,
    userPermissions
  } = useApp();

  const canIssueReceipts = currentUser?.role !== 'MEDIA' || Boolean(userPermissions.canIssueReceipts);

  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return null; // Removed as requested
      case 'generate': return 'Issue Digital Receipt';
      case 'transactions': return 'Transaction Ledger';
      case 'search': return 'Search Receipts';
      case 'reports': return 'Financial Analytics & Reports';
      case 'website': return 'Club News & Website CMS';
      case 'users': return 'Administrator Management';
      case 'audit': return 'Security & Audit Logs';
      case 'settings': return 'System Settings & Appearance';
      case 'setup': return 'Google Apps Script Setup';
      default: return null;
    }
  };

  const title = getTabTitle();

  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between print:hidden transition-all">
      <div className="flex items-center gap-3.5">
        {/* Three lines Menu Button - Always visible to pop out sidebar */}
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          className="p-2 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2"
          aria-label="Open navigation menu"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
          <span className="text-xs font-semibold hidden md:inline">Menu</span>
        </button>

        {title ? (
          <div>
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
              {title}
            </h2>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <img 
              src={settings.logoUrl || HARDCODED_LOGO_URL} 
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
              }}
              alt={settings.organizationName || 'SC Basimbuzi'} 
              className="w-7 h-7 object-contain rounded-lg border border-slate-200/80 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900 shadow-xs" 
            />
            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white uppercase tracking-wider">
              {settings.organizationName || 'SC Basimbuzi'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Connection status badge */}
        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
          isLiveBackend 
            ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-200/80 dark:border-blue-800 text-blue-700 dark:text-blue-300' 
            : 'bg-amber-50/80 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }`}>
          {isLiveBackend ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Live Cloud Backend</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Sandbox Storage</span>
            </>
          )}
        </div>

        {/* Refresh button */}
        <button
          id="btn-header-refresh"
          onClick={refreshData}
          disabled={isLoading}
          title="Refresh data from server"
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition disabled:opacity-50 cursor-pointer"
          aria-label="Refresh data"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        {onOpenPublicSite && (
          <button
            type="button"
            onClick={onOpenPublicSite}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Public Site</span>
          </button>
        )}

        {/* Quick Record Payment / New Receipt button */}
        {activeTab !== 'generate' && canIssueReceipts && (
          <button
            id="btn-header-quick-generate"
            onClick={() => {
              setLastGeneratedReceipt(null);
              setActiveTab('generate');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-sm shadow-blue-600/25 transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Issue Receipt</span>
          </button>
        )}
      </div>
    </header>
  );
};

