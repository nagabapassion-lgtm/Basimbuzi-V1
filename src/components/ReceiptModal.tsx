import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WhatsAppShareModal } from './WhatsAppShareModal';
import { 
  X, 
  Printer, 
  Mail, 
  ShieldCheck, 
  Clock, 
  FileText,
  Building,
  Phone,
  Loader2,
  Trash2,
  AlertTriangle,
  Share2,
  MessageSquare
} from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const { selectedReceipt, setSelectedReceipt, resendReceipt, deleteTransaction, currentUser, userPermissions, settings, addToast } = useApp();
  const [isResending, setIsResending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  if (!selectedReceipt) return null;

  const isOwner = currentUser?.role === 'OWNER';
  const canDelete = isOwner || userPermissions.canDeleteTransactions;

  const handlePrint = () => {
    window.print();
  };

  const handleResend = async () => {
    setIsResending(true);
    await resendReceipt(selectedReceipt.receiptNumber);
    setIsResending(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteTransaction(selectedReceipt.receiptNumber);
      setSelectedReceipt(null);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formattedAmount = `${Number(selectedReceipt.amount).toLocaleString()} UGX`;
  const isSent = selectedReceipt.emailStatus === 'SENT';

  return (
    <div 
      id="receipt-modal-backdrop" 
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static animate-in fade-in"
    >
      <div 
        id="receipt-modal-container"
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-8 print:my-0 print:border-none print:shadow-none transition-colors"
      >
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm tracking-wide">Receipt Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="btn-whatsapp-receipt-modal"
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Send to WhatsApp</span>
            </button>

            <button
              id="btn-print-receipt-modal"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              id="btn-resend-receipt-modal"
              onClick={handleResend}
              disabled={isResending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              <span>{isResending ? 'Sending...' : 'Resend Email'}</span>
            </button>

            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete Receipt"
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setSelectedReceipt(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation Alert (In Modal) */}
        {showDeleteConfirm && (
          <div className="p-4 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900/60 flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-300 print:hidden">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Confirm permanent deletion of receipt #{selectedReceipt.receiptNumber}?</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Delete Now'}
              </button>
            </div>
          </div>
        )}

        {/* Official Printable Receipt Content (Always clean white for crisp printing) */}
        <div id="printable-receipt" className="p-8 sm:p-10 bg-white print:p-6 text-slate-900">
          {/* Header with Logo */}
          <div className="border-b-2 border-slate-900 pb-6 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt={settings.organizationName || 'SC Basimbuzi'}
                    className="w-12 h-12 object-contain rounded-xl border border-slate-200 p-1 bg-white"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                    SB
                  </div>
                )}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">
                    {settings.organizationName || 'SC BASIMBUZI'}
                  </h1>
                  <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
                    Official Digital Payment Receipt
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none w-full sm:w-auto border sm:border-0 border-slate-200">
                <div className="text-xs font-mono font-bold text-blue-600 uppercase">
                  {selectedReceipt.receiptNumber}
                </div>
                <div className="text-xs text-slate-500 flex sm:justify-end items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedReceipt.date} &bull; {selectedReceipt.time}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Prominent Amount Box */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5 mb-6 text-center">
            <div className="text-xs font-bold text-blue-800 tracking-wider uppercase mb-1">
              Amount Received
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-blue-700 tracking-tight font-mono">
              {formattedAmount}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                {selectedReceipt.paymentStatus}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isSent ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
              }`}>
                <Mail className="w-3.5 h-3.5" />
                Email: {selectedReceipt.emailStatus}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 text-sm">
            {/* Payer Information */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Payer Information
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-slate-500 block">Full Name</span>
                  <span className="font-semibold text-slate-900">{selectedReceipt.payerName}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Email Address</span>
                  <span className="font-mono text-slate-800 break-all">{selectedReceipt.email}</span>
                </div>
                {selectedReceipt.phone && (
                  <div>
                    <span className="text-xs text-slate-500 block">Phone Number</span>
                    <span className="text-slate-800">{selectedReceipt.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Details */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Payment Details
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-slate-500 block">Purpose</span>
                  <span className="font-semibold text-slate-900">{selectedReceipt.paymentPurpose}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Payment Method</span>
                  <span className="text-slate-800">{selectedReceipt.paymentMethod}</span>
                </div>
                {selectedReceipt.paymentReference && (
                  <div>
                    <span className="text-xs text-slate-500 block">Reference / Transaction ID</span>
                    <span className="font-mono font-medium text-slate-800">{selectedReceipt.paymentReference}</span>
                  </div>
                )}
                <div>
                  <span className="text-xs text-slate-500 block">Recorded By</span>
                  <span className="text-slate-800 font-medium">{selectedReceipt.generatedBy}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes (if any) */}
          {selectedReceipt.notes && (
            <div className="bg-slate-50 border-l-4 border-blue-600 p-4 rounded-r-xl mb-8 text-xs text-slate-700">
              <span className="font-bold text-slate-900 block mb-1">Payment Notes:</span>
              <p className="leading-relaxed">{selectedReceipt.notes}</p>
            </div>
          )}

          {/* Verification & Footer */}
          <div className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500 space-y-2">
            <p className="font-semibold text-slate-700">
              {settings.receiptFooter || 'Thank you for your payment to SC Basimbuzi.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-slate-500 text-[11px]">
              {settings.organizationAddress && (
                <span className="flex items-center gap-1">
                  <Building className="w-3 h-3" /> {settings.organizationAddress}
                </span>
              )}
              {settings.organizationPhone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {settings.organizationPhone}
                </span>
              )}
              {settings.organizationEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {settings.organizationEmail}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono pt-2">
              Electronically generated by SC Basimbuzi System &bull; Receipt ID: {selectedReceipt.receiptNumber}
            </p>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden in Print) */}
        <div className="bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden transition-colors">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Payer notification: {isSent ? 'Delivered to ' + selectedReceipt.email : 'Email delivery status: ' + selectedReceipt.emailStatus}
          </span>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="flex-1 sm:flex-initial px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => setIsWhatsAppModalOpen(true)}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Share Modal */}
      {isWhatsAppModalOpen && selectedReceipt && (
        <WhatsAppShareModal
          receipt={selectedReceipt}
          settings={settings}
          receiptElementId="printable-receipt"
          onClose={() => setIsWhatsAppModalOpen(false)}
          onSuccessToast={(msg) => addToast(msg, 'success')}
        />
      )}
    </div>
  );
};
