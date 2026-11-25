import { handleVercel } from '../../../lib/backend/vercel';
import { reconcileLedger } from '../../../lib/backend/handlers/members';

export default handleVercel(reconcileLedger);
