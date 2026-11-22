import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { AppSettings, ThemeMode } from '../types';
import { 
  Settings as SettingsIcon, 
  Save, 
  Building, 
  Hash, 
  Tag, 
  X,
  Loader2,
  CheckCircle2,
  UploadCloud,
  Trash2,
  Eye,
  Sun,
  Moon,
  Palette,
  Globe,
  Sparkles,
  HelpCircle,
  Check,
  RotateCw,
  Database,
  Layers,
  ArrowUpRight,
  FileSpreadsheet,
  Scale,
  Calendar,
  DollarSign,
  History
} from 'lucide-react';

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

export const SettingsView: React.FC = () => {
  const { settings, saveSettings, currentUser, theme, setTheme, addToast } = useApp();

  const isDirtyRef = useRef(false);
  const [form, setForm] = useState<AppSettings>({ 
    ...settings,
    expenseCategories: settings.expenseCategories || DEFAULT_EXPENSE_CATEGORIES
  });
  const [newCategory, setNewCategory] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState('');
  const [newMethod, setNewMethod] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const isOwner = currentUser?.role === 'OWNER';

  useEffect(() => {
    if (!isDirtyRef.current) {
      setForm({
        ...settings,
        expenseCategories: settings.expenseCategories || DEFAULT_EXPENSE_CATEGORIES
      });
    }
  }, [settings]);

  if (!isOwner) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl p-8">
          <SettingsIcon className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 dark:text-red-300">Owner Access Required</h2>
          <p className="text-sm text-red-700 dark:text-red-400 mt-2">
            System settings are restricted to the System Owner.
          </p>
        </div>
      </div>
    );
  }

  const handleAddCategory = () => {
    if (newCategory.trim() && !form.paymentCategories.includes(newCategory.trim())) {
      isDirtyRef.current = true;
      setForm(prev => ({
        ...prev,
        paymentCategories: [...prev.paymentCategories, newCategory.trim()]
      }));
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (catToRemove: string) => {
    if (form.paymentCategories.length <= 1) {
      addToast('At least one payment category is required.', 'error');
      return;
    }
    isDirtyRef.current = true;
    setForm(prev => ({
      ...prev,
      paymentCategories: prev.paymentCategories.filter(c => c !== catToRemove)
    }));
  };

  const handleAddExpenseCategory = () => {
    const list = form.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
    if (newExpenseCategory.trim() && !list.includes(newExpenseCategory.trim())) {
      isDirtyRef.current = true;
      setForm(prev => ({
        ...prev,
        expenseCategories: [...(prev.expenseCategories || DEFAULT_EXPENSE_CATEGORIES), newExpenseCategory.trim()]
      }));
      setNewExpenseCategory('');
    }
  };

  const handleRemoveExpenseCategory = (catToRemove: string) => {
    const list = form.expenseCategories || DEFAULT_EXPENSE_CATEGORIES;
    if (list.length <= 1) {
      addToast('At least one expense category is required.', 'error');
      return;
    }
    isDirtyRef.current = true;
    setForm(prev => ({
      ...prev,
      expenseCategories: (prev.expenseCategories || DEFAULT_EXPENSE_CATEGORIES).filter(c => c !== catToRemove)
    }));
  };

  const handleAddMethod = () => {
    if (newMethod.trim() && !form.paymentMethods.includes(newMethod.trim())) {
      isDirtyRef.current = true;
      setForm(prev => ({
        ...prev,
        paymentMethods: [...prev.paymentMethods, newMethod.trim()]
      }));
      setNewMethod('');
    }
  };

  const handleRemoveMethod = (methodToRemove: string) => {
    if (form.paymentMethods.length <= 1) {
      addToast('At least one payment method is required.', 'error');
      return;
    }
    isDirtyRef.current = true;
    setForm(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.filter(m => m !== methodToRemove)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);

    const payloadToSave: AppSettings = {
      ...form,
      openingBalance: typeof form.openingBalance === 'number' ? form.openingBalance : (parseFloat(String(form.openingBalance || 0)) || 0),
      openingBalanceDate: form.openingBalanceDate || new Date().toISOString().split('T')[0],
      openingBalanceSetBy: currentUser?.email || 'Owner',
      openingBalanceNotes: form.openingBalanceNotes || 'Calibrated via Owner Settings'
    };

    const res = await saveSettings(payloadToSave);
    setIsSaving(false);

    if (res.success) {
      isDirtyRef.current = false;
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-6 px-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-blue-600 text-white">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Organization & Receipt Settings
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Customize organization brand logo, receipt header, prefix, and payment taxonomies.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <form
        onChange={() => {
          isDirtyRef.current = true;
        }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {/* Card 0: Theme & Visual Appearance */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Application Theme &amp; Visual Appearance
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Select Interface Theme Mode
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Light Mode Option */}
              <button
                type="button"
                id="btn-theme-light"
                onClick={() => setTheme('light')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  theme === 'light'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-600/30'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  theme === 'light' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  <Sun className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      Light Mode
                    </span>
                    {theme === 'light' && (
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Bright, crisp white background with sharp contrast and clean ink styling.
                  </p>
                </div>
              </button>

              {/* Dark Mode Option */}
              <button
                type="button"
                id="btn-theme-dark"
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  theme === 'dark'
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-600/30'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  theme === 'dark' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  <Moon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      Dark Mode
                    </span>
                    {theme === 'dark' && (
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Deep twilight background reducing eye strain with crisp typography.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Card 1: Organization Profile */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Building className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Organization Profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Organization Name
              </label>
              <input
                type="text"
                required
                value={form.organizationName}
                onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Organization Email
              </label>
              <input
                type="email"
                value={form.organizationEmail}
                onChange={(e) => setForm({ ...form, organizationEmail: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Organization Phone
              </label>
              <input
                type="text"
                value={form.organizationPhone}
                onChange={(e) => setForm({ ...form, organizationPhone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Physical Address / Headquarters
              </label>
              <input
                type="text"
                value={form.organizationAddress}
                onChange={(e) => setForm({ ...form, organizationAddress: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                System Public Web Domain / Website Address
              </label>
              <input
                type="text"
                placeholder="https://scbasimbuzi-v2.ai.studio"
                value={form.customDomain || ''}
                onChange={(e) => setForm({ ...form, customDomain: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Your official web domain shown when sharing system links via WhatsApp, Telegram, or email (e.g. <span className="font-mono text-blue-600 dark:text-blue-400">https://scbasimbuzi-v2.ai.studio</span>).
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Receipt Format & Footer */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Receipt Numbering & Footer Text
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Receipt Prefix (e.g. SB)
              </label>
              <input
                type="text"
                maxLength={6}
                required
                value={form.receiptPrefix}
                onChange={(e) => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-mono font-bold uppercase focus:ring-2 focus:ring-blue-600 outline-none"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Format: <span className="font-mono font-semibold">{form.receiptPrefix || 'SB'}-2026-00001</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Receipt Footer / Sign-off Message
              </label>
              <input
                type="text"
                value={form.receiptFooter}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Card 4: Payment Taxonomies */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Payment Taxonomies (Categories & Methods)
            </h2>
          </div>

          {/* Payment Categories */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Payment Purposes / Categories
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {form.paymentCategories.map(cat => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(cat)}
                    className="p-0.5 text-slate-400 hover:text-red-500 rounded-full transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Add new category..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Payment Methods
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {form.paymentMethods.map(method => (
                <span
                  key={method}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700"
                >
                  <span>{method}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMethod(method)}
                    className="p-0.5 text-slate-400 hover:text-red-500 rounded-full transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                value={newMethod}
                onChange={(e) => setNewMethod(e.target.value)}
                placeholder="Add new method..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleAddMethod}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Card 5: Expense Categories (Outflow Taxonomies) */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Expense Taxonomies (Outflow Categories)
            </h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Approved Expenditure Categories
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              These categories appear in the Outflow Expense Voucher form for match operations, pitch hire, kits, logistics, etc.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(form.expenseCategories || DEFAULT_EXPENSE_CATEGORIES).map(cat => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs font-semibold border border-rose-200 dark:border-rose-900/60"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveExpenseCategory(cat)}
                    className="p-0.5 text-rose-400 hover:text-red-500 rounded-full transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
              <input
                type="text"
                value={newExpenseCategory}
                onChange={(e) => setNewExpenseCategory(e.target.value)}
                placeholder="Add new expense category..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-1 focus:ring-rose-600"
              />
              <button
                type="button"
                onClick={handleAddExpenseCategory}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Card 6: Dual-Writing Database Sync Pipeline (Open-Closed Architecture) */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Dual-Writing Database Sync Pipeline
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Legacy Master Spreadsheet ID
              </label>
              <div className="relative">
                <Database className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={form.legacySpreadsheetId || ''}
                  onChange={(e) => setForm({ ...form, legacySpreadsheetId: e.target.value.trim() })}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms or leave blank"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Sheet Name
              </label>
              <div className="relative">
                <FileSpreadsheet className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={form.legacySheetName || ''}
                  onChange={(e) => setForm({ ...form, legacySheetName: e.target.value.trim() })}
                  placeholder="Master Transactions"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>

            <div className="flex items-center">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/60 text-[11px] text-indigo-900 dark:text-indigo-200">
                <span className="font-bold">Dual-Write Status: </span>
                {form.legacySpreadsheetId ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Enabled &amp; Active</span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">Idle (Single internal sheet)</span>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            When configured, the backend’s Open-Closed <span className="font-semibold text-slate-700 dark:text-slate-300 font-mono">SyncSinkPipeline</span> automatically saves every new transaction (both Inflows &amp; Outflows) to the primary sheet <em>AND</em> appends the exact row to the legacy master spreadsheet in real-time. If left blank, dual-writing is safely skipped without throwing errors.
          </p>
        </div>

        {/* Card 7: Opening Balance Calibration (Financial Ledger) */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Financial Ledger Opening Balance Calibration
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Owner Only
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Financial Ledger Equation:</span>
            </p>
            <p className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
              Current recorded balance = Opening balance + Total inflows − Total outflows
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              If no opening balance is configured, zero is used and the dashboard indicates that the displayed balance is based on recorded transactions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Opening Balance Amount (UGX)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.openingBalance !== undefined ? form.openingBalance : ''}
                  onChange={(e) => setForm({ ...form, openingBalance: e.target.value === '' ? 0 : Number(e.target.value) })}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-sans font-bold outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <div className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                  UGX
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Effective Calibration Date
              </label>
              <input
                type="date"
                value={form.openingBalanceDate || ''}
                onChange={(e) => setForm({ ...form, openingBalanceDate: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Calibration Notes &amp; Audit Trail
              </label>
              <input
                type="text"
                value={form.openingBalanceNotes || ''}
                onChange={(e) => setForm({ ...form, openingBalanceNotes: e.target.value })}
                placeholder="e.g. Opening balance verified from Stanbic Bank and MTN MoMo merchant statement as of Jan 1, 2026"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
              />
              {form.openingBalanceSetBy && (
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                  <History className="w-3 h-3" />
                  <span>Last calibrated by: {form.openingBalanceSetBy}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-save-settings"
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 shadow-sm shadow-blue-600/20 cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'Saving Settings...' : 'Save All Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
