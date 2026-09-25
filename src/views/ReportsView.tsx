import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  BarChart3, 
  Download, 
  ArrowUpRight, 
  ArrowDownRight 
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';

const BLUE_PALETTE = ['#2563eb', '#0284c7', '#4f46e5', '#0891b2', '#3b82f6', '#6366f1', '#64748b'];

export const ReportsView: React.FC = () => {
  const { transactions } = useApp();
  
  const [rangeType, setRangeType] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'ALL' | 'CUSTOM'>('THIS_MONTH');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Date Filtering Calculation
  const filteredData = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Calculate week start
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Current Month
    const thisMonthStr = todayStr.substring(0, 7);

    // Last Month
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    // Current Year
    const thisYearStr = todayStr.substring(0, 4);

    return transactions.filter(tx => {
      if (rangeType === 'ALL') return true;
      if (rangeType === 'TODAY') return tx.date === todayStr;
      if (rangeType === 'THIS_WEEK') return tx.date >= weekStartStr && tx.date <= todayStr;
      if (rangeType === 'THIS_MONTH') return tx.date.startsWith(thisMonthStr);
      if (rangeType === 'LAST_MONTH') return tx.date.startsWith(lastMonthStr);
      if (rangeType === 'THIS_YEAR') return tx.date.startsWith(thisYearStr);
      if (rangeType === 'CUSTOM') {
        if (customStart && tx.date < customStart) return false;
        if (customEnd && tx.date > customEnd) return false;
        return true;
      }
      return true;
    });
  }, [transactions, rangeType, customStart, customEnd]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        totalRevenue: 0,
        count: 0,
        average: 0,
        largest: 0,
        smallest: 0
      };
    }

    let total = 0;
    let max = -Infinity;
    let min = Infinity;

    filteredData.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      total += amt;
      if (amt > max) max = amt;
      if (amt < min) min = amt;
    });

    return {
      totalRevenue: total,
      count: filteredData.length,
      average: Math.round(total / filteredData.length),
      largest: max === -Infinity ? 0 : max,
      smallest: min === Infinity ? 0 : min
    };
  }, [filteredData]);

  // 1. Chart: Revenue Over Time
  const timeSeriesData = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));

    sorted.forEach(tx => {
      const cur = map.get(tx.date) || 0;
      map.set(tx.date, cur + (Number(tx.amount) || 0));
    });

    return Array.from(map.entries()).map(([date, revenue]) => ({
      date: date.substring(5), // MM-DD
      fullDate: date,
      revenue
    }));
  }, [filteredData]);

  // 2. Chart: Payments by Purpose
  const purposeData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredData.forEach(tx => {
      const cur = map.get(tx.paymentPurpose) || { count: 0, total: 0 };
      map.set(tx.paymentPurpose, {
        count: cur.count + 1,
        total: cur.total + (Number(tx.amount) || 0)
      });
    });

    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      value: data.total,
      count: data.count
    })).sort((a, b) => b.value - a.value);
  }, [filteredData]);

  // 3. Chart: Payments by Payment Method
  const methodData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(tx => {
      const cur = map.get(tx.paymentMethod) || 0;
      map.set(tx.paymentMethod, cur + (Number(tx.amount) || 0));
    });

    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value
    }));
  }, [filteredData]);

  // 4. Chart: Breakdown by Operator / Admin
  const operatorData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredData.forEach(tx => {
      const op = tx.generatedBy || 'Unknown';
      const cur = map.get(op) || { count: 0, total: 0 };
      map.set(op, {
        count: cur.count + 1,
        total: cur.total + (Number(tx.amount) || 0)
      });
    });

    return Array.from(map.entries()).map(([operator, data]) => ({
      operator,
      total: data.total,
      count: data.count
    }));
  }, [filteredData]);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return;

    const headers = ['Receipt #', 'Date', 'Payer', 'Email', 'Amount (UGX)', 'Purpose', 'Method', 'Operator', 'Status'];
    const rows = filteredData.map(tx => [
      `"${tx.receiptNumber}"`,
      `"${tx.date}"`,
      `"${tx.payerName}"`,
      `"${tx.email}"`,
      tx.amount,
      `"${tx.paymentPurpose}"`,
      `"${tx.paymentMethod}"`,
      `"${tx.generatedBy}"`,
      `"${tx.emailStatus}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SC_Basimbuzi_Report_${rangeType}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Reports & Financial Analytics
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Real-time calculations computed dynamically from your receipt ledger.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={filteredData.length === 0}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-2 shadow-xs shadow-blue-600/20 shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export Report Data</span>
        </button>
      </div>

      {/* Date Range Selector Bar with Fancy Transparent Tabs */}
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs transition-colors">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'TODAY', label: 'Today' },
            { key: 'THIS_WEEK', label: 'This Week' },
            { key: 'THIS_MONTH', label: 'This Month' },
            { key: 'LAST_MONTH', label: 'Last Month' },
            { key: 'THIS_YEAR', label: 'This Year' },
            { key: 'ALL', label: 'All Time' },
            { key: 'CUSTOM', label: 'Custom Range' }
          ].map(btn => (
            <button
              key={btn.key}
              onClick={() => setRangeType(btn.key as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                rangeType === btn.key
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 border border-blue-500/50'
                  : 'bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 backdrop-blur-xs'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {rangeType === 'CUSTOM' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-xs"
            />
          </div>
        )}
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Total Revenue
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight font-mono">
            {metrics.totalRevenue.toLocaleString()} <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">UGX</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">In selected timeframe</div>
        </div>

        {/* Payments Count */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Receipts Issued
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {metrics.count}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Total recorded payments</div>
        </div>

        {/* Average Payment */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Average Payment
          </div>
          <div className="text-xl font-extrabold text-slate-800 dark:text-slate-200 tracking-tight font-mono">
            {metrics.average.toLocaleString()} <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">UGX</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Per transaction average</div>
        </div>

        {/* Largest Payment */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <span>Largest</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight font-mono">
            {metrics.largest.toLocaleString()} <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">UGX</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Single highest payment</div>
        </div>

        {/* Smallest Payment */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <span>Smallest</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div className="text-xl font-extrabold text-slate-700 dark:text-slate-300 tracking-tight font-mono">
            {metrics.smallest.toLocaleString()} <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">UGX</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Single lowest payment</div>
        </div>
      </div>

      {/* Visual Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Revenue Timeline */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
            Revenue Trend Over Selected Period
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Daily cash collection timeline</p>
          <div className="h-64 w-full">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">No transactions in selected period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={11} 
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} 
                  />
                  <Tooltip 
                    formatter={(v: number | string | Array<number | string> | undefined) => [
                      `${Number(v || 0).toLocaleString()} UGX`, 
                      'Revenue'
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#fff', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#reportGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Purpose Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
            Revenue by Payment Purpose / Category
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Total revenue allocated per purpose</p>
          <div className="h-64 w-full">
            {purposeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purposeData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={80} />
                  <Tooltip 
                    formatter={(v: number | string | Array<number | string> | undefined) => [
                      `${Number(v || 0).toLocaleString()} UGX`, 
                      'Amount'
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Payment Method Distribution */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
            Payment Method Share
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Distribution by Mobile Money, Bank Transfer, Cash</p>
          <div className="h-64 w-full flex items-center justify-center">
            {methodData.length === 0 ? (
              <div className="text-slate-400 dark:text-slate-500 text-xs">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {methodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={BLUE_PALETTE[index % BLUE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(v: number | string | Array<number | string> | undefined) => [
                      `${Number(v || 0).toLocaleString()} UGX`, 
                      'Total'
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Operator Performance */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
            Receipts Generated by Administrator
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Volume recorded per administrator</p>
          <div className="h-64 w-full">
            {operatorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operatorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="operator" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                  <Tooltip 
                    formatter={(val: number | string | Array<number | string> | undefined, name) => [
                      name === 'count' ? `${val} receipts` : `${Number(val || 0).toLocaleString()} UGX`, 
                      name === 'count' ? 'Receipts Count' : 'Total Revenue'
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
