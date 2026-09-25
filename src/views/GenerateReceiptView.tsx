import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Receipt, 
  Send, 
  User, 
  Mail, 
  Phone, 
  Banknote, 
  Tag, 
  CreditCard, 
  ShieldCheck, 
  AlertCircle,
  Loader2
} from 'lucide-react';

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

export const GenerateReceiptView: React.FC = () => {
  const { settings, generateReceipt } = useApp();

  const [payerName, setPayerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [paymentPurpose, setPaymentPurpose] = useState<string>(settings.paymentCategories[0] || 'Membership');
  const [paymentMethod, setPaymentMethod] = useState<string>(settings.paymentMethods[0] || 'Mobile Money');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!payerName.trim()) {
      setFormError('Please enter the payer\'s full name.');
      return;
    }

    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setFormError('Please enter a valid email address to receive the receipt.');
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid payment amount greater than zero.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await generateReceipt({
        payerName: payerName.trim(),
        phone: phone.trim(),
        email: cleanEmail,
        amount: numAmount,
        paymentPurpose,
        paymentMethod,
        paymentReference: paymentReference.trim(),
        notes: notes.trim()
      });

      if (res.success) {
        setPayerName('');
        setPhone('');
        setEmail('');
        setAmount('');
        setPaymentReference('');
        setNotes('');
      } else {
        setFormError(res.error || 'Failed to generate receipt. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`An error occurred: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Page Title & Intro */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Receipt className="w-5 h-5" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Generate & Send Receipt
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Record an incoming payment and immediately dispatch a branded official receipt to the payer.
        </p>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
        {formError && (
          <div className="bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900/60 p-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Validation Error</p>
              <p className="text-xs mt-0.5">{formError}</p>
            </div>
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-8">
          {/* Section 1: Payer Information */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                1. Payer Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="input-payer-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-payer-name"
                    type="text"
                    required
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="e.g. Emmanuel Ssenyonjo"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="input-payer-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address (Receipt recipient) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-payer-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. payer@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="input-payer-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Phone Number (optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    id="input-payer-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +256 772 123456"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Payment Information */}
          <div>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <Banknote className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                2. Payment Details
              </h2>
            </div>

            <div className="space-y-4">
              {/* Amount & Quick pills */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="input-amount" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Amount (UGX) <span className="text-red-500">*</span>
                  </label>
                  {amount && Number(amount) > 0 && (
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                      {Number(amount).toLocaleString()} UGX
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 font-bold text-xs text-slate-400">UGX</span>
                  <input
                    id="input-amount"
                    type="number"
                    min="100"
                    step="100"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 150000"
                    className="w-full pl-14 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-600 outline-none transition font-mono"
                  />
                </div>

                {/* Quick amount presets */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Quick:</span>
                  {QUICK_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAmount(val)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                        Number(amount) === val
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-600/20'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {val.toLocaleString()} UGX
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="select-payment-purpose" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Payment Purpose <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Tag className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <select
                      id="select-payment-purpose"
                      value={paymentPurpose}
                      onChange={(e) => setPaymentPurpose(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                    >
                      {settings.paymentCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="select-payment-method" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <select
                      id="select-payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                    >
                      {settings.paymentMethods.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="input-payment-ref" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Reference / Tx ID (optional)
                </label>
                <input
                  id="input-payment-ref"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. MM-98472910 or Bank Tx Ref"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition font-mono"
                />
              </div>

              <div>
                <label htmlFor="input-payment-notes" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Additional Notes (optional)
                </label>
                <textarea
                  id="input-payment-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Annual membership subscription for 2026/27 season"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Bottom Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 px-6 py-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>The payment will be recorded and an official receipt will be automatically emailed.</span>
          </div>

          <button
            id="btn-generate-send-receipt"
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-blue-600/20 shrink-0 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating & Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Generate & Send Receipt</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
