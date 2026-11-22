import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  computeDuesStatus,
  isHouseEligibleSchool,
  isMemberProfileComplete,
  mergeMemberDirectories,
  normalizeMemberGender,
  normalizeMemberHouse,
  normalizeMemberSchool,
  parseTreasuryMembersCsv
} from './src/utils/memberImport';
import {
  cleanPhoneNumber,
  isStaffOrPlaceholderEmail,
  normalizePersonName,
  PRE_CSV_COVERED_GAS_RECEIPTS,
  PRE_CSV_COVERED_RECEIPT_SET,
  resolveCanonicalMemberNameKey,
  UNRECORDED_LIVE_GAS_RECEIPTS
} from './src/utils/ledgerReconciliation';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const DATA_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const PUBLIC_SITE_FILE = path.join(DATA_DIR, 'public_site.json');
  const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
  const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
  const HISTORICAL_TXS_FILE = path.join(DATA_DIR, 'historical_transactions.json');
  const SUBMISSIONS_FILE = path.join(DATA_DIR, 'member_submissions.json');
  const RECONCILIATION_FILE = path.join(DATA_DIR, 'reconciliation.json');
  const BUNDLED_TREASURY_CSV = path.join(
    process.cwd(),
    'public',
    'assets',
    'aistudio',
    'SC_Basimbuzi_Treasury_-_Financial_Report_dded1170.csv'
  );

  // Helpers for validation
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const GAS_URL_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(\?.*)?$/;
  const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'ISSUER', 'MEDIA']);
  const ALLOWED_STATUSES = new Set(['ACTIVE', 'INACTIVE']);
  const SYSTEM_OWNER_EMAIL = 'nagabapassion@gmail.com';

  // Server-side 30s singleflight caches for live Google Apps Script transactions & member directory
  const GAS_TX_CACHE_TTL_MS = 30_000;
  let gasTxCache: { ts: number; gasUrl: string; data: any[] } | null = null;
  let gasTxInFlight: Promise<any[] | null> | null = null;
  let gasMembersCache: { ts: number; gasUrl: string; data: any[] } | null = null;
  let gasMembersInFlight: Promise<any[] | null> | null = null;
  let gasSupportsUpsertMember: boolean | null = null;

  const invalidateGasTxCache = () => {
    gasTxCache = null;
    gasMembersCache = null;
  };

  app.post('/api/gas/invalidate-cache', (_req, res) => {
    invalidateGasTxCache();
    res.json({ success: true });
  });

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API: Get shared system settings (including logoUrl, org details)
  app.get('/api/settings', (req, res) => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        res.json({ success: true, data });
      } else {
        res.json({ success: true, data: null });
      }
    } catch {
      res.status(500).json({ success: false, error: 'Failed to read server settings' });
    }
  });

  // API: Save shared system settings (logoUrl, branding, org configuration)
  app.post('/api/settings', (req, res) => {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid settings payload' });
        return;
      }
      let currentSettings: any = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        try {
          currentSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        } catch {
          currentSettings = {};
        }
      }
      const updated = {
        ...currentSettings,
        ...settings,
        organizationPhone: settings.organizationPhone !== undefined ? String(settings.organizationPhone).trim() : (currentSettings.organizationPhone || ''),
        logoUrl: (settings.logoUrl && String(settings.logoUrl).trim()) ? settings.logoUrl : (currentSettings.logoUrl || '/logo.png'),
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ success: true, data: updated });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to save settings to server' });
    }
  });

  // API: Get shared backend configuration
  app.get('/api/config', (req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        res.json({ success: true, data });
      } else {
        const defaultGasUrl = (process.env.VITE_GAS_URL || '').trim();
        res.json({ success: true, data: { gasUrl: defaultGasUrl } });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to read server configuration' });
    }
  });

  // API: Save shared backend configuration (Google Apps Script Web App URL)
  app.post('/api/config', (req, res) => {
    try {
      const { gasUrl } = req.body;
      if (gasUrl !== undefined && typeof gasUrl !== 'string') {
        res.status(400).json({ success: false, error: 'Invalid URL format' });
        return;
      }

      const cleanUrl = (gasUrl || '').trim();
      // Validate that URL either is empty or is a legitimate Google Apps Script Web App endpoint
      if (cleanUrl !== '' && !GAS_URL_REGEX.test(cleanUrl)) {
        res.status(400).json({ 
          success: false, 
          error: 'URL must start with https://script.google.com/macros/s/ and end with /exec' 
        });
        return;
      }

      const config = {
        gasUrl: cleanUrl,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      invalidateGasTxCache();
      gasSupportsUpsertMember = null;
      res.json({ success: true, data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to save configuration' });
    }
  });

  // API: Get shared users
  app.get('/api/users', (req, res) => {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        res.json({ success: true, data: Array.isArray(users) ? users : [] });
      } else {
        res.json({ success: true, data: [] });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve users' });
    }
  });

  // API: Save or update shared users
  app.post('/api/users', (req, res) => {
    try {
      const { users, user } = req.body;
      let currentUsers: any[] = [];
      if (fs.existsSync(USERS_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          currentUsers = Array.isArray(parsed) ? parsed : [];
        } catch {
          currentUsers = [];
        }
      }

      const sanitizeUser = (u: any) => {
        if (!u || typeof u !== 'object') return null;
        const email = String(u.email || '').trim().toLowerCase();
        if (!EMAIL_REGEX.test(email) || email.length > 100) return null;
        const name = String(u.name || email.split('@')[0]).trim().slice(0, 100);
        let role = String(u.role || 'ADMIN').trim().toUpperCase();
        if (!ALLOWED_ROLES.has(role)) role = 'ADMIN';
        if (email === SYSTEM_OWNER_EMAIL) role = 'OWNER';
        let status = String(u.status || 'ACTIVE').trim().toUpperCase();
        if (!ALLOWED_STATUSES.has(status)) status = 'ACTIVE';
        if (email === SYSTEM_OWNER_EMAIL) status = 'ACTIVE';
        const password = u.password !== undefined ? String(u.password).trim() : undefined;
        const permissions = u.permissions && typeof u.permissions === 'object' ? u.permissions : undefined;

        return {
          name,
          email,
          role,
          status,
          password,
          permissions,
          createdAt: u.createdAt || new Date().toISOString()
        };
      };

      if (Array.isArray(users)) {
        if (users.length > 50) {
          res.status(400).json({ success: false, error: 'Exceeded maximum permitted users (50)' });
          return;
        }

        const currentMap = new Map<string, any>();
        for (const u of currentUsers) {
          const sanitized = sanitizeUser(u);
          if (sanitized) currentMap.set(sanitized.email, sanitized);
        }

        const newUsers: any[] = [];
        for (const u of users) {
          const sanitized = sanitizeUser(u);
          if (sanitized) {
            const existing = currentMap.get(sanitized.email);
            if (existing && !sanitized.password && existing.password) {
              sanitized.password = existing.password;
            }
            newUsers.push(sanitized);
          }
        }
        currentUsers = newUsers;
      } else if (user) {
        const sanitized = sanitizeUser(user);
        if (!sanitized) {
          res.status(400).json({ success: false, error: 'Invalid user payload' });
          return;
        }
        const idx = currentUsers.findIndex(u => (u.email || '').toLowerCase().trim() === sanitized.email);
        if (idx !== -1) {
          currentUsers[idx] = { 
            ...currentUsers[idx], 
            ...sanitized,
            password: sanitized.password !== undefined && sanitized.password !== '' 
              ? sanitized.password 
              : currentUsers[idx].password
          };
        } else {
          currentUsers.push(sanitized);
        }
      }

      fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
      res.json({ success: true, data: currentUsers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to update users' });
    }
  });

  // API: Update user password directly
  app.post('/api/users/password', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password || typeof password !== 'string') {
        res.status(400).json({ success: false, error: 'Email and password are required' });
        return;
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPassword = String(password).trim();
      if (cleanPassword.length < 4) {
        res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
        return;
      }

      let currentUsers: any[] = [];
      if (fs.existsSync(USERS_FILE)) {
        try {
          currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        } catch {
          currentUsers = [];
        }
      }

      const idx = currentUsers.findIndex(u => (u.email || '').toLowerCase().trim() === cleanEmail);
      if (idx !== -1) {
        currentUsers[idx].password = cleanPassword;
      } else {
        currentUsers.push({
          name: cleanEmail.split('@')[0],
          email: cleanEmail,
          role: cleanEmail === SYSTEM_OWNER_EMAIL ? 'OWNER' : 'ADMIN',
          status: 'ACTIVE',
          password: cleanPassword,
          createdAt: new Date().toISOString()
        });
      }

      fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
      res.json({ success: true, message: 'Password updated successfully', user: currentUsers[idx !== -1 ? idx : currentUsers.length - 1] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to update user password' });
    }
  });

  // Helper to get configured Google Apps Script Web App URL
  const getGasUrl = (): string => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (data?.gasUrl && typeof data.gasUrl === 'string' && data.gasUrl.trim().startsWith('https://script.google.com/macros/s/')) {
          return data.gasUrl.trim();
        }
      }
    } catch {}
    const envUrl = (process.env.VITE_GAS_URL || '').trim();
    if (envUrl.startsWith('https://script.google.com/macros/s/')) {
      return envUrl;
    }
    return '';
  };

  const fetchGasTransactionsCached = async (force: boolean = false): Promise<any[] | null> => {
    const gasUrl = getGasUrl();
    if (!gasUrl) return null;

    if (
      !force &&
      gasTxCache &&
      gasTxCache.gasUrl === gasUrl &&
      Date.now() - gasTxCache.ts < GAS_TX_CACHE_TTL_MS
    ) {
      return gasTxCache.data;
    }

    if (!force && gasTxInFlight) {
      return gasTxInFlight;
    }

    gasTxInFlight = (async () => {
      try {
        const url = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=getTransactions&operatorEmail=${encodeURIComponent(SYSTEM_OWNER_EMAIL)}&limit=0`;
        const gasRes = await fetch(url, { redirect: 'follow' }).then(r => r.json()).catch(() => null);
        if (gasRes && gasRes.success && Array.isArray(gasRes.data)) {
          gasTxCache = { ts: Date.now(), gasUrl, data: gasRes.data };
          return gasRes.data;
        }
        return null;
      } catch {
        return null;
      } finally {
        gasTxInFlight = null;
      }
    })();

    return gasTxInFlight;
  };

  // API: Authoritative staff sign-in with password (supports newly added members dynamically from database and Google Sheets)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ 
          success: false, 
          authorized: false, 
          message: 'Please provide both your registered email address and password.' 
        });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      let currentUsers: any[] = [];
      if (fs.existsSync(USERS_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          currentUsers = Array.isArray(parsed) ? parsed : [];
        } catch {
          currentUsers = [];
        }
      }

      // Ensure system owner exists if database is new
      let user = currentUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      if (!user && cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
        user = {
          name: 'Passion',
          email: SYSTEM_OWNER_EMAIL,
          role: 'OWNER',
          status: 'ACTIVE',
          password: 'Passion@2026',
          createdAt: new Date().toISOString()
        };
        currentUsers.unshift(user);
        fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
      }

      // 1. Local Server Database Verification
      if (user) {
        if (user.status !== 'ACTIVE') {
          res.status(403).json({
            success: false,
            authorized: false,
            message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
          });
          return;
        }

        const storedPassword = (user.password || '').trim();
        const isPasswordMatch = (storedPassword && (
          storedPassword === cleanPassword || 
          storedPassword.toLowerCase() === cleanPassword.toLowerCase()
        )) || (
          cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase() && 
          (cleanPassword === 'Passion@2026' || cleanPassword.toLowerCase() === 'passion@2026')
        );

        // If user already has a password and matches
        if (isPasswordMatch) {
          const safeUser = {
            name: user.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: user.role || (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase() ? 'OWNER' : 'ADMIN'),
            status: 'ACTIVE',
            password: user.password || cleanPassword,
            permissions: user.permissions,
            createdAt: user.createdAt || new Date().toISOString()
          };

          res.json({
            success: true,
            authorized: true,
            user: safeUser
          });
          return;
        }

        // If user has a password and entered the wrong password, reject immediately with clear message
        if (storedPassword && !isPasswordMatch) {
          res.status(401).json({
            success: false,
            authorized: false,
            message: 'Incorrect password. Please verify and try again.'
          });
          return;
        }

        // If user exists in local database without password set, verify against GAS if connected before fallback
        if (!storedPassword) {
          const gasUrlForNoPwd = getGasUrl();
          if (gasUrlForNoPwd) {
            try {
              const vRes = await fetch(gasUrlForNoPwd, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                redirect: 'follow',
                body: JSON.stringify({ action: 'verifyPassword', email: cleanEmail, password: cleanPassword })
              }).then(r => r.json()).catch(() => null);
              if (vRes && vRes.success && vRes.authorized) {
                user.password = cleanPassword;
                fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
                res.json({
                  success: true,
                  authorized: true,
                  user: {
                    ...user,
                    ...(vRes.user || {}),
                    email: cleanEmail,
                    status: 'ACTIVE',
                    password: cleanPassword
                  }
                });
                return;
              }
              if (vRes && vRes.error && vRes.error.includes('Incorrect password')) {
                res.status(401).json({
                  success: false,
                  authorized: false,
                  message: 'Incorrect password. Please verify and try again.'
                });
                return;
              }
            } catch {
              // Fall through only if GAS cannot verify
            }
          }
          if (cleanPassword === 'Staff@2026') {
            user.password = cleanPassword;
            fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
            res.json({
              success: true,
              authorized: true,
              user: {
                name: user.name || cleanEmail.split('@')[0],
                email: cleanEmail,
                role: user.role || (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase() ? 'OWNER' : 'ADMIN'),
                status: 'ACTIVE',
                password: cleanPassword,
                permissions: user.permissions,
                createdAt: user.createdAt || new Date().toISOString()
              }
            });
            return;
          }
          res.status(401).json({
            success: false,
            authorized: false,
            message: 'Password has not been configured for this account. Please use Email OTP sign-in or ask the administrator to set your password.'
          });
          return;
        }
      }

      // 2. Dynamic Live Google Sheets Verification (if user is not found locally)
      const gasUrl = getGasUrl();
      if (gasUrl) {
        try {
          // Verify email and password directly via POST against Google Apps Script
          let vRes: any = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: JSON.stringify({
              action: 'verifyPassword',
              email: cleanEmail,
              password: cleanPassword
            })
          }).then(r => r.json()).catch(() => null);

          if (!vRes || (vRes.error && String(vRes.error).includes('Unknown'))) {
            const verifyUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=verifyPassword&email=${encodeURIComponent(cleanEmail)}&password=${encodeURIComponent(cleanPassword)}`;
            vRes = await fetch(verifyUrl, { redirect: 'follow' }).then(r => r.json()).catch(() => null);
          }

          if (vRes && vRes.success && vRes.authorized && vRes.user) {
            const gasUser = vRes.user;
            const syncedUser = {
              name: gasUser.name || cleanEmail.split('@')[0],
              email: cleanEmail,
              role: gasUser.role || (cleanEmail === SYSTEM_OWNER_EMAIL.toLowerCase() ? 'OWNER' : 'ADMIN'),
              status: 'ACTIVE',
              password: cleanPassword,
              permissions: gasUser.permissions,
              createdAt: gasUser.createdAt || new Date().toISOString()
            };

            const idx = currentUsers.findIndex(u => (u.email || '').toLowerCase().trim() === cleanEmail);
            if (idx !== -1) {
              currentUsers[idx] = { ...currentUsers[idx], ...syncedUser };
            } else {
              currentUsers.push(syncedUser);
            }
            fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');

            res.json({
              success: true,
              authorized: true,
              user: syncedUser
            });
            return;
          }

          if (vRes && vRes.error) {
            if (vRes.error.includes('Incorrect password')) {
              res.status(401).json({
                success: false,
                authorized: false,
                message: 'Incorrect password. Please verify and try again.'
              });
              return;
            }
            if (vRes.error.includes('INACTIVE')) {
              res.status(403).json({
                success: false,
                authorized: false,
                message: 'This staff account has been set to INACTIVE in Google Sheets. Please contact the administrator.'
              });
              return;
            }
          }

          // Fallback checkAuth only to surface explicit ACCESS DENIED / INACTIVE status accurately
          const checkUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=checkAuth&email=${encodeURIComponent(cleanEmail)}`;
          const gasRes = await fetch(checkUrl, { redirect: 'follow' }).then(r => r.json()).catch(() => null);
          if (gasRes && gasRes.success && gasRes.authorized && gasRes.user) {
            if (gasRes.user.status && gasRes.user.status !== 'ACTIVE') {
              res.status(403).json({
                success: false,
                authorized: false,
                message: 'This staff account has been set to INACTIVE in Google Sheets. Please contact the administrator.'
              });
              return;
            }
            res.status(401).json({
              success: false,
              authorized: false,
              message: 'Incorrect password or password not yet synced for this Google Sheets user.'
            });
            return;
          } else if (gasRes && gasRes.error && (gasRes.error.includes('ACCESS DENIED') || gasRes.error.includes('not registered'))) {
            res.status(401).json({
              success: false,
              authorized: false,
              message: gasRes.error
            });
            return;
          }
        } catch (gasErr) {
          console.warn('Server failed to verify against Google Apps Script:', gasErr);
        }
      }

      res.status(401).json({
        success: false,
        authorized: false,
        message: 'No account registered with this email. Please contact the administrator (nagabapassion@gmail.com).'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, authorized: false, message: 'Server authentication error' });
    }
  });

  // API: Validate staff session against authoritative database or live Google Sheets
  app.post('/api/auth/check', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({ success: false, authorized: false });
        return;
      }

      const cleanEmail = email.trim().toLowerCase();
      let currentUsers: any[] = [];
      if (fs.existsSync(USERS_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
          currentUsers = Array.isArray(parsed) ? parsed : [];
        } catch {
          currentUsers = [];
        }
      }

      let user = currentUsers.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
      if (user && user.status === 'ACTIVE') {
        res.json({
          success: true,
          authorized: true,
          user: {
            name: user.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: user.role || 'ADMIN',
            status: user.status || 'ACTIVE',
            password: user.password,
            permissions: user.permissions,
            createdAt: user.createdAt || new Date().toISOString()
          }
        });
        return;
      }

      // Check Google Sheets if not found locally
      const gasUrl = getGasUrl();
      if (gasUrl) {
        try {
          const checkUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=checkAuth&email=${encodeURIComponent(cleanEmail)}`;
          const gasRes = await fetch(checkUrl, { redirect: 'follow' }).then(r => r.json());
          if (gasRes && (gasRes.authorized || (gasRes.user && gasRes.user.email))) {
            const foundUser = gasRes.user || gasRes;
            const syncedUser = {
              name: foundUser.name || cleanEmail.split('@')[0],
              email: cleanEmail,
              role: foundUser.role || (cleanEmail === SYSTEM_OWNER_EMAIL ? 'OWNER' : 'ADMIN'),
              status: foundUser.status || 'ACTIVE',
              password: foundUser.password || user?.password,
              permissions: foundUser.permissions || user?.permissions,
              createdAt: foundUser.createdAt || new Date().toISOString()
            };

            const idx = currentUsers.findIndex(u => (u.email || '').toLowerCase().trim() === cleanEmail);
            if (idx !== -1) {
              currentUsers[idx] = { ...currentUsers[idx], ...syncedUser };
            } else {
              currentUsers.push(syncedUser);
            }
            fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');

            res.json({
              success: true,
              authorized: true,
              user: syncedUser
            });
            return;
          }
        } catch {}
      }

      res.json({
        success: false,
        authorized: false,
        message: user ? 'Account is inactive' : 'User not found'
      });
    } catch {
      res.status(500).json({ success: false, authorized: false });
    }
  });

  // --- Public Club Website CMS & Supporter Inquiries ---

  const DEFAULT_PUBLIC_SITE = {
    heroHeadline: 'Pride of the Community. Built on Unity and Football.',
    heroSubheadline:
      'Follow SC Basimbuzi matchday updates, club announcements, youth academy milestones, and official supporter membership across the season.',
    heroImageUrl: 'preset:hero',
    aboutTitle: 'Rooted in Passion, Driven by Discipline',
    aboutText:
      'SC Basimbuzi brings together senior squad competition, structured youth development, and an active supporter membership network. Every contribution and matchday turnout helps sustain training operations, equipment, and community football outreach.',
    clubFoundedYear: '2018',
    homeGround: 'Basimbuzi Community Ground',
    trainingSchedule: 'Tue, Thu & Sat · 4:00 PM EAT',
    membershipTargetLabel: '2026 Season Membership Contribution',
    membershipTargetUgx: 100000,
    news: [
      {
        id: 'news-1',
        title: 'First Team Opens Home Campaign With Commanding 3-1 Victory',
        category: 'Match Report',
        summary:
          'A disciplined second-half display and clinical counter-attacks sealed three vital points in front of a lively home crowd.',
        content:
          'SC Basimbuzi started the home fixture on the front foot, pressing high and controlling midfield possession from the opening whistle.\n\nAfter an even first thirty minutes, the breakthrough arrived from a sweeping wide move finished cleanly into the far corner. Two further goals after the interval put the result beyond doubt despite a late consolation from the visitors.\n\nHead Coach and technical staff praised the squad fitness and thanked supporters who turned out in full club colours.',
        coverImage: 'preset:matchday',
        author: 'SC Basimbuzi Media Desk',
        publishedAt: '2026-11-15',
        featured: true,
        status: 'PUBLISHED'
      },
      {
        id: 'news-2',
        title: 'Season Membership Registration & Youth Academy Intake Now Open',
        category: 'Club Notice',
        summary:
          'Supporters and prospective academy players can now submit membership inquiries online ahead of the upcoming tournament cycle.',
        content:
          'The club executive committee invites returning members, new supporters, and youth prospects to register for the current season.\n\nRegistered members enjoy priority matchday updates, official digital receipts for all club contributions, and direct participation in annual club meetings and community initiatives.\n\nUse the Join Club section below to submit your contact details and our Membership Coordinator will follow up promptly.',
        coverImage: 'preset:supporters',
        author: 'Club Secretariat',
        publishedAt: '2026-11-10',
        featured: false,
        status: 'PUBLISHED'
      },
      {
        id: 'news-3',
        title: 'Weekend Community Cup Brings Together Local Youth Squads',
        category: 'Community',
        summary:
          'Over 120 young players participated in Saturday morning clinics and exhibition matches hosted at Basimbuzi Community Ground.',
        content:
          'Our youth development coaches hosted an open community football morning aimed at identifying emerging talent and promoting sportsmanship.\n\nSupporters and parents gathered pitchside to cheer on the under-15 and under-17 exhibition fixtures, followed by a brief club briefing on upcoming fixtures and kit distribution.',
        coverImage: 'preset:hero',
        author: 'Academy Outreach',
        publishedAt: '2026-11-04',
        featured: false,
        status: 'PUBLISHED'
      }
    ],
    fixtures: [
      {
        id: 'fix-1',
        opponent: 'Kireka United FC',
        competition: 'Regional League',
        date: '2026-11-28',
        time: '16:00',
        venue: 'Basimbuzi Community Ground',
        isHome: true,
        status: 'UPCOMING'
      },
      {
        id: 'fix-2',
        opponent: 'Ntinda Stars',
        competition: 'District Cup',
        date: '2026-12-05',
        time: '15:30',
        venue: 'Ntinda Municipal Pitch',
        isHome: false,
        status: 'UPCOMING'
      },
      {
        id: 'fix-3',
        opponent: 'Bweyogerere Rovers',
        competition: 'Regional League',
        date: '2026-11-15',
        time: '16:00',
        venue: 'Basimbuzi Community Ground',
        isHome: true,
        status: 'COMPLETED',
        homeScore: 3,
        awayScore: 1,
        summary: 'Strong second-half display with goals in the 38th, 61st, and 77th minutes.'
      },
      {
        id: 'fix-4',
        opponent: 'Bugolobi Athletic',
        competition: 'Regional League',
        date: '2026-11-08',
        time: '16:00',
        venue: 'Bugolobi Ground',
        isHome: false,
        status: 'COMPLETED',
        homeScore: 1,
        awayScore: 2,
        summary: 'Crucial away victory secured with an 84th-minute winner.'
      }
    ],
    merch: [
      {
        id: 'merch-1',
        name: 'Official 2026 Home Jersey',
        priceUgx: 65000,
        description: 'Breathable royal blue matchday jersey with gold trim and woven SC Basimbuzi crest.',
        imageUrl: 'preset:jersey',
        sizes: ['S', 'M', 'L', 'XL', 'XXL'],
        inStock: true
      }
    ]
  };

  const sanitizeMediaUrl = (raw: unknown, fallback: string): string => {
    const val = String(raw || '').trim();
    if (!val) return fallback;
    if (val.startsWith('preset:')) return val.slice(0, 40);
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

  const getAuthorizedWebsiteOperator = (req: express.Request): { email: string; name: string; role: string } | null => {
    const headerEmail = String(req.headers['x-operator-email'] || '').trim().toLowerCase();
    if (!headerEmail || !EMAIL_REGEX.test(headerEmail)) return null;

    if (headerEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      return { email: headerEmail, name: 'Passion', role: 'OWNER' };
    }

    if (fs.existsSync(USERS_FILE)) {
      try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        if (Array.isArray(users)) {
          const match = users.find(
            (u: any) => String(u?.email || '').trim().toLowerCase() === headerEmail && u?.status === 'ACTIVE'
          );
          if (match) {
            const role = String(match.role || '').toUpperCase();
            const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'MEDIA' || match?.permissions?.canManageWebsite === true;
            if (canManage) {
              return { email: headerEmail, name: String(match.name || headerEmail), role };
            }
          }
        }
      } catch {
        return null;
      }
    }
    return null;
  };

  const readPublicSiteContent = () => {
    if (fs.existsSync(PUBLIC_SITE_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(PUBLIC_SITE_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          return {
            ...DEFAULT_PUBLIC_SITE,
            ...parsed,
            news: Array.isArray(parsed.news) ? parsed.news : DEFAULT_PUBLIC_SITE.news,
            fixtures: Array.isArray(parsed.fixtures) ? parsed.fixtures : DEFAULT_PUBLIC_SITE.fixtures,
            merch: Array.isArray(parsed.merch) ? parsed.merch : DEFAULT_PUBLIC_SITE.merch
          };
        }
      } catch {}
    }
    return { ...DEFAULT_PUBLIC_SITE };
  };

  const readPublicOrgProfile = () => {
    let settings: any = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      } catch {
        settings = {};
      }
    }
    return {
      organizationName: String(settings.organizationName || 'SC Basimbuzi').trim(),
      organizationEmail: String(settings.organizationEmail || 'info@scbasimbuzi.org').trim(),
      organizationPhone: String(settings.organizationPhone || '+256 700 000000').trim(),
      organizationAddress: String(settings.organizationAddress || 'Kampala, Uganda').trim(),
      logoUrl: sanitizeMediaUrl(settings.logoUrl, '/logo.png')
    };
  };

  // API: Public Website Content (read-only for visitors; includes drafts only for verified website admins)
  app.get('/api/public-site', (req, res) => {
    try {
      const content = readPublicSiteContent();
      const isAdminRequest = req.query.mode === 'admin' && Boolean(getAuthorizedWebsiteOperator(req));
      const filteredNews = isAdminRequest
        ? content.news
        : content.news.filter((n: any) => n?.status === 'PUBLISHED');

      res.json({
        success: true,
        data: {
          content: {
            ...content,
            news: filteredNews
          },
          organization: readPublicOrgProfile()
        }
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load public club website data' });
    }
  });

  // API: Update Public Website Content (OWNER, ADMIN, MEDIA only)
  app.post('/api/public-site', (req, res) => {
    try {
      const operator = getAuthorizedWebsiteOperator(req);
      if (!operator) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized: Only active Owners, Admins, or Media Officers can update public club content.'
        });
        return;
      }

      const incoming = req.body?.content;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid website content payload' });
        return;
      }

      const allowedCategories = new Set(['Match Report', 'Club Notice', 'Community', 'Academy', 'Transfer']);
      const allowedFixtureStatus = new Set(['UPCOMING', 'COMPLETED', 'POSTPONED']);

      const sanitizedNews = Array.isArray(incoming.news)
        ? incoming.news.slice(0, 60).map((item: any, idx: number) => ({
            id: String(item?.id || `news-${Date.now()}-${idx}`).slice(0, 64),
            title: String(item?.title || 'Club Update').trim().slice(0, 160),
            category: allowedCategories.has(item?.category) ? item.category : 'Club Notice',
            summary: String(item?.summary || '').trim().slice(0, 400),
            content: String(item?.content || '').trim().slice(0, 8000),
            coverImage: sanitizeMediaUrl(item?.coverImage, 'preset:matchday'),
            author: String(item?.author || operator.name).trim().slice(0, 80),
            publishedAt: String(item?.publishedAt || new Date().toISOString().slice(0, 10)).slice(0, 20),
            featured: Boolean(item?.featured),
            status: item?.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'
          }))
        : DEFAULT_PUBLIC_SITE.news;

      const sanitizedFixtures = Array.isArray(incoming.fixtures)
        ? incoming.fixtures.slice(0, 60).map((fix: any, idx: number) => ({
            id: String(fix?.id || `fix-${Date.now()}-${idx}`).slice(0, 64),
            opponent: String(fix?.opponent || 'TBD').trim().slice(0, 100),
            competition: String(fix?.competition || 'Club Friendly').trim().slice(0, 80),
            date: String(fix?.date || '').trim().slice(0, 20),
            time: String(fix?.time || '16:00').trim().slice(0, 20),
            venue: String(fix?.venue || 'Basimbuzi Community Ground').trim().slice(0, 120),
            isHome: Boolean(fix?.isHome),
            status: allowedFixtureStatus.has(fix?.status) ? fix.status : 'UPCOMING',
            homeScore: fix?.homeScore !== undefined && fix?.homeScore !== '' ? Math.max(0, Number(fix.homeScore) || 0) : undefined,
            awayScore: fix?.awayScore !== undefined && fix?.awayScore !== '' ? Math.max(0, Number(fix.awayScore) || 0) : undefined,
            summary: fix?.summary ? String(fix.summary).trim().slice(0, 400) : undefined
          }))
        : DEFAULT_PUBLIC_SITE.fixtures;

      const sanitizedMerch = Array.isArray(incoming.merch)
        ? incoming.merch.slice(0, 20).map((m: any, idx: number) => ({
            id: String(m?.id || `merch-${Date.now()}-${idx}`).slice(0, 64),
            name: String(m?.name || 'Club Jersey').trim().slice(0, 100),
            priceUgx: Math.max(0, Number(m?.priceUgx) || 0),
            description: String(m?.description || '').trim().slice(0, 400),
            imageUrl: sanitizeMediaUrl(m?.imageUrl, 'preset:jersey'),
            sizes: Array.isArray(m?.sizes) && m.sizes.length > 0
              ? m.sizes.map((s: any) => String(s).trim().slice(0, 12)).filter(Boolean)
              : ['S', 'M', 'L', 'XL'],
            inStock: m?.inStock !== false
          }))
        : DEFAULT_PUBLIC_SITE.merch;

      const sanitizedContent = {
        heroHeadline: String(incoming.heroHeadline || DEFAULT_PUBLIC_SITE.heroHeadline).trim().slice(0, 180),
        heroSubheadline: String(incoming.heroSubheadline || DEFAULT_PUBLIC_SITE.heroSubheadline).trim().slice(0, 450),
        heroImageUrl: sanitizeMediaUrl(incoming.heroImageUrl, 'preset:hero'),
        aboutTitle: String(incoming.aboutTitle || DEFAULT_PUBLIC_SITE.aboutTitle).trim().slice(0, 160),
        aboutText: String(incoming.aboutText || DEFAULT_PUBLIC_SITE.aboutText).trim().slice(0, 2000),
        clubFoundedYear: String(incoming.clubFoundedYear || '2018').trim().slice(0, 10),
        homeGround: String(incoming.homeGround || 'Basimbuzi Community Ground').trim().slice(0, 120),
        trainingSchedule: String(incoming.trainingSchedule || 'Tue, Thu & Sat · 4:00 PM EAT').trim().slice(0, 120),
        membershipTargetLabel: String(incoming.membershipTargetLabel || '2026 Season Membership Contribution').trim().slice(0, 120),
        membershipTargetUgx: Math.max(0, Math.min(100000000, Number(incoming.membershipTargetUgx) || 0)),
        news: sanitizedNews,
        fixtures: sanitizedFixtures,
        merch: sanitizedMerch,
        updatedAt: new Date().toISOString(),
        updatedBy: operator.email
      };

      fs.writeFileSync(PUBLIC_SITE_FILE, JSON.stringify(sanitizedContent, null, 2), 'utf-8');
      res.json({ success: true, data: sanitizedContent });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to save public website content' });
    }
  });

  // API: Submit Public Supporter / Membership Inquiry
  app.post('/api/public-inquiries', (req, res) => {
    try {
      const { fullName, phone, email, interest, message } = req.body || {};
      const cleanName = String(fullName || '').trim();
      const cleanPhone = String(phone || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanMessage = String(message || '').trim();
      const allowedInterests = new Set(['Membership', 'Academy', 'Sponsorship', 'Merchandise', 'General']);

      if (cleanName.length < 2 || cleanName.length > 100) {
        res.status(400).json({ success: false, error: 'Please enter your full name.' });
        return;
      }
      if (cleanPhone.length < 7 || cleanPhone.length > 25) {
        res.status(400).json({ success: false, error: 'Please provide a valid phone or WhatsApp number.' });
        return;
      }
      if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
        res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
        return;
      }

      let current: any[] = [];
      if (fs.existsSync(INQUIRIES_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8'));
          current = Array.isArray(parsed) ? parsed : [];
        } catch {
          current = [];
        }
      }

      const newInquiry = {
        id: `inq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: cleanName,
        phone: cleanPhone,
        email: cleanEmail,
        interest: allowedInterests.has(interest) ? interest : 'Membership',
        message: cleanMessage.slice(0, 1000),
        createdAt: new Date().toISOString(),
        status: 'NEW'
      };

      const updated = [newInquiry, ...current].slice(0, 500);
      fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ success: true, data: newInquiry });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to submit inquiry' });
    }
  });

  // API: List Supporter Inquiries (Authenticated Website/Admin Staff Only)
  app.get('/api/public-inquiries', (req, res) => {
    try {
      const operator = getAuthorizedWebsiteOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized' });
        return;
      }
      let current: any[] = [];
      if (fs.existsSync(INQUIRIES_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8'));
          current = Array.isArray(parsed) ? parsed : [];
        } catch {
          current = [];
        }
      }
      res.json({ success: true, data: current });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to retrieve inquiries' });
    }
  });

  // API: Update Supporter Inquiry Status (Authenticated Website/Admin Staff Only)
  app.patch('/api/public-inquiries/:id', (req, res) => {
    try {
      const operator = getAuthorizedWebsiteOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const targetId = String(req.params.id || '').trim();
      const nextStatus = req.body?.status === 'CONTACTED' ? 'CONTACTED' : 'NEW';

      let current: any[] = [];
      if (fs.existsSync(INQUIRIES_FILE)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf-8'));
          current = Array.isArray(parsed) ? parsed : [];
        } catch {
          current = [];
        }
      }

      const idx = current.findIndex(item => item?.id === targetId);
      if (idx === -1) {
        res.status(404).json({ success: false, error: 'Inquiry not found' });
        return;
      }

      current[idx] = { ...current[idx], status: nextStatus };
      fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(current, null, 2), 'utf-8');
      res.json({ success: true, data: current[idx] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to update inquiry' });
    }
  });

  // API: Serve safely uploaded CMS images
  app.get('/uploads/:filename', (req, res) => {
    try {
      const rawName = String(req.params.filename || '').trim();
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(rawName)) {
        res.status(404).end();
        return;
      }
      const resolvedPath = path.resolve(UPLOADS_DIR, rawName);
      if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.sendFile(resolvedPath);
    } catch {
      res.status(404).end();
    }
  });

  // API: Upload Custom Image for CMS (OWNER, ADMIN, MEDIA only)
  app.post('/api/public-site/upload-image', (req, res) => {
    try {
      const operator = getAuthorizedWebsiteOperator(req);
      if (!operator) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized: Only active Owners, Admins, or Media Officers can upload club images.'
        });
        return;
      }

      const dataUrl = String(req.body?.dataUrl || '').trim();
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) {
        res.status(400).json({
          success: false,
          error: 'Please upload a valid PNG, JPG, WEBP, or GIF image.'
        });
        return;
      }

      const rawExt = match[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        res.status(400).json({
          success: false,
          error: 'Image must be smaller than 5 MB.'
        });
        return;
      }

      const safeFilename = `club-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const targetPath = path.resolve(UPLOADS_DIR, safeFilename);
      if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ success: false, error: 'Invalid file destination' });
        return;
      }

      fs.writeFileSync(targetPath, buffer);
      res.json({
        success: true,
        url: `/uploads/${safeFilename}`
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to save uploaded image' });
    }
  });

  // --- Member Self-Service Portal (/me) Auth & Scoped Payments ---

  const MEMBER_TOKEN_SECRET: Buffer = process.env.MEMBER_SESSION_SECRET
    ? Buffer.from(process.env.MEMBER_SESSION_SECRET, 'utf-8')
    : crypto.randomBytes(32);

  const memberOtpStore = new Map<
    string,
    { codeHash: string; expiresAt: number; attempts: number; lastSentAt: number; memberName: string }
  >();

  const getStaffEmailsList = (): string[] => {
    const users = readJsonArray(USERS_FILE);
    return users
      .map((u: any) => String(u?.email || '').trim().toLowerCase())
      .filter(Boolean);
  };

  const isPlaceholderMemberEmail = (email: string, payerName?: string): boolean => {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return true;
    const members = readJsonArray(MEMBERS_FILE);
    if (members.some((m: any) => String(m?.email || '').trim().toLowerCase() === clean)) {
      return false;
    }
    return isStaffOrPlaceholderEmail(clean, payerName, getStaffEmailsList());
  };

  const hashClaimToken = (token: string): string => {
    return crypto.createHash('sha256').update(token).digest('hex');
  };

  const readJsonArray = (filePath: string): any[] => {
    if (!fs.existsSync(filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeJsonArray = (filePath: string, data: any[]) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  };

  const readReconciliation = (): any => {
    if (fs.existsSync(RECONCILIATION_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(RECONCILIATION_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
    return {
      coveredReceiptNumbers: Array.from(PRE_CSV_COVERED_RECEIPT_SET),
      coveredAmountUgx: PRE_CSV_COVERED_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
      unrecordedReceipts: UNRECORDED_LIVE_GAS_RECEIPTS.map(r => r.receiptNumber),
      unrecordedAmountUgx: UNRECORDED_LIVE_GAS_RECEIPTS.reduce((s, r) => s + r.amount, 0),
      staffEmailsStripped: 0,
      realEmailsRecovered: 0,
      phonesRecovered: 0
    };
  };

  const getCoveredReceiptSet = (): Set<string> => {
    const rec = readReconciliation();
    const list = Array.isArray(rec?.coveredReceiptNumbers)
      ? rec.coveredReceiptNumbers
      : Array.from(PRE_CSV_COVERED_RECEIPT_SET);
    return new Set(list.map((r: unknown) => String(r || '').trim().toUpperCase()).filter(Boolean));
  };

  const runTreasuryReconciliation = () => {
    const members = readJsonArray(MEMBERS_FILE);
    const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
    const site = readPublicSiteContent();
    const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
    const nowIso = new Date().toISOString();

    let staffEmailsStripped = 0;
    let realEmailsRecovered = 0;
    let phonesRecovered = 0;

    // 1. Scrub any accidental staff/placeholder emails & normalize phones on existing members
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const rawEmail = String(m.email || '').trim().toLowerCase();
      if (rawEmail && isPlaceholderMemberEmail(rawEmail, m.name)) {
        m.email = '';
        staffEmailsStripped++;
      } else {
        m.email = rawEmail;
      }
      if (m.phone) {
        m.phone = cleanPhoneNumber(m.phone);
      }
    }

    const findMemberIdx = (csvId?: string, canonicalName?: string): number => {
      if (csvId) {
        const idxById = members.findIndex((m: any) => String(m.id || m.memberId) === csvId);
        if (idxById !== -1) return idxById;
      }
      if (canonicalName) {
        const targetKey = resolveCanonicalMemberNameKey(canonicalName);
        return members.findIndex((m: any) => resolveCanonicalMemberNameKey(m.name) === targetKey);
      }
      return -1;
    };

    // Track recovered SB-2026-* receipt references & clean contacts per CSV member (idempotent across runs)
    const reconciledRefsByMemberId = new Map<string, string[]>();
    const recoveredEmailSet = new Set<string>();
    const recoveredPhoneMemberSet = new Set<string>();

    // 2. Enrich CSV-covered members with real personal emails & phones (NEVER staff emails!)
    for (const item of PRE_CSV_COVERED_GAS_RECEIPTS) {
      const idx = findMemberIdx(item.csvMemberId, item.csvName);
      if (idx === -1) continue;
      const m = members[idx];

      if (item.realEmail && !isPlaceholderMemberEmail(item.realEmail, m.name)) {
        const cleanReal = item.realEmail.trim().toLowerCase();
        if (!m.email) {
          m.email = cleanReal;
        }
        if (m.email) {
          recoveredEmailSet.add(m.email);
        }
      }
      if (item.phone) {
        const cleanedPh = cleanPhoneNumber(item.phone);
        if (!m.phone && cleanedPh) {
          m.phone = cleanedPh;
        }
        if (m.phone) {
          recoveredPhoneMemberSet.add(String(m.id || m.name));
        }
      }
      m.profileStatus = isMemberProfileComplete(m) ? 'COMPLETE' : 'INCOMPLETE';
      m.updatedAt = nowIso;

      const list = reconciledRefsByMemberId.get(String(m.id)) || [];
      if (!list.includes(item.receiptNumber)) list.push(item.receiptNumber);
      reconciledRefsByMemberId.set(String(m.id), list);
    }

    // 3. Ensure unrecorded live GAS payers exist in directory cleanly (no historical double-count)
    for (const item of UNRECORDED_LIVE_GAS_RECEIPTS) {
      const idx = findMemberIdx(item.targetCsvMemberId, item.targetCanonicalName);
      if (idx !== -1) {
        const m = members[idx];
        if (item.phone && !m.phone) {
          m.phone = cleanPhoneNumber(item.phone);
        }
        if (m.phone) {
          recoveredPhoneMemberSet.add(String(m.id || m.name));
        }
        m.profileStatus = isMemberProfileComplete(m) ? 'COMPLETE' : 'INCOMPLETE';
        m.updatedAt = nowIso;
      } else {
        const nextNum = members.length + 1;
        const newId = `SB-M-${String(nextNum).padStart(4, '0')}`;
        const cleanPh = cleanPhoneNumber(item.phone);
        if (cleanPh) recoveredPhoneMemberSet.add(newId);
        members.push({
          id: newId,
          memberId: newId,
          name: item.targetCanonicalName,
          phone: cleanPh,
          email: '',
          address: '',
          gender: '',
          school: '',
          house: '',
          preNllPaid: 0,
          spotPaid: 0,
          paidAfter: 0,
          historicalPaid: 0,
          livePaid: item.amount,
          totalContributed: item.amount,
          expectedTargetUgx: defaultTargetUgx,
          remainingUgx: defaultTargetUgx > 0 ? Math.max(0, defaultTargetUgx - item.amount) : 0,
          duesStatus: computeDuesStatus(item.amount, defaultTargetUgx),
          profileStatus: 'INCOMPLETE',
          paymentCount: 1,
          lastPaymentDate: '2026-10-21',
          lastPurpose: 'Membership',
          source: 'LIVE_RECEIPT',
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
    }

    realEmailsRecovered = recoveredEmailSet.size;
    phonesRecovered = recoveredPhoneMemberSet.size;

    // 4. Propagate cleaned real contacts & reconciled GAS receipt refs to historical transactions
    const memberById = new Map<string, any>();
    for (const m of members) {
      memberById.set(String(m.id || m.memberId), m);
    }

    // Map primary -AFTER receipt first per member so original SB-2026-* references are searchable
    const stampedMembers = new Set<string>();
    for (const tx of histTxs) {
      const mid = String(tx.memberId || '');
      const owner = memberById.get(mid);
      const rawTxEmail = String(tx.email || '').trim().toLowerCase();
      if (rawTxEmail && isPlaceholderMemberEmail(rawTxEmail, tx.payerName)) {
        tx.email = '';
        tx.emailStatus = 'NOT_PROVIDED';
        staffEmailsStripped++;
      }
      if (owner) {
        tx.email = owner.email && !isPlaceholderMemberEmail(owner.email, owner.name) ? owner.email : '';
        tx.phone = cleanPhoneNumber(owner.phone || tx.phone || '');
        tx.emailStatus = tx.email ? 'SKIPPED' : 'NOT_PROVIDED';

        const refs = reconciledRefsByMemberId.get(mid);
        const recNo = String(tx.receiptNumber || '');
        if (refs && refs.length > 0 && !stampedMembers.has(mid) && (recNo.endsWith('-AFTER') || recNo.endsWith('-SPOT') || recNo.endsWith('-PRE'))) {
          const refLabel = `GAS Receipt: ${refs.join(', ')}`;
          if (!String(tx.paymentReference || '').includes('SB-2026-')) {
            tx.paymentReference = tx.paymentReference ? `${tx.paymentReference} · ${refLabel}` : refLabel;
          }
          if (!String(tx.notes || '').includes('SB-2026-')) {
            tx.notes = tx.notes ? `${tx.notes} · Reconciled ${refs.join(', ')} (no double-count)` : `Reconciled ${refs.join(', ')} (no double-count)`;
          }
          stampedMembers.add(mid);
        }
      }
    }

    const coveredList = PRE_CSV_COVERED_GAS_RECEIPTS.map(r => r.receiptNumber.toUpperCase());
    const reconciliationSummary = {
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
      staffEmailsStripped,
      realEmailsRecovered,
      phonesRecovered,
      reconciledAt: nowIso
    };

    writeJsonArray(MEMBERS_FILE, members);
    writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
    fs.writeFileSync(RECONCILIATION_FILE, JSON.stringify(reconciliationSummary, null, 2), 'utf-8');
    return reconciliationSummary;
  };

  const ensureTreasurySeeded = () => {
    const existingMembers = readJsonArray(MEMBERS_FILE);
    const existingHist = readJsonArray(HISTORICAL_TXS_FILE);
    if (existingMembers.length === 0 || existingHist.length === 0) {
      if (fs.existsSync(BUNDLED_TREASURY_CSV)) {
        try {
          const site = readPublicSiteContent();
          const csvText = fs.readFileSync(BUNDLED_TREASURY_CSV, 'utf-8');
          const parsed = parseTreasuryMembersCsv(csvText, {
            defaultTargetUgx: Number(site.membershipTargetUgx) || 100000
          });
          if (parsed.members.length > 0) {
            if (existingMembers.length === 0) {
              writeJsonArray(MEMBERS_FILE, parsed.members);
            }
            if (existingHist.length === 0) {
              writeJsonArray(HISTORICAL_TXS_FILE, parsed.historicalTransactions);
            }
          }
        } catch (err) {
          console.warn('Could not auto-seed Treasury CSV:', err);
        }
      }
    }
    if (!fs.existsSync(RECONCILIATION_FILE) && readJsonArray(MEMBERS_FILE).length > 0) {
      try {
        runTreasuryReconciliation();
      } catch (err) {
        console.warn('Could not run initial treasury reconciliation:', err);
      }
    }
  };

  ensureTreasurySeeded();

  const getAuthorizedFinanceOperator = (
    req: express.Request
  ): { email: string; name: string; role: string; permissions?: Record<string, any> } | null => {
    const headerEmail = String(req.headers['x-operator-email'] || '').trim().toLowerCase();
    if (!headerEmail || !EMAIL_REGEX.test(headerEmail)) return null;

    if (headerEmail === SYSTEM_OWNER_EMAIL.toLowerCase()) {
      return { email: headerEmail, name: 'Nagaba Passion', role: 'OWNER' };
    }

    const users = readJsonArray(USERS_FILE);
    const match = users.find(
      (u: any) => String(u?.email || '').trim().toLowerCase() === headerEmail && u?.status === 'ACTIVE'
    );
    if (!match) return null;

    const role = String(match.role || '').toUpperCase();
    const allowed =
      role === 'OWNER' ||
      role === 'ADMIN' ||
      role === 'ISSUER' ||
      match?.permissions?.canIssueReceipts === true ||
      match?.permissions?.canViewReports === true;

    return allowed
      ? { email: headerEmail, name: String(match.name || headerEmail), role, permissions: match.permissions }
      : null;
  };

  const sanitizeMemberForClient = (m: any, defaultTargetUgx: number) => {
    const preNllPaid = Math.max(0, Number(m.preNllPaid) || 0);
    const spotPaid = Math.max(0, Number(m.spotPaid) || 0);
    const paidAfter = Math.max(0, Number(m.paidAfter) || 0);
    const historicalPaid = Math.max(0, Number(m.historicalPaid ?? m.totalContributed) || 0);
    const livePaid = Math.max(0, Number(m.livePaid) || 0);
    const totalContributed = historicalPaid + livePaid;
    const expectedTargetUgx = Math.max(0, Number(m.expectedTargetUgx ?? defaultTargetUgx) || 0);
    const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalContributed) : 0;
    const cleanSchool = normalizeMemberSchool(m.school);
    const cleanHouse = normalizeMemberHouse(m.house, cleanSchool);

    const cleanMember = {
      id: String(m.id || m.memberId || ''),
      memberId: String(m.memberId || m.id || ''),
      name: String(m.name || '').trim(),
      phone: cleanPhoneNumber(m.phone || ''),
      email: String(m.email || '').trim().toLowerCase(),
      address: String(m.address || '').trim(),
      gender: normalizeMemberGender(m.gender),
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
      hasActiveClaimLink: Boolean(m.claimTokenHash && Number(m.claimTokenExpiresAt) > Date.now()),
      claimLinkExpiresAt: m.claimTokenExpiresAt ? new Date(Number(m.claimTokenExpiresAt)).toISOString() : undefined,
      createdAt: String(m.createdAt || ''),
      updatedAt: String(m.updatedAt || '')
    };

    return cleanMember;
  };

  const prepareTxForGas = (tx: any) => {
    const cleanEm = isPlaceholderMemberEmail(tx?.email, tx?.payerName)
      ? ''
      : String(tx?.email || '').trim().toLowerCase();
    return {
      ...tx,
      email: cleanEm,
      phone: cleanPhoneNumber(tx?.phone || ''),
      emailStatus: cleanEm ? (tx?.emailStatus || 'SKIPPED') : 'NOT_PROVIDED'
    };
  };

  const prepareMemberForGas = (m: any, defaultTargetUgx: number) => {
    const sanitized = sanitizeMemberForClient(m, defaultTargetUgx);
    return {
      ...sanitized,
      email: isPlaceholderMemberEmail(sanitized.email, sanitized.name) ? '' : sanitized.email,
      phone: cleanPhoneNumber(sanitized.phone || '')
    };
  };

  const fetchGasMembersCached = async (force: boolean = false): Promise<any[] | null> => {
    const gasUrl = getGasUrl();
    if (!gasUrl) return null;

    if (
      !force &&
      gasMembersCache &&
      gasMembersCache.gasUrl === gasUrl &&
      Date.now() - gasMembersCache.ts < GAS_TX_CACHE_TTL_MS
    ) {
      return gasMembersCache.data;
    }

    if (!force && gasMembersInFlight) {
      return gasMembersInFlight;
    }

    gasMembersInFlight = (async () => {
      try {
        const url = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=getMemberDirectory&operatorEmail=${encodeURIComponent(SYSTEM_OWNER_EMAIL)}`;
        const gasRes = await fetch(url, { redirect: 'follow' }).then(r => r.json()).catch(() => null);
        if (gasRes && gasRes.success && Array.isArray(gasRes.data)) {
          gasMembersCache = { ts: Date.now(), gasUrl, data: gasRes.data };
          return gasRes.data;
        }
        return null;
      } catch {
        return null;
      } finally {
        gasMembersInFlight = null;
      }
    })();

    return gasMembersInFlight;
  };

  const syncMembersFromGasDirectory = async (force: boolean = false): Promise<boolean> => {
    try {
      ensureTreasurySeeded();
      const remoteMembers = await fetchGasMembersCached(force);
      if (!remoteMembers || remoteMembers.length === 0) return false;

      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const localMembers = readJsonArray(MEMBERS_FILE);
      const staffEmails = getStaffEmailsList();
      const result = mergeMemberDirectories(localMembers, remoteMembers, defaultTargetUgx, staffEmails);

      if (!result.changed) return false;

      writeJsonArray(MEMBERS_FILE, result.members);

      if (result.contactUpdatedMemberIds.length > 0) {
        const updatedSet = new Set(result.contactUpdatedMemberIds);
        const byId = new Map<string, any>();
        for (const m of result.members) {
          const mid = String(m.id || m.memberId || '').trim();
          if (mid && updatedSet.has(mid)) byId.set(mid, m);
        }
        const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
        let histChanged = false;
        for (const tx of histTxs) {
          const owner = byId.get(String(tx?.memberId || '').trim());
          if (owner) {
            const cleanEm = isPlaceholderMemberEmail(owner.email, owner.name) ? '' : String(owner.email || '').trim().toLowerCase();
            tx.payerName = String(owner.name || tx.payerName || '').trim();
            tx.email = cleanEm;
            tx.phone = cleanPhoneNumber(owner.phone || tx.phone || '');
            tx.emailStatus = cleanEm ? 'SKIPPED' : 'NOT_PROVIDED';
            histChanged = true;
          }
        }
        if (histChanged) {
          writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
        }
      }

      return true;
    } catch {
      return false;
    }
  };

  const pushMembersAndHistoricalToGas = async (
    operatorEmail: string,
    overrideTransactions?: any[],
    skipRemotePreMerge: boolean = false
  ): Promise<{ synced: boolean; error?: string }> => {
    const gasUrl = getGasUrl();
    if (!gasUrl) return { synced: false };

    try {
      if (!skipRemotePreMerge) {
        await syncMembersFromGasDirectory(true);
      }
      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const members = readJsonArray(MEMBERS_FILE).map((m: any) => prepareMemberForGas(m, defaultTargetUgx));
      const rawTxs = Array.isArray(overrideTransactions)
        ? overrideTransactions
        : readJsonArray(HISTORICAL_TXS_FILE);
      const histTxs = rawTxs.map(prepareTxForGas);

      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: JSON.stringify({
          action: 'syncMembersAndHistorical',
          operatorEmail: String(operatorEmail || SYSTEM_OWNER_EMAIL).trim().toLowerCase(),
          members,
          transactions: histTxs,
          overwriteExisting: true
        })
      }).then(r => r.json()).catch(() => null);

      if (res && res.success) {
        invalidateGasTxCache();
        return { synced: true };
      }
      return { synced: false, error: res?.error || 'Google Sheets sync did not acknowledge update.' };
    } catch (err: any) {
      return { synced: false, error: err?.message || 'Google Sheets sync failed.' };
    }
  };

  const pushSingleMemberToGas = async (
    member: any,
    operatorEmail: string,
    affectedHistTxs: any[] = []
  ): Promise<{ synced: boolean; error?: string }> => {
    const gasUrl = getGasUrl();
    if (!gasUrl) return { synced: false };

    try {
      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const cleanMember = prepareMemberForGas(member, defaultTargetUgx);
      const cleanTxs = affectedHistTxs.map(prepareTxForGas);
      const cleanOp = String(operatorEmail || SYSTEM_OWNER_EMAIL).trim().toLowerCase();

      if (gasSupportsUpsertMember !== false) {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow',
          body: JSON.stringify({
            action: 'upsertMember',
            operatorEmail: cleanOp,
            member: cleanMember,
            transactions: cleanTxs
          })
        }).then(r => r.json()).catch(() => null);

        if (res && res.success) {
          gasSupportsUpsertMember = true;
          invalidateGasTxCache();
          return { synced: true };
        }
        const errMsg = String(res?.error || '');
        if (!errMsg.toLowerCase().includes('unknown')) {
          return { synced: false, error: errMsg || 'Google Sheets sync did not acknowledge update.' };
        }
        gasSupportsUpsertMember = false;
      }

      // Backward-compatible fallback for older GAS deployments: preserve newest remote edits first, then push
      return await pushMembersAndHistoricalToGas(cleanOp, cleanTxs);
    } catch (err: any) {
      return { synced: false, error: err?.message || 'Google Sheets sync failed.' };
    }
  };

  // --- Admin Finance Staff: Historical Transactions & Member Directory APIs ---

  app.get('/api/historical-transactions', (req, res) => {
    const operator = getAuthorizedFinanceOperator(req);
    if (!operator) {
      res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
      return;
    }
    ensureTreasurySeeded();
    const list = readJsonArray(HISTORICAL_TXS_FILE).map((tx: any) => ({
      ...tx,
      email: isPlaceholderMemberEmail(tx?.email, tx?.payerName) ? '' : String(tx?.email || '').trim().toLowerCase(),
      phone: cleanPhoneNumber(tx?.phone || '')
    }));
    const reconciliation = readReconciliation();
    res.json({
      success: true,
      data: list,
      coveredGasReceipts: Array.isArray(reconciliation?.coveredReceiptNumbers)
        ? reconciliation.coveredReceiptNumbers
        : Array.from(PRE_CSV_COVERED_RECEIPT_SET),
      reconciliation
    });
  });

  app.delete('/api/historical-transactions/:receiptNumber', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }
      const canDelete =
        operator.role === 'OWNER' ||
        operator.permissions?.canDeleteTransactions === true ||
        (operator.role === 'ADMIN' && operator.permissions?.canDeleteTransactions !== false);
      if (!canDelete) {
        res.status(403).json({ success: false, error: 'Permission denied. Cannot delete historical transactions.' });
        return;
      }

      const targetRec = String(req.params.receiptNumber || '').trim().toUpperCase();
      if (!targetRec) {
        res.status(400).json({ success: false, error: 'Receipt number is required.' });
        return;
      }

      ensureTreasurySeeded();
      const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
      const targetTx = histTxs.find((t: any) => String(t?.receiptNumber || '').trim().toUpperCase() === targetRec);
      if (!targetTx) {
        res.status(404).json({ success: false, error: `Historical receipt ${targetRec} not found.` });
        return;
      }

      const remainingHist = histTxs.filter((t: any) => String(t?.receiptNumber || '').trim().toUpperCase() !== targetRec);
      writeJsonArray(HISTORICAL_TXS_FILE, remainingHist);

      // Recompute member's historical sums cleanly from remaining historical transactions
      const affectedMemberId = String(targetTx.memberId || '').trim();
      if (affectedMemberId) {
        const members = readJsonArray(MEMBERS_FILE);
        const mIdx = members.findIndex((m: any) => String(m?.id || m?.memberId || '') === affectedMemberId);
        if (mIdx !== -1) {
          const memberTxs = remainingHist.filter((t: any) => String(t?.memberId || '') === affectedMemberId);
          let pre = 0;
          let spot = 0;
          let after = 0;
          for (const mtx of memberTxs) {
            const amt = Math.max(0, Number(mtx?.amount) || 0);
            const rNo = String(mtx?.receiptNumber || '').toUpperCase();
            if (rNo.endsWith('-PRE')) pre += amt;
            else if (rNo.endsWith('-SPOT')) spot += amt;
            else after += amt;
          }
          const newHist = pre + spot + after;
          const livePaid = Math.max(0, Number(members[mIdx].livePaid) || 0);
          members[mIdx] = {
            ...members[mIdx],
            preNllPaid: pre,
            spotPaid: spot,
            paidAfter: after,
            historicalPaid: newHist,
            totalContributed: newHist + livePaid,
            updatedAt: new Date().toISOString()
          };
          writeJsonArray(MEMBERS_FILE, members);
        }
      }

      const sheetsResult = await pushMembersAndHistoricalToGas(operator.email);
      res.json({
        success: true,
        message: `Removed historical receipt ${targetRec}.`,
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to delete historical transaction.' });
    }
  });

  app.post('/api/admin/members/reconcile-ledger', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }
      ensureTreasurySeeded();
      const summary = runTreasuryReconciliation();
      const sheetsResult = await pushMembersAndHistoricalToGas(operator.email);
      res.json({
        success: true,
        message: `Cleaned & reconciled ledger: ${summary.coveredReceiptCount} pre-CSV live receipts deduplicated (${summary.coveredAmountUgx.toLocaleString()} UGX), ${summary.realEmailsRecovered} real emails & ${summary.phonesRecovered} phones recovered, zero staff emails attached.`,
        data: summary,
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to reconcile ledger data.' });
    }
  });

  app.get('/api/admin/members', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      ensureTreasurySeeded();
      const [, cachedGasRows] = await Promise.all([
        syncMembersFromGasDirectory(false),
        fetchGasTransactionsCached(false)
      ]);
      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const rawMembers = readJsonArray(MEMBERS_FILE);
      const historicalTxs = readJsonArray(HISTORICAL_TXS_FILE);
      const submissions = readJsonArray(SUBMISSIONS_FILE);
      const coveredSet = getCoveredReceiptSet();
      const reconciliation = readReconciliation();

      // Index existing members by clean email & normalized canonical name so unrecorded live receipts link cleanly
      const memberIdxByEmail = new Map<string, number>();
      const memberIdxByCanonicalName = new Map<string, number>();
      rawMembers.forEach((m: any, idx: number) => {
        const cleanEm = isPlaceholderMemberEmail(m.email, m.name) ? '' : String(m.email).trim().toLowerCase();
        if (cleanEm) memberIdxByEmail.set(cleanEm, idx);
        const key = resolveCanonicalMemberNameKey(m.name);
        if (key && !memberIdxByCanonicalName.has(key)) {
          memberIdxByCanonicalName.set(key, idx);
        }
      });

      const liveByMemberIdx = new Map<number, { amount: number; count: number; phone: string; email: string; lastDate: string; lastPurpose: string }>();
      const newUnregisteredLiveMembers: any[] = [];
      let gasConnectedForLive = false;

      if (cachedGasRows && cachedGasRows.length > 0) {
        gasConnectedForLive = true;
        const histIds = new Set(
          historicalTxs.map((t: any) => String(t?.receiptNumber || '').trim().toUpperCase())
        );
        for (const tx of cachedGasRows) {
          const rec = String(tx?.receiptNumber || '').trim().toUpperCase();
          const type = String(tx?.type || 'INFLOW').toUpperCase();
          const status = String(tx?.paymentStatus || 'COMPLETED').toUpperCase();
          if (type === 'OUTFLOW' || rec.startsWith('EXP-') || status === 'CANCELLED') continue;
          // CRITICAL: Skip HIST-* IDs AND all reconciled CSV-covered SB-2026-* receipts (zero double-counting!)
          if (rec.startsWith('HIST-') || histIds.has(rec) || coveredSet.has(rec)) continue;

          const amt = Math.max(0, Number(tx?.amount) || 0);
          const payerName = String(tx?.payerName || '').trim();
          const cleanEm = isPlaceholderMemberEmail(tx?.email, payerName) ? '' : String(tx?.email || '').trim().toLowerCase();
          const cleanPh = cleanPhoneNumber(tx?.phone || '');
          const canonKey = resolveCanonicalMemberNameKey(payerName);

          const targetIdx =
            (cleanEm ? memberIdxByEmail.get(cleanEm) : undefined) ??
            (canonKey ? memberIdxByCanonicalName.get(canonKey) : undefined);

          if (targetIdx !== undefined) {
            const cur = liveByMemberIdx.get(targetIdx) || {
              amount: 0,
              count: 0,
              phone: '',
              email: '',
              lastDate: '',
              lastPurpose: ''
            };
            cur.amount += amt;
            cur.count += 1;
            if (!cur.phone && cleanPh) cur.phone = cleanPh;
            if (!cur.email && cleanEm) cur.email = cleanEm;
            if (tx?.date && (!cur.lastDate || String(tx.date) > cur.lastDate)) {
              cur.lastDate = String(tx.date);
              cur.lastPurpose = String(tx?.paymentPurpose || cur.lastPurpose);
            }
            liveByMemberIdx.set(targetIdx, cur);
          } else if (payerName) {
            const newIdx = newUnregisteredLiveMembers.findIndex(
              nm => resolveCanonicalMemberNameKey(nm.name) === canonKey
            );
            if (newIdx !== -1) {
              newUnregisteredLiveMembers[newIdx].livePaid += amt;
              newUnregisteredLiveMembers[newIdx].paymentCount += 1;
              if (!newUnregisteredLiveMembers[newIdx].phone && cleanPh) newUnregisteredLiveMembers[newIdx].phone = cleanPh;
              if (!newUnregisteredLiveMembers[newIdx].email && cleanEm) newUnregisteredLiveMembers[newIdx].email = cleanEm;
            } else {
              newUnregisteredLiveMembers.push({
                id: `SB-LIVE-${String(newUnregisteredLiveMembers.length + 1).padStart(4, '0')}`,
                memberId: `SB-LIVE-${String(newUnregisteredLiveMembers.length + 1).padStart(4, '0')}`,
                name: payerName,
                phone: cleanPh,
                email: cleanEm,
                address: '',
                gender: '',
                school: '',
                house: '',
                preNllPaid: 0,
                spotPaid: 0,
                paidAfter: 0,
                historicalPaid: 0,
                livePaid: amt,
                expectedTargetUgx: defaultTargetUgx,
                paymentCount: 1,
                lastPaymentDate: String(tx?.date || ''),
                lastPurpose: String(tx?.paymentPurpose || 'Membership'),
                source: 'LIVE_RECEIPT',
                createdAt: String(tx?.createdAt || new Date().toISOString()),
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      }

      const members = rawMembers.map((m: any, idx: number) => {
        const liveInfo = liveByMemberIdx.get(idx);
        const liveExtra = liveInfo
          ? liveInfo.amount
          : gasConnectedForLive
          ? 0
          : Math.max(0, Number(m.livePaid) || 0);
        const baseCount = m.source === 'LIVE_RECEIPT' && gasConnectedForLive ? 0 : (Number(m.paymentCount) || 0);
        const enriched = {
          ...m,
          email: String(m.email || '').trim().toLowerCase(),
          phone: cleanPhoneNumber(m.phone || liveInfo?.phone || ''),
          livePaid: liveExtra,
          paymentCount: baseCount + (liveInfo?.count || 0),
          lastPaymentDate: liveInfo?.lastDate && (!m.lastPaymentDate || liveInfo.lastDate > m.lastPaymentDate)
            ? liveInfo.lastDate
            : m.lastPaymentDate,
          lastPurpose: liveInfo?.lastPurpose || m.lastPurpose
        };
        return sanitizeMemberForClient(enriched, defaultTargetUgx);
      });

      for (const extra of newUnregisteredLiveMembers) {
        members.push(sanitizeMemberForClient(extra, defaultTargetUgx));
      }

      const pendingCount = submissions.filter((s: any) => s?.status === 'PENDING').length;
      const summary = {
        totalMembers: members.length,
        completeProfiles: members.filter(m => m.profileStatus === 'COMPLETE').length,
        incompleteProfiles: members.filter(m => m.profileStatus === 'INCOMPLETE').length,
        missingEmailCount: members.filter(m => !m.email).length,
        missingPhoneCount: members.filter(m => !m.phone).length,
        preNllSum: members.reduce((acc, m) => acc + m.preNllPaid, 0),
        spotSum: members.reduce((acc, m) => acc + m.spotPaid, 0),
        paidAfterSum: members.reduce((acc, m) => acc + m.paidAfter, 0),
        historicalTotalSum: members.reduce((acc, m) => acc + m.historicalPaid, 0),
        combinedTotalSum: members.reduce((acc, m) => acc + (m.totalContributed || 0), 0),
        pendingSubmissions: pendingCount
      };

      res.json({
        success: true,
        data: {
          members,
          submissions,
          summary,
          reconciliation
        }
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to load club members directory.' });
    }
  });

  // Create or update a single member record (Admin staff only, duplicate-email enforced)
  app.post('/api/admin/members', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      const incoming = req.body?.member;
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid member payload.' });
        return;
      }

      const cleanName = String(incoming.name || '').trim().slice(0, 120);
      if (cleanName.length < 2) {
        res.status(400).json({ success: false, error: 'Member full name is required.' });
        return;
      }

      const cleanEmail = String(incoming.email || '').trim().toLowerCase().slice(0, 120);
      if (cleanEmail && (!EMAIL_REGEX.test(cleanEmail) || isPlaceholderMemberEmail(cleanEmail))) {
        res.status(400).json({ success: false, error: 'Please enter a valid email address or leave blank.' });
        return;
      }

      const cleanPhone = cleanPhoneNumber(String(incoming.phone || '').trim().slice(0, 30));
      const cleanAddress = String(incoming.address || '').trim().slice(0, 200);
      const cleanGender = normalizeMemberGender(incoming.gender);
      const cleanSchool = normalizeMemberSchool(incoming.school, incoming.otherSchool);
      const cleanHouse = normalizeMemberHouse(incoming.house, cleanSchool);
      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);

      const members = readJsonArray(MEMBERS_FILE);
      const targetId = String(incoming.id || incoming.memberId || '').trim();
      let existingIdx = -1;
      if (targetId && !targetId.toUpperCase().startsWith('SB-LIVE-')) {
        existingIdx = members.findIndex(
          (m: any) =>
            String(m.id || '').trim().toLowerCase() === targetId.toLowerCase() ||
            String(m.memberId || '').trim().toLowerCase() === targetId.toLowerCase()
        );
      }
      if (existingIdx === -1 && cleanName) {
        const cleanCanonKey = resolveCanonicalMemberNameKey(cleanName);
        const cleanIncomingName = normalizePersonName(cleanName);
        existingIdx = members.findIndex(
          (m: any) =>
            (cleanCanonKey && resolveCanonicalMemberNameKey(m.name) === cleanCanonKey) ||
            normalizePersonName(m.name) === cleanIncomingName
        );
      }
      if (existingIdx === -1 && cleanEmail) {
        existingIdx = members.findIndex((m: any) => String(m.email || '').trim().toLowerCase() === cleanEmail);
      }

      if (cleanEmail) {
        const duplicate = members.find(
          (m: any, idx: number) => idx !== existingIdx && String(m?.email || '').trim().toLowerCase() === cleanEmail
        );
        if (duplicate) {
          res.status(409).json({
            success: false,
            error: `Duplicate email conflict: "${cleanEmail}" is already assigned to ${duplicate.name} (${duplicate.id}).`
          });
          return;
        }
      }

      const nowIso = new Date().toISOString();

      if (existingIdx !== -1) {
        const { tier: _dropLegacyTier, ...current } = members[existingIdx] || {};
        const nextExpected =
          incoming.expectedTargetUgx !== undefined && Number(incoming.expectedTargetUgx) >= 0
            ? Number(incoming.expectedTargetUgx)
            : current.expectedTargetUgx ?? defaultTargetUgx;
        const histPaid = Math.max(0, Number(current.historicalPaid ?? current.totalContributed) || 0);
        const livePaid = Math.max(0, Number(current.livePaid) || 0);
        const totalContributed = histPaid + livePaid;
        const nextGender = incoming.gender !== undefined ? cleanGender : normalizeMemberGender(current.gender);
        const nextSchool = incoming.school !== undefined ? cleanSchool : normalizeMemberSchool(current.school);
        const nextHouse = isHouseEligibleSchool(nextSchool)
          ? (incoming.house !== undefined ? cleanHouse : normalizeMemberHouse(current.house, nextSchool))
          : '';
        const updatedRecord = {
          ...current,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          address: cleanAddress,
          gender: nextGender,
          school: nextSchool,
          house: nextHouse,
          expectedTargetUgx: nextExpected,
          totalContributed,
          remainingUgx: nextExpected > 0 ? Math.max(0, nextExpected - totalContributed) : 0,
          duesStatus: computeDuesStatus(totalContributed, nextExpected),
          profileStatus: isMemberProfileComplete({
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            address: cleanAddress
          })
            ? 'COMPLETE'
            : 'INCOMPLETE',
          updatedAt: nowIso
        };
        members[existingIdx] = updatedRecord;
        writeJsonArray(MEMBERS_FILE, members);

        // Propagate cleaned email/phone/name ONLY to this member's historical ledger transactions
        const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
        const affectedHistTxs: any[] = [];
        let histChanged = false;
        for (const tx of histTxs) {
          if (tx.memberId === updatedRecord.id) {
            tx.payerName = cleanName;
            tx.email = cleanEmail;
            tx.phone = cleanPhone;
            tx.emailStatus = cleanEmail ? 'SKIPPED' : 'NOT_PROVIDED';
            affectedHistTxs.push(tx);
            histChanged = true;
          }
        }
        if (histChanged) {
          writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
        }

        const sheetsResult = await pushSingleMemberToGas(updatedRecord, operator.email, affectedHistTxs);
        res.json({
          success: true,
          data: sanitizeMemberForClient(updatedRecord, defaultTargetUgx),
          sheetsSynced: sheetsResult.synced,
          sheetsError: sheetsResult.error
        });
        return;
      }

      const nextSeq = members.length + 1;
      const newId = `SB-M-${String(nextSeq).padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const newRecord = {
        id: newId,
        memberId: newId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        address: cleanAddress,
        gender: cleanGender,
        school: cleanSchool,
        house: cleanHouse,
        preNllPaid: 0,
        spotPaid: 0,
        paidAfter: 0,
        historicalPaid: 0,
        livePaid: 0,
        totalContributed: 0,
        expectedTargetUgx:
          incoming.expectedTargetUgx !== undefined && Number(incoming.expectedTargetUgx) >= 0
            ? Number(incoming.expectedTargetUgx)
            : defaultTargetUgx,
        profileStatus: isMemberProfileComplete({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          address: cleanAddress
        })
          ? 'COMPLETE'
          : 'INCOMPLETE',
        paymentCount: 0,
        lastPaymentDate: '',
        lastPurpose: '',
        source: 'MANUAL',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      members.unshift(newRecord);
      writeJsonArray(MEMBERS_FILE, members);
      const sheetsResult = await pushSingleMemberToGas(newRecord, operator.email, []);
      res.json({
        success: true,
        data: sanitizeMemberForClient(newRecord, defaultTargetUgx),
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to save member profile.' });
    }
  });

  // Upload or Re-Import CSV Idempotently (Admin staff only)
  app.post('/api/admin/members/import-csv', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      const useBundled = Boolean(req.body?.useBundledTreasuryCsv);
      let csvText = '';
      if (useBundled) {
        if (!fs.existsSync(BUNDLED_TREASURY_CSV)) {
          res.status(404).json({ success: false, error: 'Bundled Treasury CSV report file not found on server.' });
          return;
        }
        csvText = fs.readFileSync(BUNDLED_TREASURY_CSV, 'utf-8');
      } else {
        csvText = String(req.body?.csvText || '');
      }

      if (!csvText.trim() || csvText.length > 2 * 1024 * 1024) {
        res.status(400).json({ success: false, error: 'Please provide a valid CSV file under 2 MB.' });
        return;
      }

      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const parsed = parseTreasuryMembersCsv(csvText, { defaultTargetUgx });

      if (parsed.members.length === 0) {
        res.status(400).json({
          success: false,
          error: parsed.summary.warnings[0] || 'No member rows were found in that CSV.'
        });
        return;
      }

      if (parsed.members.length > 2000) {
        res.status(400).json({ success: false, error: 'Maximum 2,000 rows per CSV import.' });
        return;
      }

      const existingMembers = readJsonArray(MEMBERS_FILE);
      const memberById = new Map<string, any>();
      const memberByCanonicalName = new Map<string, any>();
      for (const m of existingMembers) {
        if (m?.id) memberById.set(String(m.id), m);
        if (m?.name) {
          const canonKey = resolveCanonicalMemberNameKey(m.name);
          if (canonKey && !memberByCanonicalName.has(canonKey)) {
            memberByCanonicalName.set(canonKey, m);
          }
        }
      }

      let addedCount = 0;
      let updatedCount = 0;
      const mergedMembers: any[] = [];
      const seenIds = new Set<string>();

      for (const imported of parsed.members) {
        const canonImported = resolveCanonicalMemberNameKey(imported.name);
        const existing =
          (imported.id ? memberById.get(imported.id) : undefined) ||
          (canonImported ? memberByCanonicalName.get(canonImported) : undefined);

        if (existing) {
          updatedCount++;
          const mergedEmail = imported.email || existing.email || '';
          const mergedPhone = cleanPhoneNumber(imported.phone || existing.phone || '');
          const mergedAddress = imported.address || existing.address || '';
          const mergedGender = normalizeMemberGender(existing.gender || imported.gender);
          const mergedSchool = normalizeMemberSchool(existing.school || imported.school);
          const mergedHouse = normalizeMemberHouse(existing.house || imported.house, mergedSchool);
          const preservedLivePaid = Math.max(0, Number(existing.livePaid) || 0);
          const nextTotal = imported.historicalPaid + preservedLivePaid;
          const updated = {
            ...existing,
            preNllPaid: imported.preNllPaid,
            spotPaid: imported.spotPaid,
            paidAfter: imported.paidAfter,
            historicalPaid: imported.historicalPaid,
            livePaid: preservedLivePaid,
            totalContributed: nextTotal,
            email: mergedEmail,
            phone: mergedPhone,
            address: mergedAddress,
            gender: mergedGender,
            school: mergedSchool,
            house: mergedHouse,
            profileStatus: isMemberProfileComplete({
              name: existing.name,
              email: mergedEmail,
              phone: mergedPhone,
              address: mergedAddress
            })
              ? 'COMPLETE'
              : 'INCOMPLETE',
            updatedAt: new Date().toISOString()
          };
          mergedMembers.push(updated);
          seenIds.add(String(updated.id));
        } else {
          addedCount++;
          mergedMembers.push(imported);
          seenIds.add(String(imported.id));
        }
      }

      // Preserve any manual members not part of this CSV batch
      for (const existing of existingMembers) {
        if (!seenIds.has(String(existing.id))) {
          mergedMembers.push(existing);
        }
      }

      // Idempotently merge historical transactions (preserving any member emails/phones already attached)
      const existingHist = readJsonArray(HISTORICAL_TXS_FILE);
      const histByReceipt = new Map<string, any>();
      for (const tx of existingHist) {
        if (tx?.receiptNumber) histByReceipt.set(String(tx.receiptNumber), tx);
      }
      const memberLookup = new Map<string, any>();
      for (const m of mergedMembers) {
        memberLookup.set(String(m.id), m);
      }

      for (const tx of parsed.historicalTransactions) {
        const prev = histByReceipt.get(tx.receiptNumber);
        const ownerMember = tx.memberId ? memberLookup.get(tx.memberId) : null;
        histByReceipt.set(tx.receiptNumber, {
          ...prev,
          ...tx,
          payerName: ownerMember?.name || prev?.payerName || tx.payerName,
          email: ownerMember?.email || prev?.email || tx.email || '',
          phone: cleanPhoneNumber(ownerMember?.phone || prev?.phone || tx.phone || ''),
          emailStatus: (ownerMember?.email || prev?.email || tx.email) ? 'SKIPPED' : 'NOT_PROVIDED'
        });
      }

      const finalHist = Array.from(histByReceipt.values());
      writeJsonArray(MEMBERS_FILE, mergedMembers);
      writeJsonArray(HISTORICAL_TXS_FILE, finalHist);
      runTreasuryReconciliation();
      const sheetsResult = await pushMembersAndHistoricalToGas(operator.email);

      res.json({
        success: true,
        message: `Imported ${parsed.members.length} members (${addedCount} new, ${updatedCount} updated) & reconciled ledger. Historical treasury: ${parsed.summary.totalSum.toLocaleString()} UGX.`,
        data: {
          addedCount,
          updatedCount,
          summary: parsed.summary
        },
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to import CSV file.' });
    }
  });

  // Merge duplicate member profiles into one primary record (Admin staff only)
  app.post('/api/admin/members/merge', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      const primaryId = String(req.body?.primaryMemberId || '').trim();
      const duplicateIds = Array.isArray(req.body?.duplicateMemberIds)
        ? req.body.duplicateMemberIds.map((id: unknown) => String(id || '').trim()).filter((id: string) => id && id !== primaryId)
        : [];

      if (!primaryId || duplicateIds.length === 0) {
        res.status(400).json({ success: false, error: 'Select one primary member and at least one duplicate member to merge.' });
        return;
      }

      const members = readJsonArray(MEMBERS_FILE);
      const primaryIdx = members.findIndex((m: any) => String(m.id || m.memberId) === primaryId);
      if (primaryIdx === -1) {
        res.status(404).json({ success: false, error: 'Primary member record was not found.' });
        return;
      }

      const dupSet = new Set(duplicateIds);
      const toMerge = members.filter((m: any) => dupSet.has(String(m.id || m.memberId)));
      if (toMerge.length === 0) {
        res.status(404).json({ success: false, error: 'Selected duplicate records were not found.' });
        return;
      }

      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const primary = { ...members[primaryIdx] };
      for (const d of toMerge) {
        primary.preNllPaid = (Number(primary.preNllPaid) || 0) + (Number(d.preNllPaid) || 0);
        primary.spotPaid = (Number(primary.spotPaid) || 0) + (Number(d.spotPaid) || 0);
        primary.paidAfter = (Number(primary.paidAfter) || 0) + (Number(d.paidAfter) || 0);
        primary.historicalPaid = (Number(primary.historicalPaid) || 0) + (Number(d.historicalPaid) || 0);
        primary.livePaid = (Number(primary.livePaid) || 0) + (Number(d.livePaid) || 0);
        primary.paymentCount = (Number(primary.paymentCount) || 0) + (Number(d.paymentCount) || 0);
        if (!primary.email && d.email && !isPlaceholderMemberEmail(d.email)) primary.email = d.email;
        if (!primary.phone && d.phone) primary.phone = cleanPhoneNumber(d.phone);
        if (!primary.address && d.address) primary.address = d.address;
      }
      primary.phone = cleanPhoneNumber(primary.phone || '');
      primary.totalContributed = (Number(primary.historicalPaid) || 0) + (Number(primary.livePaid) || 0);
      const targetUgx = Math.max(0, Number(primary.expectedTargetUgx ?? defaultTargetUgx) || 0);
      primary.remainingUgx = targetUgx > 0 ? Math.max(0, targetUgx - primary.totalContributed) : 0;
      primary.duesStatus = computeDuesStatus(primary.totalContributed, targetUgx);
      primary.profileStatus = isMemberProfileComplete(primary) ? 'COMPLETE' : 'INCOMPLETE';
      primary.updatedAt = new Date().toISOString();

      members[primaryIdx] = primary;
      const remainingMembers = members.filter((m: any) => !dupSet.has(String(m.id || m.memberId)));
      writeJsonArray(MEMBERS_FILE, remainingMembers);

      // Re-point historical ledger transactions to primary member
      const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
      let changed = false;
      for (const tx of histTxs) {
        if (dupSet.has(String(tx.memberId || ''))) {
          tx.memberId = primary.id;
          tx.payerName = primary.name;
          if (primary.email) tx.email = primary.email;
          if (primary.phone) tx.phone = primary.phone;
          changed = true;
        }
      }
      if (changed) {
        writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
      }

      const sheetsResult = await pushMembersAndHistoricalToGas(operator.email);
      res.json({
        success: true,
        message: `Merged ${toMerge.length} duplicate record${toMerge.length === 1 ? '' : 's'} into ${primary.name}.`,
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to merge member records.' });
    }
  });

  // Generate 7-day single-use tokenized profile completion link for a member (Admin staff only)
  app.post('/api/admin/members/:id/claim-link', (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      const memberId = String(req.params.id || '').trim();
      const members = readJsonArray(MEMBERS_FILE);
      const idx = members.findIndex((m: any) => String(m.id || m.memberId) === memberId);
      if (idx === -1) {
        res.status(404).json({ success: false, error: 'Member not found.' });
        return;
      }

      const rawToken = crypto.randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      members[idx] = {
        ...members[idx],
        claimTokenHash: hashClaimToken(rawToken),
        claimTokenExpiresAt: expiresAt,
        updatedAt: new Date().toISOString()
      };
      writeJsonArray(MEMBERS_FILE, members);

      res.json({
        success: true,
        data: {
          token: rawToken,
          expiresAt: new Date(expiresAt).toISOString(),
          memberName: members[idx].name
        }
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to generate profile update link.' });
    }
  });

  // Approve or Reject a member self-submitted profile completion request (Admin staff only)
  app.post('/api/admin/members/submissions/:submissionId/review', async (req, res) => {
    try {
      const operator = getAuthorizedFinanceOperator(req);
      if (!operator) {
        res.status(403).json({ success: false, error: 'Unauthorized: Finance staff sign-in required.' });
        return;
      }

      const submissionId = String(req.params.submissionId || '').trim();
      const decision = String(req.body?.decision || '').trim().toUpperCase();
      const reviewNotes = String(req.body?.reviewNotes || '').trim().slice(0, 300);

      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        res.status(400).json({ success: false, error: 'Decision must be APPROVE or REJECT.' });
        return;
      }

      const submissions = readJsonArray(SUBMISSIONS_FILE);
      const subIdx = submissions.findIndex((s: any) => String(s?.id) === submissionId);
      if (subIdx === -1) {
        res.status(404).json({ success: false, error: 'Submission not found.' });
        return;
      }

      const sub = submissions[subIdx];
      if (sub.status !== 'PENDING') {
        res.status(400).json({ success: false, error: `Submission has already been ${sub.status.toLowerCase()}.` });
        return;
      }

      const nowIso = new Date().toISOString();

      let approvedMember: any = null;
      let affectedHistTxs: any[] = [];

      if (decision === 'APPROVE') {
        const members = readJsonArray(MEMBERS_FILE);
        const memIdx = members.findIndex((m: any) => String(m.id || m.memberId) === String(sub.memberId));
        if (memIdx === -1) {
          res.status(404).json({ success: false, error: 'Target member record no longer exists.' });
          return;
        }

        const cleanEmail = String(sub.submittedEmail || '').trim().toLowerCase();
        if (cleanEmail) {
          const emailConflict = members.find(
            (m: any, idx: number) => idx !== memIdx && String(m?.email || '').trim().toLowerCase() === cleanEmail
          );
          if (emailConflict) {
            res.status(409).json({
              success: false,
              error: `Cannot approve: "${cleanEmail}" is already registered to ${emailConflict.name}.`
            });
            return;
          }
        }

        const cleanPhone = cleanPhoneNumber(sub.submittedPhone || members[memIdx].phone || '');
        const cleanSchool = normalizeMemberSchool(sub.submittedSchool || members[memIdx].school);
        const cleanGender = normalizeMemberGender(sub.submittedGender || members[memIdx].gender);
        const cleanHouse = normalizeMemberHouse(sub.submittedHouse || members[memIdx].house, cleanSchool);
        const updatedMember = {
          ...members[memIdx],
          name: sub.submittedName || members[memIdx].name,
          email: cleanEmail,
          phone: cleanPhone,
          address: sub.submittedAddress || members[memIdx].address,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          claimTokenHash: undefined,
          claimTokenExpiresAt: undefined,
          updatedAt: nowIso
        };
        updatedMember.profileStatus = isMemberProfileComplete(updatedMember) ? 'COMPLETE' : 'INCOMPLETE';
        members[memIdx] = updatedMember;
        approvedMember = updatedMember;
        writeJsonArray(MEMBERS_FILE, members);

        // Stamp verified email/phone/name ONLY onto this member's historical ledger transactions
        const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
        let histChanged = false;
        for (const tx of histTxs) {
          if (tx.memberId === updatedMember.id) {
            tx.payerName = updatedMember.name;
            tx.email = cleanEmail;
            tx.phone = updatedMember.phone;
            tx.emailStatus = cleanEmail ? 'SKIPPED' : 'NOT_PROVIDED';
            affectedHistTxs.push(tx);
            histChanged = true;
          }
        }
        if (histChanged) {
          writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
        }
      }

      submissions[subIdx] = {
        ...sub,
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedBy: operator.email,
        reviewedAt: nowIso,
        reviewNotes
      };
      writeJsonArray(SUBMISSIONS_FILE, submissions);

      const sheetsResult = decision === 'APPROVE' && approvedMember
        ? await pushSingleMemberToGas(approvedMember, operator.email, affectedHistTxs)
        : { synced: false };

      res.json({
        success: true,
        message:
          decision === 'APPROVE'
            ? `Approved and synced ${sub.submittedName}'s details. They can now sign in at /me.`
            : `Rejected update request from ${sub.submittedName}.`,
        data: submissions[subIdx],
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to process review decision.' });
    }
  });

  // --- Member Self-Service Portal (/me) Claim Link & Authenticated Profile/Payments ---

  app.get('/api/me/claim/:token', (req, res) => {
    try {
      ensureTreasurySeeded();
      const rawToken = String(req.params.token || '').trim();
      if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
        res.status(400).json({ success: false, error: 'Invalid profile completion link.' });
        return;
      }

      const tokenHash = hashClaimToken(rawToken);
      const members = readJsonArray(MEMBERS_FILE);
      const member = members.find(
        (m: any) => m?.claimTokenHash === tokenHash && Number(m?.claimTokenExpiresAt || 0) > Date.now()
      );

      if (!member) {
        res.status(404).json({
          success: false,
          error: 'This profile link has expired or has already been used. Ask the club secretariat for a fresh link.'
        });
        return;
      }

      const submissions = readJsonArray(SUBMISSIONS_FILE);
      const hasPendingSubmission = submissions.some(
        (s: any) => s?.memberId === member.id && s?.status === 'PENDING'
      );

      const claimSchool = normalizeMemberSchool(member.school);
      res.json({
        success: true,
        data: {
          memberId: member.id,
          name: member.name,
          phone: member.phone || '',
          email: member.email || '',
          address: member.address || '',
          gender: normalizeMemberGender(member.gender),
          school: claimSchool,
          house: normalizeMemberHouse(member.house, claimSchool),
          preNllPaid: Math.max(0, Number(member.preNllPaid) || 0),
          spotPaid: Math.max(0, Number(member.spotPaid) || 0),
          paidAfter: Math.max(0, Number(member.paidAfter) || 0),
          totalPaid: Math.max(0, Number(member.historicalPaid ?? member.totalContributed) || 0),
          hasPendingSubmission
        }
      });
    } catch {
      res.status(500).json({ success: false, error: 'Could not verify profile completion link.' });
    }
  });

  app.post('/api/me/claim/:token', (req, res) => {
    try {
      ensureTreasurySeeded();
      const rawToken = String(req.params.token || '').trim();
      if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
        res.status(400).json({ success: false, error: 'Invalid profile completion link.' });
        return;
      }

      const tokenHash = hashClaimToken(rawToken);
      const members = readJsonArray(MEMBERS_FILE);
      const memIdx = members.findIndex(
        (m: any) => m?.claimTokenHash === tokenHash && Number(m?.claimTokenExpiresAt || 0) > Date.now()
      );

      if (memIdx === -1) {
        res.status(404).json({
          success: false,
          error: 'This profile link has expired or was already submitted.'
        });
        return;
      }

      const targetMember = members[memIdx];
      const submittedName = String(req.body?.fullName || '').trim().slice(0, 120);
      const submittedEmail = String(req.body?.email || '').trim().toLowerCase().slice(0, 120);
      const submittedPhone = cleanPhoneNumber(String(req.body?.phone || '').trim().slice(0, 30));
      const submittedAddress = String(req.body?.address || '').trim().slice(0, 200);
      const submittedGender = normalizeMemberGender(req.body?.gender);
      const submittedSchool = normalizeMemberSchool(req.body?.school, req.body?.otherSchool);
      const submittedHouse = normalizeMemberHouse(req.body?.house, submittedSchool);

      if (submittedName.length < 2) {
        res.status(400).json({ success: false, error: 'Enter your full name.' });
        return;
      }
      if (isPlaceholderMemberEmail(submittedEmail)) {
        res.status(400).json({ success: false, error: 'Enter a valid personal email address.' });
        return;
      }
      if (submittedPhone.replace(/\D/g, '').length < 7) {
        res.status(400).json({ success: false, error: 'Enter a valid phone or WhatsApp number.' });
        return;
      }
      if (submittedAddress.length < 2) {
        res.status(400).json({ success: false, error: 'Enter your physical address / residence.' });
        return;
      }
      if (!submittedGender) {
        res.status(400).json({ success: false, error: 'Select your gender (Male or Female).' });
        return;
      }
      if (!submittedSchool) {
        res.status(400).json({ success: false, error: 'Select your school or enter your school name.' });
        return;
      }
      if (isHouseEligibleSchool(submittedSchool) && !submittedHouse) {
        res.status(400).json({ success: false, error: `Please select your house at ${submittedSchool}.` });
        return;
      }

      // Duplicate email guard across existing members & pending submissions
      const memberConflict = members.find(
        (m: any) =>
          String(m.id || m.memberId) !== String(targetMember.id) &&
          String(m?.email || '').trim().toLowerCase() === submittedEmail
      );
      if (memberConflict) {
        res.status(409).json({
          success: false,
          error: 'This email address is already registered to another club member. Please contact the club treasury if this is a mistake.'
        });
        return;
      }

      const submissions = readJsonArray(SUBMISSIONS_FILE);
      const pendingConflict = submissions.find(
        (s: any) =>
          s?.status === 'PENDING' &&
          s?.memberId !== targetMember.id &&
          String(s?.submittedEmail || '').trim().toLowerCase() === submittedEmail
      );
      if (pendingConflict) {
        res.status(409).json({
          success: false,
          error: 'A pending update already uses this email address.'
        });
        return;
      }

      const submission = {
        id: `sub-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        memberId: String(targetMember.id),
        memberName: String(targetMember.name),
        submittedName,
        submittedEmail,
        submittedPhone,
        submittedAddress,
        submittedGender,
        submittedSchool,
        submittedHouse,
        preNllPaid: Math.max(0, Number(targetMember.preNllPaid) || 0),
        spotPaid: Math.max(0, Number(targetMember.spotPaid) || 0),
        paidAfter: Math.max(0, Number(targetMember.paidAfter) || 0),
        totalPaid: Math.max(0, Number(targetMember.historicalPaid ?? targetMember.totalContributed) || 0),
        submittedAt: new Date().toISOString(),
        status: 'PENDING'
      };

      submissions.unshift(submission);
      writeJsonArray(SUBMISSIONS_FILE, submissions);

      // Invalidate token so it is strictly single-use once submitted
      members[memIdx] = {
        ...targetMember,
        claimTokenHash: undefined,
        claimTokenExpiresAt: undefined,
        updatedAt: new Date().toISOString()
      };
      writeJsonArray(MEMBERS_FILE, members);

      res.json({
        success: true,
        message: 'Thank you! Your details have been submitted for confirmation by the club administrator. Once approved, you can sign in to /me with your email anytime.'
      });
    } catch {
      res.status(500).json({ success: false, error: 'Could not submit your details right now. Please try again.' });
    }
  });

  const fetchRegisteredMemberData = async (cleanEmail: string) => {
    ensureTreasurySeeded();
    const [, gasRows] = await Promise.all([
      syncMembersFromGasDirectory(false),
      fetchGasTransactionsCached(false)
    ]);
    const members = readJsonArray(MEMBERS_FILE);
    const memberRecord = members.find(
      (m: any) => !isPlaceholderMemberEmail(m?.email, m?.name) && String(m?.email || '').trim().toLowerCase() === cleanEmail
    );

    const historicalTxs = readJsonArray(HISTORICAL_TXS_FILE).filter((tx: any) => {
      const txEmail = isPlaceholderMemberEmail(tx?.email, tx?.payerName)
        ? ''
        : String(tx?.email || '').trim().toLowerCase();
      return (
        (txEmail && txEmail === cleanEmail) ||
        (memberRecord && tx?.memberId && String(tx.memberId) === String(memberRecord.id))
      );
    });

    const coveredSet = getCoveredReceiptSet();
    const gasConnected = gasRows !== null;
    let gasInflows: any[] = [];

    if (gasRows) {
      gasInflows = gasRows.filter((tx: any) => {
        const type = String(tx?.type || 'INFLOW').toUpperCase();
        const rec = String(tx?.receiptNumber || '').trim().toUpperCase();
        const status = String(tx?.paymentStatus || '').toUpperCase();
        if (type === 'OUTFLOW' || rec.startsWith('EXP-') || status === 'CANCELLED') return false;
        // Exclude reconciled pre-CSV live receipts so /me never double-counts them alongside HIST-NLL17-*
        if (coveredSet.has(rec)) return false;

        const txEmail = isPlaceholderMemberEmail(tx?.email, tx?.payerName)
          ? ''
          : String(tx?.email || '').trim().toLowerCase();
        const matchesMemberName =
          Boolean(memberRecord) &&
          resolveCanonicalMemberNameKey(tx?.payerName) === resolveCanonicalMemberNameKey(memberRecord.name);
        return (txEmail && txEmail === cleanEmail) || matchesMemberName;
      });
    }

    // Merge GAS inflows and local historical inflows without duplicating receipt numbers
    const mergedMap = new Map<string, any>();
    for (const htx of historicalTxs) {
      if (htx?.receiptNumber) mergedMap.set(String(htx.receiptNumber).toUpperCase(), htx);
    }
    for (const gtx of gasInflows) {
      if (gtx?.receiptNumber) mergedMap.set(String(gtx.receiptNumber).toUpperCase(), gtx);
    }
    const mergedInflows = Array.from(mergedMap.values());

    if (mergedInflows.length === 0 && !memberRecord) {
      return { gasConnected, registered: false, memberName: '', memberRecord: null, inflows: [] as any[] };
    }

    const resolvedName = String(
      memberRecord?.name || mergedInflows[0]?.payerName || cleanEmail.split('@')[0]
    ).trim();

    return {
      gasConnected,
      registered: true,
      memberName: resolvedName,
      memberRecord: memberRecord || null,
      inflows: mergedInflows
    };
  };

  const signMemberToken = (email: string, name: string): string => {
    const now = Date.now();
    const payload = Buffer.from(
      JSON.stringify({
        email,
        name,
        iat: now,
        exp: now + 2 * 60 * 60 * 1000 // 2-hour session
      }),
      'utf-8'
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', MEMBER_TOKEN_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  };

  const verifyMemberToken = (req: express.Request): { email: string; name: string } | null => {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    const dotIdx = token.indexOf('.');
    if (dotIdx <= 0) return null;

    const payload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!payload || !sig) return null;

    try {
      const expectedSig = crypto.createHmac('sha256', MEMBER_TOKEN_SECRET).update(payload).digest('base64url');
      const sigBuf = Buffer.from(sig, 'utf-8');
      const expBuf = Buffer.from(expectedSig, 'utf-8');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
      }
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (!decoded?.email || !decoded?.exp || Number(decoded.exp) < Date.now()) {
        return null;
      }
      const cleanEmail = String(decoded.email).trim().toLowerCase();
      if (isPlaceholderMemberEmail(cleanEmail)) return null;
      return {
        email: cleanEmail,
        name: String(decoded.name || cleanEmail.split('@')[0]).trim()
      };
    } catch {
      return null;
    }
  };

  // API: Step 1 of /me Login — Request 6-digit OTP (Registered Members Only)
  app.post('/api/me/send-code', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      if (isPlaceholderMemberEmail(cleanEmail)) {
        res.status(400).json({
          success: false,
          error: 'Please enter a valid registered member email address.'
        });
        return;
      }

      const existing = memberOtpStore.get(cleanEmail);
      if (existing && existing.lastSentAt + 30 * 1000 > Date.now()) {
        const waitSec = Math.ceil((existing.lastSentAt + 30 * 1000 - Date.now()) / 1000);
        res.status(429).json({
          success: false,
          error: `Please wait ${waitSec}s before requesting another sign-in code.`
        });
        return;
      }

      const lookup = await fetchRegisteredMemberData(cleanEmail);
      if (!lookup.registered) {
        if (!lookup.gasConnected) {
          res.status(403).json({
            success: false,
            error: 'This email is not registered on any SC Basimbuzi member record yet.'
          });
          return;
        }
        res.status(403).json({
          success: false,
          error: 'This email address is not registered on any SC Basimbuzi member record. Only registered members with an email on file can sign in.'
        });
        return;
      }

      const gasUrl = getGasUrl();
      if (!gasUrl) {
        res.status(503).json({
          success: false,
          error: 'Email service is not configured yet.'
        });
        return;
      }

      const otpCode = String(crypto.randomInt(100000, 1000000));
      const codeHash = crypto
        .createHmac('sha256', MEMBER_TOKEN_SECRET)
        .update(`${cleanEmail}:${otpCode}`)
        .digest('hex');

      const gasPostRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sendMemberOtp',
          email: cleanEmail,
          code: otpCode
        }),
        redirect: 'follow'
      })
        .then(async r => {
          const text = await r.text();
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })
        .catch(() => null);

      if (!gasPostRes || !gasPostRes.success) {
        const rawErr = String(gasPostRes?.error || '');
        const needsRedeploy = rawErr.toLowerCase().includes('unknown action');
        res.status(502).json({
          success: false,
          error: needsRedeploy
            ? 'Member email sign-in requires updating the Google Apps Script deployment. Please ask an administrator to redeploy from Backend Setup.'
            : rawErr || 'Could not deliver sign-in code to your email right now. Please try again.'
        });
        return;
      }

      memberOtpStore.set(cleanEmail, {
        codeHash,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
        lastSentAt: Date.now(),
        memberName: lookup.memberName
      });

      res.json({
        success: true,
        message: `A 6-digit sign-in code has been sent to ${cleanEmail}.`
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Unable to send sign-in code right now. Please try again.'
      });
    }
  });

  // API: Step 2 of /me Login — Verify 6-digit OTP & Issue Scoped Bearer Session Token
  app.post('/api/me/verify-code', (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      const cleanCode = String(req.body?.code || '').trim();

      if (isPlaceholderMemberEmail(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
        res.status(400).json({
          success: false,
          error: 'Enter your registered email address and 6-digit sign-in code.'
        });
        return;
      }

      const stored = memberOtpStore.get(cleanEmail);
      if (!stored) {
        res.status(401).json({
          success: false,
          error: 'No active sign-in code found. Request a new code to continue.'
        });
        return;
      }

      if (stored.expiresAt < Date.now()) {
        memberOtpStore.delete(cleanEmail);
        res.status(401).json({
          success: false,
          error: 'That sign-in code has expired. Please request a new code.'
        });
        return;
      }

      if (stored.attempts >= 5) {
        memberOtpStore.delete(cleanEmail);
        res.status(429).json({
          success: false,
          error: 'Too many incorrect attempts. Please request a fresh sign-in code.'
        });
        return;
      }

      const candidateHash = crypto
        .createHmac('sha256', MEMBER_TOKEN_SECRET)
        .update(`${cleanEmail}:${cleanCode}`)
        .digest('hex');

      const storedBuf = Buffer.from(stored.codeHash, 'hex');
      const candBuf = Buffer.from(candidateHash, 'hex');
      const matched = storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf);

      if (!matched) {
        stored.attempts += 1;
        if (stored.attempts >= 5) {
          memberOtpStore.delete(cleanEmail);
        }
        res.status(401).json({
          success: false,
          error: 'Incorrect 6-digit code. Please check your inbox and try again.'
        });
        return;
      }

      memberOtpStore.delete(cleanEmail);
      const token = signMemberToken(cleanEmail, stored.memberName);

      res.json({
        success: true,
        token,
        member: {
          email: cleanEmail,
          name: stored.memberName
        }
      });
    } catch {
      res.status(500).json({
        success: false,
        error: 'Could not verify code right now.'
      });
    }
  });

  // API: Authenticated Member Personal Payments & Balance (strictly scoped to verified email)
  app.get('/api/me/payments', async (req, res) => {
    try {
      const member = verifyMemberToken(req);
      if (!member) {
        res.status(401).json({
          found: false,
          error: 'Your member session has expired. Please sign in again.',
          message: 'Please sign in with your registered email to view your payments.'
        });
        return;
      }

      const siteContent = readPublicSiteContent();
      const targetLabel = String(siteContent.membershipTargetLabel || '2026 Season Membership Contribution');
      const configuredTarget = Math.max(0, Number(siteContent.membershipTargetUgx) || 0);

      const lookup = await fetchRegisteredMemberData(member.email);
      if (!lookup.registered && !lookup.gasConnected) {
        res.status(503).json({
          found: false,
          query: member.email,
          memberEmail: member.email,
          payerName: member.name,
          targetLabel,
          expectedTargetUgx: configuredTarget,
          totalPaidUgx: 0,
          pendingUgx: 0,
          remainingUgx: configuredTarget,
          progressPercent: 0,
          overallStatus: 'NOT_FOUND',
          payments: [],
          message: 'Payment records are temporarily unavailable. Please try again shortly.'
        });
        return;
      }

      let totalPaidUgx = 0;
      let pendingUgx = 0;
      const payments = lookup.inflows.map((tx: any) => {
        const amt = Math.max(0, Number(tx.amount) || 0);
        const status = String(tx.paymentStatus || 'COMPLETED').toUpperCase();
        if (status === 'COMPLETED') {
          totalPaidUgx += amt;
        } else if (status === 'PENDING') {
          pendingUgx += amt;
        }
        return {
          receiptNumber: String(tx.receiptNumber || ''),
          date: String(tx.date || ''),
          paymentPurpose: String(tx.paymentPurpose || 'Club Contribution'),
          paymentMethod: String(tx.paymentMethod || ''),
          paymentReference: String(tx.paymentReference || ''),
          amount: amt,
          paymentStatus: status
        };
      });

      const memberTarget =
        lookup.memberRecord?.expectedTargetUgx !== undefined
          ? Math.max(0, Number(lookup.memberRecord.expectedTargetUgx) || 0)
          : configuredTarget;
      const expectedTargetUgx = memberTarget > 0 ? memberTarget : totalPaidUgx + pendingUgx;
      const remainingUgx = expectedTargetUgx > 0 ? Math.max(0, expectedTargetUgx - totalPaidUgx) : 0;
      const progressPercent = expectedTargetUgx > 0 ? Math.min(100, Math.round((totalPaidUgx / expectedTargetUgx) * 100)) : 100;

      let overallStatus: 'FULLY_PAID' | 'PARTIAL' | 'PENDING' = 'PARTIAL';
      if (totalPaidUgx === 0 && pendingUgx > 0) {
        overallStatus = 'PENDING';
      } else if (remainingUgx === 0 && totalPaidUgx > 0) {
        overallStatus = 'FULLY_PAID';
      }

      const oldestDate = lookup.inflows.reduce((earliest: string, tx: any) => {
        const d = String(tx?.date || '').trim();
        if (!d) return earliest;
        return !earliest || d < earliest ? d : earliest;
      }, '');

      res.json({
        found: true,
        query: member.email,
        payerName: lookup.memberName || member.name,
        memberEmail: member.email,
        phone: String(lookup.memberRecord?.phone || lookup.inflows[0]?.phone || ''),
        memberProfile: lookup.memberRecord
            ? sanitizeMemberForClient(lookup.memberRecord, expectedTargetUgx)
            : {
                name: lookup.memberName || member.name,
                email: member.email,
                phone: String(lookup.inflows[0]?.phone || ''),
                address: '',
                gender: '',
                school: '',
                house: '',
                preNllPaid: 0,
                spotPaid: 0,
                paidAfter: 0,
                duesStatus: computeDuesStatus(totalPaidUgx, expectedTargetUgx)
              },
        memberSince: oldestDate,
        targetLabel,
        expectedTargetUgx,
        totalPaidUgx,
        pendingUgx,
        remainingUgx,
        progressPercent,
        overallStatus,
        payments,
        message: payments.length > 0
          ? `Showing ${payments.length} payment record${payments.length === 1 ? '' : 's'} registered to ${member.email}.`
          : `No payments recorded yet under ${member.email}.`
      });
    } catch {
      res.status(500).json({
        found: false,
        query: '',
        expectedTargetUgx: 0,
        totalPaidUgx: 0,
        pendingUgx: 0,
        remainingUgx: 0,
        progressPercent: 0,
        overallStatus: 'NOT_FOUND',
        payments: [],
        message: 'Could not load your payment records right now.'
      });
    }
  });

  // API: Authenticated Member Personal Profile Self-Update (financial totals strictly locked)
  app.patch('/api/me/profile', async (req, res) => {
    try {
      const member = verifyMemberToken(req);
      if (!member) {
        res.status(401).json({
          success: false,
          error: 'Please sign in with your registered email to update your profile.'
        });
        return;
      }

      const cleanName = String(req.body?.fullName || '').trim().slice(0, 120);
      const cleanPhone = cleanPhoneNumber(String(req.body?.phone || '').trim().slice(0, 30));
      const cleanAddress = String(req.body?.address || '').trim().slice(0, 200);
      const cleanGender = normalizeMemberGender(req.body?.gender);
      const cleanSchool = normalizeMemberSchool(req.body?.school, req.body?.otherSchool);
      const cleanHouse = normalizeMemberHouse(req.body?.house, cleanSchool);

      if (cleanName.length < 2) {
        res.status(400).json({ success: false, error: 'Full name is required.' });
        return;
      }
      if (cleanPhone.replace(/\D/g, '').length < 7) {
        res.status(400).json({ success: false, error: 'Enter a valid phone or WhatsApp number.' });
        return;
      }
      if (!cleanGender) {
        res.status(400).json({ success: false, error: 'Please select your gender (Male or Female).' });
        return;
      }
      if (!cleanSchool) {
        res.status(400).json({ success: false, error: 'Please select your school or enter your school name.' });
        return;
      }
      if (isHouseEligibleSchool(cleanSchool) && !cleanHouse) {
        res.status(400).json({ success: false, error: `Please select your house at ${cleanSchool}.` });
        return;
      }

      await syncMembersFromGasDirectory(false);
      const site = readPublicSiteContent();
      const defaultTargetUgx = Math.max(0, Number(site.membershipTargetUgx) || 100000);
      const members = readJsonArray(MEMBERS_FILE);
      const idx = members.findIndex((m: any) => String(m?.email || '').trim().toLowerCase() === member.email);
      const nowIso = new Date().toISOString();

      let savedRecord: any;
      const affectedHistTxs: any[] = [];
      if (idx !== -1) {
        const { tier: _dropLegacyTier, ...existingClean } = members[idx] || {};
        savedRecord = {
          ...existingClean,
          name: cleanName,
          phone: cleanPhone,
          address: cleanAddress,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          updatedAt: nowIso
        };
        savedRecord.profileStatus = isMemberProfileComplete(savedRecord) ? 'COMPLETE' : 'INCOMPLETE';
        members[idx] = savedRecord;

        const histTxs = readJsonArray(HISTORICAL_TXS_FILE);
        let histChanged = false;
        for (const tx of histTxs) {
          if (tx.memberId === savedRecord.id) {
            tx.payerName = cleanName;
            tx.phone = cleanPhone;
            affectedHistTxs.push(tx);
            histChanged = true;
          }
        }
        if (histChanged) {
          writeJsonArray(HISTORICAL_TXS_FILE, histTxs);
        }
      } else {
        const newId = `SB-M-${String(members.length + 1).padStart(4, '0')}`;
        savedRecord = {
          id: newId,
          memberId: newId,
          name: cleanName,
          email: member.email,
          phone: cleanPhone,
          address: cleanAddress,
          gender: cleanGender,
          school: cleanSchool,
          house: cleanHouse,
          preNllPaid: 0,
          spotPaid: 0,
          paidAfter: 0,
          historicalPaid: 0,
          livePaid: 0,
          totalContributed: 0,
          expectedTargetUgx: defaultTargetUgx,
          profileStatus: isMemberProfileComplete({
            name: cleanName,
            email: member.email,
            phone: cleanPhone,
            address: cleanAddress
          })
            ? 'COMPLETE'
            : 'INCOMPLETE',
          source: 'LIVE_RECEIPT',
          createdAt: nowIso,
          updatedAt: nowIso
        };
        members.push(savedRecord);
      }

      writeJsonArray(MEMBERS_FILE, members);
      const sheetsResult = await pushSingleMemberToGas(savedRecord, SYSTEM_OWNER_EMAIL, affectedHistTxs);
      res.json({
        success: true,
        message: 'Your member contact details have been updated.',
        data: sanitizeMemberForClient(savedRecord, defaultTargetUgx),
        sheetsSynced: sheetsResult.synced,
        sheetsError: sheetsResult.error
      });
    } catch {
      res.status(500).json({ success: false, error: 'Could not update your profile right now.' });
    }
  });

  // API: Authenticated Member Personal Receipt Verifier (strictly scoped to verified member's own receipts)
  app.post('/api/me/verify-receipt', async (req, res) => {
    try {
      const member = verifyMemberToken(req);
      if (!member) {
        res.status(401).json({
          found: false,
          receiptNumber: '',
          message: 'Please sign in with your registered email to verify your receipts.'
        });
        return;
      }

      const cleanReceipt = String(req.body?.receiptNumber || '').trim().toUpperCase();
      if (!cleanReceipt || cleanReceipt.length > 40 || !/^[A-Z0-9-]+$/.test(cleanReceipt)) {
        res.status(400).json({
          found: false,
          receiptNumber: cleanReceipt,
          message: 'Enter a valid receipt reference (e.g. SB-2026-00001).'
        });
        return;
      }

      const lookup = await fetchRegisteredMemberData(member.email);
      if (!lookup.registered && !lookup.gasConnected) {
        res.status(503).json({
          found: false,
          receiptNumber: cleanReceipt,
          message: 'Live receipt verification is temporarily unavailable.'
        });
        return;
      }

      const match = lookup.inflows.find((tx: any) => {
        const rec = String(tx?.receiptNumber || '').trim().toUpperCase();
        const ref = String(tx?.paymentReference || '').toUpperCase();
        const notes = String(tx?.notes || '').toUpperCase();
        return rec === cleanReceipt || ref.includes(cleanReceipt) || notes.includes(cleanReceipt);
      });

      if (!match) {
        res.json({
          found: false,
          receiptNumber: cleanReceipt,
          message: 'No matching receipt was found under your registered member email.'
        });
        return;
      }

      res.json({
        found: true,
        receiptNumber: String(match.receiptNumber || cleanReceipt),
        date: String(match.date || ''),
        amount: Math.max(0, Number(match.amount) || 0),
        paymentStatus: String(match.paymentStatus || 'COMPLETED'),
        paymentPurpose: String(match.paymentPurpose || 'Club Contribution'),
        paymentMethod: String(match.paymentMethod || ''),
        paymentReference: String(match.paymentReference || ''),
        message: 'Verified: Official SC Basimbuzi receipt matches your member account.'
      });
    } catch {
      res.status(500).json({
        found: false,
        receiptNumber: '',
        message: 'Receipt verification failed. Please try again.'
      });
    }
  });

  // Serve static assets with permissive CORS headers so external link preview crawlers can read the logo
  app.use((req, res, next) => {
    if (req.path.startsWith('/logo.') || req.path.startsWith('/favicon.') || req.path.endsWith('.png') || req.path.endsWith('.jpg') || req.path.endsWith('.svg')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    next();
  });

  const renderDynamicOpenGraphHtml = (htmlContent: string, req: express.Request): string => {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'scbasimbuzi-v2.ai.studio';
    const origin = `${proto}://${host}`;
    
    let transformed = htmlContent
      .replace(/content="https:\/\/scbasimbuzi\.org\/logo\.png"/g, 'content="https://scbasimbuzi-v2.ai.studio/logo.png"')
      .replace(/content="https:\/\/scbasimbuzi\.org"/g, 'content="https://scbasimbuzi-v2.ai.studio/"');
      
    return transformed;
  };

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Intercept crawler or root HTML requests to inject dynamically resolved origin and logo URL
    app.use(async (req, res, next) => {
      const isHtmlRequest = req.method === 'GET' && (
        req.path === '/' || 
        req.path === '/index.html' || 
        (req.headers.accept && req.headers.accept.includes('text/html')) ||
        /whatsapp|telegrambot|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|applebot/i.test(req.headers['user-agent'] || '')
      );

      if (isHtmlRequest && !req.path.startsWith('/api') && !req.path.includes('.')) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          let html = fs.readFileSync(indexHtmlPath, 'utf-8');
          html = await vite.transformIndexHtml(req.originalUrl, html);
          html = renderDynamicOpenGraphHtml(html, req);
          res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
          return;
        } catch (e) {
          console.error('Error transforming index.html:', e);
        }
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      try {
        if (fs.existsSync(indexHtmlPath)) {
          let html = fs.readFileSync(indexHtmlPath, 'utf-8');
          html = renderDynamicOpenGraphHtml(html, req);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(html);
          return;
        }
      } catch (err) {
        console.warn('Fallback sending index.html:', err);
      }
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
