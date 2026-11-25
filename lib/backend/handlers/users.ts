import crypto from 'crypto';
import { getDb } from '../db';
import { requireStaff } from '../auth';
import { resolveUserPermissions } from '../permissions';
import { EMAIL_REGEX, SYSTEM_OWNER_EMAIL, logAudit } from '../store';
import { mapUserRow } from '../map';
import { fail, ok, errorResult } from '../types';
import type { HandlerCtx, HandlerResult } from '../types';
import { findAuthUserByEmail } from './auth';

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'ISSUER', 'MEDIA']);
const ALLOWED_STATUSES = new Set(['ACTIVE', 'INACTIVE']);

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
  const permissions = u.permissions && typeof u.permissions === 'object' ? u.permissions : null;
  return { name, email, role, status, password, permissions, createdAt: u.createdAt };
};

const upsertAuthUserWithPassword = async (
  email: string,
  password: string
): Promise<{ id: string; created: boolean }> => {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error } = await getDb().auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true
    });
    if (error) throw new Error(error.message);
    return { id: existing.id, created: false };
  }
  const { data, error } = await getDb().auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data?.user) throw new Error(error?.message || 'Could not create staff auth user');
  return { id: data.user.id, created: true };
};

// GET /api/users
export const listUsers = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;

    const { data, error } = await getDb()
      .from('app_users')
      .select('id, name, email, role, status, permissions, created_at')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    return ok({ success: true, data: (data || []).map(mapUserRow) });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/users — upsert one ({user}) or many ({users})
export const upsertUsers = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === 'OWNER' || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: 'ACCESS DENIED: Managing staff accounts requires the canManageUsers permission.'
      });
    }

    const incoming: any[] = Array.isArray(ctx.body?.users)
      ? ctx.body.users
      : ctx.body?.user
        ? [ctx.body.user]
        : [];
    if (incoming.length === 0) {
      return fail(400, { success: false, error: 'Invalid user payload' });
    }
    if (incoming.length > 50) {
      return fail(400, { success: false, error: 'Exceeded maximum permitted users (50)' });
    }

    const { data: existingRows } = await getDb()
      .from('app_users')
      .select('id, email, role, status, created_at');
    const existingByEmail = new Map<string, any>();
    for (const row of existingRows || []) {
      existingByEmail.set(String(row.email || '').toLowerCase(), row);
    }

    const saved: any[] = [];
    for (const raw of incoming) {
      const sanitized = sanitizeUser(raw);
      if (!sanitized) {
        return fail(400, { success: false, error: 'Invalid user payload' });
      }
      const existing = existingByEmail.get(sanitized.email);
      let authUserId = existing?.id;

      if (sanitized.password) {
        const res = await upsertAuthUserWithPassword(sanitized.email, sanitized.password);
        authUserId = res.id;
      } else if (!authUserId) {
        // New user with no password yet: create a locked auth identity so the
        // app_users FK holds; the admin sets a password via /api/users/password.
        const res = await upsertAuthUserWithPassword(
          sanitized.email,
          crypto.randomBytes(24).toString('base64url')
        );
        authUserId = res.id;
      }

      // OWNER accounts cannot be demoted or deactivated through this route.
      const prevRole = String(existing?.role || '').toUpperCase();
      let role = sanitized.role;
      let status = sanitized.status;
      if (existing && prevRole === 'OWNER') {
        role = 'OWNER';
        status = 'ACTIVE';
      }

      const row = {
        id: authUserId,
        email: sanitized.email,
        name: sanitized.name,
        role,
        status,
        permissions: sanitized.permissions,
        created_at: existing?.created_at || sanitized.createdAt || new Date().toISOString()
      };
      const { data, error } = await getDb()
        .from('app_users')
        .upsert(row, { onConflict: 'email' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      saved.push(mapUserRow(data));

      await logAudit({
        user: operator.name,
        userEmail: operator.email,
        action: existing ? 'EDIT_USER' : 'ADD_ADMIN',
        description: `${operator.name} ${existing ? 'updated' : 'added'} staff account ${sanitized.email} (${role}/${status}).`
      });
    }

    return ok({ success: true, data: Array.isArray(ctx.body?.users) ? saved : saved[0] });
  } catch (err) {
    return errorResult(err);
  }
};

// PATCH /api/users {email, status}
export const patchUserStatus = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === 'OWNER' || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: 'ACCESS DENIED: Managing staff accounts requires the canManageUsers permission.'
      });
    }

    const email = String(ctx.body?.email || '').trim().toLowerCase();
    const status = String(ctx.body?.status || '').trim().toUpperCase();
    if (!email || !ALLOWED_STATUSES.has(status)) {
      return fail(400, { success: false, error: 'Email and a valid status are required.' });
    }

    const { data: row } = await getDb()
      .from('app_users')
      .select('id, email, role, status')
      .eq('email', email)
      .maybeSingle();
    if (!row) {
      return fail(404, { success: false, error: 'User not found' });
    }
    if (String(row.role || '').toUpperCase() === 'OWNER' && status !== 'ACTIVE') {
      return fail(403, { success: false, error: 'The system owner account cannot be deactivated.' });
    }

    const { error } = await getDb().from('app_users').update({ status }).eq('email', email);
    if (error) throw new Error(error.message);

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: status === 'ACTIVE' ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN',
      description: `${operator.name} set ${email} to ${status}.`
    });

    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};

// DELETE /api/users?email=...
export const deleteUser = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;
    if (!(operator.role === 'OWNER' || operator.permissions.canManageUsers)) {
      return fail(403, {
        success: false,
        error: 'ACCESS DENIED: Managing staff accounts requires the canManageUsers permission.'
      });
    }

    const email = String(ctx.query.email || '').trim().toLowerCase();
    if (!email) {
      return fail(400, { success: false, error: 'Email query parameter is required.' });
    }

    const { data: row } = await getDb()
      .from('app_users')
      .select('id, email, role, name')
      .eq('email', email)
      .maybeSingle();
    if (!row) {
      return fail(404, { success: false, error: 'User not found' });
    }
    if (String(row.role || '').toUpperCase() === 'OWNER') {
      return fail(403, { success: false, error: 'The system owner account cannot be deleted.' });
    }

    const { error } = await getDb().from('app_users').delete().eq('email', email);
    if (error) throw new Error(error.message);

    if (row.id) {
      const { error: authErr } = await getDb().auth.admin.deleteUser(String(row.id));
      if (authErr) {
        await logAudit({
          user: operator.name,
          userEmail: operator.email,
          action: 'REMOVE_ADMIN',
          description: `${operator.name} removed ${email} from app_users but the auth user delete failed: ${authErr.message}`
        });
      }
    }

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'REMOVE_ADMIN',
      description: `${operator.name} removed staff account ${email}.`
    });

    return ok({ success: true });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/users/password {email, password}
export const setUserPassword = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const operator = auth.user;

    const email = String(ctx.body?.email || '').trim().toLowerCase();
    const password = ctx.body?.password !== undefined ? String(ctx.body.password).trim() : '';
    if (!email || !password) {
      return fail(400, { success: false, error: 'Email and password are required' });
    }
    if (password.length < 4) {
      return fail(400, { success: false, error: 'Password must be at least 4 characters' });
    }
    const isSelf = operator.email === email;
    if (!(operator.role === 'OWNER' || operator.permissions.canManageUsers || isSelf)) {
      return fail(403, {
        success: false,
        error: 'ACCESS DENIED: You can only change your own password.'
      });
    }

    const { id } = await upsertAuthUserWithPassword(email, password);

    const { data: existingRow } = await getDb()
      .from('app_users')
      .select('created_at, role')
      .eq('email', email)
      .maybeSingle();
    if (!existingRow) {
      await getDb().from('app_users').upsert(
        {
          id,
          email,
          name: email.split('@')[0],
          role: email === SYSTEM_OWNER_EMAIL ? 'OWNER' : 'ADMIN',
          status: 'ACTIVE',
          permissions: null,
          created_at: new Date().toISOString()
        },
        { onConflict: 'email' }
      );
    }

    await logAudit({
      user: operator.name,
      userEmail: operator.email,
      action: 'EDIT_PERMISSIONS',
      description: `${operator.name} updated the password for ${email}${isSelf ? ' (self)' : ''}.`
    });

    const { data: userRow } = await getDb()
      .from('app_users')
      .select('id, name, email, role, status, permissions, created_at')
      .eq('email', email)
      .maybeSingle();

    return ok({
      success: true,
      message: 'Password updated successfully',
      user: userRow ? mapUserRow(userRow) : undefined
    });
  } catch (err) {
    return errorResult(err);
  }
};

// Kept for completeness: resolved permissions helper used by tests of this module.
export const resolvePermissionsForRole = resolveUserPermissions;
