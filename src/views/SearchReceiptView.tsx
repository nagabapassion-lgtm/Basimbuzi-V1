import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
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
  Trash2
} from 'lucide-react';

export const SearchReceiptView: React.FC = () => {
  const { transactions, setSelectedReceipt, resendReceipt, deleteTransaction, currentUser } = useApp();
  const [query, setQuery] = useState('');
  const isOwner = currentUser?.role === 'OWNER';

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
        tx.paymentPurpose.toLowerCase().includes(q)
      );
    });
  }, [transactions, query]);

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
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] transition cursor-pointer"
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
              {searchResults.map(tx => (
                <div
                  key={tx.receiptNumber}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                        {tx.receiptNumber}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {tx.date} at {tx.time}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        tx.emailStatus === 'SENT' 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}>
                        Email: {tx.emailStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-800 dark:text-white">{tx.payerName}</strong>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {tx.email}
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
                        {tx.paymentPurpose}
                      </span>
                      <span>Method: <strong className="text-slate-700 dark:text-slate-200">{tx.paymentMethod}</strong></span>
                      {tx.paymentReference && (
                        <span className="font-mono">Ref: {tx.paymentReference}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                      {Number(tx.amount).toLocaleString()} UGX
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

                      <button
                        onClick={() => resendReceipt(tx.receiptNumber)}
                        className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Resend</span>
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete receipt ${tx.receiptNumber}?`)) {
                              deleteTransaction(tx.receiptNumber);
                            }
                          }}
                          title="Delete Receipt"
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
