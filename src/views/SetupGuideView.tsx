import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { GOOGLE_APPS_SCRIPT_CODE } from '../data/gasBackendCode';
import { api } from '../services/api';
import { 
  Copy, 
  Check, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  CloudCheck, 
  Terminal,
  Loader2,
  Send,
  Code2
} from 'lucide-react';

export const SetupGuideView: React.FC = () => {
  const { gasUrl, setGasUrl, isLiveBackend, addToast, refreshData } = useApp();

  const [inputUrl, setInputUrl] = useState(gasUrl);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; timestamp?: string } | null>(null);

  // Test email state
  const [testEmailAddress, setTestEmailAddress] = useState('nagabapassion@gmail.com');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopied(true);
    addToast('Google Apps Script code copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSaveAndTestUrl = async () => {
    if (!inputUrl.trim()) {
      addToast('Please enter a valid Google Apps Script Web App URL', 'error');
      return;
    }

    setTesting(true);
    setTestResult(null);

    const result = await api.testConnection(inputUrl.trim());
    setTesting(false);
    setTestResult(result);

    if (result.success) {
      setGasUrl(inputUrl.trim());
      addToast('Connected to live Google Apps Script backend!', 'success');
      await refreshData();
    } else {
      addToast('Connection failed. Review error message below.', 'error');
    }
  };

  const handleDisconnect = () => {
    setGasUrl('');
    setInputUrl('');
    setTestResult(null);
    addToast('Disconnected Google Apps Script backend', 'info');
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim()) {
      addToast('Please provide a recipient email address', 'error');
      return;
    }

    setSendingTestEmail(true);
    setTestEmailResult(null);

    try {
      const res = await api.sendLoginOtp(testEmailAddress.trim().toLowerCase());
      setSendingTestEmail(false);
      if (res.success) {
        const isLive = Boolean(res.data?.isLiveBackend);
        if (isLive) {
          setTestEmailResult({
            success: true,
            message: `Email successfully dispatched from nagabapassion@gmail.com to ${testEmailAddress}. Please check your inbox (and spam/promotions folder)!`
          });
          addToast('Test email dispatched via Google Apps Script!', 'success');
        } else {
          setTestEmailResult({
            success: false,
            message: `Google Apps Script URL is not connected yet. Paste and connect your deployed Web App URL above to enable live email delivery.`
          });
        }
      } else {
        setTestEmailResult({
          success: false,
          message: res.message || 'Failed to dispatch email.'
        });
      }
    } catch (err: unknown) {
      setSendingTestEmail(false);
      setTestEmailResult({
        success: false,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Code2 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Google Apps Script Backend
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Manage your Web App endpoint URL, test live email delivery, and copy the <code className="font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-semibold">Code.gs</code> backend script.
          </p>
        </div>

        <div className="shrink-0">
          <button
            id="btn-copy-backend-code-top"
            onClick={handleCopyCode}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-2 shadow-sm shadow-blue-600/20 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-blue-200" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Code Copied!' : 'Copy Code.gs'}</span>
          </button>
        </div>
      </div>

      {/* Backend URL Configuration Card */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudCheck className={`w-5 h-5 ${isLiveBackend ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Google Apps Script Web App Endpoint URL
            </h2>
          </div>
          {isLiveBackend && (
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2.5 py-1 rounded-full">
              ✓ Connected &amp; Live
            </span>
          )}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Paste your deployed Google Apps Script Web App URL below (ending in <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200 font-mono">/exec</code>).
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="input-gas-url"
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/AKfycb.../exec"
            className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none transition"
          />

          <div className="flex items-center gap-2">
            <button
              id="btn-test-save-gas-url"
              onClick={handleSaveAndTestUrl}
              disabled={testing}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 shadow-xs shadow-blue-600/20 cursor-pointer"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{testing ? 'Testing...' : 'Test & Connect'}</span>
            </button>

            {isLiveBackend && (
              <button
                onClick={handleDisconnect}
                className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
            testResult.success 
              ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300' 
              : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-300'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{testResult.success ? 'Backend Connection Successful!' : 'Connection Failed'}</p>
              <p className="mt-0.5">{testResult.message}</p>
              {testResult.timestamp && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">Server Timestamp: {testResult.timestamp}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Email Delivery Tester */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Test Email Delivery
          </h2>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Send a test email to verify your Google Apps Script email dispatch configuration.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={testEmailAddress}
            onChange={(e) => setTestEmailAddress(e.target.value)}
            placeholder="e.g. nagabapassion@gmail.com"
            className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
          />

          <button
            id="btn-send-test-email"
            onClick={handleSendTestEmail}
            disabled={sendingTestEmail || !testEmailAddress.trim()}
            className="px-5 py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-xl transition inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {sendingTestEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{sendingTestEmail ? 'Sending Test...' : 'Send Test Email'}</span>
          </button>
        </div>

        {testEmailResult && (
          <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
            testEmailResult.success 
              ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300' 
              : 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300'
          }`}>
            {testEmailResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{testEmailResult.success ? 'Email Dispatched!' : 'Notice'}</p>
              <p className="mt-0.5 leading-relaxed">{testEmailResult.message}</p>
            </div>
          </div>
        )}
      </div>

      {/* Embedded Code Viewer */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-200 text-xs font-mono font-bold">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Code.gs &mdash; Google Apps Script Source</span>
          </div>

          <button
            onClick={handleCopyCode}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code.gs'}</span>
          </button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs text-slate-300 bg-slate-950/40 leading-relaxed">
          <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
        </div>
      </div>
    </div>
  );
};
