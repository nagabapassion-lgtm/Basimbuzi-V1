import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { compareTransactions } from '../utils/ledgerReconciliation';
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
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  ArrowDownLeft,
  Scale,
  BadgeDollarSign,
  Wallet
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

// Container variant: dives in (fades in and slides up y: 20 -> y: 0) and staggers sections
const mainContainerVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.08,
      delayChildren: 0.04
    }
  }
};

// Item variant for cards and major sections
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 280,
      damping: 24
    }
  }
};

// Waterfall container for mapped list items
const waterfallContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02
    }
  }
};

// Waterfall row variant
const waterfallRowVariants = {
  hidden: { opacity: 0, x: -10 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 320,
      damping: 26
    }
  }
};

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
    isLiveBackend,
    settings,
    ledgerMetrics
  } = useApp();

  const isOwner = currentUser?.role === 'OWNER';
  const canDelete = isOwner || userPermissions.canDeleteTransactions;

  // Transaction deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Compute Integrated Financial Ledger KPI metrics dynamically
  const metrics = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMonth = today.substring(0, 7); // YYYY-MM

    let todayInflow = 0;
    let todayOutflow = 0;
    let todayInflowCount = 0;
    let todayOutflowCount = 0;
    let monthInflow = 0;
    let monthOutflow = 0;

    transactions.forEach(tx => {
      if (tx.paymentStatus === 'CANCELLED') return;
      const amt = Number(tx.amount) || 0;
      const isOutflow = tx.type === 'OUTFLOW';

      if (isOutflow) {
        if (tx.date === today) {
          todayOutflow += amt;
          todayOutflowCount += 1;
        }
        if (tx.date && tx.date.startsWith(currentMonth)) {
          monthOutflow += amt;
        }
      } else {
        if (tx.date === today) {
          todayInflow += amt;
          todayInflowCount += 1;
        }
        if (tx.date && tx.date.startsWith(currentMonth)) {
          monthInflow += amt;
        }
      }
    });

    return {
      totalBalance: ledgerMetrics.netBalance,
      totalInflow: ledgerMetrics.totalInflow,
      totalOutflow: ledgerMetrics.totalOutflow,
      inflowCount: ledgerMetrics.inflowCount,
      outflowCount: ledgerMetrics.outflowCount,
      totalCount: transactions.length,
      todayInflow,
      todayOutflow,
      todayInflowCount,
      todayOutflowCount,
      todayNet: todayInflow - todayOutflow,
      monthInflow,
      monthOutflow,
      monthNet: monthInflow - monthOutflow
    };
  }, [transactions, ledgerMetrics]);

  // Chart data: daily revenue & disbursements aggregation for the past 14 active days
  const chartData = useMemo(() => {
    const inflowMap = new Map<string, number>();
    const outflowMap = new Map<string, number>();
    const datesSet = new Set<string>();

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(tx => {
      if (tx.paymentStatus === 'CANCELLED' || !tx.date) return;
      datesSet.add(tx.date);
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'OUTFLOW') {
        outflowMap.set(tx.date, (outflowMap.get(tx.date) || 0) + amt);
      } else {
        inflowMap.set(tx.date, (inflowMap.get(tx.date) || 0) + amt);
      }
    });

    const dates = Array.from(datesSet).sort();
    if (dates.length === 0) {
      return [{ date: 'Today', fullDate: 'Today', inflow: 0, outflow: 0, balance: 0 }];
    }

    return dates.slice(-14).map(date => {
      const inflow = inflowMap.get(date) || 0;
      const outflow = outflowMap.get(date) || 0;
      return {
        date: date.substring(5), // MM-DD
        fullDate: date,
        inflow,
        outflow,
        balance: inflow - outflow
      };
    });
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => compareTransactions(a, b, 'desc'));
    return sorted.slice(0, 8);
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
    <motion.div 
      variants={mainContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-7xl mx-auto py-6 px-4 sm:px-6"
    >
      {/* ================= 1. EXECUTIVE ACTION & LIVE STATUS BAR ================= */}
      <motion.div 
        variants={itemVariants}
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-wrap items-center justify-between gap-4 transition-all"
      >
        <div className="flex items-center gap-3.5">
          
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                {settings.organizationName || 'SC Basimbuzi'} Executive Dashboard
              </h1>
              
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-serif mt-0.5">
              Live ledger management &bull; {metrics.inflowCount} receipts &bull; {metrics.outflowCount} vouchers &bull; Currency: <span className="font-heading font-semibold text-slate-700 dark:text-slate-300">UGX</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Record Inflow (Receipt) */}
          <motion.button
            id="btn-dash-inflow"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              sessionStorage.setItem('sc_generate_mode', 'INFLOW');
              setActiveTab('generate');
            }}
            className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-2xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-600/20 font-sans"
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>+ Issue Receipt (Inflow)</span>
          </motion.button>

          {/* Record Outflow (Expense Voucher) */}
          <motion.button
            id="btn-dash-outflow"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              sessionStorage.setItem('sc_generate_mode', 'OUTFLOW');
              setActiveTab('generate');
            }}
            className="px-3.5 py-2.5 bg-rose-600/90 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold rounded-2xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm shadow-rose-600/20 font-sans"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>- Record Expense (Outflow)</span>
          </motion.button>

          {/* Search Records Button */}
          <motion.button
            id="btn-dash-search"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('search')}
            className="px-3.5 py-2.5 bg-slate-100/70 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 border border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-2xl transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs backdrop-blur-sm font-sans"
          >
            <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Search Records</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ================= 2. KPI METRICS CARDS: INTEGRATED FINANCIAL LEDGER ================= */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
      >
        {/* KPI 1: NET LIQUID BALANCE (TOTAL INFLOW - TOTAL OUTFLOW) */}
        <motion.div 
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-default relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Net Treasury Balance
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              metrics.totalBalance >= 0 
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
            }`}>
              {metrics.totalBalance >= 0 ? 'Surplus Reserve' : 'Ledger Deficit'}
            </span>
          </div>
          <div>
            <div className={`text-2xl sm:text-3xl font-heading font-extrabold tracking-tight font-sans ${
              metrics.totalBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {metrics.totalBalance.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans tracking-normal">UGX</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans flex items-center gap-1.5">
              <span>
                {ledgerMetrics.openingBalance 
                  ? `Opening: ${ledgerMetrics.openingBalance.toLocaleString()} UGX • ${metrics.inflowCount} In / ${metrics.outflowCount} Out`
                  : `Opening: 0 UGX (Based on recorded transactions • ${metrics.inflowCount} In / ${metrics.outflowCount} Out)`
                }
              </span>
            </div>
          </div>
        </motion.div>

        {/* KPI 2: TOTAL INFLOW (COLLECTIONS) */}
        <motion.div 
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Total Inflow (Receipts)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {metrics.inflowCount} Receipts
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-heading font-extrabold text-blue-600 dark:text-blue-400 tracking-tight font-sans">
              {metrics.totalInflow.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans tracking-normal">UGX</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans flex items-center gap-1.5">
              <span>Contributions & registration fees</span>
            </div>
          </div>
        </motion.div>

        {/* KPI 3: TOTAL OUTFLOW (EXPENSES) */}
        <motion.div 
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              Total Outflow (Expenses)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {metrics.outflowCount} Vouchers
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-heading font-extrabold text-rose-600 dark:text-rose-400 tracking-tight font-sans">
              {metrics.totalOutflow.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans tracking-normal">UGX</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans flex items-center gap-1.5">
              <span>Disbursements, pitch hire & match costs</span>
            </div>
          </div>
        </motion.div>

        {/* KPI 4: TODAY'S NET FLOW */}
        <motion.div 
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-default"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Today's Net Flow
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
              24h Window
            </span>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 dark:text-white tracking-tight font-sans">
              {metrics.todayNet >= 0 ? `+${metrics.todayNet.toLocaleString()}` : metrics.todayNet.toLocaleString()} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans tracking-normal">UGX</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans flex items-center gap-1.5">
              <span>+{metrics.todayInflow.toLocaleString()} In &bull; -{metrics.todayOutflow.toLocaleString()} Out</span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ================= 3. FINANCIAL CASH FLOW & DISBURSEMENT TREND ================= */}
      <motion.div 
        variants={itemVariants}
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6 sm:p-7 rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm transition-all"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                Cash Flow Movement (Inflow vs. Outflow)
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
                14-Day Cycle
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Daily collections (<span className="text-blue-600 font-semibold">Blue Inflow</span>) vs. expenses (<span className="text-rose-600 font-semibold">Rose Outflow</span>)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Inflow
              </span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span> Outflow
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('reports')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer font-sans"
            >
              <span>Reports</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e11d48" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#e11d48" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:opacity-10" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8" 
                fontSize={11} 
                tickLine={false} 
                fontFamily="Inter, sans-serif"
              />
              <YAxis 
                stroke="#94a3b8" 
                fontSize={11} 
                tickLine={false}
                fontFamily="Inter, sans-serif"
                tickFormatter={(val) => val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} 
              />
              <Tooltip 
                formatter={(val: number | string | Array<number | string> | undefined, name: string | undefined) => [
                  `${Number(val || 0).toLocaleString()} UGX`, 
                  name === 'inflow' ? 'Inflow (Collections)' : name === 'outflow' ? 'Outflow (Expenses)' : 'Balance'
                ]}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{ 
                  backgroundColor: '#0f172a', 
                  borderRadius: '16px', 
                  border: '1px solid #334155', 
                  color: '#ffffff', 
                  fontSize: '12px',
                  fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)' 
                }}
              />
              <Area 
                type="monotone" 
                dataKey="inflow" 
                stroke="#2563eb" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#colorInflow)" 
                name="inflow"
              />
              <Area 
                type="monotone" 
                dataKey="outflow" 
                stroke="#e11d48" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#colorOutflow)" 
                name="outflow"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* ================= 4. RECENT TRANSACTIONS LEDGER (WATERFALL LIST) ================= */}
      <motion.div 
        variants={itemVariants}
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm overflow-hidden transition-all"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-heading font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
              Recent Transactions Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Latest audited receipts issued with atomic numbering & verified signatures
            </p>
          </div>

          <motion.button
            id="btn-dash-view-all-tx"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('transactions')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer font-sans inline-flex items-center gap-1"
          >
            <span>View all ledger entries ({transactions.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-sans">
            <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="font-heading font-bold text-slate-800 dark:text-slate-200 text-sm">Clean Ledger: Zero Shillings (0 UGX)</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Ready to record fresh official receipts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200/60 dark:border-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">
                <tr>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Identifier</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Payer / Payee</th>
                  <th className="px-5 py-3.5">Category / Purpose</th>
                  <th className="px-5 py-3.5 text-right">Amount (UGX)</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <motion.tbody 
                variants={waterfallContainerVariants}
                initial="hidden"
                animate="show"
                className="divide-y divide-slate-100 dark:divide-slate-800/60"
              >
                {recentTransactions.map((tx) => {
                  const isOutflow = tx.type === 'OUTFLOW';
                  const displayName = isOutflow ? (tx.payee || tx.payerName) : tx.payerName;
                  const displayCategory = isOutflow ? (tx.category || tx.paymentPurpose) : tx.paymentPurpose;

                  return (
                    <motion.tr 
                      key={tx.receiptNumber}
                      variants={waterfallRowVariants}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Type Badge */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isOutflow 
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30' 
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {isOutflow ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          {isOutflow ? 'OUTFLOW' : 'INFLOW'}
                        </span>
                      </td>

                      {/* Receipt/Voucher Number */}
                      <td className="px-5 py-4 font-heading font-bold text-xs text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                        <span className="font-sans text-slate-900 dark:text-slate-100 bg-slate-100/80 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 font-semibold">
                          {tx.receiptNumber}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-400 font-sans whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{tx.date}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">{tx.time}</div>
                      </td>

                      {/* Payer/Payee Details */}
                      <td className="px-5 py-4 font-sans">
                        <div className="font-semibold text-xs text-slate-900 dark:text-white">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans truncate max-w-[150px]">
                          {tx.email && !tx.email.includes('no-reply') && !tx.email.includes('noreply') && !tx.email.includes('whatsapp.direct')
                            ? tx.email
                            : (tx.phone || 'Cash / Voucher')}
                        </div>
                      </td>

                      {/* Category & Method */}
                      <td className="px-5 py-4 text-xs font-sans">
                        <span className={`inline-block px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                          isOutflow
                            ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
                            : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-200'
                        }`}>
                          {displayCategory}
                        </span>
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {tx.paymentMethod}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className={`px-5 py-4 text-right font-heading font-extrabold text-sm font-sans tracking-tight whitespace-nowrap ${
                        isOutflow ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {isOutflow ? '-' : '+'}{Number(tx.amount).toLocaleString()}
                      </td>

                      {/* Status Pill */}
                      <td className="px-5 py-4 text-center font-sans">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          tx.emailStatus === 'SENT' || isOutflow
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        }`}>
                          {isOutflow ? 'APPROVED' : tx.emailStatus}
                        </span>
                      </td>

                      {/* Actions: Micro-interactions on buttons */}
                    <td className="px-5 py-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-1">
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedReceipt(tx)}
                          title="Inspect Receipt"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                        >
                          <FileText className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setSelectedReceipt(tx);
                            setTimeout(() => window.print(), 300);
                          }}
                          title="Print Receipt"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                        >
                          <Printer className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => resendReceipt(tx.receiptNumber)}
                          title="Resend Email"
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-xl transition cursor-pointer"
                        >
                          <RotateCw className="w-4 h-4" />
                        </motion.button>

                        {/* Authorized Transaction Deletion Button */}
                        {canDelete && (
                          <motion.button
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setDeleteTarget(tx.receiptNumber)}
                            title="Delete Transaction"
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </motion.button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              </motion.tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ================= 5. DELETE CONFIRMATION MODAL ================= */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl border border-slate-200/50 dark:border-slate-800/50 max-w-md w-full p-6 sm:p-7 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
                <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 shadow-inner">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    Delete Ledger Record
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">Receipt {deleteTarget}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 font-sans leading-relaxed mb-6">
                Are you sure you want to permanently delete receipt <span className="font-heading font-bold text-slate-900 dark:text-white font-sans">{deleteTarget}</span> from the ledger? This action is strictly restricted to the System Owner and will be permanently logged in security audit history.
              </p>

              <div className="flex items-center justify-end gap-3 font-sans">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-5 py-2.5 text-xs font-heading font-bold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-2xl transition inline-flex items-center gap-2 shadow-lg shadow-red-600/25 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting Record...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Deletion</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
