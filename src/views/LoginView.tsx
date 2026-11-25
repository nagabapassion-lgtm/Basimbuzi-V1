import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
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
  Eye, 
  EyeOff
} from 'lucide-react';

interface LoginViewProps {
  onBackToPublicSite?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onBackToPublicSite }) => {
  const { 
    sendLoginOtp, 
    verifyLoginOtp, 
    loginWithPassword, 
    theme, 
    toggleTheme, 
    settings, 
    addToast 
  } = useApp();

  // Auth method: 'password' (primary) or 'otp'
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // OTP flow state
  const [otpStep, setOtpStep] = useState<'email' | 'otp'>('email');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Status & loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load remembered email on mount only if user previously checked remember me
  useEffect(() => {
    const saved = localStorage.getItem('sc_basimbuzi_remembered_email');
    if (saved) {
      setEmail(saved);
    }
  }, []);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // 1. Password Login Handler
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    if (!cleanPassword) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (rememberMe) {
      localStorage.setItem('sc_basimbuzi_remembered_email', cleanEmail);
    } else {
      localStorage.removeItem('sc_basimbuzi_remembered_email');
    }

    setIsSubmitting(true);
    try {
      const res = await loginWithPassword(cleanEmail, cleanPassword);
      if (!res.authorized) {
        setErrorMessage(res.message || 'Incorrect email or password. Please verify and try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg || 'An unexpected error occurred during sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. OTP Send Handler
  const handleOtpEmailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid official email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sendLoginOtp(cleanEmail);
      if (res.success) {
        setOtpStep('otp');
        setResendCooldown(60);

        setOtpDigits(['', '', '', '', '', '']);
        setSuccessInfo(`Verification code dispatched to ${cleanEmail}. Please check your email.`);

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
        setResendCooldown(60);
        setSuccessInfo(`Fresh verification code sent to ${email}. Check your email.`);
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
    <div className="min-h-screen w-full flex flex-col justify-between bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 relative overflow-hidden">
      
      {/* Decorative ambient background blur orbs */}
      <div className="absolute top-0 -left-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header with Brand and Controls */}
      <header className="w-full px-6 py-4 flex items-center justify-between max-w-7xl mx-auto border-b border-slate-200/60 dark:border-slate-800/60 relative z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img 
            src={settings.logoUrl || HARDCODED_LOGO_URL} 
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
            }}
            alt={settings.organizationName || 'SC Basimbuzi'} 
            className="h-10 w-10 object-contain rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900 shadow-xs"
          />
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {settings.organizationName || 'SC Basimbuzi'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToPublicSite && (
            <button
              type="button"
              onClick={onBackToPublicSite}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors cursor-pointer backdrop-blur-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Club Website</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            id="btn-login-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2.5 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-colors cursor-pointer backdrop-blur-xs"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-md">

          {/* Elevated Card Container */}
          <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xl shadow-slate-300/40 dark:shadow-none p-6 sm:p-8 transition-all">
            
            {/* Header Title */}
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Log in
              </h2>
            </div>

            {/* Authentication Method Selector Tabs */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 mb-6 border border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('password');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'password'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Password Sign In</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMethod('otp');
                  setOtpStep('email');
                  setErrorMessage(null);
                  setSuccessInfo(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMethod === 'otp'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email OTP Code</span>
              </button>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
                <div className="leading-relaxed flex-1">{errorMessage}</div>
              </div>
            )}

            {/* Success Info Box */}
            {successInfo && (
              <div className="mb-5 p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="leading-relaxed flex-1">{successInfo}</div>
              </div>
            )}

            {/* -------------------- METHOD 1: PASSWORD SIGN IN -------------------- */}
            {authMethod === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
                {/* Email Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-email-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Official Email Address
                    </label>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    <input
                      id="login-email-input"
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your registered email address"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm transition-all shadow-inner"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-password-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    <input
                      id="login-password-input"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm transition-all shadow-inner font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me Checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400 select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 dark:border-slate-700 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Remember my email</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  id="btn-login-submit"
                  type="submit"
                  disabled={isSubmitting || !email.trim() || !password.trim()}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 transition-all cursor-pointer mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In with Password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* -------------------- METHOD 2: EMAIL OTP CODE -------------------- */}
            {authMethod === 'otp' && (
              <>
                {otpStep === 'email' ? (
                  <form onSubmit={handleOtpEmailSubmit} className="space-y-4" noValidate>
                    <div>
                      <label htmlFor="otp-email-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                        Registered Email Address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                        <input
                          id="otp-email-input"
                          name="otpEmail"
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="Enter your registered email address"
                          className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-sm transition-all"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                        A secure 6-digit access code will be generated for your email.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !email.trim()}
                      className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending Code...</span>
                        </>
                      ) : (
                        <>
                          <span>Send 6-Digit Code</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Enter 6-Digit Code
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpStep('email');
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
                            className="w-10 h-12 sm:w-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-sans rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all shadow-inner"
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || otpDigits.some(d => !d)}
                      className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Verify &amp; Enter Portal</span>
                        </>
                      )}
                    </button>

                    {/* Resend Action */}
                    <div className="text-center pt-1">
                      {resendCooldown > 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                          Resend code in <span className="font-sans font-bold text-slate-700 dark:text-slate-300">{resendCooldown}s</span>
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
              </>
            )}

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-slate-400 dark:text-slate-500 border-t border-slate-200/80 dark:border-slate-800/80 relative z-10 backdrop-blur-sm">
        &copy; {new Date().getFullYear()} {settings.organizationName || 'SC Basimbuzi'}. All rights reserved.
      </footer>
    </div>
  );
};
