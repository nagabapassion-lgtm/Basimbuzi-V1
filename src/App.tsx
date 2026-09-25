import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { AccessDenied } from './components/AccessDenied';
import { ReceiptModal } from './components/ReceiptModal';
import { SuccessView } from './components/SuccessView';
import { LoginView } from './views/LoginView';

import { DashboardView } from './views/DashboardView';
import { GenerateReceiptView } from './views/GenerateReceiptView';
import { TransactionsView } from './views/TransactionsView';
import { SearchReceiptView } from './views/SearchReceiptView';
import { ReportsView } from './views/ReportsView';
import { UserManagementView } from './views/UserManagementView';
import { SettingsView } from './views/SettingsView';
import { AuditLogsView } from './views/AuditLogsView';
import { SetupGuideView } from './views/SetupGuideView';

import { Loader2 } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { 
    isAuthenticated, 
    isAccessDenied, 
    isLoading, 
    activeTab, 
    lastGeneratedReceipt 
  } = useApp();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Initial authentication loading state
  if (isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl mb-4 shadow-lg shadow-blue-600/30 animate-pulse">
          SB
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Verifying SC Basimbuzi Session...</span>
        </div>
      </div>
    );
  }

  // If unauthorized email tried to log in
  if (isAccessDenied) {
    return <AccessDenied />;
  }

  // Not authenticated: render the login page
  if (!isAuthenticated) {
    return (
      <>
        <LoginView />
        <ToastContainer />
      </>
    );
  }

  const renderActiveView = () => {
    // If a receipt was just generated, prioritize the Success Screen
    if (lastGeneratedReceipt) {
      return <SuccessView />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'generate':
        return <GenerateReceiptView />;
      case 'transactions':
        return <TransactionsView />;
      case 'search':
        return <SearchReceiptView />;
      case 'reports':
        return <ReportsView />;
      case 'users':
        return <UserManagementView />;
      case 'settings':
        return <SettingsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'setup':
        return <SetupGuideView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col antialiased text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <div className="flex flex-col flex-1 min-w-0 transition-all duration-300">
        <Header 
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)} 
        />

        <main className="flex-1 pb-16">
          {renderActiveView()}
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

