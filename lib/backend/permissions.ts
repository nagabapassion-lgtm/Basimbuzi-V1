import type { UserPermissions, UserRole } from '../../src/types';

/**
 * Role-default permission resolution — mirrors `resolveUserPermissions` in
 * src/types.ts (copied so the backend does not import client code beyond the
 * pure util files allowed by the contract).
 */
export const getDefaultPermissions = (role: UserRole): UserPermissions => {
  switch (role) {
    case 'OWNER':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: true,
        canEditSettings: true,
        canManageWebsite: true,
        canEditMembers: true
      };
    case 'ADMIN':
      return {
        canIssueReceipts: true,
        canDeleteTransactions: true,
        canViewReports: true,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true,
        canEditMembers: true
      };
    case 'MEDIA':
      return {
        canIssueReceipts: false,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: true,
        canEditMembers: false
      };
    case 'ISSUER':
    default:
      return {
        canIssueReceipts: true,
        canDeleteTransactions: false,
        canViewReports: false,
        canManageUsers: false,
        canEditSettings: false,
        canManageWebsite: false,
        canEditMembers: false
      };
  }
};

export const resolveUserPermissions = (
  role: string,
  permissions?: Partial<UserPermissions> | null
): UserPermissions => {
  if (role === 'OWNER') return getDefaultPermissions('OWNER');
  const defaults = getDefaultPermissions(role as UserRole);
  return { ...defaults, ...(permissions || {}) };
};
