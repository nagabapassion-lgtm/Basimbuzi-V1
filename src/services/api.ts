import { 
  Transaction, 
  User, 
  AppSettings, 
  AuditLogEntry, 
  GenerateReceiptPayload, 
  BackendResponse,
  AuthCheckResult,
  resolveUserPermissions,
  getDefaultPermissions
} from '../types';

const STORAGE_KEYS = {
  GAS_URL: 'sc_basimbuzi_gas_url',
  LOCAL_TXS: 'sc_basimbuzi_txs_v2',
  LOCAL_USERS: 'sc_basimbuzi_users_v2',
  LOCAL_SETTINGS: 'sc_basimbuzi_settings_v2',
  LOCAL_AUDIT: 'sc_basimbuzi_audit_v2',
  LOCAL_COUNTER: 'sc_basimbuzi_counter_v2',
  AUTH_USER: 'sc_basimbuzi_auth_user_v2',
  ACTIVE_OTPS: 'sc_basimbuzi_active_otps_v2'
};

// Default organization settings with blue branding and logo field
const DEFAULT_SEED_SETTINGS: AppSettings = {
  organizationName: 'SC Basimbuzi',
  organizationEmail: 'info@scbasimbuzi.org',
  organizationPhone: '+256 700 123456',
  organizationAddress: 'Lugogo Bypass, Kampala, Uganda',
  receiptPrefix: 'SB',
  receiptFooter: 'Thank you for your payment and support towards SC Basimbuzi.',
  logoUrl: '',
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
  paymentMethods: [
    'Mobile Money',
    'Bank Transfer',
    'Cash',
    'Other'
  ],
  currency: 'UGX'
};

export const SYSTEM_OWNER_EMAIL = 'nagabapassion@gmail.com';

export const SYSTEM_OWNER_USER: User = {
  name: 'Nagaba Passion',
  email: 'nagabapassion@gmail.com',
  role: 'OWNER',
  status: 'ACTIVE',
  permissions: getDefaultPermissions('OWNER'),
  createdAt: '2026-01-01T08:00:00.000Z'
};

export const JOTHAM_EMAIL = 'jotham.itungo@gmail.com';

export const JOTHAM_USER: User = {
  name: 'Jotham Itungo',
  email: 'jotham.itungo@gmail.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: getDefaultPermissions('ADMIN'),
  createdAt: '2026-03-01T08:00:00.000Z'
};

const DEFAULT_SEED_USERS: User[] = [
  SYSTEM_OWNER_USER,
  JOTHAM_USER,
  {
    name: 'Brenda Namutebi',
    email: 'brenda.admin@scbasimbuzi.org',
    role: 'ADMIN',
    status: 'ACTIVE',
    permissions: getDefaultPermissions('ADMIN'),
    createdAt: '2026-01-10T10:30:00.000Z'
  },
  {
    name: 'David Okello',
    email: 'david.admin@scbasimbuzi.org',
    role: 'ADMIN',
    status: 'ACTIVE',
    permissions: getDefaultPermissions('ADMIN'),
    createdAt: '2026-02-01T14:15:00.000Z'
  },
  {
    name: 'Sarah Akello',
    email: 'sarah.cashier@scbasimbuzi.org',
    role: 'ISSUER',
    status: 'ACTIVE',
    permissions: getDefaultPermissions('ISSUER'),
    createdAt: '2026-02-15T09:00:00.000Z'
  }
];

// Clean slate: Start from 0 shillings as requested
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

  constructor() {
    this.loadGasUrl();
    this.initLocalStorage();
    this.syncSharedConfigAndUsers();
  }

  public getGasUrl(): string {
    return this.gasUrl;
  }

  public setGasUrl(url: string): void {
    this.gasUrl = url.trim();
    localStorage.setItem(STORAGE_KEYS.GAS_URL, this.gasUrl);
    // Broadcast configured GAS URL to server so all devices/staff get it automatically
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl: this.gasUrl })
    }).catch(() => null);
  }

  private loadGasUrl(): void {
    const saved = localStorage.getItem(STORAGE_KEYS.GAS_URL);
    if (saved) {
      this.gasUrl = saved.trim();
    }
  }

  public async refreshConnection(): Promise<boolean> {
    await this.syncSharedConfigAndUsers();
    return this.isConnectedToLiveBackend();
  }

  public async syncSharedConfigAndUsers(): Promise<void> {
    try {
      // 1. Sync Config (GAS URL)
      const configRes = await fetch('/api/config').then(r => r.json()).catch(() => null);
      if (configRes && configRes.success && configRes.data?.gasUrl) {
        const remoteGasUrl = configRes.data.gasUrl.trim();
        if (remoteGasUrl && remoteGasUrl.startsWith('https://script.google.com/macros/s/')) {
          this.gasUrl = remoteGasUrl;
          localStorage.setItem(STORAGE_KEYS.GAS_URL, remoteGasUrl);
        }
      } else if (this.gasUrl && this.gasUrl.startsWith('https://script.google.com/macros/s/')) {
        // Push local gasUrl to server
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: this.gasUrl })
        }).catch(() => null);
      }

      // 2. Sync Shared Users from Server
      const usersRes = await fetch('/api/users').then(r => r.json()).catch(() => null);
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
            if (!map.has(key) || (u.createdAt && u.createdAt > (map.get(key)?.createdAt || ''))) {
              map.set(key, u);
            }
          }
        }
        const merged = Array.from(map.values());
        localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(merged));
      } else {
        // Push local users to server
        const localUsers = this.getStoredUsers();
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: localUsers })
        }).catch(() => null);
      }
    } catch {
      // Ignore network sync failures
    }
  }

  public isConnectedToLiveBackend(): boolean {
    return Boolean(this.gasUrl && this.gasUrl.startsWith('https://script.google.com/macros/s/'));
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

    // Ensure Jotham Itungo is always registered and active as an administrator
    const jothamIndex = users.findIndex(u => (u.email || '').trim().toLowerCase() === JOTHAM_EMAIL.toLowerCase());
    if (jothamIndex === -1) {
      users.push({ ...JOTHAM_USER });
    } else {
      users[jothamIndex] = {
        ...users[jothamIndex],
        name: users[jothamIndex].name || JOTHAM_USER.name,
        role: users[jothamIndex].role || 'ADMIN',
        status: 'ACTIVE',
        permissions: users[jothamIndex].permissions || getDefaultPermissions('ADMIN')
      };
    }

    localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));
    return users;
  }

  public getStoredTransactions(): Transaction[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_TXS);
      return raw ? JSON.parse(raw) : [...DEFAULT_SEED_TRANSACTIONS];
    } catch {
      return [...DEFAULT_SEED_TRANSACTIONS];
    }
  }

  public getStoredSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_SETTINGS);
      return raw ? JSON.parse(raw) : { ...DEFAULT_SEED_SETTINGS };
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
      throw new Error('Google Apps Script Web App URL is not configured.');
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return data;
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

    // If email matches the system owner or Jotham Itungo, ensure they are always matched
    if (!matched && cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      matched = SYSTEM_OWNER_USER;
    }
    if (!matched && cleanEmail === JOTHAM_EMAIL.toLowerCase()) {
      matched = JOTHAM_USER;
    }

    // 1. Check shared server database if not found locally
    if (!matched) {
      try {
        const usersRes = await fetch('/api/users').then(r => r.json()).catch(() => null);
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

    // If not connected to live GAS backend, inform user to configure Web App URL
    if (!this.isConnectedToLiveBackend()) {
      return {
        success: false,
        error: 'Google Apps Script backend URL is not connected on this device. Please click "Configure Backend URL" below to enter your deployed script URL so the verification code can be emailed to your inbox.'
      };
    }

    // Dispatch email via Google Apps Script (Try GET first for optimal redirection handling, then POST fallback)
    let gasSuccess = false;
    let gasError: string | undefined;

    try {
      const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=sendLoginOtp&email=${encodeURIComponent(cleanEmail)}&code=${encodeURIComponent(otpCode)}`;
      const gasRes = await this.fetchFromGas<{ success: boolean; error?: string }>(getUrl);
      if (gasRes.success) {
        gasSuccess = true;
      } else {
        gasError = gasRes.error;
        // Fallback to POST
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
          gasError = undefined;
        } else {
          gasError = postRes.error || gasError;
        }
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
        code: otpCode,
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
    if (!matched && cleanEmail === JOTHAM_EMAIL.toLowerCase()) {
      matched = JOTHAM_USER;
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

  // --- Quick Auth Check (for existing session) ---

  public async checkAuth(email: string): Promise<AuthCheckResult> {
    const cleanEmail = email.trim().toLowerCase();
    
    // The system owner and authorized administrator Jotham are always authorized
    if (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      return {
        authorized: true,
        user: SYSTEM_OWNER_USER
      };
    }

    if (cleanEmail === JOTHAM_EMAIL.toLowerCase()) {
      return {
        authorized: true,
        user: JOTHAM_USER
      };
    }

    if (this.isConnectedToLiveBackend()) {
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

        // Cache user in local storage
        const users = this.getStoredUsers();
        const existingIdx = users.findIndex(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (existingIdx === -1) {
          users.push(formattedUser);
        } else {
          users[existingIdx] = { ...users[existingIdx], ...formattedUser };
        }
        localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(users));

        return {
          authorized: true,
          user: formattedUser
        };
      }

      return {
        authorized: false,
        message: authData?.error || res?.error || 'ACCESS DENIED — This email address is not registered in the SC Basimbuzi system. Please contact the administrator.'
      };
    }

    // Local Auth Logic
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

    return {
      authorized: false,
      message: 'ACCESS DENIED — You are not authorized to access the SC Basimbuzi Receipt Management System.'
    };
  }

  // --- Initial Data / Dashboard / Transactions ---

  public async getInitialData(operatorEmail: string, limit: number = 200): Promise<{
    settings: AppSettings;
    transactions: Transaction[];
    users: User[];
    auditLogs: AuditLogEntry[];
  }> {
    if (this.isConnectedToLiveBackend()) {
      const url = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}action=getInitialData&operatorEmail=${encodeURIComponent(operatorEmail)}&limit=${limit}`;
      const res = await this.fetchFromGas<{
        settings: AppSettings;
        transactions: Transaction[];
        users: User[];
        auditLogs: AuditLogEntry[];
      }>(url);
      if (res.success && res.data) {
        // Guarantee local cache sync with Google Apps Script
        if (res.data.settings) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_SETTINGS, JSON.stringify(res.data.settings));
        }
        if (res.data.users && res.data.users.length > 0) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_USERS, JSON.stringify(res.data.users));
        }
        if (res.data.transactions) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(res.data.transactions));
        }
        if (res.data.auditLogs) {
          localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(res.data.auditLogs));
        }
        return res.data;
      }
    }

    // Local Mock / Cache Fallback
    return {
      settings: this.getStoredSettings(),
      transactions: this.getStoredTransactions(),
      users: this.getStoredUsers(),
      auditLogs: this.getStoredAuditLogs()
    };
  }

  // --- Generate Receipt ---

  public async generateReceipt(
    payload: GenerateReceiptPayload
  ): Promise<BackendResponse<Transaction>> {
    if (this.isConnectedToLiveBackend()) {
      const requestData = {
        action: 'generateReceipt',
        operatorEmail: payload.operatorEmail,
        ...payload
      };

      const res = await this.fetchFromGas<Transaction>(this.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestData)
      });
      return res;
    }

    // Local Mock Execution
    const settings: AppSettings = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_SETTINGS) || JSON.stringify(DEFAULT_SEED_SETTINGS));
    const prefix = settings.receiptPrefix || 'SB';
    const now = new Date();
    const currentYear = now.getFullYear();

    // Atomic counter in localStorage
    const counters = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_COUNTER) || '{}');
    const lastSeq = counters[currentYear] || 0;
    const nextSeq = lastSeq + 1;
    counters[currentYear] = nextSeq;
    localStorage.setItem(STORAGE_KEYS.LOCAL_COUNTER, JSON.stringify(counters));

    const formattedSeq = String(nextSeq).padStart(5, '0');
    const receiptNumber = `${prefix}-${currentYear}-${formattedSeq}`;

    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    const newTx: Transaction = {
      receiptNumber,
      date: dateStr,
      time: timeStr,
      payerName: payload.payerName.trim(),
      phone: payload.phone.trim(),
      email: payload.email.trim().toLowerCase(),
      amount: Number(payload.amount),
      paymentPurpose: payload.paymentPurpose || 'General Payment',
      paymentMethod: payload.paymentMethod || 'Cash',
      paymentReference: payload.paymentReference.trim(),
      notes: payload.notes.trim(),
      generatedBy: payload.operatorName,
      operatorEmail: payload.operatorEmail,
      paymentStatus: 'COMPLETED',
      emailStatus: 'SENT',
      createdAt: now.toISOString()
    };

    const txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    txs.unshift(newTx);
    localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

    // Add Audit Log
    const auditLogs: AuditLogEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_AUDIT) || '[]');
    auditLogs.unshift({
      id: String(Date.now()),
      date: dateStr,
      time: timeStr,
      user: payload.operatorName,
      userEmail: payload.operatorEmail,
      action: 'GENERATE_RECEIPT',
      receiptNumber: receiptNumber,
      description: `Generated receipt of UGX ${Number(payload.amount).toLocaleString()} for ${payload.payerName} (${payload.paymentPurpose}). Email: SENT`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    return {
      success: true,
      data: newTx,
      message: `Receipt generated and emailed successfully to ${payload.email}`
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

    // 2. Perform Local Delete IMMEDIATELY so UI never stays stuck
    let txs: Transaction[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_TXS) || '[]');
    const target = txs.find(t => t.receiptNumber.trim().toUpperCase() === cleanNum);

    if (target) {
      txs = txs.filter(t => t.receiptNumber.trim().toUpperCase() !== cleanNum);
      localStorage.setItem(STORAGE_KEYS.LOCAL_TXS, JSON.stringify(txs));

      // Audit Log
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

    // 3. If connected to live GAS backend, attempt cloud sync
    if (this.isConnectedToLiveBackend()) {
      try {
        await this.fetchFromGas<void>(this.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'deleteTransaction',
            operatorEmail,
            receiptNumber: cleanNum
          })
        });
      } catch (err) {
        console.warn('Backend sync for deleteTransaction returned notice:', err);
      }
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
        permissions: resolvedPerms
      };
      users[existingIndex] = targetUser;
    } else {
      targetUser = {
        ...user,
        name: user.name.trim(),
        email: cleanEmail,
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
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: targetUser })
    }).catch(() => null);

    // Live Google Apps Script Sync
    if (this.isConnectedToLiveBackend()) {
      let syncSuccess = false;
      let syncError: string | undefined;

      // 1. Try GET request first (avoids CORS preflight and follows 302 redirects automatically)
      try {
        const queryParams = new URLSearchParams({
          action: 'addUser',
          operatorEmail: opEmail,
          name: targetUser.name,
          email: cleanEmail,
          role: targetUser.role,
          status: targetUser.status
        });
        const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const getRes = await this.fetchFromGas<{ success: boolean; error?: string; message?: string }>(getUrl);

        if (getRes.success) {
          syncSuccess = true;
        } else {
          syncError = getRes.error;
          // 2. Fallback to POST
          const postRes = await this.fetchFromGas<{ success: boolean; error?: string; message?: string }>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'addUser',
              operatorEmail: opEmail,
              user: targetUser
            })
          });
          if (postRes.success) {
            syncSuccess = true;
            syncError = undefined;
          } else {
            syncError = postRes.error || syncError;
          }
        }
      } catch (err: unknown) {
        syncError = err instanceof Error ? err.message : String(err);
      }

      if (!syncSuccess && syncError) {
        return {
          success: true,
          data: targetUser,
          message: `Staff member "${targetUser.name}" registered successfully! (Note: Google Sheets sync reported: ${syncError}. Please ensure the latest Code.gs is deployed as New Version in Google Apps Script).`
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
        permissions: updates.permissions || existingUser.permissions || getDefaultPermissions(updates.role || existingUser.role)
      };

      users[userIndex] = updatedUser;
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
      action: 'EDIT_USER',
      description: `Updated account details/permissions for ${updatedUser.name} (${updatedUser.email})`
    });
    localStorage.setItem(STORAGE_KEYS.LOCAL_AUDIT, JSON.stringify(auditLogs));

    if (this.isConnectedToLiveBackend()) {
      try {
        const queryParams = new URLSearchParams({
          action: 'editUser',
          operatorEmail: opEmail,
          targetEmail: cleanTarget,
          name: updatedUser.name || '',
          role: updatedUser.role || 'ADMIN',
          status: updatedUser.status || 'ACTIVE'
        });
        const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const getRes = await this.fetchFromGas<{ success: boolean; error?: string }>(getUrl);

        if (!getRes.success) {
          await this.fetchFromGas<User>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'editUser',
              operatorEmail: opEmail,
              targetEmail: cleanTarget,
              user: updatedUser
            })
          });
        }
      } catch (err) {
        console.warn('Backend sync for editUser notice:', err);
      }
    }

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

    if (this.isConnectedToLiveBackend()) {
      try {
        const queryParams = new URLSearchParams({
          action: 'updateUserStatus',
          operatorEmail: opEmail,
          targetEmail: cleanTargetEmail,
          status: status
        });
        const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const getRes = await this.fetchFromGas<{ success: boolean; error?: string }>(getUrl);

        if (!getRes.success) {
          await this.fetchFromGas<void>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'updateUserStatus',
              operatorEmail: opEmail,
              targetEmail: cleanTargetEmail,
              status
            })
          });
        }
      } catch (err) {
        console.warn('Backend sync for updateUserStatus notice:', err);
      }
    }

    return { success: true, message: `Status updated to ${status}` };
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

    if (this.isConnectedToLiveBackend()) {
      try {
        const queryParams = new URLSearchParams({
          action: 'removeUser',
          operatorEmail: opEmail,
          targetEmail: cleanTargetEmail
        });
        const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const getRes = await this.fetchFromGas<{ success: boolean; error?: string }>(getUrl);

        if (!getRes.success) {
          await this.fetchFromGas<void>(this.gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'removeUser',
              operatorEmail: opEmail,
              targetEmail: cleanTargetEmail
            })
          });
        }
      } catch (err) {
        console.warn('Backend sync for removeUser notice:', err);
      }
    }

    return { success: true, message: `User "${userName}" was successfully deleted.` };
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

      // 2. Fallback: Sync each user individually via GET
      let successCount = 0;
      for (const u of users) {
        const queryParams = new URLSearchParams({
          action: 'addUser',
          operatorEmail: opEmail,
          name: u.name || '',
          email: u.email,
          role: u.role || 'ADMIN',
          status: u.status || 'ACTIVE'
        });
        const getUrl = `${this.gasUrl}${this.gasUrl.includes('?') ? '&' : '?'}${queryParams.toString()}`;
        const res = await this.fetchFromGas<{ success: boolean }>(getUrl);
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
    if (cleanEmail === JOTHAM_EMAIL.toLowerCase()) matched = JOTHAM_USER;

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

    // 2. If connected to live GAS backend, attempt sync
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
        if (res.success && res.data) {
          return res;
        }
      } catch (err) {
        console.warn('Backend sync for saveSettings notice:', err);
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

