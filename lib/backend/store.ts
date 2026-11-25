import { getDb } from './db';
import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  PRE_CSV_COVERED_GAS_RECEIPTS,
  PRE_CSV_COVERED_RECEIPT_SET,
  UNRECORDED_LIVE_GAS_RECEIPTS
} from '../../src/utils/ledgerReconciliation';
import {
  computeDuesStatus,
  isMemberProfileComplete,
  normalizeMemberGender,
  normalizeMemberHouse,
  normalizeMemberSchool,
  resolveMemberExpectedTarget
} from '../../src/utils/memberImport';
import type { ReconciliationSummary } from '../../src/types';
import type { StaffUser } from './types';

export const SYSTEM_OWNER_EMAIL = 'nagabapassion@gmail.com';
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Settings (single row, id = 1) merged over the same defaults the client used
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  organizationName: 'SC Basimbuzi',
  organizationEmail: 'info@scbasimbuzi.org',
  organizationPhone: '+256 700 123456',
  organizationAddress: 'Lugogo Bypass, Kampala, Uganda',
  receiptPrefix: 'SB',
  receiptFooter: 'Thank you for your payment and support towards SC Basimbuzi.',
  logoUrl: '/logo.png',
  paymentCategories: [
    'Membership',
    'Contribution',
    'Event',
    'Registration',
    'Fundraising',
    'Merchandise',
    'Tournament Fee',
    'Other'
  ],
  expenseCategories: [
    'Pitch Hire & Facilities',
    'Match Day & Referees',
    'Equipment & Kits',
    'Transport & Logistics',
    'Player Refreshments & Meals',
    'Medical & First Aid',
    'Administration & Utilities',
    'Tournament Entry Fee',
    'Other Expenses'
  ],
  paymentMethods: ['Mobile Money', 'Bank Transfer', 'Cash', 'Other'],
  currency: 'UGX',
  customDomain: '',
  legacySpreadsheetId: ''
};

export const getSettings = async (): Promise<Record<string, any>> => {
  const { data } = await getDb().from('settings').select('data').eq('id', 1).maybeSingle();
  const stored = data && typeof data === 'object' ? data : {};
  return { ...DEFAULT_SETTINGS, ...stored };
};

export const saveSettings = async (
  patch: Record<string, any>,
  operatorEmail: string
): Promise<Record<string, any>> => {
  const current = await getSettings();
  const updated = {
    ...current,
    ...patch,
    organizationPhone:
      patch.organizationPhone !== undefined
        ? String(patch.organizationPhone).trim()
        : current.organizationPhone || '',
    logoUrl:
      patch.logoUrl && String(patch.logoUrl).trim() ? patch.logoUrl : current.logoUrl || '/logo.png',
    updatedAt: new Date().toISOString(),
    updatedBy: operatorEmail
  };
  const { error } = await getDb()
    .from('settings')
    .upsert(
      { id: 1, data: updated, updated_at: new Date().toISOString(), updated_by: operatorEmail },
      { onConflict: 'id' }
    );
  if (error) throw new Error(error.message);
  return updated;
};

export const getPublicOrgProfile = async () => {
  const settings = await getSettings();
  return {
    organizationName: String(settings.organizationName || 'SC Basimbuzi').trim(),
    organizationEmail: String(settings.organizationEmail || 'info@scbasimbuzi.org').trim(),
    organizationPhone: String(settings.organizationPhone || '+256703643759').trim(),
    organizationAddress: String(settings.organizationAddress || 'Kampala, Uganda').trim(),
    logoUrl: sanitizeMediaUrl(settings.logoUrl, '/logo.png')
  };
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const nowDateStr = (d: Date = new Date()): string => d.toISOString().slice(0, 10);
export const nowTimeStr = (d: Date = new Date()): string =>
  d.toISOString().slice(11, 19);

export const logAudit = async (entry: {
  user: string;
  userEmail: string;
  action: string;
  receiptNumber?: string;
  transactionId?: string;
  description: string;
}): Promise<void> => {
  try {
    await getDb().from('audit_log').insert({
      date: nowDateStr(),
      time: nowTimeStr(),
      user_name: entry.user || 'System',
      user_email: entry.userEmail || '',
      action: entry.action,
      receipt_number: entry.receiptNumber || null,
      transaction_id: entry.transactionId || null,
      description: entry.description || ''
    });
  } catch {
    // Audit logging must never break the primary operation.
  }
};

// ---------------------------------------------------------------------------
// Staff email awareness for payer-email sanitization
// ---------------------------------------------------------------------------

export const getStaffEmailsList = async (): Promise<string[]> => {
  const { data } = await getDb().from('app_users').select('email');
  return (data || []).map((u: any) => String(u?.email || '').trim().toLowerCase()).filter(Boolean);
};

export const getStaffOwnersMap = async (): Promise<Record<string, string>> => {
  const { data } = await getDb().from('app_users').select('email, name');
  const map: Record<string, string> = {};
  for (const u of data || []) {
    const em = String(u?.email || '').trim().toLowerCase();
    const nm = String(u?.name || '').trim();
    if (em && nm) map[em] = nm;
  }
  return map;
};

/** True for empty/malformed/synthetic emails and staff emails misattributed to a payer. */
export const isPlaceholderMemberEmail = async (
  email: unknown,
  payerName?: unknown
): Promise<boolean> => {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return true;
  const { data: memberHit } = await getDb()
    .from('members')
    .select('id')
    .ilike('email', clean)
    .limit(1)
    .maybeSingle();
  if (memberHit) return false;
  const [staffEmails, staffOwners] = await Promise.all([
    getStaffEmailsList(),
    getStaffOwnersMap()
  ]);
  return isStaffOrPlaceholderEmail(clean, payerName, staffEmails, staffOwners);
};

// ---------------------------------------------------------------------------
// Members: derived totals (ports server.ts sanitizeMemberForClient)
// ---------------------------------------------------------------------------

export const memberRowToMember = (row: Record<string, any>): Record<string, any> => ({
  id: String(row.id || ''),
  memberId: String(row.member_id || row.id || ''),
  name: String(row.name || ''),
  phone: String(row.phone || ''),
  email: String(row.email || ''),
  address: String(row.address || ''),
  gender: String(row.gender || ''),
  school: String(row.school || ''),
  house: String(row.house || ''),
  preNllPaid: Number(row.pre_nll_paid) || 0,
  spotPaid: Number(row.spot_paid) || 0,
  paidAfter: Number(row.paid_after) || 0,
  historicalPaid: Number(row.historical_paid) || 0,
  livePaid: Number(row.live_paid) || 0,
  expectedTargetUgx: Number(row.expected_target_ugx) || 0,
  paymentCount: Number(row.payment_count) || 0,
  lastPaymentDate: String(row.last_payment_date || ''),
  lastPurpose: String(row.last_purpose || ''),
  source: String(row.source || ''),
  claim_token: String(row.claim_token || ''),
  claim_token_expires_at: row.claim_token_expires_at || null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || '')
});

export const sanitizeMemberForClient = (m: any) => {
  const preNllPaid = Math.max(0, Number(m.preNllPaid) || 0);
  const spotPaid = Math.max(0, Number(m.spotPaid) || 0);
  const paidAfter = Math.max(0, Number(m.paidAfter) || 0);
  const historicalPaid = Math.max(0, Number(m.historicalPaid ?? m.totalContributed) || 0);
  const livePaid = Math.max(0, Number(m.livePaid) || 0);
  const totalContributed = historicalPaid + livePaid;
  const cleanGender = normalizeMemberGender(m.gender);
  const expectedTargetUgx = resolveMemberExpectedTarget(m.expectedTargetUgx, cleanGender);
  const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalContributed) : 0;
  const cleanSchool = normalizeMemberSchool(m.school);
  const cleanHouse = normalizeMemberHouse(m.house, cleanSchool);
  const claimExpires = m.claim_token_expires_at
    ? Date.parse(String(m.claim_token_expires_at))
    : Number(m.claimTokenExpiresAt) || 0;

  return {
    id: String(m.id || m.memberId || ''),
    memberId: String(m.memberId || m.id || ''),
    name: String(m.name || '').trim(),
    phone: cleanPhoneNumber(m.phone || ''),
    email: String(m.email || '').trim().toLowerCase(),
    address: String(m.address || '').trim(),
    gender: cleanGender,
    school: cleanSchool,
    house: cleanHouse,
    preNllPaid,
    spotPaid,
    paidAfter,
    historicalPaid,
    livePaid,
    totalContributed,
    expectedTargetUgx,
    remainingUgx,
    duesStatus: computeDuesStatus(totalContributed, expectedTargetUgx),
    profileStatus: isMemberProfileComplete(m) ? ('COMPLETE' as const) : ('INCOMPLETE' as const),
    paymentCount: Number(m.paymentCount) || 0,
    lastPaymentDate: String(m.lastPaymentDate || ''),
    lastPurpose: String(m.lastPurpose || ''),
    source: m.source || 'CSV_IMPORT',
    hasActiveClaimLink: Boolean(m.claim_token || m.claimTokenHash) && claimExpires > Date.now(),
    claimLinkExpiresAt: claimExpires > 0 ? new Date(claimExpires).toISOString() : undefined,
    createdAt: String(m.createdAt || ''),
    updatedAt: String(m.updatedAt || '')
  };
};

/** Recomputes a member's derived totals from its phase columns (for writes). */
export const computeMemberTotals = (m: any) => {
  const historicalPaid = Math.max(0, Number(m.historicalPaid ?? m.historical_paid ?? m.totalContributed) || 0);
  const livePaid = Math.max(0, Number(m.livePaid ?? m.live_paid) || 0);
  const gender = normalizeMemberGender(m.gender ?? m.gender);
  const target = resolveMemberExpectedTarget(m.expectedTargetUgx ?? m.expected_target_ugx, gender);
  const total = historicalPaid + livePaid;
  return {
    historicalPaid,
    livePaid,
    totalContributed: total,
    expectedTargetUgx: target,
    remainingUgx: target > 0 ? Math.max(0, target - total) : 0,
    duesStatus: computeDuesStatus(total, target),
    profileStatus: isMemberProfileComplete(m) ? 'COMPLETE' : 'INCOMPLETE'
  };
};

// ---------------------------------------------------------------------------
// Reconciliation summary (constants ported from server.ts/GAS legacy data)
// ---------------------------------------------------------------------------

export const buildReconciliationSummary = (
  counters: { staffEmailsStripped: number; realEmailsRecovered: number; phonesRecovered: number }
): ReconciliationSummary => {
  const coveredList = PRE_CSV_COVERED_GAS_RECEIPTS.map(r => r.receiptNumber.toUpperCase());
  return {
    coveredReceiptNumbers: coveredList,
    coveredReceiptCount: coveredList.length,
    coveredAmountUgx: PRE_CSV_COVERED_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
    unrecordedReceipts: UNRECORDED_LIVE_GAS_RECEIPTS.map(r => ({
      receiptNumber: r.receiptNumber,
      gasName: r.gasName,
      canonicalName: r.targetCanonicalName,
      amount: r.amount
    })),
    unrecordedLiveCount: UNRECORDED_LIVE_GAS_RECEIPTS.length,
    unrecordedAmountUgx: UNRECORDED_LIVE_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
    staffEmailsStripped: counters.staffEmailsStripped,
    realEmailsRecovered: counters.realEmailsRecovered,
    phonesRecovered: counters.phonesRecovered,
    reconciledAt: new Date().toISOString()
  };
};

export const coveredReceiptSet = (): Set<string> => new Set(PRE_CSV_COVERED_RECEIPT_SET);

// ---------------------------------------------------------------------------
// Transactions: atomic numbering + sanitization for new receipts/vouchers
// ---------------------------------------------------------------------------

export const nextReceiptNumber = async (scope: string): Promise<string> => {
  const { data, error } = await getDb().rpc('next_receipt_number', { p_scope: scope });
  if (error || !data) throw new Error(error?.message || 'Receipt numbering failed');
  return String(data);
};

const PAYMENT_STATUSES = new Set(['COMPLETED', 'PENDING', 'REFUNDED', 'CANCELLED']);

export interface IncomingTx {
  type?: string;
  payerName?: string;
  payee?: string;
  category?: string;
  phone?: string;
  email?: string;
  amount: number;
  paymentPurpose?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  operatorEmail?: string;
  operatorName?: string;
  approvedBy?: string;
  paymentStatus?: string;
  memberId?: string;
}

/** Sanitizes an incoming receipt/voucher exactly like the legacy GAS pipeline. */
export const sanitizeIncomingTx = async (body: IncomingTx) => {
  const rawType = String(body.type || 'INFLOW').toUpperCase();
  const type = rawType === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW';
  const amount = Math.max(0, Number(body.amount) || 0);
  const payerName = String(
    (type === 'OUTFLOW' ? body.payee || body.payerName : body.payerName) || ''
  )
    .trim()
    .slice(0, 120);
  const rawEmail = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const email =
    rawEmail && !(await isPlaceholderMemberEmail(rawEmail, payerName)) ? rawEmail : '';
  const phone = cleanPhoneNumber(String(body.phone || '').trim().slice(0, 30));
  const rawStatus = String(body.paymentStatus || 'COMPLETED').toUpperCase();
  const paymentStatus = PAYMENT_STATUSES.has(rawStatus) ? rawStatus : 'COMPLETED';
  const now = new Date();

  return {
    type,
    date: nowDateStr(now),
    time: nowTimeStr(now),
    payer_name: payerName,
    payee: type === 'OUTFLOW' ? String(body.payee || payerName || '').trim().slice(0, 120) : null,
    category: type === 'OUTFLOW' ? String(body.category || '').trim().slice(0, 80) || null : null,
    voucher_number:
      type === 'OUTFLOW' ? String(body.paymentReference || '').trim().slice(0, 60) || null : null,
    approved_by: type === 'OUTFLOW' ? String(body.approvedBy || '').trim().slice(0, 120) || null : null,
    phone,
    email,
    amount,
    payment_purpose: String(body.paymentPurpose || '').trim().slice(0, 120),
    payment_method: String(body.paymentMethod || '').trim().slice(0, 60),
    payment_reference: String(body.paymentReference || '').trim().slice(0, 120),
    notes: String(body.notes || '').trim().slice(0, 500),
    generated_by: String(body.operatorName || '').trim().slice(0, 120),
    operator_email: String(body.operatorEmail || '').trim().toLowerCase(),
    payment_status: paymentStatus,
    email_status: email ? 'PENDING' : 'NOT_PROVIDED',
    member_id: body.memberId ? String(body.memberId).trim() : null
  };
};

/** Reads the operator email for LOGGING ONLY — never for authorization. */
export const operatorEmailForLogging = (ctxHeaders: Record<string, string>, user?: StaffUser): string =>
  String(ctxHeaders['x-operator-email'] || user?.email || '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Public-site media URL sanitizer (ported from server.ts)
// ---------------------------------------------------------------------------

const SAFE_RASTER_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export const sanitizeMediaUrl = (raw: unknown, fallback: string): string => {
  const val = String(raw || '').trim();
  if (!val) return fallback;
  if (val.startsWith('preset:')) return val.slice(0, 40);
  if (SAFE_RASTER_DATA_IMAGE_REGEX.test(val) && val.length <= 1_200_000) {
    return val;
  }
  if (val.startsWith('/') && !val.startsWith('//')) return val.slice(0, 300);
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString().slice(0, 500);
    }
  } catch {
    return fallback;
  }
  return fallback;
};
