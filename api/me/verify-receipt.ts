import { handleVercel } from '../../lib/backend/vercel';
import { meVerifyReceipt } from '../../lib/backend/handlers/me';

export default handleVercel(meVerifyReceipt);
