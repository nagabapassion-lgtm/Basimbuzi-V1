import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { WhatsAppShareModal } from './WhatsAppShareModal';
import { printReceiptElement } from '../utils/printReceipt';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import { 
  renderReceiptToImage, 
  generateWhatsAppMessage, 
  openWhatsAppChat, 
  copyReceiptImageToClipboard,
  shareReceiptViaWebShare,
  isMobileDevice
} from '../utils/whatsappReceipt';
import { 
  Download, 
  Printer, 
  PlusCircle, 
  ArrowRight, 
  RotateCw,
  Loader2,
  MessageSquare,
  Sparkles,
  FileCheck2,
  Check,
  Send,
  Smartphone
} from 'lucide-react';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas-pro';

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isPrepWhatsApp, setIsPrepWhatsApp] = useState(true);
  const [whatsAppImageBlob, setWhatsAppImageBlob] = useState<Blob | null>(null);
  const [whatsAppImageFile, setWhatsAppImageFile] = useState<File | null>(null);
  const [isSharingNative, setIsSharingNative] = useState(false);
  const receiptCardRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    try {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.55 },
        colors: ['#2563eb', '#3b82f6', '#10b981', '#6366f1', '#f59e0b']
      });
    } catch {
      // Ignore if canvas fails in test/headless environment
    }
  }, []);

  // 1. Immediately auto-open WhatsApp chat on mount without waiting for image rendering
  useEffect(() => {
    if (!lastGeneratedReceipt || autoOpenedRef.current) return;
    autoOpenedRef.current = true;

    const message = generateWhatsAppMessage(lastGeneratedReceipt, settings);
    openWhatsAppChat(lastGeneratedReceipt.phone, message);
    addToast(`WhatsApp auto-opened for ${lastGeneratedReceipt.payerName}! Preparing receipt image for clipboard...`, 'success');
  }, [lastGeneratedReceipt, settings, addToast]);

  // 2. In parallel background, render the high-definition receipt image and prime clipboard
  useEffect(() => {
    let active = true;
    if (!lastGeneratedReceipt) return;

    const prep = async () => {
      setIsPrepWhatsApp(true);
      try {
        const res = await renderReceiptToImage(lastGeneratedReceipt, settings);
        if (active) {
          setWhatsAppImageBlob(res.blob);
          setWhatsAppImageFile(res.file);
          // Prime clipboard automatically with the HD receipt image
          await copyReceiptImageToClipboard(res.blob);
        }
      } catch (err) {
        console.warn('Failed to pre-render WhatsApp receipt image:', err);
      } finally {
        if (active) setIsPrepWhatsApp(false);
      }
    };

    prep();
    return () => { active = false; };
  }, [lastGeneratedReceipt, settings]);

  if (!lastGeneratedReceipt) return null;

  const handleDispatchWhatsApp = async () => {
    if (!lastGeneratedReceipt) return;
    const message = generateWhatsAppMessage(lastGeneratedReceipt, settings);
    
    // Ensure receipt image is copied to clipboard
    if (whatsAppImageBlob) {
      await copyReceiptImageToClipboard(whatsAppImageBlob);
    }
    
    openWhatsAppChat(lastGeneratedReceipt.phone, message);
    addToast(`Opening WhatsApp chat for ${lastGeneratedReceipt.payerName}! Official image is copied to clipboard — paste (Ctrl+V) into chat.`, 'success');
  };

  const handleNativeShareWhatsApp = async () => {
    if (!lastGeneratedReceipt || !whatsAppImageFile) return;
    setIsSharingNative(true);
    try {
      const message = generateWhatsAppMessage(lastGeneratedReceipt, settings);
      const shared = await shareReceiptViaWebShare(whatsAppImageFile, message, lastGeneratedReceipt.receiptNumber);
      if (shared) {
        addToast('Receipt shared via WhatsApp with image & text!', 'success');
      } else {
        handleDispatchWhatsApp();
      }
    } finally {
      setIsSharingNative(false);
    }
  };

  const handleDownload = async () => {
    if (!receiptCardRef.current) return;
    setIsDownloading(true);
    try {
      // Ensure all elements and styles are rendered
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Wait for images inside to load
      const images = Array.from(receiptCardRef.current.getElementsByTagName('img')) as HTMLImageElement[];
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                resolve();
              } else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 1000);
              }
            })
        )
      );

      const canvas = await html2canvas(receiptCardRef.current, {
        useCORS: true,
        allowTaint: false,
        scale: 2.5,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const image = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = image;
      link.download = `SC_Basimbuzi_Receipt_${lastGeneratedReceipt.receiptNumber}.png`;
      link.click();
      addToast('Official receipt image downloaded!', 'success');
    } catch (err) {
      console.error('html2canvas download error:', err);
      addToast('Download failed. You can print or view PDF.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = async () => {
    setSelectedReceipt(lastGeneratedReceipt);
    addToast('Preparing official printable receipt...', 'info');
    try {
      const res = await printReceiptElement('success-receipt-preview', lastGeneratedReceipt.receiptNumber);
      if (res.message) {
        addToast(res.message, 'success');
      } else if (res.success) {
        addToast('Print dialog opened!', 'success');
      } else {
        await handleDownload();
      }
    } catch {
      await handleDownload();
    }
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

  const hasEmail = Boolean(
    lastGeneratedReceipt.email && 
    lastGeneratedReceipt.email.trim() && 
    !lastGeneratedReceipt.email.toLowerCase().includes('noreply') && 
    !lastGeneratedReceipt.email.toLowerCase().includes('no-reply') &&
    lastGeneratedReceipt.emailStatus !== 'NOT_PROVIDED'
  );

  return (
    <div id="receipt-success-view" className="min-h-[85vh] flex items-center justify-center py-8 px-4 relative">
      {/* Outer Glowing Pulsing Border Wrapper */}
      <motion.div
        initial={{ scale: 0.78, opacity: 0, y: 35 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ 
          type: 'spring', 
          damping: 22, 
          stiffness: 280,
          mass: 0.9
        }}
        className="w-full max-w-2xl relative rounded-[2rem] p-[2px] bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 shadow-[0_0_60px_rgba(16,185,129,0.3)] dark:shadow-[0_0_80px_rgba(16,185,129,0.2)]"
      >
        {/* Main Frosted Glass Modal Body */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[1.9rem] overflow-hidden border border-white/20 dark:border-slate-800 transition-colors">
          
          {/* Header Banner with Animated SVG Checkmark */}
          <div className="relative overflow-hidden pt-10 pb-8 px-6 text-center text-white bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-900/70 border-b border-white/10">
            {/* Ambient internal light */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Animated SVG Checkmark */}
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-950/60 border border-emerald-500/40 shadow-lg shadow-emerald-500/20 mb-4 backdrop-blur-md">
              <svg className="w-12 h-12 text-emerald-400" viewBox="0 0 52 52">
                <motion.circle
                  cx="26"
                  cy="26"
                  r="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
                <motion.path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 27l8 8 16-16"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, delay: 0.35, ease: "easeOut" }}
                />
              </svg>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs font-bold tracking-widest text-emerald-400 uppercase mb-1">
              <span>Official Transaction Confirmed</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-heading">
              Receipt Issued &amp; Dispatched via WhatsApp!
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-lg mx-auto leading-relaxed">
              {hasEmail ? (
                <>Official receipt dispatched automatically to <span className="font-semibold text-white">{lastGeneratedReceipt.phone}</span> via WhatsApp (with image &amp; text). An official copy was also emailed to <span className="font-semibold text-white">{lastGeneratedReceipt.email}</span>.</>
              ) : (
                <>Official receipt dispatched automatically to <span className="font-semibold text-white">{lastGeneratedReceipt.phone}</span> via WhatsApp (with official receipt image &amp; text message).</>
              )}
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {/* Automatic WhatsApp Dispatch Card */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs sm:text-sm text-emerald-950 dark:text-emerald-200 uppercase tracking-wider">
                      Automatic WhatsApp Dispatch
                    </h4>
                   
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    Recipient: <strong className="font-sans text-emerald-700 dark:text-emerald-300">{lastGeneratedReceipt.phone}</strong> &bull; Member: <strong>{lastGeneratedReceipt.payerName}</strong>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 pt-0.5">
                    
                    {hasEmail ? (
                      <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium">
                        <Check className="w-3.5 h-3.5" /> Emailed automatically ({lastGeneratedReceipt.email})
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">
                        ℹ No email provided (WhatsApp only)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                {isMobileDevice() && typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleNativeShareWhatsApp}
                    disabled={isPrepWhatsApp || isSharingNative}
                    className="px-3.5 py-2.5 bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSharingNative ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                    <span>Direct Share</span>
                  </button>
                )}
                <button
                  onClick={handleDispatchWhatsApp}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Open WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Receipt Preview & Summary Card */}
            <div 
              ref={receiptCardRef}
              id="success-receipt-preview" 
              className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-white/10 relative overflow-hidden"
            >
              {/* Decorative crest watermark */}
              <div className="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
              
              <div className="flex items-center justify-between pb-5 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <img
                    src={settings.logoUrl || HARDCODED_LOGO_URL}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                    }}
                    alt="SC Basimbuzi"
                    className="w-10 h-10 object-contain rounded-full border border-white/20 p-0.5 bg-white shadow-md"
                  />
                  <div>
                    <h3 className="font-extrabold text-xs uppercase tracking-wider text-white">
                      {settings.organizationName || 'SC Basimbuzi'}
                    </h3>
                    <p className="text-[10px] text-slate-400">Official Electronic Receipt</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest">Receipt Number</div>
                  <div className="font-sans text-base font-bold text-blue-300 tracking-wider">
                    {lastGeneratedReceipt.receiptNumber}
                  </div>
                </div>
              </div>

              {/* Amount Display */}
              <div className="my-5 py-4 px-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                    Amount Received
                  </span>
                  <span className="text-2xl sm:text-3xl font-black font-sans text-emerald-400">
                    {Number(lastGeneratedReceipt.amount).toLocaleString()} <span className="text-xs text-white/70">UGX</span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <Check className="w-3 h-3" />
                    PAID
                  </span>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Payer</span>
                  <span className="font-bold text-white text-sm">{lastGeneratedReceipt.payerName}</span>
                  <span className="text-[11px] text-emerald-300 block font-sans font-medium">{lastGeneratedReceipt.phone}</span>
                  {hasEmail && (
                    <span className="text-[11px] text-slate-400 block font-sans truncate">{lastGeneratedReceipt.email}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Date & Time</span>
                  <span className="text-white font-medium">{lastGeneratedReceipt.date}</span>
                  <span className="text-[11px] text-slate-400 block">{lastGeneratedReceipt.time}</span>
                </div>
                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Purpose</span>
                  <span className="text-slate-200 font-medium">{lastGeneratedReceipt.paymentPurpose}</span>
                </div>
                <div className="text-right pt-2">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Payment Method</span>
                  <span className="text-slate-200 font-medium">{lastGeneratedReceipt.paymentMethod}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* PRIMARY: WhatsApp Share Modal / Launcher */}
              <button
                id="btn-success-whatsapp-receipt"
                onClick={() => setIsWhatsAppModalOpen(true)}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Send via WhatsApp (Image + Text)</span>
              </button>

              {/* Download PNG */}
              <button
                id="btn-success-download-receipt"
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white text-xs font-bold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md shadow-blue-600/25 border border-white/20 cursor-pointer"
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isDownloading ? 'Generating Image...' : 'Download Official PNG'}</span>
              </button>

              {/* View Full Modal */}
              <button
                id="btn-success-view-receipt"
                onClick={() => setSelectedReceipt(lastGeneratedReceipt)}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Inspect Full Receipt</span>
              </button>

              {/* Print */}
              <button
                id="btn-success-print-receipt"
                onClick={handlePrint}
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>

              {/* Resend Email Button (if email was provided) */}
              {hasEmail && (
                <button
                  id="btn-success-resend-receipt"
                  onClick={handleResend}
                  disabled={isResending}
                  className="w-full py-3 px-4 bg-blue-50/80 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isResending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <RotateCw className="w-4 h-4 text-blue-600" />
                  )}
                  <span>{isResending ? 'Resending...' : 'Resend Email Receipt'}</span>
                </button>
              )}

              {/* Issue New Receipt */}
              <button
                id="btn-success-new-receipt"
                onClick={handleNewReceipt}
                className={`w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm ${!hasEmail ? 'sm:col-span-2' : ''}`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Next Receipt</span>
              </button>
            </div>

            {/* Bottom Link */}
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  setLastGeneratedReceipt(null);
                  setActiveTab('transactions');
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>View all transactions in ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

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
