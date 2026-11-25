/**
 * Row <-> client-shape mappers. API responses keep the EXACT camelCase field
 * names the browser client expects (src/types.ts).
 */
import type {
  AuditLogEntry,
  MemberProfileSubmission,
  SupporterInquiry,
  Transaction,
  User
} from '../../src/types';
import { resolveUserPermissions } from './permissions';

export type TxRow = Record<string, any>;
export type MemberRow = Record<string, any>;

const iso = (value: unknown): string => {
  if (!value) return '';
  const str = String(value);
  return str;
};

export const mapTxRow = (row: TxRow): Transaction => ({
  receiptNumber: String(row.receipt_number || ''),
  transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
  memberId: row.member_id ? String(row.member_id) : undefined,
  type: String(row.type || 'INFLOW') as Transaction['type'],
  date: String(row.date || ''),
  time: String(row.time || ''),
  payerName: String(row.payer_name || ''),
  payee: row.payee ? String(row.payee) : undefined,
  category: row.category ? String(row.category) : undefined,
  voucherNumber: row.voucher_number ? String(row.voucher_number) : undefined,
  approvedBy: row.approved_by ? String(row.approved_by) : undefined,
  phone: String(row.phone || ''),
  email: String(row.email || ''),
  amount: Number(row.amount) || 0,
  paymentPurpose: String(row.payment_purpose || ''),
  paymentMethod: String(row.payment_method || ''),
  paymentReference: String(row.payment_reference || ''),
  notes: String(row.notes || ''),
  generatedBy: String(row.generated_by || ''),
  operatorEmail: String(row.operator_email || ''),
  paymentStatus: String(row.payment_status || 'COMPLETED') as Transaction['paymentStatus'],
  emailStatus: String(row.email_status || 'NOT_PROVIDED') as Transaction['emailStatus'],
  syncStatus: row.sync_status ? String(row.sync_status) as Transaction['syncStatus'] : undefined,
  createdAt: iso(row.created_at)
});

export const mapUserRow = (row: TxRow): User => {
  const role = String(row.role || 'ISSUER').toUpperCase();
  const rawPermissions = row.permissions && typeof row.permissions === 'object' ? row.permissions : null;
  return {
    id: row.id ? String(row.id) : undefined,
    name: String(row.name || ''),
    email: String(row.email || '').toLowerCase(),
    role: role as User['role'],
    status: String(row.status || 'ACTIVE').toUpperCase() as User['status'],
    permissions: resolveUserPermissions(role, rawPermissions),
    createdAt: iso(row.created_at) || new Date().toISOString()
  };
};

export const mapSubmissionRow = (row: TxRow): MemberProfileSubmission => ({
  id: String(row.id || ''),
  memberId: String(row.member_id || ''),
  memberName: String(row.member_name || ''),
  submittedName: String(row.submitted_name || ''),
  submittedEmail: String(row.submitted_email || ''),
  submittedPhone: String(row.submitted_phone || ''),
  submittedAddress: String(row.submitted_address || ''),
  submittedGender: (row.submitted_gender || '') as MemberProfileSubmission['submittedGender'],
  submittedSchool: row.submitted_school ? String(row.submitted_school) : undefined,
  submittedHouse: row.submitted_house ? String(row.submitted_house) : undefined,
  preNllPaid: Number(row.pre_nll_paid) || 0,
  spotPaid: Number(row.spot_paid) || 0,
  paidAfter: Number(row.paid_after) || 0,
  totalPaid: Number(row.total_paid) || 0,
  submittedAt: iso(row.submitted_at),
  status: String(row.status || 'PENDING') as MemberProfileSubmission['status'],
  reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
  reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : undefined,
  reviewNotes: row.review_notes ? String(row.review_notes) : undefined
});

export const mapAuditRow = (row: TxRow): AuditLogEntry => ({
  id: row.id !== undefined && row.id !== null ? String(row.id) : undefined,
  date: String(row.date || ''),
  time: String(row.time || ''),
  user: String(row.user_name || ''),
  userEmail: String(row.user_email || ''),
  action: String(row.action || 'SYSTEM_INITIALIZE') as AuditLogEntry['action'],
  receiptNumber: row.receipt_number ? String(row.receipt_number) : undefined,
  transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
  description: String(row.description || '')
});

export const mapInquiryRow = (row: TxRow): SupporterInquiry => ({
  id: String(row.id || ''),
  fullName: String(row.full_name || ''),
  phone: String(row.phone || ''),
  email: String(row.email || ''),
  interest: String(row.interest || 'General') as SupporterInquiry['interest'],
  message: String(row.message || ''),
  createdAt: iso(row.created_at),
  status: String(row.status || 'NEW') as SupporterInquiry['status']
});
