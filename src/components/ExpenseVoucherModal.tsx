import React, { useState } from 'react';
import { Transaction, AppSettings } from '../types';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import { printReceiptElement, downloadReceiptImage } from '../utils/printReceipt';
import { 
  X, 
  Printer, 
  Download, 
  FileCheck2, 
  Calendar, 
  User, 
  Tag, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2,
  Clock,
  Loader2,
  Building
} from 'lucide-react';

interface ExpenseVoucherModalProps {
  voucher: Transaction | null;
  onClose: () => void;
  settings: AppSettings;
}

export const ExpenseVoucherModal: React.FC<ExpenseVoucherModalProps> = ({
  voucher,
  onClose,
  settings
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!voucher) return null;

  const voucherNumber = voucher.receiptNumber || voucher.voucherNumber || 'EXP-VOUCHER';
  const logoSrc = (settings.logoUrl && !settings.logoUrl.endsWith('.svg')) ? settings.logoUrl : HARDCODED_LOGO_URL;

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printReceiptElement('printable-expense-voucher', voucherNumber);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadReceiptImage('printable-expense-voucher', voucherNumber);
    } finally {
      setIsDownloading(false);
    }
  };

  const formattedAmount = `${Number(voucher.amount).toLocaleString()} ${settings.currency || 'UGX'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full my-6 flex flex-col overflow-hidden transition-colors">
        {/* Modal Top Bar */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50 print:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                Official Expense Payment Voucher
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Ref: {voucherNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Print voucher"
            >
              {isPrinting ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" /> : <Printer className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Download voucher image"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" /> : <Download className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Voucher Content (Printable Slip) */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[80vh]">
          <div
            id="printable-expense-voucher"
            className="bg-white border-2 border-slate-900 rounded-2xl p-6 sm:p-7 text-slate-900 shadow-sm space-y-6 relative"
          >
            {/* Watermark badge */}
            <div className="absolute right-6 top-20 opacity-10 pointer-events-none select-none">
              <ShieldCheck className="w-48 h-48 text-rose-900" />
            </div>

            {/* Header: Crest & Organization */}
            <div className="flex items-center justify-between pb-5 border-b-2 border-slate-900 gap-4">
              <div className="flex items-center space-x-3.5">
                <img
                  src={logoSrc}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                  }}
                  crossOrigin="anonymous"
                  alt={settings.organizationName || 'SC Basimbuzi'}
                  className="w-14 h-14 object-contain rounded-2xl border border-slate-300 p-1 bg-white shadow-xs"
                />
                <div>
                  <h1 className="font-heading font-black text-lg sm:text-xl uppercase tracking-tight text-slate-950">
                    {settings.organizationName || 'SC BASIMBUZI'}
                  </h1>
                  <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                    Official Treasury Payment Voucher
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {settings.organizationAddress || 'Kampala, Uganda'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-mono font-black inline-block">
                  {voucherNumber}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{voucher.date} &bull; {voucher.time}</span>
                </div>
              </div>
            </div>

            {/* Prominent Amount Box */}
            <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 text-center">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-widest block mb-1">
                Total Amount Disbursed (Expense)
              </span>
              <div className="text-3xl sm:text-4xl font-heading font-black text-rose-700 tracking-tight font-sans">
                {formattedAmount}
              </div>
              <div className="mt-1 text-xs text-rose-900 font-medium flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Authorized Disbursement &bull; Paid Out</span>
              </div>
            </div>

            {/* Two-Column Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Payee Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Payee / Recipient
                </span>
                <div className="font-heading font-bold text-sm text-slate-900">
                  {voucher.payee || voucher.payerName}
                </div>
                {voucher.phone && (
                  <div className="text-slate-600 font-mono text-[11px]">
                    Phone: {voucher.phone}
                  </div>
                )}
                {voucher.email && (
                  <div className="text-slate-600 font-mono text-[11px] truncate">
                    Email: {voucher.email}
                  </div>
                )}
              </div>

              {/* Classification & Accounting */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Accounting & Category
                </span>
                <div className="font-semibold text-slate-900">
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px]">
                    {voucher.category || voucher.paymentPurpose || 'General Expense'}
                  </span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  Method: <span className="font-semibold text-slate-800">{voucher.paymentMethod}</span>
                </div>
                {voucher.paymentReference && (
                  <div className="text-slate-600 font-mono text-[11px]">
                    Ref: <span className="font-semibold text-slate-800">{voucher.paymentReference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes if present */}
            {voucher.notes && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Expenditure Purpose / Notes
                </span>
                <p className="italic">{voucher.notes}</p>
              </div>
            )}

            {/* Signatures & Seal Bar */}
            <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-6 text-[11px]">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                  Prepared By (Operator)
                </span>
                <p className="font-bold text-slate-900 mt-1 font-sans">
                  {voucher.generatedBy || 'SC Basimbuzi Accounts'}
                </p>
                <div className="h-6 border-b border-dashed border-slate-300 mt-1"></div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                  Approved By (Treasurer / Owner)
                </span>
                <p className="font-bold text-slate-900 mt-1 font-sans">
                  {voucher.approvedBy || 'Treasury Executive'}
                </p>
                <div className="h-6 border-b border-dashed border-slate-300 mt-1"></div>
              </div>
            </div>

            {/* Bottom Footer */}
            <div className="pt-2 text-center text-[10px] text-slate-400 font-mono">
              SC Basimbuzi Financial Ledger &bull; Dual-Sync Synchronized &bull; Official Expense Record
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40 print:hidden">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">
            Official digital expense voucher
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Slip</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center space-x-1.5 shadow-sm shadow-rose-600/20"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Official Voucher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
