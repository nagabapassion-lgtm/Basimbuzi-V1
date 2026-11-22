import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { 
  User, 
  Transaction, 
  AppSettings, 
  AuditLogEntry, 
  ActiveTab, 
  GenerateReceiptPayload, 
  BackendResponse,
  AuthCheckResult,
  ThemeMode,
  UserPermissions,
  resolveUserPermissions,
  Member,
  LedgerMetrics,
  TransactionType
} from '../types';
import { api, SYSTEM_OWNER_EMAIL } from '../services/api';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  currentUser: User | null;
  userPermissions: UserPermissions;
  isAuthenticated: boolean;
  isAccessDenied: boolean;
  accessDeniedMessage: string;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  transactions: Transaction[];
  members: Member[];
  payers: Member[];
  ledgerMetrics: LedgerMetrics;
  users: User[];
  settings: AppSettings;
  auditLogs: AuditLogEntry[];
  isLiveBackend: boolean;
  gasUrl: string;
  setGasUrl: (url: string) => void;
  sendLoginOtp: (email: string) => Promise<BackendResponse<{ email: string; code?: string; isLiveBackend?: boolean }>>;
  verifyLoginOtp: (email: string, code: string) => Promise<AuthCheckResult>;
  loginWithPassword: (email: string, password: string) => Promise<AuthCheckResult>;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  refreshData: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  recordTransaction: (payload: {
    type?: TransactionType;
    payerName?: string;
    payee?: string;
    category?: string;
    voucherNumber?: string;
    approvedBy?: string;
    phone?: string;
    email?: string;
    amount: number | string;
    paymentPurpose?: string;
    paymentMethod: string;
    paymentReference?: string;
    notes?: string;
    paymentStatus?: Transaction['paymentStatus'];
  }) => Promise<BackendResponse<Transaction>>;
  recordOutflow: (payload: {
    payee: string;
    amount: number | string;
    category: string;
    paymentMethod: string;
    paymentReference?: string;
    notes?: string;
    approvedBy?: string;
    phone?: string;
    email?: string;
  }) => Promise<BackendResponse<Transaction>>;
  generateReceipt: (payload: Omit<GenerateReceiptPayload, 'operatorEmail' | 'operatorName'>) => Promise<BackendResponse<Transaction>>;
  deleteTransaction: (receiptNumber: string) => Promise<BackendResponse<void>>;
  resendReceipt: (receiptNumber: string) => Promise<BackendResponse<Transaction>>;
  addUser: (user: Omit<User, 'createdAt'>) => Promise<BackendResponse<User>>;
  editUser: (targetEmail: string, updates: Partial<User>) => Promise<BackendResponse<User>>;
  updateUserStatus: (targetEmail: string, status: 'ACTIVE' | 'INACTIVE') => Promise<BackendResponse<void>>;
  removeUser: (targetEmail: string) => Promise<BackendResponse<void>>;
  syncAllUsers: () => Promise<BackendResponse<{ count: number }>>;
  saveSettings: (newSettings: AppSettings) => Promise<BackendResponse<AppSettings>>;
  selectedReceipt: Transaction | null;
  setSelectedReceipt: (tx: Transaction | null) => void;
  lastGeneratedReceipt: Transaction | null;
  setLastGeneratedReceipt: (tx: Transaction | null) => void;
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'sc_basimbuzi_active_user_email_v2';
const THEME_STORAGE_KEY = 'sc_basimbuzi_theme';

const TAB_HASH_MAP: Record<string, ActiveTab> = {
  dashboard: 'dashboard',
  generate: 'generate',
  receipt: 'generate',
  'issue-receipt': 'generate',
  transactions: 'transactions',
  ledger: 'transactions',
  members: 'members',
  directory: 'members',
  search: 'search',
  reports: 'reports',
  analytics: 'reports',
  website: 'website',
  news: 'website',
  cms: 'website',
  users: 'users',
  administrators: 'users',
  sync: 'sync',
  settings: 'settings',
  audit: 'audit',
  logs: 'audit',
  setup: 'setup'
};

const getTabFromHash = (): ActiveTab => {
  if (typeof window === 'undefined') return 'dashboard';
  const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return TAB_HASH_MAP[raw] || 'dashboard';
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAccessDenied, setIsAccessDenied] = useState<boolean>(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => getTabFromHash());

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const inAdmin =
        window.location.pathname.toLowerCase().startsWith('/admin') ||
        window.location.hash.toLowerCase().startsWith('#/admin');
      if (inAdmin && getTabFromHash() !== tab) {
        window.location.hash = `/${tab}`;
      }
    }
  }, []);

  // Synchronize browser history and hash navigation (Back/Forward buttons, direct URLs)
  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined') {
        const inAdmin =
          window.location.pathname.toLowerCase().startsWith('/admin') ||
          window.location.hash.toLowerCase().startsWith('#/admin');
        if (!inAdmin) return;
      }
      const nextTab = getTabFromHash();
      setActiveTabState(nextTab);
      setLastGeneratedReceipt(null);
    };

    window.addEventListener('hashchange', handleHashChange);

    // If inside /admin and no tab hash is set yet, set default tab hash
    if (typeof window !== 'undefined') {
      const inAdmin =
        window.location.pathname.toLowerCase().startsWith('/admin') ||
        window.location.hash.toLowerCase().startsWith('#/admin');
      if (inAdmin && (!window.location.hash || window.location.hash === '#/' || window.location.hash.toLowerCase() === '#/admin')) {
        window.location.hash = `/${activeTab}`;
      }
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [activeTab]);
  
  // Theme state
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    return saved || 'light';
  });

  // Fast Instant-Load Cache (0ms perceived wait time)
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>(() => api.getStoredTransactions());
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>(() => api.getStoredUsers());
  const [settings, setSettings] = useState<AppSettings>(() => api.getStoredSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => api.getStoredAuditLogs());
  
  // Real-time ledger metrics computed on-the-fly (incorporates opening balance)
  const ledgerMetrics = useMemo(() => api.calculateLedgerMetrics(transactions, settings), [transactions, settings]);

  // Live payer directory: merges historical/live transactions with Member Registry
  const payers = useMemo(() => {
    return api.getPayersFromTransactions(transactions, members);
  }, [transactions, members]);
  
  const [gasUrl, setGasUrlState] = useState<string>(api.getGasUrl());
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(api.isConnectedToLiveBackend());

  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);
  const [lastGeneratedReceipt, setLastGeneratedReceipt] = useState<Transaction | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Dynamically synchronize browser tab favicon & OpenGraph social share card with custom logo or official SC Basimbuzi crest
  useEffect(() => {
    const targetUrl = settings.logoUrl && settings.logoUrl.trim() ? settings.logoUrl.trim() : '/favicon.svg';
    const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='apple-touch-icon']");
    
    if (iconLinks.length > 0) {
      iconLinks.forEach(link => {
        link.href = targetUrl;
      });
    } else {
      const newLink = document.createElement('link');
      newLink.rel = 'icon';
      newLink.href = targetUrl;
      document.head.appendChild(newLink);
    }

    // Synchronize social share card image (OpenGraph / Twitter / WhatsApp)
    try {
      if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        const logoToUse = (settings.logoUrl && !settings.logoUrl.endsWith('.svg'))
          ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${origin}${settings.logoUrl.startsWith('/') ? '' : '/'}${settings.logoUrl}`)
          : `${origin}/logo.png`;

        const setMetaContent = (selector: string, attr: string, val: string) => {
          let el = document.querySelector<HTMLMetaElement>(selector);
          if (!el) {
            el = document.createElement('meta');
            const match = selector.match(/meta\[([a-zA-Z:]+)="([^"]+)"\]/);
            if (match) {
              el.setAttribute(match[1], match[2]);
              document.head.appendChild(el);
            }
          }
          if (el) el.setAttribute(attr, val);
        };

        setMetaContent('meta[property="og:image"]', 'content', logoToUse);
        setMetaContent('meta[property="og:image:secure_url"]', 'content', logoToUse);
        setMetaContent('meta[name="twitter:image"]', 'content', logoToUse);
        setMetaContent('meta[property="og:url"]', 'content', origin);
      }
    } catch {}
  }, [settings.logoUrl]);

  // Synchronize shared server settings (logoUrl & branding) and shared users across all devices
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const sRes = await fetch('/api/settings').then(r => r.json());
        if (isMounted && sRes && sRes.success && sRes.data) {
          setSettings(prev => ({
            ...prev,
            ...sRes.data,
            logoUrl: (sRes.data.logoUrl && sRes.data.logoUrl.trim()) ? sRes.data.logoUrl.trim() : (prev.logoUrl || HARDCODED_LOGO_URL)
          }));
        }
      } catch {
        // Non-blocking
      }

      try {
        const uRes = await fetch('/api/users').then(r => r.json());
        if (isMounted && uRes && uRes.success && Array.isArray(uRes.data) && uRes.data.length > 0) {
          setUsers(prev => {
            const map = new Map<string, User>();
            for (const u of prev) {
              if (u.email) map.set(u.email.toLowerCase().trim(), u);
            }
            for (const u of uRes.data) {
              if (u.email) {
                const k = u.email.toLowerCase().trim();
                const exist = map.get(k);
                map.set(k, exist ? { ...exist, ...u, password: u.password || exist.password } : u);
              }
            }
            return Array.from(map.values());
          });
        }
      } catch {
        // Non-blocking
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Dynamically synchronize document title with the active admin page
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (!path.startsWith('/admin') && !hash.startsWith('#/admin')) {
        return;
      }
    }
    const titles: Record<ActiveTab, string> = {
      dashboard: 'Dashboard',
      generate: 'Issue Official Receipt',
      transactions: 'Transaction Ledger',
      members: 'Members Directory',
      search: 'Search Receipts',
      reports: 'Reports & Analytics',
      website: 'Club News & Website CMS',
      users: 'Administrators',
      sync: 'Database Synchronization',
      settings: 'Settings & Appearance',
      audit: 'Audit Logs',
      setup: 'Apps Script Backend'
    };
    const orgName = settings.organizationName || 'SC Basimbuzi';
    document.title = `${titles[activeTab] || 'Management Portal'} | ${orgName}`;
  }, [activeTab, settings.organizationName]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const setGasUrl = useCallback((url: string) => {
    api.setGasUrl(url);
    setGasUrlState(url);
    setIsLiveBackend(api.isConnectedToLiveBackend());
  }, []);

  const loadDataForUser = useCallback(async (user: User, showFullSpinner: boolean = false) => {
    try {
      if (showFullSpinner) {
        setIsLoading(true);
      } else {
        setIsSyncing(true);
      }
      const data = await api.getInitialData(user.email, 200);
      setSettings(data.settings);
      setTransactions(data.transactions);
      setUsers(data.users);
      setAuditLogs(data.auditLogs);
      // Fetch cached members for smart autofill
      api.getMembers(user.email).then(mRes => {
        if (mRes.success && mRes.data) {
          setMembers(mRes.data);
        }
      }).catch(() => {});
      setLastSyncedAt(new Date());
    } catch {
      if (showFullSpinner) {
        addToast('Failed to sync latest data', 'error');
      }
    } finally {
      if (showFullSpinner) {
        setIsLoading(false);
      }
      setIsSyncing(false);
    }
  }, [addToast]);

  const sendLoginOtp = useCallback(async (email: string) => {
    return await api.sendLoginOtp(email);
  }, []);

  const verifyLoginOtp = useCallback(async (email: string, code: string): Promise<AuthCheckResult> => {
    setIsLoading(true);
    try {
      const res = await api.verifyLoginOtp(email, code);
      if (res.authorized && res.user) {
        setCurrentUser(res.user);
        setIsAuthenticated(true);
        setIsAccessDenied(false);
        setAccessDeniedMessage('');
        localStorage.setItem(AUTH_STORAGE_KEY, res.user.email);
        await loadDataForUser(res.user, false);
        addToast(`Welcome back, ${res.user.name} (${res.user.role})`, 'success');
      }
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        authorized: false,
        message: msg
      };
    } finally {
      setIsLoading(false);
    }
  }, [loadDataForUser, addToast]);

  const loginWithPassword = useCallback(async (email: string, password: string): Promise<AuthCheckResult> => {
    setIsLoading(true);
    try {
      const res = await api.loginWithPassword(email, password);
      if (res.authorized && res.user) {
        setCurrentUser(res.user);
        setIsAuthenticated(true);
        setIsAccessDenied(false);
        setAccessDeniedMessage('');
        localStorage.setItem(AUTH_STORAGE_KEY, res.user.email);
        await loadDataForUser(res.user, false);
        addToast(`Welcome back, ${res.user.name} (${res.user.role})`, 'success');
      }
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        authorized: false,
        message: msg
      };
    } finally {
      setIsLoading(false);
    }
  }, [loadDataForUser, addToast]);

  const login = useCallback(async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setIsAccessDenied(false);
    setAccessDeniedMessage('');

    try {
      const authResult = await api.checkAuth(email);
      if (authResult.authorized && authResult.user) {
        setCurrentUser(authResult.user);
        setIsAuthenticated(true);
        localStorage.setItem(AUTH_STORAGE_KEY, authResult.user.email);
        await loadDataForUser(authResult.user, false);
        addToast(`Welcome, ${authResult.user.name} (${authResult.user.role})`, 'success');
        return true;
      } else {
        setIsAccessDenied(true);
        setAccessDeniedMessage(authResult.message || 'ACCESS DENIED — You are not authorized to access the SC Basimbuzi Receipt Management System.');
        setIsAuthenticated(false);
        setCurrentUser(null);
        return false;
      }
    } catch {
      setIsAccessDenied(true);
      setAccessDeniedMessage('ACCESS DENIED — You are not authorized to access the SC Basimbuzi Receipt Management System.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadDataForUser, addToast]);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsAccessDenied(false);
    setAccessDeniedMessage('');
    setActiveTab('dashboard');
    addToast('Logged out successfully', 'info');
  }, [addToast]);

  const refreshData = useCallback(async () => {
    if (currentUser) {
      await loadDataForUser(currentUser, false);
      addToast('Synced latest records from Google Sheets', 'success');
    }
  }, [currentUser, loadDataForUser, addToast]);

  // Initial Auth session verification on load without flashing Access Denied
  useEffect(() => {
    let isMounted = true;

    const checkSavedSession = async () => {
      const savedEmail = localStorage.getItem(AUTH_STORAGE_KEY);

      // Fast Optimistic Recovery: if cached user exists, render dashboard IMMEDIATELY (0ms)
      if (savedEmail) {
        const localUsers = api.getStoredUsers();
        const cachedUser = localUsers.find(u => (u.email || '').trim().toLowerCase() === savedEmail.trim().toLowerCase());
        if (cachedUser && cachedUser.status === 'ACTIVE') {
          setCurrentUser(cachedUser);
          setIsAuthenticated(true);
          setIsAccessDenied(false);
          setIsLoading(false); // Immediate 0ms rendering
        }
      } else {
        setIsLoading(false);
      }

      // Sync shared configuration and users across instances in the background
      try {
        await api.syncSharedConfigAndUsers();
        if (isMounted) {
          setGasUrlState(api.getGasUrl());
          setIsLiveBackend(api.isConnectedToLiveBackend());
        }
      } catch {
        // Ignore
      }

      // Silent background validation against Google Sheets
      if (savedEmail) {
        try {
          setIsSyncing(true);
          const authResult = await api.checkAuth(savedEmail);
          if (isMounted) {
            if (authResult.authorized && authResult.user) {
              setCurrentUser(authResult.user);
              setIsAuthenticated(true);
              setIsAccessDenied(false);
              setAccessDeniedMessage('');
              await loadDataForUser(authResult.user, false);
            } else {
              // Stale or invalid session: silently remove saved session and show login screen
              localStorage.removeItem(AUTH_STORAGE_KEY);
              setCurrentUser(null);
              setIsAuthenticated(false);
              setIsAccessDenied(false);
              setAccessDeniedMessage('');
            }
          }
        } catch {
          // If offline / network error, retain existing authenticated session from cache
        } finally {
          if (isMounted) {
            setIsSyncing(false);
            setIsLoading(false);
          }
        }
      }
    };

    checkSavedSession();

    return () => {
      isMounted = false;
    };
  }, [loadDataForUser]);

  const userPermissions = useMemo(() => resolveUserPermissions(currentUser), [currentUser]);

  const refreshMembers = useCallback(async () => {
    try {
      const res = await api.getMembers(currentUser?.email);
      if (res.success && res.data) {
        setMembers(res.data);
      }
    } catch {}
  }, [currentUser?.email]);

  // Initial load of members
  useEffect(() => {
    api.getMembers().then(res => {
      if (res.success && res.data) {
        setMembers(res.data);
      }
    }).catch(() => {});
  }, []);

  const recordTransaction = async (
    payload: {
      type?: TransactionType;
      payerName?: string;
      payee?: string;
      category?: string;
      voucherNumber?: string;
      approvedBy?: string;
      phone?: string;
      email?: string;
      amount: number | string;
      paymentPurpose?: string;
      paymentMethod: string;
      paymentReference?: string;
      notes?: string;
      paymentStatus?: Transaction['paymentStatus'];
    }
  ): Promise<BackendResponse<Transaction>> => {
    if (!currentUser) {
      return { success: false, error: 'User is not logged in.' };
    }

    const fullPayload = {
      ...payload,
      operatorEmail: currentUser.email,
      operatorName: currentUser.name
    };

    const res = await api.recordTransaction(fullPayload);
    if (res.success && res.data) {
      setTransactions(prev => [res.data!, ...prev]);
      if (res.data.type !== 'OUTFLOW') {
        setLastGeneratedReceipt(res.data);
      }
      addToast(res.message || `${res.data.type === 'OUTFLOW' ? 'Expense voucher' : 'Receipt'} recorded!`, 'success');
      refreshMembers();
      if (currentUser.role === 'OWNER' || userPermissions.canViewReports) {
        api.getInitialData(currentUser.email).then(d => {
          setAuditLogs(d.auditLogs);
        }).catch(() => {});
      }
    } else {
      addToast(res.error || 'Failed to record transaction', 'error');
    }
    return res;
  };

  const recordOutflow = async (
    payload: {
      payee: string;
      amount: number | string;
      category: string;
      paymentMethod: string;
      paymentReference?: string;
      notes?: string;
      approvedBy?: string;
      phone?: string;
      email?: string;
    }
  ): Promise<BackendResponse<Transaction>> => {
    return recordTransaction({
      ...payload,
      type: 'OUTFLOW',
      payerName: payload.payee
    });
  };

  const generateReceipt = async (
    payload: Omit<GenerateReceiptPayload, 'operatorEmail' | 'operatorName'>
  ): Promise<BackendResponse<Transaction>> => {
    return recordTransaction({
      ...payload,
      type: 'INFLOW'
    });
  };

  const deleteTransaction = async (receiptNumber: string): Promise<BackendResponse<void>> => {
    if (!currentUser) {
      return { success: false, error: 'User is not logged in.' };
    }

    if (currentUser.role !== 'OWNER' && !userPermissions.canDeleteTransactions) {
      return { success: false, error: 'Permission denied. You do not have permission to delete transactions.' };
    }

    const res = await api.deleteTransaction(receiptNumber, currentUser.email);
    if (res.success) {
      const cleanTarget = receiptNumber.trim().toUpperCase();
      setTransactions(prev => prev.filter(t => t.receiptNumber.trim().toUpperCase() !== cleanTarget));
      if (selectedReceipt && selectedReceipt.receiptNumber.trim().toUpperCase() === cleanTarget) {
        setSelectedReceipt(null);
      }
      addToast(res.message || `Receipt ${receiptNumber} deleted successfully`, 'success');
      // Refresh audit logs
      api.getInitialData(currentUser.email).then(d => {
        setAuditLogs(d.auditLogs);
      });
    } else {
      addToast(res.error || 'Failed to delete receipt', 'error');
    }
    return res;
  };

  const resendReceipt = async (receiptNumber: string): Promise<BackendResponse<Transaction>> => {
    if (!currentUser) {
      return { success: false, error: 'User is not logged in.' };
    }

    const res = await api.resendReceipt(receiptNumber, currentUser.email);
    if (res.success && res.data) {
      setTransactions(prev => prev.map(t => t.receiptNumber === receiptNumber ? res.data! : t));
      if (selectedReceipt && selectedReceipt.receiptNumber === receiptNumber) {
        setSelectedReceipt(res.data);
      }
      addToast(res.message || 'Receipt email resent successfully', 'success');
    } else {
      addToast(res.error || 'Failed to resend receipt email', 'error');
    }
    return res;
  };

  const addUser = async (newUserData: Omit<User, 'createdAt'>): Promise<BackendResponse<User>> => {
    const opEmail = currentUser?.email || SYSTEM_OWNER_EMAIL;
    const isOwner = currentUser?.role === 'OWNER' || opEmail.toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();
    const canManage = isOwner || userPermissions.canManageUsers;

    if (!canManage) {
      return { success: false, error: 'Only the System Owner or authorized Managers can add staff members.' };
    }

    const res = await api.addUser(newUserData, opEmail);
    if (res.success && res.data) {
      setUsers(prev => {
        const idx = prev.findIndex(u => u.email.toLowerCase() === res.data!.email.toLowerCase());
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = res.data!;
          return updated;
        }
        return [...prev, res.data!];
      });
      addToast(res.message || 'Staff member added successfully', 'success');
    } else {
      addToast(res.error || 'Failed to add staff member', 'error');
    }
    return res;
  };

  const editUser = async (targetEmail: string, updates: Partial<User>): Promise<BackendResponse<User>> => {
    const opEmail = currentUser?.email || SYSTEM_OWNER_EMAIL;
    const isOwner = currentUser?.role === 'OWNER' || opEmail.toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();
    const canManage = isOwner || userPermissions.canManageUsers;

    if (!canManage) {
      return { success: false, error: 'Only the System Owner or authorized Managers can edit users and permissions.' };
    }

    const res = await api.editUser(targetEmail, updates, opEmail);
    if (res.success && res.data) {
      setUsers(prev => prev.map(u => u.email.toLowerCase() === targetEmail.toLowerCase() ? res.data! : u));
      // If editing current logged in user
      if (currentUser && currentUser.email.toLowerCase() === targetEmail.toLowerCase()) {
        setCurrentUser(res.data);
      }
      addToast(res.message || 'User updated successfully', 'success');
    } else {
      addToast(res.error || 'Failed to update user', 'error');
    }
    return res;
  };

  const updateUserStatus = async (targetEmail: string, status: 'ACTIVE' | 'INACTIVE'): Promise<BackendResponse<void>> => {
    const opEmail = currentUser?.email || SYSTEM_OWNER_EMAIL;
    const isOwner = currentUser?.role === 'OWNER' || opEmail.toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();
    const canManage = isOwner || userPermissions.canManageUsers;

    if (!canManage) {
      return { success: false, error: 'Only the System Owner or authorized Managers can update user status.' };
    }

    const res = await api.updateUserStatus(targetEmail, status, opEmail);
    if (res.success) {
      setUsers(prev => prev.map(u => u.email.toLowerCase() === targetEmail.toLowerCase() ? { ...u, status } : u));
      addToast(`User status updated to ${status}`, 'success');
    } else {
      addToast(res.error || 'Failed to update status', 'error');
    }
    return res;
  };

  const removeUser = async (targetEmail: string): Promise<BackendResponse<void>> => {
    const opEmail = currentUser?.email || SYSTEM_OWNER_EMAIL;
    const isOwner = currentUser?.role === 'OWNER' || opEmail.toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase();
    const canManage = isOwner || userPermissions.canManageUsers;

    if (!canManage) {
      return { success: false, error: 'Only the System Owner or authorized Managers can remove users.' };
    }

    const res = await api.removeUser(targetEmail, opEmail);
    if (res.success) {
      setUsers(prev => prev.filter(u => u.email.toLowerCase() !== targetEmail.toLowerCase()));
      addToast('User deleted successfully', 'success');
    } else {
      addToast(res.error || 'Failed to delete user', 'error');
    }
    return res;
  };

  const syncAllUsers = async (): Promise<BackendResponse<{ count: number }>> => {
    const opEmail = currentUser?.email || SYSTEM_OWNER_EMAIL;
    const res = await api.syncAllUsersToGas(opEmail);
    if (res.success) {
      addToast(res.message || 'Staff members synchronized to Google Sheets', 'success');
    } else {
      addToast(res.error || 'Failed to sync staff to Google Sheets', 'error');
    }
    return res;
  };

  const saveSettings = async (newSettings: AppSettings): Promise<BackendResponse<AppSettings>> => {
    if (!currentUser || (currentUser.role !== 'OWNER' && !userPermissions.canEditSettings)) {
      return { success: false, error: 'Only the System Owner or authorized Managers can update system settings.' };
    }

    // Always immediately update state
    setSettings(newSettings);

    const res = await api.saveSettings(newSettings, currentUser.email);
    if (res.success && res.data) {
      setSettings(res.data);
      addToast('Settings updated and saved successfully', 'success');
    } else {
      addToast(res.error || 'Saved locally. Backend sync failed.', 'info');
    }
    return res;
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userPermissions,
        isAuthenticated,
        isAccessDenied,
        accessDeniedMessage,
        isLoading,
        isSyncing,
        lastSyncedAt,
        theme,
        toggleTheme,
        setTheme,
        activeTab,
        setActiveTab,
        transactions,
        members: members.length > 0 ? members : payers,
        payers,
        ledgerMetrics,
        users,
        settings,
        auditLogs,
        isLiveBackend,
        gasUrl,
        setGasUrl,
        sendLoginOtp,
        verifyLoginOtp,
        loginWithPassword,
        login,
        logout,
        refreshData,
        refreshMembers,
        recordTransaction,
        recordOutflow,
        generateReceipt,
        deleteTransaction,
        resendReceipt,
        addUser,
        editUser,
        updateUserStatus,
        removeUser,
        syncAllUsers,
        saveSettings,
        selectedReceipt,
        setSelectedReceipt,
        lastGeneratedReceipt,
        setLastGeneratedReceipt,
        toasts,
        addToast,
        removeToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

