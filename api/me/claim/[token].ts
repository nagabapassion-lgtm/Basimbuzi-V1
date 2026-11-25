import { handleVercel } from '../../../lib/backend/vercel';
import { meClaimLookup, meClaimSubmit } from '../../../lib/backend/handlers/me';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? meClaimSubmit(ctx) : meClaimLookup(ctx)
);
