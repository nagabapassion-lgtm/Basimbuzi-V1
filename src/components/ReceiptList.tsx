import React from 'react';
import { motion } from 'motion/react';
import { Transaction } from '../types';
import { 
  Wifi, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Share2, 
  RotateCw, 
  Eye, 
  Trash2,
  Printer
} from 'lucide-react';

interface ReceiptListProps {
  receipts: Transaction[];
  onSelectReceipt: (receipt: Transaction) => void;
  onResendReceipt?: (receiptNumber: string) => void;
  onShareWhatsApp?: (receipt: Transaction) => void;
  onDeleteReceipt?: (receiptNumber: string) => void;
  onPrintReceipt?: (receipt: Transaction) => void;
  isAdminOrOwner?: boolean;
  currency?: string;
  organizationName?: string;
}

export const ReceiptList: React.FC<ReceiptListProps> = ({
  receipts,
  onSelectReceipt,
  onResendReceipt,
  onShareWhatsApp,
  onDeleteReceipt,
  onPrintReceipt,
  isAdminOrOwner = false,
  currency = 'UGX',
  organizationName = 'SC BASIMBUZI'
}) => {
  if (!receipts || receipts.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {receipts.map((tx) => {
        const isOutflow = tx.type === 'OUTFLOW';
        const isSent = tx.emailStatus === 'SENT';
        const isQuota = tx.emailStatus === 'QUOTA_EXCEEDED';
        const isFailed = tx.emailStatus === 'FAILED';

        return (
          <motion.div
            key={tx.receiptNumber}
            initial={false}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 350, damping: 24 }}
            onClick={() => onSelectReceipt(tx)}
            className={`group relative rounded-3xl p-6 text-white shadow-xl hover:shadow-2xl border transition-all duration-300 transform-gpu cursor-pointer overflow-hidden flex flex-col justify-between min-h-[240px] ${
              isOutflow
                ? 'bg-gradient-to-br from-slate-900 via-rose-950/50 to-slate-950 shadow-rose-950/20 hover:shadow-rose-600/25 border-rose-900/30 dark:border-rose-800/40'
                : 'bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/80 shadow-slate-950/20 hover:shadow-blue-600/25 border-white/10 dark:border-white/15'
            }`}
          >
            {/* Specular Ambient Glow & Top Rim Light */}
            <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${
              isOutflow ? 'bg-rose-500/15 group-hover:bg-rose-500/30' : 'bg-blue-500/15 group-hover:bg-blue-500/30'
            }`} />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

            {/* Card Header: Chip, Contactless Wave, Status Badge */}
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                {/* Metallic Chip */}
                <div className={`w-10 h-7 rounded-lg border shadow-inner flex flex-col justify-center gap-1 px-1 ${
                  isOutflow 
                    ? 'bg-gradient-to-tr from-rose-400 via-rose-300 to-amber-500 border-rose-300' 
                    : 'bg-gradient-to-tr from-amber-400 via-amber-300 to-yellow-500 border-amber-200'
                }`}>
                  <div className="w-full h-px bg-slate-900/30" />
                  <div className="w-full h-px bg-slate-900/30" />
                </div>
                {/* Contactless Wifi Waves */}
                <Wifi className="w-4 h-4 text-white/50 rotate-90" />
              </div>

              {/* Status Pill & Transaction Type */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isOutflow
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isOutflow ? 'OUTFLOW' : 'INFLOW'}
                </span>
                {isSent ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs">
                    <CheckCircle2 className="w-3 h-3" />
                    Sent
                  </span>
                ) : isQuota ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-xs">
                    <Clock className="w-3 h-3" />
                    Quota
                  </span>
                ) : isFailed ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-xs">
                    <AlertCircle className="w-3 h-3" />
                    Failed
                  </span>
                ) : null}
              </div>
            </div>

            {/* Embossed Identifier in Card Typography */}
            <div className="my-3.5 relative z-10">
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold font-sans">
                {isOutflow ? 'Expense Voucher Ref' : 'Official Receipt Number'}
              </div>
              <div className={`font-heading font-bold text-lg sm:text-xl tracking-widest text-slate-100 transition-colors drop-shadow-sm font-sans ${
                isOutflow ? 'group-hover:text-rose-300' : 'group-hover:text-blue-300'
              }`}>
                {tx.receiptNumber}
              </div>
            </div>

            {/* Card Body: Amount & Category */}
            <div className="py-2.5 px-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-between relative z-10">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold font-sans">
                  {isOutflow ? 'Disbursed (Outflow)' : 'Amount Received'}
                </span>
                <span className={`text-xl font-heading font-extrabold font-sans tracking-tight ${
                  isOutflow ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {isOutflow ? '-' : '+'} {Number(tx.amount).toLocaleString()} <span className="text-xs text-white/70 font-sans">{currency}</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-semibold font-sans">
                  {isOutflow ? 'Category' : 'Purpose'}
                </span>
                <span className="text-xs font-semibold text-white truncate max-w-[120px] inline-block font-sans">
                  {tx.category || tx.paymentPurpose}
                </span>
              </div>
            </div>

            {/* Card Footer: Party Name & Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between relative z-10 text-xs">
              <div className="overflow-hidden pr-2">
                <div className="font-bold text-white truncate text-xs uppercase tracking-wide font-sans">
                  {isOutflow ? (tx.payee || tx.payerName) : tx.payerName}
                </div>
                <div className="text-[10px] text-slate-400 font-sans">
                  {tx.date} &bull; {tx.paymentMethod}
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {onShareWhatsApp && (
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => onShareWhatsApp(tx)}
                    title="Share via WhatsApp"
                    className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-emerald-500/10 transition cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </motion.button>
                )}

                {onPrintReceipt && (
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => onPrintReceipt(tx)}
                    title="Print Receipt"
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </motion.button>
                )}

                {onResendReceipt && (
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => onResendReceipt(tx.receiptNumber)}
                    title="Resend receipt email"
                    className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-blue-500/10 transition cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => onSelectReceipt(tx)}
                  title="View full receipt"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                </motion.button>

                {isAdminOrOwner && onDeleteReceipt && (
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => onDeleteReceipt(tx.receiptNumber)}
                    title="Delete record"
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
