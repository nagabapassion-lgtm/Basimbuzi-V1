import { requireStaff } from '../auth';
import { getSettings, saveSettings, logAudit } from '../store';
import { fail, ok, errorResult } from '../types';
import type { HandlerCtx, HandlerResult } from '../types';

// GET /api/settings
export const getSettingsHandler = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const settings = await getSettings();
    return ok({ success: true, data: settings });
  } catch (err) {
    return errorResult(err);
  }
};

// POST /api/settings {settings}
export const saveSettingsHandler = async (ctx: HandlerCtx): Promise<HandlerResult> => {
  try {
    const auth = await requireStaff(ctx);
    if (auth.ok === false) return auth.response;
    const user = auth.user;
    if (!(user.role === 'OWNER' || user.permissions.canEditSettings)) {
      return fail(403, {
        success: false,
        error: 'Unauthorized: Receipt Issuers cannot modify system settings without the canEditSettings permission.'
      });
    }

    const settings = ctx.body?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return fail(400, { success: false, error: 'Invalid settings payload' });
    }

    const updated = await saveSettings(settings, user.email);
    await logAudit({
      user: user.name,
      userEmail: user.email,
      action: 'CHANGE_SETTINGS',
      description: `${user.name} updated shared system settings.`
    });

    return ok({ success: true, data: updated });
  } catch (err) {
    return errorResult(err);
  }
};

// GET /api/config — legacy keep-alive, no auth
export const getConfig = async (_ctx: HandlerCtx): Promise<HandlerResult> => {
  return ok({ success: true, data: { gasUrl: '' } });
};

// POST /api/config — legacy no-op
export const postConfig = async (_ctx: HandlerCtx): Promise<HandlerResult> => {
  return ok({ success: true });
};

// POST /api/gas/invalidate-cache — legacy no-op (cache lives in Postgres now)
export const invalidateCache = async (_ctx: HandlerCtx): Promise<HandlerResult> => {
  return ok({ success: true });
};
