import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  DuesStatus,
  Member,
  MemberProfileSubmission,
  MembershipTier,
  MembersDirectoryPayload
} from '../types';
import { csvEscapeSafe, parseTreasuryMembersCsv } from '../utils/memberImport';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  GitMerge,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle
} from 'lucide-react';

type FilterTab = 'ALL' | 'PENDING_APPROVALS' | 'INCOMPLETE' | 'MISSING_EMAIL' | 'COMPLETE';

const TIER_OPTIONS: MembershipTier[] = ['Supporter', 'Player', 'Executive', 'Academy', 'Other'];
const PAGE_SIZE = 25;

export const MembersView: React.FC = () => {
  const { currentUser, addToast, refreshData, refreshMembers, isLiveBackend } = useApp();
  const operatorEmail = currentUser?.email || '';

  const [loading, setLoading] = useState(true);
  const [directory, setDirectory] = useState<MembersDirectoryPayload | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [duesFilter, setDuesFilter] = useState<'ALL' | DuesStatus>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | MembershipTier>('ALL');
  const [page, setPage] = useState(1);

  // Selection for Merge Duplicates
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryMergeId, setPrimaryMergeId] = useState('');
  const [merging, setMerging] = useState(false);

  // Add / Edit Member Modal
  const [editingMember, setEditingMember] = useState<Partial<Member> | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [memberFormError, setMemberFormError] = useState<string | null>(null);

  // CSV Upload / Preview Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  // Claim Link Share Modal
  const [claimLinkModal, setClaimLinkModal] = useState<{
    memberName: string;
    phone: string;
    url: string;
    expiresAt: string;
    totalPaid: number;
  } | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Review Queue busy state & GAS sync
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [syncingGas, setSyncingGas] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const loadDirectory = useCallback(async () => {
    if (!operatorEmail) return;
    setLoading(true);
    const res = await api.getDirectoryMembers(operatorEmail);
    setLoading(false);
    if (res.success && res.data) {
      setDirectory(res.data);
    } else {
      addToast(res.error || 'Could not load members directory', 'error');
    }
  }, [operatorEmail, addToast]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const members = useMemo(() => directory?.members || [], [directory]);
  const submissions = useMemo(() => directory?.submissions || [], [directory]);
  const pendingSubmissions = useMemo(
    () => submissions.filter(s => s.status === 'PENDING'),
    [submissions]
  );

  const csvPreview = useMemo(() => {
    if (!csvRawText.trim()) return null;
    return parseTreasuryMembersCsv(csvRawText);
  }, [csvRawText]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter(m => {
      if (filterTab === 'INCOMPLETE' && m.profileStatus !== 'INCOMPLETE') return false;
      if (filterTab === 'MISSING_EMAIL' && m.email) return false;
      if (filterTab === 'COMPLETE' && m.profileStatus !== 'COMPLETE') return false;
      if (duesFilter !== 'ALL' && m.duesStatus !== duesFilter) return false;
      if (tierFilter !== 'ALL' && m.tier !== tierFilter) return false;

      if (q) {
        const hay = `${m.name} ${m.id || ''} ${m.email} ${m.phone} ${m.address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, filterTab, duesFilter, tierFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedMembers = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filterTab, duesFilter, tierFilter, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const openEditModal = (m?: Member) => {
    setMemberFormError(null);
    if (m) {
      setEditingMember({ ...m });
    } else {
      setEditingMember({
        name: '',
        email: '',
        phone: '',
        address: '',
        tier: 'Supporter',
        expectedTargetUgx: 100000
      });
    }
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !operatorEmail) return;
    setMemberFormError(null);
    setSavingMember(true);
    const res = await api.saveDirectoryMember(
      {
        ...editingMember,
        name: String(editingMember.name || '').trim()
      },
      operatorEmail
    );
    setSavingMember(false);

    if (res.success) {
      addToast(`Saved profile for ${res.data?.name || editingMember.name}`, 'success');
      setEditingMember(null);
      await loadDirectory();
      await refreshMembers();
      await refreshData();
    } else {
      setMemberFormError(res.error || 'Could not save member details.');
    }
  };

  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvRawText(String(reader.result || ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommitCsvImport = async (useBundled: boolean) => {
    if (!operatorEmail) return;
    setImportingCsv(true);
    const res = await api.importMembersCsv(
      useBundled ? { useBundledTreasuryCsv: true } : { csvText: csvRawText },
      operatorEmail
    );
    setImportingCsv(false);

    if (res.success) {
      addToast(res.message || 'CSV imported successfully!', 'success');
      setShowImportModal(false);
      setCsvRawText('');
      setCsvFileName('');
      await loadDirectory();
      await refreshMembers();
      await refreshData();
    } else {
      addToast(res.error || 'CSV import failed.', 'error');
    }
  };

  const handleGenerateClaimLink = async (member: Member) => {
    const memberId = member.id || member.memberId;
    if (!memberId || !operatorEmail) return;
    setGeneratingLinkFor(memberId);
    const res = await api.generateMemberClaimLink(memberId, operatorEmail);
    setGeneratingLinkFor(null);

    if (res.success && res.data?.token) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${origin}/me?claim=${encodeURIComponent(res.data.token)}`;
      setCopiedLink(false);
      setClaimLinkModal({
        memberName: member.name,
        phone: member.phone || '',
        url,
        expiresAt: res.data.expiresAt,
        totalPaid: member.totalContributed || 0
      });
      loadDirectory();
    } else {
      addToast(res.error || 'Could not create update link', 'error');
    }
  };

  const handleCopyClaimLink = async () => {
    if (!claimLinkModal?.url) return;
    try {
      await navigator.clipboard.writeText(claimLinkModal.url);
      setCopiedLink(true);
      addToast('Profile update link copied!', 'success');
    } catch {
      addToast('Copy failed — please copy manually from the box.', 'error');
    }
  };

  const handleOpenWhatsAppInvite = () => {
    if (!claimLinkModal) return;
    const msg =
      `Hello ${claimLinkModal.memberName},\n` +
      `Thank you for your SC Basimbuzi Mission NLL Season XVII contribution (${claimLinkModal.totalPaid.toLocaleString()} UGX recorded).\n\n` +
      `Please use this personal link to confirm your name and fill in your Email, Phone, Address & Tier so you can access your /me member portal anytime:\n` +
      `${claimLinkModal.url}`;
    const cleanDigits = claimLinkModal.phone.replace(/\D/g, '');
    const waTarget = cleanDigits.length >= 9 ? `https://wa.me/${cleanDigits}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waTarget, '_blank', 'noopener,noreferrer');
  };

  const handleReviewSubmission = async (sub: MemberProfileSubmission, decision: 'APPROVE' | 'REJECT') => {
    if (!operatorEmail) return;
    setReviewingId(sub.id);
    const res = await api.reviewMemberSubmission(sub.id, decision, '', operatorEmail);
    setReviewingId(null);

    if (res.success) {
      addToast(res.message || `Submission ${decision.toLowerCase()}d`, 'success');
      await loadDirectory();
      await refreshMembers();
      await refreshData();
    } else {
      addToast(res.error || 'Review action failed', 'error');
    }
  };

  const openMergeFlow = () => {
    if (selectedIds.length < 2) return;
    setPrimaryMergeId(selectedIds[0]);
    setShowMergeModal(true);
  };

  const handleConfirmMerge = async () => {
    if (!operatorEmail || !primaryMergeId) return;
    const dupIds = selectedIds.filter(id => id !== primaryMergeId);
    if (dupIds.length === 0) return;
    setMerging(true);
    const res = await api.mergeDirectoryMembers(primaryMergeId, dupIds, operatorEmail);
    setMerging(false);

    if (res.success) {
      addToast(res.message || 'Duplicate records merged', 'success');
      setShowMergeModal(false);
      setSelectedIds([]);
      await loadDirectory();
      await refreshMembers();
      await refreshData();
    } else {
      addToast(res.error || 'Merge failed', 'error');
    }
  };

  const handleExportCleanCsv = () => {
    const headers = [
      'Member ID',
      'Full Name',
      'Email',
      'Phone',
      'Physical Address',
      'Tier',
      'Pre-NLL Paid (UGX)',
      'Spot Paid (UGX)',
      'Paid After (UGX)',
      'Live Receipts (UGX)',
      'Total Paid (UGX)',
      'Dues Status',
      'Profile Status'
    ];
    const lines = [headers.map(csvEscapeSafe).join(',')];
    for (const m of filteredMembers) {
      lines.push(
        [
          m.id || '',
          m.name,
          m.email || '',
          m.phone || '',
          m.address || '',
          m.tier || 'Supporter',
          m.preNllPaid || 0,
          m.spotPaid || 0,
          m.paidAfter || 0,
          m.livePaid || 0,
          m.totalContributed || 0,
          m.duesStatus || 'Partial',
          m.profileStatus || 'INCOMPLETE'
        ]
          .map(csvEscapeSafe)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SC_Basimbuzi_Members_Directory_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`Exported ${filteredMembers.length} member records to CSV.`, 'success');
  };

  const handleSyncToGoogleSheets = async () => {
    if (!operatorEmail) return;
    if (!isLiveBackend) {
      addToast('Connect your Google Apps Script URL in Apps Script Backend first.', 'info');
      return;
    }
    setSyncingGas(true);
    const histTxs = await api.fetchHistoricalTransactions(operatorEmail);
    const res = await api.syncMembersAndHistoricalToGas(members, histTxs, operatorEmail);
    setSyncingGas(false);

    if (res.success) {
      addToast(
        res.message ||
          `Synced ${res.data?.syncedMembers ?? members.length} members and ${res.data?.syncedTransactions ?? histTxs.length} historical entries to Google Sheets!`,
        'success'
      );
    } else {
      addToast(
        res.error?.toLowerCase().includes('unknown')
          ? 'Please redeploy the updated Apps Script code from Backend Setup before syncing Members.'
          : res.error || 'Google Sheets sync failed',
        'error'
      );
    }
  };

  const handleReconcileLedger = async () => {
    if (!operatorEmail) return;
    setReconciling(true);
    const res = await api.reconcileMembersLedger(operatorEmail);
    setReconciling(false);
    if (res.success) {
      addToast(res.message || 'Ledger cleaned & reconciled without double-counting.', 'success');
      await loadDirectory();
      await refreshMembers();
      await refreshData();
    } else {
      addToast(res.error || 'Could not reconcile ledger.', 'error');
    }
  };

  const summary = directory?.summary;
  const reconciliation = directory?.reconciliation;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Page Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Club Membership & Historical Treasury Register</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1 font-heading">
            Members Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            All historical NLL contributions & live receipts unified in one directory. Invite members via secure self-update links to fill missing Emails, Phones, Addresses & Tiers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.length >= 2 && (
            <button
              type="button"
              onClick={openMergeFlow}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <GitMerge className="w-4 h-4" />
              <span>Merge Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReconcileLedger}
            disabled={reconciling}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer disabled:opacity-60"
          >
            {reconciling ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <ShieldCheck className="w-4 h-4 text-blue-600" />}
            <span>{reconciling ? 'Cleaning...' : 'Clean & Reconcile Ledger'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Upload / Import CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportCleanCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleSyncToGoogleSheets}
            disabled={syncingGas}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-60"
          >
            {syncingGas ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            <span>{syncingGas ? 'Syncing Sheets...' : 'Sync to Sheets'}</span>
          </button>

          <button
            type="button"
            onClick={() => openEditModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Club Members</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
            {summary?.totalMembers ?? members.length}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {summary?.completeProfiles ?? 0} Complete
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {summary?.incompleteProfiles ?? 0} Need Details
            </span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Combined Member Contributions</div>
          <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 font-mono tabular-nums">
            {(summary?.combinedTotalSum ?? 0).toLocaleString()} UGX
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
            Historical (CSV): {(summary?.historicalTotalSum ?? 0).toLocaleString()} · Unrecorded Live: +{Math.max(0, (summary?.combinedTotalSum ?? 0) - (summary?.historicalTotalSum ?? 0)).toLocaleString()}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 truncate tabular-nums">
            Pre: {(summary?.preNllSum ?? 0).toLocaleString()} · Spot: {(summary?.spotSum ?? 0).toLocaleString()} · After: {(summary?.paidAfterSum ?? 0).toLocaleString()}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setFilterTab('MISSING_EMAIL')}
          className="text-left p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 transition shadow-xs cursor-pointer"
        >
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Missing Email (Cannot /me Login)</div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
            {summary?.missingEmailCount ?? 0}
          </div>
          <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
            Click to filter & send WhatsApp update links →
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('PENDING_APPROVALS')}
          className={`text-left p-5 rounded-2xl border transition shadow-xs cursor-pointer ${
            pendingSubmissions.length > 0
              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Pending Self-Updates</div>
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
            {pendingSubmissions.length}
          </div>
          <div className="mt-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            {pendingSubmissions.length > 0 ? 'Member submissions awaiting your approval →' : 'All member updates reviewed'}
          </div>
        </button>
      </div>

      {/* Reconciled Ledger Summary Notice (Zero Double-Counting & Staff Emails Scrubbed) */}
      {reconciliation && (
        <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-emerald-950 dark:text-emerald-200">
              <div className="font-bold">
                Reconciled Treasury Active — Zero Double-Counting &amp; Clean Member Emails
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Historical CSV (<strong>{(summary?.historicalTotalSum ?? 0).toLocaleString()} UGX</strong>) + Unrecorded Live Receipts ({reconciliation.unrecordedLiveCount} receipts · <strong>+{Math.max(0, (summary?.combinedTotalSum ?? 0) - (summary?.historicalTotalSum ?? 0)).toLocaleString()} UGX</strong>, incl. Atukunda Blessed Pearl) = <strong>{(summary?.combinedTotalSum ?? 0).toLocaleString()} UGX</strong>.
                {' '}Deduplicated <strong>{reconciliation.coveredReceiptCount}</strong> pre-CSV live receipts ({reconciliation.coveredAmountUgx.toLocaleString()} UGX), recovered <strong>{reconciliation.realEmailsRecovered}</strong> personal member emails, and stripped all staff emails from unrelated members.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${members.length})` },
                { id: 'INCOMPLETE', label: `Incomplete Details (${summary?.incompleteProfiles ?? 0})` },
                { id: 'MISSING_EMAIL', label: `Missing Email (${summary?.missingEmailCount ?? 0})` },
                { id: 'COMPLETE', label: `Complete (${summary?.completeProfiles ?? 0})` },
                { id: 'PENDING_APPROVALS', label: `Pending Approvals (${pendingSubmissions.length})` }
              ] as Array<{ id: FilterTab; label: string }>
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterTab === tab.id
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadDirectory}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {filterTab !== 'PENDING_APPROVALS' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, phone, email, address, or member ID..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-3">
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value as 'ALL' | MembershipTier)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Tiers</option>
                {TIER_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <select
                value={duesFilter}
                onChange={e => setDuesFilter(e.target.value as 'ALL' | DuesStatus)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Dues Statuses</option>
                <option value="Paid">Paid (Target Met)</option>
                <option value="Partial">Partial Payment</option>
                <option value="Overdue">No Payment Recorded</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* VIEW A: PENDING SELF-UPDATES VERIFICATION QUEUE */}
      {filterTab === 'PENDING_APPROVALS' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Member Profile Submissions Awaiting Verification ({pendingSubmissions.length})
              </h2>
            </div>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">Queue is Clear</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Click "Send Link" on any member with missing details to generate a private self-update URL they can fill in. Their edits will appear here for 1-click confirmation.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {pendingSubmissions.map(sub => (
                <div key={sub.id} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {sub.memberId}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Original CSV Name: {sub.memberName}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {sub.totalPaid.toLocaleString()} UGX recorded
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div>
                        <span className="text-slate-400 block">Submitted Full Name</span>
                        <span className="font-bold text-slate-900 dark:text-white">{sub.submittedName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Submitted Email</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400 break-all">{sub.submittedEmail}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Phone & Tier</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {sub.submittedPhone} · {sub.submittedTier}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Physical Address</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{sub.submittedAddress}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      disabled={reviewingId === sub.id}
                      onClick={() => handleReviewSubmission(sub, 'APPROVE')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve & Sync /me</span>
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === sub.id}
                      onClick={() => handleReviewSubmission(sub, 'REJECT')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* VIEW B: MEMBERS DIRECTORY TABLE */
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-16 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading club members and treasury sums...</span>
            </div>
          ) : paginatedMembers.length === 0 ? (
            <div className="p-14 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">No Matching Members</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Try adjusting your search or filter tabs, or upload a CSV sheet above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 pl-4 pr-2 w-10">Select</th>
                    <th className="py-3.5 px-3">Member & Tier</th>
                    <th className="py-3.5 px-3">Contact & Address</th>
                    <th className="py-3.5 px-3 text-right">Pre-NLL / Spot / After</th>
                    <th className="py-3.5 px-3 text-right">Total Paid & Status</th>
                    <th className="py-3.5 pl-3 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {paginatedMembers.map(member => {
                    const id = member.id || member.memberId || member.name;
                    const checked = selectedIds.includes(id);
                    const total = member.totalContributed || 0;

                    return (
                      <tr key={id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(id)}
                            aria-label={`Select ${member.name}`}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
                          />
                        </td>

                        <td className="py-3.5 px-3 align-top">
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{member.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="font-mono text-[10px] text-slate-400">{member.id}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                              {member.tier || 'Supporter'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                member.profileStatus === 'COMPLETE'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              }`}
                            >
                              {member.profileStatus === 'COMPLETE' ? 'Complete' : 'Needs Details'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 align-top space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {member.email ? (
                              <span className="text-slate-700 dark:text-slate-200 font-medium">{member.email}</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 italic">Missing email</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {member.phone ? (
                              <span className="font-mono text-slate-600 dark:text-slate-300">{member.phone}</span>
                            ) : (
                              <span className="text-slate-400 italic">No phone</span>
                            )}
                          </div>
                          {member.address && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-500 dark:text-slate-400">{member.address}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 align-top text-right font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                          <div>Pre: {(member.preNllPaid || 0).toLocaleString()}</div>
                          <div>Spot: {(member.spotPaid || 0).toLocaleString()}</div>
                          <div>After: {(member.paidAfter || 0).toLocaleString()}</div>
                          {(member.livePaid || 0) > 0 && (
                            <div className="text-blue-600 dark:text-blue-400 font-semibold">
                              Live: +{(member.livePaid || 0).toLocaleString()}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 align-top text-right">
                          <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                            {total.toLocaleString()} UGX
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                member.duesStatus === 'Paid'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                  : member.duesStatus === 'Partial'
                                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                              }`}
                            >
                              {member.duesStatus || 'Partial'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 pl-3 pr-4 align-top text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(member)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              disabled={generatingLinkFor === id}
                              onClick={() => handleGenerateClaimLink(member)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold cursor-pointer disabled:opacity-50"
                            >
                              {generatingLinkFor === id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Link2 className="w-3.5 h-3.5" />
                              )}
                              <span>Send Link</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredMembers.length)} of{' '}
                {filteredMembers.length} members
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="font-mono font-bold">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT MEMBER */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingMember.id ? `Edit Member (${editingMember.id})` : 'Add New Club Member'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="p-6 space-y-4">
              {memberFormError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{memberFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editingMember.name || ''}
                  onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editingMember.email || ''}
                    onChange={e => setEditingMember({ ...editingMember, email: e.target.value })}
                    placeholder="member@example.com"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone / WhatsApp</label>
                  <input
                    type="text"
                    value={editingMember.phone || ''}
                    onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })}
                    placeholder="+256 7XX XXXXXX"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Physical Address</label>
                <input
                  type="text"
                  value={editingMember.address || ''}
                  onChange={e => setEditingMember({ ...editingMember, address: e.target.value })}
                  placeholder="e.g. Ntinda, Kampala"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Membership Tier</label>
                  <select
                    value={editingMember.tier || 'Supporter'}
                    onChange={e => setEditingMember({ ...editingMember, tier: e.target.value as MembershipTier })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {TIER_OPTIONS.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Season Target (UGX)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={editingMember.expectedTargetUgx ?? 100000}
                    onChange={e => setEditingMember({ ...editingMember, expectedTargetUgx: Number(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingMember ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                  <span>{savingMember ? 'Saving...' : 'Save Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CSV UPLOAD & PREVIEW */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Import Club Treasury / Members CSV</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
                <div className="font-bold text-blue-900 dark:text-blue-200">
                  Idempotent Smart Merge (Zero Double-Counting)
                </div>
                <p className="text-blue-800/90 dark:text-blue-300 leading-relaxed">
                  Re-importing updates payment totals safely without duplicating members or erasing cleaned Emails, Phones, Addresses, or Tiers you or your members have added.
                </p>
                <button
                  type="button"
                  disabled={importingCsv}
                  onClick={() => handleCommitCsvImport(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${importingCsv ? 'animate-spin' : ''}`} />
                  <span>Re-Sync Bundled NLL Season XVII CSV</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Or Upload a New / Cleaned CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileSelected}
                  className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-800 dark:file:text-slate-200 cursor-pointer"
                />
              </div>

              {csvPreview && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white">
                    Preview: {csvFileName || 'Uploaded CSV'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                    <div>Members Detected: <span className="font-bold">{csvPreview.summary.memberCount}</span></div>
                    <div>Total Paid: <span className="font-bold text-emerald-600">{csvPreview.summary.totalSum.toLocaleString()} UGX</span></div>
                    <div>Pre-NLL: {csvPreview.summary.preNllSum.toLocaleString()} UGX</div>
                    <div>Spot Paid: {csvPreview.summary.spotSum.toLocaleString()} UGX</div>
                    <div>Paid After: {csvPreview.summary.paidAfterSum.toLocaleString()} UGX</div>
                    <div>Skipped Summary Rows: {csvPreview.summary.skippedRows}</div>
                  </div>
                  {csvPreview.summary.warnings.length > 0 && (
                    <div className="text-amber-700 dark:text-amber-400">
                      {csvPreview.summary.warnings[0]}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Close
                </button>
                {csvPreview && csvPreview.summary.memberCount > 0 && (
                  <button
                    type="button"
                    disabled={importingCsv}
                    onClick={() => handleCommitCsvImport(false)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    {importingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Import {csvPreview.summary.memberCount} Members</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SEND / COPY TOKENIZED PROFILE UPDATE LINK */}
      {claimLinkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Profile Update Link for {claimLinkModal.memberName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setClaimLinkModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Send this private 7-day single-use link to <strong>{claimLinkModal.memberName}</strong>. It shows their recorded Mission NLL contributions ({claimLinkModal.totalPaid.toLocaleString()} UGX) read-only and lets them submit their Full Name, Email, Phone, Address & Tier for your confirmation.
              </p>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] break-all text-slate-800 dark:text-slate-200 select-all">
                {claimLinkModal.url}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCopyClaimLink}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsAppInvite}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Send via WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: MERGE DUPLICATE MEMBERS */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-amber-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Merge Selected Members</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Choose the <strong>primary member name/record</strong> to keep. Payments and contact info from the other selected row(s) will be combined into it without losing any UGX history.
              </p>

              <div className="space-y-2">
                {selectedIds.map(id => {
                  const m = members.find(x => (x.id || x.memberId) === id);
                  if (!m) return null;
                  return (
                    <label
                      key={id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${
                        primaryMergeId === id
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="primaryMergeMember"
                          checked={primaryMergeId === id}
                          onChange={() => setPrimaryMergeId(id)}
                        />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{m.name}</div>
                          <div className="text-[10px] text-slate-500">{m.email || m.id}</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {(m.totalContributed || 0).toLocaleString()} UGX
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={merging || !primaryMergeId}
                  onClick={handleConfirmMerge}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                  <span>Merge Records</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
