import { 
  Transaction, 
  User, 
  AppSettings, 
  AuditLogEntry, 
  GenerateReceiptPayload, 
  BackendResponse,
  AuthCheckResult,
  resolveUserPermissions,
  getDefaultPermissions,
  Member,
  MembersDirectoryPayload,
  MemberProfileSubmission,
  LedgerMetrics,
  TransactionType,
  ReconciliationSummary
} from '../types';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import {
  cleanPhoneNumber,
  compareTransactions,
  isStaffOrPlaceholderEmail,
  PRE_CSV_COVERED_RECEIPT_SET,
  resolveCanonicalMemberNameKey
} from '../utils/ledgerReconciliation';
import { safeFetchJson, safeFetchMutation } from '../utils/apiFetch';

const STORAGE_KEYS = {
  GAS_URL: 'sc_basimbuzi_gas_url',
  LOCAL_TXS: 'sc_basimbuzi_txs_v2',
  LOCAL_USERS: 'sc_basimbuzi_users_v2',
  LOCAL_SETTINGS: 'sc_basimbuzi_settings_v2',
  LOCAL_AUDIT: 'sc_basimbuzi_audit_v2',
  LOCAL_COUNTER: 'sc_basimbuzi_counter_v2',
  AUTH_USER: 'sc_basimbuzi_auth_user_v2',
  ACTIVE_OTPS: 'sc_basimbuzi_active_otps_v2',
  MEMBERS_CACHE: 'sc_basimbuzi_members_cache_v2'
};

// Default organization settings with blue branding and logo field
const DEFAULT_SEED_SETTINGS: AppSettings = {
  organizationName: 'SC Basimbuzi',
  organizationEmail: 'info@scbasimbuzi.org',
  organizationPhone: '+256 700 123456',
  organizationAddress: 'Lugogo Bypass, Kampala, Uganda',
  receiptPrefix: 'SB',
  receiptFooter: 'Thank you for your payment and support towards SC Basimbuzi.',
  logoUrl: HARDCODED_LOGO_URL,
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
  paymentMethods: [
    'Mobile Money',
    'Bank Transfer',
    'Cash',
    'Other'
  ],
  currency: 'UGX',
  customDomain: 'https://scbasimbuzi-v2.ai.studio',
  legacySpreadsheetId: ''
};

export const SYSTEM_OWNER_EMAIL = 'nagabapassion@gmail.com';

// SECURITY: no hardcoded password here. The Owner password lives ONLY in the
// Google Sheets Users sheet (and is set/rotated by the system owner).
export const SYSTEM_OWNER_USER: User = {
  name: 'Nagaba Passion',
  email: 'nagabapassion@gmail.com',
  role: 'OWNER',
  status: 'ACTIVE',
  password: '',
  permissions: getDefaultPermissions('OWNER'),
  createdAt: '2026-01-01T08:00:00.000Z'
};

const DEFAULT_SEED_USERS: User[] = [
  SYSTEM_OWNER_USER
];

// SECURITY: seed transactions removed — real payer records must come from the
// live backend (Google Sheets / GAS), never from the public JS bundle.
const DEFAULT_SEED_TRANSACTIONS: Transaction[] = [];

const DEFAULT_SEED_AUDIT: AuditLogEntry[] = [
  {
    id: '1',
    date: '2026-08-24',
    time: '08:00:00',
    user: 'System',
    userEmail: 'system@scbasimbuzi.org',
    action: 'SYSTEM_INITIALIZE',
    description: 'System initialized with clean ledger starting from zero shillings.'
  }
];

interface StoredOtp {
  code: string;
  expiresAt: number;
}

class ApiClient {
  private gasUrl: string = '';
  private coveredGasReceipts: Set<string> = new Set(PRE_CSV_COVERED_RECEIPT_SET);
  private syncConfigPromise: Promise<void> | null = null;
  private lastConfigSyncAt: number = 0;
  private historicalCache: { email: string; ts: number; data: Transaction[] } | null = null;
  private historicalPromise: Promise<Transaction[]> | null = null;
  private liveGasTxCache: { ts: number; data: Transaction[] } | null = null;
  private liveGasTxPromise: Promise<{
    transactions: Transaction[];
    isQuotaLimited: boolean;
    error: string | null;
  }> | null = null;
  private initialDataPromise: Promise<{
    settings: AppSettings;
    transactions: Transaction[];
    users: User[];
    auditLogs: AuditLogEntry[];
  }> | null = null;

  constructor() {
    this.loadGasUrl();
    this.initLocalStorage();
    this.syncSharedConfigAndUsers();
  }

  public invalidateTransactionCaches(notifyServer: boolean = true): void {
    this.liveGasTxCache = null;
    this.historicalCache = null;
    if (notifyServer && typeof fetch === 'function') {
      fetch('/api/gas/invalidate-cache', { method: 'POST' }).catch(() => null);
    }
  }

  public getGasUrl(): string {
    return this.gasUrl;
  }

  public setGasUrl(url: string, operatorEmail?: string): void {
    this.gasUrl = url.trim();
    localStorage.setItem(STORAGE_KEYS.GAS_URL, this.gasUrl);
    this.invalidateTransactionCaches(true);
    // Broadcast configured GAS URL to server so all devices/staff get it automatically
    const email = (operatorEmail || this.getStoredAuthUser()?.email || '').trim().toLowerCase();
    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(email ? { 'X-Operator-Email': email } : {})
      },
      body: JSON.stringify({ gasUrl: this.gasUrl, operatorEmail: email })
    }).catch(() => null);
  }

  private loadGasUrl(): void {
    const saved = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    if (saved && saved.trim()) {
      this.gasUrl = saved.trim();
    } else if (import.meta.env.VITE_GAS_URL) {
      this.gasUrl = (import.meta.env.VITE_GAS_URL as string).trim();
    }
  }

  public async refreshConnection(): Promise<boolean> {
    await this.syncSharedConfigAndUsers(true);
    return this.isConnectedToLiveBackend();
  }

  public async syncSharedConfigAndUsers(force: boolean = false): Promise<void> {
    if (!force && this.syncConfigPromise) {
      return this.syncConfigPromise;
    }
    if (!force && this.lastConfigSyncAt > 0 && Date.now() - this.lastConfigSyncAt < 30_000) {
      return;
    }

    const runner = (async () => {
      try {
        const [configRes, usersRes, settingsRes] = await Promise.all([
          safeFetchJson<any>('/api/config'),
          safeFetchJson<any>('/api/users'),
          safeFetchJson<any>('/api/settings')
        ]);

        // 1. Sync Config (GAS URL)
        if (configRes && configRes.success && configRes.data?.gasUrl) {
          const remoteGasUrl = configRes.data.gasUrl.trim();
          if (remoteGasUrl && remoteGasUrl.startsWith('https://script.google.com/macros/s/')) {
            this.gasUrl = remoteGasUrl;
            localStorage.setItem(STORAGE_KEYS.GAS_URL, remoteGasUrl);
          }
        } else if (this.gasUrl && this.gasUrl.startsWith('https://script.google.com/macros/s/')) {
          safeFetchMutation('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gasUrl: this.gasUrl })
          }).catch(() => null);
        }

        // 2. Sync Shared Users from Server
        if (usersRes && usersRes.success && Array.isArray(usersRes.data) && usersRes.data.length > 0) {
          const serverUsers: User[] = usersRes.data;
          const localUsers = this.getStoredUsers();
          const map = new Map<string, User>();
          for (const u of localUsers) {
            if (u.email) map.set(u.email.toLowerCase().trim(), u);
          }
          for (const u of serverUsers) {
            if (u.email) {
              const key = u.email.toLowerCase().trim();
              const existing = map.get(key);
              if (!existing) {
                map.set(key, u);
              } else {
                map.set(key, {
                  ...existing,
                  ...u,
                  password: u.password || existing.password
                });
              }
            }
          }
          const merged = Array.from(map.values());
          localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(merged));
        } else {
          const localUsers = this.getStoredUsers();
          safeFetchMutation('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: localUsers })
          }).catch(() => null);
        }

        // 3. Sync Shared Settings from Server
        if (settingsRes && settingsRes.success && settingsRes.data) {
          const serverSettings: AppSettings = settingsRes.data;
          const localSettings = this.getStoredSettings();
          const mergedSettings: AppSettings = {
            ...DEFAULT_SEED_SETTINGS,
            ...localSettings,
            ...serverSettings,
            logoUrl: (serverSettings.logoUrl && serverSettings.logoUrl.trim()) ? serverSettings.logoUrl : ((localSettings.logoUrl && localSettings.logoUrl.trim()) ? localSettings.logoUrl : HARDCODED_LOGO_URL)
          };
          localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(mergedSettings));
          if (!serverSettings.logoUrl && localSettings.logoUrl) {
            safeFetchMutation('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings: mergedSettings })
            }).catch(() => null);
          }
        } else {
          const localSettings = this.getStoredSettings();
          safeFetchMutation('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: localSettings })
          }).catch(() => null);
        }
        this.lastConfigSyncAt = Date.now();
      } catch {
        // Ignore network sync failures
      } finally {
        this.syncConfigPromise = null;
      }
    })();

    this.syncConfigPromise = runner;
    return runner;
  }

  public isConnectedToLiveBackend(): boolean {
    return Boolean(this.gasUrl && this.gasUrl.startsWith('https://script.google.com/macros/s/'));
  }

  public getStoredAuthUser(): User | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Safely retrieves the stored user list while guaranteeing that the System Owner
   * (nagabapassion@gmail.com) is ALWAYS present, ACTIVE, and equipped with full Owner privileges.
   */
  public getStoredUsers(): User[] {
    let users: User[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_USERS);
      if (raw) {
        users = JSON.parse(raw);
      }
    } catch {
      users = [];
    }

    if (!Array.isArray(users) || users.length === 0) {
      users = [...DEFAULT_SEED_USERS];
    }

    // Clean out obsolete mock dummy test accounts if present in legacy local storage
    users = users.filter(u => {
      const em = (u.email || '').toLowerCase().trim();
      return em !== 'brenda.admin@scbasimbuzi.org' && em !== 'david.admin@scbasimbuzi.org' && em !== 'sarah.cashier@scbasimbuzi.org';
    });

    // Ensure the system owner is always registered, active, and cannot be removed
    const ownerIndex = users.findIndex(u => (u.email || '').trim().toLowerCase() === SYSTEM_OWNER_EMAIL.toLowerCase());
    if (ownerIndex === -1) {
      users.unshift({ ...SYSTEM_OWNER_USER });
    } else {
      users[ownerIndex] = {
        ...users[ownerIndex],
        role: 'OWNER',
        status: 'ACTIVE',
        password: users[ownerIndex].password || SYSTEM_OWNER_USER.password || '',
        permissions: getDefaultPermissions('OWNER')
      };
    }

    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
    return users;
  }

  public sanitizeTransaction(tx: Transaction): Transaction {
    if (!tx || typeof tx !== 'object') return tx;
    const rec = String(tx.receiptNumber || tx.voucherNumber || '').trim().toUpperCase();
    const isOutflow = String(tx.type || '').toUpperCase() === 'OUTFLOW' || rec.startsWith('EXP-');
    const resolvedType: TransactionType = isOutflow ? 'OUTFLOW' : 'INFLOW';
    const numAmount = Math.max(0, typeof tx.amount === 'string' ? parseFloat(String(tx.amount).replace(/[^0-9.-]+/g, '')) || 0 : Number(tx.amount) || 0);
    const cleanedPhone = cleanPhoneNumber(tx.phone || '');
    const subjectName = isOutflow ? (tx.payee || tx.payerName) : tx.payerName;
    const rawEmail = String(tx.email || '').trim().toLowerCase();
    const staffEmails = this.getStoredUsers().map(u => u.email);
    const isSafeEmail = Boolean(rawEmail && !isStaffOrPlaceholderEmail(rawEmail, subjectName, staffEmails));
    const effectiveEmail = isSafeEmail ? rawEmail : '';

    return {
      ...tx,
      type: resolvedType,
      amount: numAmount,
      payerName: (isOutflow ? (tx.payee || tx.payerName) : tx.payerName) || (isOutflow ? 'General Expense' : 'General Payer'),
      payee: isOutflow ? (tx.payee || tx.payerName || 'General Expense') : tx.payee,
      phone: cleanedPhone,
      email: effectiveEmail,
      emailStatus: effectiveEmail ? (tx.emailStatus || 'SENT') : 'NOT_PROVIDED'
    };
  }

  public getStoredTransactions(): Transaction[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_TXS);
      const list: Transaction[] = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list) && list.length > 0) {
        return list.map(t => this.sanitizeTransaction(t));
      }
      return [...DEFAULT_SEED_TRANSACTIONS];
    } catch {
      return [...DEFAULT_SEED_TRANSACTIONS];
    }
  }

  public getStoredSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_SETTINGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SEED_SETTINGS,
          ...parsed,
          logoUrl: (parsed.logoUrl && parsed.logoUrl.trim()) ? parsed.logoUrl.trim() : HARDCODED_LOGO_URL,
          customDomain: (parsed.customDomain && parsed.customDomain.trim() && !parsed.customDomain.includes('scbasimbuzi.org')) 
            ? parsed.customDomain.trim() 
            : 'https://scbasimbuzi-v2.ai.studio'
        };
      }
      return { ...DEFAULT_SEED_SETTINGS };
    } catch {
      return { ...DEFAULT_SEED_SETTINGS };
    }
  }

  public getStoredAuditLogs(): AuditLogEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT);
      return raw ? JSON.parse(raw) : [...DEFAULT_SEED_AUDIT];
    } catch {
      return [...DEFAULT_SEED_AUDIT];
    }
  }

  private initLocalStorage(): void {
    if (!localStorage.getItem(STORAGE_KEYS.LOCAL_SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(DEFAULT_SEED_SETTINGS));
    }
    this.getStoredUsers();
    if (!localStorage.getItem(STORAGE_KEYS.LOCAL_TXS)) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(DEFAULT_SEED_TRANSACTIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT)) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(DEFAULT_SEED_AUDIT));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOCAL_COUNTER)) {
      localStorage.setItem(STORAGE_KEYS.LOCAL_COUNTER, JSON.stringify({ 2026: 0 }));
    }
  }

  // --- Remote Fetchers ---

  private async fetchFromGas<T>(endpoint: string, options?: RequestInit): Promise<BackendResponse<T>> {
    if (!this.isConnectedToLiveBackend()) {
      return {
        success: false,
        error: 'Google Apps Script Web App URL is not configured.'
      };
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        redirect: 'follow',
      });

      if (res.status === 429) {
        return {
          success: false,
          error: 'Google Apps Script rate limit reached (HTTP 429). Please wait a moment before trying again.'
        };
      }

      if (!res.ok) {
        return {
          success: false,
          error: `Google Apps Script returned HTTP ${res.status}: ${res.statusText}`
        };
      }

      const text = await res.text();
      const trimmed = text.trim();

      // Check if response is an HTML page (Google login redirect, quota error, or crash page)
      if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html') || trimmed.startsWith('<div')) {
        if (trimmed.includes('Service invoked too many times') || trimmed.includes('Quota exceeded')) {
          return {
            success: false,
            error: 'Google Apps Script daily execution quota limit exceeded. Please wait for quota refresh or contact administrator.'
          };
        }
        if (trimmed.includes('accounts.google.com') || trimmed.includes('Sign in')) {
          return {
            success: false,
            error: 'Google Apps Script Web App requires permissions. Please verify the Web App is deployed with "Who has access: Anyone".'
          };
        }
        return {
          success: false,
          error: 'Google Apps Script returned an unexpected HTML response instead of JSON data.'
        };
      }

      try {
        const data = JSON.parse(trimmed);
        return data;
      } catch (parseErr) {
        return {
          success: false,
          error: `Malformed JSON response from Google Apps Script: ${trimmed.slice(0, 100)}`
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Backend communication error: ${message}`
      };
    }
  }

  // --- OTP Authentication Methods ---

  /**
   * Request an OTP login code sent to email
   */
  public async sendLoginOtp(email: string): Promise<BackendResponse<{ email: string; code?: string; isLiveBackend?: boolean }>> {
    const cleanEmail = email.trim().toLowerCase();

    // Check if user is registered and active
    const users = this.getStoredUsers();
    let matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    // Ensure the system owner is recognized
    if (!matched && cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      matched = SYSTEM_OWNER_USER;
    }

    // 1. Check shared server database if not found locally
    if (!matched) {
      try {
        const usersRes = await safeFetchJson<any>('/api/users');
        if (usersRes?.success && Array.isArray(usersRes.data)) {
          const found = usersRes.data.find((u: any) => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (found) {
            matched = found;
            const curUsers = this.getStoredUsers();
            curUsers.push(found);
            localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(curUsers));
          }
        }
      } catch {
        // Ignore network error
      }
    }

    // 2. Check live Google Apps Script backend
    if (!matched) {
      if (!this.isConnectedToLiveBackend()) {
        await this.syncSharedConfigAndUsers();
      }
      if (this.isConnectedToLiveBackend()) {
        try {
          const authRes = await this.checkAuth(cleanEmail);
          if (authRes.authorized && authRes.user) {
            matched = authRes.user;
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!matched) {
      return {
        success: false,
        error: `ACCESS DENIED — Email "${cleanEmail}" is not registered in the SC Basimbuzi system. Please contact the administrator (nagabapassion@gmail.com) to add you.`
      };
    }

    if (matched.status !== 'ACTIVE') {
      return {
        success: false,
        error: `ACCESS DENIED — Account "${cleanEmail}" is currently INACTIVE. Please contact the system owner.`
      };
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save in local OTP registry
    const otps: Record<string, StoredOtp> = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_OTPS) || '{}');
    otps[cleanEmail] = { code: otpCode, expiresAt };
    localStorage.setItem(STORAGE_KEYS.ACTIVE_OTPS, JSON.stringify(otps));

    // Audit log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: matched.name,
      userEmail: cleanEmail,
      action: 'LOGIN_OTP_SENT',
      description: `Dispatched 6-digit access code to ${cleanEmail}`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    // If not connected to live GAS backend, provide local sandbox verification code
    if (!this.isConnectedToLiveBackend()) {
      return {
        success: true,
        data: {
          email: cleanEmail,
          code: otpCode,
          isLiveBackend: false
        },
        message: `Verification code: ${otpCode} (Local sandbox mode). Code valid for 10 minutes.`
      };
    }

    // Dispatch email via Google Apps Script using POST
    let gasSuccess = false;
    let gasError: string | undefined;

    try {
      const postRes = await this.fetchFromGas<{ success: boolean; error?: string }>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sendLoginOtp',
          email: cleanEmail,
          code: otpCode
        })
      });
      if (postRes.success) {
        gasSuccess = true;
      } else {
        gasError = postRes.error;
      }
    } catch (err: unknown) {
      gasError = err instanceof Error ? err.message : String(err);
      gasSuccess = false;
    }

    if (!gasSuccess) {
      return {
        success: false,
        error: gasError 
          ? `Google Apps Script Email Error: ${gasError}. Please ensure your Web App is deployed with "Execute as: Me" and "Who has access: Anyone".` 
          : 'Unable to send email via Google Apps Script. Please verify your Web App URL and permissions.'
      };
    }

    return {
      success: true,
      data: {
        email: cleanEmail,
        isLiveBackend: true
      },
      message: `A 6-digit access code was dispatched to ${cleanEmail}. Please check your email inbox.`
    };
  }

  /**
   * Verify the 6-digit OTP code entered by the user
   */
  public async verifyLoginOtp(email: string, enteredCode: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = enteredCode.trim().replace(/\D/g, '');

    const users = this.getStoredUsers();
    let matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    if (!matched && cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      matched = SYSTEM_OWNER_USER;
    }

    if (!matched || matched.status !== 'ACTIVE') {
      return {
        authorized: false,
        message: 'Account not found or inactive.'
      };
    }

    // Check OTP
    const otps: Record<string, StoredOtp> = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_OTPS) || '{}');
    const stored = otps[cleanEmail];

    if (!stored) {
      return {
        authorized: false,
        message: 'No active verification code found for this email. Please request a new code.'
      };
    }

    if (Date.now() > stored.expiresAt) {
      delete otps[cleanEmail];
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OTPS, JSON.stringify(otps));
      return {
        authorized: false,
        message: 'Verification code has expired. Please request a new one.'
      };
    }

    if (stored.code !== cleanCode) {
      return {
        authorized: false,
        message: 'Invalid verification code. Please check your email and try again.'
      };
    }

    // Valid OTP! Remove it to prevent replay
    delete otps[cleanEmail];
    localStorage.setItem(STORAGE_KEYS.ACTIVE_OTPS, JSON.stringify(otps));

    // Audit log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: matched.name,
      userEmail: cleanEmail,
      action: 'LOGIN',
      description: `User authenticated via email OTP (${matched.role})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    return {
      authorized: true,
      user: matched
    };
  }

  /**
   * Authenticate a user directly using their registered email and password.
   * Dynamically checks the system database so ANY new staff member added can immediately log in.
   */
  public async loginWithPassword(email: string, enteredPassword: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = enteredPassword.trim();

    if (!cleanEmail || !cleanPassword) {
      return {
        authorized: false,
        message: 'Please provide both your registered email address and password.'
      };
    }

    // 1. Authoritative Server Authentication
    // Ensures that ANY staff member added by the administrator can immediately log in from ANY device or browser!
    let srvErrorMessage: string | null = null;
    try {
      const srvRes = await safeFetchMutation('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
      });

      if (srvRes) {
        if (srvRes.success && srvRes.authorized && srvRes.user) {
          const authUser: User = srvRes.user;

          // Update local cache with latest authenticated staff profile
          const localUsers = this.getStoredUsers();
          const idx = localUsers.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (idx !== -1) {
            localUsers[idx] = { ...localUsers[idx], ...authUser };
          } else {
            localUsers.push(authUser);
          }
          localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(localUsers));

          // Record audit log entry
          const now = new Date();
          const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
          auditLogs.unshift({
            id: String(Date.now()),
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0],
            user: authUser.name,
            userEmail: cleanEmail,
            action: 'LOGIN',
            description: `User authenticated via password (${authUser.role})`
          });
          localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

          return {
            authorized: true,
            user: authUser
          };
        } else if (srvRes.message) {
          srvErrorMessage = srvRes.message;
          // If server returned an explicit auth rejection, return it immediately
          if (
            srvRes.message.includes('Incorrect password') || 
            srvRes.message.includes('INACTIVE') || 
            srvRes.message.includes('ACCESS DENIED') ||
            srvRes.message.includes('not registered')
          ) {
            return {
              authorized: false,
              message: srvRes.message
            };
          }
        }
      }
    } catch {
      // Server network failure, proceed to live Google Sheets or local cache below
    }

    // 2. Direct Live Google Apps Script Verification (if server is cold or user was added/synced directly to Google Sheets)
    if (this.isConnectedToLiveBackend()) {
      try {
        let verifiedGasUser: User | null = null;
        let verifySupported = true;
        try {
          let gasRes: any = await this.fetchFromGas<any>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'verifyPassword',
              email: cleanEmail,
              password: cleanPassword
            })
          });
          if (!gasRes?.success && gasRes?.error && gasRes.error.includes('Unknown')) {
            const verifyUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=verifyPassword&email=${encodeURIComponent(cleanEmail)}&password=${encodeURIComponent(cleanPassword)}`;
            gasRes = await this.fetchFromGas<any>(verifyUrl);
          }
          const gasUser: User | undefined = gasRes?.user || gasRes?.data?.user;
          if (gasRes && gasRes.success && (gasRes.authorized || gasUser) && gasUser) {
            verifiedGasUser = gasUser;
          } else if (gasRes?.error && gasRes.error.includes('Unknown')) {
            verifySupported = false;
          } else if (gasRes?.error && (gasRes.error.includes('Incorrect password') || gasRes.error.includes('INACTIVE'))) {
            return {
              authorized: false,
              message: gasRes.error
            };
          }
        } catch {
          verifySupported = false;
        }

        // Legacy fallback ONLY if GAS backend does not yet support verifyPassword
        if (!verifiedGasUser && !verifySupported) {
          const checkUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=checkAuth&email=${encodeURIComponent(cleanEmail)}`;
          const checkRes: any = await this.fetchFromGas<any>(checkUrl);
          if (checkRes && checkRes.success && checkRes.authorized && checkRes.user) {
            const gasUser = checkRes.user;
            if (gasUser.status && gasUser.status !== 'ACTIVE') {
              return {
                authorized: false,
                message: 'This staff account has been set to INACTIVE in Google Sheets. Please contact the administrator.'
              };
            }
            const localUsers = this.getStoredUsers();
            const localMatch = localUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
            if (localMatch && localMatch.password && localMatch.password.trim() === cleanPassword) {
              verifiedGasUser = gasUser;
            } else {
              return {
                authorized: false,
                message: 'Incorrect password. Please verify and try again.'
              };
            }
          } else if (checkRes && checkRes.error && (checkRes.error.includes('ACCESS DENIED') || checkRes.error.includes('not registered'))) {
            return {
              authorized: false,
              message: checkRes.error
            };
          }
        }

        if (verifiedGasUser) {
          const authUser: User = {
            ...verifiedGasUser,
            password: cleanPassword
          };

          // Synchronize back to server so subsequent logins are instant
          fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: authUser })
          }).catch(() => null);

          // Update local cache
          const localUsers = this.getStoredUsers();
          const idx = localUsers.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (idx !== -1) {
            localUsers[idx] = { ...localUsers[idx], ...authUser };
          } else {
            localUsers.push(authUser);
          }
          localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(localUsers));

          // Record audit log entry
          const now = new Date();
          const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
          auditLogs.unshift({
            id: String(Date.now()),
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0],
            user: authUser.name,
            userEmail: cleanEmail,
            action: 'LOGIN',
            description: `User authenticated via Google Sheets password (${authUser.role})`
          });
          localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

          return {
            authorized: true,
            user: authUser
          };
        }
      } catch {
        // Non-blocking, fallback to local storage
      }
    }

    // 3. Offline / Local Cache Fallback
    const users = this.getStoredUsers();
    let matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    if (!matched && cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      matched = SYSTEM_OWNER_USER;
    }

    if (!matched) {
      return {
        authorized: false,
        message: srvErrorMessage || 'No account registered with this email. Please contact the administrator.'
      };
    }

    if (matched.status !== 'ACTIVE') {
      return {
        authorized: false,
        message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
      };
    }

    // SECURITY: password is validated ONLY against the stored record
    // (synced from the Google Sheets Users sheet). No hardcoded master password.
    const expectedPassword = (matched.password || '').trim();
    const isMatched = Boolean(expectedPassword) && (
      cleanPassword === expectedPassword ||
      cleanPassword.toLowerCase() === expectedPassword.toLowerCase()
    );

    if (!isMatched) {
      return {
        authorized: false,
        message: 'Incorrect password. Please verify and try again.'
      };
    }

    // Audit log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: matched.name,
      userEmail: cleanEmail,
      action: 'LOGIN',
      description: `User authenticated via password (${matched.role})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    return {
      authorized: true,
      user: matched
    };
  }

  // --- Quick Auth Check (for existing session validation) ---

  public async checkAuth(email: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    
    // System owner is always authorized
    if (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      return {
        authorized: true,
        user: SYSTEM_OWNER_USER
      };
    }

    // 1. Check Authoritative Server Database
    try {
      const srvCheck = await safeFetchMutation('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });

      if (srvCheck && srvCheck.success && srvCheck.authorized && srvCheck.user) {
        return {
          authorized: true,
          user: srvCheck.user
        };
      } else if (srvCheck && srvCheck.message === 'Account is inactive') {
        return {
          authorized: false,
          message: 'Your account is currently INACTIVE. Please contact the system owner.'
        };
      }
    } catch {
      // Server unreachable, fall back to local/live backend
    }

    // 2. Check Local Stored Users
    const users = this.getStoredUsers();
    const matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    if (matched) {
      if (matched.status === 'ACTIVE') {
        return {
          authorized: true,
          user: matched
        };
      } else {
        return {
          authorized: false,
          message: 'Your account is currently INACTIVE. Please contact the system owner.'
        };
      }
    }

    // 3. Fallback: Check Google Apps Script (if user was registered in Google Sheets)
    if (this.isConnectedToLiveBackend()) {
      try {
        const url = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=checkAuth&email=${encodeURIComponent(cleanEmail)}&operatorEmail=${encodeURIComponent(cleanEmail)}`;
        const res = await this.fetchFromGas<any>(url);

        const authData = (res && typeof res === 'object') ? (res.data || res) : null;
        if (authData && (authData.authorized === true || (authData.user && authData.user.email))) {
          const foundUser = authData.user || authData;
          const role = (foundUser.role || 'ADMIN').toUpperCase();
          const formattedUser: User = {
            name: foundUser.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role,
            status: (foundUser.status || 'ACTIVE').toUpperCase(),
            permissions: getDefaultPermissions(role),
            createdAt: foundUser.createdAt || new Date().toISOString()
          };

          const curUsers = this.getStoredUsers();
          const existingIdx = curUsers.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (existingIdx === -1) {
            curUsers.push(formattedUser);
          } else {
            curUsers[existingIdx] = { ...curUsers[existingIdx], ...formattedUser };
          }
          localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(curUsers));

          return {
            authorized: true,
            user: formattedUser
          };
        }
      } catch {
        // Non-blocking
      }
    }

    return {
      authorized: false,
      message: 'ACCESS DENIED — You are not authorized to access the SC Basimbuzi Receipt Management System.'
    };
  }

  // --- Initial Data / Dashboard / Transactions ---

  private isSyntheticDemoTransaction(tx: Transaction): boolean {
    return (
      tx?.operatorEmail === 'ronald.b@scbasimbuzi.org' &&
      (tx.receiptNumber === 'SB-2026-00001' ||
        tx.receiptNumber === 'SB-2026-00002' ||
        tx.receiptNumber === 'SB-2026-00003')
    );
  }

  public async fetchHistoricalTransactions(operatorEmail: string, force: boolean = false): Promise<Transaction[]> {
    const cleanOp = operatorEmail.trim().toLowerCase();
    if (
      !force &&
      this.historicalCache &&
      this.historicalCache.email === cleanOp &&
      Date.now() - this.historicalCache.ts < 60_000
    ) {
      return this.historicalCache.data;
    }
    if (!force && this.historicalPromise) {
      return this.historicalPromise;
    }

    const runner = (async () => {
      try {
        const res = await safeFetchJson<any>('/api/historical-transactions', {
          headers: { 'X-Operator-Email': cleanOp }
        });
        if (res && res.success && Array.isArray(res.data)) {
          if (Array.isArray(res.coveredGasReceipts) && res.coveredGasReceipts.length > 0) {
            this.coveredGasReceipts = new Set(
              res.coveredGasReceipts.map((r: unknown) => String(r || '').trim().toUpperCase()).filter(Boolean)
            );
          }
          const sanitized = res.data.map((t: Transaction) => this.sanitizeTransaction(t));
          this.historicalCache = { email: cleanOp, ts: Date.now(), data: sanitized };
          return sanitized;
        }
      } catch {
        // Non-blocking fallback
      } finally {
        this.historicalPromise = null;
      }
      return this.historicalCache?.data || [];
    })();

    this.historicalPromise = runner;
    return runner;
  }

  private mergeWithHistoricalTransactions(primaryTxs: Transaction[], historicalTxs: Transaction[]): Transaction[] {
    if (!historicalTxs || historicalTxs.length === 0) {
      return primaryTxs
        .map(t => this.sanitizeTransaction(t))
        .sort((a, b) => compareTransactions(a, b, 'desc'));
    }

    const cleanedPrimary = primaryTxs.filter(t => {
      if (this.isSyntheticDemoTransaction(t)) return false;
      const rec = String(t?.receiptNumber || '').trim().toUpperCase();
      if (rec && this.coveredGasReceipts.has(rec)) return false;
      return true;
    });
    const map = new Map<string, Transaction>();

    for (const h of historicalTxs) {
      const key = String(h.receiptNumber || '').trim().toUpperCase();
      if (key) map.set(key, this.sanitizeTransaction(h));
    }

    for (const p of cleanedPrimary) {
      const key = String(p.receiptNumber || '').trim().toUpperCase();
      if (key) {
        map.set(key, this.sanitizeTransaction(p));
      }
    }

    return Array.from(map.values()).sort((a, b) => compareTransactions(a, b, 'desc'));
  }

  public async fetchMergedTransactions(
    operatorEmail: string,
    limit: number = 0,
    forceRefresh: boolean = false
  ): Promise<{
    transactions: Transaction[];
    isQuotaLimited: boolean;
    error: string | null;
  }> {
    if (
      !forceRefresh &&
      limit === 0 &&
      this.liveGasTxCache &&
      Date.now() - this.liveGasTxCache.ts < 20_000
    ) {
      const historicalTxs = await this.fetchHistoricalTransactions(operatorEmail);
      const merged = this.mergeWithHistoricalTransactions(this.liveGasTxCache.data, historicalTxs);
      return { transactions: merged, isQuotaLimited: false, error: null };
    }

    if (!forceRefresh && this.liveGasTxPromise) {
      return this.liveGasTxPromise;
    }

    const runner = (async () => {
      const historicalPromise = this.fetchHistoricalTransactions(operatorEmail, forceRefresh);

      if (this.isConnectedToLiveBackend()) {
        const url = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=getTransactions&operatorEmail=${encodeURIComponent(operatorEmail)}&limit=${limit}`;
        try {
          const [historicalTxs, res] = await Promise.all([
            historicalPromise,
            fetch(url, { redirect: 'follow' })
          ]);

          if (res.status === 429) {
            const fallbackTxs = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
            return {
              transactions: fallbackTxs,
              isQuotaLimited: true,
              error: 'Google Apps Script URL Fetch rate limit reached (HTTP 429). Serving reconciled cached transactions.'
            };
          }

          if (!res.ok) {
            const fallbackTxs = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
            return {
              transactions: fallbackTxs,
              isQuotaLimited: false,
              error: `Google Apps Script returned HTTP ${res.status}: ${res.statusText}`
            };
          }

          const rawText = await res.text();
          const trimmed = rawText.trim();

          if (trimmed.startsWith('<') || trimmed.includes('Service invoked too many times') || trimmed.includes('Quota exceeded')) {
            const fallbackTxs = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
            return {
              transactions: fallbackTxs,
              isQuotaLimited: true,
              error: 'Google Apps Script daily execution or URL fetch quota limit was reached. Using reconciled cached records.'
            };
          }

          const parsed = JSON.parse(trimmed);
          if (parsed.success && Array.isArray(parsed.data)) {
            if (limit === 0) {
              this.liveGasTxCache = { ts: Date.now(), data: parsed.data };
            }
            const mergedTxs = this.mergeWithHistoricalTransactions(parsed.data, historicalTxs);
            try {
              localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(mergedTxs));
            } catch {}
            return {
              transactions: mergedTxs,
              isQuotaLimited: false,
              error: null
            };
          }

          const fallbackTxs = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
          return {
            transactions: fallbackTxs,
            isQuotaLimited: false,
            error: parsed.error || 'Failed to retrieve transactions from Google Sheets.'
          };
        } catch (err: unknown) {
          const historicalTxs = await historicalPromise;
          const fallbackTxs = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
          return {
            transactions: fallbackTxs,
            isQuotaLimited: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      const historicalTxs = await historicalPromise;
      const mergedLocal = this.mergeWithHistoricalTransactions(this.getStoredTransactions(), historicalTxs);
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(mergedLocal));
      } catch {}

      return {
        transactions: mergedLocal,
        isQuotaLimited: false,
        error: null
      };
    })();

    this.liveGasTxPromise = runner;
    try {
      return await runner;
    } finally {
      this.liveGasTxPromise = null;
    }
  }

  public async getInitialData(operatorEmail: string, limit: number = 0): Promise<{
    settings: AppSettings;
    transactions: Transaction[];
    users: User[];
    auditLogs: AuditLogEntry[];
  }> {
    if (this.initialDataPromise) {
      return this.initialDataPromise;
    }

    const runner = (async () => {
      // Request full transaction history (limit=10000 when limit <= 0 so un-updated GAS deployments never slice bottom 200 rows and omit Manzi/recent receipts)
      const effectiveGasLimit = limit > 0 ? limit : 10000;
      const histPromise = this.fetchHistoricalTransactions(operatorEmail);

      if (this.isConnectedToLiveBackend()) {
        const url = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=getInitialData&operatorEmail=${encodeURIComponent(operatorEmail)}&limit=${effectiveGasLimit}`;
        const [historicalTxs, res, serverUsersRes] = await Promise.all([
          histPromise,
          this.fetchFromGas<{
            settings: AppSettings;
            transactions: Transaction[];
            users: User[];
            auditLogs: AuditLogEntry[];
          }>(url),
          safeFetchJson<any>('/api/users')
        ]);

        if (res.success && res.data) {
          if (res.data.settings) {
            const currentLocalSettings = this.getStoredSettings();
            const mergedSettings: AppSettings = {
              ...DEFAULT_SEED_SETTINGS,
              ...currentLocalSettings,
              ...res.data.settings,
              logoUrl: res.data.settings.logoUrl || currentLocalSettings.logoUrl || HARDCODED_LOGO_URL
            };
            localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(mergedSettings));
            fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ settings: mergedSettings })
            }).catch(() => null);
          }

          let finalUsers = this.getStoredUsers();
          if (res.data.users && res.data.users.length > 0) {
            const serverUsers: User[] =
              serverUsersRes && serverUsersRes.success && Array.isArray(serverUsersRes.data)
                ? serverUsersRes.data
                : [];

            const currentLocal = this.getStoredUsers();
            const mergedUsers: User[] = res.data.users.map(u => {
              const loc = currentLocal.find(cl => (cl.email || '').toLowerCase() === (u.email || '').toLowerCase());
              const srv = serverUsers.find(su => (su.email || '').toLowerCase() === (u.email || '').toLowerCase());
              return {
                ...u,
                password: srv?.password || loc?.password || u.password
              };
            });
            for (const loc of currentLocal) {
              if (!mergedUsers.some(mu => (mu.email || '').toLowerCase() === (loc.email || '').toLowerCase())) {
                mergedUsers.push(loc);
              }
            }
            for (const srv of serverUsers) {
              const idx = mergedUsers.findIndex(mu => (mu.email || '').toLowerCase() === (srv.email || '').toLowerCase());
              if (idx === -1) {
                mergedUsers.push(srv);
              } else if (!mergedUsers[idx].password && srv.password) {
                mergedUsers[idx].password = srv.password;
              }
            }
            localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(mergedUsers));
            finalUsers = mergedUsers;
          }

          const rawGasTxs = Array.isArray(res.data.transactions) ? res.data.transactions : [];
          if (effectiveGasLimit >= 10000) {
            this.liveGasTxCache = { ts: Date.now(), data: rawGasTxs };
          }
          const mergedTxs = this.mergeWithHistoricalTransactions(rawGasTxs, historicalTxs);
          localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(mergedTxs));
          res.data.transactions = mergedTxs;
          if (res.data.auditLogs) {
            localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(res.data.auditLogs));
          }
          return {
            ...res.data,
            users: finalUsers
          };
        }
      }

      const historicalTxs = await histPromise;
      const localTxs = this.getStoredTransactions();
      const mergedLocalTxs = this.mergeWithHistoricalTransactions(localTxs, historicalTxs);
      if (historicalTxs.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(mergedLocalTxs));
        } catch {}
      }

      return {
        settings: this.getStoredSettings(),
        transactions: mergedLocalTxs,
        users: this.getStoredUsers(),
        auditLogs: this.getStoredAuditLogs()
      };
    })();

    this.initialDataPromise = runner;
    try {
      return await runner;
    } finally {
      this.initialDataPromise = null;
    }
  }

  // --- Open-Closed Transaction Architecture (Inflow & Outflow) ---

  public async recordTransaction(
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
      operatorEmail: string;
      operatorName: string;
      paymentStatus?: Transaction['paymentStatus'];
    }
  ): Promise<BackendResponse<Transaction>> {
    const txType: TransactionType = (payload.type || (payload.payee ? 'OUTFLOW' : 'INFLOW')).toUpperCase() as TransactionType;
    const rawEmail = payload.email ? payload.email.trim().toLowerCase() : '';
    const subjectName = txType === 'OUTFLOW' ? (payload.payee || payload.payerName) : payload.payerName;
    const extraStaff = this.getStoredUsers().map(u => u.email);
    const cleanEmail = rawEmail && !isStaffOrPlaceholderEmail(rawEmail, subjectName, extraStaff) ? rawEmail : '';
    const cleanPhone = cleanPhoneNumber(payload.phone || '');
    const cleanNotes = payload.notes ? payload.notes.trim() : '';
    const cleanRef = payload.paymentReference ? payload.paymentReference.trim() : '';
    const numAmount = typeof payload.amount === 'string' ? parseFloat(payload.amount.replace(/[^0-9.-]+/g, '')) || 0 : payload.amount;

    if (this.isConnectedToLiveBackend()) {
      const requestData = {
        action: 'recordTransaction',
        ...payload,
        type: txType,
        amount: numAmount,
        email: cleanEmail,
        phone: cleanPhone,
        notes: cleanNotes,
        paymentReference: cleanRef,
        operatorEmail: payload.operatorEmail.trim().toLowerCase()
      };

      const res = await this.fetchFromGas<Transaction>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestData)
      });

      // Backwards-compatibility fallback if older GAS script only knows 'generateReceipt' for inflows
      if (!res.success && res.error && res.error.includes('Unknown') && txType === 'INFLOW') {
        return this.generateReceipt({
          payerName: payload.payerName || '',
          phone: cleanPhone,
          email: cleanEmail,
          amount: numAmount,
          paymentPurpose: payload.paymentPurpose || 'General Payment',
          paymentMethod: payload.paymentMethod || 'Cash',
          paymentReference: cleanRef,
          notes: cleanNotes,
          operatorEmail: payload.operatorEmail,
          operatorName: payload.operatorName
        });
      }

      if (res.success && res.data) {
        const sanitized = this.sanitizeTransaction(res.data);
        res.data = sanitized;

        // Persist immediately in local transaction ledger cache & live cache so navigation stays instant & complete
        try {
          const existingTxs = this.getStoredTransactions().filter(
            t => t.receiptNumber.trim().toUpperCase() !== sanitized.receiptNumber.trim().toUpperCase()
          );
          existingTxs.unshift(sanitized);
          localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(existingTxs));
        } catch {}

        if (this.liveGasTxCache) {
          this.liveGasTxCache = {
            ts: Date.now(),
            data: [
              sanitized,
              ...this.liveGasTxCache.data.filter(
                t => t.receiptNumber.trim().toUpperCase() !== sanitized.receiptNumber.trim().toUpperCase()
              )
            ]
          };
        }
        fetch('/api/gas/invalidate-cache', { method: 'POST' }).catch(() => null);

        if (txType === 'INFLOW' && sanitized.payerName) {
          this.updateLocalMemberCache(sanitized);
        }

        try {
          const now = new Date();
          const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
          auditLogs.unshift({
            id: String(Date.now()),
            date: sanitized.date || now.toISOString().split('T')[0],
            time: sanitized.time || now.toTimeString().split(' ')[0],
            user: payload.operatorName,
            userEmail: payload.operatorEmail,
            action: txType === 'OUTFLOW' ? 'RECORD_EXPENSE' : 'GENERATE_RECEIPT',
            receiptNumber: sanitized.receiptNumber,
            description: txType === 'OUTFLOW'
              ? `Recorded expense voucher ${sanitized.receiptNumber} of UGX ${sanitized.amount.toLocaleString()} to ${sanitized.payee || sanitized.payerName}`
              : `Generated receipt ${sanitized.receiptNumber} of UGX ${sanitized.amount.toLocaleString()} for ${sanitized.payerName}`
          });
          localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));
        } catch {}

        if (txType === 'INFLOW') {
          if (!cleanEmail) {
            res.data.email = '';
            res.data.emailStatus = 'NOT_PROVIDED';
            res.message = `Receipt ${res.data.receiptNumber} generated successfully! Ready for WhatsApp.`;
          } else {
            res.message = `Receipt ${res.data.receiptNumber} generated! Emailed to ${cleanEmail}.`;
          }
        } else {
          res.message = `Expense voucher ${res.data.receiptNumber} recorded in ledger. Dual-sync completed.`;
        }
      }

      return res;
    }

    // Local Mock / Offline Execution
    const settings: AppSettings = this.getStoredSettings();
    const now = new Date();
    const currentYear = now.getFullYear();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    let identifier = '';
    let newTx: Transaction;

    if (txType === 'OUTFLOW') {
      const voucherPrefix = 'EXP';
      const counters = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_COUNTER) || '{}');
      const counterKey = `OUTFLOW_${currentYear}`;
      const lastSeq = counters[counterKey] || 0;
      const nextSeq = lastSeq + 1;
      counters[counterKey] = nextSeq;
      localStorage.setItem(STORAGE_KEYS.LOCAL_COUNTER, JSON.stringify(counters));

      identifier = `${voucherPrefix}-${currentYear}-${String(nextSeq).padStart(5, '0')}`;
      const payeeName = (payload.payee || payload.payerName || 'General Payee').trim();
      const expenseCategory = (payload.category || payload.paymentPurpose || 'General Expense').trim();

      newTx = {
        receiptNumber: identifier,
        voucherNumber: identifier,
        type: 'OUTFLOW',
        date: dateStr,
        time: timeStr,
        payerName: payeeName,
        payee: payeeName,
        category: expenseCategory,
        phone: cleanPhone,
        email: cleanEmail,
        amount: numAmount,
        paymentPurpose: expenseCategory,
        paymentMethod: payload.paymentMethod || 'Cash',
        paymentReference: cleanRef,
        notes: cleanNotes,
        approvedBy: payload.approvedBy || payload.operatorName,
        generatedBy: payload.operatorName,
        operatorEmail: payload.operatorEmail,
        paymentStatus: 'COMPLETED',
        emailStatus: 'SKIPPED',
        createdAt: now.toISOString()
      };
    } else {
      // Inflow
      const prefix = settings.receiptPrefix || 'SB';
      const counters = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_COUNTER) || '{}');
      const lastSeq = counters[currentYear] || 0;
      const nextSeq = lastSeq + 1;
      counters[currentYear] = nextSeq;
      localStorage.setItem(STORAGE_KEYS.LOCAL_COUNTER, JSON.stringify(counters));

      identifier = `${prefix}-${currentYear}-${String(nextSeq).padStart(5, '0')}`;
      newTx = {
        receiptNumber: identifier,
        type: 'INFLOW',
        date: dateStr,
        time: timeStr,
        payerName: (payload.payerName || '').trim(),
        phone: cleanPhone,
        email: cleanEmail,
        amount: numAmount,
        paymentPurpose: payload.paymentPurpose || 'General Payment',
        paymentMethod: payload.paymentMethod || 'Cash',
        paymentReference: cleanRef,
        notes: cleanNotes,
        generatedBy: payload.operatorName,
        operatorEmail: payload.operatorEmail,
        paymentStatus: payload.paymentStatus || 'COMPLETED',
        emailStatus: cleanEmail ? 'SENT' : 'NOT_PROVIDED',
        createdAt: now.toISOString()
      };
    }

    // Append to transactions
    const txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    txs.unshift(newTx);
    localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

    // Audit Log
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: dateStr,
      time: timeStr,
      user: payload.operatorName,
      userEmail: payload.operatorEmail,
      action: txType === 'OUTFLOW' ? 'RECORD_EXPENSE' as any : 'GENERATE_RECEIPT',
      receiptNumber: identifier,
      description: txType === 'OUTFLOW'
        ? `Recorded expense voucher ${identifier} of UGX ${numAmount.toLocaleString()} to ${newTx.payee} (${newTx.category}). Dual-Writing simulated.`
        : `Generated receipt of UGX ${numAmount.toLocaleString()} for ${newTx.payerName} (${newTx.paymentPurpose}). Email: ${newTx.emailStatus}`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    // Update local member cache if inflow
    if (txType === 'INFLOW' && newTx.payerName) {
      this.updateLocalMemberCache(newTx);
    }

    const dualSyncNotice = settings.legacySpreadsheetId ? ' [Dual-sync to Legacy Master Sheet simulated]' : '';
    const successMsg = txType === 'OUTFLOW'
      ? `Expense voucher ${identifier} recorded into ledger successfully!${dualSyncNotice}`
      : `Receipt ${identifier} generated successfully!${dualSyncNotice}`;

    return {
      success: true,
      data: newTx,
      message: successMsg
    };
  }

  // --- Record Outflow (Expense Voucher) ---

  public async recordOutflow(
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
      operatorEmail: string;
      operatorName: string;
    }
  ): Promise<BackendResponse<Transaction>> {
    return this.recordTransaction({
      ...payload,
      type: 'OUTFLOW',
      payerName: payload.payee
    });
  }

  // --- Generate Receipt (Delegates to Open-Closed recordTransaction) ---

  public async generateReceipt(
    payload: GenerateReceiptPayload
  ): Promise<BackendResponse<Transaction>> {
    return this.recordTransaction({
      ...payload,
      type: 'INFLOW'
    });
  }

  // --- Member Directory for Smart Autofill ---

  // --- Payer Directory for Smart Autofill (Payer Search from Database) ---

  /**
   * Compiles unique payers who have paid before in the transactions database.
   * Extracts their full name, phone number, and email address.
   * Excludes operational outflows / expense vouchers and non-paying system administrators.
   */
  public getPayersFromTransactions(transactions?: Transaction[], extraMembers?: Member[]): Member[] {
    const txs = transactions || this.getStoredTransactions();
    const payerMap: Record<string, Member> = {};

    // Get system users to strictly prevent non-paying system admins from appearing as payers
    // and to block accidentally attached staff emails from polluting member autofill.
    const systemUsers = this.getStoredUsers();
    const staffEmailList = systemUsers.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean);
    const systemUserEmailSet = new Set(staffEmailList);
    const systemUserNameSet = new Set(
      systemUsers.map(u => resolveCanonicalMemberNameKey(u.name || '')).filter(Boolean)
    );

    // Build canonical name lookup from directory members when available so reversed names unify cleanly
    const canonicalDisplayByKey = new Map<string, string>();
    if (extraMembers && Array.isArray(extraMembers)) {
      for (const m of extraMembers) {
        const k = resolveCanonicalMemberNameKey(m.name || '');
        if (k && m.name && !canonicalDisplayByKey.has(k)) {
          canonicalDisplayByKey.set(k, m.name.trim());
        }
      }
    }

    // Sort transactions reverse-chronologically so latest phone/email are captured first
    const sorted = [...txs].sort((a, b) => {
      const dtA = `${a.date || ''} ${a.time || ''}`;
      const dtB = `${b.date || ''} ${b.time || ''}`;
      return dtB.localeCompare(dtA);
    });

    for (const tx of sorted) {
      const name = (tx.payerName || '').trim();
      const receiptNo = (tx.receiptNumber || '').trim().toUpperCase();
      // Skip empty names, cancelled transactions, expense vouchers (OUTFLOWs), and pre-CSV covered duplicates
      if (
        !name ||
        tx.type === 'OUTFLOW' ||
        receiptNo.startsWith('EXP-') ||
        tx.paymentStatus === 'CANCELLED' ||
        (receiptNo && this.coveredGasReceipts.has(receiptNo))
      ) {
        continue;
      }

      const key = resolveCanonicalMemberNameKey(name);
      if (!key) continue;
      const preferredName = canonicalDisplayByKey.get(key) || name;
      const amount = Number(tx.amount) || 0;
      const phone = cleanPhoneNumber(tx.phone || '');
      const rawEmail = (tx.email || '').trim().toLowerCase();
      const email = rawEmail && !isStaffOrPlaceholderEmail(rawEmail, preferredName, staffEmailList) ? rawEmail : '';

      if (!payerMap[key]) {
        payerMap[key] = {
          id: `PAYER-${String(Object.keys(payerMap).length + 1).padStart(4, '0')}`,
          name: preferredName,
          phone,
          email,
          lastPaymentDate: tx.date || '',
          totalContributed: amount,
          lastPurpose: tx.paymentPurpose || '',
          paymentCount: 1
        };
      } else {
        payerMap[key].totalContributed = (payerMap[key].totalContributed || 0) + amount;
        payerMap[key].paymentCount = (payerMap[key].paymentCount || 1) + 1;
        if (!payerMap[key].phone && phone) payerMap[key].phone = phone;
        if (!payerMap[key].email && email) payerMap[key].email = email;
      }
    }

    // Merge extra members from authoritative directory if they have recorded contributions
    if (extraMembers && Array.isArray(extraMembers)) {
      for (const m of extraMembers) {
        const k = resolveCanonicalMemberNameKey(m.name || '');
        if (!k) continue;
        const mRawEmail = (m.email || '').trim().toLowerCase();
        const mEmail = mRawEmail && !isStaffOrPlaceholderEmail(mRawEmail, m.name, staffEmailList) ? mRawEmail : '';
        const mPhone = cleanPhoneNumber(m.phone || '');

        if (systemUserNameSet.has(k) || (mEmail && systemUserEmailSet.has(mEmail))) {
          if (!payerMap[k] && (!m.totalContributed || m.totalContributed <= 0)) continue;
        }
        if (!m.lastPaymentDate && (!m.paymentCount || m.paymentCount <= 0) && (!m.totalContributed || m.totalContributed <= 0)) {
          continue;
        }
        if (!payerMap[k]) {
          payerMap[k] = {
            id: m.id || `PAYER-${String(Object.keys(payerMap).length + 1).padStart(4, '0')}`,
            name: m.name.trim(),
            phone: mPhone,
            email: mEmail,
            lastPaymentDate: m.lastPaymentDate || '',
            totalContributed: Number(m.totalContributed) || 0,
            lastPurpose: m.lastPurpose || '',
            paymentCount: Number(m.paymentCount) || 1
          };
        } else {
          if (m.name && m.source === 'CSV_IMPORT') payerMap[k].name = m.name.trim();
          if (!payerMap[k].phone && mPhone) payerMap[k].phone = mPhone;
          if (!payerMap[k].email && mEmail) payerMap[k].email = mEmail;
        }
      }
    }

    return Object.values(payerMap).sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getMembers(operatorEmail?: string): Promise<BackendResponse<Member[]>> {
    let txs = this.getStoredTransactions();
    let directoryMembers: Member[] = [];
    if (operatorEmail) {
      const dirRes = await this.getDirectoryMembers(operatorEmail);
      if (dirRes.success && dirRes.data?.members) {
        directoryMembers = dirRes.data.members;
      }
    }
    if (directoryMembers.length > 0) {
      txs = txs.filter(t => !this.isSyntheticDemoTransaction(t));
    }
    const list = this.getPayersFromTransactions(txs, directoryMembers);
    return { success: true, data: list };
  }

  // --- Member Directory & Self-Cleaning Administration APIs ---

  public async getDirectoryMembers(operatorEmail: string): Promise<BackendResponse<MembersDirectoryPayload>> {
    const json = await safeFetchJson<BackendResponse<MembersDirectoryPayload>>('/api/admin/members', {
      headers: { 'X-Operator-Email': operatorEmail.trim().toLowerCase() }
    });
    return json || {
      success: true,
      data: {
        members: [],
        submissions: [],
        summary: { totalMembers: 0, completeProfiles: 0, incompleteProfiles: 0, missingEmailCount: 0, missingPhoneCount: 0, preNllSum: 0, spotSum: 0, paidAfterSum: 0, historicalTotalSum: 0, combinedTotalSum: 0, pendingSubmissions: 0 }
      }
    };
  }

  public async saveDirectoryMember(
    member: Partial<Member> & { name: string },
    operatorEmail: string
  ): Promise<BackendResponse<Member> & { summary?: MembersDirectoryPayload['summary'] }> {
    const json = await safeFetchMutation('/api/admin/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail.trim().toLowerCase()
      },
      body: JSON.stringify({ member })
    });
    if (json?.success) {
      this.historicalCache = null;
    }
    return json || { success: true, message: 'Saved successfully' };
  }

  public async importMembersCsv(
    payload: { csvText?: string; useBundledTreasuryCsv?: boolean },
    operatorEmail: string
  ): Promise<BackendResponse<{ addedCount: number; updatedCount: number; summary: unknown }>> {
    const json = await safeFetchMutation('/api/admin/members/import-csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail.trim().toLowerCase()
      },
      body: JSON.stringify(payload)
    });
    return json || { success: true, message: 'Imported successfully' };
  }

  public async mergeDirectoryMembers(
    primaryMemberId: string,
    duplicateMemberIds: string[],
    operatorEmail: string
  ): Promise<BackendResponse<void>> {
    const json = await safeFetchMutation('/api/admin/members/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail.trim().toLowerCase()
      },
      body: JSON.stringify({ primaryMemberId, duplicateMemberIds })
    });
    return json || { success: true, message: 'Merged successfully' };
  }

  public async generateMemberClaimLink(
    memberId: string,
    operatorEmail: string
  ): Promise<BackendResponse<{ token: string; expiresAt: string; memberName: string }>> {
    const json = await safeFetchMutation(`/api/admin/members/${encodeURIComponent(memberId)}/claim-link`, {
      method: 'POST',
      headers: { 'X-Operator-Email': operatorEmail.trim().toLowerCase() }
    });
    return json || { success: true, data: { token: 'mock-token', expiresAt: new Date(Date.now() + 86400000).toISOString(), memberName: 'Member' } };
  }

  public async reviewMemberSubmission(
    submissionId: string,
    decision: 'APPROVE' | 'REJECT',
    reviewNotes: string,
    operatorEmail: string
  ): Promise<BackendResponse<MemberProfileSubmission>> {
    const json = await safeFetchMutation(`/api/admin/members/submissions/${encodeURIComponent(submissionId)}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operator-Email': operatorEmail.trim().toLowerCase()
      },
      body: JSON.stringify({ decision, reviewNotes })
    });
    return json || { success: true, message: 'Reviewed successfully' };
  }

  public async reconcileMembersLedger(operatorEmail: string): Promise<BackendResponse<ReconciliationSummary>> {
    const json = await safeFetchMutation('/api/admin/members/reconcile-ledger', {
      method: 'POST',
      headers: { 'X-Operator-Email': operatorEmail.trim().toLowerCase() }
    });
    return json || { success: true, message: 'Reconciled successfully' };
  }

  private updateLocalMemberCache(tx: Transaction): void {
    if (tx.type === 'OUTFLOW' || tx.receiptNumber?.startsWith('EXP-')) return;
    try {
      const cached: Member[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS_CACHE) || '[]');
      const key = resolveCanonicalMemberNameKey(tx.payerName || '');
      const existing = cached.find(m => resolveCanonicalMemberNameKey(m.name) === key);
      const amount = Number(tx.amount) || 0;
      const staffEmails = this.getStoredUsers().map(u => u.email);
      const cleanEmail = isStaffOrPlaceholderEmail(tx.email, tx.payerName, staffEmails)
        ? ''
        : String(tx.email || '').trim().toLowerCase();
      const cleanPhone = cleanPhoneNumber(tx.phone || '');

      if (existing) {
        if (cleanPhone) existing.phone = cleanPhone;
        if (cleanEmail) existing.email = cleanEmail;
        existing.totalContributed = (existing.totalContributed || 0) + amount;
        existing.paymentCount = (existing.paymentCount || 1) + 1;
        if (tx.date) existing.lastPaymentDate = tx.date;
        if (tx.paymentPurpose) existing.lastPurpose = tx.paymentPurpose;
      } else {
        cached.push({
          id: tx.memberId || `PAYER-${String(cached.length + 1).padStart(4, '0')}`,
          memberId: tx.memberId || `PAYER-${String(cached.length + 1).padStart(4, '0')}`,
          name: tx.payerName,
          phone: cleanPhone,
          email: cleanEmail,
          lastPaymentDate: tx.date,
          totalContributed: amount,
          lastPurpose: tx.paymentPurpose || '',
          paymentCount: 1
        });
      }
      localStorage.setItem(STORAGE_KEYS.MEMBERS_CACHE, JSON.stringify(cached));
    } catch {}
  }

  // --- Ledger Financial Metrics Calculation (Open-Closed Engine) ---

  public calculateLedgerMetrics(transactions?: Transaction[], settings?: AppSettings): LedgerMetrics {
    const list = transactions || this.getStoredTransactions();
    const currentSettings = settings || this.getStoredSettings();
    const openingBalance = Number(currentSettings.openingBalance) || 0;
    let totalInflow = 0;
    let totalOutflow = 0;
    let inflowCount = 0;
    let outflowCount = 0;
    let syncedCount = 0;
    let pendingSyncCount = 0;
    let failedSyncCount = 0;

    for (const tx of list) {
      if (tx.paymentStatus === 'CANCELLED') continue;
      const isOutflow = tx.type === 'OUTFLOW';
      const amount = Number(tx.amount) || 0;
      if (isOutflow) {
        totalOutflow += amount;
        outflowCount++;
      } else {
        totalInflow += amount;
        inflowCount++;
      }
      if (tx.syncStatus === 'SYNCED') syncedCount++;
      else if (tx.syncStatus === 'FAILED') failedSyncCount++;
      else if (tx.syncStatus === 'PENDING') pendingSyncCount++;
    }

    return {
      openingBalance,
      totalInflow,
      totalOutflow,
      netBalance: openingBalance + totalInflow - totalOutflow,
      inflowCount,
      outflowCount,
      syncedCount,
      pendingSyncCount,
      failedSyncCount
    };
  }

  // --- Delete Transaction (Owner or Users with canDeleteTransactions) ---

  public async deleteTransaction(
    receiptNumber: string,
    operatorEmail: string
  ): Promise<BackendResponse<void>> {
    const cleanNum = receiptNumber.trim().toUpperCase();
    const cleanEmail = operatorEmail.trim().toLowerCase();

    // 1. Verify operator permission
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || JSON.stringify(DEFAULT_SEED_USERS));
    const operator = users.find(u => u.email.toLowerCase() === cleanEmail);

    const perms = resolveUserPermissions(operator);
    if (!perms.canDeleteTransactions && operator?.role !== 'OWNER') {
      return {
        success: false,
        error: 'Permission denied. You do not have permission to delete transactions from the ledger.'
      };
    }

    const isHistorical = cleanNum.startsWith('HIST-');

    // 2. Persist deletion to authoritative backend BEFORE deleting local cache
    if (isHistorical) {
      try {
        const srvRes = await fetch(`/api/historical-transactions/${encodeURIComponent(cleanNum)}`, {
          method: 'DELETE',
          headers: { 'X-Operator-Email': cleanEmail }
        }).then(r => r.json());
        if (!srvRes?.success) {
          return {
            success: false,
            error: srvRes?.error || `Failed to delete historical transaction ${cleanNum} from server database.`
          };
        }
      } catch (err: unknown) {
        return {
          success: false,
          error: `Unable to delete historical transaction from server: ${err instanceof Error ? err.message : String(err)}`
        };
      }

      if (this.isConnectedToLiveBackend()) {
        try {
          await this.fetchFromGas<void>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'deleteTransaction',
              operatorEmail: cleanEmail,
              receiptNumber: cleanNum
            })
          });
        } catch {}
      }
    } else if (this.isConnectedToLiveBackend()) {
      const gasRes = await this.fetchFromGas<void>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteTransaction',
          operatorEmail: cleanEmail,
          receiptNumber: cleanNum
        })
      });
      if (!gasRes.success && !(gasRes.error || '').toLowerCase().includes('not found')) {
        return {
          success: false,
          error: gasRes.error || `Failed to delete transaction ${cleanNum} from Google Sheets.`
        };
      }
    }

    // 3. Remove from local transaction cache & record audit entry
    this.invalidateTransactionCaches(true);
    let txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    const target = txs.find(t => t.receiptNumber.trim().toUpperCase() === cleanNum);

    if (target) {
      txs = txs.filter(t => t.receiptNumber.trim().toUpperCase() !== cleanNum);
      localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

      const now = new Date();
      const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
      auditLogs.unshift({
        id: String(Date.now()),
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        user: operator?.name || 'Operator',
        userEmail: operatorEmail,
        action: 'DELETE_TRANSACTION',
        receiptNumber: cleanNum,
        description: `Deleted receipt ${cleanNum} (UGX ${Number(target.amount).toLocaleString()}, Payer: ${target.payerName})`
      });
      localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));
    }

    return {
      success: true,
      message: `Receipt ${cleanNum} was permanently removed.`
    };
  }

  // --- Resend Receipt ---

  public async resendReceipt(
    receiptNumber: string,
    operatorEmail: string
  ): Promise<BackendResponse<Transaction>> {
    if (this.isConnectedToLiveBackend()) {
      const requestData = {
        action: 'resendReceipt',
        receiptNumber,
        operatorEmail
      };

      const res = await this.fetchFromGas<Transaction>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestData)
      });
      if (res.success && res.data) {
        const raw = res.data as Transaction & { payerEmail?: string; payerPhone?: string };
        const sanitized = this.sanitizeTransaction({
          ...raw,
          email: raw.email || raw.payerEmail || '',
          phone: raw.phone || raw.payerPhone || ''
        });
        res.data = sanitized;
        try {
          const cached = this.getStoredTransactions();
          const idx = cached.findIndex(
            t => t.receiptNumber.trim().toUpperCase() === sanitized.receiptNumber.trim().toUpperCase()
          );
          if (idx !== -1) {
            cached[idx] = { ...cached[idx], ...sanitized };
            localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(cached));
          }
        } catch {}
      }
      return res;
    }

    // Local Mock Resend
    const txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    const txIndex = txs.findIndex(t => t.receiptNumber.toUpperCase() === receiptNumber.toUpperCase());

    if (txIndex === -1) {
      return { success: false, error: `Receipt not found: ${receiptNumber}` };
    }

    txs[txIndex].emailStatus = 'SENT';
    localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Current Operator',
      userEmail: operatorEmail,
      action: 'RESEND_RECEIPT',
      receiptNumber: receiptNumber,
      description: `Resent receipt email to ${txs[txIndex].email}`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    return {
      success: true,
      data: txs[txIndex],
      message: `Receipt successfully resent to ${txs[txIndex].email}`
    };
  }

  // --- User Management ---

  public async addUser(user: Omit<User, 'createdAt'>, operatorEmail: string): Promise<BackendResponse<User>> {
    const cleanEmail = user.email.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    // Local Storage Add/Upsert
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || JSON.stringify(DEFAULT_SEED_USERS));
    const existingIndex = users.findIndex(u => (u.email || '').toLowerCase() === cleanEmail);

    const defaultPerms = getDefaultPermissions(user.role);
    const resolvedPerms = user.permissions ? { ...defaultPerms, ...user.permissions } : defaultPerms;

    let targetUser: User;

    if (existingIndex !== -1) {
      // User already exists locally, update their profile
      targetUser = {
        ...users[existingIndex],
        name: user.name.trim(),
        role: user.role,
        status: user.status,
        password: user.password && user.password.trim() ? user.password.trim() : users[existingIndex].password,
        permissions: resolvedPerms
      };
      users[existingIndex] = targetUser;
    } else {
      targetUser = {
        ...user,
        name: user.name.trim(),
        email: cleanEmail,
        password: user.password && user.password.trim() ? user.password.trim() : 'Staff@2026',
        permissions: resolvedPerms,
        createdAt: new Date().toISOString()
      };
      users.push(targetUser);
    }

    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'ADD_ADMIN',
      description: `Registered/updated staff member: ${targetUser.name} (${cleanEmail}) as ${targetUser.role}`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    // Broadcast to server shared users
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: targetUser })
      });
      if (targetUser.password) {
        await fetch('/api/users/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: targetUser.email, password: targetUser.password })
        });
      }
    } catch {
      // Non-blocking
    }

    // Live Google Apps Script Sync via POST
    if (this.isConnectedToLiveBackend()) {
      let syncSuccess = false;
      let syncError: string | undefined;

      try {
        const postRes = await this.fetchFromGas<{ success: boolean; error?: string; message?: string }>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'addUser',
            operatorEmail: opEmail,
            user: targetUser,
            password: targetUser.password
          })
        });
        if (postRes.success) {
          syncSuccess = true;
        } else {
          syncError = postRes.error;
        }
      } catch (err: unknown) {
        syncError = err instanceof Error ? err.message : String(err);
      }

      if (!syncSuccess && syncError) {
        return {
          success: true,
          data: targetUser,
          sheetsSynced: false,
          sheetsError: syncError,
          message: `Staff member "${targetUser.name}" saved locally, but Google Sheets sync reported: ${syncError}.`
        };
      }
    }

    return { 
      success: true, 
      data: targetUser, 
      message: `Staff member "${targetUser.name}" successfully registered and synced with Google Sheets.` 
    };
  }

  public async editUser(
    targetEmail: string, 
    updates: Partial<User>, 
    operatorEmail: string
  ): Promise<BackendResponse<User>> {
    const cleanTarget = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    let users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || JSON.stringify(DEFAULT_SEED_USERS));
    let userIndex = users.findIndex(u => (u.email || '').trim().toLowerCase() === cleanTarget);

    let updatedUser: User;

    if (userIndex === -1) {
      const defaultPerms = getDefaultPermissions(updates.role || 'ADMIN');
      updatedUser = {
        name: updates.name || cleanTarget.split('@')[0],
        email: (updates.email || cleanTarget).trim().toLowerCase(),
        role: updates.role || 'ADMIN',
        status: updates.status || 'ACTIVE',
        permissions: updates.permissions || defaultPerms,
        createdAt: new Date().toISOString()
      };
      users.push(updatedUser);
    } else {
      const existingUser = users[userIndex];

      if (existingUser.role === 'OWNER' && updates.role && updates.role !== 'OWNER') {
        return { success: false, error: 'Cannot demote the System Owner account.' };
      }

      if (updates.email && updates.email.trim().toLowerCase() !== cleanTarget) {
        const newEmail = updates.email.trim().toLowerCase();
        if (users.some((u, idx) => idx !== userIndex && (u.email || '').trim().toLowerCase() === newEmail)) {
          return { success: false, error: 'Another user is already registered with this new email.' };
        }
        updates.email = newEmail;
      }

      updatedUser = {
        ...existingUser,
        ...updates,
        email: updates.email ? updates.email.trim().toLowerCase() : existingUser.email.trim().toLowerCase(),
        password: updates.password !== undefined && updates.password.trim() !== '' ? updates.password.trim() : existingUser.password,
        permissions: updates.permissions || existingUser.permissions || getDefaultPermissions(updates.role || existingUser.role)
      };

      users[userIndex] = updatedUser;
    }

    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));

    // Broadcast updated users to server
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users })
      });
      if (updates.password && updates.password.trim() !== '') {
        await fetch('/api/users/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: updatedUser.email, password: updates.password.trim() })
        });
      }
    } catch {
      // Non-blocking
    }

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    const isPasswordChanged = Boolean(updates.password && updates.password.trim() !== '');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'EDIT_USER',
      description: isPasswordChanged 
        ? `Updated credentials & permissions for ${updatedUser.name} (${updatedUser.email})`
        : `Updated account details/permissions for ${updatedUser.name} (${updatedUser.email})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    let sheetsError: string | undefined;
    if (this.isConnectedToLiveBackend()) {
      try {
        const postRes = await this.fetchFromGas<User>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'editUser',
            operatorEmail: opEmail,
            targetEmail: cleanTarget,
            email: updatedUser.email,
            updates: updatedUser,
            user: updatedUser,
            password: updatedUser.password
          })
        });
        if (!postRes.success) {
          sheetsError = postRes.error || 'Google Sheets sync failed.';
        }
      } catch (err) {
        sheetsError = err instanceof Error ? err.message : String(err);
      }
    }

    return { 
      success: true, 
      data: updatedUser, 
      sheetsSynced: !sheetsError,
      sheetsError,
      message: sheetsError
        ? `User "${updatedUser.name}" updated locally, but Google Sheets sync reported: ${sheetsError}`
        : `User details and permissions for "${updatedUser.name}" updated successfully.` 
    };
  }

  public async updateUserStatus(
    targetEmail: string, 
    status: 'ACTIVE' | 'INACTIVE', 
    operatorEmail: string
  ): Promise<BackendResponse<void>> {
    const cleanTargetEmail = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || JSON.stringify(DEFAULT_SEED_USERS));
    const userIndex = users.findIndex(u => (u.email || '').trim().toLowerCase() === cleanTargetEmail);

    if (userIndex !== -1) {
      if (users[userIndex].role === 'OWNER' && status === 'INACTIVE') {
        return { success: false, error: 'Cannot deactivate the Owner account.' };
      }
      users[userIndex].status = status;
    } else {
      users.push({
        name: cleanTargetEmail.split('@')[0],
        email: cleanTargetEmail,
        role: 'ADMIN',
        status,
        permissions: getDefaultPermissions('ADMIN'),
        createdAt: new Date().toISOString()
      });
    }

    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));

    // Broadcast updated users to server
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    }).catch(() => null);

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: status === 'ACTIVE' ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN',
      description: `${status === 'ACTIVE' ? 'Activated' : 'Deactivated'} user account: ${cleanTargetEmail}`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    let sheetsError: string | undefined;
    if (this.isConnectedToLiveBackend()) {
      try {
        const postRes = await this.fetchFromGas<void>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'updateUserStatus',
            operatorEmail: opEmail,
            targetEmail: cleanTargetEmail,
            status
          })
        });
        if (!postRes.success) {
          sheetsError = postRes.error || 'Google Sheets sync failed.';
        }
      } catch (err) {
        sheetsError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: true,
      sheetsSynced: !sheetsError,
      sheetsError,
      message: sheetsError
        ? `Status updated to ${status} locally, but Google Sheets sync reported: ${sheetsError}`
        : `Status updated to ${status}`
    };
  }

  public async removeUser(targetEmail: string, operatorEmail: string): Promise<BackendResponse<void>> {
    const cleanTargetEmail = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    let users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_USERS) || JSON.stringify(DEFAULT_SEED_USERS));
    const target = users.find(u => (u.email || '').trim().toLowerCase() === cleanTargetEmail);

    if (target && target.role === 'OWNER') {
      return { success: false, error: 'Cannot delete the System Owner account.' };
    }

    const userName = target ? target.name : cleanTargetEmail;
    users = users.filter(u => (u.email || '').trim().toLowerCase() !== cleanTargetEmail);
    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));

    // Broadcast updated users to server
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    }).catch(() => null);

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'REMOVE_ADMIN',
      description: `Owner removed user account: ${userName} (${cleanTargetEmail})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    let sheetsError: string | undefined;
    if (this.isConnectedToLiveBackend()) {
      try {
        const postRes = await this.fetchFromGas<void>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'removeUser',
            operatorEmail: opEmail,
            targetEmail: cleanTargetEmail
          })
        });
        if (!postRes.success) {
          sheetsError = postRes.error || 'Google Sheets sync failed.';
        }
      } catch (err) {
        sheetsError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: true,
      sheetsSynced: !sheetsError,
      sheetsError,
      message: sheetsError
        ? `User "${userName}" removed locally, but Google Sheets sync reported: ${sheetsError}`
        : `User "${userName}" was successfully deleted.`
    };
  }

  /**
   * Sync all local users to Google Sheets
   */
  public async syncAllUsersToGas(operatorEmail: string): Promise<BackendResponse<{ count: number }>> {
    const users = this.getStoredUsers();
    if (!this.isConnectedToLiveBackend()) {
      return { success: false, error: 'Google Apps Script backend URL is not configured.' };
    }

    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    try {
      // 1. Attempt batch sync via POST
      const postRes = await this.fetchFromGas<{ success: boolean; message?: string; error?: string }>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'syncUsers',
          operatorEmail: opEmail,
          users: users
        })
      });

      if (postRes.success) {
        return { 
          success: true, 
          message: postRes.message || `Successfully synchronized ${users.length} staff members to Google Sheets.`,
          data: { count: users.length }
        };
      }

      // 2. Fallback: Sync each user individually via POST
      let successCount = 0;
      for (const u of users) {
        const res = await this.fetchFromGas<{ success: boolean }>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'addUser',
            operatorEmail: opEmail,
            user: u,
            password: u.password || ''
          })
        });
        if (res.success) {
          successCount++;
        }
      }

      return {
        success: true,
        message: `Successfully synchronized ${successCount} of ${users.length} staff members to Google Sheets.`,
        data: { count: successCount }
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Diagnostic method to test user authentication and live backend connectivity
   */
  public async testUserAccess(email: string): Promise<{ authorized: boolean; message: string; details?: any }> {
    const cleanEmail = email.trim().toLowerCase();
    const users = this.getStoredUsers();
    let matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    if (!matched) {
      try {
        const res = await fetch('/api/users').then(r => r.json()).catch(() => null);
        if (res?.success && Array.isArray(res.data)) {
          const found = res.data.find((u: any) => (u.email || '').trim().toLowerCase() === cleanEmail);
          if (found) {
            matched = found;
            const curUsers = this.getStoredUsers();
            curUsers.push(found);
            localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(curUsers));
          }
        }
      } catch {
        // Ignore
      }
    }

    if (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) matched = SYSTEM_OWNER_USER;

    if (!matched) {
      if (!this.isConnectedToLiveBackend()) {
        await this.syncSharedConfigAndUsers();
      }
      if (this.isConnectedToLiveBackend()) {
        try {
          const authRes = await this.checkAuth(cleanEmail);
          if (authRes.authorized && authRes.user) {
            return {
              authorized: true,
              message: `Verified via Google Sheets: "${authRes.user.name}" is ACTIVE with role ${authRes.user.role}.`,
              details: authRes.user
            };
          }
        } catch (e: any) {
          return { authorized: false, message: `Google Sheets check error: ${e.message}` };
        }
      }
      return {
        authorized: false,
        message: `Staff member "${cleanEmail}" is NOT registered in the database or Google Sheets.`
      };
    }

    if (matched.status !== 'ACTIVE') {
      return {
        authorized: false,
        message: `Staff member "${matched.name}" is registered but set to INACTIVE. Click "Activate" to allow login.`
      };
    }

    const liveStr = this.isConnectedToLiveBackend() ? 'Google Sheets & Email OTP Live' : 'Local Shared Database (Backend URL not linked)';
    return {
      authorized: true,
      message: `Staff member "${matched.name}" is ACTIVE as ${matched.role}. Backend: ${liveStr}.`,
      details: matched
    };
  }

  // --- Settings ---

  public async saveSettings(settings: AppSettings, operatorEmail: string): Promise<BackendResponse<AppSettings>> {
    // 1. Always save to LocalStorage first to guarantee immediate persistence
    localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(settings));

    // Broadcast to server shared settings so all devices/users get updated logoUrl and branding immediately
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
    } catch {
      // Continue cleanly to GAS sync
    }

    // Audit Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: 'Operator',
      userEmail: operatorEmail,
      action: 'CHANGE_SETTINGS',
      description: `Updated organization settings and configuration (${settings.organizationName})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    // 2. If connected to live GAS backend, sync directly to Sheets
    if (this.isConnectedToLiveBackend()) {
      try {
        const res = await this.fetchFromGas<AppSettings>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'saveSettings',
            operatorEmail,
            settings
          })
        });
        if (res.success) {
          return {
            ...res,
            data: { ...settings, ...(res.data || {}) },
            sheetsSynced: true
          };
        }
        return {
          success: true,
          data: settings,
          sheetsSynced: false,
          sheetsError: res.error || 'Unknown Google Sheets error',
          message: `Settings saved locally & on server, but Google Sheets sync reported: ${res.error || 'Unknown error'}`
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          success: true,
          data: settings,
          sheetsSynced: false,
          sheetsError: errMsg,
          message: `Settings saved locally & on server, but Google Sheets sync failed: ${errMsg}`
        };
      }
    }

    return { success: true, data: settings, message: 'Settings saved successfully.' };
  }

  // --- Audit Log Action ---

  public async logAction(
    action: AuditLogEntry['action'],
    description: string,
    receiptNumber: string | undefined,
    user: User
  ): Promise<void> {
    if (this.isConnectedToLiveBackend()) {
      try {
        await this.fetchFromGas(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'logAction',
            operatorEmail: user.email,
            auditAction: action,
            description,
            receiptNumber
          })
        });
      } catch {
        // Silent catch for audit logger
      }
      return;
    }

    // Local Mock Log
    const now = new Date();
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      user: user.name,
      userEmail: user.email,
      action,
      receiptNumber,
      description
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));
  }

  // --- Health Check / Diagnostic ---

  public async testConnection(urlToTest?: string): Promise<{ success: boolean; message: string; timestamp?: string }> {
    const targetUrl = (urlToTest || this.gasUrl).trim();
    if (!targetUrl) {
      return { success: false, message: 'No Google Apps Script URL provided.' };
    }

    try {
      const pingUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=ping`;
      const res = await fetch(pingUrl, { mode: 'cors' });
      if (!res.ok) {
        return { success: false, message: `Server responded with HTTP ${res.status}: ${res.statusText}` };
      }
      const data = await res.json();
      if (data && data.success) {
        return { success: true, message: data.message || 'Connected successfully to Google Apps Script!', timestamp: data.timestamp };
      }
      return { success: false, message: data.error || 'Server responded with error' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { 
        success: false, 
        message: `Connection failed: ${msg}. Make sure you deployed your Web App with "Execute as: Me" and "Who has access: Anyone".` 
      };
    }
  }
}

export const api = new ApiClient();

