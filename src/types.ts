export type UserRole = 'OWNER' | 'ADMIN' | 'ISSUER' | 'MEDIA';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type EmailStatus = 'SENT' | 'FAILED' | 'PENDING' | 'QUOTA_EXCEEDED' | 'NOT_PROVIDED' | 'SKIPPED';
export type PaymentStatus = 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'CANCELLED';
export type ThemeMode = 'light' | 'dark';

export interface UserPermissions {
  canIssueReceipts: boolean;
  canDeleteTransactions: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canEditSettings: boolean;
  canManageWebsite?: boolean;
}

export interface User {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  password?: string;
  permissions?: UserPermissions;
  createdAt: string;
}

export type TransactionType = 'INFLOW' | 'OUTFLOW';

export type MemberGender = 'Male' | 'Female';
export type MemberSchoolPreset = 'Ntare School' | "Bweranyagyi Girls' Secondary School" | 'Other';
export type DuesStatus = 'Paid' | 'Partial' | 'Overdue';
export type MemberProfileStatus = 'COMPLETE' | 'INCOMPLETE';

export interface Member {
  id?: string;
  memberId?: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  gender?: MemberGender | '';
  school?: string;
  house?: string;
  role?: string;
  status?: string;
  lastPaymentDate?: string;
  totalContributed?: number;
  preNllPaid?: number;
  spotPaid?: number;
  paidAfter?: number;
  historicalPaid?: number;
  livePaid?: number;
  expectedTargetUgx?: number;
  remainingUgx?: number;
  duesStatus?: DuesStatus;
  profileStatus?: MemberProfileStatus;
  paymentCount?: number;
  lastPurpose?: string;
  source?: 'CSV_IMPORT' | 'MANUAL' | 'LIVE_RECEIPT';
  hasActiveClaimLink?: boolean;
  claimLinkExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemberProfileSubmission {
  id: string;
  memberId: string;
  memberName: string;
  submittedName: string;
  submittedEmail: string;
  submittedPhone: string;
  submittedAddress: string;
  submittedGender?: MemberGender | '';
  submittedSchool?: string;
  submittedHouse?: string;
  preNllPaid: number;
  spotPaid: number;
  paidAfter: number;
  totalPaid: number;
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export type PayerProfile = Member;

export interface LedgerMetrics {
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  inflowCount: number;
  outflowCount: number;
  syncedCount: number;
  pendingSyncCount: number;
  failedSyncCount: number;
}

export type SyncStatus = 'SYNCED' | 'PENDING' | 'FAILED' | 'SKIPPED';

export interface Transaction {
  receiptNumber: string;
  transactionId?: string; // Stable canonical ID shared across primary and legacy spreadsheets
  memberId?: string;      // Associated Member ID (e.g. SB-M001)
  type?: TransactionType; // defaults to 'INFLOW'
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  payerName: string; // Payer name for Inflow, or Payee for Outflow
  payee?: string;    // Explicit payee for Outflow
  category?: string; // Explicit category for Outflow (e.g. Logistics, Pitch, Kits)
  voucherNumber?: string; // Voucher / Reference for Outflow
  approvedBy?: string; // Approver for Outflow
  phone: string;
  email: string;
  amount: number; // In UGX
  paymentPurpose: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  generatedBy: string;
  operatorEmail: string;
  paymentStatus: PaymentStatus;
  emailStatus: EmailStatus;
  syncStatus?: SyncStatus; // Dual-writing sync state with legacy master spreadsheet
  syncError?: string;      // Diagnostic error message if legacy sync failed
  lastSyncAttempt?: string; // Timestamp of last legacy sync attempt
  legacyRowIndex?: number;  // Matching row index in legacy sheet
  createdAt: string;
}

export interface AppSettings {
  organizationName: string;
  organizationEmail: string;
  organizationPhone: string;
  organizationAddress: string;
  receiptPrefix: string;
  receiptFooter: string;
  logoUrl: string;
  paymentCategories: string[];
  expenseCategories?: string[]; // Extensible list of outflow expense categories
  paymentMethods: string[];
  currency: string;
  customDomain?: string;
  legacySpreadsheetId?: string; // Dual-writing target legacy master spreadsheet ID
  legacySheetName?: string;     // Target sheet in legacy master spreadsheet (defaults to 'Master Transactions')
  openingBalance?: number;      // Financial ledger opening balance in UGX
  openingBalanceDate?: string;  // Date opening balance took effect
  openingBalanceSetBy?: string; // Owner who calibrated opening balance
  openingBalanceNotes?: string; // Audit notes for opening balance
}

export interface AuditLogEntry {
  id?: string;
  date: string;
  time: string;
  user: string;
  userEmail: string;
  action: 
    | 'LOGIN'
    | 'LOGIN_OTP_SENT'
    | 'MEMBER_LOGIN_OTP_SENT'
    | 'GENERATE_RECEIPT'
    | 'DELETE_TRANSACTION'
    | 'VIEW_RECEIPT'
    | 'RESEND_RECEIPT'
    | 'ADD_ADMIN'
    | 'EDIT_USER'
    | 'EDIT_PERMISSIONS'
    | 'REMOVE_ADMIN'
    | 'ACTIVATE_ADMIN'
    | 'DEACTIVATE_ADMIN'
    | 'CHANGE_SETTINGS'
    | 'SYSTEM_INITIALIZE'
    | 'INFLOW_CREATED'
    | 'OUTFLOW_CREATED'
    | 'RECORD_EXPENSE'
    | 'HISTORICAL_IMPORT_STARTED'
    | 'HISTORICAL_IMPORT_COMPLETED'
    | 'DUPLICATE_IMPORT_DETECTED'
    | 'LEGACY_SYNC_SUCCEEDED'
    | 'LEGACY_SYNC_FAILED'
    | 'LEGACY_SYNC_RETRIED'
    | 'OPENING_BALANCE_CHANGED';
  receiptNumber?: string;
  transactionId?: string;
  description: string;
}

export interface GenerateReceiptPayload {
  payerName: string;
  memberId?: string;
  phone: string;
  email: string;
  amount: number;
  paymentPurpose: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  operatorEmail: string;
  operatorName: string;
}

export interface BackendResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  sheetsSynced?: boolean;
  sheetsError?: string;
}

export interface AuthCheckResult {
  authorized: boolean;
  user?: User;
  message?: string;
  otpRequired?: boolean;
}

export type ActiveTab =
  | 'dashboard'
  | 'generate'
  | 'transactions'
  | 'members'
  | 'search'
  | 'reports'
  | 'website'
  | 'users'
  | 'sync'
  | 'settings'
  | 'audit'
  | 'setup';

export type NewsCategory = 'Match Report' | 'Club Notice' | 'Community' | 'Academy' | 'Transfer';

export interface ClubNewsPost {
  id: string;
  title: string;
  category: NewsCategory;
  summary: string;
  content: string;
  coverImage: string;
  author: string;
  publishedAt: string;
  featured?: boolean;
  status: 'PUBLISHED' | 'DRAFT';
}

export interface ClubFixture {
  id: string;
  opponent: string;
  competition: string;
  date: string;
  time: string;
  venue: string;
  isHome: boolean;
  status: 'UPCOMING' | 'COMPLETED' | 'POSTPONED';
  homeScore?: number;
  awayScore?: number;
  summary?: string;
}

export interface ClubMerchItem {
  id: string;
  name: string;
  priceUgx: number;
  category?: string;
  image?: string;
  imageUrl?: string;
  sizes?: string[];
  description: string;
  inStock: boolean;
}

export interface PublicSiteContent {
  heroHeadline: string;
  heroSubheadline: string;
  heroImageUrl: string;
  aboutTitle: string;
  aboutText: string;
  clubFoundedYear: string;
  homeGround: string;
  trainingSchedule: string;
  membershipTargetLabel?: string;
  membershipTargetUgx?: number;
  news: ClubNewsPost[];
  fixtures: ClubFixture[];
  merch: ClubMerchItem[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface MemberPaymentItem {
  receiptNumber: string;
  date: string;
  paymentPurpose: string;
  paymentMethod: string;
  paymentReference?: string;
  amount: number;
  paymentStatus: PaymentStatus | string;
}

export interface MemberPaymentSummary {
  found: boolean;
  query: string;
  payerName?: string;
  memberEmail?: string;
  phone?: string;
  maskedPhone?: string;
  maskedEmail?: string;
  memberProfile?: Member;
  memberSince?: string;
  targetLabel?: string;
  expectedTargetUgx: number;
  totalPaidUgx: number;
  pendingUgx: number;
  remainingUgx: number;
  progressPercent: number;
  overallStatus: 'FULLY_PAID' | 'PARTIAL' | 'PENDING' | 'NOT_FOUND' | 'AMBIGUOUS';
  payments: MemberPaymentItem[];
  message: string;
}

export interface MemberClaimInfo {
  memberId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gender?: MemberGender | '';
  school?: string;
  house?: string;
  preNllPaid: number;
  spotPaid: number;
  paidAfter: number;
  totalPaid: number;
  hasPendingSubmission?: boolean;
}

export interface MembersDirectorySummary {
  totalMembers: number;
  completeProfiles: number;
  incompleteProfiles: number;
  missingEmailCount: number;
  missingPhoneCount: number;
  preNllSum: number;
  spotSum: number;
  paidAfterSum: number;
  historicalTotalSum: number;
  combinedTotalSum: number;
  pendingSubmissions: number;
}

export interface ReconciliationSummary {
  coveredReceiptNumbers: string[];
  coveredReceiptCount: number;
  coveredAmountUgx: number;
  unrecordedReceipts: Array<{
    receiptNumber: string;
    gasName: string;
    canonicalName: string;
    amount: number;
  }>;
  unrecordedLiveCount: number;
  unrecordedAmountUgx: number;
  staffEmailsStripped: number;
  realEmailsRecovered: number;
  phonesRecovered: number;
  reconciledAt: string;
}

export interface MembersDirectoryPayload {
  members: Member[];
  submissions: MemberProfileSubmission[];
  summary: MembersDirectorySummary;
  reconciliation?: ReconciliationSummary | null;
}

export interface SupporterInquiry {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  interest: 'Membership' | 'Academy' | 'Sponsorship' | 'Merchandise' | 'General';
  message: string;
  createdAt: string;
  status: 'NEW' | 'CONTACTED';
}

export const getDefaultPermissions = (role: UserRole): UserPermissions => {
  switch (role) {
    case 'OWNER':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: true,
        canEditSettings: true,
        canManageWebsite: true
      };
    case 'ADMIN':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true
      };
    case 'MEDIA':
      return {
        canIssueReceipts: false,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true
      };
    case 'ISSUER':
    default:
      return {
        canIssueReceipts: true,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: false
      };
  }
};

export const resolveUserPermissions = (user: User | null | undefined): UserPermissions => {
  if (!user) {
    return {
      canIssueReceipts: false,
      canDeleteTransactions: false,
      canViewReports: false,
      canManageUsers: false,
      canEditSettings: false,
      canManageWebsite: false
    };
  }
  if (user.role === 'OWNER') {
    return getDefaultPermissions('OWNER');
  }
  const defaults = getDefaultPermissions(user.role);
  return {
    ...defaults,
    ...(user.permissions || {})
  };
};

