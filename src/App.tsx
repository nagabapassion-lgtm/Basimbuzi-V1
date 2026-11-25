import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { AccessDenied } from './components/AccessDenied';
import { ReceiptModal } from './components/ReceiptModal';
import { SuccessView } from './components/SuccessView';
import { LoginView } from './views/LoginView';
import { PublicSiteView } from './views/PublicSiteView';

import { DashboardView } from './views/DashboardView';
import { GenerateReceiptView } from './views/GenerateReceiptView';
import { TransactionsView } from './views/TransactionsView';
import { MembersView } from './views/MembersView';
import { SearchReceiptView } from './views/SearchReceiptView';
import { ReportsView } from './views/ReportsView';
import { WebsiteCmsView } from './views/WebsiteCmsView';
import { UserManagementView } from './views/UserManagementView';
import { SettingsView } from './views/SettingsView';
import { AuditLogsView } from './views/AuditLogsView';
import { SetupGuideView } from './views/SetupGuideView';

import { Loader2 } from 'lucide-react';

const isAdminLocation = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path.startsWith('/admin') || hash.startsWith('#/admin');
};

const MainLayout: React.FC = () => {
  const {
    currentUser,
    userPermissions,
    isAuthenticated,
    isAccessDenied,
    isLoading,
    activeTab,
    setActiveTab,
    lastGeneratedReceipt
  } = useApp();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [routeMode, setRouteMode] = useState<'public' | 'admin'>(() =>
    isAdminLocation() ? 'admin' : 'public'
  );

  // Sync browser back/forward navigation between Public Website (/) and Admin Portal (/admin)
  useEffect(() => {
    const handlePopState = () => {
      setRouteMode(isAdminLocation() ? 'admin' : 'public');
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const openAdminPortal = useCallback(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/admin');
    }
    setRouteMode('admin');
    document.title = 'Admin Portal | SC Basimbuzi';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openPublicSite = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setRouteMode('public');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Automatically route MEDIA-only officers to the Website CMS tab after login
  useEffect(() => {
    if (
      isAuthenticated &&
      currentUser?.role === 'MEDIA' &&
      !userPermissions.canIssueReceipts &&
      activeTab !== 'website'
    ) {
      setActiveTab('website');
    }
  }, [isAuthenticated, currentUser, userPermissions.canIssueReceipts, activeTab, setActiveTab]);

  // Public Club Website Route (No login required)
  if (routeMode === 'public') {
    return (
      <>
        <PublicSiteView onNavigateAdmin={openAdminPortal} />
        <ToastContainer />
      </>
    );
  }

  // Admin Portal Loading State
  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 text-white flex items-center justify-center font-black text-2xl mb-4 shadow-xl shadow-blue-600/30 border border-white/20 backdrop-blur-xl animate-pulse">
          SB
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Verifying SC Basimbuzi Admin Session...</span>
        </div>
      </div>
    );
  }

  // If unauthorized email tried to log in
  if (isAccessDenied) {
    return <AccessDenied />;
  }

  // Admin Login Screen
  if (!isAuthenticated) {
    return (
      <>
        <LoginView onBackToPublicSite={openPublicSite} />
        <ToastContainer />
      </>
    );
  }

  const isMediaOnly = currentUser?.role === 'MEDIA' && !userPermissions.canIssueReceipts;

  const renderActiveView = () => {
    if (lastGeneratedReceipt) {
      return <SuccessView />;
    }

    if (isMediaOnly) {
      return <WebsiteCmsView onPreviewPublicSite={openPublicSite} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'generate':
        return <GenerateReceiptView />;
      case 'transactions':
        return <TransactionsView />;
      case 'members':
        return <MembersView />;
      case 'search':
        return <SearchReceiptView />;
      case 'reports':
        return <ReportsView />;
      case 'website':
        return <WebsiteCmsView onPreviewPublicSite={openPublicSite} />;
      case 'users':
        return <UserManagementView />;
      case 'settings':
        return <SettingsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'setup':
        if (currentUser?.role === 'ISSUER' || (currentUser?.role !== 'OWNER' && !userPermissions.canEditSettings)) {
          return <AccessDenied />;
        }
        return <SetupGuideView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col antialiased text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200 relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Ambient glassmorphic backlight glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true" style={{ contain: 'strict' }}>
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-[100px] transform-gpu" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-[120px] transform-gpu" />
        <div className="absolute -bottom-32 left-1/4 w-[32rem] h-96 bg-emerald-500/5 dark:bg-emerald-600/10 rounded-full blur-[140px] transform-gpu" />
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenPublicSite={openPublicSite}
      />

      <div className="flex flex-col flex-1 min-w-0 transition-all duration-300 relative z-10">
        <Header
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          onOpenPublicSite={openPublicSite}
        />

        <main className="flex-1 pb-16">
          <motion.div
            key={lastGeneratedReceipt ? 'success' : activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="w-full h-full"
          >
            {renderActiveView()}
          </motion.div>
        </main>
      </div>

      <ReceiptModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
