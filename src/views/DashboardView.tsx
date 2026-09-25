import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  TrendingUp, 
  Receipt, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  PlusCircle, 
  Printer, 
  FileText, 
  Search,
  RotateCw,
  Trash2,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';

export const DashboardView: React.FC = () => {
  const { 
    transactions, 
    setActiveTab, 
    setSelectedReceipt, 
    resendReceipt, 
    deleteTransaction,
    currentUser, 
    userPermissions,
    setLastGeneratedReceipt,
    isSyncing,
    refreshData,
    isLiveBackend
  } = useApp();

  const isOwner = currentUser?.role === 'OWNER';
  const canDelete = isOwner || userPermissions.canDeleteTransactions;

  // Transaction deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Compute KPI metrics dynamically from real transactions data
  const metrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7); // YYYY-MM

    let todayCount = 0;
    let todayRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;

    transactions.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      totalRevenue += amt;

      if (tx.date === today) {
        todayCount += 1;
        todayRevenue += amt;
      }

      if (tx.date && tx.date.startsWith(currentMonth)) {
        monthRevenue += amt;
      }
    });

    return {
      todayCount,
      todayRevenue,
      monthRevenue,
      totalRevenue,
      totalCount: transactions.length
    };
  }, [transactions]);

  // Chart data: daily revenue aggregation for the past 14 active days
  const chartData = useMemo(() => {
    const map = new Map<string, number>();

    // Sort ascending for chart
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(tx => {
      const current = map.get(tx.date) || 0;
      map.set(tx.date, current + (Number(tx.amount) || 0));
    });

    const entries = Array.from(map.entries()).map(([date, revenue]) => ({
      date: date.substring(5), // MM-DD
      fullDate: date,
      revenue
    }));

    if (entries.length === 0) {
      return [
        { date: 'Today', fullDate: 'Today', revenue: 0 }
      ];
    }

    return entries.slice(-14);
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 8);
  }, [transactions]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* Quick Action & Live Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Live Activity Overview
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {metrics.totalCount} Total Recorded Receipts
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Background Google Sheets Sync Indicator & One-Click Refresh */}
          {isLiveBackend && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-600 dark:text-slate-300">
              <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="hidden sm:inline font-medium">
                {isSyncing ? 'Syncing...' : 'Live Synced'}
              </span>
              <button
                id="btn-dash-refresh"
                onClick={refreshData}
                disabled={isSyncing}
                title="Sync fresh data from Google Sheets"
                className="p-1 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
              </button>
            </div>
          )}

          <button
            id="btn-dash-search"
            onClick={() => setActiveTab('search')}
            className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Records</span>
          </button>

          <button
            id="btn-dash-new-receipt"
            onClick={() => {
              setLastGeneratedReceipt(null);
              setActiveTab('generate');
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm shadow-blue-600/25 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Issue Receipt</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Payments */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Receipts</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {metrics.todayCount}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Receipts issued today
          </div>
        </div>

        {/* Today's Revenue */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Today's Revenue</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
            {metrics.todayRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-mono">UGX</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Received today
          </div>
        </div>

        {/* This Month's Revenue */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Monthly Revenue</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {metrics.monthRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-mono">UGX</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Current calendar month
          </div>
        </div>

        {/* Total Receipts */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Lifetime</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {metrics.totalRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500 dark:text-slate-400 font-mono">UGX</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {metrics.totalCount} total receipts recorded
          </div>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Revenue Volume Trend
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Daily transaction totals (UGX)</p>
          </div>
          <button
            onClick={() => setActiveTab('reports')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Detailed Analytics</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:opacity-10" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11} 
                tickLine={false}
                tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} 
              />
              <Tooltip 
                formatter={(val: number | string | Array<number | string> | undefined) => [
                  `${Number(val || 0).toLocaleString()} UGX`, 
                  'Revenue'
                ]}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderRadius: '10px', 
                  border: '1px solid #334155', 
                  color: '#fff', 
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' 
                }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#2563eb" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Recent Transactions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Latest receipts recorded in system</p>
          </div>
          <button
            id="btn-dash-view-all-tx"
            onClick={() => setActiveTab('transactions')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            View all ledger ({transactions.length})
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
            <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">Clean Ledger: Zero Shillings (0 UGX)</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Ready to record fresh official receipts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Receipt No.</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Payer</th>
                  <th className="px-5 py-3">Purpose</th>
                  <th className="px-5 py-3 text-right">Amount (UGX)</th>
                  <th className="px-5 py-3 text-center">Email</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {recentTransactions.map((tx) => (
                  <tr 
                    key={tx.receiptNumber}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {tx.receiptNumber}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      {tx.date}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-xs text-slate-900 dark:text-white">{tx.payerName}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[140px]">{tx.email}</div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-medium">
                        {tx.paymentPurpose}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-xs text-blue-600 dark:text-blue-400 font-mono">
                      {Number(tx.amount).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        tx.emailStatus === 'SENT' 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}>
                        {tx.emailStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedReceipt(tx)}
                          title="View Receipt"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedReceipt(tx);
                            setTimeout(() => window.print(), 300);
                          }}
                          title="Print Receipt"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => resendReceipt(tx.receiptNumber)}
                          title="Resend Email"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition cursor-pointer"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>

                        {/* Authorized Transaction Deletion Button */}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(tx.receiptNumber)}
                            title="Delete Transaction"
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal for Dashboard */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Delete Transaction</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receipt {deleteTarget}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Are you sure you want to permanently remove receipt <span className="font-mono font-bold text-slate-900 dark:text-white">{deleteTarget}</span> from the ledger? This action is restricted to the System Owner and will be logged in security audit history.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
