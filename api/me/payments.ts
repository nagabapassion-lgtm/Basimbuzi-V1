import { handleVercel } from '../../lib/backend/vercel';
import { mePayments } from '../../lib/backend/handlers/me';

export default handleVercel(mePayments);
