import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { publicSiteService } from '../services/publicSiteService';
import { 
  Search, 
  FileText, 
  Printer, 
  RotateCw, 
  Clock, 
  User, 
  Mail, 
  Phone,
  X,
  Trash2,
  Wallet,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export const SearchReceiptView: React.FC = () => {
  const { transactions, setSelectedReceipt, resendReceipt, deleteTransaction, currentUser, userPermissions } = useApp();
  const [query, setQuery] = useState('');
  const [targetUgx, setTargetUgx] = useState<number>(100000);
  const [targetLabel, setTargetLabel] = useState<string>('2026 Season Membership Contribution');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = currentUser?.role === 'OWNER' || userPermissions.canDeleteTransactions;

  useEffect(() => {
    publicSiteService.fetchPublicSite(false).then(payload => {
      if (payload?.content?.membershipTargetUgx !== undefined) {
        setTargetUgx(Number(payload.content.membershipTargetUgx) || 0);
      }
      if (payload?.content?.membershipTargetLabel) {
        setTargetLabel(payload.content.membershipTargetLabel);
      }
    }).catch(() => {});
  }, []);

  const searchResults = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    const q = query.trim().toLowerCase();
    return transactions.filter(tx => {
      return (
        tx.receiptNumber.toLowerCase().includes(q) ||
        tx.payerName.toLowerCase().includes(q) ||
        tx.email.toLowerCase().includes(q) ||
        (tx.phone && tx.phone.toLowerCase().includes(q)) ||
        (tx.paymentReference && tx.paymentReference.toLowerCase().includes(q)) ||
        (tx.notes && tx.notes.toLowerCase().includes(q)) ||
        tx.paymentPurpose.toLowerCase().includes(q)
      );
    });
  }, [transactions, query]);

  const payerSummary = useMemo(() => {
    const inflows = searchResults.filter(
      tx => tx.type !== 'OUTFLOW' && !tx.receiptNumber.startsWith('EXP-') && tx.paymentStatus !== 'CANCELLED'
    );
    if (inflows.length === 0) return null;
    const distinctNames = new Set(inflows.map(tx => tx.payerName.trim().toLowerCase()));
    if (distinctNames.size !== 1) return null;

    let totalPaid = 0;
    let pending = 0;
    for (const tx of inflows) {
      const amt = Number(tx.amount) || 0;
      if (tx.paymentStatus === 'COMPLETED') totalPaid += amt;
      else if (tx.paymentStatus === 'PENDING') pending += amt;
    }
    const effectiveTarget = targetUgx > 0 ? targetUgx : totalPaid + pending;
    const remaining = effectiveTarget > 0 ? Math.max(0, effectiveTarget - totalPaid) : 0;
    const pct = effectiveTarget > 0 ? Math.min(100, Math.round((totalPaid / effectiveTarget) * 100)) : 100;

    return {
      payerName: inflows[0].payerName,
      count: inflows.length,
      totalPaid,
      pending,
      effectiveTarget,
      remaining,
      pct
    };
  }, [searchResults, targetUgx]);

  const handlePrint = (tx: (typeof transactions)[0]) => {
    setSelectedReceipt(tx);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Search className="w-5 h-5" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Search Receipt
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Instantly look up any historical receipt by Receipt Number, Payer Name, Email, Phone, or Payment Reference.
        </p>

        {/* Big Search Input */}
        <div className="mt-5 relative">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 absolute left-4 top-3.5" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type receipt number, payer name, email or reference..."
            className="w-full pl-12 pr-10 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm sm:text-base focus:ring-2 focus:ring-blue-600 outline-none transition font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Search Chips */}
        {transactions.length > 0 && !query && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 dark:text-slate-500 font-medium">Recent receipts:</span>
            {transactions.slice(0, 4).map(t => (
              <button
                key={t.receiptNumber}
                onClick={() => setQuery(t.receiptNumber)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans text-[11px] transition cursor-pointer"
              >
                {t.receiptNumber}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Results Display */}
      {query.trim() && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Found <strong className="text-slate-900 dark:text-white">{searchResults.length}</strong> matching receipt{searchResults.length === 1 ? '' : 's'}</span>
          </div>

          {searchResults.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs transition-colors">
              <Search className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No matching receipts found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                We couldn't find any receipt matching "{query}". Check for typos or search by full name.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {payerSummary && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-blue-200 dark:border-blue-900/60 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {payerSummary.payerName} — Payment Summary ({payerSummary.count} receipt{payerSummary.count === 1 ? '' : 's'})
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        payerSummary.remaining === 0 && payerSummary.totalPaid > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {payerSummary.remaining === 0 && payerSummary.totalPaid > 0 ? 'FULLY PAID' : 'BALANCE REMAINING'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{targetLabel}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Total Paid</div>
                      <div className="text-sm sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {payerSummary.totalPaid.toLocaleString()} UGX
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Expected Target</div>
                      <div className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                        {payerSummary.effectiveTarget.toLocaleString()} UGX
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Remaining</div>
                      <div className="text-sm sm:text-base font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                        {payerSummary.remaining.toLocaleString()} UGX
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {searchResults.map(tx => {
                const isOutflow = tx.type === 'OUTFLOW' || tx.receiptNumber.startsWith('EXP-');
                return (
                <div
                  key={tx.receiptNumber}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-sans font-bold text-xs px-2.5 py-1 rounded-lg border ${
                        isOutflow
                          ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800'
                          : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800'
                      }`}>
                        {tx.receiptNumber}
                      </span>
                      {isOutflow && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          OUTFLOW
                        </span>
                      )}
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {tx.date} at {tx.time}
                      </span>
                      {!isOutflow && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          tx.emailStatus === 'SENT' 
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}>
                          Email: {tx.emailStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-800 dark:text-white">{isOutflow ? (tx.payee || tx.payerName) : tx.payerName}</strong>
                      </div>
                      <div className="flex items-center gap-1 font-sans text-slate-500 dark:text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {tx.email ? (
                          tx.email
                        ) : (
                          <span className="italic text-slate-400 dark:text-slate-500">No email provided</span>
                        )}
                      </div>
                      {tx.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          {tx.phone}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium">
                        {isOutflow ? (tx.category || tx.paymentPurpose) : tx.paymentPurpose}
                      </span>
                      <span>Method: <strong className="text-slate-700 dark:text-slate-200">{tx.paymentMethod}</strong></span>
                      {tx.paymentReference && (
                        <span className="font-sans">Ref: {tx.paymentReference}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className={`text-lg sm:text-xl font-extrabold font-sans ${isOutflow ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {isOutflow ? '-' : ''}{Number(tx.amount).toLocaleString()} UGX
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedReceipt(tx)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      <button
                        onClick={() => handlePrint(tx)}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>

                      {!isOutflow && (
                        <button
                          onClick={() => resendReceipt(tx.receiptNumber)}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Resend</span>
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(tx.receiptNumber)}
                          title="Delete Record"
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Delete Transaction</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Record {deleteTarget}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Are you sure you want to permanently remove record <span className="font-mono font-bold text-slate-900 dark:text-white">{deleteTarget}</span> from the ledger?
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
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await deleteTransaction(deleteTarget);
                    setDeleteTarget(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
