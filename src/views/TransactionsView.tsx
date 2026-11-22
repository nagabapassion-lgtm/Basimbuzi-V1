import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { usePaymentHistory } from '../hooks/usePaymentHistory';
import { Transaction } from '../types';
import { 
  Search, 
  Download, 
  ArrowUpDown, 
  FileText, 
  Printer, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight,
  Receipt,
  SlidersHorizontal,
  X,
  Trash2,
  AlertTriangle,
  Loader2,
  Clock,
  RefreshCw,
  CreditCard,
  ListOrdered,
  Wifi,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  BadgeDollarSign
} from 'lucide-react';
import { WhatsAppShareModal } from '../components/WhatsAppShareModal';
import { ReceiptList } from '../components/ReceiptList';
import { ExpenseVoucherModal } from '../components/ExpenseVoucherModal';

const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05
    }
  }
};

const cardItemVariants = {
  hidden: { opacity: 0, x: 45 },
  show: { 
    opacity: 1, 
    x: 0, 
    transition: { 
      type: 'spring', 
      damping: 20, 
      stiffness: 260 
    } 
  }
};

export const TransactionsView: React.FC = () => {
  const { 
    setSelectedReceipt, 
    resendReceipt, 
    deleteTransaction, 
    currentUser, 
    userPermissions,
    settings,
    addToast
  } = useApp();

  const {
    transactions,
    isLoading,
    error: historyError,
    isQuotaLimited,
    refetch,
    lastFetchedAt
  } = usePaymentHistory();

  const isOwner = currentUser?.role === 'OWNER';
  const canDelete = isOwner || userPermissions.canDeleteTransactions;

  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('sc_basimbuzi_ledger_view_mode');
      if (saved === 'cards' || saved === 'table') return saved;
    } catch {}
    return 'table';
  });

  const handleSetViewMode = (mode: 'cards' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('sc_basimbuzi_ledger_view_mode', mode);
    } catch {}
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'INFLOW' | 'OUTFLOW'>('ALL');
  const [filterPurpose, setFilterPurpose] = useState<string>('ALL');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [filterEmailStatus, setFilterEmailStatus] = useState<string>('ALL');
  const [filterDateRange, setFilterDateRange] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [sortField, setSortField] = useState<'date' | 'amount' | 'receiptNumber'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [showFilters, setShowFilters] = useState(false);

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // WhatsApp modal state
  const [whatsAppReceipt, setWhatsAppReceipt] = useState<Transaction | null>(null);
  // Expense voucher modal state
  const [selectedVoucher, setSelectedVoucher] = useState<Transaction | null>(null);

  // Filter & Sort Pipeline
  const filteredTransactions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);
    const currentYear = today.substring(0, 4);

    return transactions.filter(tx => {
      // 0. Transaction Type Filter (Integrated Financial Ledger)
      if (filterType === 'INFLOW' && tx.type === 'OUTFLOW') return false;
      if (filterType === 'OUTFLOW' && tx.type !== 'OUTFLOW') return false;
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          tx.receiptNumber.toLowerCase().includes(q) ||
          tx.payerName.toLowerCase().includes(q) ||
          tx.email.toLowerCase().includes(q) ||
          (tx.phone && tx.phone.toLowerCase().includes(q)) ||
          (tx.paymentReference && tx.paymentReference.toLowerCase().includes(q)) ||
          tx.paymentPurpose.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // 2. Purpose Filter
      if (filterPurpose !== 'ALL' && tx.paymentPurpose !== filterPurpose) {
        return false;
      }

      // 3. Method Filter
      if (filterMethod !== 'ALL' && tx.paymentMethod !== filterMethod) {
        return false;
      }

      // 4. Email Status Filter
      if (filterEmailStatus !== 'ALL' && tx.emailStatus !== filterEmailStatus) {
        return false;
      }

      // 5. Date Filter
      if (filterDateRange === 'TODAY' && tx.date !== today) {
        return false;
      }
      if (filterDateRange === 'THIS_MONTH' && !tx.date.startsWith(currentMonth)) {
        return false;
      }
      if (filterDateRange === 'THIS_YEAR' && !tx.date.startsWith(currentYear)) {
        return false;
      }
      if (filterDateRange === 'CUSTOM') {
        if (customStartDate && tx.date < customStartDate) return false;
        if (customEndDate && tx.date > customEndDate) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortField === 'amount') {
        return sortOrder === 'asc' ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount);
      }
      if (sortField === 'receiptNumber') {
        return sortOrder === 'asc' ? a.receiptNumber.localeCompare(b.receiptNumber) : b.receiptNumber.localeCompare(a.receiptNumber);
      }
      // Default: date + time
      const dateTimeA = `${a.date} ${a.time}`;
      const dateTimeB = `${b.date} ${b.time}`;
      return sortOrder === 'asc' ? dateTimeA.localeCompare(dateTimeB) : dateTimeB.localeCompare(dateTimeA);
    });
  }, [
    transactions, 
    searchQuery, 
    filterPurpose, 
    filterMethod, 
    filterEmailStatus, 
    filterDateRange, 
    customStartDate, 
    customEndDate, 
    sortField, 
    sortOrder
  ]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Integrated Ledger Metrics for filtered revenue and disbursements
  const filteredLedger = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let inflowCount = 0;
    let outflowCount = 0;

    for (const tx of filteredTransactions) {
      if (tx.paymentStatus === 'CANCELLED') continue;
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'OUTFLOW') {
        outflow += amt;
        outflowCount++;
      } else {
        inflow += amt;
        inflowCount++;
      }
    }

    return {
      totalInflow: inflow,
      totalOutflow: outflow,
      netBalance: inflow - outflow,
      inflowCount,
      outflowCount
    };
  }, [filteredTransactions]);

  const totalFilteredAmount = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [filteredTransactions]);

  const handleSort = (field: 'date' | 'amount' | 'receiptNumber') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = [
      'Type',
      'Identifier / Receipt',
      'Date',
      'Time',
      'Payer / Payee',
      'Phone',
      'Email',
      'Amount (UGX)',
      'Purpose / Category',
      'Payment Method',
      'Payment Reference',
      'Recorded By',
      'Payment Status',
      'Notes'
    ];

    const rows = filteredTransactions.map(tx => [
      `"${tx.type || 'INFLOW'}"`,
      `"${tx.receiptNumber}"`,
      `"${tx.date}"`,
      `"${tx.time}"`,
      `"${(tx.type === 'OUTFLOW' ? (tx.payee || tx.payerName) : tx.payerName).replace(/"/g, '""')}"`,
      `"${(tx.phone || '').replace(/"/g, '""')}"`,
      `"${tx.email || ''}"`,
      tx.type === 'OUTFLOW' ? -Number(tx.amount) : Number(tx.amount),
      `"${(tx.category || tx.paymentPurpose || '').replace(/"/g, '""')}"`,
      `"${tx.paymentMethod}"`,
      `"${(tx.paymentReference || '').replace(/"/g, '""')}"`,
      `"${tx.generatedBy.replace(/"/g, '""')}"`,
      `"${tx.paymentStatus}"`,
      `"${(tx.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SC_Basimbuzi_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterPurpose('ALL');
    setFilterMethod('ALL');
    setFilterEmailStatus('ALL');
    setFilterDateRange('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setCurrentPage(1);
  };

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

  const hasActiveFilters = 
    searchQuery !== '' || 
    filterPurpose !== 'ALL' || 
    filterMethod !== 'ALL' || 
    filterEmailStatus !== 'ALL' || 
    filterDateRange !== 'ALL';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6 max-w-7xl mx-auto py-6 px-4 sm:px-6"
    >
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Transaction Ledger
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {filteredTransactions.length} records &bull; Net Balance: <span className="font-bold text-slate-900 dark:text-white">UGX {filteredLedger.netBalance.toLocaleString()}</span> (Inflow: +{filteredLedger.totalInflow.toLocaleString()}, Outflow: -{filteredLedger.totalOutflow.toLocaleString()})
            </p>
            {lastFetchedAt && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                <span>Synced {lastFetchedAt.toLocaleTimeString()}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Credit Cards vs Table */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleSetViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => handleSetViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
            title="Refresh payment records from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition inline-flex items-center gap-1.5 cursor-pointer ${
              showFilters || hasActiveFilters
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-600/20'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters {hasActiveFilters && '(Active)'}</span>
          </button>

          <button
            id="btn-export-csv"
            onClick={handleExportCSV}
            disabled={filteredTransactions.length === 0}
            className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Integrated Financial Ledger Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Net Financial Balance */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 text-white p-5 rounded-2xl border border-indigo-900/50 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            <span>Net Financial Balance</span>
            <Scale className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-white">
            UGX {filteredLedger.netBalance.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-indigo-200/70">
            Total Inflow minus Outflow ({filteredLedger.inflowCount + filteredLedger.outflowCount} records)
          </div>
        </div>

        {/* Total Inflow */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            <span>Total Inflow (Receipts)</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            + UGX {filteredLedger.totalInflow.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {filteredLedger.inflowCount} receipts issued
          </div>
        </div>

        {/* Total Outflow */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/50 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
            <span>Total Outflow (Expenses)</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
            - UGX {filteredLedger.totalOutflow.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {filteredLedger.outflowCount} expense vouchers recorded
          </div>
        </div>
      </div>

      {/* Quota Limit Notice Banner */}
      {isQuotaLimited && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-4 rounded-2xl flex items-start justify-between gap-3 text-amber-800 dark:text-amber-200 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs text-amber-900 dark:text-amber-100">
                Google Apps Script URL Fetch / Daily Quota Limit Encountered
              </p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                Google's web app request quota was reached. To ensure uninterrupted operation, your system is serving local cached transactions. You can continue issuing receipts normally.
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="shrink-0 font-semibold underline hover:text-amber-900 dark:hover:text-amber-100"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Generic Error Banner */}
      {!isQuotaLimited && historyError && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-4 rounded-2xl flex items-start justify-between gap-3 text-red-800 dark:text-red-200 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs text-red-900 dark:text-red-100">Data Sync Warning</p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">{historyError}</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="shrink-0 font-semibold underline hover:text-red-900 dark:hover:text-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        {/* Transaction Type Filter Segment */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setFilterType('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              All Records
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterType('INFLOW');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                filterType === 'INFLOW'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Inflows Only</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterType('OUTFLOW');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                filterType === 'OUTFLOW'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-300" />
              <span>Outflows Only</span>
            </button>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Net Ledger: <span className="font-bold text-slate-800 dark:text-slate-200">UGX {filteredLedger.netBalance.toLocaleString()}</span>
          </span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by receipt #, payer name, email, phone, reference..."
            className="w-full pl-10 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expandable Filter Grid */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Purpose Filter */}
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Purpose</label>
              <select
                value={filterPurpose}
                onChange={(e) => {
                  setFilterPurpose(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-1 focus:ring-blue-600 text-xs"
              >
                <option value="ALL">All Purposes</option>
                {settings.paymentCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Method Filter */}
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Method</label>
              <select
                value={filterMethod}
                onChange={(e) => {
                  setFilterMethod(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-1 focus:ring-blue-600 text-xs"
              >
                <option value="ALL">All Payment Methods</option>
                {settings.paymentMethods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Email Status Filter */}
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Email Status</label>
              <select
                value={filterEmailStatus}
                onChange={(e) => {
                  setFilterEmailStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-1 focus:ring-blue-600 text-xs"
              >
                <option value="ALL">All Delivery Statuses</option>
                <option value="SENT">SENT</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Date Range</label>
              <select
                value={filterDateRange}
                onChange={(e) => {
                  setFilterDateRange(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-1 focus:ring-blue-600 text-xs"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="THIS_YEAR">This Year</option>
                <option value="CUSTOM">Custom Date Range</option>
              </select>
            </div>

            {filterDateRange === 'CUSTOM' && (
              <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3 pt-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs"
                />
              </div>
            )}

            {hasActiveFilters && (
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button
                  onClick={resetFilters}
                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Ledger Content: Credit Cards Grid vs Table View */}
      {paginatedTransactions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-16 text-center text-slate-500 dark:text-slate-400 text-sm shadow-xs">
          <Receipt className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-bold text-slate-800 dark:text-slate-200 text-base">No transactions found</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            No ledger records match the active search or filter criteria.
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* Modern Credit Card Grid View with Staggered Entrance */
        <div className="space-y-6">
          <ReceiptList
            key={`cards-grid-${currentPage}-${filterPurpose}-${filterMethod}`}
            receipts={paginatedTransactions}
            onSelectReceipt={(tx) => setSelectedReceipt(tx)}
            onResendReceipt={(num) => resendReceipt(num)}
            onShareWhatsApp={(tx) => setWhatsAppReceipt(tx)}
            onDeleteReceipt={canDelete ? (num) => setDeleteTarget(num) : undefined}
            onPrintReceipt={(tx) => {
              setSelectedReceipt(tx);
              setTimeout(() => window.print(), 300);
            }}
            isAdminOrOwner={canDelete}
            currency="UGX"
            organizationName={settings.organizationName || 'SC BASIMBUZI'}
          />

          {/* Pagination Controls for Card View */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 shadow-xs">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 py-1 outline-none text-xs font-semibold"
              >
                <option value={9}>9 cards</option>
                <option value={12}>12 cards</option>
                <option value={24}>24 cards</option>
                <option value={48}>48 cards</option>
              </select>
              <span>entries &bull; Page {currentPage} of {totalPages}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-800 dark:text-slate-200 px-2">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Traditional Ledger Table View */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Type</th>
                  <th 
                    onClick={() => handleSort('receiptNumber')}
                    className="px-4 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Ref / Voucher #</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('date')}
                    className="px-4 py-3.5 cursor-pointer hover:text-slate-900 dark:hover:text-white select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Date & Time</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5">Payer / Payee</th>
                  <th 
                    onClick={() => handleSort('amount')}
                    className="px-4 py-3.5 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white select-none"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Amount (UGX)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-4 py-3.5">Purpose / Category</th>
                  <th className="px-4 py-3.5">Recorded By</th>
                  <th className="px-4 py-3.5 text-center">Status / Email</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedTransactions.map((tx) => {
                  const isOutflow = tx.type === 'OUTFLOW';
                  return (
                    <tr 
                      key={tx.receiptNumber}
                      onClick={() => isOutflow ? setSelectedVoucher(tx) : setSelectedReceipt(tx)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isOutflow
                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {isOutflow ? (
                            <>
                              <ArrowUpRight className="w-3 h-3" />
                              <span>OUTFLOW</span>
                            </>
                          ) : (
                            <>
                              <ArrowDownLeft className="w-3 h-3" />
                              <span>INFLOW</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-sans font-bold text-xs text-slate-900 dark:text-white whitespace-nowrap">
                        {tx.receiptNumber}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div>{tx.date}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{tx.time}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold font-sans text-xs text-slate-900 dark:text-white">
                            {isOutflow ? (tx.payee || tx.payerName) : tx.payerName}
                          </span>
                          {isOutflow && (
                            <span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                              Payee
                            </span>
                          )}
                        </div>
                        {tx.email && !tx.email.toLowerCase().includes('no-reply') && !tx.email.toLowerCase().includes('whatsapp.direct') ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">{tx.email}</div>
                        ) : !isOutflow ? (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp Only</span>
                          </div>
                        ) : null}
                        {tx.phone && <div className="text-[10px] text-slate-400 dark:text-slate-500">{tx.phone}</div>}
                      </td>
                      <td className={`px-4 py-3.5 text-right font-bold text-xs font-sans whitespace-nowrap ${
                        isOutflow ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {isOutflow ? '-' : '+'} {Number(tx.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {tx.category || tx.paymentPurpose}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{tx.paymentMethod}</div>
                        {tx.paymentReference && (
                          <div className="text-[10px] font-sans text-slate-400 dark:text-slate-500">Ref: {tx.paymentReference}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {tx.generatedBy}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isOutflow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-sans">
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>VOUCHER</span>
                          </span>
                        ) : tx.emailStatus === 'SENT' && tx.email && !tx.email.toLowerCase().includes('no-reply') && !tx.email.toLowerCase().includes('whatsapp.direct') ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-sans">
                            <Check className="w-3 h-3 text-blue-600" />
                            <span>SENT</span>
                          </span>
                        ) : tx.emailStatus === 'FAILED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 font-sans">
                            <span>FAILED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-sans">
                            <span>RECORDED</span>
                          </span>
                        )}
                      </td>
                      <td 
                        className="px-4 py-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {isOutflow ? (
                            <>
                              <button
                                onClick={() => setSelectedVoucher(tx)}
                                title="View Expense Voucher"
                                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedVoucher(tx)}
                                title="Print Voucher"
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setSelectedReceipt(tx)}
                                title="View Receipt"
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setWhatsAppReceipt(tx)}
                                title="Send to WhatsApp"
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition cursor-pointer"
                              >
                                <MessageSquare className="w-4 h-4" />
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
                                title="Resend Receipt Email"
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition cursor-pointer"
                              >
                                <RotateCw className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* Authorized Deletion Option */}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(tx.receiptNumber)}
                              title="Delete Record"
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls for Table View */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 py-1 outline-none text-xs font-semibold"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries &bull; Page {currentPage} of {totalPages}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-slate-800 dark:text-slate-200 px-2">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg transition cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
      {/* WhatsApp Share Modal */}
      {whatsAppReceipt && (
        <WhatsAppShareModal
          receipt={whatsAppReceipt}
          settings={settings}
          onClose={() => setWhatsAppReceipt(null)}
          onSuccessToast={(msg) => addToast(msg, 'success')}
        />
      )}

      {/* Expense Voucher Modal for Outflows */}
      <ExpenseVoucherModal
        voucher={selectedVoucher}
        onClose={() => setSelectedVoucher(null)}
        settings={settings}
      />
    </motion.div>
  );
};
