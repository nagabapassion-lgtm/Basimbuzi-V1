import { handleVercel } from '../lib/backend/vercel';
import { listInquiries, submitInquiry } from '../lib/backend/handlers/publicSite';

export default handleVercel(async ctx =>
  ctx.method === 'POST' ? submitInquiry(ctx) : listInquiries(ctx)
);
