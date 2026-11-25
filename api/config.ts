import { handleVercel } from '../lib/backend/vercel';
import { getConfig, postConfig } from '../lib/backend/handlers/settings';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? postConfig(ctx) : getConfig(ctx)
);
