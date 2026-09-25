import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const AccessDenied: React.FC = () => {
  const { accessDeniedMessage, logout } = useApp();

  return (
    <div id="access-denied-view" className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
        <div className="bg-red-600 px-6 py-8 text-center text-white">
          <div className="w-14 h-14 bg-red-700/80 rounded-2xl flex items-center justify-center mx-auto mb-3 ring-8 ring-red-500/20">
            <ShieldAlert className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Access Restricted</h1>
          <p className="text-red-100 text-xs mt-1">SC Basimbuzi Security Verification</p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-4 text-xs text-red-300 leading-relaxed">
            {accessDeniedMessage || 'Your email address is not registered in the authorized administrators list for SC Basimbuzi.'}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Access to this system requires pre-authorization by the System Owner. If you believe this is an error, please contact the administrator.
          </p>

          <button
            id="btn-return-login"
            type="button"
            onClick={logout}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Login</span>
          </button>
        </div>
      </div>
    </div>
  );
};
