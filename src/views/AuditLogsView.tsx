import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  History, 
  ShieldAlert, 
  Search, 
  Filter, 
  Activity,
  X
} from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const { auditLogs, currentUser } = useApp();

  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string>('ALL');

  const isOwner = currentUser?.role === 'OWNER';

  if (!isOwner) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl p-8 transition-colors">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 dark:text-red-300">Owner Access Required</h2>
          <p className="text-sm text-red-700 dark:text-red-400 mt-2">
            The security and activity audit log is restricted to the System Owner.
          </p>
        </div>
      </div>
    );
  }

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (filterAction !== 'ALL' && log.action !== filterAction) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          (log.user && log.user.toLowerCase().includes(q)) ||
          (log.userEmail && log.userEmail.toLowerCase().includes(q)) ||
          (log.description && log.description.toLowerCase().includes(q)) ||
          (log.receiptNumber && log.receiptNumber.toLowerCase().includes(q)) ||
          log.action.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, filterAction, search]);

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'GENERATE_RECEIPT': return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'RESEND_RECEIPT': return 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      case 'ADD_USER':
      case 'ADD_ADMIN': return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      case 'REMOVE_USER':
      case 'REMOVE_ADMIN':
      case 'DELETE_TRANSACTION': return 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'ACTIVATE_ADMIN': return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'DEACTIVATE_ADMIN': return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'CHANGE_SETTINGS': return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'LOGIN': return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <History className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Security & Activity Audit Logs
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Immutable chronological record of logins, receipt generation, deletions, and configuration changes.
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Total Recorded Events: <strong className="text-slate-900 dark:text-white">{auditLogs.length}</strong>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by operator, receipt #, or description..."
            className="w-full pl-10 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-600"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="ALL">All Actions</option>
            <option value="GENERATE_RECEIPT">GENERATE_RECEIPT</option>
            <option value="RESEND_RECEIPT">RESEND_RECEIPT</option>
            <option value="DELETE_TRANSACTION">DELETE_TRANSACTION</option>
            <option value="ADD_USER">ADD_USER</option>
            <option value="REMOVE_USER">REMOVE_USER</option>
            <option value="ACTIVATE_ADMIN">ACTIVATE_ADMIN</option>
            <option value="DEACTIVATE_ADMIN">DEACTIVATE_ADMIN</option>
            <option value="CHANGE_SETTINGS">CHANGE_SETTINGS</option>
            <option value="LOGIN">LOGIN</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            <Activity className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No audit events found</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try clearing your search query or action filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-5 py-3.5">Operator</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Receipt #</th>
                  <th className="px-5 py-3.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredLogs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{log.date}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{log.time}</div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">{log.user}</div>
                      {log.userEmail && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{log.userEmail}</div>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border uppercase ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {log.receiptNumber || '—'}
                    </td>

                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300 leading-relaxed max-w-md">
                      {log.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
