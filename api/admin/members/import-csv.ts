import { handleVercel } from '../../../lib/backend/vercel';
import { importCsv } from '../../../lib/backend/handlers/members';

export default handleVercel(importCsv);
