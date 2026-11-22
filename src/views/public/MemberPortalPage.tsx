import React, { useCallback, useEffect, useState } from 'react';
import {
  MemberAuthSession,
  publicSiteService,
  ReceiptVerificationResult
} from '../../services/publicSiteService';
import { MemberClaimInfo, MemberGender, MemberPaymentSummary, MemberSchoolPreset } from '../../types';
import {
  BWERANYAGYI_SCHOOL,
  GENDER_OPTIONS,
  HOUSE_OPTIONS,
  isHouseEligibleSchool,
  normalizeMemberGender,
  normalizeMemberHouse,
  normalizeMemberSchool,
  NTARE_SCHOOL,
  resolveSchoolFormState,
  SCHOOL_PRESET_OPTIONS
} from '../../utils/memberImport';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Edit3,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  User
} from 'lucide-react';

interface MemberPortalPageProps {
  clubName: string;
  clubEmail: string;
  clubPhone: string;
  onBackHome: () => void;
}

export const MemberPortalPage: React.FC<MemberPortalPageProps> = ({
  clubName,
  clubEmail,
  clubPhone,
  onBackHome
}) => {
  // Check for tokenized profile completion link (?claim=...)
  const [claimToken, setClaimToken] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('claim')?.trim() || '';
  });
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimInfo, setClaimInfo] = useState<MemberClaimInfo | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    gender: '' as '' | MemberGender,
    schoolChoice: '' as '' | MemberSchoolPreset,
    otherSchool: '',
    house: ''
  });
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSubmittedMsg, setClaimSubmittedMsg] = useState<string | null>(null);

  // Session token stored strictly in React state (in-memory only, never localStorage)
  const [session, setSession] = useState<MemberAuthSession | null>(null);

  // Step 1 & 2 Email Magic Code Auth State
  const [loginStep, setLoginStep] = useState<'email' | 'code'>('email');
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Scoped Member Payments & Personal Receipt Verification
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<MemberPaymentSummary | null>(null);

  // Authenticated Member Contact Self-Edit
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    gender: '' as '' | MemberGender,
    schoolChoice: '' as '' | MemberSchoolPreset,
    otherSchool: '',
    house: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ReceiptVerificationResult | null>(null);

  // Load Claim Profile if ?claim= token present in URL
  useEffect(() => {
    if (!claimToken) return;
    let active = true;
    setClaimLoading(true);
    setClaimError(null);
    publicSiteService.fetchClaimProfile(claimToken).then(res => {
      if (!active) return;
      setClaimLoading(false);
      if (res.success && res.data) {
        setClaimInfo(res.data);
        const resolvedSchool = resolveSchoolFormState(res.data.school);
        setClaimForm({
          fullName: res.data.name || '',
          email: res.data.email || '',
          phone: res.data.phone || '',
          address: res.data.address || '',
          gender: normalizeMemberGender(res.data.gender),
          schoolChoice: resolvedSchool.schoolChoice,
          otherSchool: resolvedSchool.otherSchool,
          house: normalizeMemberHouse(res.data.house, res.data.school)
        });
      } else {
        setClaimError(res.error || 'This profile update link is invalid or has expired.');
      }
    });
    return () => {
      active = false;
    };
  }, [claimToken]);

  const handleSignOut = useCallback(() => {
    setSession(null);
    setPaymentSummary(null);
    setVerifyResult(null);
    setVerifyCode('');
    setCodeInput('');
    setLoginStep('email');
    setAuthError(null);
    setAuthNotice(null);
    setEditingProfile(false);
    setProfileMessage(null);
  }, []);

  const loadMyPayments = useCallback(
    async (token: string) => {
      setLoadingPayments(true);
      const data = await publicSiteService.fetchMyPayments(token);
      setLoadingPayments(false);
      if (data.unauthorized) {
        handleSignOut();
        setAuthError('Your member session expired. Please sign in again.');
        return;
      }
      setPaymentSummary(data);
      const resolvedSchool = resolveSchoolFormState(data.memberProfile?.school);
      setProfileForm({
        fullName: data.memberProfile?.name || data.payerName || '',
        phone: data.memberProfile?.phone || data.phone || '',
        address: data.memberProfile?.address || '',
        gender: normalizeMemberGender(data.memberProfile?.gender),
        schoolChoice: resolvedSchool.schoolChoice,
        otherSchool: resolvedSchool.otherSchool,
        house: normalizeMemberHouse(data.memberProfile?.house, data.memberProfile?.school)
      });
    },
    [handleSignOut]
  );

  useEffect(() => {
    if (session?.token) {
      loadMyPayments(session.token);
    }
  }, [session?.token, loadMyPayments]);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimToken) return;
    setClaimError(null);

    if (!claimForm.gender) {
      setClaimError('Please select your gender (Male or Female).');
      return;
    }
    if (!claimForm.schoolChoice) {
      setClaimError('Please select your school.');
      return;
    }
    if (claimForm.schoolChoice === 'Other' && !claimForm.otherSchool.trim()) {
      setClaimError('Please enter the name of your school.');
      return;
    }
    const resolvedSchool = normalizeMemberSchool(claimForm.schoolChoice, claimForm.otherSchool);
    const resolvedHouse = isHouseEligibleSchool(claimForm.schoolChoice)
      ? normalizeMemberHouse(claimForm.house, resolvedSchool)
      : '';
    if (isHouseEligibleSchool(claimForm.schoolChoice) && !resolvedHouse) {
      setClaimError(`Please select your house at ${claimForm.schoolChoice}.`);
      return;
    }

    setClaimSubmitting(true);
    const res = await publicSiteService.submitClaimProfile(claimToken, {
      fullName: claimForm.fullName,
      email: claimForm.email,
      phone: claimForm.phone,
      address: claimForm.address,
      gender: claimForm.gender,
      school: resolvedSchool,
      house: resolvedHouse
    });
    setClaimSubmitting(false);

    if (res.success) {
      setClaimSubmittedMsg(
        res.message ||
          'Thank you! Your details have been submitted for club confirmation. Once approved, you can sign in to /me with your email.'
      );
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/me');
      }
    } else {
      setClaimError(res.error || 'Could not submit your details. Please check your entries and try again.');
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;
    setProfileMessage(null);

    if (!profileForm.gender) {
      setProfileMessage({ type: 'err', text: 'Please select your gender (Male or Female).' });
      return;
    }
    if (!profileForm.schoolChoice) {
      setProfileMessage({ type: 'err', text: 'Please select your school.' });
      return;
    }
    if (profileForm.schoolChoice === 'Other' && !profileForm.otherSchool.trim()) {
      setProfileMessage({ type: 'err', text: 'Please enter the name of your school.' });
      return;
    }
    const resolvedSchool = normalizeMemberSchool(profileForm.schoolChoice, profileForm.otherSchool);
    const resolvedHouse = isHouseEligibleSchool(profileForm.schoolChoice)
      ? normalizeMemberHouse(profileForm.house, resolvedSchool)
      : '';
    if (isHouseEligibleSchool(profileForm.schoolChoice) && !resolvedHouse) {
      setProfileMessage({ type: 'err', text: `Please select your house at ${profileForm.schoolChoice}.` });
      return;
    }

    setSavingProfile(true);
    const res = await publicSiteService.updateMyProfile(session.token, {
      fullName: profileForm.fullName,
      phone: profileForm.phone,
      address: profileForm.address,
      gender: profileForm.gender,
      school: resolvedSchool,
      house: resolvedHouse
    });
    setSavingProfile(false);

    if (res.unauthorized) {
      handleSignOut();
      setAuthError('Your session expired. Please sign in again.');
      return;
    }

    if (res.success) {
      setProfileMessage({ type: 'ok', text: res.message || 'Your profile details were updated.' });
      setEditingProfile(false);
      await loadMyPayments(session.token);
    } else {
      setProfileMessage({ type: 'err', text: res.error || 'Could not save profile changes.' });
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    const clean = emailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      setAuthError('Enter your registered email address.');
      return;
    }

    setAuthBusy(true);
    const res = await publicSiteService.sendMemberLoginCode(clean);
    setAuthBusy(false);

    if (res.success) {
      setEmailInput(clean);
      setCodeInput('');
      setLoginStep('code');
      setAuthNotice(res.message || `A 6-digit sign-in code has been sent to ${clean}. Please check your email inbox.`);
    } else {
      setAuthError(res.error || 'Unable to send sign-in code.');
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanCode = codeInput.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setAuthError('Enter the 6-digit code sent to your email.');
      return;
    }

    setAuthBusy(true);
    const res = await publicSiteService.verifyMemberLoginCode(emailInput.trim().toLowerCase(), cleanCode);
    setAuthBusy(false);

    if (res.success && res.token && res.member) {
      setSession({ token: res.token, member: res.member });
      setCodeInput('');
      setAuthNotice(null);
    } else {
      setAuthError(res.error || 'Could not verify your sign-in code.');
    }
  };

  const handleVerifyMyReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !verifyCode.trim()) return;
    setVerifying(true);
    const res = await publicSiteService.verifyMyReceipt(session.token, verifyCode.trim());
    setVerifying(false);
    if (res.unauthorized) {
      handleSignOut();
      setAuthError('Your session expired. Please sign in again.');
      return;
    }
    setVerifyResult(res);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-8">
      <div>
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Club Home</span>
        </button>
      </div>

      {/* CLAIM TOKEN MODE: MEMBER SELF-COMPLETION FORM (/me?claim=...) */}
      {claimToken && !session ? (
        <div className="max-w-3xl mx-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-10 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{clubName} Member Record Verification</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
              Complete Your Member Details
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Review your recorded club treasury contributions below (read-only), then fill in your full name, email, phone, address, gender, and school details so your `/me` member portal can be activated.
            </p>
          </div>

          {claimLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Verifying your personal link...</span>
            </div>
          ) : claimSubmittedMsg ? (
            <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                    Details Submitted for Confirmation
                  </h2>
                  <p className="text-sm text-emerald-900/90 dark:text-emerald-300 leading-relaxed">
                    {claimSubmittedMsg}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClaimToken('');
                  setClaimSubmittedMsg(null);
                  setClaimInfo(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold cursor-pointer"
              >
                Go to Member Sign In
              </button>
            </div>
          ) : claimError && !claimInfo ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                {claimError}
              </div>
              <button
                type="button"
                onClick={() => {
                  setClaimToken('');
                  if (typeof window !== 'undefined') window.history.replaceState({}, '', '/me');
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                Open Member Sign In Instead
              </button>
            </div>
          ) : claimInfo && (
            <div className="space-y-6">
              {/* Read-Only Historical Payment Breakdown */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Recorded Treasury Amounts ({claimInfo.memberId})
                  </span>
                  <span className="font-sans text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                    Total: {claimInfo.totalPaid.toLocaleString()} UGX
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-sans tabular-nums">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-sans text-[11px]">Pre-NLL Paid</span>
                    <span className="font-bold text-slate-900 dark:text-white">{claimInfo.preNllPaid.toLocaleString()} UGX</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-sans text-[11px]">Spot Paid</span>
                    <span className="font-bold text-slate-900 dark:text-white">{claimInfo.spotPaid.toLocaleString()} UGX</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-sans text-[11px]">Paid After</span>
                    <span className="font-bold text-slate-900 dark:text-white">{claimInfo.paidAfter.toLocaleString()} UGX</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitClaim} className="space-y-4">
                {claimError && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300">
                    {claimError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={claimForm.fullName}
                    onChange={e => setClaimForm({ ...claimForm, fullName: e.target.value })}
                    placeholder="Enter your complete name"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Email Address (For /me Sign In) *
                    </label>
                    <input
                      type="email"
                      required
                      value={claimForm.email}
                      onChange={e => setClaimForm({ ...claimForm, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Phone / WhatsApp Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={claimForm.phone}
                      onChange={e => setClaimForm({ ...claimForm, phone: e.target.value })}
                      placeholder="+256 7XX XXXXXX"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Physical Address / Residence *
                  </label>
                  <input
                    type="text"
                    required
                    value={claimForm.address}
                    onChange={e => setClaimForm({ ...claimForm, address: e.target.value })}
                    placeholder="e.g. Kira / Ntinda, Kampala"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Gender *
                    </label>
                    <select
                      required
                      value={claimForm.gender}
                      onChange={e => setClaimForm({ ...claimForm, gender: e.target.value as '' | MemberGender })}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">Select gender...</option>
                      {GENDER_OPTIONS.map(g => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      School *
                    </label>
                    <select
                      required
                      value={claimForm.schoolChoice}
                      onChange={e => {
                        const nextSchool = e.target.value as '' | MemberSchoolPreset;
                        setClaimForm(prev => ({
                          ...prev,
                          schoolChoice: nextSchool,
                          otherSchool: nextSchool === 'Other' ? prev.otherSchool : '',
                          house: isHouseEligibleSchool(nextSchool) ? prev.house : ''
                        }));
                      }}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">Select school...</option>
                      {SCHOOL_PRESET_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {claimForm.schoolChoice === 'Other' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Enter Name of School *
                    </label>
                    <input
                      type="text"
                      required
                      value={claimForm.otherSchool}
                      onChange={e => setClaimForm({ ...claimForm, otherSchool: e.target.value })}
                      placeholder="Enter your school name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {(claimForm.schoolChoice === NTARE_SCHOOL || claimForm.schoolChoice === BWERANYAGYI_SCHOOL) && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      House ({claimForm.schoolChoice}) *
                    </label>
                    <select
                      required
                      value={claimForm.house}
                      onChange={e => setClaimForm({ ...claimForm, house: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">Select house...</option>
                      {HOUSE_OPTIONS.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={claimSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {claimSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{claimSubmitting ? 'Submitting...' : 'Submit My Member Details'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      ) : !session ? (
        /* UNAUTHENTICATED VIEW: MEMBER LOGIN GATE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-10 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                <Lock className="w-4 h-4" />
                <span>Registered Member Self-Service (/me)</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                Member Sign In
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Sign in with your registered {clubName} email address to privately view your contribution balance, payment history, contact details, and verify your personal receipts.
              </p>
            </div>

            {loginStep === 'email' ? (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label htmlFor="member-login-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Registered Member Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="member-login-email"
                      type="email"
                      required
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{authBusy ? 'Checking Email & Sending Code...' : 'Send 6-Digit Sign-In Code'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                {authNotice && (
                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs font-medium text-blue-800 dark:text-blue-200 space-y-1">
                    <div>{authNotice}</div>
                    {clubEmail && (
                      <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                        Tip: Adding <span className="font-semibold">{clubEmail}</span> to your contacts prevents future club emails from landing in Spam.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="member-otp-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Enter 6-Digit Code Sent to {emailInput}
                  </label>
                  <input
                    id="member-otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] font-sans font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {authError && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300">
                    {authError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{authBusy ? 'Verifying...' : 'Verify & Open My Account'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep('email');
                      setCodeInput('');
                      setAuthError(null);
                    }}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
                  >
                    Use Another Email
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Member Privacy Explanation Side Card */}
          <aside className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Member Account Privacy
            </h2>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Only registered members with an email recorded on file can sign in.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Your session displays strictly your own receipts, contribution total, and remaining balance.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>No member can search or access financial records belonging to anyone else.</span>
              </li>
            </ul>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">Need your email added to your record?</div>
              <p>Ask the club secretariat on {clubPhone} or {clubEmail} to send you your personal profile update link.</p>
            </div>
          </aside>
        </div>
      ) : (
        /* AUTHENTICATED MEMBER ACCOUNT PORTAL (/me) */
        <div className="space-y-8">
          {/* Member Profile Banner */}
          <section className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-300 shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                    Verified Member Account
                  </span>
                  {paymentSummary?.memberProfile?.gender && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {paymentSummary.memberProfile.gender}
                    </span>
                  )}
                  {paymentSummary?.memberProfile?.school && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      {paymentSummary.memberProfile.school}
                      {paymentSummary.memberProfile.house ? ` · ${paymentSummary.memberProfile.house}` : ''}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white mt-0.5">
                  {paymentSummary?.payerName || session.member.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{session.member.email}</span>
                  {(paymentSummary?.memberProfile?.phone || paymentSummary?.phone) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-sans">{paymentSummary?.memberProfile?.phone || paymentSummary?.phone}</span>
                    </>
                  )}
                  {paymentSummary?.memberProfile?.address && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{paymentSummary.memberProfile.address}</span>
                    </>
                  )}
                  {paymentSummary?.memberSince && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>First payment {paymentSummary.memberSince}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setProfileMessage(null);
                  setEditingProfile(prev => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{editingProfile ? 'Cancel Edit' : 'Edit My Details'}</span>
              </button>
              <button
                type="button"
                onClick={() => loadMyPayments(session.token)}
                disabled={loadingPayments}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPayments ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </section>

          {profileMessage && (
            <div
              className={`p-4 rounded-xl border text-xs font-semibold ${
                profileMessage.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {profileMessage.text}
            </div>
          )}

          {/* Authenticated Member Self-Service Profile Editor */}
          {editingProfile && (
            <section className="border border-blue-200 dark:border-blue-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  Update My Member Contact Details
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Payment totals remain verified by club treasury
                </span>
              </div>

              <form onSubmit={handleSaveMyProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={profileForm.fullName}
                    onChange={e => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone / WhatsApp *</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={profileForm.phone}
                      onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Physical Address</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={profileForm.address}
                      onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                      placeholder="e.g. Ntinda, Kampala"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Gender *</label>
                  <select
                    required
                    value={profileForm.gender}
                    onChange={e => setProfileForm({ ...profileForm, gender: e.target.value as '' | MemberGender })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Select gender...</option>
                    {GENDER_OPTIONS.map(g => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">School *</label>
                  <select
                    required
                    value={profileForm.schoolChoice}
                    onChange={e => {
                      const nextSchool = e.target.value as '' | MemberSchoolPreset;
                      setProfileForm(prev => ({
                        ...prev,
                        schoolChoice: nextSchool,
                        otherSchool: nextSchool === 'Other' ? prev.otherSchool : '',
                        house: isHouseEligibleSchool(nextSchool) ? prev.house : ''
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="">Select school...</option>
                    {SCHOOL_PRESET_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {profileForm.schoolChoice === 'Other' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Enter Name of School *
                    </label>
                    <input
                      type="text"
                      required
                      value={profileForm.otherSchool}
                      onChange={e => setProfileForm({ ...profileForm, otherSchool: e.target.value })}
                      placeholder="Enter your school name"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                {(profileForm.schoolChoice === NTARE_SCHOOL || profileForm.schoolChoice === BWERANYAGYI_SCHOOL) && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      House ({profileForm.schoolChoice}) *
                    </label>
                    <select
                      required
                      value={profileForm.house}
                      onChange={e => setProfileForm({ ...profileForm, house: e.target.value })}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">Select house...</option>
                      {HOUSE_OPTIONS.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>{savingProfile ? 'Saving...' : 'Save Contact Details'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {loadingPayments && !paymentSummary ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-12 text-center text-sm text-slate-500">
              Loading your personal payment records...
            </div>
          ) : paymentSummary && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: Balance Summary + Payment History */}
              <div className="lg:col-span-8 space-y-6">
                {/* Contribution Balance Card */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 sm:p-7 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                        <CreditCard className="w-4 h-4" />
                        <span>{paymentSummary.targetLabel || 'Season Contribution Summary'}</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white mt-1">
                        My Contribution Balance
                      </h2>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-lg ${
                        paymentSummary.overallStatus === 'FULLY_PAID'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : paymentSummary.overallStatus === 'PENDING'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      {paymentSummary.expectedTargetUgx === 0
                        ? 'Target Pending Gender'
                        : paymentSummary.overallStatus === 'FULLY_PAID'
                        ? 'Fully Paid'
                        : paymentSummary.overallStatus === 'PENDING'
                        ? 'Pending Verification'
                        : 'Balance Remaining'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Total Paid</div>
                      <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 font-sans tabular-nums mt-1">
                        {paymentSummary.totalPaidUgx.toLocaleString()} UGX
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Season Target</div>
                      {paymentSummary.expectedTargetUgx > 0 ? (
                        <div className="text-xl font-extrabold text-slate-950 dark:text-white font-sans tabular-nums mt-1">
                          {paymentSummary.expectedTargetUgx.toLocaleString()} UGX
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="text-sm font-extrabold text-amber-700 dark:text-amber-400">
                            Set After Gender
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Male: 50,000 · Female: 30,000 UGX
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Remaining Balance</div>
                      <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 font-sans tabular-nums mt-1">
                        {paymentSummary.expectedTargetUgx > 0
                          ? `${paymentSummary.remainingUgx.toLocaleString()} UGX`
                          : 'Pending Target'}
                      </div>
                    </div>
                  </div>

                  {paymentSummary.memberProfile && (
                    <div className="grid grid-cols-3 gap-3 text-xs font-sans tabular-nums pt-1">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                        <span className="text-[11px] font-sans text-slate-500 block">Pre-NLL</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {(paymentSummary.memberProfile.preNllPaid || 0).toLocaleString()} UGX
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                        <span className="text-[11px] font-sans text-slate-500 block">Spot Paid</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {(paymentSummary.memberProfile.spotPaid || 0).toLocaleString()} UGX
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                        <span className="text-[11px] font-sans text-slate-500 block">Paid After</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {(paymentSummary.memberProfile.paidAfter || 0).toLocaleString()} UGX
                        </span>
                      </div>
                    </div>
                  )}

                  {paymentSummary.expectedTargetUgx > 0 ? (
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                        <span>Progress toward target</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{paymentSummary.progressPercent}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            paymentSummary.remainingUgx === 0 ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                          style={{ width: `${paymentSummary.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                      Fill in your gender in <strong>My Contact Details</strong> above to automatically insert your season target (Male: 50,000 UGX · Female: 30,000 UGX).
                    </div>
                  )}
                </section>

                {/* Itemized Payments List */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      My Payment History ({paymentSummary.payments.length})
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Scoped to {session.member.email}</span>
                  </div>

                  {paymentSummary.payments.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {paymentSummary.message}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {paymentSummary.payments.map(item => (
                        <div
                          key={item.receiptNumber}
                          className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-sans text-sm font-bold text-slate-950 dark:text-white">
                                {item.receiptNumber}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                  item.paymentStatus === 'COMPLETED'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                    : item.paymentStatus === 'PENDING'
                                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {item.paymentStatus}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              {item.paymentPurpose} · {item.paymentMethod}
                              {item.paymentReference ? ` · Ref: ${item.paymentReference}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {item.date}
                            </div>
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <div className="font-sans text-base font-bold text-slate-950 dark:text-white tabular-nums">
                              {Number(item.amount).toLocaleString()} UGX
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Right: Personal Receipt Authenticity Verifier */}
              <aside className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-6 space-y-5">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Personal Receipt Verifier</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white mt-1">
                    Verify Your Receipt
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    Check any SC Basimbuzi receipt or historical reference issued to your account to confirm its recorded amount and status.
                  </p>
                </div>

                <form onSubmit={handleVerifyMyReceipt} className="space-y-3">
                  <input
                    type="text"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SB-2026-00001"
                    className="w-full px-3.5 py-2.5 text-sm font-sans rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={verifying}
                    className="w-full py-2.5 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{verifying ? 'Verifying...' : 'Verify Receipt'}</span>
                  </button>
                </form>

                {verifyResult && (
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                      verifyResult.found
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-sm">{verifyResult.message}</div>
                    {verifyResult.found && (
                      <div className="pt-1 space-y-1 tabular-nums">
                        <div>Receipt: <span className="font-sans font-bold">{verifyResult.receiptNumber}</span></div>
                        {verifyResult.amount !== undefined && (
                          <div>Amount: <span className="font-sans font-bold">{Number(verifyResult.amount).toLocaleString()} UGX</span></div>
                        )}
                        {verifyResult.date && <div>Date: {verifyResult.date}</div>}
                        {verifyResult.paymentPurpose && <div>Purpose: {verifyResult.paymentPurpose}</div>}
                        {verifyResult.paymentMethod && <div>Method: {verifyResult.paymentMethod}</div>}
                        {verifyResult.paymentStatus && <div>Status: {verifyResult.paymentStatus}</div>}
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </main>
  );
};
