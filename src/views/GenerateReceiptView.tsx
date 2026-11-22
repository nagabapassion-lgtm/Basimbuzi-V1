import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { isValidEmail, isValidPhone, isValidAmount } from '../utils/security';
import { isStaffOrPlaceholderEmail } from '../utils/ledgerReconciliation';
import { SmartMemberAutofill } from '../components/SmartMemberAutofill';
import { ExpenseVoucherModal } from '../components/ExpenseVoucherModal';
import { Member, Transaction } from '../types';
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
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Sparkles,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Building,
  Check,
  Scale
} from 'lucide-react';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';

const QUICK_AMOUNTS = [
  { label: '50K', value: 50000 },
  { label: '100K', value: 100000 },
  { label: '200K', value: 200000 },
  { label: '500K', value: 500000 },
  { label: '1M', value: 1000000 }
];

const QUICK_EXPENSE_AMOUNTS = [
  { label: '50K', value: 50000 },
  { label: '100K', value: 100000 },
  { label: '200K', value: 200000 },
  { label: '500K', value: 500000 },
  { label: '1M', value: 1000000 },
  { label: '2M', value: 2000000 }
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
    scale: 0.98
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1]
    }
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.25,
      ease: [0.22, 1, 0.36, 1]
    }
  })
};

const DEFAULT_EXPENSE_CATEGORIES = [
  'Pitch Hire & Facilities',
  'Match Day & Referees',
  'Equipment & Kits',
  'Transport & Logistics',
  'Player Refreshments & Meals',
  'Medical & First Aid',
  'Administration & Utilities',
  'Tournament Entry Fee',
  'Other Expenses'
];

export const GenerateReceiptView: React.FC = () => {
  const { settings, generateReceipt, recordOutflow, currentUser, users, addToast } = useApp();

  // Mode: 'INFLOW' (Issue Receipt) vs 'OUTFLOW' (Record Expense)
  const [transactionMode, setTransactionMode] = useState<'INFLOW' | 'OUTFLOW'>(() => {
    try {
      const savedMode = sessionStorage.getItem('sc_generate_mode');
      if (savedMode === 'OUTFLOW' || savedMode === 'INFLOW') {
        sessionStorage.removeItem('sc_generate_mode');
        return savedMode;
      }
    } catch {}
    return 'INFLOW';
  });

  // Check sessionStorage on mount/updates
  useEffect(() => {
    try {
      const savedMode = sessionStorage.getItem('sc_generate_mode');
      if (savedMode === 'OUTFLOW' || savedMode === 'INFLOW') {
        setTransactionMode(savedMode);
        sessionStorage.removeItem('sc_generate_mode');
      }
    } catch {}
  }, []);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState<number>(1);

  // Inflow Form Fields
  const [payerName, setPayerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [paymentPurpose, setPaymentPurpose] = useState<string>(settings.paymentCategories[0] || 'Membership');
  const [paymentMethod, setPaymentMethod] = useState<string>(settings.paymentMethods[0] || 'Mobile Money');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [autofilledMember, setAutofilledMember] = useState<Member | null>(null);

  // Outflow Form Fields
  const [payee, setPayee] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<string>(() => {
    return (settings.expenseCategories && settings.expenseCategories[0]) || DEFAULT_EXPENSE_CATEGORIES[0];
  });
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseMethod, setExpenseMethod] = useState<string>(settings.paymentMethods[0] || 'Cash');
  const [expenseReference, setExpenseReference] = useState('');
  const [expensePurpose, setExpensePurpose] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Outflow Result Modal
  const [recordedVoucher, setRecordedVoucher] = useState<Transaction | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleQuickAmount = (val: number) => {
    setAmount(String(val));
  };

  const handleQuickExpenseAmount = (val: number) => {
    setExpenseAmount(String(val));
  };

  // Smart Autofill Handler: Populates returning payer from database
  const handleSelectMember = (payer: Member) => {
    setAutofilledMember(payer);
    setPayerName(payer.name);
    if (payer.phone) setPhone(payer.phone);
    if (payer.email) setEmail(payer.email);
    addToast(`Previous payer found: ${payer.name} • Auto-filled telephone & email`, 'success');
  };

  // Switch between INFLOW and OUTFLOW modes
  const handleSwitchMode = (mode: 'INFLOW' | 'OUTFLOW') => {
    setTransactionMode(mode);
    setStep(1);
    setFormError(null);
  };

  // Inflow Step 1 Validation
  const validateInflowStep1 = (): boolean => {
    setFormError(null);
    const cleanName = payerName.trim();
    if (!cleanName) {
      setFormError("Please enter the payer's full name.");
      return false;
    }
    if (cleanName.length > 100) {
      setFormError('Payer name cannot exceed 100 characters.');
      return false;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setFormError('Please enter a valid email address or leave it blank.');
      return false;
    }
    if (cleanEmail && isStaffOrPlaceholderEmail(cleanEmail, cleanName, users.map(u => u.email))) {
      setFormError("That is a club staff email, not the payer's personal email. Leave Email blank or enter the payer's own email.");
      return false;
    }
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setFormError("Please enter the payer's telephone or WhatsApp number.");
      return false;
    }
    if (!isValidPhone(cleanPhone)) {
      setFormError('Please enter a valid phone number (e.g. +256 700 123456).');
      return false;
    }
    return true;
  };

  // Inflow Step 2 Validation
  const validateInflowStep2 = (): boolean => {
    setFormError(null);
    const numAmount = Number(amount);
    if (!isValidAmount(numAmount)) {
      setFormError('Please enter a valid payment amount between 1 and 10,000,000,000 UGX.');
      return false;
    }
    if (paymentReference.length > 100) {
      setFormError('Payment reference cannot exceed 100 characters.');
      return false;
    }
    return true;
  };

  // Outflow Step 1 Validation
  const validateOutflowStep1 = (): boolean => {
    setFormError(null);
    const cleanPayee = payee.trim();
    if (!cleanPayee) {
      setFormError('Please enter the payee or vendor name.');
      return false;
    }
    if (cleanPayee.length > 120) {
      setFormError('Payee name cannot exceed 120 characters.');
      return false;
    }
    if (!expenseCategory) {
      setFormError('Please select an expense category.');
      return false;
    }
    return true;
  };

  // Outflow Step 2 Validation
  const validateOutflowStep2 = (): boolean => {
    setFormError(null);
    const numAmount = Number(expenseAmount);
    if (!isValidAmount(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid expense amount greater than 0 UGX.');
      return false;
    }
    const cleanPurpose = expensePurpose.trim();
    if (!cleanPurpose) {
      setFormError('Please provide a brief description or purpose for this expenditure.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (transactionMode === 'INFLOW') {
      if (step === 1) {
        if (!validateInflowStep1()) return;
        setDirection(1);
        setStep(2);
      } else if (step === 2) {
        if (!validateInflowStep2()) return;
        setDirection(1);
        setStep(3);
      }
    } else {
      if (step === 1) {
        if (!validateOutflowStep1()) return;
        setDirection(1);
        setStep(2);
      } else if (step === 2) {
        if (!validateOutflowStep2()) return;
        setDirection(1);
        setStep(3);
      }
    }
  };

  const handleBack = () => {
    setFormError(null);
    if (step === 3) {
      setDirection(-1);
      setStep(2);
    } else if (step === 2) {
      setDirection(-1);
      setStep(1);
    }
  };

  // Submit Inflow Receipt
  const handleInflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      handleNext();
      return;
    }

    if (!validateInflowStep1() || !validateInflowStep2()) return;

    if (notes.length > 500) {
      setFormError('Notes cannot exceed 500 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await generateReceipt({
        payerName: payerName.trim(),
        memberId: autofilledMember?.id || autofilledMember?.memberId,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        amount: Number(amount),
        paymentPurpose,
        paymentMethod,
        paymentReference: paymentReference.trim(),
        notes: notes.trim()
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to generate receipt. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`An error occurred: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Outflow Expense
  const handleOutflowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      handleNext();
      return;
    }

    if (!validateOutflowStep1() || !validateOutflowStep2()) return;

    setIsSubmitting(true);

    try {
      const res = await recordOutflow({
        payee: payee.trim(),
        amount: Number(expenseAmount),
        category: expenseCategory,
        paymentMethod: expenseMethod,
        paymentReference: expenseReference.trim(),
        notes: expenseNotes.trim() ? `${expensePurpose.trim()} — ${expenseNotes.trim()}` : expensePurpose.trim(),
        approvedBy: approvedBy.trim() || currentUser?.name || 'Executive Committee'
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to record expense. Please try again.');
      } else if (res.data) {
        setRecordedVoucher(res.data);
        // Reset form for next entry
        setPayee('');
        setExpenseAmount('');
        setExpensePurpose('');
        setExpenseReference('');
        setApprovedBy('');
        setExpenseNotes('');
        setStep(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`An error occurred: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoriesToUse = (settings.expenseCategories && settings.expenseCategories.length > 0)
    ? settings.expenseCategories
    : DEFAULT_EXPENSE_CATEGORIES;

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4">
      {/* Page Title & Intro */}
      <div className="mb-6 sm:mb-8 text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight font-heading">
          {transactionMode === 'INFLOW' ? 'Issue Official Receipt' : 'Record Operational Expense'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
          {transactionMode === 'INFLOW'
            ? 'Record an incoming payment and automatically dispatch a verified receipt to the payer via WhatsApp & Email with Dual-Writing ledger synchronization.'
            : 'Record an authorized club disbursement or expense voucher. Dual-written to primary and legacy master sheets without generating member receipts.'}
        </p>
      </div>

      {/* Top Segmented Mode Switcher (Open-Closed Architecture) */}
      <div className="mb-6 p-1.5 bg-slate-200/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl flex items-center border border-slate-300/60 dark:border-slate-700/60 shadow-inner">
        <button
          type="button"
          id="btn-mode-inflow"
          onClick={() => handleSwitchMode('INFLOW')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            transactionMode === 'INFLOW'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-white/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>Issue Receipt (Inflow)</span>
        </button>

        <button
          type="button"
          id="btn-mode-outflow"
          onClick={() => handleSwitchMode('OUTFLOW')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            transactionMode === 'OUTFLOW'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-white/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Record Expense (Outflow)</span>
        </button>
      </div>

      {/* Step Progress Bar */}
      <div className="mb-8 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
        <div className="flex items-center justify-between relative mb-2">
          {/* Connecting Background Line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 rounded-full z-0" />
          {/* Animated Active Progress Line */}
          <motion.div 
            className={`absolute left-6 top-1/2 -translate-y-1/2 h-1 rounded-full z-0 ${
              transactionMode === 'INFLOW'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
                : 'bg-gradient-to-r from-rose-600 to-pink-600'
            }`}
            initial={false}
            animate={{ 
              width: step === 1 ? '0%' : step === 2 ? '50%' : 'calc(100% - 3rem)' 
            }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />

          {/* Step 1 Node */}
          <button
            type="button"
            onClick={() => { if (step > 1) { setDirection(-1); setStep(1); } }}
            className={`relative z-10 flex flex-col items-center group cursor-pointer ${step >= 1 ? '' : 'opacity-60'}`}
          >
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-md ${
              step === 1 
                ? transactionMode === 'INFLOW'
                  ? 'bg-blue-600 text-white ring-4 ring-blue-500/20 shadow-blue-500/30'
                  : 'bg-rose-600 text-white ring-4 ring-rose-500/20 shadow-rose-500/30'
                : 'bg-emerald-600 text-white'
            }`}>
              {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : '1'}
            </div>
            <span className={`text-[11px] font-bold mt-1.5 transition-colors ${
              step === 1 
                ? transactionMode === 'INFLOW' ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}>
              {transactionMode === 'INFLOW' ? 'Member Details' : 'Payee & Category'}
            </span>
          </button>

          {/* Step 2 Node */}
          <button
            type="button"
            onClick={() => { 
              if (step > 2) { 
                setDirection(-1); 
                setStep(2); 
              } else if (step === 1 && (transactionMode === 'INFLOW' ? validateInflowStep1() : validateOutflowStep1())) { 
                setDirection(1); 
                setStep(2); 
              } 
            }}
            className={`relative z-10 flex flex-col items-center group cursor-pointer ${step >= 2 ? '' : 'opacity-60'}`}
          >
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-md ${
              step === 2 
                ? transactionMode === 'INFLOW'
                  ? 'bg-blue-600 text-white ring-4 ring-blue-500/20 shadow-blue-500/30'
                  : 'bg-rose-600 text-white ring-4 ring-rose-500/20 shadow-rose-500/30'
                : step > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
            }`}>
              {step > 2 ? <CheckCircle2 className="w-4 h-4" /> : '2'}
            </div>
            <span className={`text-[11px] font-bold mt-1.5 transition-colors ${
              step === 2 
                ? transactionMode === 'INFLOW' ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}>
              {transactionMode === 'INFLOW' ? 'Amount & Purpose' : 'Amount & Purpose'}
            </span>
          </button>

          {/* Step 3 Node */}
          <div className={`relative z-10 flex flex-col items-center ${step === 3 ? '' : 'opacity-60'}`}>
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs transition-all duration-200 shadow-md ${
              step === 3 
                ? transactionMode === 'INFLOW'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white ring-4 ring-indigo-500/20 shadow-indigo-500/30'
                  : 'bg-gradient-to-r from-rose-600 to-pink-600 text-white ring-4 ring-rose-500/20 shadow-rose-500/30'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
            }`}>
              3
            </div>
            <span className={`text-[11px] font-bold mt-1.5 transition-colors ${
              step === 3 
                ? transactionMode === 'INFLOW' ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}>
              {transactionMode === 'INFLOW' ? 'Review & Confirm' : 'Review & Authorize'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Wizard Form Card */}
      <form 
        onSubmit={transactionMode === 'INFLOW' ? handleInflowSubmit : handleOutflowSubmit}
        className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xl overflow-hidden transition-colors relative"
      >
        {formError && (
          <div className="bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900/60 p-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Validation Notice</p>
              <p className="text-xs mt-0.5">{formError}</p>
            </div>
          </div>
        )}

        <div className="p-6 sm:p-8 min-h-[380px]">
          <AnimatePresence custom={direction} mode="wait">
            
            {/* ========================================================================= */}
            {/* INFLOW MODE STEPS                                                         */}
            {/* ========================================================================= */}
            {transactionMode === 'INFLOW' && (
              <>
                {/* STEP 1: MEMBER DETAILS WITH SMART AUTOFILL */}
                {step === 1 && (
                  <motion.div
                    key="inflow-step-1"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 1: Payer Information
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Who is making this payment? Typing searches previous payers in the database to auto-fill their telephone &amp; email.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Smart Payer Autofill Component */}
                      <div>
                        <SmartMemberAutofill
                          id="input-payer-name"
                          value={payerName}
                          onChange={(val) => {
                            setPayerName(val);
                            if (autofilledMember && val !== autofilledMember.name) {
                              setAutofilledMember(null);
                            }
                          }}
                          onSelectMember={handleSelectMember}
                          required
                          autoFocus
                          label="Payer Full Name"
                          placeholder="Type payer name to search database..."
                        />
                        {autofilledMember && (
                          <div className="mt-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-2 shadow-xs animate-in fade-in">
                            <div className="flex items-start gap-2 min-w-0">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold text-emerald-900 dark:text-emerald-100">
                                  Previous Payer Record Found: {autofilledMember.name}
                                </p>
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                                  Auto-filled phone: <strong className="font-mono">{autofilledMember.phone || 'N/A'}</strong>
                                  {autofilledMember.email ? (
                                    <> &bull; Email: <strong className="font-sans">{autofilledMember.email}</strong></>
                                  ) : (
                                    ' • (No email was provided previously)'
                                  )}
                                  {autofilledMember.paymentCount && (
                                    <> &bull; {autofilledMember.paymentCount} previous {autofilledMember.paymentCount === 1 ? 'payment' : 'payments'}</>
                                  )}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAutofilledMember(null)}
                              className="text-[10px] text-emerald-700 hover:text-emerald-900 dark:hover:text-emerald-200 font-semibold underline shrink-0 cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>


                      {/* Phone with Floating Label */}
                      <div className="relative group">
                        <input
                          id="input-payer-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder=" "
                          required
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-payer-phone"
                          className="absolute left-4 top-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-emerald-600 dark:peer-focus:text-emerald-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Payer Phone / WhatsApp Number <span className="text-red-500">*</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-primary-600 dark:text-blue-400 font-medium px-1">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Official receipt image &amp; text will be automatically dispatched to this WhatsApp number</span>
                      </div>

                      {/* Email with Floating Label */}
                      <div className="relative group">
                        <input
                          id="input-payer-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder=" "
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-payer-email"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600 dark:peer-focus:text-blue-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Email Address (Optional — PDF receipt auto-sent if provided)
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: AMOUNT & CLASSIFICATION */}
                {step === 2 && (
                  <motion.div
                    key="inflow-step-2"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                        <Banknote className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 2: Payment Amount & Classification
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Specify the transaction sum and payment method
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Amount Field with Floating Label & Quick Pills */}
                      <div>
                        <div className="relative group">
                          <input
                            id="input-payment-amount"
                            type="number"
                            min="1"
                            step="any"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder=" "
                            autoFocus
                            required
                            className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white font-sans text-lg font-bold placeholder-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner"
                          />
                          <label
                            htmlFor="input-payment-amount"
                            className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600 dark:peer-focus:text-blue-400 peer-focus:uppercase peer-focus:tracking-wider"
                          >
                            Payment Amount in UGX <span className="text-red-500">*</span>
                          </label>
                          <div className="absolute right-4 top-4 text-xs font-bold font-sans text-blue-600 dark:text-blue-400 pointer-events-none">
                            UGX
                          </div>
                        </div>

                        {/* Quick Amount Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">Quick Add:</span>
                          {QUICK_AMOUNTS.map(qa => (
                            <button
                              key={qa.value}
                              type="button"
                              onClick={() => handleQuickAmount(qa.value)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                                amount === String(qa.value)
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {qa.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Payment Purpose */}
                        <div>
                          <label htmlFor="select-payment-purpose" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Payment Purpose / Income Category
                          </label>
                          <select
                            id="select-payment-purpose"
                            value={paymentPurpose}
                            onChange={(e) => setPaymentPurpose(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                          >
                            {settings.paymentCategories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>

                        {/* Payment Method */}
                        <div>
                          <label htmlFor="select-payment-method" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Payment Method
                          </label>
                          <select
                            id="select-payment-method"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                          >
                            {settings.paymentMethods.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Payment Reference */}
                      <div className="relative group">
                        <input
                          id="input-payment-ref"
                          type="text"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder=" "
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-payment-ref"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600 dark:peer-focus:text-blue-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Payment Reference / Mobile Money ID (Optional)
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: VERIFICATION & DISPATCH */}
                {step === 3 && (
                  <motion.div
                    key="inflow-step-3"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 3: Verification & Automatic Dispatch
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Review details before atomic numbering and dual-write database synchronization
                        </p>
                      </div>
                    </div>

                    {/* Live Card Preview */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 shadow-xl border border-white/10 relative overflow-hidden">
                      <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <img
                            src={settings.logoUrl || HARDCODED_LOGO_URL}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                            }}
                            alt="SC Basimbuzi"
                            className="w-7 h-7 object-contain rounded-full bg-white p-0.5 border border-white/20"
                          />
                          <span className="text-xs font-extrabold uppercase tracking-wider">
                            {settings.organizationName || 'SC Basimbuzi'}
                          </span>
                        </div>
                        <span className="text-[11px] font-sans font-bold text-blue-300">
                          NEXT IN SEQUENCE &bull; {settings.receiptPrefix || 'SB'}-2026-XXXXX
                        </span>
                      </div>

                      <div className="my-4 py-3 px-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">Total Inflow Amount</span>
                          <span className="text-2xl font-black font-sans text-emerald-400">
                            {Number(amount).toLocaleString()} UGX
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">Purpose</span>
                          <span className="text-xs font-bold text-white">{paymentPurpose}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Member Name</span>
                          <span className="font-bold text-white text-sm">{payerName}</span>
                          {email ? (
                            <span className="text-[11px] text-slate-300 block font-sans truncate">{email}</span>
                          ) : (
                            <span className="text-[11px] text-slate-400 block italic font-sans">No email provided</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Payment Method</span>
                          <span className="text-white font-medium">{paymentMethod}</span>
                          {paymentReference && (
                            <span className="text-[10px] text-slate-300 font-sans block">Ref: {paymentReference}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Automatic Dispatch Plan Status */}
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Automatic Dual-Write &amp; Dispatch Plan</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                          Dual-Write Active
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300 space-y-1.5 leading-relaxed">
                        <div className="flex items-center justify-between">
                          <span>• <strong>Database:</strong> Primary Sheet + Legacy Master Sheet Sync</span>
                          <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Dual-Write</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>• <strong>WhatsApp:</strong> Auto-dispatches to <strong className="font-mono">{phone}</strong></span>
                          <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Image + Text</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                          <span>• <strong>Email:</strong> {email ? <span>Auto-dispatches to <strong className="font-sans">{email}</strong></span> : <em>Not provided (optional)</em>}</span>
                          <span className={email ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-400"}>
                            {email ? 'Automated' : 'Skipped'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Additional Notes Field */}
                    <div className="relative group">
                      <textarea
                        id="input-payment-notes"
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder=" "
                        className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner"
                      />
                      <label
                        htmlFor="input-payment-notes"
                        className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600 dark:peer-focus:text-blue-400 peer-focus:uppercase peer-focus:tracking-wider"
                      >
                        Additional Notes / Payment Memo (Optional)
                      </label>
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {/* ========================================================================= */}
            {/* OUTFLOW MODE STEPS (Dedicated Record Expense View)                        */}
            {/* ========================================================================= */}
            {transactionMode === 'OUTFLOW' && (
              <>
                {/* OUTFLOW STEP 1: PAYEE & CATEGORY */}
                {step === 1 && (
                  <motion.div
                    key="outflow-step-1"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 1: Payee &amp; Expense Classification
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Who is the recipient or vendor for this club expenditure?
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Payee Name */}
                      <div className="relative group">
                        <input
                          id="input-expense-payee"
                          type="text"
                          value={payee}
                          onChange={(e) => setPayee(e.target.value)}
                          placeholder=" "
                          autoFocus
                          required
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-expense-payee"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Payee / Vendor / Recipient Name <span className="text-red-500">*</span>
                        </label>
                      </div>

                      {/* Expense Category & Payment Method Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="select-expense-category" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Expense Category <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="select-expense-category"
                            value={expenseCategory}
                            onChange={(e) => setExpenseCategory(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition"
                          >
                            {categoriesToUse.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="select-expense-method" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Payment Method <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="select-expense-method"
                            value={expenseMethod}
                            onChange={(e) => setExpenseMethod(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition"
                          >
                            {settings.paymentMethods.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Payment Reference / Invoice No */}
                      <div className="relative group">
                        <input
                          id="input-expense-ref"
                          type="text"
                          value={expenseReference}
                          onChange={(e) => setExpenseReference(e.target.value)}
                          placeholder=" "
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-expense-ref"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Invoice / Cheque / Transaction Reference (Optional)
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* OUTFLOW STEP 2: AMOUNT & PURPOSE */}
                {step === 2 && (
                  <motion.div
                    key="outflow-step-2"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                        <Banknote className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 2: Disbursement Amount &amp; Purpose
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Enter amount and explain the specific purpose of this expenditure
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Amount with Floating Label & Quick Pills */}
                      <div>
                        <div className="relative group">
                          <input
                            id="input-expense-amount"
                            type="number"
                            min="1"
                            step="any"
                            value={expenseAmount}
                            onChange={(e) => setExpenseAmount(e.target.value)}
                            placeholder=" "
                            autoFocus
                            required
                            className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white font-sans text-lg font-bold placeholder-transparent focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                          />
                          <label
                            htmlFor="input-expense-amount"
                            className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                          >
                            Disbursement Amount in UGX <span className="text-red-500">*</span>
                          </label>
                          <div className="absolute right-4 top-4 text-xs font-bold font-sans text-rose-600 dark:text-rose-400 pointer-events-none">
                            UGX
                          </div>
                        </div>

                        {/* Quick Expense Amount Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase mr-1">Quick Add:</span>
                          {QUICK_EXPENSE_AMOUNTS.map(qa => (
                            <button
                              key={qa.value}
                              type="button"
                              onClick={() => handleQuickExpenseAmount(qa.value)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                                expenseAmount === String(qa.value)
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {qa.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Description / Purpose of Expenditure */}
                      <div className="relative group">
                        <input
                          id="input-expense-purpose"
                          type="text"
                          value={expensePurpose}
                          onChange={(e) => setExpensePurpose(e.target.value)}
                          placeholder=" "
                          required
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-expense-purpose"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Purpose / Description of Expenditure <span className="text-red-500">*</span>
                        </label>
                      </div>

                      {/* Approved By / Authorizing Officer */}
                      <div className="relative group">
                        <input
                          id="input-expense-approved"
                          type="text"
                          value={approvedBy}
                          onChange={(e) => setApprovedBy(e.target.value)}
                          placeholder=" "
                          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                        />
                        <label
                          htmlFor="input-expense-approved"
                          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                        >
                          Authorized / Approved By (e.g. Treasurer, Chairman)
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* OUTFLOW STEP 3: REVIEW & AUTHORIZE */}
                {step === 3 && (
                  <motion.div
                    key="outflow-step-3"
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                          Step 3: Verification &amp; Expense Authorization
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Confirm disbursement details. An official Expense Voucher will be recorded and dual-written.
                        </p>
                      </div>
                    </div>

                    {/* Voucher Preview Card */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 text-white rounded-3xl p-6 shadow-xl border border-white/10 relative overflow-hidden">
                      <div className="flex items-center justify-between pb-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <img
                            src={settings.logoUrl || HARDCODED_LOGO_URL}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                            }}
                            alt="SC Basimbuzi"
                            className="w-7 h-7 object-contain rounded-full bg-white p-0.5 border border-white/20"
                          />
                          <div>
                            <span className="text-xs font-extrabold uppercase tracking-wider block">
                              {settings.organizationName || 'SC Basimbuzi'}
                            </span>
                            <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider">
                              Official Expense Voucher
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-sans font-bold text-rose-300">
                          OUTFLOW &bull; EXP-2026-XXXXX
                        </span>
                      </div>

                      <div className="my-4 py-3 px-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-rose-300 block font-semibold">Total Outflow Amount</span>
                          <span className="text-2xl font-black font-sans text-rose-400">
                            - {Number(expenseAmount).toLocaleString()} UGX
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">Category</span>
                          <span className="text-xs font-bold text-white">{expenseCategory}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Payee / Recipient</span>
                          <span className="font-bold text-white text-sm">{payee}</span>
                          <span className="text-[11px] text-slate-300 block font-sans truncate">{expensePurpose}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Method &amp; Approval</span>
                          <span className="text-white font-medium">{expenseMethod}</span>
                          <span className="text-[10px] text-rose-300 font-sans block">
                            Approved: {approvedBy.trim() || currentUser?.name || 'Executive Committee'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Ledger Safety & Dual-Write Notice */}
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/40 rounded-2xl border border-rose-200 dark:border-rose-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-900 dark:text-rose-200">
                          <Scale className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>Ledger Balance &amp; Dual-Write Impact</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100">
                          Expenditure Deducted
                        </span>
                      </div>
                      <div className="text-[11px] text-rose-800 dark:text-rose-300 space-y-1 leading-relaxed">
                        <p>• Deducts <strong>{Number(expenseAmount).toLocaleString()} UGX</strong> from the Net Treasury Balance.</p>
                        <p>• Saved to internal Transactions sheet and simultaneously appended to the legacy master spreadsheet.</p>
                        <p>• <strong>Strict Separation:</strong> Does not generate a member payment receipt or register as club income.</p>
                      </div>
                    </div>

                    {/* Additional Notes Field */}
                    <div className="relative group">
                      <textarea
                        id="input-expense-notes"
                        rows={2}
                        value={expenseNotes}
                        onChange={(e) => setExpenseNotes(e.target.value)}
                        placeholder=" "
                        className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all duration-200 shadow-inner"
                      />
                      <label
                        htmlFor="input-expense-notes"
                        className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-rose-600 dark:peer-focus:text-rose-400 peer-focus:uppercase peer-focus:tracking-wider"
                      >
                        Additional Internal Notes / Audit Memo (Optional)
                      </label>
                    </div>
                  </motion.div>
                )}
              </>
            )}

          </AnimatePresence>
        </div>

        {/* Wizard Footer Navigation Controls */}
        <div className="px-6 sm:px-8 py-5 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous Step</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                Step 1 of 3
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className={`px-6 py-2.5 rounded-2xl text-white text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer ${
                  transactionMode === 'INFLOW'
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-600/30'
                    : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-rose-600/30'
                }`}
              >
                <span>Continue to {step === 1 ? 'Amount' : 'Review'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : transactionMode === 'INFLOW' ? (
              <button
                type="submit"
                id="btn-submit-generate-receipt"
                disabled={isSubmitting}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white text-xs font-extrabold tracking-wide transition-all shadow-xl shadow-blue-600/30 border border-white/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Issuing &amp; Dispatching via WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    <span>Issue &amp; Dispatch via WhatsApp</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                id="btn-submit-record-expense"
                disabled={isSubmitting}
                className="px-7 py-3 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 active:scale-[0.98] text-white text-xs font-extrabold tracking-wide transition-all shadow-xl shadow-rose-600/30 border border-white/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Recording Expense Voucher...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Authorize &amp; Record Expense</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Render Expense Voucher Modal when recorded */}
      {recordedVoucher && (
        <ExpenseVoucherModal
          voucher={recordedVoucher}
          settings={settings}
          onClose={() => setRecordedVoucher(null)}
        />
      )}
    </div>
  );
};
