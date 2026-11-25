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
  AUTH_TOKEN: 'sc_basimbuzi_auth_token_v2',
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

  // --- Central session token (Supabase-backed API) ---

  public getStoredAuthToken(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    } catch {
      return '';
    }
  }

  public setStoredAuthToken(token: string): void {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      }
    } catch {}
  }

  public clearStoredAuthToken(): void {
    this.setStoredAuthToken('');
  }

  /** Cache a staff profile locally WITHOUT any password material. */
  private cacheUserProfile(user: User): void {
    try {
      const users = this.getStoredUsers();
      const idx = users.findIndex(u => (u.email || '').trim().toLowerCase() === (user.email || '').trim().toLowerCase());
      const safeUser = { ...user, password: '' };
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...safeUser };
      } else {
        users.push(safeUser);
      }
      this.persistUsersWithoutPasswords(users);
    } catch {}
  }

  /** SECURITY: plaintext staff passwords must never persist in the browser. */
  private persistUsersWithoutPasswords(users: User[]): void {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_USERS,
      JSON.stringify(users.map(u => ({ ...u, password: '' })))
    );
  }

  private appendLocalAudit(entry: AuditLogEntry): void {
    try {
      const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
      auditLogs.unshift(entry);
      localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));
    } catch {}
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
    const health = await safeFetchJson<any>('/api/health');
    return Boolean(health && health.success);
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
        // CENTRAL DATABASE MODE: the Supabase-backed /api functions are the
        // single source of truth. Staff accounts arrive via /api/bootstrap after
        // login, so here we only refresh shared organization settings (read-only).
        const settingsRes = await safeFetchJson<any>('/api/settings');
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
    // CENTRAL DATABASE MODE: the Supabase-backed /api functions ship with the
    // app on every host (Vercel, AI Studio preview, local dev), so the central
    // backend is always available. `gasUrl` is legacy display-only state now.
    return true;
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
        permissions: getDefaultPermissions('OWNER')
      };
    }

    this.persistUsersWithoutPasswords(users);
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

  // --- OTP Authentication Methods ---

  /**
   * Request an OTP login code. The central database owns OTP issuance and
   * validation. While no email provider is connected (Brevo integration
   * pending), the API returns the code so the UI can display it on screen —
   * the same UX as the previous local sandbox mode.
   */
  public async sendLoginOtp(email: string): Promise<BackendResponse<{ email: string; code?: string; isLiveBackend?: boolean }>> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Please enter your registered email address.' };
    }

    const res = await safeFetchMutation('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail })
    });

    if (res && res.success) {
      const matched = this.getStoredUsers().find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      this.appendLocalAudit({
        id: String(Date.now()),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: matched?.name || cleanEmail,
        userEmail: cleanEmail,
        action: 'LOGIN_OTP_SENT',
        description: 'Requested a 6-digit staff sign-in code (central database)'
      });
      return res;
    }

    return {
      success: false,
      error: (res && (res.error || res.message)) || 'Unable to request a sign-in code right now. Please try again.'
    };
  }

  /**
   * Verify the 6-digit OTP code entered by the user (validated centrally).
   */
  public async verifyLoginOtp(email: string, enteredCode: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = enteredCode.trim().replace(/\D/g, '');

    const res = await safeFetchMutation('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, code: cleanCode })
    });

    if (res && res.success && res.authorized && res.user) {
      if (res.token) {
        this.setStoredAuthToken(res.token);
      }
      this.cacheUserProfile(res.user);
      this.appendLocalAudit({
        id: String(Date.now()),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: res.user.name,
        userEmail: cleanEmail,
        action: 'LOGIN',
        description: `User authenticated via email OTP (${res.user.role})`
      });
      return { authorized: true, user: res.user };
    }

    return {
      authorized: false,
      message: (res && (res.message || res.error)) || 'Invalid verification code. Please check your email and try again.'
    };
  }

  /**
   * Authenticate a user directly using their registered email and password.
   * Passwords are verified ONLY by the central Supabase Auth backend, so ANY
   * staff member added by the administrator can log in immediately from ANY
   * device. No password material is ever stored or checked in the browser.
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

    const res = await safeFetchMutation('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
    });

    if (res && res.success && res.authorized && res.user) {
      if (res.token) {
        this.setStoredAuthToken(res.token);
      }
      this.cacheUserProfile(res.user);

      // Record audit log entry
      this.appendLocalAudit({
        id: String(Date.now()),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: res.user.name,
        userEmail: cleanEmail,
        action: 'LOGIN',
        description: `User authenticated via password (${res.user.role})`
      });

      return {
        authorized: true,
        user: res.user
      };
    }

    return {
      authorized: false,
      message: (res && (res.message || res.error)) || 'Login failed. Please check your connection and try again.'
    };
  }

  // --- Quick Auth Check (for existing session validation) ---

  public async checkAuth(email: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Authoritative Central Database check (verifies the session token)
    try {
      const srvCheck = await safeFetchJson<any>('/api/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });

      if (srvCheck && srvCheck.success) {
        if (srvCheck.authorized && srvCheck.user) {
          this.cacheUserProfile(srvCheck.user);
          return {
            authorized: true,
            user: srvCheck.user
          };
        }
        return {
          authorized: false,
          message: srvCheck.message || 'Your session has expired. Please sign in again.'
        };
      }
    } catch {
      // Server unreachable — fall back to local cached profile below
    }

    // 2. Offline fallback: keep the existing session usable from the cache
    const users = this.getStoredUsers();
    const matched = users.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);

    if (matched && matched.status === 'ACTIVE') {
      return {
        authorized: true,
        user: matched
      };
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
    if (!forceRefresh && this.liveGasTxPromise) {
      return this.liveGasTxPromise;
    }

    const runner = (async () => {
      // CENTRAL DATABASE MODE: /api/historical-transactions now returns the
      // FULL authoritative ledger from Supabase — no client-side merging of
      // divergent snapshot files anymore.
      const transactions = await this.fetchHistoricalTransactions(operatorEmail, forceRefresh);
      try {
        if (transactions.length > 0) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(transactions));
        }
      } catch {}
      return {
        transactions,
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
      // CENTRAL DATABASE MODE: one bootstrap call returns everything the
      // dashboard needs from Supabase (settings + full ledger + staff + audit).
      try {
        const res = await safeFetchJson<any>('/api/bootstrap');
        if (res && res.success && res.data) {
          const settings: AppSettings = {
            ...DEFAULT_SEED_SETTINGS,
            ...(res.data.settings || {}),
            logoUrl: (res.data.settings?.logoUrl || this.getStoredSettings().logoUrl || HARDCODED_LOGO_URL)
          };
          const transactions: Transaction[] = Array.isArray(res.data.transactions)
            ? res.data.transactions.map((t: Transaction) => this.sanitizeTransaction(t))
            : [];
          const users: User[] = Array.isArray(res.data.users) ? res.data.users : this.getStoredUsers();
          const auditLogs: AuditLogEntry[] = Array.isArray(res.data.auditLogs) ? res.data.auditLogs : this.getStoredAuditLogs();

          // Refresh paint caches (remote is authoritative)
          try {
            localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(settings));
            localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(transactions));
            localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));
            this.persistUsersWithoutPasswords(users);
          } catch {}

          if (limit > 0 && transactions.length > limit) {
            return { settings, transactions: transactions.slice(0, limit), users, auditLogs };
          }
          return { settings, transactions, users, auditLogs };
        }
      } catch {
        // Fall through to cached data below (offline tolerance)
      }

      return {
        settings: this.getStoredSettings(),
        transactions: this.getStoredTransactions(),
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

    // CENTRAL DATABASE MODE: the server sanitizes, assigns the receipt number
    // atomically (no duplicate numbers across devices) and stores in Supabase.
    const requestData = {
      ...payload,
      type: txType,
      amount: numAmount,
      email: cleanEmail,
      phone: cleanPhone,
      notes: cleanNotes,
      paymentReference: cleanRef,
      operatorEmail: payload.operatorEmail.trim().toLowerCase()
    };

    const res = await safeFetchMutation('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    if (res && res.success && res.data) {
      const sanitized = this.sanitizeTransaction(res.data);
      res.data = sanitized;

      // Persist immediately in local ledger cache so navigation stays instant
      try {
        const existingTxs = this.getStoredTransactions().filter(
          t => t.receiptNumber.trim().toUpperCase() !== sanitized.receiptNumber.trim().toUpperCase()
        );
        existingTxs.unshift(sanitized);
        localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(existingTxs));
      } catch {}

      if (txType === 'INFLOW' && sanitized.payerName) {
        this.updateLocalMemberCache(sanitized);
      }

      try {
        this.appendLocalAudit({
          id: String(Date.now()),
          date: sanitized.date || new Date().toISOString().split('T')[0],
          time: sanitized.time || new Date().toTimeString().split(' ')[0],
          user: payload.operatorName,
          userEmail: payload.operatorEmail,
          action: txType === 'OUTFLOW' ? 'RECORD_EXPENSE' : 'GENERATE_RECEIPT',
          receiptNumber: sanitized.receiptNumber,
          description: txType === 'OUTFLOW'
            ? `Recorded expense voucher ${sanitized.receiptNumber} of UGX ${sanitized.amount.toLocaleString()} to ${sanitized.payee || sanitized.payerName}`
            : `Generated receipt ${sanitized.receiptNumber} of UGX ${sanitized.amount.toLocaleString()} for ${sanitized.payerName}`
        });
      } catch {}

      if (txType === 'INFLOW' && !cleanEmail) {
        res.data.email = '';
        res.data.emailStatus = 'NOT_PROVIDED';
        res.message = `Receipt ${res.data.receiptNumber} generated successfully! Ready for WhatsApp.`;
      }
    }

    return res;
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

    // 1. Fast friendly permission check (the server re-verifies the role from
    //    the session token before deleting anything).
    const users = this.getStoredUsers();
    const operator = users.find(u => (u.email || '').toLowerCase() === cleanEmail);
    const perms = resolveUserPermissions(operator);
    if (!perms.canDeleteTransactions && operator?.role !== 'OWNER') {
      return {
        success: false,
        error: 'Permission denied. You do not have permission to delete transactions from the ledger.'
      };
    }

    // 2. Persist deletion to the central database (covers live receipts,
    //    expense vouchers and imported HIST-* records alike).
    const srvRes = await safeFetchMutation(`/api/transactions/${encodeURIComponent(cleanNum)}`, {
      method: 'DELETE'
    });
    if (!srvRes || !srvRes.success) {
      return {
        success: false,
        error: (srvRes && (srvRes.error || srvRes.message)) || `Failed to delete transaction ${cleanNum} from the central database.`
      };
    }

    // 3. Remove from local cache & record audit entry
    this.invalidateTransactionCaches(false);
    let txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    const target = txs.find(t => t.receiptNumber.trim().toUpperCase() === cleanNum);

    if (target) {
      txs = txs.filter(t => t.receiptNumber.trim().toUpperCase() !== cleanNum);
      localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

      this.appendLocalAudit({
        id: String(Date.now()),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        user: operator?.name || 'Operator',
        userEmail: operatorEmail,
        action: 'DELETE_TRANSACTION',
        receiptNumber: cleanNum,
        description: `Deleted receipt ${cleanNum} (UGX ${Number(target.amount).toLocaleString()}, Payer: ${target.payerName})`
      });
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
    const res = await safeFetchMutation(`/api/transactions/${encodeURIComponent(receiptNumber.trim().toUpperCase())}/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorEmail })
    });

    if (res && res.success && res.data) {
      const raw = res.data as Transaction & { payerEmail?: string; payerPhone?: string };
      const sanitized = this.sanitizeTransaction({
        ...raw,
        email: raw.email || raw.payerEmail || '',
        phone: raw.phone || raw.payerPhone || ''
      });
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
      return { ...res, data: sanitized };
    }

    return {
      success: false,
      error: (res && (res.error || res.message)) || `Receipt not found: ${receiptNumber}`
    };
  }

  // --- User Management ---

  public async addUser(user: Omit<User, 'createdAt'>, operatorEmail: string): Promise<BackendResponse<User>> {
    const cleanEmail = user.email.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    const defaultPerms = getDefaultPermissions(user.role);
    const resolvedPerms = user.permissions ? { ...defaultPerms, ...user.permissions } : defaultPerms;

    const targetUser: User = {
      ...user,
      name: user.name.trim(),
      email: cleanEmail,
      password: user.password && user.password.trim() ? user.password.trim() : 'Staff@2026',
      permissions: resolvedPerms,
      createdAt: new Date().toISOString()
    };

    // CENTRAL DATABASE MODE: the server creates/updates the Supabase Auth user
    // (hashed password) and the app_users profile in one call.
    const res = await safeFetchMutation('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: targetUser })
    });

    if (!res || !res.success) {
      return {
        success: false,
        error: (res && (res.error || res.message)) || `Could not save staff member "${targetUser.name}" to the central database.`
      };
    }

    this.cacheUserProfile(targetUser);

    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'ADD_ADMIN',
      description: `Registered/updated staff member: ${targetUser.name} (${cleanEmail}) as ${targetUser.role}`
    });

    return {
      success: true,
      data: targetUser,
      message: `Staff member "${targetUser.name}" successfully registered in the central database.`
    };
  }

  public async editUser(
    targetEmail: string,
    updates: Partial<User>,
    operatorEmail: string
  ): Promise<BackendResponse<User>> {
    const cleanTarget = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    const users = this.getStoredUsers();
    const userIndex = users.findIndex(u => (u.email || '').trim().toLowerCase() === cleanTarget);

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
    }

    // CENTRAL DATABASE MODE: upsert the profile centrally, then set the
    // password through Supabase Auth when it changed.
    const res = await safeFetchMutation('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: [updatedUser] })
    });
    if (!res || !res.success) {
      return {
        success: false,
        error: (res && (res.error || res.message)) || `Could not update "${updatedUser.name}" in the central database.`
      };
    }

    const isPasswordChanged = Boolean(updates.password && updates.password.trim() !== '');
    if (isPasswordChanged && updatedUser.password) {
      const pwRes = await safeFetchMutation('/api/users/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: updatedUser.email, password: updatedUser.password.trim() })
      });
      if (!pwRes || !pwRes.success) {
        return {
          success: true,
          data: updatedUser,
          message: `Profile for "${updatedUser.name}" updated, but the password change failed: ${(pwRes && (pwRes.error || pwRes.message)) || 'unknown error'}`
        };
      }
    }

    this.cacheUserProfile(updatedUser);

    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'EDIT_USER',
      description: isPasswordChanged
        ? `Updated credentials & permissions for ${updatedUser.name} (${updatedUser.email})`
        : `Updated account details/permissions for ${updatedUser.name} (${updatedUser.email})`
    });

    return {
      success: true,
      data: updatedUser,
      message: `User details and permissions for "${updatedUser.name}" updated successfully.`
    };
  }

  public async updateUserStatus(
    targetEmail: string,
    status: 'ACTIVE' | 'INACTIVE',
    operatorEmail: string
  ): Promise<BackendResponse<void>> {
    const cleanTargetEmail = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    const users = this.getStoredUsers();
    const target = users.find(u => (u.email || '').trim().toLowerCase() === cleanTargetEmail);
    if (target && target.role === 'OWNER' && status === 'INACTIVE') {
      return { success: false, error: 'Cannot deactivate the Owner account.' };
    }

    const res = await safeFetchMutation('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanTargetEmail, status })
    });
    if (!res || !res.success) {
      return {
        success: false,
        error: (res && (res.error || res.message)) || 'Could not update the account status in the central database.'
      };
    }

    if (target) {
      this.cacheUserProfile({ ...target, status });
    }

    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: status === 'ACTIVE' ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN',
      description: `${status === 'ACTIVE' ? 'Activated' : 'Deactivated'} user account: ${cleanTargetEmail}`
    });

    return { success: true, message: `Status updated to ${status}` };
  }

  public async removeUser(targetEmail: string, operatorEmail: string): Promise<BackendResponse<void>> {
    const cleanTargetEmail = targetEmail.trim().toLowerCase();
    const opEmail = operatorEmail || SYSTEM_OWNER_EMAIL;

    const users = this.getStoredUsers();
    const target = users.find(u => (u.email || '').trim().toLowerCase() === cleanTargetEmail);
    if (target && target.role === 'OWNER') {
      return { success: false, error: 'Cannot delete the System Owner account.' };
    }

    const res = await safeFetchMutation(`/api/users?email=${encodeURIComponent(cleanTargetEmail)}`, {
      method: 'DELETE'
    });
    if (!res || !res.success) {
      return {
        success: false,
        error: (res && (res.error || res.message)) || 'Could not delete the account from the central database.'
      };
    }

    const userName = target ? target.name : cleanTargetEmail;

    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: 'Owner',
      userEmail: opEmail,
      action: 'REMOVE_ADMIN',
      description: `Owner removed user account: ${userName} (${cleanTargetEmail})`
    });

    return { success: true, message: `User "${userName}" was successfully deleted.` };
  }

  /**
   * Sync all local users to Google Sheets
   */
  /**
   * Push all cached staff profiles to the central database (Supabase).
   * (Method name kept for UI compatibility.)
   */
  public async syncAllUsersToGas(operatorEmail: string): Promise<BackendResponse<{ count: number }>> {
    const users = this.getStoredUsers();

    const res = await safeFetchMutation('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    });

    if (res && res.success) {
      return {
        success: true,
        message: res.message || `Successfully synchronized ${users.length} staff members to the central database.`,
        data: { count: users.length }
      };
    }

    return {
      success: false,
      error: (res && (res.error || res.message)) || 'Could not synchronize staff members to the central database.'
    };
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
              message: `Verified via the central database: "${authRes.user.name}" is ACTIVE with role ${authRes.user.role}.`,
              details: authRes.user
            };
          }
        } catch (e: any) {
          return { authorized: false, message: `Central database check error: ${e.message}` };
        }
      }
      return {
        authorized: false,
        message: `Staff member "${cleanEmail}" is NOT registered in the central database.`
      };
    }

    if (matched.status !== 'ACTIVE') {
      return {
        authorized: false,
        message: `Staff member "${matched.name}" is registered but set to INACTIVE. Click "Activate" to allow login.`
      };
    }

    const liveStr = 'Central database (Supabase) connected';
    return {
      authorized: true,
      message: `Staff member "${matched.name}" is ACTIVE as ${matched.role}. Backend: ${liveStr}.`,
      details: matched
    };
  }

  // --- Settings ---

  public async saveSettings(settings: AppSettings, operatorEmail: string): Promise<BackendResponse<AppSettings>> {
    // Paint cache first for instant UI feedback
    localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(settings));

    // CENTRAL DATABASE MODE: persist to Supabase (authoritative)
    const res = await safeFetchMutation('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });

    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: 'Operator',
      userEmail: operatorEmail,
      action: 'CHANGE_SETTINGS',
      description: `Updated organization settings and configuration (${settings.organizationName})`
    });

    if (res && res.success) {
      const merged = { ...settings, ...(res.data || {}) };
      localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(merged));
      return { success: true, data: merged, message: 'Settings saved to the central database successfully.' };
    }

    return {
      success: false,
      error: (res && (res.error || res.message)) || 'Settings could not be saved to the central database. Please try again.'
    };
  }

  // --- Audit Log Action ---

  public async logAction(
    action: AuditLogEntry['action'],
    description: string,
    receiptNumber: string | undefined,
    user: User
  ): Promise<void> {
    // Local mirror for instant UI
    this.appendLocalAudit({
      id: String(Date.now()),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      user: user.name,
      userEmail: user.email,
      action,
      receiptNumber,
      description
    });

    // Authoritative copy in the central database (survives device loss)
    try {
      await safeFetchMutation('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          description,
          receiptNumber,
          user: { name: user.name, email: user.email }
        })
      });
    } catch {
      // Silent catch for audit logger
    }
  }

  // --- Health Check / Diagnostic ---

  public async testConnection(urlToTest?: string): Promise<{ success: boolean; message: string; timestamp?: string }> {
    // CENTRAL DATABASE MODE: checks the Supabase-backed /api functions.
    try {
      const res = await safeFetchJson<any>('/api/health');
      if (res && res.success) {
        return { success: true, message: res.message || 'Connected to the central database!', timestamp: res.timestamp };
      }
      return { success: false, message: (res && res.error) || 'The central database is not reachable right now.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }

}

export const api = new ApiClient();

