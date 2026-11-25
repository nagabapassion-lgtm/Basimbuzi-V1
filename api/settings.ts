import { handleVercel } from '../lib/backend/vercel';
import { getSettingsHandler, saveSettingsHandler } from '../lib/backend/handlers/settings';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? saveSettingsHandler(ctx) : getSettingsHandler(ctx)
);
