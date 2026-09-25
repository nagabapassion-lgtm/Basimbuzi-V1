import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  ShieldCheck, 
  Mail, 
  KeyRound, 
  ArrowRight, 
  ArrowLeft, 
  Loader2, 
  AlertCircle, 
  Sun, 
  Moon, 
  CheckCircle2,
  RefreshCw,
  Lock,
  CloudCheck,
  Settings,
  X,
  Play
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { 
    sendLoginOtp, 
    verifyLoginOtp, 
    theme, 
    toggleTheme, 
    settings, 
    gasUrl, 
    setGasUrl, 
    isLiveBackend, 
    addToast,
    refreshData 
  } = useApp();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('nagabapassion@gmail.com');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Backend config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configUrl, setConfigUrl] = useState(gasUrl);
  const [testingConfig, setTestingConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ success: boolean; message: string } | null>(null);

  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Keep configUrl synchronized
  useEffect(() => {
    setConfigUrl(gasUrl);
  }, [gasUrl]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSaveAndTestConfig = async () => {
    const cleanUrl = configUrl.trim();
    if (!cleanUrl) {
      setErrorMessage('Please enter your Google Apps Script Web App URL');
      return;
    }

    setTestingConfig(true);
    setConfigStatus(null);

    const result = await api.testConnection(cleanUrl);
    setTestingConfig(false);
    setConfigStatus(result);

    if (result.success) {
      setGasUrl(cleanUrl);
      addToast('Connected to Google Apps Script backend!', 'success');
      try {
        await refreshData();
      } catch {
        // Non-blocking
      }
      setTimeout(() => {
        setShowConfigModal(false);
      }, 1200);
    } else {
      addToast('Connection failed: ' + result.message, 'error');
    }
  };

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }

    if (!isLiveBackend) {
      setErrorMessage(
        'Google Apps Script Web App URL is not connected on this device. Click "Configure Backend URL" below to paste your script URL so the verification code can be emailed directly to your inbox.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sendLoginOtp(cleanEmail);
      if (res.success) {
        setStep('otp');
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessInfo(`Verification code dispatched to ${cleanEmail}. Please check your email inbox.`);
        setResendCooldown(60);
        setTimeout(() => {
          digitInputRefs.current[0]?.focus();
        }, 150);
      } else {
        setErrorMessage(res.error || 'Access denied. You are not authorized.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'An error occurred while dispatching verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    // Handle paste event or single digit
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6);
      if (pasted.length > 0) {
        const newDigits = [...otpDigits];
        for (let i = 0; i < 6; i++) {
          newDigits[i] = pasted[i] || '';
        }
        setOtpDigits(newDigits);
        const nextFocusIndex = Math.min(pasted.length, 5);
        digitInputRefs.current[nextFocusIndex]?.focus();

        // If complete 6 digits pasted, trigger verify
        if (pasted.length === 6) {
          triggerOtpVerify(pasted);
        }
        return;
      }
    }

    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);

    if (cleanVal && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }

    // Auto verify if all 6 filled
    if (cleanVal && index === 5 && newDigits.every(d => d.length === 1)) {
      triggerOtpVerify(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    }
  };

  const triggerOtpVerify = async (code: string) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await verifyLoginOtp(email.trim().toLowerCase(), code);
      if (!res.authorized) {
        setErrorMessage(res.message || 'Invalid or expired code. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'Verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = otpDigits.join('');
    if (fullCode.length !== 6) {
      setErrorMessage('Please enter all 6 digits of the code.');
      return;
    }
    triggerOtpVerify(fullCode);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await sendLoginOtp(email.trim().toLowerCase());
      if (res.success) {
        setSuccessInfo(`Fresh verification code sent to ${email}. Check your email.`);
        setResendCooldown(60);
        setOtpDigits(['', '', '', '', '', '']);
        digitInputRefs.current[0]?.focus();
      } else {
        setErrorMessage(res.error || 'Failed to resend access code.');
      }
    } catch {
      setErrorMessage('Failed to resend access code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Bar with Brand & Theme Toggle */}
      <header className="w-full px-6 py-4 flex items-center justify-between max-w-7xl mx-auto border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          {settings.logoUrl ? (
            <img 
              src={settings.logoUrl} 
              alt={settings.organizationName} 
              className="h-10 w-10 object-contain rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900 shadow-xs"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-base shadow-sm shadow-blue-600/30">
              SB
            </div>
          )}
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
              {settings.organizationName || 'SC Basimbuzi'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Digital Payment & Receipt Management System
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-login-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2.5 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-amber-400" /> : <Moon className="w-4.5 h-4.5 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none p-6 sm:p-8 transition-all">
            
            {/* Header / Security Badge */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 mb-3 shadow-xs">
                {step === 'email' ? <Lock className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {step === 'email' ? 'System Sign In' : 'Verification Code'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                {step === 'email' 
                  ? 'Enter your registered email address to receive your 6-digit access code.' 
                  : `Enter the 6-digit code sent to ${email}`}
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Step 2 Email Dispatched Confirmation Notice */}
            {step === 'otp' && (
              <div className="mb-6 p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/60 text-slate-900 dark:text-slate-100 transition-all">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-xs font-bold text-blue-950 dark:text-blue-200">
                    Verification Code Dispatched
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  We have sent your 6-digit access code to <strong className="font-semibold text-slate-900 dark:text-white font-mono">{email}</strong>. Please check your email inbox (including spam or promotions folder).
                </p>
              </div>
            )}

            {/* STEP 1: Enter Email Form */}
            {step === 'email' ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-email-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Official Email Address
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('nagabapassion@gmail.com');
                          setErrorMessage(null);
                        }}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        Owner
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('jotham.itungo@gmail.com');
                          setErrorMessage(null);
                        }}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        Jotham
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    <input
                      id="login-email-input"
                      type="email"
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck="false"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. nagabapassion@gmail.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    System Owner: <code className="font-mono text-slate-700 dark:text-slate-300 font-semibold">nagabapassion@gmail.com</code>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue with Email</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* STEP 2: 6-Digit OTP Entry Form */
              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Enter 6-Digit Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('email');
                        setErrorMessage(null);
                        setSuccessInfo(null);
                      }}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" /> Change email
                    </button>
                  </div>

                  {/* 6 Digit Input Boxes */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={el => (digitInputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={digit}
                        onChange={e => handleDigitChange(index, e.target.value)}
                        onKeyDown={e => handleKeyDown(index, e)}
                        className="w-10 h-12 sm:w-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all"
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || otpDigits.some(d => !d)}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify &amp; Access Dashboard</span>
                    </>
                  )}
                </button>

                {/* Resend Action */}
                <div className="text-center pt-1">
                  {resendCooldown > 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      Resend code in <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{resendCooldown}s</span>
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isSubmitting}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Resend verification code
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Bottom Security Note */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Role-Protected Access
              </span>
              <span>SC Basimbuzi Team</span>
            </div>
          </div>

          {/* Backend Connection Status & Setup Link */}
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium ${
                isLiveBackend 
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isLiveBackend ? 'bg-blue-600 animate-pulse' : 'bg-amber-500'}`} />
                {isLiveBackend ? 'Live Email Dispatch Active' : 'Backend URL Not Connected'}
              </span>

              <button
                type="button"
                onClick={() => {
                  setConfigStatus(null);
                  setShowConfigModal(true);
                }}
                className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{isLiveBackend ? 'Change URL' : 'Configure Backend URL'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Backend URL Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <CloudCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Google Apps Script Backend URL
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Required for emailing 6-digit access codes &amp; sync
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Paste your deployed Google Apps Script Web App URL below (must end in <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200">/exec</code>).
            </p>

            <div className="space-y-3">
              <input
                type="url"
                value={configUrl}
                onChange={e => setConfigUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-600 outline-none transition"
              />

              {configStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  configStatus.success 
                    ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300' 
                    : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-300'
                }`}>
                  {configStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold">{configStatus.success ? 'Backend Connected Successfully!' : 'Connection Failed'}</p>
                    <p className="mt-0.5">{configStatus.message}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAndTestConfig}
                disabled={testingConfig || !configUrl.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 shadow-xs shadow-blue-600/20 cursor-pointer"
              >
                {testingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                <span>{testingConfig ? 'Testing...' : 'Test & Save URL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200/80 dark:border-slate-800/80">
        &copy; {new Date().getFullYear()} {settings.organizationName || 'SC Basimbuzi'}. All rights reserved.
      </footer>
    </div>
  );
};

