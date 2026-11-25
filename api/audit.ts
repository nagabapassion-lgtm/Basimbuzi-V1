import { handleVercel } from '../lib/backend/vercel';
import { addAudit, listAudit } from '../lib/backend/handlers/misc';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? addAudit(ctx) : listAudit(ctx)
);
