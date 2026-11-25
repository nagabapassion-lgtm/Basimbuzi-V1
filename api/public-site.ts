import { handleVercel } from '../lib/backend/vercel';
import { getPublicSite, savePublicSite } from '../lib/backend/handlers/publicSite';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? savePublicSite(ctx) : getPublicSite(ctx)
);
