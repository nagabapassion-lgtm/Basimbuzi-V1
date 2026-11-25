import { handleVercel } from '../../../lib/backend/vercel';
import { resendReceipt } from '../../../lib/backend/handlers/transactions';

export default handleVercel(resendReceipt);
