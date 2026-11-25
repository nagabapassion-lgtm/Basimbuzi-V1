import { handleVercel } from '../../lib/backend/vercel';
import { listMembers, upsertMember } from '../../lib/backend/handlers/members';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? upsertMember(ctx) : listMembers(ctx)
);
