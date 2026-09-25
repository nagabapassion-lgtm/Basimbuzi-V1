export type UserRole = 'OWNER' | 'ADMIN' | 'ISSUER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type EmailStatus = 'SENT' | 'FAILED' | 'PENDING';
export type PaymentStatus = 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'CANCELLED';
export type ThemeMode = 'light' | 'dark';

export interface UserPermissions {
  canIssueReceipts: boolean;
  canDeleteTransactions: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canEditSettings: boolean;
}

export interface User {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  permissions?: UserPermissions;
  createdAt: string;
}

export interface Transaction {
  receiptNumber: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  payerName: string;
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
  paymentMethods: string[];
  currency: string;
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
    | 'SYSTEM_INITIALIZE';
  receiptNumber?: string;
  description: string;
}

export interface GenerateReceiptPayload {
  payerName: string;
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
  | 'search'
  | 'reports'
  | 'users'
  | 'settings'
  | 'audit'
  | 'setup';

export const getDefaultPermissions = (role: UserRole): UserPermissions => {
  switch (role) {
    case 'OWNER':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: true,
        canEditSettings: true
      };
    case 'ADMIN':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: false,
        canEditSettings: false
      };
    case 'ISSUER':
    default:
      return {
        canIssueReceipts: true,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false
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
      canEditSettings: false
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

