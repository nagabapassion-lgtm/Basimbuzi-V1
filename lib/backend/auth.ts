import crypto from 'crypto';
import { getDb } from './db';
import { env } from './env';
import { resolveUserPermissions } from './permissions';
import type { HandlerCtx, HandlerResult, StaffUser, TokenPayload } from './types';

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

const hmac = (data: string): string =>
  crypto.createHmac('sha256', secretKey()).update(data).digest('base64url');

const secretKey = (): string => env.SESSION_SECRET || 'sc-basimbuzi-dev-session-secret';

/** HMAC-SHA256 JWT using node:crypto only (header {alg:'HS256',typ:'JWT'}). */
export const signToken = (
  payload: Omit<TokenPayload, 'exp'> & { exp?: number }
): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: payload.exp ?? Date.now() + 12 * 60 * 60 * 1000
    })
  );
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
};

export const verifyToken = (token: string): TokenPayload | null => {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;
  const expected = hmac(`${header}.${body}`);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!decoded?.sub || !decoded?.exp || Number(decoded.exp) < Date.now()) return null;
    return decoded as TokenPayload;
  } catch {
    return null;
  }
};

export const getBearer = (headers: Record<string, string>): string => {
  const auth = String(headers.authorization || headers.Authorization || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
};

type StaffCheck =
  | { ok: true; user: StaffUser }
  | { ok: false; response: HandlerResult };

/**
 * Verifies the Bearer token (kind='staff'), then loads a FRESH profile from
 * app_users so deactivated / deleted staff lose access immediately.
 * The client-supplied X-Operator-Email header is NEVER trusted for authorization.
 */
export const requireStaff = async (
  ctx: HandlerCtx,
  roles?: string[]
): Promise<StaffCheck> => {
  const token = getBearer(ctx.headers);
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.kind !== 'staff') {
    return {
      ok: false,
      response: {
        status: 401,
        body: {
          success: false,
          authorized: false,
          message: 'Session expired. Please sign in again.'
        }
      }
    };
  }

  const email = String(payload.sub || '').trim().toLowerCase();
  const { data: row, error } = await getDb()
    .from('app_users')
    .select('id, name, email, role, status, permissions, created_at')
    .eq('email', email)
    .maybeSingle();

  if (error || !row) {
    return {
      ok: false,
      response: {
        status: 401,
        body: {
          success: false,
          authorized: false,
          message: 'Session expired. Please sign in again.'
        }
      }
    };
  }

  if (String(row.status || '').toUpperCase() !== 'ACTIVE') {
    return {
      ok: false,
      response: {
        status: 403,
        body: {
          success: false,
          authorized: false,
          message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
        }
      }
    };
  }

  const role = String(row.role || 'ISSUER').toUpperCase();
  if (roles && roles.length > 0 && !roles.includes(role)) {
    return {
      ok: false,
      response: {
        status: 403,
        body: {
          success: false,
          authorized: false,
          error: `ACCESS DENIED: This action requires role ${roles.join(' or ')}.`
        }
      }
    };
  }

  const rawPermissions = (row.permissions && typeof row.permissions === 'object' ? row.permissions : null) as
    | Record<string, boolean>
    | null;

  return {
    ok: true,
    user: {
      id: String(row.id || ''),
      name: String(row.name || email.split('@')[0]),
      email: String(row.email || email).toLowerCase(),
      role,
      status: String(row.status || 'ACTIVE').toUpperCase(),
      permissions: resolveUserPermissions(role, rawPermissions),
      rawPermissions: rawPermissions,
      createdAt: String(row.created_at || '')
    }
  };
};

export const isOwner = (user: StaffUser): boolean => user.role === 'OWNER';

// ---------------------------------------------------------------------------
// OTP helpers (staff + member) — sha256(email:code:SESSION_SECRET) in otp_codes
// ---------------------------------------------------------------------------

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

export const hashOtpCode = (email: string, code: string): string =>
  crypto
    .createHash('sha256')
    .update(`${String(email).trim().toLowerCase()}:${String(code).trim()}:${secretKey()}`)
    .digest('hex');

export interface OtpIssueResult {
  ok: boolean;
  code?: string;
  waitSeconds?: number;
}

/**
 * Issues (or rate-limits) a 6-digit OTP. While no email provider is connected
 * the raw code is returned so callers can surface it in the API response.
 */
export const issueOtp = async (
  email: string,
  purpose: 'STAFF_LOGIN' | 'MEMBER_LOGIN'
): Promise<OtpIssueResult> => {
  const cleanEmail = String(email).trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const { data: existing } = await getDb()
    .from('otp_codes')
    .select('created_at')
    .eq('email', cleanEmail)
    .eq('purpose', purpose)
    .maybeSingle();

  if (existing?.created_at) {
    const elapsed = Date.now() - Date.parse(existing.created_at);
    if (!Number.isNaN(elapsed) && elapsed >= 0 && elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        waitSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)
      };
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await getDb().from('otp_codes').upsert(
    {
      email: cleanEmail,
      code_hash: hashOtpCode(cleanEmail, code),
      purpose,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      created_at: nowIso
    },
    { onConflict: 'email' }
  );
  if (error) return { ok: false };
  return { ok: true, code };
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'NO_ACTIVE' | 'EXPIRED' | 'TOO_MANY' | 'INCORRECT' };

export const verifyOtp = async (
  email: string,
  purpose: 'STAFF_LOGIN' | 'MEMBER_LOGIN',
  code: string
): Promise<OtpVerifyResult> => {
  const cleanEmail = String(email).trim().toLowerCase();
  const { data: row } = await getDb()
    .from('otp_codes')
    .select('code_hash, expires_at, attempts')
    .eq('email', cleanEmail)
    .eq('purpose', purpose)
    .maybeSingle();

  if (!row?.code_hash) return { ok: false, reason: 'NO_ACTIVE' };
  if (Date.parse(row.expires_at) < Date.now()) {
    await getDb().from('otp_codes').delete().eq('email', cleanEmail).eq('purpose', purpose);
    return { ok: false, reason: 'EXPIRED' };
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    await getDb().from('otp_codes').delete().eq('email', cleanEmail).eq('purpose', purpose);
    return { ok: false, reason: 'TOO_MANY' };
  }

  const candidate = hashOtpCode(cleanEmail, code);
  const storedBuf = Buffer.from(String(row.code_hash), 'hex');
  const candBuf = Buffer.from(candidate, 'hex');
  const matched =
    storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf);

  if (!matched) {
    const nextAttempts = Number(row.attempts) + 1;
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await getDb().from('otp_codes').delete().eq('email', cleanEmail).eq('purpose', purpose);
    } else {
      await getDb()
        .from('otp_codes')
        .update({ attempts: nextAttempts })
        .eq('email', cleanEmail)
        .eq('purpose', purpose);
    }
    return { ok: false, reason: 'INCORRECT' };
  }

  await getDb().from('otp_codes').delete().eq('email', cleanEmail).eq('purpose', purpose);
  return { ok: true };
};
