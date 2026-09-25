import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole, UserPermissions, getDefaultPermissions, resolveUserPermissions } from '../types';
import { api } from '../services/api';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  X,
  Loader2,
  AlertTriangle,
  Receipt,
  UserCheck,
  KeyRound,
  Check,
  RotateCw,
  CloudUpload,
  Send,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

export const UserManagementView: React.FC = () => {
  const { 
    users, 
    currentUser, 
    userPermissions, 
    addUser, 
    editUser, 
    updateUserStatus, 
    removeUser,
    syncAllUsers,
    isLiveBackend,
    gasUrl,
    setGasUrl,
    setActiveTab
  } = useApp();

  // Diagnostic modal state
  const [diagUser, setDiagUser] = useState<User | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    authorized: boolean;
    user?: User;
    message: string;
    details?: {
      gasConnected: boolean;
      localUserFound: boolean;
      sheetsUserFound: boolean;
      userStatus: string;
      userRole: string;
    };
  } | null>(null);

  // Add User Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('ADMIN');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [permissions, setPermissions] = useState<UserPermissions>(getDefaultPermissions('ADMIN'));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Edit User Modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ADMIN');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editPermissions, setEditPermissions] = useState<UserPermissions>(getDefaultPermissions('ADMIN'));
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Deletion modal state
  const [userToDelete, setUserToDelete] = useState<{ email: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = currentUser?.role === 'OWNER' || (currentUser?.email || '').toLowerCase() === 'nagabapassion@gmail.com';
  const canManage = isOwner || userPermissions.canManageUsers;

  const handleSyncAll = async () => {
    setIsSyncing(true);
    await syncAllUsers();
    setIsSyncing(false);
  };

  const handleVerifyAccess = async (userToTest: User) => {
    setDiagUser(userToTest);
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await api.testUserAccess(userToTest.email);
      setDiagResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagResult({
        authorized: false,
        message: 'Verification request failed: ' + msg
      });
    } finally {
      setDiagLoading(false);
    }
  };

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-8">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-300">Access Restricted</h2>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
            User and administrator management is restricted to authorized management personnel.
          </p>
        </div>
      </div>
    );
  }

  // Count stats
  const activeAdminsCount = users.filter(u => u.role === 'ADMIN' && u.status === 'ACTIVE').length;
  const activeIssuersCount = users.filter(u => u.role === 'ISSUER' && u.status === 'ACTIVE').length;
  const totalUsersCount = users.length;

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    setPermissions(getDefaultPermissions(newRole));
  };

  const handleEditRoleChange = (newRole: UserRole) => {
    setEditRole(newRole);
    setEditPermissions(getDefaultPermissions(newRole));
  };

  const openAddModal = () => {
    setName('');
    setEmail('');
    setRole('ADMIN');
    setStatus('ACTIVE');
    setPermissions(getDefaultPermissions('ADMIN'));
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditPermissions(resolveUserPermissions(user));
    setEditModalError(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name.trim() || !email.trim()) {
      setModalError('Please enter both name and email.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setModalError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    const res = await addUser({
      name: name.trim(),
      email: cleanEmail,
      role,
      status,
      permissions
    });
    setIsSubmitting(false);

    if (res.success) {
      setIsAddModalOpen(false);
    } else {
      setModalError(res.error || 'Failed to add staff member.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditModalError(null);

    if (!editName.trim() || !editEmail.trim()) {
      setEditModalError('Please enter both name and email.');
      return;
    }

    const cleanEmail = editEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setEditModalError('Please enter a valid email address.');
      return;
    }

    setIsEditSubmitting(true);
    const res = await editUser(editingUser.email, {
      name: editName.trim(),
      email: cleanEmail,
      role: editRole,
      status: editStatus,
      permissions: editPermissions
    });
    setIsEditSubmitting(false);

    if (res.success) {
      setEditingUser(null);
    } else {
      setEditModalError(res.error || 'Failed to update user.');
    }
  };

  const handleToggleStatus = async (userEmail: string, currentStatus: 'ACTIVE' | 'INACTIVE') => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await updateUserStatus(userEmail, nextStatus);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await removeUser(userToDelete.email);
      setUserToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6 px-4 sm:px-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              User & Permission Management
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Authorize system administrators and receipt issuers with custom role-based permissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {isLiveBackend && (
            <button
              id="btn-sync-users-sheets"
              onClick={handleSyncAll}
              disabled={isSyncing}
              className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 border border-slate-200 dark:border-slate-700"
              title="Push and synchronize all staff members into the Google Sheet Users tab"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync with Google Sheets'}</span>
            </button>
          )}

          <button
            id="btn-add-admin-modal"
            onClick={openAddModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-2 shadow-xs shadow-blue-600/25 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Backend Status Notification */}
      {!isLiveBackend ? (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Google Sheets Backend Not Connected on this Device: </span>
              Staff members you add here are saved in the shared system database. To enable 6-digit email sign-in codes and 2-way Google Sheets synchronization, configure your Google Apps Script Web App URL.
            </div>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shrink-0 cursor-pointer shadow-xs transition"
          >
            Configure in Settings
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Google Sheets Live Backend is connected. All added staff members sync with your Google Sheet.</span>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Accounts
            </div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">
              {totalUsersCount} Registered
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Administrators
            </div>
            <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {activeAdminsCount} Active
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Receipt Issuers
            </div>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {activeIssuersCount} Active
            </div>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">User / Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Assigned Permissions</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {users.map(u => {
                const isUserOwner = u.role === 'OWNER';
                const isActive = u.status === 'ACTIVE';
                const perms = resolveUserPermissions(u);

                return (
                  <tr key={u.email} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                          isUserOwner 
                            ? 'bg-blue-600 text-white' 
                            : u.role === 'ADMIN'
                            ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white block">{u.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Added: {u.createdAt ? u.createdAt.split('T')[0] : 'System Seed'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {u.email}
                    </td>

                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                        isUserOwner 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                          : u.role === 'ADMIN'
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}>
                        {isUserOwner ? 'OWNER' : u.role === 'ADMIN' ? 'ADMIN' : 'RECEIPT ISSUER'}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {perms.canIssueReceipts && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            Issue Receipts
                          </span>
                        )}
                        {perms.canDeleteTransactions && (
                          <span className="text-[10px] bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">
                            Delete Tx
                          </span>
                        )}
                        {perms.canViewReports && (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            Reports
                          </span>
                        )}
                        {perms.canManageUsers && (
                          <span className="text-[10px] bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                            Staff
                          </span>
                        )}
                        {perms.canEditSettings && (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                            Settings
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        isActive 
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {u.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Verify Access & Diagnosis Button */}
                        <button
                          onClick={() => handleVerifyAccess(u)}
                          title="Verify Login & Permissions"
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => openEditModal(u)}
                          title="Edit Name, Role or Permissions"
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {!isUserOwner && (
                          <>
                            {/* Toggle status */}
                            <button
                              onClick={() => handleToggleStatus(u.email, u.status)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                isActive 
                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100' 
                                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                              }`}
                            >
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => setUserToDelete({ email: u.email, name: u.name })}
                              title="Delete Account"
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Delete User Account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{userToDelete.name}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Are you sure you want to permanently delete user <span className="font-semibold text-slate-900 dark:text-white">{userToDelete.name}</span> (<span className="font-mono text-xs">{userToDelete.email}</span>)? They will immediately lose authorization to access the system and issue receipts.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-xl transition inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff / Admin Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Add New Staff Member</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-xl p-3 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Brenda Namutebi"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Authorized Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. brenda.admin@scbasimbuzi.org"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Login OTP verification codes will be sent to this email.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Role Category
                  </label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  >
                    <option value="ADMIN">Administrator (Full Admin)</option>
                    <option value="ISSUER">Receipt Issuer (Cashier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  >
                    <option value="ACTIVE">ACTIVE (Authorized immediately)</option>
                    <option value="INACTIVE">INACTIVE (Access disabled)</option>
                  </select>
                </div>
              </div>

              {/* Granular Permissions */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider">
                  Custom Permission Capabilities
                </span>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={permissions.canIssueReceipts}
                      onChange={(e) => setPermissions(p => ({ ...p, canIssueReceipts: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Issue Receipts & Send Invoices</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={permissions.canDeleteTransactions}
                      onChange={(e) => setPermissions(p => ({ ...p, canDeleteTransactions: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Delete Transactions from Ledger</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={permissions.canViewReports}
                      onChange={(e) => setPermissions(p => ({ ...p, canViewReports: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Access Financial Reports & Export Excel</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={permissions.canManageUsers}
                      onChange={(e) => setPermissions(p => ({ ...p, canManageUsers: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Manage Staff & Administrators</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={permissions.canEditSettings}
                      onChange={(e) => setPermissions(p => ({ ...p, canEditSettings: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Modify System & Organization Settings</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm shadow-blue-600/20 cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{isSubmitting ? 'Saving...' : 'Add Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User & Permissions Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="bg-blue-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-bold text-sm">Edit User & Permissions</h3>
                  <p className="text-[11px] text-blue-100">{editingUser.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {editModalError && (
                <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 rounded-xl p-3 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{editModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Role Category
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.role === 'OWNER'}
                    onChange={(e) => handleEditRoleChange(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
                  >
                    {editingUser.role === 'OWNER' && <option value="OWNER">System Owner</option>}
                    <option value="ADMIN">Administrator (Full Admin)</option>
                    <option value="ISSUER">Receipt Issuer (Cashier)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Status
                  </label>
                  <select
                    value={editStatus}
                    disabled={editingUser.role === 'OWNER'}
                    onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none disabled:opacity-50"
                  >
                    <option value="ACTIVE">ACTIVE (Authorized)</option>
                    <option value="INACTIVE">INACTIVE (Disabled)</option>
                  </select>
                </div>
              </div>

              {/* Granular Permissions */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider">
                  Permission Capabilities
                </span>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editPermissions.canIssueReceipts}
                      disabled={editingUser.role === 'OWNER'}
                      onChange={(e) => setEditPermissions(p => ({ ...p, canIssueReceipts: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Issue Receipts & Send Invoices</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editPermissions.canDeleteTransactions}
                      disabled={editingUser.role === 'OWNER'}
                      onChange={(e) => setEditPermissions(p => ({ ...p, canDeleteTransactions: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Delete Transactions from Ledger</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editPermissions.canViewReports}
                      disabled={editingUser.role === 'OWNER'}
                      onChange={(e) => setEditPermissions(p => ({ ...p, canViewReports: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Access Financial Reports & Export Excel</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editPermissions.canManageUsers}
                      disabled={editingUser.role === 'OWNER'}
                      onChange={(e) => setEditPermissions(p => ({ ...p, canManageUsers: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Manage Staff & Administrators</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={editPermissions.canEditSettings}
                      disabled={editingUser.role === 'OWNER'}
                      onChange={(e) => setEditPermissions(p => ({ ...p, canEditSettings: e.target.checked }))}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Can Modify System & Organization Settings</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 shadow-sm shadow-blue-600/20 cursor-pointer"
                >
                  {isEditSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{isEditSubmitting ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Diagnostic & Access Verification Modal */}
      {diagUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Account Access Verification</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{diagUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => { setDiagUser(null); setDiagResult(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {diagLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-xs font-medium">Verifying authorization and Google Sheets status...</p>
              </div>
            ) : diagResult ? (
              <div className="space-y-4 text-xs">
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  diagResult.authorized 
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200' 
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
                }`}>
                  {diagResult.authorized ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {diagResult.authorized ? 'Access Authorized' : 'Access Restricted'}
                    </div>
                    <div className="mt-1 leading-relaxed">{diagResult.message}</div>
                  </div>
                </div>

                {diagResult.details && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Verification Checklist</div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Registered in System:</span>
                      <span className={`font-semibold flex items-center gap-1 ${diagResult.details.localUserFound ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {diagResult.details.localUserFound ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        {diagResult.details.localUserFound ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Account Status:</span>
                      <span className="font-semibold text-slate-900 dark:text-white uppercase">{diagResult.details.userStatus}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Assigned Role:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{diagResult.details.userRole}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-300">Google Sheets Sync:</span>
                      <span className={`font-semibold flex items-center gap-1 ${diagResult.details.sheetsUserFound ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                        {diagResult.details.sheetsUserFound ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {diagResult.details.sheetsUserFound ? 'Synced in Google Sheet' : (isLiveBackend ? 'Pending Sheet Sync' : 'Backend Not Connected')}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 text-[11px] leading-relaxed">
                  <span className="font-bold">How Sign-In Works for this User:</span> When <span className="font-semibold">{diagUser.name}</span> visits the app and types <span className="font-mono font-semibold">{diagUser.email}</span>, the system verifies their active status and sends a 6-digit access code to their email.
                </div>
              </div>
            ) : null}

            <div className="pt-2 flex items-center justify-between">
              {isLiveBackend && diagResult && !diagResult.details?.sheetsUserFound && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleSyncAll();
                    if (diagUser) handleVerifyAccess(diagUser);
                  }}
                  className="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Sync to Sheet Now</span>
                </button>
              )}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => { setDiagUser(null); setDiagResult(null); }}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold rounded-xl transition hover:opacity-90 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
