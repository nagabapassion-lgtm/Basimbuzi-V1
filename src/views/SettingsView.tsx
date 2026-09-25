import React, { useState, useRef } from 'react';
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
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  Eye,
  Sun,
  Moon,
  Palette,
  Globe,
  Sparkles,
  HelpCircle,
  Check
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, saveSettings, currentUser, theme, setTheme } = useApp();

  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [newCategory, setNewCategory] = useState('');
  const [newMethod, setNewMethod] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwner = currentUser?.role === 'OWNER';

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

  const handleLogoFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image size should be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setForm(prev => ({ ...prev, logoUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLogoFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !form.paymentCategories.includes(newCategory.trim())) {
      setForm(prev => ({
        ...prev,
        paymentCategories: [...prev.paymentCategories, newCategory.trim()]
      }));
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (catToRemove: string) => {
    if (form.paymentCategories.length <= 1) {
      alert('At least one payment category is required.');
      return;
    }
    setForm(prev => ({
      ...prev,
      paymentCategories: prev.paymentCategories.filter(c => c !== catToRemove)
    }));
  };

  const handleAddMethod = () => {
    if (newMethod.trim() && !form.paymentMethods.includes(newMethod.trim())) {
      setForm(prev => ({
        ...prev,
        paymentMethods: [...prev.paymentMethods, newMethod.trim()]
      }));
      setNewMethod('');
    }
  };

  const handleRemoveMethod = (methodToRemove: string) => {
    if (form.paymentMethods.length <= 1) {
      alert('At least one payment method is required.');
      return;
    }
    setForm(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.filter(m => m !== methodToRemove)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);

    const res = await saveSettings(form);
    setIsSaving(false);

    if (res.success) {
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

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {/* Card 1: Official Logo Settings */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Official Logo (App & Receipts)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Upload Area */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Upload Logo Image
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleLogoFileUpload(e.target.files[0]);
                    }
                  }}
                />
                <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Click to browse or drag & drop logo
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  PNG, SVG, JPG or WebP (max 2MB)
                </p>
              </div>

              {/* Or Direct Image URL */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Or Image Web URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/sc-basimbuzi-logo.png"
                  value={form.logoUrl || ''}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
            </div>

            {/* Live Logo Preview Box */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Live Appearance Preview</span>
                </div>
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, logoUrl: '' })}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Reset to Default Crest
                  </button>
                )}
              </div>

              {/* Receipt Header Preview */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Logo Preview"
                    className="w-14 h-14 object-contain rounded-xl border border-slate-200 dark:border-slate-800 p-1 bg-white"
                  />
                ) : (
                  <img
                    src="/favicon.svg"
                    alt="SC Basimbuzi Emblem"
                    className="w-14 h-14 object-contain rounded-xl border border-blue-200 dark:border-blue-900/60 p-1 bg-white dark:bg-slate-800"
                  />
                )}
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {form.organizationName || 'SC Basimbuzi'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Official Digital Receipt & Portal Header
                  </p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                    {form.logoUrl ? 'Custom Image Active' : 'Default Crest Active'}
                  </p>
                </div>
              </div>

              {/* Google Chrome Browser Tab Preview (matching user's request) */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Chrome Tab Appearance (Favicon)
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Live in Browser
                  </span>
                </div>

                {/* Mock Chrome Tab Strip */}
                <div className="bg-slate-200/80 dark:bg-slate-950 p-2 rounded-xl border border-slate-300 dark:border-slate-800">
                  <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300/80 dark:border-slate-700 shadow-xs max-w-full">
                    {/* Active Favicon */}
                    {form.logoUrl ? (
                      <img
                        src={form.logoUrl}
                        alt="Tab Favicon"
                        className="w-4 h-4 object-contain rounded-xs shrink-0"
                      />
                    ) : (
                      <img
                        src="/favicon.svg"
                        alt="SC Basimbuzi Favicon"
                        className="w-4 h-4 object-contain rounded-xs shrink-0"
                      />
                    )}
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-[220px]">
                      {form.organizationName || 'SC Basimbuzi'} Receipt Management
                    </span>
                    <span className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs ml-1 cursor-default">×</span>
                  </div>
                </div>

                <div className="mt-2.5 p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200/60 dark:border-blue-900/50 text-[11px] text-blue-900 dark:text-blue-200 leading-relaxed space-y-1">
                  <div className="font-semibold flex items-center gap-1 text-blue-800 dark:text-blue-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    How to change your Chrome tab icon & logo:
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-slate-400 pl-0.5">
                    <li>Upload your image above or paste a direct image URL.</li>
                    <li>Click <strong className="text-slate-800 dark:text-slate-200">"Save Settings"</strong> in the top right corner.</li>
                    <li>The system immediately replaces the default Chrome globe icon with your logo on all devices!</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Organization Profile */}
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
