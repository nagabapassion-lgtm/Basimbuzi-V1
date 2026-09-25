import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { WhatsAppShareModal } from './WhatsAppShareModal';
import { 
  CheckCircle2, 
  FileText, 
  Printer, 
  Mail, 
  PlusCircle, 
  ArrowRight, 
  RotateCw,
  Loader2,
  MessageSquare
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const SuccessView: React.FC = () => {
  const { 
    lastGeneratedReceipt, 
    setLastGeneratedReceipt, 
    setSelectedReceipt, 
    setActiveTab, 
    resendReceipt,
    settings,
    addToast
  } = useApp();
  
  const [isResending, setIsResending] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignore if confetti fails in sandboxed environment
    }
  }, []);

  if (!lastGeneratedReceipt) return null;

  const handlePrint = () => {
    setSelectedReceipt(lastGeneratedReceipt);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleResend = async () => {
    setIsResending(true);
    await resendReceipt(lastGeneratedReceipt.receiptNumber);
    setIsResending(false);
  };

  const handleNewReceipt = () => {
    setLastGeneratedReceipt(null);
    setActiveTab('generate');
  };

  const isEmailSent = lastGeneratedReceipt.emailStatus === 'SENT';

  return (
    <div id="receipt-success-view" className="max-w-2xl mx-auto py-8 px-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-colors">
        {/* Banner */}
        <div className={`p-8 text-center text-white ${isEmailSent ? 'bg-blue-600' : 'bg-amber-600'}`}>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-xs ring-8 ring-white/10">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isEmailSent ? 'Receipt Issued & Delivered' : 'Payment Recorded Successfully'}
          </h2>
          <p className="text-white/90 text-sm mt-1 max-w-md mx-auto">
            {isEmailSent 
              ? 'The payment has been registered into the ledger and the official receipt has been emailed to the payer.'
              : 'Payment recorded to ledger, but email delivery is pending or failed. You can resend below.'}
          </p>
        </div>

        {/* Receipt Overview Card */}
        <div className="p-6 sm:p-8">
          <div id="success-receipt-preview" className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 gap-2">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block uppercase font-medium">Receipt Number</span>
                <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{lastGeneratedReceipt.receiptNumber}</span>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400 block uppercase font-medium">Date & Time</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{lastGeneratedReceipt.date} &bull; {lastGeneratedReceipt.time}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-sm">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Payer Name</span>
                <span className="font-semibold text-slate-900 dark:text-white">{lastGeneratedReceipt.payerName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Payer Email</span>
                <span className="font-mono text-slate-800 dark:text-slate-300 text-xs break-all">{lastGeneratedReceipt.email}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Amount Paid</span>
                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                  {Number(lastGeneratedReceipt.amount).toLocaleString()} UGX
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Purpose</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">{lastGeneratedReceipt.paymentPurpose}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Payment Method</span>
                <span className="text-slate-800 dark:text-slate-200">{lastGeneratedReceipt.paymentMethod}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Email Delivery</span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isEmailSent 
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}>
                  <Mail className="w-3 h-3" />
                  {lastGeneratedReceipt.emailStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              id="btn-success-whatsapp-receipt"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/25 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Send Image to WhatsApp</span>
            </button>

            <button
              id="btn-success-view-receipt"
              onClick={() => setSelectedReceipt(lastGeneratedReceipt)}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>View Official Receipt</span>
            </button>

            <button
              id="btn-success-print-receipt"
              onClick={handlePrint}
              className="w-full py-3 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>

            <button
              id="btn-success-resend-receipt"
              onClick={handleResend}
              disabled={isResending}
              className="w-full py-3 px-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isResending ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <RotateCw className="w-4 h-4 text-blue-600" />
              )}
              <span>{isResending ? 'Resending Email...' : 'Resend Receipt Email'}</span>
            </button>

            <button
              id="btn-success-new-receipt"
              onClick={handleNewReceipt}
              className="w-full sm:col-span-2 py-3 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Issue New Receipt</span>
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setLastGeneratedReceipt(null);
                setActiveTab('transactions');
              }}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium inline-flex items-center gap-1 transition cursor-pointer"
            >
              <span>View all transactions in ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Share Modal */}
      {isWhatsAppModalOpen && lastGeneratedReceipt && (
        <WhatsAppShareModal
          receipt={lastGeneratedReceipt}
          settings={settings}
          receiptElementId="success-receipt-preview"
          onClose={() => setIsWhatsAppModalOpen(false)}
          onSuccessToast={(msg) => addToast(msg, 'success')}
        />
      )}
    </div>
  );
};
