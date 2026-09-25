import React, { useState, useEffect } from 'react';
import { Transaction, AppSettings } from '../types';
import { 
  renderReceiptToImage, 
  generateWhatsAppMessage, 
  openWhatsAppChat, 
  downloadReceiptImage, 
  copyReceiptImageToClipboard,
  shareReceiptViaWebShare,
  formatWhatsAppPhoneNumber
} from '../utils/whatsappReceipt';
import { 
  X, 
  Send, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  Phone, 
  MessageSquare, 
  FileImage,
  Smartphone,
  Eye,
  Maximize2
} from 'lucide-react';

interface WhatsAppShareModalProps {
  receipt: Transaction;
  settings: AppSettings;
  receiptElementId?: string;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  receipt,
  settings,
  onClose,
  onSuccessToast
}) => {
  const [phoneNumber, setPhoneNumber] = useState(receipt.phone || '');
  const [isGenerating, setIsGenerating] = useState(true);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  const message = generateWhatsAppMessage(receipt, settings);
  const cleanPhone = formatWhatsAppPhoneNumber(phoneNumber);

  useEffect(() => {
    let isMounted = true;

    const generate = async () => {
      setIsGenerating(true);
      try {
        const result = await renderReceiptToImage(receipt, settings);
        if (isMounted) {
          setImageBlob(result.blob);
          setImageDataUrl(result.dataUrl);
          setImageFile(result.file);
        }
      } catch (err) {
        console.error('Failed to generate receipt image:', err);
      } finally {
        if (isMounted) {
          setIsGenerating(false);
        }
      }
    };

    generate();

    return () => {
      isMounted = false;
    };
  }, [receipt, settings]);

  const handleCopyImage = async () => {
    if (!imageBlob) return;
    const success = await copyReceiptImageToClipboard(imageBlob);
    if (success) {
      setCopiedImage(true);
      if (onSuccessToast) onSuccessToast('Receipt image copied to clipboard!');
      setTimeout(() => setCopiedImage(false), 2500);
    } else {
      downloadReceiptImage(imageBlob, receipt.receiptNumber);
      if (onSuccessToast) onSuccessToast('Receipt PNG downloaded to your device!');
    }
  };

  const handleCopyText = async () => {
    await navigator.clipboard.writeText(message);
    setCopiedText(true);
    if (onSuccessToast) onSuccessToast('Message text copied to clipboard!');
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleDownloadImage = () => {
    if (!imageBlob) return;
    downloadReceiptImage(imageBlob, receipt.receiptNumber);
    if (onSuccessToast) onSuccessToast('Receipt image saved as PNG!');
  };

  const handleNativeShare = async () => {
    if (!imageFile) return;
    setIsSharing(true);
    try {
      const shared = await shareReceiptViaWebShare(imageFile, message, receipt.receiptNumber);
      if (shared) {
        if (onSuccessToast) onSuccessToast('Receipt shared successfully!');
        onClose();
      } else {
        openWhatsAppChat(phoneNumber, message);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleOpenWhatsApp = () => {
    if (imageBlob) {
      copyReceiptImageToClipboard(imageBlob);
    }
    openWhatsAppChat(phoneNumber, message);
    if (onSuccessToast) {
      onSuccessToast(`Opening WhatsApp chat for ${receipt.payerName}...`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 print:hidden animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-8 transition-colors">
        {/* Header */}
        <div className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15">
              <MessageSquare className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Send Receipt via WhatsApp</h3>
              <p className="text-[11px] text-emerald-100 font-mono">{receipt.receiptNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-emerald-600 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Recipient Phone Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
              Payer WhatsApp Phone Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4 text-emerald-600" />
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0772123456 or +256772123456"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            {cleanPhone ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                International WhatsApp Format: +{cleanPhone}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Enter phone number or launch WhatsApp to pick from contacts.
              </p>
            )}
          </div>

          {/* Generated Receipt Image Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileImage className="w-3.5 h-3.5 text-emerald-600" />
                <span>Generated Receipt Image (PNG)</span>
              </label>
              {imageDataUrl && (
                <button
                  type="button"
                  onClick={() => setShowFullPreview(!showFullPreview)}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>{showFullPreview ? 'Collapse Preview' : 'Full Preview'}</span>
                </button>
              )}
            </div>

            <div className={`border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800/80 p-3 ${showFullPreview ? 'max-h-96' : 'max-h-48'} overflow-y-auto flex items-center justify-center relative transition-all duration-300`}>
              {isGenerating ? (
                <div className="py-8 flex flex-col items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span>Rendering official receipt image...</span>
                </div>
              ) : imageDataUrl ? (
                <div className="relative group w-full flex justify-center">
                  <img
                    src={imageDataUrl}
                    alt={`Receipt ${receipt.receiptNumber}`}
                    className="w-full max-w-sm rounded-lg shadow-md border border-slate-200 bg-white object-contain"
                  />
                  <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    Ready
                  </div>
                </div>
              ) : (
                <div className="py-6 text-xs text-slate-400">Preview rendering completed.</div>
              )}
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="space-y-2.5 pt-1">
            {/* Primary: Open WhatsApp Chat & Share */}
            <button
              onClick={handleOpenWhatsApp}
              disabled={isGenerating}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/30 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Open WhatsApp Chat & Send Receipt</span>
            </button>

            {/* Native Mobile Share (Sends image + message directly into WhatsApp app) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                disabled={isGenerating || isSharing}
                className="w-full py-2.5 px-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4 text-emerald-600" />}
                <span>Direct Share to WhatsApp (with Attached Image)</span>
              </button>
            )}

            {/* Utility buttons: Download image & Copy */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isGenerating || !imageBlob}
                className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG Image</span>
              </button>

              <button
                type="button"
                onClick={handleCopyImage}
                disabled={isGenerating || !imageBlob}
                className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />}
                <span>{copiedImage ? 'Image Copied!' : 'Copy Image'}</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">
            💡 <span className="font-semibold text-slate-700 dark:text-slate-300">Quick WhatsApp Sending:</span> Click <strong>Open WhatsApp Chat</strong> to launch the conversation with the prefilled message. The HD receipt image is copied to your clipboard so you can immediately paste (<strong>Ctrl + V</strong> or <strong>Paste</strong>) into the WhatsApp chat box!
          </div>
        </div>
      </div>
    </div>
  );
};
