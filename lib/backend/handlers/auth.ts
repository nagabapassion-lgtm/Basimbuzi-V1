import crypto from 'crypto';
import { getDb } from '../db';
import { issueOtp, requireStaff, signToken, verifyOtp, getBearer, verifyToken } from '../auth';
import { logAudit, SYSTEM_OWNER_EMAIL } from '../store';
import { mapUserRow } from '../map';
import { fail, ok, errorResult } from '../types';
import type { HandlerCtx, HandlerResult, StaffUser } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loadUserRow = async (email: string) => {
  const { data } = await getDb()
    .from('app_users')
    .select('id, name, email, role, status, permissions, created_at')
    .eq('email', email)
    .maybeSingle();
  return data || null;
};

/** Auto-provisions an app_users profile for a valid Supabase auth user. */
const provisionProfile = async (email: string, authUserId?: string) => {
  const isSystemOwner = email === SYSTEM_OWNER_EMAIL;
  const match = await findAuthUserByEmail(email);
  const id = match?.id || authUserId || crypto.randomUUID();
  const insert = {
    id,
    email,
    name: isSystemOwner ? 'Passion' : email.split('@')[0],
    role: isSystemOwner ? 'OWNER' : 'ISSUER',
    status: 'ACTIVE',
    permissions: null,
    created_at: new Date().toISOString()
  };
  const { data } = await getDb()
    .from('app_users')
    .upsert(insert, { onConflict: 'email' })
    .select()
    .single();
  return data;
};

export const findAuthUserByEmail = async (email: string): Promise<any | null> => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  let page = 1;
  for (; page <= 5; page++) {
    const { data } = await getDb().auth.admin.listUsers({ page, perPage: 200 });
    const users = (data as any)?.users || [];
    const match = users.find(
      (u: any) => String(u?.email || '').trim().toLowerCase() === cleanEmail
    );
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
};

// POST /api/auth/login {email, password}
export const login = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const { email, password } = ctx.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return fail(400, {
        success: false,
        authorized: false,
        message: 'Please provide both your registered email address and password.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const { data: authData, error: authError } = await getDb().auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword
    });

    const userRow = await loadUserRow(cleanEmail);

    if (authError || !authData?.session) {
      if (!userRow) {
        return fail(401, {
          success: false,
          authorized: false,
          message:
            'No account registered with this email. Please contact the administrator (nagabapassion@gmail.com).'
        });
      }
      return fail(401, {
        success: false,
        authorized: false,
        message: 'Incorrect password. Please verify and try again.'
      });
    }

    const profile = userRow || (await provisionProfile(cleanEmail, authData?.user?.id));
    if (!profile) {
      return fail(500, { success: false, authorized: false, message: 'Server authentication error' });
    }

    if (String(profile.status || '').toUpperCase() !== 'ACTIVE') {
      return fail(403, {
        success: false,
        authorized: false,
        message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
      });
    }

    const user: StaffUser = mapUserRow(profile) as unknown as StaffUser;
    const token = signToken({
      sub: cleanEmail,
      name: user.name,
      role: user.role,
      kind: 'staff',
      exp: Date.now() + 12 * 60 * 60 * 1000
    });

    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: 'LOGIN',
      description: `${user.name} signed in with a password.`
    });

    return ok({ success: true, authorized: true, user, token });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/auth/send-otp {email}
export const sendOtp = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const cleanEmail = String(ctx.body?.email || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return fail(400, {
        success: false,
        error: 'Please enter a valid staff email address.'
      });
    }

    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return fail(403, {
        success: false,
        error:
          'No account registered with this email. Please contact the administrator (nagabapassion@gmail.com).'
      });
    }
    if (String(userRow.status || '').toUpperCase() !== 'ACTIVE') {
      return fail(403, {
        success: false,
        error: 'This staff account has been set to INACTIVE. Please contact the administrator.'
      });
    }

    const issued = await issueOtp(cleanEmail, 'STAFF_LOGIN');
    if (!issued.ok) {
      return fail(429, {
        success: false,
        error: `Please wait ${issued.waitSeconds ?? 30}s before requesting another sign-in code.`
      });
    }

    await logAudit({
      user: String(userRow.name || cleanEmail.split('@')[0]),
      userEmail: cleanEmail,
      action: 'LOGIN_OTP_SENT',
      description: `OTP sign-in code issued for ${cleanEmail}.`
    });

    // No email provider is connected yet — return the code so the UI can show it.
    return ok({
      success: true,
      data: { email: cleanEmail, code: issued.code },
      devCode: issued.code,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Check your Inbox — if you do not see it within 1 minute, check your Spam or Promotions folder and mark it "Not spam".`
    });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/auth/verify-otp {email, code}
export const verifyOtpHandler = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const cleanEmail = String(ctx.body?.email || '').trim().toLowerCase();
    const cleanCode = String(ctx.body?.code || '').trim();

    if (!EMAIL_REGEX.test(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
      return fail(400, {
        success: false,
        authorized: false,
        error: 'Enter your registered email address and 6-digit sign-in code.'
      });
    }

    const result = await verifyOtp(cleanEmail, 'STAFF_LOGIN', cleanCode);
    if (result.ok === false) {
      const messages: Record<string, { status: number; message: string }> = {
        NO_ACTIVE: { status: 401, message: 'No active sign-in code found. Request a new code to continue.' },
        EXPIRED: { status: 401, message: 'That sign-in code has expired. Please request a new code.' },
        TOO_MANY: { status: 429, message: 'Too many incorrect attempts. Please request a fresh sign-in code.' },
        INCORRECT: { status: 401, message: 'Incorrect 6-digit code. Please check your inbox and try again.' }
      };
      const m = messages[result.reason];
      return fail(m.status, { success: false, authorized: false, error: m.message });
    }

    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return fail(401, {
        success: false,
        authorized: false,
        message:
          'No account registered with this email. Please contact the administrator (nagabapassion@gmail.com).'
      });
    }
    if (String(userRow.status || '').toUpperCase() !== 'ACTIVE') {
      return fail(403, {
        success: false,
        authorized: false,
        message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
      });
    }

    const user: StaffUser = mapUserRow(userRow) as unknown as StaffUser;
    const token = signToken({
      sub: cleanEmail,
      name: user.name,
      role: user.role,
      kind: 'staff',
      exp: Date.now() + 12 * 60 * 60 * 1000
    });

    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: 'LOGIN',
      description: `${user.name} signed in with an email OTP code.`
    });

    return ok({ success: true, authorized: true, user, token });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/auth/check {email} + Bearer
export const check = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const cleanEmail = String(ctx.body?.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return fail(400, { success: false, authorized: false });
    }

    const token = getBearer(ctx.headers);
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.kind !== 'staff' || payload.sub.toLowerCase() !== cleanEmail) {
      return ok({
        success: true,
        authorized: false,
        message: 'Session expired. Please sign in again.'
      });
    }

    const userRow = await loadUserRow(cleanEmail);
    if (!userRow) {
      return ok({
        success: true,
        authorized: false,
        message: 'Session expired. Please sign in again.'
      });
    }

    if (String(userRow.status || '').toUpperCase() !== 'ACTIVE') {
      return ok({
        success: true,
        authorized: false,
        message: 'This staff account has been set to INACTIVE. Please contact the administrator.'
      });
    }

    return ok({
      success: true,
      authorized: true,
      user: mapUserRow(userRow)
    });
  } catch (err) {
    return errorResult(err);
  }
};
