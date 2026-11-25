import { handleVercel } from '../lib/backend/vercel';
import { createTransaction } from '../lib/backend/handlers/transactions';

export default handleVercel(createTransaction);
